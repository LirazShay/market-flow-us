import { validateDemoBuyCapturePayload } from "../demo-buy/capture.js";

export const PROTOCOL_VERSION = 1;
export const MAX_REQUEST_ID_LENGTH = 128;

export const ERROR_CODES = Object.freeze({
  SERVICE_NOT_READY: "SERVICE_NOT_READY",
  PROTOCOL_VERSION_UNSUPPORTED: "PROTOCOL_VERSION_UNSUPPORTED",
  INVALID_MESSAGE: "INVALID_MESSAGE",
  ROLE_VIOLATION: "ROLE_VIOLATION",
  PRODUCER_ALREADY_ACTIVE: "PRODUCER_ALREADY_ACTIVE",
  SESSION_NOT_STARTED: "SESSION_NOT_STARTED",
  SESSION_ALREADY_STARTED: "SESSION_ALREADY_STARTED",
  UNIVERSE_INVALID: "UNIVERSE_INVALID",
  UNIVERSE_REVISION_MISMATCH: "UNIVERSE_REVISION_MISMATCH",
  CYCLE_INVALID: "CYCLE_INVALID",
  CURSOR_INVALID: "CURSOR_INVALID",
  DEMO_BUY_CURSOR_INVALID: "DEMO_BUY_CURSOR_INVALID",
  DEMO_BUY_BASELINE_INTEGRITY: "DEMO_BUY_BASELINE_INTEGRITY",
  NOT_FOUND: "NOT_FOUND",
  SCANNER_EMPTY_SQL: "SCANNER_EMPTY_SQL",
  SCANNER_MULTIPLE_STATEMENTS: "SCANNER_MULTIPLE_STATEMENTS",
  SCANNER_NON_SELECT: "SCANNER_NON_SELECT",
  SCANNER_PARAMETERS_UNSUPPORTED: "SCANNER_PARAMETERS_UNSUPPORTED",
  SCANNER_FORBIDDEN_FUNCTION: "SCANNER_FORBIDDEN_FUNCTION",
  SCANNER_EXECUTION_ERROR: "SCANNER_EXECUTION_ERROR",
  SCANNER_QUERY_NAME_CONFLICT: "SCANNER_QUERY_NAME_CONFLICT",
  SCANNER_QUERY_READ_ONLY: "SCANNER_QUERY_READ_ONLY",
  DB_SCHEMA_UNSUPPORTED: "DB_SCHEMA_UNSUPPORTED",
  DB_ERROR: "DB_ERROR"
});

const SAFE_MESSAGES = Object.freeze({
  [ERROR_CODES.SERVICE_NOT_READY]: "Service is not ready.",
  [ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED]: "Protocol version is not supported.",
  [ERROR_CODES.INVALID_MESSAGE]: "Message is invalid.",
  [ERROR_CODES.ROLE_VIOLATION]: "Operation is not allowed for this connection role.",
  [ERROR_CODES.PRODUCER_ALREADY_ACTIVE]: "A producer is already active.",
  [ERROR_CODES.SESSION_NOT_STARTED]: "Producer session is not started.",
  [ERROR_CODES.SESSION_ALREADY_STARTED]: "Producer session is already started.",
  [ERROR_CODES.UNIVERSE_INVALID]: "Universe payload is invalid.",
  [ERROR_CODES.UNIVERSE_REVISION_MISMATCH]: "Universe revision does not match.",
  [ERROR_CODES.CYCLE_INVALID]: "Cycle payload is invalid.",
  [ERROR_CODES.CURSOR_INVALID]: "History cursor is invalid.",
  [ERROR_CODES.DEMO_BUY_CURSOR_INVALID]: "Demo Buy cursor is invalid.",
  [ERROR_CODES.DEMO_BUY_BASELINE_INTEGRITY]: "Demo Buy baseline authority is missing.",
  [ERROR_CODES.NOT_FOUND]: "Requested item was not found.",
  [ERROR_CODES.SCANNER_EMPTY_SQL]: "Scanner SQL is empty.",
  [ERROR_CODES.SCANNER_MULTIPLE_STATEMENTS]: "Scanner accepts exactly one statement.",
  [ERROR_CODES.SCANNER_NON_SELECT]: "Scanner accepts SELECT statements only.",
  [ERROR_CODES.SCANNER_PARAMETERS_UNSUPPORTED]: "Scanner parameters are not supported.",
  [ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION]: "Scanner SQL uses a forbidden function.",
  [ERROR_CODES.SCANNER_EXECUTION_ERROR]: "Scanner execution failed.",
  [ERROR_CODES.SCANNER_QUERY_NAME_CONFLICT]: "Scanner query name conflicts with an existing query.",
  [ERROR_CODES.SCANNER_QUERY_READ_ONLY]: "Built-in Scanner query is read-only.",
  [ERROR_CODES.DB_SCHEMA_UNSUPPORTED]: "Database schema version is not supported.",
  [ERROR_CODES.DB_ERROR]: "Service database operation failed."
});

