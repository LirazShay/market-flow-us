import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayPlayerController } from "../../browser/replay/player-controller.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

function makeSource() {
  const times = [1_000, 2_500, 6_000];
  const frames = times.map((completedAtMs, sequence) => createReplayFrame({
    recordingId: "host-lifecycle",
    sequence,
    snapshot: buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: 1, records: [{ PaperId: 1, Symbol: "ONE", Price: 100 + sequence }] } },
        resultCode: 0,
        rtUsa: true
      },
      timing: { startedAtMs: completedAtMs - 20, responseReceivedAtMs: completedAtMs - 5, completedAtMs },
      httpStatus: 200
    })
  }));

  return createRecordingSource({
    kind: "indexeddb",
    summary: {
      id: "host-lifecycle",
      name: "Host lifecycle",
      status: "complete",
      createdAtMs: 1_000,
      firstFrameAtMs: 1_000,
      lastFrameAtMs: 6_000,
      durationMs: 5_000,
      frameCount: 3,
      approximateBytes: 100
    },
    frameIndex: frames.map((frame) => ({ sequence: frame.sequence, completedAtMs: frame.snapshot.timing.completedAtMs })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function fakeProducer(runNumber) {
  let state = "idle";
  const calls = [];
  return {
    runNumber,
    calls,
    getState: () => ({ state }),
    async startSession() { state = "ready"; calls.push("start"); return { sessionId: `s${runNumber}` }; },
    async acceptUniverse() { calls.push("universe"); return { universeRevision: 1 }; },
    async commitCycle(cycle) { calls.push({ type: "cycle", completedAtMs: cycle.completedAtMs }); return { cycleId: 1 }; },
    async stopSession(reason) { state = "stopped"; calls.push({ type: "stop", reason }); return { stopped: true }; }
  };
}

test("Replay controller uses one run across Pause/Resume but fresh runs after Stop and Seek", async () => {
  const source = makeSource();
  const runs = [];
  const coordinator = {
    async startFreshRun({ reason, selectedSequence }) {
      const producer = fakeProducer(runs.length + 1);
      runs.push({ reason, selectedSequence, producer });
      return producer;
    }
  };

  let now = 100_000;
  const controller = createReplayPlayerController({
    store: {},
    runCoordinator: coordinator,
    openIndexedDbSource: async () => source,
    now: () => now,
    setTimer: () => ({ id: 1 }),
    clearTimer: () => {}
  });

  await controller.loadIndexedDbRecording("host-lifecycle");
  assert.equal(controller.getState().runCoordinatorAvailable, true);
  assert.equal(controller.getState().playerAvailable, false);

  await controller.play();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].reason, "initial-play");
  assert.equal(runs[0].selectedSequence, 0);
  assert.equal(controller.getState().committedSequence, 0);

  controller.pause();
  now += 20_000;
  await controller.play();
  assert.equal(runs.length, 1, "Resume must keep the same replay service/DB run");

  await controller.stop();
  assert.equal(controller.getState().requiresFreshRun, true);
  assert.equal(runs.length, 1);

  await controller.play();
  assert.equal(runs.length, 2, "Play after Stop must provision a fresh run before emission");
  assert.equal(runs[1].reason, "play-after-stop");
  assert.equal(runs[1].selectedSequence, 0);

  const seeked = await controller.seekPositionMs(3_900);
  assert.equal(seeked.selectedSequence, 1);
  assert.equal(seeked.status, "ready");
  assert.equal(seeked.committedFrameCount, 0);
  assert.equal(runs.length, 3, "Seek from an active run must provision a fresh run");
  assert.equal(runs[2].reason, "seek");
  assert.equal(runs[2].selectedSequence, 1);
  assert.equal(runs[2].producer.calls.length, 0, "Seek must not pre-roll the selected frame");

  await controller.play();
  assert.equal(runs[2].producer.calls[0], "start");
  assert.equal(runs[2].producer.calls[2].type, "cycle");
  assert.equal(runs[2].producer.calls[2].completedAtMs, now);
});
