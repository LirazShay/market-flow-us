import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";

function source() {
  const snapshot = buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: 1,
          records: [{
            PaperId: 1001,
            Symbol: "AAA",
            TradeDateTime: "2026-10-05T14:31:00Z",
            Price: 101.25,
            BidRate: 101.1,
            AskRate: 101.4,
            DailyVolume: 1_001
          }]
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-player-error-proof"
    },
    timing: {
      startedAtMs: 9_980,
      responseReceivedAtMs: 9_995,
      completedAtMs: 10_000
    },
    httpStatus: 200
  });
  const frame = createReplayFrame({
    recordingId: "player-error-proof",
    sequence: 0,
    snapshot
  });

  return createRecordingSource({
    kind: "unit",
    summary: {
      id: "player-error-proof",
      name: "Player error proof",
      status: "complete",
      createdAtMs: 10_000,
      firstFrameAtMs: 10_000,
      lastFrameAtMs: 10_000,
      durationMs: 0,
      frameCount: 1,
      approximateBytes: 1
    },
    frameIndex: [{ sequence: 0, completedAtMs: 10_000 }],
    readFrame: async () => structuredClone(frame)
  });
}

for (const failurePhase of ["universe", "commit"]) {
  test(`Replay Player closes producer ownership after conclusive ${failurePhase} failure`, async () => {
    const calls = [];
    let bridgeState = "idle";
    const producerBridge = {
      getState: () => ({ state: bridgeState }),
      async startSession() {
        calls.push("start");
        bridgeState = "ready";
        return { sessionId: "session-1" };
      },
      async acceptUniverse() {
        calls.push("universe");
        if (failurePhase === "universe") throw new Error("synthetic universe rejection");
        return { universeRevision: 1 };
      },
      async commitCycle() {
        calls.push("commit");
        if (failurePhase === "commit") throw new Error("synthetic commit rejection");
        return { cycleId: 1 };
      },
      async stopSession(reason) {
        calls.push(`stop:${reason}`);
        bridgeState = "stopped";
        return { status: "stopped" };
      }
    };

    const player = createMarketReplayPlayer({
      source: source(),
      producerBridge,
      now: () => 1_000_000
    });

    const state = await player.play();

    assert.equal(state.status, "error");
    assert.equal(state.requiresFreshRun, true);
    assert.equal(state.sessionStarted, false);
    assert.match(state.latestError.message, /synthetic (universe|commit) rejection/);
    assert.equal(calls.at(-1), "stop:replay-error");
    assert.equal(calls.filter((call) => call === "start").length, 1);
    assert.equal(calls.filter((call) => call === "stop:replay-error").length, 1);
  });
}
