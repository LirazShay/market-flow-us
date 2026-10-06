import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function row(id, price) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    TradeDateTime: "2026-10-05T14:31:00Z",
    Price: price,
    BidRate: price - 0.1,
    AskRate: price + 0.1,
    DailyVolume: 1_000 + id
  };
}

function snapshot(records, completedAtMs) {
  return buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: records.length,
          records
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-replay-proof"
    },
    timing: {
      startedAtMs: completedAtMs - 20,
      responseReceivedAtMs: completedAtMs - 5,
      completedAtMs
    },
    httpStatus: 200
  });
}

function sourceFromSnapshots(snapshots) {
  const frames = snapshots.map((item, sequence) => createReplayFrame({
    recordingId: "service-replay-proof",
    sequence,
    snapshot: item
  }));
  const firstFrameAtMs = frames[0].snapshot.timing.completedAtMs;
  const lastFrameAtMs = frames.at(-1).snapshot.timing.completedAtMs;

  return createRecordingSource({
    kind: "service-test",
    summary: {
      id: "service-replay-proof",
      name: "Service Replay proof",
      status: "complete",
      createdAtMs: firstFrameAtMs,
      firstFrameAtMs,
      lastFrameAtMs,
      durationMs: lastFrameAtMs - firstFrameAtMs,
      frameCount: frames.length,
      approximateBytes: 1_024
    },
    frameIndex: frames.map((frame) => ({
      sequence: frame.sequence,
      completedAtMs: frame.snapshot.timing.completedAtMs
    })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function createManualPlayerScheduler() {
  const tasks = [];
  return {
    setTimer(callback, delayMs) {
      const task = { callback, delayMs, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimer(task) {
      task.cancelled = true;
    },
    pending() {
      return tasks.filter((task) => !task.cancelled);
    }
  };
}

test("Replay Player uses the unchanged ProducerBridge protocol and real service ACK path", async () => {
  let wallNowMs = 1_000_000;
  const fixture = await createServiceFixture({
    now: () => wallNowMs,
    openDatabase: openMarketFlowUsDatabase
  });
  const sentMessages = [];
  const playerScheduler = createManualPlayerScheduler();

  const bridge = createProducerBridge({
    url: fixture.url,
    productVersion: "replay-player-service-proof",
    clientInstanceId: "replay-player-service-proof",
    createSocket(url) {
      const socket = new WebSocket(url, { origin: fixture.origin });
      const send = socket.send.bind(socket);
      socket.send = (value, ...args) => {
        sentMessages.push(JSON.parse(value.toString()));
        return send(value, ...args);
      };
      return socket;
    },
    createBroadcastChannel: () => ({
      postMessage() {},
      close() {}
    }),
    schedule: () => ({ cancelled: false }),
    cancelSchedule: (token) => {
      token.cancelled = true;
    },
    now: () => wallNowMs
  });

  const source = sourceFromSnapshots([
    snapshot([row(1001, 101.25), row(1002, 202.5)], 10_000),
    snapshot([row(1001, 101.5), row(1002, 202.75)], 10_137)
  ]);
  const player = createMarketReplayPlayer({
    source,
    producerBridge: bridge,
    now: () => wallNowMs,
    setTimer: playerScheduler.setTimer,
    clearTimer: playerScheduler.clearTimer
  });

  try {
    await player.play();

    assert.equal(player.getState().status, "playing");
    assert.equal(player.getState().committedFrameCount, 1);
    assert.equal(playerScheduler.pending().length, 1);
    assert.equal(playerScheduler.pending()[0].delayMs, 137);

    let authority = await fixture.rows(
      `SELECT
         CAST(COUNT(*) AS VARCHAR) AS complete_cycles,
         CAST(MIN(completed_at_ms) AS VARCHAR) AS first_completed_at_ms,
         CAST(MAX(completed_at_ms) AS VARCHAR) AS last_completed_at_ms
       FROM cycles
       WHERE status = 'complete'`
    );
    assert.deepEqual(authority, [{
      complete_cycles: "1",
      first_completed_at_ms: "1000000",
      last_completed_at_ms: "1000000"
    }]);

    wallNowMs += 137;
    await playerScheduler.pending()[0].callback();

    assert.equal(player.getState().status, "completed");
    assert.equal(player.getState().committedFrameCount, 2);

    authority = await fixture.rows(
      `SELECT
         CAST(COUNT(*) AS VARCHAR) AS complete_cycles,
         CAST(MIN(completed_at_ms) AS VARCHAR) AS first_completed_at_ms,
         CAST(MAX(completed_at_ms) AS VARCHAR) AS last_completed_at_ms,
         CAST((SELECT COUNT(*) FROM history) AS VARCHAR) AS history_rows
       FROM cycles
       WHERE status = 'complete'`
    );
    assert.deepEqual(authority, [{
      complete_cycles: "2",
      first_completed_at_ms: "1000000",
      last_completed_at_ms: "1000137",
      history_rows: "4"
    }]);

    const sessionRows = await fixture.rows(
      "SELECT status, stop_reason FROM sessions ORDER BY started_at_ms"
    );
    assert.deepEqual(sessionRows, [{
      status: "stopped",
      stop_reason: "replay-complete"
    }]);

    assert.deepEqual(sentMessages.map((message) => message.type), [
      "client.hello",
      "producer.session.start",
      "producer.universe.replace",
      "producer.cycle.commit",
      "producer.cycle.commit",
      "producer.session.stop"
    ]);
    assert.equal(
      sentMessages.some((message) => /replay|seek|playback|recording|virtual.?clock|fast.?forward/iu.test(message.type)),
      false
    );
  } finally {
    await fixture.cleanup();
  }
});
