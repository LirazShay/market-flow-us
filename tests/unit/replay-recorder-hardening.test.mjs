import assert from "node:assert/strict";
import test from "node:test";

import { createMarketReplayRecorder } from "../../browser/replay/market-recorder.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("Replay recorder rejects overlapping Start and Stop while recording creation is pending", async () => {
  const createGate = deferred();
  const captureGate = deferred();
  let createCount = 0;
  const summary = {
    id: "hardening-recorder",
    name: "Hardening recorder",
    status: "recording",
    createdAtMs: 1_000,
    firstFrameAtMs: null,
    lastFrameAtMs: null,
    durationMs: 0,
    frameCount: 0,
    approximateBytes: 0
  };
  const store = {
    async createRecording() {
      createCount += 1;
      await createGate.promise;
      return summary;
    },
    async appendFrame() {
      throw new Error("appendFrame must not run in this startup proof");
    },
    async listRecordings() {
      return [summary];
    }
  };
  const recorder = createMarketReplayRecorder({
    store,
    fetchSnapshot: async () => captureGate.promise,
    now: () => 1_000,
    createId: () => "hardening-recorder",
    setTimer: () => ({ id: 1 }),
    clearTimer: () => {}
  });

  const firstStart = recorder.start({ name: "Hardening recorder" });
  await settle();
  assert.equal(createCount, 1);

  await assert.rejects(
    recorder.start({ name: "Overlapping recorder" }),
    /already active/u
  );
  await assert.rejects(
    recorder.stop(),
    /startup is still in progress/u
  );
  assert.equal(createCount, 1);
  assert.equal(recorder.getState().status, "idle");

  createGate.resolve();
  await firstStart;
  assert.equal(recorder.getState().status, "recording");
  assert.equal(recorder.getState().recordingId, "hardening-recorder");
});
