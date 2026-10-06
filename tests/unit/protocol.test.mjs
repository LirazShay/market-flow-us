import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_CODES,
  ProtocolValidationError,
  REQUEST_TYPES,
  createErrorResponse,
  createOkResponse,
  errorResponseFrom,
  isOperationAllowed,
  validateRequest
} from "../../shared/protocol/index.js";

const request = (type, payload, overrides = {}) => ({
  v: 1,
  type,
  requestId: "req-1",
  payload,
  ...overrides
});

function demoBuyPayload() {
  return {
    items: [{ securityId: "42", resultRank: 1 }],
    sourceQuery: {
      queryId: null,
      name: null,
      sql: "SELECT security_id FROM latest",
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs: 100,
      completedAtMs: 120,
      rowCount: 1,
      context: {
        version: 1,
        sourceRowCount: 1,
        retainedRowCount: 1,
        omittedRowCount: 0,
        sourceColumnCount: 1,
        identityColumn: { sourceIndex: 0, name: "security_id" },
        retainedColumns: [{ sourceIndex: 0, name: "security_id", type: "VARCHAR" }],
        omittedColumns: [],
        rows: [{ resultRank: 1, values: ["42"] }],
        cellMetadata: []
      }
    },
    selectionMode: "all",
    isAutomatic: false,
    topX: null
  };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ProtocolValidationError);
    assert.equal(error.code, code);
    return true;
  });
}

test("protocol envelope rejects bad version, unknown type, requestId and payload boundaries", () => {
  assertCode(
    () => validateRequest(request("client.hello", { role: "viewer", clientInstanceId: "c", productVersion: "1" }, { v: 2 })),
    ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED
  );
  assertCode(() => validateRequest(request("unknown.op", {})), ERROR_CODES.INVALID_MESSAGE);
  assertCode(() => validateRequest(request("client.hello", {}, { requestId: "" })), ERROR_CODES.INVALID_MESSAGE);
  assertCode(() => validateRequest(request("client.hello", {}, { requestId: "x".repeat(129) })), ERROR_CODES.INVALID_MESSAGE);
  assertCode(() => validateRequest({ ...request("client.hello", {}), payload: [] }), ERROR_CODES.INVALID_MESSAGE);
  assertCode(() => validateRequest({ ...request("client.hello", {}), extra: true }), ERROR_CODES.INVALID_MESSAGE);
});

test("hello binds only producer/viewer and is the only pre-role operation", () => {
  validateRequest(request("client.hello", {
    role: "producer",
    clientInstanceId: "producer-1",
    productVersion: "0.1.0"
  }));

  assertCode(
    () => validateRequest(request("client.hello", { role: "admin", clientInstanceId: "c", productVersion: "1" })),
    ERROR_CODES.INVALID_MESSAGE
  );
  assertCode(
    () => validateRequest(request("viewer.current.get", {})),
    ERROR_CODES.ROLE_VIOLATION
  );
  assertCode(
    () => validateRequest(
      request("client.hello", { role: "viewer", clientInstanceId: "c", productVersion: "1" }),
      { role: "viewer", helloComplete: true }
    ),
    ERROR_CODES.ROLE_VIOLATION
  );
});

const validCases = [
  ["producer.session.start", { startedAtMs: 1, config: {} }, "producer"],
  ["producer.universe.replace", { loadedAtMs: 1, recordCount: 0, securities: [] }, "producer"],
  ["producer.cycle.commit", { universeRevision: 1, cycle: {} }, "producer"],
  ["producer.cycle.failed", { report: {} }, "producer"],
  ["producer.heartbeat", { atMs: 1 }, "producer"],
  ["producer.session.stop", { stoppedAtMs: 2, reason: "user" }, "producer"],
  ["viewer.current.get", {}, "viewer"],
  ["viewer.security.get", { securityId: "42" }, "viewer"],
  ["viewer.history.page", { securityId: "42", cursor: null }, "viewer"],
  ["viewer.status.get", {}, "viewer"],
  ["viewer.support.snapshot", {}, "viewer"],
  ["scanner.execute", { sql: "select 1" }, "viewer"],
  ["scanner.queries.list", {}, "viewer"],
  ["scanner.queries.create", { name: "One", sql: "select 1", intervalMs: 5000 }, "viewer"],
  ["scanner.queries.update", { queryId: "user:1", name: "One", sql: "select 1", intervalMs: 5000 }, "viewer"],
  ["scanner.queries.delete", { queryId: "user:1" }, "viewer"],
  ["demo.buy.capture", demoBuyPayload(), "viewer"]
];

