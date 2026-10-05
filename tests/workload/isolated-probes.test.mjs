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
const SYNTHETIC_STATIC_FIELDS = Object.freeze([
  "Symbol",
  "PaperNameEng",
  "PaperNameHeb",
  "ExchangeName",
  "CountryName",
  "CountryNameEng"
]);
const SYNTHETIC_NUMERIC_FIELDS = Object.freeze([
  "Price",
  "ChangePercent",
  "DailyHigh",
  "DailyLow",
  "YearHigh",
  "YearLow",
  "DailyVolume",
  "BeginYearChangePercent",
  "Month12ChangePercent",
  "Month36ChangePercent",
  "AskRate",
  "BidRate",
  "YesterdayRate",
  "PaperMarketCap",
  "PaperIdYatab",
  "CountryId",
  "PaperType",
  "ESGRatingId",
  "ESGScope"
]);
const SYNTHETIC_INSERT_CHUNK = 256;

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

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), "synthetic SQL numbers must be finite");
    return String(value);
  }
  if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new TypeError(`Unsupported synthetic SQL literal type: ${typeof value}`);
}

function createScaleGenerator({ universeSize, cycleCount, cadenceMs }) {
  return createUsSyntheticGenerator({
    universeSize,
    cycleCount,
    cadenceMs,
    firstPaperId: FIRST_PAPER_ID,
    epochMs: SYNTHETIC_EPOCH_MS,
    dataPattern: "moving"
  });
}

async function insertUniverseFromGenerator(connection, generator, lastSeenAtMs) {
  const records = generator.recordsForCycle(0);
  for (let offset = 0; offset < records.length; offset += SYNTHETIC_INSERT_CHUNK) {
    const values = records
      .slice(offset, offset + SYNTHETIC_INSERT_CHUNK)
      .map((row) => `(
        ${sqlLiteral(String(row.PaperId))},
        true,
        1,
        ${SYNTHETIC_EPOCH_MS},
        ${lastSeenAtMs},
        ${sqlLiteral(row.Symbol)},
        ${sqlLiteral(row.PaperNameEng)},
        ${sqlLiteral(row.PaperNameHeb)},
        ${sqlLiteral(row.ExchangeName)},
        CAST('{}' AS JSON)
      )`);
    await connection.run(`INSERT INTO universe VALUES ${values.join(",\n")}`);
  }
}

function buildSyntheticBasis(generator, lastCycle) {
  const baseRows = generator.recordsForCycle(0);
  const nextRows = generator.recordsForCycle(1);
  const lastRows = generator.recordsForCycle(lastCycle);

  return baseRows.map((base, index) => {
    const next = nextRows[index];
    const last = lastRows[index];
    assert.equal(next.PaperId, base.PaperId, "synthetic identity drift at cycle 1");
    assert.equal(last.PaperId, base.PaperId, "synthetic identity drift at last cycle");

    for (const field of SYNTHETIC_STATIC_FIELDS) {
      assert.equal(next[field], base[field], `${field} must stay static for bulk day seeding`);
      assert.equal(last[field], base[field], `${field} must stay static for bulk day seeding`);
    }

    const numeric = {};
    for (const field of SYNTHETIC_NUMERIC_FIELDS) {
      const baseValue = base[field];
      const nextValue = next[field];
      const lastValue = last[field];
      if (baseValue === null || nextValue === null || lastValue === null) {
        assert.equal(baseValue, null, `${field} nullability must stay stable`);
        assert.equal(nextValue, null, `${field} nullability must stay stable`);
        assert.equal(lastValue, null, `${field} nullability must stay stable`);
        numeric[field] = { base: null, delta: null };
        continue;
      }

      assert.equal(typeof baseValue, "number", `${field} synthetic base must be numeric`);
      assert.equal(typeof nextValue, "number", `${field} synthetic next must be numeric`);
      assert.equal(typeof lastValue, "number", `${field} synthetic last must be numeric`);
      const delta = nextValue - baseValue;
      const expectedLast = baseValue + (delta * lastCycle);
      assert.ok(
        Math.abs(lastValue - expectedLast) <= 1e-9,
        `${field} must remain linear for generator-driven bulk day seeding`
      );
      numeric[field] = { base: baseValue, delta };
    }

    return {
      securityId: String(base.PaperId),
      static: Object.fromEntries(
        SYNTHETIC_STATIC_FIELDS.map((field) => [field, base[field]])
      ),
      numeric
    };
  });
}

