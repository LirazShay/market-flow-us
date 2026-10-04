import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { createRecorderConfig, createUsRecorderConfig } from "../../browser/recorder/config.js";
import { createRecorder } from "../../browser/recorder/recorder.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function row(paperId, symbol, price) {
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `${symbol} Inc`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-04T19:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 100,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 100000,
    PaperIdYatab: 500 + paperId,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate(startedAtMs, records) {
  const responseIds = records.map((item) => String(item.PaperId));
  return buildUsCollectionCandidate({
    recordCount: records.length,
    records,
    responseIds,
    membership: [...responseIds].sort(),
    timing: {
      startedAtMs,
      responseReceivedAtMs: startedAtMs + 5,
      completedAtMs: startedAtMs + 8,
      durationMs: 8
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      serverId: "synthetic"
    },
    httpStatus: 200
  });
}

function createManualScheduler() {
  const queue = [];
  let nextId = 1;
  return {
    schedule(callback, delayMs) {
      const task = { id: nextId++, callback, delayMs, cancelled: false };
      queue.push(task);
      return task.id;
    },
    cancelSchedule(id) {
      const task = queue.find((item) => item.id === id);
      if (task) task.cancelled = true;
    },
    async runNext() {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task.cancelled) {
          await task.callback();
          return task;
        }
      }
      throw new Error("expected scheduled task");
    }
  };
}

test("U.S. Recorder drives full local universe metadata and cadence-only config through the real producer bridge/service", async () => {
  let now = 10000;
  const fixture = await createServiceFixture({
    now: () => now,
    openDatabase: openMarketFlowUsDatabase
  });
  const sentMessages = [];
  const heartbeatTasks = [];
  const recorderScheduler = createManualScheduler();

  const bridge = createProducerBridge({
    url: fixture.url,
    productVersion: "us-browser-bridge-test",
    clientInstanceId: "us-browser-producer",
    createSocket(url) {
      const socket = new WebSocket(url, { origin: fixture.origin });
      const send = socket.send.bind(socket);
      socket.send = (value, ...args) => {
        sentMessages.push(JSON.parse(value.toString()));
        return send(value, ...args);
      };
      return socket;
    },
    createBroadcastChannel: () => ({ postMessage() {}, close() {} }),
    schedule(callback, delayMs) {
      const task = { callback, delayMs, cancelled: false };
      heartbeatTasks.push(task);
      return task;
    },
    cancelSchedule(task) {
      task.cancelled = true;
    },
    now: () => now
  });

  const candidates = [
    candidate(2000, [row(101, "AAA", 10), row(202, "BBB", 20)]),
    candidate(3000, [row(202, "BBB", 21), row(101, "AAA", 11)]),
    candidate(4000, [row(101, "AAA", 12), row(303, "CCC", 30)])
  ];
  let candidateIndex = 0;
  const callbacks = bridge.getRecorderCallbacks();
  const recorder = createRecorder({
    collectCandidate: async () => candidates[candidateIndex++],
    acceptUniverse: callbacks.acceptUniverse,
    onCycle: callbacks.onCycle,
    onFailure: callbacks.onFailure,
    schedule: recorderScheduler.schedule,
    cancelSchedule: recorderScheduler.cancelSchedule,
    now: () => now
  });

  try {
    const usConfig = createUsRecorderConfig({ snapshotIntervalMs: 10 });
    assert.deepEqual(createRecorderConfig(usConfig), { snapshotIntervalMs: 10 });

    await bridge.startSession(usConfig);
    const sessionStart = sentMessages.find((message) => message.type === "producer.session.start");
    assert.deepEqual(sessionStart.payload.config, { snapshotIntervalMs: 10 });

    const firstHeartbeat = heartbeatTasks.find((task) => !task.cancelled);
    assert.ok(firstHeartbeat);
    now = 10010;
    await firstHeartbeat.callback();

    recorder.start(usConfig);
    now = 10100;
    await recorderScheduler.runNext();
    now = 10200;
    await recorderScheduler.runNext();
    now = 10300;
    await recorderScheduler.runNext();
    recorder.stop("proof-complete");

    assert.equal(recorder.getState().completedCycles, 3);
    assert.equal(recorder.getState().failedCycles, 0);

    const universeMessages = sentMessages.filter(
      (message) => message.type === "producer.universe.replace"
    );
    assert.equal(universeMessages.length, 2);
    assert.deepEqual(Object.keys(universeMessages[0].payload).sort(), [
      "loadedAtMs",
      "recordCount",
      "securities"
    ]);
    assert.equal(universeMessages[0].payload.securities[0].rawSource.PaperId, 101);

    const commitMessages = sentMessages.filter(
      (message) => message.type === "producer.cycle.commit"
    );
    assert.deepEqual(commitMessages.map((message) => message.payload.universeRevision), [1, 1, 2]);

    const persistedConfig = await fixture.rows(
      "SELECT config_json FROM sessions ORDER BY started_at_ms DESC LIMIT 1"
    );
    assert.deepEqual(JSON.parse(persistedConfig[0].config_json), {
      snapshotIntervalMs: 10
    });

    const cycles = await fixture.rows(
      `SELECT cycle_id, universe_revision, status
       FROM cycles WHERE status = 'complete' ORDER BY cycle_id`
    );
    assert.deepEqual(cycles, [
      { cycle_id: "1", universe_revision: "1", status: "complete" },
      { cycle_id: "2", universe_revision: "1", status: "complete" },
      { cycle_id: "3", universe_revision: "2", status: "complete" }
    ]);

    now = 10400;
    const failed = await bridge.reportFailedCycle({
      phase: "provider-fetch",
      startedAtMs: 5000,
      failedAtMs: 5050,
      requested: 2,
      received: null,
      unique: null,
      missing: null,
      duplicates: null,
      unexpected: null,
      error: { name: "ProviderFetchError", message: "synthetic failure" }
    });
    assert.deepEqual(failed, { cycleId: 4 });

    const sessionState = await fixture.rows(
      `SELECT completed_cycles, failed_cycles, last_heartbeat_at_ms
       FROM sessions ORDER BY started_at_ms DESC LIMIT 1`
    );
    assert.deepEqual(sessionState, [{
      completed_cycles: "3",
      failed_cycles: "1",
      last_heartbeat_at_ms: "10010"
    }]);

    await bridge.stopSession("test-complete");
  } finally {
    recorder.stop("cleanup");
    await fixture.cleanup();
  }
});
