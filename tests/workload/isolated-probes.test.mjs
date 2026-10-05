import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { buildUsCompleteCycle } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createSerializedWriter } from "../../local-service/database/writer.js";
import {
  MARKET_FLOW_US_CYCLE_ADAPTER,
  createCycleAuthorityPersistence
} from "../../local-service/persistence/cycle-authority.js";
import { createViewerReads } from "../../local-service/reads/viewer-reads.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";
import { createUsSyntheticGenerator } from "../fake-market/us-synthetic.mjs";
import {
  GENERAL_SCANNER_QUERIES,
  SYNTHETIC_EPOCH_MS,
  distribution,
  measure,
  resolveIsolatedProfile,
  roundMs,
  sanitizedFailure,
  stagedScannerSql,
  workloadMode
} from "./us-workload-support.mjs";

const REPORT_PATH = process.env.MARKET_FLOW_US_ISOLATED_REPORT
  ?? path.resolve("test-results/workload/isolated-probes.json");
const FIRST_PAPER_ID = 1000000;

function assertSafeProfile(profile) {
  for (const [name, value] of Object.entries({
    universeSize: profile.universeSize,
    cycleCount: profile.cycleCount,
    cadenceMs: profile.cadenceMs,
    persistenceUniverseSize: profile.persistenceUniverseSize,
    persistenceCycles: profile.persistenceCycles,
    widthUniverseSize: profile.widthUniverseSize
  })) {
    assert.ok(Number.isSafeInteger(value) && value > 0, `${name} must be a positive safe integer`);
  }
}

async function seedPersistenceAuthority(connection, universeSize, cadenceMs) {
  const lastSeenAtMs = SYNTHETIC_EPOCH_MS + cadenceMs;
  await connection.run(`
    INSERT INTO sessions VALUES (
      'isolated-persistence',
      'isolated-persistence-producer',
      'running',
      ${SYNTHETIC_EPOCH_MS},
      NULL,
      NULL,
      ${SYNTHETIC_EPOCH_MS},
      0,
      0,
      NULL,
      NULL,
      CAST('{"snapshotIntervalMs":${cadenceMs}}' AS JSON),
      NULL
    )
  `);
  await connection.run(`
    INSERT INTO universe
    SELECT
      CAST(${FIRST_PAPER_ID} + idx AS VARCHAR) AS security_id,
      true AS is_current,
      1 AS universe_revision,
      ${SYNTHETIC_EPOCH_MS} AS first_seen_at_ms,
      ${lastSeenAtMs} AS last_seen_at_ms,
      'US' || lpad(CAST(idx AS VARCHAR), 4, '0') AS Symbol,
      'Synthetic US Security ' || lpad(CAST(idx AS VARCHAR), 4, '0') AS PaperNameEng,
      NULL AS PaperNameHeb,
      CASE WHEN idx % 2 = 0 THEN 'NASDAQ' ELSE 'NYSE' END AS ExchangeName,
      CAST('{}' AS JSON) AS raw_source
    FROM range(0, ${universeSize}) AS securities(idx)
  `);
}

async function runPersistenceProbe(profile, tempDir, {
  universeSize = profile.persistenceUniverseSize,
  cycles = profile.persistenceCycles,
  dbName = "isolated-persistence.duckdb"
} = {}) {
  const dbPath = path.join(tempDir, dbName);
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "market-flow-us-isolated-persistence"
  });
  const writer = createSerializedWriter(database.writerConnection);
  const persistence = createCycleAuthorityPersistence({
    writer,
    now: () => Date.now(),
    cycleAdapter: MARKET_FLOW_US_CYCLE_ADAPTER
  });
  const generator = createUsSyntheticGenerator({
    universeSize,
    cycleCount: cycles,
    cadenceMs: profile.cadenceMs,
    firstPaperId: FIRST_PAPER_ID,
    epochMs: SYNTHETIC_EPOCH_MS,
    dataPattern: "moving"
  });
  const commitMs = [];

  try {
    await seedPersistenceAuthority(
      database.writerConnection,
      universeSize,
      profile.cadenceMs
    );

    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      const completeCycle = buildUsCompleteCycle({ snapshot: generator.snapshot(cycle) });
      const result = await measure(commitMs, () => persistence.commitCycle({
        sessionId: "isolated-persistence",
        universeRevision: 1,
        cycle: completeCycle
      }));
      assert.equal(result.cycleId, cycle);
    }

    const reader = await database.writerConnection.runAndReadAll(`
      SELECT
        (SELECT COUNT(*) FROM history) AS historyCount,
        (SELECT COUNT(*) FROM latest) AS latestCount,
        (SELECT COUNT(*) FROM cycles WHERE status = 'complete') AS completedCycles
    `);
    const [counts] = reader.getRowObjectsJson();
    assert.equal(Number(counts.historyCount), universeSize * cycles);
    assert.equal(Number(counts.latestCount), universeSize);
    assert.equal(Number(counts.completedCycles), cycles);

    return {
      universeSize,
      cycles,
      historyRows: universeSize * cycles,
      commitLatencyMs: distribution(commitMs),
      dbFileBytes: (await stat(dbPath)).size
    };
  } finally {
    await writer.drain();
    await database.close();
  }
}

