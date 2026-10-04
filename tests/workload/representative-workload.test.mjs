import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { WebSocket } from "ws";
import { startMarketScopeService } from "../../local-service/server/service.js";

const ORIGIN = "http://127.0.0.1:19014";
const UNIVERSE_SIZE = 561;
const CYCLE_COUNT = 600;
const CHUNK_SIZE = 187;
const EXPECTED_HISTORY_ROWS = UNIVERSE_SIZE * CYCLE_COUNT;
const READ_INTERVAL_CYCLES = 50;
const REPORT_PATH = process.env.MARKETSCOPE_WORKLOAD_REPORT
  ?? path.resolve("test-results/workload/representative-workload.json");

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1)
  );
  return sorted[index];
}

function distribution(samples) {
  if (samples.length === 0) {
    return {
      samples: 0,
      minMs: null,
      medianMs: null,
      p95Ms: null,
      maxMs: null
    };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    minMs: roundMs(sorted[0]),
    medianMs: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95)),
    maxMs: roundMs(sorted.at(-1))
  };
}

async function measure(samples, operation) {
  const started = performance.now();
  const result = await operation();
  samples.push(performance.now() - started);
  return result;
}

function securityId(index) {
  return String(100000 + index);
}

function createUniverse() {
  return {
    loadedAtMs: 1_000,
    recordCount: UNIVERSE_SIZE,
    securities: Array.from({ length: UNIVERSE_SIZE }, (_, index) => ({
      securityId: securityId(index),
      paperName: `Security ${String(index).padStart(3, "0")}`,
      mapHeatDateChange: {
        synthetic: true,
        index
      },
      rawMapHeat: {
        PaperId: 100000 + index,
        PaperName: `Security ${String(index).padStart(3, "0")}`,
        DateChange: 0
      }
    }))
  };
}

function createCycle(cycleNumber) {
  const startedAtMs = 10_000 + (cycleNumber * 3_000);
  const chunks = Array.from({ length: UNIVERSE_SIZE / CHUNK_SIZE }, (_, chunkIndex) => {
    const requestStartedAtMs = startedAtMs + (chunkIndex * 100);
    const receivedAtMs = requestStartedAtMs + 80;
    const completedAtMs = requestStartedAtMs + 90;

    return {
      chunkIndex,
      requested: CHUNK_SIZE,
      received: CHUNK_SIZE,
      unique: CHUNK_SIZE,
      requestStartedAtMs,
      receivedAtMs,
      completedAtMs,
      durationMs: completedAtMs - requestStartedAtMs,
      serverAsOfDate: `synthetic-cycle-${cycleNumber}`,
      httpStatus: 200
    };
  });
  const completedAtMs = chunks.at(-1).completedAtMs;

  return {
    status: "complete",
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    requested: UNIVERSE_SIZE,
    received: UNIVERSE_SIZE,
    unique: UNIVERSE_SIZE,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks,
    securities: Array.from({ length: UNIVERSE_SIZE }, (_, index) => {
      const chunkIndex = Math.floor(index / CHUNK_SIZE);
      const chunk = chunks[chunkIndex];
      const rate = 1_000 + index + (cycleNumber / 100);

      return {
        securityId: securityId(index),
        chunkIndex,
        chunkReceivedAtMs: chunk.receivedAtMs,
        collectedAtMs: chunk.completedAtMs,
        serverAsOfDate: chunk.serverAsOfDate,
        data: {
          Key: 100000 + index,
          LastKnownRate: rate,
          BaseRateChangePercentage: ((cycleNumber % 21) - 10) / 10 + ((index % 5) / 100),
          BuyLimit1: rate - 1,
          BuyVolume1: (index + 1) * 10,
          SellLimit1: rate + 1,
          SellVolume1: (index + 1) * 11,
          DailyDealsQuantity: (cycleNumber * 1_000) + index,
          LastDealVolume: (index % 50) + 1,
          DailyTurnover: (cycleNumber * 10_000) + (index * 100),
          DailyNISRevenue: (cycleNumber * 20_000) + (index * 200),
          DailyLowestRate: rate - 5,
          DailyHighestRate: rate + 5,
          LastDealTimeOnly: `10:${String(cycleNumber % 60).padStart(2, "0")}`
        }
      };
    })
  };
}

