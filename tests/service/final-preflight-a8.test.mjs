import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildMovementWitnessSql } from "../../browser/live-verification/movement-evidence.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";

async function withFixture(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-a8-"));
  const dbPath = path.join(tempDir, "movement.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "a8-test",
    now: () => 1
  });
  const scanner = await createScannerAuthority({
    connection: database.scannerConnection,
    now: () => 1000
  });

  try {
    await run({ database, scanner });
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function insertHistory(connection, { cycleId, securityId, price, collectedAtMs }) {
  await connection.run(
    `INSERT INTO history (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      source_metadata_json, Price, raw_data
    ) VALUES (
      $cycleId, 'a8-session', 1, $securityId, 0,
      $collectedAtMs, $collectedAtMs, $collectedAtMs,
      '{}', $price, '{}'
    )`,
    { cycleId, securityId, price, collectedAtMs }
  );
}

async function insertLatest(connection, { cycleId, securityId, price, collectedAtMs }) {
  await connection.run(
    `INSERT INTO latest (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      source_metadata_json, Price, raw_data
    ) VALUES (
      $cycleId, 'a8-session', 1, $securityId, 0,
      $collectedAtMs, $collectedAtMs, $collectedAtMs,
      '{}', $price, '{}'
    )`,
    { cycleId, securityId, price, collectedAtMs }
  );
}

function rowsAsObjects(result) {
  const names = result.columns.map((column) => column.name);
  return result.rows.map((row) => Object.fromEntries(
    names.map((name, index) => [name, row[index]])
  ));
}

test("movement witness SQL detects committed provider-field change inside the exact live cycle range", async () => {
  await withFixture(async ({ database, scanner }) => {
    await insertHistory(database.writerConnection, {
      cycleId: 10,
      securityId: "1001",
      price: 100,
      collectedAtMs: 10000
    });
    await insertHistory(database.writerConnection, {
      cycleId: 11,
      securityId: "1001",
      price: 101,
      collectedAtMs: 11000
    });
    await insertHistory(database.writerConnection, {
      cycleId: 11,
      securityId: "2002",
      price: 55,
      collectedAtMs: 11000
    });
    await insertLatest(database.writerConnection, {
      cycleId: 11,
      securityId: "1001",
      price: 101,
      collectedAtMs: 11000
    });
    await insertLatest(database.writerConnection, {
      cycleId: 11,
      securityId: "2002",
      price: 55,
      collectedAtMs: 11000
    });

    const result = await scanner.execute(
      buildMovementWitnessSql({ firstCycleId: 10, lastCycleId: 11 })
    );
    assert.deepEqual(rowsAsObjects(result), [{
      securityId: "1001",
      changedField: "Price",
      latestCycleId: "11"
    }]);
  });
});

test("movement witness SQL returns no witness when provider fields stay static", async () => {
  await withFixture(async ({ database, scanner }) => {
    await insertHistory(database.writerConnection, {
      cycleId: 20,
      securityId: "3003",
      price: 42,
      collectedAtMs: 20000
    });
    await insertHistory(database.writerConnection, {
      cycleId: 21,
      securityId: "3003",
      price: 42,
      collectedAtMs: 21000
    });
    await insertLatest(database.writerConnection, {
      cycleId: 21,
      securityId: "3003",
      price: 42,
      collectedAtMs: 21000
    });

    const result = await scanner.execute(
      buildMovementWitnessSql({ firstCycleId: 20, lastCycleId: 21 })
    );
    assert.equal(result.rowCount, 0);
    assert.deepEqual(result.rows, []);
  });
});