async function seedReadScannerAuthority(connection, profile) {
  const { universeSize, cycleCount, cadenceMs } = profile;
  const lastCollectedAtMs = SYNTHETIC_EPOCH_MS + (cycleCount * cadenceMs);

  await connection.run(`
    INSERT INTO sessions VALUES (
      'isolated-read',
      'isolated-read-producer',
      'stopped',
      ${SYNTHETIC_EPOCH_MS},
      ${lastCollectedAtMs + 1000},
      'isolated-seed-complete',
      ${lastCollectedAtMs},
      ${cycleCount},
      0,
      ${cycleCount},
      ${lastCollectedAtMs},
      CAST('{"snapshotIntervalMs":${cadenceMs}}' AS JSON),
      NULL
    )
  `);

  await connection.run(`
    INSERT INTO universe
    SELECT
      CAST(${FIRST_PAPER_ID} + idx AS VARCHAR),
      true,
      1,
      ${SYNTHETIC_EPOCH_MS},
      ${lastCollectedAtMs},
      'US' || lpad(CAST(idx AS VARCHAR), 4, '0'),
      'Synthetic US Security ' || lpad(CAST(idx AS VARCHAR), 4, '0'),
      NULL,
      CASE WHEN idx % 2 = 0 THEN 'NASDAQ' ELSE 'NYSE' END,
      CAST('{}' AS JSON)
    FROM range(0, ${universeSize}) AS securities(idx)
  `);

  await connection.run(`
    INSERT INTO cycles
    SELECT
      cycle_id,
      'isolated-read',
      1,
      'complete',
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) - 100,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}),
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) + 1,
      100,
      ${universeSize},
      ${universeSize},
      ${universeSize},
      0,
      0,
      0,
      1,
      CAST('[]' AS JSON),
      NULL,
      NULL
    FROM range(1, ${cycleCount + 1}) AS cycles(cycle_id)
  `);

  await connection.run(`
    INSERT INTO history (
      cycle_id,
      session_id,
      universe_revision,
      security_id,
      chunk_index,
      cycle_started_at_ms,
      chunk_received_at_ms,
      collected_at_ms,
      source_metadata_json,
      Symbol,
      PaperNameEng,
      PaperNameHeb,
      ExchangeName,
      TradeDateTime,
      CountryName,
      CountryNameEng,
      Price,
      ChangePercent,
      DailyHigh,
      DailyLow,
      YearHigh,
      YearLow,
      DailyVolume,
      BeginYearChangePercent,
      Month12ChangePercent,
      Month36ChangePercent,
      AskRate,
      BidRate,
      YesterdayRate,
      PaperMarketCap,
      PaperIdYatab,
      CountryId,
      PaperType,
      ESGRatingId,
      ESGScope,
      raw_data
    )
    SELECT
      cycle_id,
      'isolated-read',
      1,
      CAST(${FIRST_PAPER_ID} + idx AS VARCHAR),
      0,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) - 100,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) - 10,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}),
      CAST('{"source":"isolated-day-seed"}' AS JSON),
      'US' || lpad(CAST(idx AS VARCHAR), 4, '0'),
      'Synthetic US Security ' || lpad(CAST(idx AS VARCHAR), 4, '0'),
      NULL,
      CASE WHEN idx % 2 = 0 THEN 'NASDAQ' ELSE 'NYSE' END,
      NULL,
      'United States',
      'United States',
      100 + idx + cycle_id,
      (idx % 25) + (cycle_id / 1000.0),
      102 + idx + cycle_id,
      98 + idx + cycle_id,
      125 + idx + cycle_id,
      75 + idx + cycle_id,
      (cycle_id * 100000) + idx,
      (idx % 17) / 10.0,
      (idx % 23) / 10.0,
      (idx % 31) / 10.0,
      100.05 + idx + cycle_id,
      99.95 + idx + cycle_id,
      99 + idx + cycle_id,
      1000000 + (idx * 10000),
      ${FIRST_PAPER_ID + 500000} + idx,
      2,
      1,
      CASE WHEN idx % 7 = 0 THEN NULL ELSE idx % 5 END,
      idx % 3,
      CAST('{}' AS JSON)
    FROM range(1, ${cycleCount + 1}) AS cycles(cycle_id)
    CROSS JOIN range(0, ${universeSize}) AS securities(idx)
  `);

  await connection.run(`
    INSERT INTO latest
    SELECT * FROM history WHERE cycle_id = ${cycleCount}
  `);
}