async function openClient({ url, role, clientInstanceId }) {
  const socket = new WebSocket(url, { origin: ORIGIN });
  await once(socket, "open");

  let sequence = 0;

  async function send(message) {
    const response = once(socket, "message");
    socket.send(JSON.stringify(message));
    const [data] = await response;
    return JSON.parse(data.toString());
  }

  const hello = await send({
    v: 1,
    type: "client.hello",
    requestId: `hello-${clientInstanceId}`,
    payload: {
      role,
      clientInstanceId,
      productVersion: "workload-client"
    }
  });
  assert.equal(hello.type, "response.ok", "workload client hello failed");

  return {
    async request(type, payload = {}) {
      sequence += 1;
      return await send({
        v: 1,
        type,
        requestId: `${clientInstanceId}-${sequence}`,
        payload
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.close();
      await closed;
    }
  };
}

function serviceConfig(dbPath) {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath,
    maxInboundMessageBytes: 16 * 1024 * 1024,
    producerHeartbeatMs: 5_000,
    producerStaleAfterMs: 15_000,
    historyPageSize: 500,
    allowedOrigins: [ORIGIN]
  };
}

async function startService(dbPath) {
  const service = await startMarketScopeService({
    config: serviceConfig(dbPath),
    serviceVersion: "workload-proof"
  });

  return {
    service,
    url: `ws://127.0.0.1:${service.port}`
  };
}

function assertOk(response, label) {
  assert.equal(
    response.type,
    "response.ok",
    `${label} failed with ${response?.payload?.code ?? "unknown error"}`
  );
  return response.payload.data;
}

function assertCurrent(current, expectedCycle) {
  const data = assertOk(current, "Current read");
  assert.equal(data.summary.rowCount, UNIVERSE_SIZE);
  assert.equal(data.summary.lastCycleId, expectedCycle);
  assert.equal(data.rows.length, UNIVERSE_SIZE);
  assert.equal(data.rows[0].securityId, securityId(0));
  assert.equal(data.rows.at(-1).securityId, securityId(UNIVERSE_SIZE - 1));
  assert.equal(data.rows[0].LastKnownRate, 1_000 + (expectedCycle / 100));
  assert.equal(
    data.rows.at(-1).LastKnownRate,
    1_000 + (UNIVERSE_SIZE - 1) + (expectedCycle / 100)
  );
}

function assertHistoryPage(response, expectedCycle) {
  const data = assertOk(response, "History read");
  assert.equal(data.rows.length, Math.min(expectedCycle, 500));
  assert.equal(data.rows[0].cycleId, expectedCycle);
  assert.equal(data.rows[0].LastKnownRate, 1_000 + (expectedCycle / 100));
  assert.equal(data.hasMore, expectedCycle > 500);
  return data;
}

const SCANNER_QUERIES = Object.freeze({
  join: `
    SELECT l.security_id, u.paper_name, l.LastKnownRate
    FROM latest AS l
    JOIN universe AS u ON u.security_id = l.security_id
    ORDER BY l.security_id
    LIMIT 10
  `,
  groupHaving: `
    SELECT security_id, COUNT(*) AS samples, MAX(LastKnownRate) AS peak
    FROM history
    GROUP BY security_id
    HAVING COUNT(*) >= 5
    ORDER BY security_id
    LIMIT 10
  `,
  windowRank: `
    SELECT
      security_id,
      DailyDealsQuantity,
      RANK() OVER (
        ORDER BY DailyDealsQuantity DESC, security_id ASC
      ) AS activity_rank
    FROM latest
    ORDER BY activity_rank, security_id
    LIMIT 10
  `,
  timePredicate: `
    WITH latest_time AS (
      SELECT MAX(collected_at_ms) AS max_collected_at_ms
      FROM history
    )
    SELECT h.security_id, COUNT(*) AS recent_samples
    FROM history AS h
    CROSS JOIN latest_time AS t
    WHERE h.collected_at_ms >= t.max_collected_at_ms - 150000
    GROUP BY h.security_id
    HAVING COUNT(*) > 0
    ORDER BY h.security_id
    LIMIT 10
  `
});

function assertScanner(response, name, expectedCycle) {
  const data = assertOk(response, `Scanner ${name}`);
  assert.equal(data.rowCount, 10, `Scanner ${name} row count`);

  if (name === "join") {
    assert.deepEqual(data.rows[0].slice(0, 2), [securityId(0), "Security 000"]);
    assert.equal(data.rows[0][2], 1_000 + (expectedCycle / 100));
  } else if (name === "groupHaving") {
    assert.deepEqual(data.rows[0].slice(0, 2), [securityId(0), String(expectedCycle)]);
  } else if (name === "windowRank") {
    assert.deepEqual(data.rows[0], [
      securityId(UNIVERSE_SIZE - 1),
      (expectedCycle * 1_000) + (UNIVERSE_SIZE - 1),
      "1"
    ]);
  } else if (name === "timePredicate") {
    assert.equal(data.rows[0][0], securityId(0));
    assert.ok(Number(data.rows[0][1]) > 0);
    assert.ok(Number(data.rows[0][1]) <= expectedCycle);
  }
}

async function runReadSample({
  viewer,
  cycleNumber,
  metrics,
  requireContinuation = false
}) {
  const current = await measure(metrics.currentReadMs, () =>
    viewer.request("viewer.current.get"));
  assertCurrent(current, cycleNumber);

  const firstHistory = await measure(metrics.historyPageMs, () =>
    viewer.request("viewer.history.page", {
      securityId: securityId(0),
      cursor: null
    }));
  const firstPage = assertHistoryPage(firstHistory, cycleNumber);

  if (requireContinuation) {
    assert.ok(firstPage.nextCursor, "expected history continuation cursor");
    const continuation = await measure(metrics.historyPageMs, () =>
      viewer.request("viewer.history.page", {
        securityId: securityId(0),
        cursor: firstPage.nextCursor
      }));
    const continuationData = assertOk(continuation, "History continuation read");
    assert.equal(
      continuationData.rows.length,
      cycleNumber - 500,
      "history continuation should contain the remaining representative rows"
    );
    assert.equal(continuationData.hasMore, false);
    assert.equal(continuationData.nextCursor, null);

    const cycleIds = [
      ...firstPage.rows.map((row) => row.cycleId),
      ...continuationData.rows.map((row) => row.cycleId)
    ];
    assert.equal(cycleIds.length, cycleNumber);
    assert.equal(new Set(cycleIds).size, cycleNumber);
  }

  for (const [name, sql] of Object.entries(SCANNER_QUERIES)) {
    const response = await measure(metrics.scannerMs[name], () =>
      viewer.request("scanner.execute", { sql }));
    assertScanner(response, name, cycleNumber);
  }
}

async function durableCounts(viewer) {
  const status = assertOk(
    await viewer.request("viewer.status.get"),
    "Status read"
  );

  return {
    completedCycles: status.completedCycles,
    failedCycles: status.failedCycles,
    latestCount: status.latestCount,
    historyCount: status.historyCount,
    lastCompletedCycleId: status.lastCompletedCycleId
  };
}

function createInitialReport() {
  return {
    schemaVersion: 1,
    scenario: {
      universeSize: UNIVERSE_SIZE,
      cycles: CYCLE_COUNT,
      expectedHistoryRows: EXPECTED_HISTORY_ROWS,
      chunkSize: CHUNK_SIZE,
      readIntervalCycles: READ_INTERVAL_CYCLES
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    result: "running",
    counts: null,
    dbFileBytes: null,
    latencyMs: null,
    restartToReadyMs: null,
    error: null
  };
}

test("representative 561-security/600-cycle workload remains correct across reads, Scanner and restart", { timeout: 30 * 60 * 1000 }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-workload-"));
  const dbPath = path.join(tempDir, "representative.duckdb");
  const report = createInitialReport();
  const metrics = {
    commitMs: [],
    currentReadMs: [],
    historyPageMs: [],
    scannerMs: Object.fromEntries(
      Object.keys(SCANNER_QUERIES).map((name) => [name, []])
    )
  };

  let service = null;
  let producer = null;
  let viewer = null;
  let failure = null;

  try {
    ({ service } = await startService(dbPath));
    const url = `ws://127.0.0.1:${service.port}`;

    producer = await openClient({
      url,
      role: "producer",
      clientInstanceId: "workload-producer"
    });
    viewer = await openClient({
      url,
      role: "viewer",
      clientInstanceId: "workload-viewer"
    });

    assertOk(await producer.request("producer.session.start", {
      startedAtMs: 2_000,
      config: {
        snapshotIntervalMs: 3_000,
        chunkDelayMs: 1_000,
        chunkSize: CHUNK_SIZE,
        refreshUniverseEveryCycle: false
      }
    }), "Producer session start");

    const replaced = assertOk(
      await producer.request("producer.universe.replace", createUniverse()),
      "Universe replace"
    );
    assert.equal(replaced.recordCount, UNIVERSE_SIZE);
    assert.equal(replaced.universeRevision, 1);

    for (let cycleNumber = 1; cycleNumber <= CYCLE_COUNT; cycleNumber += 1) {
      const committed = await measure(metrics.commitMs, () =>
        producer.request("producer.cycle.commit", {
          universeRevision: replaced.universeRevision,
          cycle: createCycle(cycleNumber)
        }));
      const commitData = assertOk(committed, `Cycle ${cycleNumber} commit`);
      assert.equal(commitData.cycleId, cycleNumber);

      assertOk(
        await producer.request("producer.heartbeat", {
          atMs: Date.now()
        }),
        `Cycle ${cycleNumber} heartbeat`
      );

      if (cycleNumber % READ_INTERVAL_CYCLES === 0) {
        await runReadSample({
          viewer,
          cycleNumber,
          metrics,
          requireContinuation: cycleNumber === 550 || cycleNumber === 600
        });
      }
    }

    const beforeRestartCounts = await durableCounts(viewer);
    assert.deepEqual(beforeRestartCounts, {
      completedCycles: CYCLE_COUNT,
      failedCycles: 0,
      latestCount: UNIVERSE_SIZE,
      historyCount: EXPECTED_HISTORY_ROWS,
      lastCompletedCycleId: CYCLE_COUNT
    });

    assertOk(await producer.request("producer.session.stop", {
      stoppedAtMs: 10_000 + (CYCLE_COUNT * 3_000) + 1_000,
      reason: "workload-complete"
    }), "Producer session stop");

    await producer.close();
    producer = null;
    await viewer.close();
    viewer = null;
    await service.close();
    service = null;

    report.dbFileBytes = (await stat(dbPath)).size;

    const restartStarted = performance.now();
    ({ service } = await startService(dbPath));
    report.restartToReadyMs = roundMs(performance.now() - restartStarted);

    viewer = await openClient({
      url: `ws://127.0.0.1:${service.port}`,
      role: "viewer",
      clientInstanceId: "workload-viewer-restart"
    });

    await runReadSample({
      viewer,
      cycleNumber: CYCLE_COUNT,
      metrics,
      requireContinuation: true
    });

    const afterRestartCounts = await durableCounts(viewer);
    assert.deepEqual(afterRestartCounts, beforeRestartCounts);

    report.counts = afterRestartCounts;
    report.latencyMs = {
      commit: distribution(metrics.commitMs),
      current: distribution(metrics.currentReadMs),
      historyPage: distribution(metrics.historyPageMs),
      scanner: {
        overall: distribution(Object.values(metrics.scannerMs).flat()),
        byQuery: Object.fromEntries(
          Object.entries(metrics.scannerMs)
            .map(([name, samples]) => [name, distribution(samples)])
        )
      }
    };
    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = {
      name: typeof error?.name === "string" ? error.name : "Error",
      message: typeof error?.message === "string"
        ? error.message.slice(0, 500)
        : "Representative workload failed."
    };
  } finally {
    try {
      await producer?.close();
    } catch {
      // Preserve the original workload result.
    }
    try {
      await viewer?.close();
    } catch {
      // Preserve the original workload result.
    }
    try {
      await service?.close();
    } catch {
      // Preserve the original workload result.
    }

    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(
      REPORT_PATH,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    await rm(tempDir, { recursive: true, force: true });
  }

  if (failure) throw failure;
});
