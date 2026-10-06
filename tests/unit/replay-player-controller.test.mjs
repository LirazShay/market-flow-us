import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayPlayerController } from "../../browser/replay/player-controller.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

function makeSource(kind = "indexeddb") {
  const times = [1_000, 2_500, 6_000];
  const frames = times.map((completedAtMs, sequence) => createReplayFrame({
    recordingId: "r1",
    sequence,
    snapshot: buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: 1, records: [{ PaperId: 1, Symbol: "ONE", Price: 101 + sequence }] } },
        resultCode: 0,
        rtUsa: true
      },
      timing: { startedAtMs: completedAtMs - 20, responseReceivedAtMs: completedAtMs - 5, completedAtMs },
      httpStatus: 200
    })
  }));
  return createRecordingSource({
    kind,
    summary: {
      id: "r1",
      name: "Controller proof",
      status: "complete",
      createdAtMs: 1_000,
      firstFrameAtMs: 1_000,
      lastFrameAtMs: 6_000,
      durationMs: 5_000,
      frameCount: 3,
      approximateBytes: 123
    },
    frameIndex: frames.map((frame) => ({ sequence: frame.sequence, completedAtMs: frame.snapshot.timing.completedAtMs })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function fakeProducer() {
  let state = "idle";
  const calls = [];
  return {
    calls,
    getState: () => ({ state }),
    async startSession() { state = "ready"; calls.push("start"); return { sessionId: "s1" }; },
    async acceptUniverse() { calls.push("universe"); return { universeRevision: 1 }; },
    async commitCycle(cycle) { calls.push({ type: "cycle", completedAtMs: cycle.completedAtMs }); return { cycleId: 1 }; },
    async stopSession(reason) { state = "stopped"; calls.push({ type: "stop", reason }); return { stopped: true }; }
  };
}

test("controller keeps Play unavailable until producer attachment and snaps pre-run position to a real frame", async () => {
  const source = makeSource();
  const producer = fakeProducer();
  const controller = createReplayPlayerController({
    store: {},
    openIndexedDbSource: async () => source,
    now: () => 100_000,
    setTimer: () => ({ id: 1 }),
    clearTimer: () => {}
  });

  await controller.loadIndexedDbRecording("r1");
  assert.equal(controller.getState().sourceKind, "indexeddb");
  assert.equal(controller.getState().playerAvailable, false);
  await assert.rejects(() => controller.play(), (error) => error.code === "REPLAY_SERVICE_NOT_READY");

  const selected = await controller.seekPositionMs(3_900);
  assert.equal(selected.selectedSequence, 1);
  assert.equal(selected.positionMs, 1_500);

  controller.attachProducerBridge(producer);
  assert.equal(controller.getState().playerAvailable, true);
  assert.equal(controller.getState().selectedSequence, 1);
  await controller.play();
  assert.deepEqual(producer.calls.slice(0, 3).map((item) => typeof item === "string" ? item : item.type), ["start", "universe", "cycle"]);
  assert.equal(producer.calls[2].completedAtMs, 100_000);
});

test("controller uses the same source contract for validated portable files", async () => {
  const fileSource = makeSource("file");
  const controller = createReplayPlayerController({
    store: {},
    openFileSource: async ({ file }) => {
      assert.equal(file.name, "proof.jsonl");
      return fileSource;
    }
  });

  await controller.loadPortableFile({ name: "proof.jsonl" });
  const state = controller.getState();
  assert.equal(state.sourceReady, true);
  assert.equal(state.sourceKind, "file");
  assert.equal(state.frameCount, 3);
  assert.equal(state.durationMs, 5_000);
});
