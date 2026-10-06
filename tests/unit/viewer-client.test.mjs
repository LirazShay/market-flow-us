import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticTracker } from "../../shared/diagnostics/index.js";
import {
  ViewerClientError,
  ViewerUnavailableError,
  createViewerClient
} from "../../browser/viewer/client.js";

class FakeSocket {
  constructor() {
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.readyState = 1;
    this.emit("open");
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close(code = 1000, reason = "closed") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code, reason });
  }

  respondOk(request, data = {}) {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.ok",
        requestId: request.requestId,
        payload: {
          requestType: request.type,
          data
        }
      })
    });
  }

  respondError(request, {
    code = "DB_ERROR",
    message = "safe service failure",
    retryable = false,
    details = null
  } = {}) {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.error",
        requestId: request.requestId,
        payload: {
          requestType: request.type,
          code,
          message,
          retryable,
          details
        }
      })
    });
  }
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function connectedClient({ diagnosticTracker } = {}) {
  const socket = new FakeSocket();
  const client = createViewerClient({
    url: "ws://127.0.0.1:8765",
    productVersion: "test-browser",
    clientInstanceId: "viewer-client-test",
    createSocket: () => socket,
    ...(diagnosticTracker ? { diagnosticTracker } : {})
  });

  const connecting = client.connect();
  socket.open();
  await nextTurn();

  const hello = socket.sent[0];
  assert.equal(hello.type, "client.hello");
  assert.deepEqual(hello.payload, {
    role: "viewer",
    clientInstanceId: "viewer-client-test",
    productVersion: "test-browser"
  });

  socket.respondOk(hello, {
    protocolVersion: 1,
    serviceVersion: "test-service",
    role: "viewer",
    ready: true
  });
  await connecting;

  return { client, socket };
}

test("viewer client correlates concurrent responses and routes every trusted read operation without caching authority", async () => {
  const { client, socket } = await connectedClient();

  const currentPromise = client.getCurrent();
  const statusPromise = client.getStatus();
  await nextTurn();

  const currentRequest = socket.sent[1];
  const statusRequest = socket.sent[2];
  assert.equal(currentRequest.type, "viewer.current.get");
  assert.deepEqual(currentRequest.payload, {});
  assert.equal(statusRequest.type, "viewer.status.get");
  assert.notEqual(currentRequest.requestId, statusRequest.requestId);

  socket.respondOk(statusRequest, { recorderHealth: "RUNNING" });
  socket.respondOk(currentRequest, { rows: [{ securityId: "1001" }] });

  assert.deepEqual(await currentPromise, { rows: [{ securityId: "1001" }] });
  assert.deepEqual(await statusPromise, { recorderHealth: "RUNNING" });

  const securityPromise = client.getSecurity("1001");
  const historyPromise = client.getHistoryPage("1001", "opaque-cursor");
  const scannerPromise = client.executeScanner("SELECT * FROM latest");
  const libraryPromise = client.listScannerQueries();
  const createPromise = client.createScannerQuery({
    name: "Alpha",
    sql: "SELECT 1",
    intervalMs: 5000
  });
  const updatePromise = client.updateScannerQuery({
    queryId: "user:alpha",
    name: "Alpha 2",
    sql: "SELECT 2",
    intervalMs: 6000
  });
  const deletePromise = client.deleteScannerQuery("user:alpha");
  await nextTurn();

  const [
    securityRequest,
    historyRequest,
    scannerRequest,
    libraryRequest,
    createRequest,
    updateRequest,
    deleteRequest
  ] = socket.sent.slice(3);
  assert.deepEqual(
    [
      securityRequest.type,
      historyRequest.type,
      scannerRequest.type,
      libraryRequest.type,
      createRequest.type,
      updateRequest.type,
      deleteRequest.type
    ],
    [
      "viewer.security.get",
      "viewer.history.page",
      "scanner.execute",
      "scanner.queries.list",
      "scanner.queries.create",
      "scanner.queries.update",
      "scanner.queries.delete"
    ]
  );
  assert.deepEqual(securityRequest.payload, { securityId: "1001" });
  assert.deepEqual(historyRequest.payload, {
    securityId: "1001",
    cursor: "opaque-cursor"
  });
  assert.deepEqual(scannerRequest.payload, { sql: "SELECT * FROM latest" });
  assert.deepEqual(libraryRequest.payload, {});
  assert.deepEqual(createRequest.payload, {
    name: "Alpha",
    sql: "SELECT 1",
    intervalMs: 5000
  });
  assert.deepEqual(updateRequest.payload, {
    queryId: "user:alpha",
    name: "Alpha 2",
    sql: "SELECT 2",
    intervalMs: 6000
  });
  assert.deepEqual(deleteRequest.payload, { queryId: "user:alpha" });

  socket.respondOk(deleteRequest, { queryId: "user:alpha" });
  socket.respondOk(updateRequest, { query: { queryId: "user:alpha", name: "Alpha 2" } });
  socket.respondOk(createRequest, { query: { queryId: "user:new", name: "Alpha" } });
  socket.respondOk(libraryRequest, { queries: [] });
  socket.respondOk(scannerRequest, { rows: [[1]], columns: [{ name: "x", type: "BIGINT" }] });
  socket.respondOk(historyRequest, { rows: [], hasMore: false, nextCursor: null });
  socket.respondOk(securityRequest, { found: true, securityId: "1001" });

  assert.deepEqual(await securityPromise, { found: true, securityId: "1001" });
  assert.deepEqual(await historyPromise, { rows: [], hasMore: false, nextCursor: null });
  assert.deepEqual(await scannerPromise, {
    rows: [[1]],
    columns: [{ name: "x", type: "BIGINT" }]
  });
  assert.deepEqual(await libraryPromise, { queries: [] });
  assert.deepEqual(await createPromise, { query: { queryId: "user:new", name: "Alpha" } });
  assert.deepEqual(await updatePromise, { query: { queryId: "user:alpha", name: "Alpha 2" } });
  assert.deepEqual(await deletePromise, { queryId: "user:alpha" });

  assert.deepEqual(client.getState(), {
    state: "ready",
    pendingRequests: 0,
    captureAcknowledgementLocked: false
  });
});

