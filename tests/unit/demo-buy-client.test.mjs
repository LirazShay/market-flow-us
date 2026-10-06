import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT,
  ViewerUnavailableError,
  createViewerClient
} from "../../browser/viewer/client.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";

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
    for (const listener of this.listeners.get(type) ?? []) listener(event);
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
        payload: { requestType: request.type, data }
      })
    });
  }

  respondError(request, code = "DB_ERROR") {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.error",
        requestId: request.requestId,
        payload: {
          requestType: request.type,
          code,
          message: "Capture was rejected safely.",
          retryable: false,
          details: null
        }
      })
    });
  }
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function capturePayload() {
  return {
    items: [{ securityId: "101", resultRank: 1 }],
    sourceQuery: {
      queryId: null,
      name: "Test",
      sql: "SELECT security_id FROM latest",
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs: 100,
      completedAtMs: 120,
      rowCount: 1,
      context: shapeDemoBuyScannerContext({
        columns: [{ name: "security_id", type: "VARCHAR" }],
        rows: [["101"]]
      })
    },
    selectionMode: "all",
    isAutomatic: false,
    topX: null
  };
}

async function connectedClient() {
  const socket = new FakeSocket();
  const client = createViewerClient({
    productVersion: "test-browser",
    clientInstanceId: "demo-buy-client-test",
    createSocket: () => socket
  });
  const connecting = client.connect();
  socket.open();
  await nextTurn();
  socket.respondOk(socket.sent[0], {
    protocolVersion: 1,
    serviceVersion: "test-service",
    role: "viewer",
    ready: true
  });
  await connecting;
  return { client, socket };
}

test("capture returns CONFIRMED_COMMITTED only after a conclusive success response", async () => {
  const { client, socket } = await connectedClient();
  const pending = client.captureDemoBuy(capturePayload());
  await nextTurn();

  const request = socket.sent.at(-1);
  assert.equal(request.type, "demo.buy.capture");
  assert.equal(socket.sent.filter((entry) => entry.type === "demo.buy.capture").length, 1);
  socket.respondOk(request, {
    captureId: 7,
    capturedAtMs: 500,
    capturedItemCount: 1
  });

  assert.deepEqual(await pending, {
    status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.COMMITTED,
    captureId: 7,
    capturedAtMs: 500,
    capturedItemCount: 1
  });
});

test("conclusive service rejection is CONFIRMED_REJECTED and does not lock the Viewer", async () => {
  const { client, socket } = await connectedClient();
  const first = client.captureDemoBuy(capturePayload());
  await nextTurn();
  socket.respondError(socket.sent.at(-1), "NOT_FOUND");

  assert.deepEqual(await first, {
    status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.REJECTED,
    code: "NOT_FOUND",
    message: "Capture was rejected safely."
  });

  const second = client.captureDemoBuy(capturePayload());
  await nextTurn();
  const secondRequest = socket.sent.at(-1);
  socket.respondOk(secondRequest, {
    captureId: 8,
    capturedAtMs: 600,
    capturedItemCount: 1
  });
  assert.equal((await second).status, DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.COMMITTED);
});

test("transport loss after dispatch is ACKNOWLEDGEMENT_UNKNOWN, is never replayed and locks capture until relaunch", async () => {
  const { client, socket } = await connectedClient();
  const pending = client.captureDemoBuy(capturePayload());
  await nextTurn();

  assert.equal(socket.sent.filter((entry) => entry.type === "demo.buy.capture").length, 1);
  socket.close(1006, "lost after dispatch");

  assert.deepEqual(await pending, {
    status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.UNKNOWN
  });
  assert.equal(socket.sent.filter((entry) => entry.type === "demo.buy.capture").length, 1);
  assert.equal(client.getState().captureAcknowledgementLocked, true);

  await assert.rejects(client.captureDemoBuy(capturePayload()), (error) => {
    assert.ok(error instanceof ViewerUnavailableError);
    assert.match(error.message, /explicit Viewer relaunch/i);
    return true;
  });
  assert.equal(socket.sent.filter((entry) => entry.type === "demo.buy.capture").length, 1);
});

test("invalid capture provenance fails locally before dispatch", async () => {
  const { client, socket } = await connectedClient();
  const invalid = capturePayload();
  invalid.items = [{ securityId: "WRONG", resultRank: 1 }];

  await assert.rejects(client.captureDemoBuy(invalid), /identity does not match/i);
  assert.equal(socket.sent.filter((entry) => entry.type === "demo.buy.capture").length, 0);
});
