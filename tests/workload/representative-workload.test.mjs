import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { WebSocket } from "ws";
import {
  buildUsCollectionCandidate,
  buildUsCompleteCycle
} from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

const ORIGIN = "http://127.0.0.1:19014";
const UNIVERSE_SIZE = 4096;
const CYCLE_COUNT = 180;
const CYCLE_SPACING_MS = 3_000;
const EXPECTED_HISTORY_ROWS = UNIVERSE_SIZE * CYCLE_COUNT;
const READ_INTERVAL_CYCLES = 60;
const REPORT_PATH = process.env.MARKET_FLOW_US_WORKLOAD_REPORT
  ?? path.resolve("test-results/workload/representative-workload.json");
const SYNTHETIC_EPOCH_MS = Date.UTC(2026, 9, 5, 0, 0, 0);
const SECURITY_IDS = Object.freeze(
  Array.from({ length: UNIVERSE_SIZE }, (_, index) => String(1_000_000 + index))
);
const MEMBERSHIP = Object.freeze([...SECURITY_IDS]);

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
  return SECURITY_IDS[index];
}

function priceFor(index, cycleNumber) {
  return 100 + index + cycleNumber;
}

function rawSecurity(index, cycleNumber, tradeDateTime) {
  const paperId = 1_000_000 + index;
  const price = priceFor(index, cycleNumber);
  const symbol = `US${String(index).padStart(4, "0")}`;

  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `Synthetic US Security ${String(index).padStart(4, "0")}`,
    PaperNameHeb: null,
    ExchangeName: index % 2 === 0 ? "NASDAQ" : "NYSE",
    TradeDateTime: tradeDateTime,
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: (index % 25) + (cycleNumber / 1000),
    DailyHigh: price + 2,
    DailyLow: price - 2,
    YearHigh: price + 25,
    YearLow: price - 25,
    DailyVolume: (cycleNumber * 100_000) + index,
    BeginYearChangePercent: (index % 17) / 10,
    Month12ChangePercent: (index % 23) / 10,
    Month36ChangePercent: (index % 31) / 10,
    AskRate: price + 0.05,
    BidRate: price - 0.05,
    YesterdayRate: price - 1,
    PaperMarketCap: 1_000_000 + (index * 10_000),
    PaperIdYatab: paperId + 500_000,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: index % 7 === 0 ? null : index % 5,
    ESGScope: index % 3
  };
}

