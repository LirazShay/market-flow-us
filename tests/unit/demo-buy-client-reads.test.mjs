import assert from "node:assert/strict";
import test from "node:test";

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

  close(code = 1000, reason = "closed") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", { code, reason });
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
  const client = createViewerClient({
    productVersion: "demo-buy-read-test",
    clientInstanceId: "demo-buy-read-test",
    createSocket: () => socket
  });

  const connecting = client.connect();
  socket.open();
  await nextTurn();
  socket.respondOk(socket.sent[0], {
    protocolVersion: 1,
    role: "viewer",
    ready: true
  });
  await connecting;
  return { client, socket };
}

test("Viewer client routes Demo Buy page, targeted observation and provenance reads exactly", async () => {
  const { client, socket } = await connectedClient();

  const firstPage = client.getDemoBuyPage(null);
  const nextPage = client.getDemoBuyPage("opaque-cursor");
  const observation = client.getDemoBuyObservation(7, "1001");
  const provenance = client.getDemoBuyCapture(7);
  await nextTurn();

  const [firstRequest, nextRequest, observationRequest, provenanceRequest] = socket.sent.slice(1);
  assert.deepEqual(
    [firstRequest.type, nextRequest.type, observationRequest.type, provenanceRequest.type],
    ["demo.buy.page", "demo.buy.page", "demo.buy.observation.get", "demo.buy.capture.get"]
  );
  assert.deepEqual(firstRequest.payload, { cursor: null });
  assert.deepEqual(nextRequest.payload, { cursor: "opaque-cursor" });
  assert.deepEqual(observationRequest.payload, { captureId: 7, securityId: "1001" });
  assert.deepEqual(provenanceRequest.payload, { captureId: 7 });

  socket.respondOk(firstRequest, { items: [], hasMore: false, nextCursor: null });
  socket.respondOk(nextRequest, { items: [], hasMore: false, nextCursor: null });
  socket.respondOk(observationRequest, { capture: { captureId: 7 }, securityId: "1001" });
  socket.respondOk(provenanceRequest, { captureId: 7, sourceQuerySql: "SELECT 1" });

  assert.deepEqual(await firstPage, { items: [], hasMore: false, nextCursor: null });
  assert.deepEqual(await nextPage, { items: [], hasMore: false, nextCursor: null });
  assert.equal((await observation).securityId, "1001");
  assert.equal((await provenance).sourceQuerySql, "SELECT 1");
});

test("Viewer client rejects malformed Demo Buy read coordinates before transport", async () => {
  const { client, socket } = await connectedClient();
  const before = socket.sent.length;

  await assert.rejects(client.getDemoBuyPage(""), /cursor must be a non-empty string/i);
  await assert.rejects(client.getDemoBuyObservation(0, "1001"), /captureId must be a positive safe integer/i);
  await assert.rejects(client.getDemoBuyObservation(1, ""), /securityId must be a non-empty string/i);
  await assert.rejects(client.getDemoBuyCapture(-1), /captureId must be a positive safe integer/i);

  assert.equal(socket.sent.length, before);
});