const PRODUCER_OPERATIONS = new Set([
  "producer.session.start",
  "producer.universe.replace",
  "producer.cycle.commit",
  "producer.cycle.failed",
  "producer.heartbeat",
  "producer.session.stop"
]);

const VIEWER_OPERATIONS = new Set([
  "viewer.current.get",
  "viewer.security.get",
  "viewer.history.page",
  "viewer.status.get",
  "viewer.support.snapshot",
  "scanner.execute",
  "scanner.queries.list",
  "scanner.queries.create",
  "scanner.queries.update",
  "scanner.queries.delete",
  "demo.buy.capture",
  "demo.buy.page",
  "demo.buy.observation.get",
  "demo.buy.capture.get"
]);

export const REQUEST_TYPES = Object.freeze([
  "client.hello",
  ...PRODUCER_OPERATIONS,
  ...VIEWER_OPERATIONS
]);

export class ProtocolValidationError extends Error {
  constructor(code, message = SAFE_MESSAGES[code] ?? SAFE_MESSAGES[ERROR_CODES.INVALID_MESSAGE]) {
    super(message);
    this.name = "ProtocolValidationError";
    this.code = code;
  }
}

function fail(code = ERROR_CODES.INVALID_MESSAGE) {
  throw new ProtocolValidationError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertExactKeys(value, required, optional = []) {
  if (!isPlainObject(value)) fail();
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail();
  }
  for (const key of keys) {
    if (!allowed.has(key)) fail();
  }
}

function assertNonEmptyString(value, maxLength = 512) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) fail();
}

function assertSafeInteger(value, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) fail();
}

function validateHello(payload) {
  assertExactKeys(payload, ["role", "clientInstanceId", "productVersion"]);
  if (payload.role !== "producer" && payload.role !== "viewer") fail();
  assertNonEmptyString(payload.clientInstanceId, 128);
  assertNonEmptyString(payload.productVersion, 128);
}

function validateSessionStart(payload) {
  assertExactKeys(payload, ["startedAtMs", "config"]);
  assertSafeInteger(payload.startedAtMs);
  if (!isPlainObject(payload.config)) fail();
}

function validateUniverseReplace(payload) {
  if (!isPlainObject(payload)) fail();
  assertExactKeys(payload, ["loadedAtMs", "recordCount", "securities"]);
  assertSafeInteger(payload.loadedAtMs);
  assertSafeInteger(payload.recordCount);
  if (!Array.isArray(payload.securities)) fail();
}

function validateCycleCommit(payload) {
  assertExactKeys(payload, ["universeRevision", "cycle"]);
  assertSafeInteger(payload.universeRevision, { min: 1 });
  if (!isPlainObject(payload.cycle)) fail();
}

function validateCycleFailed(payload) {
  assertExactKeys(payload, ["report"]);
  if (!isPlainObject(payload.report)) fail();
}

function validateHeartbeat(payload) {
  assertExactKeys(payload, ["atMs"]);
  assertSafeInteger(payload.atMs);
}

function validateSessionStop(payload) {
  assertExactKeys(payload, ["stoppedAtMs", "reason"]);
  assertSafeInteger(payload.stoppedAtMs);
  assertNonEmptyString(payload.reason, 256);
}

function validateEmpty(payload) {
  assertExactKeys(payload, []);
}

function validateSecurity(payload) {
  assertExactKeys(payload, ["securityId"]);
  assertNonEmptyString(payload.securityId, 128);
}

function validateHistory(payload) {
  assertExactKeys(payload, ["securityId", "cursor"]);
  assertNonEmptyString(payload.securityId, 128);
  if (payload.cursor !== null) assertNonEmptyString(payload.cursor, 4096);
}

function validateScanner(payload) {
  assertExactKeys(payload, ["sql"]);
  if (typeof payload.sql !== "string") fail();
}

function validateSavedQueryDraft(payload, { requireQueryId = false } = {}) {
  const required = requireQueryId
    ? ["queryId", "name", "sql", "intervalMs"]
    : ["name", "sql", "intervalMs"];
  assertExactKeys(payload, required);

  if (requireQueryId) {
    assertNonEmptyString(payload.queryId, 128);
  }
  assertNonEmptyString(payload.name, 512);
  if (typeof payload.sql !== "string") fail();
  assertSafeInteger(payload.intervalMs, { min: 1 });
}

function validateSavedQueryCreate(payload) {
  validateSavedQueryDraft(payload);
}

function validateSavedQueryUpdate(payload) {
  validateSavedQueryDraft(payload, { requireQueryId: true });
}

function validateSavedQueryDelete(payload) {
  assertExactKeys(payload, ["queryId"]);
  assertNonEmptyString(payload.queryId, 128);
}

