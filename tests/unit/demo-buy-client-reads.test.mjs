import assert from "node:assert/strict";
import test from "node:test";

import {
  createViewerClient,
  DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT
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

test("Viewer client routes Demo Buy reads and AI Investigation pack creation exactly", async () => {
  const { client, socket } = await connectedClient();

  const firstPage = client.getDemoBuyPage(null);
  const nextPage = client.getDemoBuyPage("opaque-cursor");
  const observation = client.getDemoBuyObservation(7, "1001");
  const provenance = client.getDemoBuyCapture(7);
  const aiPack = client.createDemoBuyAiPack(7, "1001");
  await nextTurn();

  const [firstRequest, nextRequest, observationRequest, provenanceRequest, aiPackRequest] = socket.sent.slice(1);
  assert.deepEqual(
    [
      firstRequest.type,
      nextRequest.type,
      observationRequest.type,
      provenanceRequest.type,
      aiPackRequest.type
    ],
    [
      "demo.buy.page",
      "demo.buy.page",
      "demo.buy.observation.get",
      "demo.buy.capture.get",
      "demo.buy.ai-pack.create"
    ]
  );
  assert.deepEqual(firstRequest.payload, { cursor: null });
  assert.deepEqual(nextRequest.payload, { cursor: "opaque-cursor" });
  assert.deepEqual(observationRequest.payload, { captureId: 7, securityId: "1001" });
  assert.deepEqual(provenanceRequest.payload, { captureId: 7 });
  assert.deepEqual(aiPackRequest.payload, { captureId: 7, securityId: "1001" });

  socket.respondOk(firstRequest, { items: [], hasMore: false, nextCursor: null });
  socket.respondOk(nextRequest, { items: [], hasMore: false, nextCursor: null });
  socket.respondOk(observationRequest, { capture: { captureId: 7 }, securityId: "1001" });
  socket.respondOk(provenanceRequest, { captureId: 7, sourceQuerySql: "SELECT 1" });
  socket.respondOk(aiPackRequest, {
    exportPathRelative: "exports/ai-investigations/pack-7-1001",
    outcomeEvidenceStatus: "PARTIAL_OUTCOME",
    targetInScannerContext: true,
    promptText: "Investigate returned position 1 without inventing ranking semantics.",
    fileCount: 10
  });

  assert.deepEqual(await firstPage, { items: [], hasMore: false, nextCursor: null });
  assert.deepEqual(await nextPage, { items: [], hasMore: false, nextCursor: null });
  assert.equal((await observation).securityId, "1001");
  assert.equal((await provenance).sourceQuerySql, "SELECT 1");
  const created = await aiPack;
  assert.equal(created.status, DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.CREATED);
  assert.equal(created.exportPathRelative, "exports/ai-investigations/pack-7-1001");
  assert.equal(created.fileCount, 10);
});

test("Viewer client marks AI-pack acknowledgement unknown after dispatched transport loss without capture-style lock", async () => {
  const { client, socket } = await connectedClient();

  const aiPack = client.createDemoBuyAiPack(9, "9001");
  await nextTurn();
  const request = socket.sent.at(-1);
  assert.equal(request.type, "demo.buy.ai-pack.create");

  socket.close(1006, "synthetic transport loss");
  const outcome = await aiPack;
  assert.deepEqual(outcome, {
    status: DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.UNKNOWN
  });
  assert.equal(client.getState().captureAcknowledgementLocked, false);
});

test("Viewer client rejects malformed Demo Buy read/export coordinates before transport", async () => {
  const { client, socket } = await connectedClient();
  const before = socket.sent.length;

  await assert.rejects(client.getDemoBuyPage(""), /cursor must be a non-empty string/i);
  await assert.rejects(client.getDemoBuyObservation(0, "1001"), /captureId must be a positive safe integer/i);
  await assert.rejects(client.getDemoBuyObservation(1, ""), /securityId must be a non-empty string/i);
  await assert.rejects(client.getDemoBuyCapture(-1), /captureId must be a positive safe integer/i);
  await assert.rejects(client.createDemoBuyAiPack(0, "1001"), /captureId must be a positive safe integer/i);
  await assert.rejects(client.createDemoBuyAiPack(1, ""), /securityId must be a non-empty string/i);

  assert.equal(socket.sent.length, before);
});
