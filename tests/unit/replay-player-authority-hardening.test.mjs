import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

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

function makeFrame(sequence = 0, completedAtMs = 1_000) {
  return createReplayFrame({
    recordingId: "authority-hardening",
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
  });
}

function makeSource({ readFrame } = {}) {
  const frame = makeFrame();
  return createRecordingSource({
    kind: "authority-hardening-test",
    summary: {
      id: "authority-hardening",
      name: "Authority hardening proof",
      status: "complete",
      createdAtMs: 1_000,
      firstFrameAtMs: 1_000,
      lastFrameAtMs: 1_000,
      durationMs: 0,
      frameCount: 1,
      approximateBytes: 100
    },
    frameIndex: [{ sequence: 0, completedAtMs: 1_000 }],
    readFrame: readFrame ?? (async () => structuredClone(frame))
  });
}

function makePlayer(source, producer) {
  return createMarketReplayPlayer({
    source,
    producerBridge: producer,
    now: () => 100_000,
    setTimer: () => ({ id: 1 }),
    clearTimer: () => {}
  });
}

test("commit failure received after Pause remains an authoritative Replay error", async () => {
  const commitGate = deferred();
  const calls = [];
  const producer = {
    getState: () => ({ state: "ready" }),
    async startSession() {
      calls.push("start");
    },
    async acceptUniverse() {
      calls.push("universe");
    },
    async commitCycle() {
      calls.push("commit");
      await commitGate.promise;
    },
    async stopSession(reason) {
      calls.push(`stop:${reason}`);
    }
  };
  const player = makePlayer(makeSource(), producer);

  const playPromise = player.play();
  await settle();
  assert.deepEqual(calls, ["start", "universe", "commit"]);
  assert.equal(player.pause().status, "paused");

  commitGate.reject(new Error("synthetic commit rejection"));
  const result = await playPromise;

  assert.equal(result.status, "error");
  assert.equal(result.requiresFreshRun, true);
  assert.equal(result.committedFrameCount, 0);
  assert.equal(result.committedSequence, null);
  assert.equal(result.latestError?.message, "synthetic commit rejection");
  assert.equal(calls.at(-1), "stop:replay-error");
});

test("Resume while commit ACK is pending never emits the same Replay frame twice", async () => {
  const commitGate = deferred();
  const calls = [];
  const producer = {
    getState: () => ({ state: "ready" }),
    async startSession() {
      calls.push("start");
    },
    async acceptUniverse() {
      calls.push("universe");
    },
    async commitCycle() {
      calls.push("commit");
      await commitGate.promise;
    },
    async stopSession(reason) {
      calls.push(`stop:${reason}`);
    }
  };
  const player = makePlayer(makeSource(), producer);

  const playPromise = player.play();
  await settle();
  player.pause();
  const resumePromise = player.play();
  await settle();

  assert.equal(calls.filter((call) => call === "commit").length, 1);
  commitGate.resolve();
  await Promise.all([playPromise, resumePromise]);

  assert.equal(player.getState().status, "completed");
  assert.equal(player.getState().committedFrameCount, 1);
  assert.equal(calls.filter((call) => call === "commit").length, 1);
  assert.equal(calls.at(-1), "stop:replay-complete");
});

test("source read rejected after Pause is stale scheduling work, not an authority failure", async () => {
  const readGate = deferred();
  const calls = [];
  const producer = {
    getState: () => ({ state: "ready" }),
    async startSession() {
      calls.push("start");
    },
    async acceptUniverse() {
      calls.push("universe");
    },
    async commitCycle() {
      calls.push("commit");
    },
    async stopSession(reason) {
      calls.push(`stop:${reason}`);
    }
  };
  const source = makeSource({
    readFrame: async () => await readGate.promise
  });
  const player = makePlayer(source, producer);

  const playPromise = player.play();
  await settle();
  assert.equal(player.pause().status, "paused");
  readGate.reject(new Error("stale source read"));
  const result = await playPromise;

  assert.equal(result.status, "paused");
  assert.equal(result.requiresFreshRun, false);
  assert.equal(result.latestError, null);
  assert.equal(result.committedFrameCount, 0);
  assert.deepEqual(calls, ["start"]);
});