function validateDemoBuyCapture(payload) {
  try {
    validateDemoBuyCapturePayload(payload);
  } catch {
    fail(ERROR_CODES.INVALID_MESSAGE);
  }
}

function validateDemoBuyPage(payload) {
  assertExactKeys(payload, ["cursor"]);
  if (payload.cursor !== null) assertNonEmptyString(payload.cursor, 4096);
}

function validateDemoBuyObservationGet(payload) {
  assertExactKeys(payload, ["captureId", "securityId"]);
  assertSafeInteger(payload.captureId, { min: 1 });
  assertNonEmptyString(payload.securityId, 128);
}

function validateDemoBuyCaptureGet(payload) {
  assertExactKeys(payload, ["captureId"]);
  assertSafeInteger(payload.captureId, { min: 1 });
}

const PAYLOAD_VALIDATORS = Object.freeze({
  "client.hello": validateHello,
  "producer.session.start": validateSessionStart,
  "producer.universe.replace": validateUniverseReplace,
  "producer.cycle.commit": validateCycleCommit,
  "producer.cycle.failed": validateCycleFailed,
  "producer.heartbeat": validateHeartbeat,
  "producer.session.stop": validateSessionStop,
  "viewer.current.get": validateEmpty,
  "viewer.security.get": validateSecurity,
  "viewer.history.page": validateHistory,
  "viewer.status.get": validateEmpty,
  "viewer.support.snapshot": validateEmpty,
  "scanner.execute": validateScanner,
  "scanner.queries.list": validateEmpty,
  "scanner.queries.create": validateSavedQueryCreate,
  "scanner.queries.update": validateSavedQueryUpdate,
  "scanner.queries.delete": validateSavedQueryDelete,
  "demo.buy.capture": validateDemoBuyCapture,
  "demo.buy.page": validateDemoBuyPage,
  "demo.buy.observation.get": validateDemoBuyObservationGet,
  "demo.buy.capture.get": validateDemoBuyCaptureGet
});

export function isOperationAllowed(role, type) {
  if (role === "producer") return PRODUCER_OPERATIONS.has(type);
  if (role === "viewer") return VIEWER_OPERATIONS.has(type);
  return false;
}

export function validateRequest(message, { role = null, helloComplete = false } = {}) {
  assertExactKeys(message, ["v", "type", "requestId", "payload"]);

  if (message.v !== PROTOCOL_VERSION) {
    fail(ERROR_CODES.PROTOCOL_VERSION_UNSUPPORTED);
  }

  assertNonEmptyString(message.type, 128);
  if (!REQUEST_TYPES.includes(message.type)) fail();

  assertNonEmptyString(message.requestId, MAX_REQUEST_ID_LENGTH);
  if (!isPlainObject(message.payload)) fail();

  if (!helloComplete && message.type !== "client.hello") {
    fail(ERROR_CODES.ROLE_VIOLATION);
  }
  if (helloComplete && message.type === "client.hello") {
    fail(ERROR_CODES.ROLE_VIOLATION);
  }
  if (helloComplete && !isOperationAllowed(role, message.type)) {
    fail(ERROR_CODES.ROLE_VIOLATION);
  }

  PAYLOAD_VALIDATORS[message.type](message.payload);
  return message;
}

export function createOkResponse({ requestId, requestType, data = {} }) {
  assertNonEmptyString(requestId, MAX_REQUEST_ID_LENGTH);
  assertNonEmptyString(requestType, 128);
  if (!isPlainObject(data)) fail();

  return {
    v: PROTOCOL_VERSION,
    type: "response.ok",
    requestId,
    payload: { requestType, data }
  };
}

export function createErrorResponse({
  requestId,
  requestType,
  code = ERROR_CODES.DB_ERROR,
  retryable = false
}) {
  const stableCode = Object.values(ERROR_CODES).includes(code) ? code : ERROR_CODES.DB_ERROR;
  const safeRequestId = typeof requestId === "string" && requestId.length > 0
    ? requestId.slice(0, MAX_REQUEST_ID_LENGTH)
    : "unknown";
  const safeRequestType = typeof requestType === "string" && requestType.length > 0
    ? requestType.slice(0, 128)
    : "unknown";

  return {
    v: PROTOCOL_VERSION,
    type: "response.error",
    requestId: safeRequestId,
    payload: {
      requestType: safeRequestType,
      code: stableCode,
      message: SAFE_MESSAGES[stableCode] ?? SAFE_MESSAGES[ERROR_CODES.DB_ERROR],
      retryable: retryable === true,
      details: null
    }
  };
}

export function errorResponseFrom(error, context = {}) {
  const code = error instanceof ProtocolValidationError ? error.code : ERROR_CODES.DB_ERROR;
  return createErrorResponse({ ...context, code, retryable: false });
}
