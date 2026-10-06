import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

const ORIGINAL_DAY_A = Date.parse("2026-10-06T14:30:00Z");
const REPLAY_DAY_B = Date.parse("2026-10-07T14:30:00Z");

function rawSecurity(price) {
  return {
    PaperId: 1001,
    Symbol: "AAA",
    PaperNameEng: "Alpha Incorporated",
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-06T14:31:00Z",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 10_000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 1_000_000,
    PaperIdYatab: 1501,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function snapshot(price, completedAtMs) {
  return buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: 1,
          records: [rawSecurity(price)]
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-replay-reclosure"
    },
    timing: {
      startedAtMs: completedAtMs - 100,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs
    },
    httpStatus: 200
  });
}

function sourceFromSnapshots(snapshots) {
  const frames = snapshots.map((item, sequence) => createReplayFrame({
    recordingId: "reclosure-recording",
    sequence,
    snapshot: item
  }));
  const firstFrameAtMs = frames[0].snapshot.timing.completedAtMs;
  const lastFrameAtMs = frames.at(-1).snapshot.timing.completedAtMs;

  return createRecordingSource({
    kind: "reclosure-test",
    summary: {
      id: "reclosure-recording",
      name: "Replay reclosure proof",
      status: "complete",
      createdAtMs: firstFrameAtMs,
      firstFrameAtMs,
      lastFrameAtMs,
      durationMs: lastFrameAtMs - firstFrameAtMs,
      frameCount: frames.length,
      approximateBytes: 2_048
    },
    frameIndex: frames.map((frame) => ({
      sequence: frame.sequence,
      completedAtMs: frame.snapshot.timing.completedAtMs
    })),
    readFrame: async (sequence) => structuredClone(frames[sequence])
  });
}

