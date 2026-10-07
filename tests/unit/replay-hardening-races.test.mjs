import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayPlayerController } from "../../browser/replay/player-controller.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";
import { createReplayRunCoordinator } from "../../browser/replay/replay-run-coordinator.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function makeSource({ id = "hardening", times = [1_000, 2_000, 3_000] } = {}) {
  const frames = times.map((completedAtMs, sequence) => createReplayFrame({
    recordingId: id,
    sequence,
    snapshot: buildValidatedSnapshot({
      responseJson: {
        data: {
          ScreenerHulPaging: {
            recordCount: 1,
            records: [{
              PaperId: 1,
              Symbol: "ONE",
              TradeDateTime: "2026-10-05T14:31:00Z",
              Price: 101 + sequence,
              BidRate: 100 + sequence,
              AskRate: 102 + sequence,
              DailyVolume: 1_000 + sequence
            }]
          }
        },
        resultCode: 0,
        rtUsa: true
      },
      timing: {
        startedAtMs: completedAtMs - 20,
        responseReceivedAtMs: completedAtMs - 5,
        completedAtMs
      },
      httpStatus: 200
    })
  }));

  return createRecordingSource({
    kind: "hardening-test",
    summary: {
      id,
      name: "Replay hardening proof",
      status: "complete",
      createdAtMs: times[0] ?? null,
      firstFrameAtMs: times[0] ?? null,
      lastFrameAtMs: times.at(-1) ?? null,
      durationMs: times.length === 0 ? 0 : times.at(-1) - times[0],
      frameCount: frames.length,
      approximateBytes: 100
    },
    frameIndex: frames.map((frame) => ({
      sequence: frame.sequence,
      completedAtMs: frame.snapshot.timing.completedAtMs
    })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

test("final frame ACK received during Pause is completed exactly once on Resume", async () => {
  const source = makeSource({ times: [1_000] });
  const commitGate = deferred();
  const calls = [];
  const producer = {
    getState: () => ({ state: "ready" }),
    async startSession() {
      calls.push("start");
      return { sessionId: "session-1" };
    },
    async acceptUniverse() {
      calls.push("universe");
      return { universeRevision: 1 };
    },
    async commitCycle() {
      calls.push("commit");
      await commitGate.promise;
      return { cycleId: 1 };
    },
    async stopSession(reason) {
      calls.push(`stop:${reason}`);
      return { stopped: true };
    }
  };
  const player = createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: () => 100_000,
    setTimer: () => ({ id: 1 }),
    clearTimer: () => {}
  });

  const playPromise = player.play();
  await settle();
  assert.deepEqual(calls, ["start", "universe", "commit"]);

  assert.equal(player.pause().status, "paused");
  commitGate.resolve();
  await playPromise;
  assert.equal(player.getState().status, "paused");
  assert.equal(player.getState().committedSequence, 0);
  assert.equal(player.getState().committedFrameCount, 1);

  const completed = await player.play();
  assert.equal(completed.status, "completed");
  assert.equal(completed.committedFrameCount, 1);
  assert.equal(calls.filter((call) => call === "commit").length, 1);
  assert.equal(calls.at(-1), "stop:replay-complete");
});

test("stale Player callback cannot restore selection into a newer controller Player", async () => {
  const source = makeSource();
  const callbacks = [];
  const players = [];

  function createFakePlayer({ onStateChange }) {
    callbacks.push(onStateChange);
    let state = {
      status: "ready",
      selectedSequence: 0,
      nextSequence: 0,
      committedSequence: null,
      committedFrameCount: 0,
      positionMs: 0,
      remainingDelayMs: 0,
      sessionStarted: false,
      serviceReady: true,
      requiresFreshRun: false,
      latestError: null
    };
    const selections = [];
    const fake = {
      selections,
      getState: () => state,
      select(sequence) {
        selections.push(sequence);
        state = { ...state, selectedSequence: sequence, nextSequence: sequence };
        return state;
      },
      play: async () => state,
      pause: () => state,
      stop: async () => state,
      seek: async (sequence) => ({ ...state, selectedSequence: sequence, nextSequence: sequence })
    };
    players.push(fake);
    return fake;
  }

  const controller = createReplayPlayerController({
    store: {},
    producerBridge: { id: "bridge-1" },
    openIndexedDbSource: async () => source,
    createPlayer: createFakePlayer
  });

  await controller.loadIndexedDbRecording("hardening");
  assert.equal(players.length, 1);
  controller.attachProducerBridge({ id: "bridge-2" });
  assert.equal(players.length, 2);

  callbacks[0]({
    ...players[0].getState(),
    status: "stopped",
    selectedSequence: 2,
    nextSequence: 2,
    requiresFreshRun: true
  });

  controller.attachProducerBridge({ id: "bridge-3" });
  assert.equal(players.length, 3);
  assert.deepEqual(players[2].selections, []);
  assert.equal(controller.getState().selectedSequence, 0);
  assert.equal(controller.getState().status, "ready");
});

test("overlapping fresh-run requests serialize stale cleanup before the newer Host run starts", async () => {
  const firstStartGate = deferred();
  const calls = [];
  let startCount = 0;
  const hostClient = {
    async stopRun(reason) {
      calls.push(`stop:${reason}`);
      return { status: "stopped" };
    },
    async startRun(reason) {
      startCount += 1;
      const number = startCount;
      calls.push(`start:${number}:${reason}`);
      if (number === 1) await firstStartGate.promise;
      return {
        runId: `run-${number}`,
        serviceUrl: `ws://127.0.0.1:${8700 + number}`
      };
    }
  };
  const coordinator = createReplayRunCoordinator({
    hostClient,
    target: { open: () => ({}) },
    producerBridgeFactory: ({ url }) => ({ url }),
    viewerRuntimeFactory: () => ({
      openViewer: () => ({ opened: true })
    })
  });

  const first = coordinator.startFreshRun({ reason: "first" });
  await settle();
  assert.equal(startCount, 1);

  const second = coordinator.startFreshRun({ reason: "second" });
  await settle();
  assert.equal(startCount, 1, "the newer run must wait until stale cleanup owns the Host boundary");

  firstStartGate.resolve();
  await assert.rejects(first, /generation changed during startup/u);
  const secondBridge = await second;

  assert.equal(secondBridge.url, "ws://127.0.0.1:8702");
  assert.deepEqual(calls, [
    "stop:replace-first",
    "start:1:first",
    "stop:stale-run-generation",
    "stop:replace-second",
    "start:2:second"
  ]);
  assert.equal(coordinator.getState().activeRunId, "run-2");
});