async function createSyntheticBasisTable(connection, generator, lastCycle) {
  const numericColumns = SYNTHETIC_NUMERIC_FIELDS
    .flatMap((field) => [`${field}_base DOUBLE`, `${field}_delta DOUBLE`])
    .join(",\n      ");
  await connection.run(`
    CREATE TEMP TABLE isolated_synthetic_basis (
      security_id VARCHAR NOT NULL,
      Symbol VARCHAR NULL,
      PaperNameEng VARCHAR NULL,
      PaperNameHeb VARCHAR NULL,
      ExchangeName VARCHAR NULL,
      CountryName VARCHAR NULL,
      CountryNameEng VARCHAR NULL,
      ${numericColumns}
    )
  `);

  const basis = buildSyntheticBasis(generator, lastCycle);
  for (let offset = 0; offset < basis.length; offset += SYNTHETIC_INSERT_CHUNK) {
    const values = basis
      .slice(offset, offset + SYNTHETIC_INSERT_CHUNK)
      .map((row) => {
        const literals = [
          sqlLiteral(row.securityId),
          ...SYNTHETIC_STATIC_FIELDS.map((field) => sqlLiteral(row.static[field])),
          ...SYNTHETIC_NUMERIC_FIELDS.flatMap((field) => [
            sqlLiteral(row.numeric[field].base),
            sqlLiteral(row.numeric[field].delta)
          ])
        ];
        return `(${literals.join(", ")})`;
      });
    await connection.run(`INSERT INTO isolated_synthetic_basis VALUES ${values.join(",\n")}`);
  }
}

function syntheticNumericProjection(field) {
  return `CASE
        WHEN b.${field}_base IS NULL THEN NULL
        ELSE b.${field}_base + (b.${field}_delta * cycle_id)
      END`;
}

function assertCurrentMatchesGenerator(row, expected) {
  assert.equal(row.securityId, String(expected.PaperId));
  for (const field of SYNTHETIC_STATIC_FIELDS) {
    assert.equal(row[field], expected[field], `${field} must come from shared synthetic authority`);
  }
  for (const field of SYNTHETIC_NUMERIC_FIELDS) {
    const actual = row[field];
    const wanted = expected[field];
    if (wanted === null) {
      assert.equal(actual, null, `${field} null must match shared synthetic authority`);
    } else {
      assert.ok(
        Math.abs(Number(actual) - wanted) <= 1e-9,
        `${field} must match shared synthetic authority`
      );
    }
  }
}

async function seedPersistenceAuthority(connection, generator, cadenceMs) {
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
  await insertUniverseFromGenerator(connection, generator, lastSeenAtMs);
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
  const generator = createScaleGenerator({
    universeSize,
    cycleCount: cycles,
    cadenceMs: profile.cadenceMs
  });
  const commitMs = [];

  try {
    await seedPersistenceAuthority(
      database.writerConnection,
      generator,
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
  const generator = createScaleGenerator({ universeSize, cycleCount, cadenceMs });

  await createSyntheticBasisTable(connection, generator, cycleCount);
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

  await insertUniverseFromGenerator(connection, generator, lastCollectedAtMs);

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

  const numericProjection = SYNTHETIC_NUMERIC_FIELDS
    .map((field) => syntheticNumericProjection(field))
    .join(",\n      ");

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
      b.security_id,
      0,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) - 100,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}) - 10,
      ${SYNTHETIC_EPOCH_MS} + (cycle_id * ${cadenceMs}),
      CAST('{"source":"synthetic-us-generator-bulk-seed"}' AS JSON),
      b.Symbol,
      b.PaperNameEng,
      b.PaperNameHeb,
      b.ExchangeName,
      NULL,
      b.CountryName,
      b.CountryNameEng,
      ${numericProjection},
      CAST('{}' AS JSON)
    FROM range(1, ${cycleCount + 1}) AS cycles(cycle_id)
    CROSS JOIN isolated_synthetic_basis AS b
  `);

  await connection.run(`
    INSERT INTO latest
    SELECT * FROM history WHERE cycle_id = ${cycleCount}
  `);

  return generator;
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
    const generator = await measure(metrics.seedMs, () =>
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
    const firstCurrent = current.rows.find((row) => row.securityId === String(FIRST_PAPER_ID));
    assert.ok(firstCurrent, "first generated security must be present in Current");
    assertCurrentMatchesGenerator(
      firstCurrent,
      generator.rowForPaperId(FIRST_PAPER_ID, profile.cycleCount)
    );

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
      syntheticSource: "shared-generator-base-delta",
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
