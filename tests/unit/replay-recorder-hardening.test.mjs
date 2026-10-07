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

test("Replay recorder serializes Stop behind pending creation and rejects overlapping Start", async () => {
  const createGate = deferred();
  const captureGate = deferred();
  let createCount = 0;
  let completeCount = 0;
  const recordingSummary = {
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
  const completedSummary = {
    ...recordingSummary,
    status: "complete"
  };
  const store = {
    async createRecording() {
      createCount += 1;
      await createGate.promise;
      return recordingSummary;
    },
    async appendFrame() {
      throw new Error("appendFrame must not run in this startup proof");
    },
    async completeRecording() {
      completeCount += 1;
      return completedSummary;
    },
    async listRecordings() {
      return [completeCount > 0 ? completedSummary : recordingSummary];
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

  let stopSettled = false;
  const stopPromise = recorder.stop().finally(() => {
    stopSettled = true;
  });
  await settle();
  assert.equal(stopSettled, false, "Stop must wait for the pending recording creation boundary");
  assert.equal(recorder.getState().status, "idle");

  createGate.resolve();
  await firstStart;
  await settle();
  assert.equal(recorder.getState().status, "stopping");

  captureGate.resolve(null);
  const stopped = await stopPromise;
  assert.equal(stopped.status, "complete");
  assert.equal(completeCount, 1);
  assert.equal(recorder.getState().status, "idle");
  assert.equal(recorder.getState().recordingId, "hardening-recorder");
});