async function runReadScannerProbe(profile, tempDir) {
  const dbPath = path.join(tempDir, "isolated-read-scanner.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "market-flow-us-isolated-read-scanner"
  });
  const metrics = {
    seedMs: [],
    currentMs: [],
    historyMs: [],
    generalScannerMs: Object.fromEntries(
      Object.keys(GENERAL_SCANNER_QUERIES).map((name) => [name, []])
    ),
    stagedScannerMs: []
  };

  try {
    await measure(metrics.seedMs, () =>
      seedReadScannerAuthority(database.writerConnection, profile));

    const viewer = createViewerReads({
      connection: database.viewerReadConnection,
      schemaVersion: 3,
      historyPageSize: 500
    });
    const scanner = await createScannerAuthority({
      connection: database.scannerConnection
    });

    const current = await measure(metrics.currentMs, () => viewer.current());
    assert.equal(current.summary.rowCount, profile.universeSize);
    assert.equal(current.summary.lastCycleId, profile.cycleCount);

    const history = await measure(metrics.historyMs, () =>
      viewer.historyPage(String(FIRST_PAPER_ID), null));
    assert.equal(history.rows.length, Math.min(500, profile.cycleCount));
    assert.equal(history.hasMore, profile.cycleCount > 500);

    for (const [name, sql] of Object.entries(GENERAL_SCANNER_QUERIES)) {
      const result = await measure(metrics.generalScannerMs[name], () =>
        scanner.execute(sql));
      assert.equal(result.rowCount, 10, `${name} Scanner row count`);
    }

    assert.ok(
      profile.cycleCount * profile.cadenceMs >= 120000,
      "isolated staged Scanner profile requires at least 120 seconds of logical history"
    );
    const staged = await measure(metrics.stagedScannerMs, () =>
      scanner.execute(stagedScannerSql()));
    assert.equal(staged.rowCount, Math.min(100, profile.universeSize));
    const stageIndex = staged.columns.findIndex((column) => column.name === "stage_reached");
    assert.ok(stageIndex >= 0);
    assert.ok(staged.rows.every((row) => Number(row[stageIndex]) === 7));

    const status = await viewer.status();
    assert.equal(status.completedCycles, profile.cycleCount);
    assert.equal(status.failedCycles, 0);
    assert.equal(status.latestCount, profile.universeSize);
    assert.equal(status.historyCount, profile.universeSize * profile.cycleCount);

    return {
      universeSize: profile.universeSize,
      cycles: profile.cycleCount,
      cadenceMs: profile.cadenceMs,
      historyRows: profile.universeSize * profile.cycleCount,
      seedMs: distribution(metrics.seedMs),
      currentMs: distribution(metrics.currentMs),
      historyPageMs: distribution(metrics.historyMs),
      scanner: {
        general: Object.fromEntries(
          Object.entries(metrics.generalScannerMs)
            .map(([name, samples]) => [name, distribution(samples)])
        ),
        stagedCandidate: distribution(metrics.stagedScannerMs)
      },
      dbFileBytes: (await stat(dbPath)).size
    };
  } finally {
    await database.close();
  }
}

test("isolated Market Flow US persistence/read/Scanner probes stay layer-specific", { timeout: 40 * 60 * 1000 }, async () => {
  const profile = resolveIsolatedProfile();
  const report = {
    schemaVersion: 2,
    product: "Market Flow US",
    profileMode: workloadMode(),
    targetAuthority: profile?.targetAuthority ?? false,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch
    },
    result: profile === null ? "not-applicable" : "running",
    wallClockMs: null,
    persistence: null,
    widthCycle: null,
    readScanner: null,
    error: null
  };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-isolated-"));
  const started = performance.now();
  let failure = null;

  try {
    if (profile !== null) {
      assertSafeProfile(profile);
      report.persistence = await runPersistenceProbe(profile, tempDir);
      report.widthCycle = await runPersistenceProbe(profile, tempDir, {
        universeSize: profile.widthUniverseSize,
        cycles: 1,
        dbName: "isolated-width.duckdb"
      });
      report.readScanner = await runReadScannerProbe(profile, tempDir);
      report.result = "pass";
    }
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = sanitizedFailure(error, tempDir);
  } finally {
    report.wallClockMs = roundMs(performance.now() - started);
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rm(tempDir, { recursive: true, force: true });
  }

  if (failure) throw failure;
});
