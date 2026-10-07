import assert from "node:assert/strict";
import test from "node:test";

import { createReplayPlayerController } from "../../browser/replay/player-controller.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function fakeSource(id, kind) {
  return Object.freeze({
    kind,
    getSummary() {
      return Object.freeze({
        id,
        name: id,
        status: "complete",
        createdAtMs: null,
        firstFrameAtMs: null,
        lastFrameAtMs: null,
        durationMs: 0,
        frameCount: 0,
        approximateBytes: 0
      });
    },
    getFrameIndex() {
      return Object.freeze([]);
    },
    resolveFrameAtOrBefore() {
      return null;
    }
  });
}

test("newer Replay source selection cannot be overwritten by a stale slower load", async () => {
  const oldGate = deferred();
  const oldSource = fakeSource("old-file", "file");
  const newSource = fakeSource("new-indexeddb", "indexeddb");
  const controller = createReplayPlayerController({
    store: {},
    openFileSource: async () => oldGate.promise,
    openIndexedDbSource: async () => newSource
  });

  const oldLoad = controller.loadPortableFile({ name: "old.mfreplay" });
  const newState = await controller.loadIndexedDbRecording("new-indexeddb");
  assert.equal(newState.sourceId, "new-indexeddb");
  assert.equal(newState.sourceKind, "indexeddb");

  oldGate.resolve(oldSource);
  const staleState = await oldLoad;
  assert.equal(staleState.sourceId, "new-indexeddb");
  assert.equal(controller.getState().sourceId, "new-indexeddb");
  assert.equal(controller.getSource(), newSource);
});

test("stale Replay source load failure cannot replace the latest controller state or error", async () => {
  const oldGate = deferred();
  const newSource = fakeSource("new-indexeddb", "indexeddb");
  const controller = createReplayPlayerController({
    store: {},
    openFileSource: async () => oldGate.promise,
    openIndexedDbSource: async () => newSource
  });

  const oldLoad = controller.loadPortableFile({ name: "old.mfreplay" });
  await controller.loadIndexedDbRecording("new-indexeddb");
  oldGate.reject(new Error("stale file failure"));

  const staleState = await oldLoad;
  assert.equal(staleState.sourceId, "new-indexeddb");
  assert.equal(staleState.latestError, null);
  assert.equal(controller.getState().latestError, null);
});