test("viewer diagnostics retain the exact requestId when concurrent responses complete out of order", async () => {
  let now = 1000;
  const diagnosticTracker = createDiagnosticTracker({
    productVersion: "test-browser",
    now: () => now++
  });
  const { client, socket } = await connectedClient({ diagnosticTracker });

  const currentPromise = client.getCurrent();
  const statusPromise = client.getStatus();
  await nextTurn();

  const currentRequest = socket.sent[1];
  const statusRequest = socket.sent[2];
  socket.respondOk(statusRequest, { recorderHealth: "RUNNING" });
  socket.respondOk(currentRequest, { rows: [] });
  await Promise.all([currentPromise, statusPromise]);

  const records = diagnosticTracker.snapshot().recent;
  const currentRecord = records.find((record) => record.operation === "viewer.current.get");
  const statusRecord = records.find((record) => record.operation === "viewer.status.get");
  assert.equal(currentRecord?.operationId, currentRequest.requestId);
  assert.equal(statusRecord?.operationId, statusRequest.requestId);
});

test("viewer client exposes only sanitized service errors and keeps the connection usable", async () => {
  const { client, socket } = await connectedClient();

  const pending = client.getSecurity("missing");
  await nextTurn();
  const request = socket.sent.at(-1);

  socket.respondError(request, {
    code: "NOT_FOUND",
    message: "Requested item was not found.",
    retryable: false,
    details: {
      stack: "must-not-be-retained",
      path: "/private/local/path"
    }
  });

  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof ViewerClientError);
    assert.equal(error.name, "ViewerClientError");
    assert.equal(error.code, "NOT_FOUND");
    assert.equal(error.message, "Requested item was not found.");
    assert.equal(error.retryable, false);
    assert.equal(Object.hasOwn(error, "details"), false);
    assert.equal(JSON.stringify(error).includes("private/local/path"), false);
    return true;
  });

  const status = client.getStatus();
  await nextTurn();
  socket.respondOk(socket.sent.at(-1), { recorderHealth: "UNKNOWN" });
  assert.deepEqual(await status, { recorderHealth: "UNKNOWN" });
});

test("viewer client fails explicitly when the service is unavailable and never auto-reconnects after disconnect", async () => {
  let createCount = 0;
  const unavailable = createViewerClient({
    createSocket() {
      createCount += 1;
      throw new Error("raw transport detail must not escape");
    }
  });

  await assert.rejects(unavailable.getCurrent(), (error) => {
    assert.ok(error instanceof ViewerUnavailableError);
    assert.equal(error.message, "Could not connect to Market Flow US service.");
    assert.equal(error.message.includes("raw transport detail"), false);
    return true;
  });
  assert.equal(createCount, 1);

  const { client, socket } = await connectedClient();
  const pending = client.getCurrent();
  await nextTurn();
  socket.close(1006, "network loss");

  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof ViewerUnavailableError);
    assert.equal(error.message, "Market Flow US service connection was lost.");
    return true;
  });

  await assert.rejects(client.getStatus(), (error) => {
    assert.ok(error instanceof ViewerUnavailableError);
    assert.match(error.message, /explicit relaunch/i);
    return true;
  });

  assert.deepEqual(client.getState(), {
    state: "disconnected",
    pendingRequests: 0,
    captureAcknowledgementLocked: false
  });
});
