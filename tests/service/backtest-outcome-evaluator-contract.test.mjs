import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";

import {
  BACKTEST_OUTCOME_ERROR_CODES,
  BacktestOutcomeEvaluationError,
  evaluateBacktestOutcomes
} from "../../backtest-lab/outcome-evaluator.js";
import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import {
  MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS,
  MARKET_FLOW_US_V3_SCHEMA_VERSION
} from "../../local-service/database/schema.js";
import { deriveDemoBuyHorizonOutcome } from "../../shared/demo-buy/outcome-evidence.js";

const BASELINE_CYCLE_ID = 2;
const REQUESTED_AT_MS = 2_000;
const HORIZON_MS = 10_000;

const CASES = Object.freeze([
  Object.freeze({ securityId: "up", baselinePrice: 100, futurePrice: 110 }),
  Object.freeze({ securityId: "down", baselinePrice: 100, futurePrice: 90 }),
  Object.freeze({ securityId: "flat", baselinePrice: 100, futurePrice: 100 }),
  Object.freeze({ securityId: "null-baseline", baselinePrice: null, futurePrice: 50 }),
  Object.freeze({ securityId: "zero-baseline", baselinePrice: 0, futurePrice: 50 }),
  Object.freeze({ securityId: "null-future", baselinePrice: 100, futurePrice: null }),
  Object.freeze({ securityId: "no-future", baselinePrice: 100, futurePrice: undefined })
]);

function sqlValue(value) {
  return value === null ? "NULL" : String(value);
}

async function insertFixture(connection) {
  await connection.run(`
    INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'outcome-contract-session', 'outcome-contract-producer', 'stopped',
      100, 20_000, 'test', 20_000, 2, 0, 3, 12_100, '{}', NULL
    )
  `);

  const universeRows = CASES.map((entry, index) => `(
    '${entry.securityId}', true, 1, 100, 12_100,
    'S${index + 1}', 'Security ${index + 1}', NULL, 'TEST',
    '{"PaperId":"${entry.securityId}"}'
  )`).join(",\n");

  await connection.run(`
    INSERT INTO universe (
      security_id, is_current, universe_revision, first_seen_at_ms,
      last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName,
      raw_source
    ) VALUES
      ${universeRows}
  `);

  await connection.run(`
    INSERT INTO cycles (
      cycle_id, session_id, universe_revision, status, started_at_ms,
      completed_at_ms, committed_at_ms, duration_ms, requested, received,
      unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
      failure_phase, error_json
    ) VALUES
      (2, 'outcome-contract-session', 1, 'complete', 1_700, 1_800, 2_000,
       100, 7, 7, 7, 0, 0, 0, 1, '[]', NULL, NULL),
      (3, 'outcome-contract-session', 1, 'complete', 11_700, 11_800, 12_100,
       100, 6, 6, 6, 0, 0, 0, 1, '[]', NULL, NULL)
  `);

  const baselineRows = CASES.map((entry, index) => `(
    2, 'outcome-contract-session', 1, '${entry.securityId}', 0,
    1_700, 1_890, 1_900, NULL,
    'S${index + 1}', 'Security ${index + 1}', NULL, 'TEST', NULL, NULL, NULL,
    ${sqlValue(entry.baselinePrice)}, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    '{"PaperId":"${entry.securityId}"}'
  )`).join(",\n");

  const futureRows = CASES
    .filter((entry) => entry.futurePrice !== undefined)
    .map((entry, index) => `(
      3, 'outcome-contract-session', 1, '${entry.securityId}', 0,
      11_700, 11_890, 12_000, NULL,
      'F${index + 1}', 'Future ${index + 1}', NULL, 'TEST', NULL, NULL, NULL,
      ${sqlValue(entry.futurePrice)}, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      '{"PaperId":"${entry.securityId}"}'
    )`).join(",\n");

  await connection.run(`
    INSERT INTO history VALUES
      ${baselineRows},
      ${futureRows}
  `);

  await connection.run("DELETE FROM latest");
  await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 3");
}

async function seedV4(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-outcome-contract-v4",
    now: () => 40_000
  });
  try {
    await insertFixture(database.writerConnection);
  } finally {
    await database.close();
  }
}

