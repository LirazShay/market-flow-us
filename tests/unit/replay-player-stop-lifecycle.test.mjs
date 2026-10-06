import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

function snapshot(completedAtMs, price) {
  return buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: 1,
          records: [{
            PaperId: 1001,
            Symbol: "AAA",
            TradeDateTime: "2026-10-05T14:31:00Z",
            Price: price,
            BidRate: price - 0.1,
            AskRate: price + 0.1,
            DailyVolume: 1_001
          }]
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-player-stop-proof"
    },
    timing: {
      startedAtMs: completedAtMs - 20,
      responseReceivedAtMs: completedAtMs - 5,
      completedAtMs
    },
    httpStatus: 200
  });
}

function source() {
  const frames = [snapshot(10_000, 101.25), snapshot(11_000, 101.5)]
    .map((item, sequence) => createReplayFrame({
      recordingId: "player-stop-proof",
      sequence,
      snapshot: item
    }));

  return createRecordingSource({
    kind: "unit",
    summary: {
      id: "player-stop-proof",
      name: "Player stop proof",
      status: "complete",
      createdAtMs: 10_000,
      firstFrameAtMs: 10_000,
      lastFrameAtMs: 11_000,
      durationMs: 1_000,
      frameCount: 2,
      approximateBytes: 1
    },
    frameIndex: frames.map((frame) => ({
      sequence: frame.sequence,
      completedAtMs: frame.snapshot.timing.completedAtMs
    })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function harness() {
  const timers = [];
  let bridgeState = "idle";
  const producerBridge = {
    getState: () => ({ state: bridgeState }),
    async startSession() {
      bridgeState = "ready";
      return { sessionId: "session-1" };
    },
    async acceptUniverse() {
      return { universeRevision: 1 };
    },
    async commitCycle() {
      return { cycleId: 1 };
    },
    async stopSession() {
      bridgeState = "disconnected";
      throw new Error("synthetic stop transport loss");
    }
  };

  const player = createMarketReplayPlayer({
    source: source(),
    producerBridge,
    now: () => 1_000_000,
    setTimer(callback, delayMs) {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cancelled = true;
    }
  });

  return { player, timers };
}

test("Stop reaches terminal local state even when producer stop ACK is lost", async () => {
  const { player, timers } = harness();
  await player.play();
  assert.equal(player.getState().status, "playing");
  assert.equal(timers.length, 1);

  await assert.rejects(player.stop(), /synthetic stop transport loss/);

  const state = player.getState();
  assert.equal(state.status, "stopped");
  assert.equal(state.sessionStarted, false);
  assert.equal(state.requiresFreshRun, true);
  assert.match(state.latestError.message, /synthetic stop transport loss/);
  assert.equal(timers[0].cancelled, true);
});

test("Seek preserves the selected boundary and terminalizes producer ownership when stop ACK is lost", async () => {
  const { player, timers } = harness();
  await player.play();

  const state = await player.seek(1);

  assert.equal(state.status, "seek_pending");
  assert.equal(state.selectedSequence, 1);
  assert.equal(state.nextSequence, 1);
  assert.equal(state.sessionStarted, false);
  assert.equal(state.requiresFreshRun, true);
  assert.match(state.latestError.message, /synthetic stop transport loss/);
  assert.equal(timers[0].cancelled, true);
});
