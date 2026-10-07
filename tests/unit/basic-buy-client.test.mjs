import assert from "node:assert/strict";
import test from "node:test";

import { createDiagnosticTracker } from "../../shared/diagnostics/index.js";
import { createViewerClient } from "../../browser/viewer/client.js";

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

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  respondOk(request, data) {
    this.emit("message", {
      data: JSON.stringify({
        v: 1,
        type: "response.ok",
        requestId: request.requestId,
        payload: { requestType: request.type, data }
      })
    });
  }
}

function nextTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function connectedClient() {
  const socket = new FakeSocket();
  const diagnosticTracker = createDiagnosticTracker({
    productVersion: "test-browser",
    now: (() => {
      let value = 1000;
      return () => value++;
    })()
  });
  const client = createViewerClient({
    productVersion: "test-browser",
    clientInstanceId: "basic-buy-client-test",
    createSocket: () => socket,
    diagnosticTracker
  });

  const connecting = client.connect();
  socket.open();
  await nextTurn();
  const hello = socket.sent[0];
  socket.respondOk(hello, {
    protocolVersion: 1,
    serviceVersion: "test-service",
    role: "viewer",
    ready: true
  });
  await connecting;
  return { client, socket, diagnosticTracker };
}

test("Basic BUY client sends only securityId over the existing Viewer transport", async () => {
  const { client, socket, diagnosticTracker } = await connectedClient();

  const preparing = client.prepareBuy("us:AAPL");
  await nextTurn();

  const request = socket.sent.at(-1);
  assert.equal(request.type, "order.buy.prepare");
  assert.deepEqual(request.payload, { securityId: "us:AAPL" });
  assert.deepEqual(Object.keys(request.payload), ["securityId"]);

  const prepared = Object.freeze({
    confirmationUrl: "http://127.0.0.1:8765/buy/confirm#ticket-id",
    expiresAtMs: 121000,
    summary: Object.freeze({
      securityId: "us:AAPL",
      paperName: "Apple Inc.",
      symbol: "AAPL",
      quantity: 2,
      side: "BUY",
      orderType: "MKT",
      tif: "DAY",
      executionMode: "DRY_RUN"
    })
  });
  socket.respondOk(request, prepared);

  assert.deepEqual(await preparing, prepared);
  const record = diagnosticTracker.snapshot().recent.find(
    (item) => item.operation === "order.buy.prepare"
  );
  assert.equal(record?.component, "basic_buy");
  assert.equal(record?.checkpoint, "basic_buy.prepare");
});

test("Basic BUY client rejects invalid securityId before transport", async () => {
  const { client, socket } = await connectedClient();
  const sentBefore = socket.sent.length;

  await assert.rejects(client.prepareBuy(""), /securityId must be a non-empty string/);
  assert.equal(socket.sent.length, sentBefore);
});