function createSnapshot(cycleNumber) {
  const completedAtMs = 10_000 + (cycleNumber * CYCLE_SPACING_MS);
  const startedAtMs = completedAtMs - 100;
  const tradeDateTime = new Date(
    SYNTHETIC_EPOCH_MS + (cycleNumber * CYCLE_SPACING_MS)
  ).toISOString();
  const records = Array.from(
    { length: UNIVERSE_SIZE },
    (_, index) => rawSecurity(index, cycleNumber, tradeDateTime)
  );

  return {
    recordCount: UNIVERSE_SIZE,
    records,
    responseIds: SECURITY_IDS,
    membership: MEMBERSHIP,
    timing: {
      startedAtMs,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: completedAtMs - startedAtMs
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: "synthetic-workload",
      cycleNumber
    },
    httpStatus: 200
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
      productVersion: "market-flow-us-workload"
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
    serviceVersion: "market-flow-us-workload-proof",
    openDatabase: openMarketFlowUsDatabase
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
  assert.equal(data.rows[0].Price, priceFor(0, expectedCycle));
  assert.equal(
    data.rows.at(-1).Price,
    priceFor(UNIVERSE_SIZE - 1, expectedCycle)
  );
}

function assertHistoryPage(response, expectedCycle) {
  const data = assertOk(response, "History read");
  assert.equal(data.rows.length, expectedCycle);
  assert.equal(data.rows[0].cycleId, expectedCycle);
  assert.equal(data.rows[0].Price, priceFor(0, expectedCycle));
  assert.equal(data.hasMore, false);
  assert.equal(data.nextCursor, null);
  return data;
}

const GENERAL_SCANNER_QUERIES = Object.freeze({
  join: `
    SELECT l.security_id, u.PaperNameEng, l.Price
    FROM latest AS l
    JOIN universe AS u ON u.security_id = l.security_id
    WHERE u.is_current = true
    ORDER BY l.security_id
    LIMIT 10
  `,
  groupHaving: `
    SELECT security_id, COUNT(*) AS samples, MAX(Price) AS peak
    FROM history
    GROUP BY security_id
    HAVING COUNT(*) >= 5
    ORDER BY security_id
    LIMIT 10
  `,
  windowRank: `
    SELECT
      security_id,
      DailyVolume,
      RANK() OVER (
        ORDER BY DailyVolume DESC, security_id ASC
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

function stagedScannerSql() {
  const query = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.find(
    (candidate) => candidate.queryId === "builtin:staged-candidate-ranking"
  );
  assert.ok(query, "Market Flow US staged Scanner built-in is missing");
  return query.sql;
}

function assertGeneralScanner(response, name, expectedCycle) {
  const data = assertOk(response, `Scanner ${name}`);
  assert.equal(data.rowCount, 10, `Scanner ${name} row count`);

  if (name === "join") {
    assert.deepEqual(data.rows[0].slice(0, 2), [
      securityId(0),
      "Synthetic US Security 0000"
    ]);
    assert.equal(data.rows[0][2], priceFor(0, expectedCycle));
  } else if (name === "groupHaving") {
    assert.deepEqual(data.rows[0].slice(0, 2), [
      securityId(0),
      String(expectedCycle)
    ]);
  } else if (name === "windowRank") {
    assert.deepEqual(data.rows[0], [
      securityId(UNIVERSE_SIZE - 1),
      (expectedCycle * 100_000) + (UNIVERSE_SIZE - 1),
      "1"
    ]);
  } else if (name === "timePredicate") {
    assert.equal(data.rows[0][0], securityId(0));
    assert.ok(Number(data.rows[0][1]) > 0);
    assert.ok(Number(data.rows[0][1]) <= expectedCycle);
  }
}

function assertStagedScanner(response) {
  const data = assertOk(response, "Scanner staged candidate");
  assert.equal(data.rowCount, 100, "staged candidate row count");

  const columnNames = data.columns.map((column) => column.name);
  const securityIdIndex = columnNames.indexOf("securityId");
  const stageIndex = columnNames.indexOf("stage_reached");
  assert.ok(securityIdIndex >= 0, "staged candidate must expose securityId");
  assert.ok(stageIndex >= 0, "staged candidate must expose stage_reached");

  for (const row of data.rows) {
    assert.match(String(row[securityIdIndex]), /^\d+$/u);
    assert.equal(Number(row[stageIndex]), 7);
  }
}

async function runReadSample({
  viewer,
  cycleNumber,
  metrics,
  includeStaged = false
}) {
  const current = await measure(metrics.currentReadMs, () =>
    viewer.request("viewer.current.get"));
  assertCurrent(current, cycleNumber);

  const history = await measure(metrics.historyPageMs, () =>
    viewer.request("viewer.history.page", {
      securityId: securityId(0),
      cursor: null
    }));
  assertHistoryPage(history, cycleNumber);

  for (const [name, sql] of Object.entries(GENERAL_SCANNER_QUERIES)) {
    const response = await measure(metrics.generalScannerMs[name], () =>
      viewer.request("scanner.execute", { sql }));
    assertGeneralScanner(response, name, cycleNumber);
  }

  if (includeStaged) {
    const response = await measure(metrics.stagedScannerMs, () =>
      viewer.request("scanner.execute", { sql: stagedScannerSql() }));
    assertStagedScanner(response);
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
    schemaVersion: 2,
    scenario: {
      universeSize: UNIVERSE_SIZE,
      cycles: CYCLE_COUNT,
      expectedHistoryRows: EXPECTED_HISTORY_ROWS,
      cycleSpacingMs: CYCLE_SPACING_MS,
      readIntervalCycles: READ_INTERVAL_CYCLES,
      stagedAgesSeconds: [10, 20, 30, 45, 60, 90, 120]
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

function sanitizedFailure(error, tempDir) {
  const rawMessage = typeof error?.message === "string"
    ? error.message
    : "Representative workload failed.";
  return {
    name: typeof error?.name === "string" ? error.name : "Error",
    message: rawMessage.replaceAll(tempDir, "<temp>").slice(0, 500)
  };
}

test("representative 4096-security/180-cycle U.S. workload remains correct across reads, Scanner and restart", { timeout: 40 * 60 * 1000 }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-workload-"));
  const dbPath = path.join(tempDir, "representative-us.duckdb");
  const report = createInitialReport();
  const metrics = {
    commitMs: [],
    currentReadMs: [],
    historyPageMs: [],
    generalScannerMs: Object.fromEntries(
      Object.keys(GENERAL_SCANNER_QUERIES).map((name) => [name, []])
    ),
    stagedScannerMs: []
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
        snapshotIntervalMs: CYCLE_SPACING_MS
      }
    }), "Producer session start");

    const firstSnapshot = createSnapshot(1);
    const firstCandidate = buildUsCollectionCandidate(firstSnapshot);
    const replaced = assertOk(
      await producer.request("producer.universe.replace", {
        loadedAtMs: firstCandidate.universe.loadedAtMs,
        recordCount: firstCandidate.universe.recordCount,
        securities: firstCandidate.universe.securities
      }),
      "Universe replace"
    );
    assert.equal(replaced.recordCount, UNIVERSE_SIZE);
    assert.equal(replaced.universeRevision, 1);

    for (let cycleNumber = 1; cycleNumber <= CYCLE_COUNT; cycleNumber += 1) {
      const cycle = cycleNumber === 1
        ? firstCandidate.cycle
        : buildUsCompleteCycle({ snapshot: createSnapshot(cycleNumber) });
      const committed = await measure(metrics.commitMs, () =>
        producer.request("producer.cycle.commit", {
          universeRevision: replaced.universeRevision,
          cycle
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
          includeStaged: cycleNumber === CYCLE_COUNT
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
      stoppedAtMs: 10_000 + (CYCLE_COUNT * CYCLE_SPACING_MS) + 1_000,
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
      includeStaged: true
    });

    const afterRestartCounts = await durableCounts(viewer);
    assert.deepEqual(afterRestartCounts, beforeRestartCounts);

    report.counts = afterRestartCounts;
    report.latencyMs = {
      commit: distribution(metrics.commitMs),
      current: distribution(metrics.currentReadMs),
      historyPage: distribution(metrics.historyPageMs),
      scanner: {
        general: {
          overall: distribution(Object.values(metrics.generalScannerMs).flat()),
          byQuery: Object.fromEntries(
            Object.entries(metrics.generalScannerMs)
              .map(([name, samples]) => [name, distribution(samples)])
          )
        },
        stagedCandidate: distribution(metrics.stagedScannerMs)
      }
    };
    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = sanitizedFailure(error, tempDir);
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