async function seedV3(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("BEGIN TRANSACTION");
    for (const statement of MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES ($schemaVersion, 40_000, 'backtest-outcome-contract-v3')",
      { schemaVersion: MARKET_FLOW_US_V3_SCHEMA_VERSION }
    );
    await insertFixture(connection);
    await connection.run("COMMIT");
  } catch (error) {
    try {
      await connection.run("ROLLBACK");
    } catch {
      // Preserve the fixture failure.
    }
    throw error;
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function selectedItems() {
  return CASES.map((entry, index) => ({
    returnedPosition: index + 1,
    securityId: entry.securityId
  }));
}

function expectedOutcome(entry) {
  return deriveDemoBuyHorizonOutcome({
    baselinePrice: entry.baselinePrice,
    futureCycleId: entry.futurePrice === undefined ? null : 3,
    futurePrice: entry.futurePrice === undefined ? null : entry.futurePrice
  });
}

async function evaluateSource({ dataDir, sourceId }) {
  return evaluateBacktestOutcomes({
    dataDir,
    sourceId,
    baselineCycleId: BASELINE_CYCLE_ID,
    requestedAtMs: REQUESTED_AT_MS,
    selectedItems: selectedItems(),
    horizonsMs: [HORIZON_MS]
  });
}

function assertCompleteSemantics(result) {
  assert.deepEqual(
    result.items.map((item) => [item.returnedPosition, item.securityId]),
    CASES.map((entry, index) => [index + 1, entry.securityId])
  );

  for (let index = 0; index < CASES.length; index += 1) {
    const entry = CASES[index];
    const item = result.items[index];
    const horizon = item.horizons[0];
    const expected = expectedOutcome(entry);

    assert.equal(item.baseline.cycleId, BASELINE_CYCLE_ID);
    assert.equal(item.baseline.collectedAtMs, 1_900);
    assert.equal(item.baseline.price, entry.baselinePrice);
    assert.equal(item.baseline.ageMs, 100);
    assert.equal(horizon.horizonMs, HORIZON_MS);
    assert.equal(horizon.targetAtMs, 12_000);
    assert.equal(horizon.futureCycleId, entry.futurePrice === undefined ? null : 3);
    assert.equal(horizon.observedAtMs, entry.futurePrice === undefined ? null : 12_000);
    assert.equal(horizon.actualElapsedMs, entry.futurePrice === undefined ? null : 10_000);
    assert.equal(horizon.price, entry.futurePrice === undefined ? null : entry.futurePrice);
    assert.equal(horizon.changePercent, expected.changePercent);
    assert.equal(horizon.outcome, expected.outcome);
    assert.equal(horizon.unavailableReason, expected.unavailableReason);
  }

  assert.deepEqual(
    result.items.map((item) => item.horizons[0].outcome),
    ["UP", "DOWN", "FLAT", "UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE", "UNAVAILABLE"]
  );
  assert.deepEqual(
    result.items.map((item) => item.horizons[0].unavailableReason),
    [
      null,
      null,
      null,
      "BASELINE_PRICE_UNAVAILABLE",
      "BASELINE_PRICE_ZERO",
      "FUTURE_PRICE_UNAVAILABLE",
      "NO_FUTURE_OBSERVATION"
    ]
  );
}

test("Backtest outcome evaluator matches shared Demo Buy semantics for all outcomes and unavailable reasons", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-outcome-contract-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedV4(dbPath);
    const before = await readFile(dbPath);
    const result = await evaluateSource({ dataDir, sourceId: "active" });

    assertCompleteSemantics(result);
    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest outcome evaluator preserves identical semantics across schema v4 active and schema v3 archive evidence", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-outcome-schema-"));
  const archiveDir = path.join(dataDir, "archive");
  const archiveName = "market-flow-us-20261010T200000000Z.duckdb";
  const v4Path = path.join(dataDir, "market-flow-us.duckdb");
  const v3Path = path.join(archiveDir, archiveName);

  try {
    await mkdir(archiveDir, { recursive: true });
    await seedV4(v4Path);
    await seedV3(v3Path);
    const v4Before = await readFile(v4Path);
    const v3Before = await readFile(v3Path);

    const v4 = await evaluateSource({ dataDir, sourceId: "active" });
    const v3 = await evaluateSource({
      dataDir,
      sourceId: `archive:${archiveName}`
    });

    assert.deepEqual(v3, v4);
    assertCompleteSemantics(v3);
    assert.deepEqual(await readFile(v4Path), v4Before);
    assert.deepEqual(await readFile(v3Path), v3Before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest outcome evaluator reports a missing exact baseline row as integrity failure rather than unavailable", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-outcome-integrity-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedV4(dbPath);
    const before = await readFile(dbPath);

    await assert.rejects(
      () => evaluateBacktestOutcomes({
        dataDir,
        sourceId: "active",
        baselineCycleId: BASELINE_CYCLE_ID,
        requestedAtMs: REQUESTED_AT_MS,
        selectedItems: [{ returnedPosition: 1, securityId: "missing-baseline" }],
        horizonsMs: [HORIZON_MS]
      }),
      (error) => {
        assert.ok(error instanceof BacktestOutcomeEvaluationError);
        assert.equal(error.code, BACKTEST_OUTCOME_ERROR_CODES.BASELINE_INTEGRITY);
        return true;
      }
    );

    assert.deepEqual(await readFile(dbPath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest outcome evaluator executes default and optional horizon order without inventing or reordering horizons", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-outcome-horizons-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedV4(dbPath);

    const defaults = await evaluateBacktestOutcomes({
      dataDir,
      sourceId: "active",
      baselineCycleId: BASELINE_CYCLE_ID,
      requestedAtMs: REQUESTED_AT_MS,
      selectedItems: [{ returnedPosition: 1, securityId: "up" }]
    });
    assert.deepEqual(defaults.items[0].horizons.map((horizon) => horizon.horizonMs), [
      10_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000
    ]);

    const complete = await evaluateBacktestOutcomes({
      dataDir,
      sourceId: "active",
      baselineCycleId: BASELINE_CYCLE_ID,
      requestedAtMs: REQUESTED_AT_MS,
      selectedItems: [{ returnedPosition: 1, securityId: "up" }],
      horizonsMs: [
        10_000, 20_000, 30_000, 45_000, 60_000,
        90_000, 120_000, 180_000, 300_000, 600_000
      ]
    });
    assert.deepEqual(
      complete.items[0].horizons.map((horizon) => horizon.horizonMs),
      [10_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000, 180_000, 300_000, 600_000]
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