test("every protocol-v1 operation has an explicit valid payload boundary", () => {
  assert.equal(REQUEST_TYPES.length, 18);
  for (const [type, payload, role] of validCases) {
    assert.equal(validateRequest(request(type, payload), { role, helloComplete: true }).type, type);
  }
});

test("operation validators reject wrong or extra fields", () => {
  const invalidDemoBuy = demoBuyPayload();
  invalidDemoBuy.items = [{ securityId: "42", resultRank: 1, price: 10 }];
  const badCases = [
    ["producer.session.start", { startedAtMs: "1", config: {} }, "producer"],
    ["producer.universe.replace", { loadedAtMs: 1, recordCount: 1, securities: {}, extra: true }, "producer"],
    ["producer.cycle.commit", { universeRevision: 0, cycle: {} }, "producer"],
    ["producer.cycle.failed", { report: [] }, "producer"],
    ["producer.heartbeat", { atMs: 1, extra: true }, "producer"],
    ["producer.session.stop", { stoppedAtMs: 1, reason: "" }, "producer"],
    ["viewer.current.get", { extra: true }, "viewer"],
    ["viewer.security.get", { securityId: "" }, "viewer"],
    ["viewer.history.page", { securityId: "42", cursor: 10 }, "viewer"],
    ["viewer.status.get", { extra: true }, "viewer"],
    ["viewer.support.snapshot", { extra: true }, "viewer"],
    ["scanner.execute", { sql: 123 }, "viewer"],
    ["scanner.queries.list", { extra: true }, "viewer"],
    ["scanner.queries.create", { name: "", sql: "select 1", intervalMs: 5000 }, "viewer"],
    ["scanner.queries.create", { name: "One", sql: 1, intervalMs: 5000 }, "viewer"],
    ["scanner.queries.update", { queryId: "", name: "One", sql: "select 1", intervalMs: 5000 }, "viewer"],
    ["scanner.queries.delete", { queryId: "user:1", extra: true }, "viewer"],
    ["demo.buy.capture", invalidDemoBuy, "viewer"]
  ];

  for (const [type, payload, role] of badCases) {
    assertCode(
      () => validateRequest(request(type, payload), { role, helloComplete: true }),
      ERROR_CODES.INVALID_MESSAGE
    );
  }
});

test("role permissions are closed and exact", () => {
  assert.equal(isOperationAllowed("producer", "producer.heartbeat"), true);
  assert.equal(isOperationAllowed("producer", "viewer.current.get"), false);
  assert.equal(isOperationAllowed("viewer", "scanner.execute"), true);
  assert.equal(isOperationAllowed("viewer", "demo.buy.capture"), true);
  assert.equal(isOperationAllowed("viewer", "producer.cycle.commit"), false);

  assertCode(
    () => validateRequest(request("scanner.execute", { sql: "select 1" }), { role: "producer", helloComplete: true }),
    ERROR_CODES.ROLE_VIOLATION
  );
});

test("success and error responses preserve correlation while errors cannot leak raw internals", () => {
  assert.deepEqual(createOkResponse({
    requestId: "r-7",
    requestType: "viewer.current.get",
    data: { rows: [] }
  }), {
    v: 1,
    type: "response.ok",
    requestId: "r-7",
    payload: {
      requestType: "viewer.current.get",
      data: { rows: [] }
    }
  });

  const leaked = new Error("secret-token at C:\\private\\market-scope.duckdb");
  leaked.stack = "STACK secret-token";
  const response = errorResponseFrom(leaked, {
    requestId: "r-8",
    requestType: "viewer.current.get"
  });

  assert.equal(response.payload.code, ERROR_CODES.DB_ERROR);
  assert.equal(response.payload.details, null);
  assert.equal(JSON.stringify(response).includes("secret-token"), false);
  assert.equal(JSON.stringify(response).includes("market-scope.duckdb"), false);
  assert.equal(JSON.stringify(response).includes("STACK"), false);

  const explicit = createErrorResponse({
    requestId: "r-9",
    requestType: "producer.heartbeat",
    code: ERROR_CODES.ROLE_VIOLATION,
    retryable: true
  });
  assert.equal(explicit.payload.code, ERROR_CODES.ROLE_VIOLATION);
  assert.equal(explicit.payload.retryable, true);
  assert.equal(explicit.payload.details, null);
});