function createManualScheduler() {
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

function builtin(queryId) {
  const query = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find((item) => item.queryId === queryId);
  assert.ok(query, `Missing Scanner built-in ${queryId}`);
  return query;
}

function rowsAsObjects(result) {
  const names = result.columns.map((column) => column.name);
  return result.rows.map((row) => Object.fromEntries(
    names.map((name, index) => [name, row[index]])
  ));
}

function horizon(item, horizonMs) {
  return item.horizons.find((entry) => entry.horizonMs === horizonMs);
}

test("Replay mid-recording next-day start drives real Current/History/Scanner/Demo Buy without preroll", async () => {
  let wallNowMs = REPLAY_DAY_B + 10_000;
  const fixture = await createServiceFixture({
    now: () => wallNowMs,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60_000 }
  });
  const scheduler = createManualScheduler();

  const bridge = createProducerBridge({
    url: fixture.url,
    productVersion: "replay-reclosure-proof",
    clientInstanceId: "replay-reclosure-proof",
    createSocket(url) {
      return new WebSocket(url, { origin: fixture.origin });
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
    snapshot(100, ORIGINAL_DAY_A),
    snapshot(101, ORIGINAL_DAY_A + 10_000),
    snapshot(103, ORIGINAL_DAY_A + 20_000)
  ]);
  const player = createMarketReplayPlayer({
    source,
    producerBridge: bridge,
    now: () => wallNowMs,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer
  });

  try {
    const selected = player.select(1);
    assert.equal(selected.selectedSequence, 1);
    assert.equal(selected.committedFrameCount, 0);

    await player.play();
    assert.equal(player.getState().committedSequence, 1);
    assert.equal(player.getState().committedFrameCount, 1);
    assert.equal(scheduler.pending().length, 1);
    assert.equal(scheduler.pending()[0].delayMs, 10_000);

    const viewer = await fixture.connect("viewer", "replay-reclosure-viewer");

    const current = await viewer.request("viewer.current.get");
    assert.equal(current.type, "response.ok");
    assert.equal(current.payload.data.summary.rowCount, 1);
    assert.equal(current.payload.data.summary.lastCycleId, 1);
    assert.equal(current.payload.data.summary.lastCollectedAtMs, wallNowMs);
    assert.equal(current.payload.data.rows[0].securityId, "1001");
    assert.equal(current.payload.data.rows[0].Price, 101);
    assert.equal(current.payload.data.rows[0].TradeDateTime, "2026-10-06T14:31:00Z");
    assert.equal(current.payload.data.rows[0].collectedAtMs, wallNowMs);

    const firstHistory = await viewer.request("viewer.history.page", {
      securityId: "1001",
      cursor: null
    });
    assert.equal(firstHistory.type, "response.ok");
    assert.deepEqual(firstHistory.payload.data.rows.map((row) => row.Price), [101]);
    assert.equal(firstHistory.payload.data.rows[0].collectedAtMs, wallNowMs);
    assert.equal(firstHistory.payload.data.rows[0].TradeDateTime, "2026-10-06T14:31:00Z");

    const stagedBefore = await viewer.request("scanner.execute", {
      sql: builtin("builtin:staged-candidate-ranking").sql
    });
    assert.equal(stagedBefore.type, "response.ok");
    const stagedBeforeRows = rowsAsObjects(stagedBefore.payload.data);
    assert.equal(stagedBeforeRows.length, 1);
    assert.equal(stagedBeforeRows[0].securityId, "1001");
    assert.equal(stagedBeforeRows[0].stage_reached, 0);
    assert.equal(stagedBeforeRows[0].price_10s_ago, null);

    const captureQuery = "SELECT security_id, Price AS score FROM latest ORDER BY security_id LIMIT 10;";
    const captureSource = await viewer.request("scanner.execute", { sql: captureQuery });
    assert.equal(captureSource.type, "response.ok");
    assert.deepEqual(captureSource.payload.data.rows, [["1001", 101]]);

    const captured = await viewer.request("demo.buy.capture", {
      items: [{ securityId: "1001", resultRank: 1 }],
      sourceQuery: {
        queryId: "user:replay-reclosure",
        name: "Replay reclosure capture",
        sql: captureQuery,
        intervalMs: 3000
      },
      sourceResult: {
        startedAtMs: captureSource.payload.data.startedAtMs,
        completedAtMs: captureSource.payload.data.completedAtMs,
        rowCount: captureSource.payload.data.rowCount,
        context: shapeDemoBuyScannerContext({
          columns: captureSource.payload.data.columns,
          rows: captureSource.payload.data.rows
        })
      },
      selectionMode: "all",
      isAutomatic: false,
      topX: null
    });
    assert.equal(captured.type, "response.ok");
    assert.equal(captured.payload.data.captureId, 1);
    assert.equal(captured.payload.data.capturedAtMs, wallNowMs);

    const beforeFuture = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(beforeFuture.type, "response.ok");
    assert.equal(beforeFuture.payload.data.items.length, 1);
    const tenBefore = horizon(beforeFuture.payload.data.items[0], 10_000);
    assert.equal(tenBefore.observedAtMs, null);
    assert.equal(tenBefore.unavailableReason, "NO_FUTURE_OBSERVATION");

    const nextTask = scheduler.pending()[0];
    wallNowMs += nextTask.delayMs;
    await nextTask.callback();
    assert.equal(player.getState().status, "completed");
    assert.equal(player.getState().committedSequence, 2);
    assert.equal(player.getState().committedFrameCount, 2);

    const secondHistory = await viewer.request("viewer.history.page", {
      securityId: "1001",
      cursor: null
    });
    assert.equal(secondHistory.type, "response.ok");
    assert.deepEqual(secondHistory.payload.data.rows.map((row) => row.Price), [103, 101]);
    assert.deepEqual(secondHistory.payload.data.rows.map((row) => row.collectedAtMs), [
      REPLAY_DAY_B + 20_000,
      REPLAY_DAY_B + 10_000
    ]);
    assert.equal(secondHistory.payload.data.rows.every(
      (row) => row.TradeDateTime === "2026-10-06T14:31:00Z"
    ), true);

    const stagedAfter = await viewer.request("scanner.execute", {
      sql: builtin("builtin:staged-candidate-ranking").sql
    });
    assert.equal(stagedAfter.type, "response.ok");
    const stagedAfterRows = rowsAsObjects(stagedAfter.payload.data);
    assert.equal(stagedAfterRows.length, 1);
    assert.equal(stagedAfterRows[0].stage_reached, 1);
    assert.equal(stagedAfterRows[0].price_10s_ago, 101);

    const afterFuture = await viewer.request("demo.buy.page", { cursor: null });
    assert.equal(afterFuture.type, "response.ok");
    const item = afterFuture.payload.data.items[0];
    assert.equal(item.baseline.collectedAtMs, REPLAY_DAY_B + 10_000);
    assert.equal(item.baseline.price, 101);
    const tenAfter = horizon(item, 10_000);
    assert.equal(tenAfter.targetAtMs, REPLAY_DAY_B + 20_000);
    assert.equal(tenAfter.observedAtMs, REPLAY_DAY_B + 20_000);
    assert.equal(tenAfter.price, 103);
    assert.equal(tenAfter.outcome, "UP");
    assert.equal(tenAfter.unavailableReason, null);

    const dayAHistory = await fixture.rows(
      "SELECT COUNT(*) AS count FROM history WHERE collected_at_ms < $dayB",
      { dayB: REPLAY_DAY_B }
    );
    assert.equal(Number(dayAHistory[0].count), 0);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
