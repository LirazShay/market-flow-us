import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import {
  MARKET_FLOW_US_SCHEMA_VERSION,
  MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS,
  MARKET_FLOW_US_V3_SCHEMA_VERSION
} from "../../local-service/database/schema.js";
import {
  NewDayActiveSessionError,
  rolloverTradingDay
} from "../../scripts/new-trading-day.mjs";

async function rows(dbPath, sql) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    const reader = await connection.runAndReadAll(sql);
    return reader.getRowObjectsJson();
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function seedSavedQueryAndSession(connection, { sessionStatus = "stopped" } = {}) {
  await connection.run(
    `INSERT INTO scanner_saved_queries (
      query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
    ) VALUES (
      'user:keep-me', 'Keep me', 'keep me', 'SELECT 42 AS answer', 5000, 100, 200
    )`
  );

  await connection.run(
    `INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'session-old', 'producer-old', $status, 1000, $stoppedAtMs,
      $stopReason, 1100, 3, 0, 3, 1200, '{}', NULL
    )`,
    {
      status: sessionStatus,
      stoppedAtMs: sessionStatus === "running" ? null : 1200,
      stopReason: sessionStatus === "running" ? null : "normal"
    }
  );
}

async function seedV4ActiveDay(dbPath, {
  sessionStatus = "stopped",
  demoBuy = false
} = {}) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "test-version",
    now: () => 1700000000000
  });

  try {
    await seedSavedQueryAndSession(database.writerConnection, { sessionStatus });
    if (demoBuy) {
      await database.writerConnection.run(`
        INSERT INTO demo_buy_captures VALUES (
          1, 1500, 'query-1', 'Query 1', 'SELECT 1', 3000,
          1200, 1300, 1, '{"rows":[]}', 'manual', false, NULL
        )
      `);
      await database.writerConnection.run(`
        INSERT INTO demo_buy_items VALUES (1, 1, 'security-1', 1)
      `);
    }
  } finally {
    await database.close();
  }
}

async function seedV3ActiveDay(dbPath, { sessionStatus = "stopped" } = {}) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("BEGIN TRANSACTION");
    for (const statement of MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES ($schemaVersion, 1700000000000, 'test-v3')",
      { schemaVersion: MARKET_FLOW_US_V3_SCHEMA_VERSION }
    );
    await seedSavedQueryAndSession(connection, { sessionStatus });
    await connection.run("COMMIT");
  } catch (error) {
    try {
      await connection.run("ROLLBACK");
    } catch {
      // Preserve the seed failure.
    }
    throw error;
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function pathExists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function assertFreshV4(dbPath) {
  assert.deepEqual(await rows(
    dbPath,
    "SELECT schema_version FROM schema_info"
  ), [{ schema_version: MARKET_FLOW_US_SCHEMA_VERSION }]);

  for (const table of [
    "sessions",
    "universe",
    "cycles",
    "history",
    "latest",
    "demo_buy_captures",
    "demo_buy_items"
  ]) {
    assert.deepEqual(await rows(
      dbPath,
      `SELECT COUNT(*) AS count FROM ${table}`
    ), [{ count: "0" }]);
  }
}

test("new trading day archives v4 unchanged, starts clean v4 authority and preserves only saved queries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-new-day-v4-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    await seedV4ActiveDay(dbPath, { demoBuy: true });
    const sourceBytes = await readFile(dbPath);

    const result = await rolloverTradingDay({
      dbPath,
      productVersion: "test-version",
      now: () => 1712345678901
    });

    assert.equal(result.createdFresh, false);
    assert.equal(result.savedQueriesPreserved, 1);
    assert.equal(result.archived, true);
    assert.equal(path.dirname(result.archivePath), path.join(tempDir, "archive"));
    assert.equal(
      path.basename(result.archivePath),
      "market-flow-us-20240405T193438901Z.duckdb"
    );

    assert.deepEqual(await rows(
      dbPath,
      `SELECT query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
       FROM scanner_saved_queries`
    ), [{
      query_id: "user:keep-me",
      name: "Keep me",
      name_key: "keep me",
      sql_text: "SELECT 42 AS answer",
      interval_ms: "5000",
      created_at_ms: "100",
      updated_at_ms: "200"
    }]);
    await assertFreshV4(dbPath);

    assert.deepEqual(await rows(
      result.archivePath,
      "SELECT schema_version FROM schema_info"
    ), [{ schema_version: MARKET_FLOW_US_SCHEMA_VERSION }]);
    assert.deepEqual(await rows(
      result.archivePath,
      "SELECT capture_id FROM demo_buy_captures"
    ), [{ capture_id: "1" }]);
    assert.deepEqual(await rows(
      result.archivePath,
      "SELECT capture_id, security_id FROM demo_buy_items"
    ), [{ capture_id: "1", security_id: "security-1" }]);
    assert.deepEqual(await readFile(result.archivePath), sourceBytes);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("new trading day accepts v3 without migrating the archived source and installs fresh v4", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-new-day-v3-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    await seedV3ActiveDay(dbPath);
    const sourceBytes = await readFile(dbPath);

    const result = await rolloverTradingDay({
      dbPath,
      productVersion: "test-version",
      now: () => 1712345678901
    });

    assert.equal(result.savedQueriesPreserved, 1);
    await assertFreshV4(dbPath);
    assert.deepEqual(await rows(
      dbPath,
      "SELECT query_id FROM scanner_saved_queries ORDER BY query_id"
    ), [{ query_id: "user:keep-me" }]);

    assert.deepEqual(await rows(
      result.archivePath,
      "SELECT schema_version FROM schema_info"
    ), [{ schema_version: MARKET_FLOW_US_V3_SCHEMA_VERSION }]);
    assert.equal(
      (await rows(
        result.archivePath,
        `SELECT COUNT(*) AS count
         FROM information_schema.tables
         WHERE table_schema = 'main'
           AND table_name IN ('demo_buy_captures', 'demo_buy_items')`
      ))[0].count,
      "0"
    );
    assert.deepEqual(await readFile(result.archivePath), sourceBytes);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("new trading day refuses to roll while a producer session is still marked running", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-new-day-running-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    await seedV4ActiveDay(dbPath, { sessionStatus: "running" });

    await assert.rejects(
      () => rolloverTradingDay({
        dbPath,
        productVersion: "test-version",
        now: () => 1712345678901
      }),
      (error) => {
        assert.ok(error instanceof NewDayActiveSessionError);
        assert.equal(error.code, "NEW_DAY_ACTIVE_SESSION");
        return true;
      }
    );

    assert.deepEqual(await rows(
      dbPath,
      "SELECT session_id, status FROM sessions ORDER BY session_id"
    ), [{ session_id: "session-old", status: "running" }]);
    assert.equal(await pathExists(path.join(tempDir, "archive")), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("new trading day restores the prior active DB if installation fails after the prior DB moves", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-new-day-rollback-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    await seedV4ActiveDay(dbPath, { demoBuy: true });

    await assert.rejects(
      () => rolloverTradingDay({
        dbPath,
        productVersion: "test-version",
        now: () => 1712345678901,
        fault: {
          hit(checkpoint) {
            if (checkpoint === "after-prior-move") {
              throw new Error("synthetic install failure");
            }
          }
        }
      }),
      /synthetic install failure/
    );

    assert.deepEqual(await rows(
      dbPath,
      "SELECT session_id, status FROM sessions ORDER BY session_id"
    ), [{ session_id: "session-old", status: "stopped" }]);
    assert.deepEqual(await rows(
      dbPath,
      "SELECT query_id FROM scanner_saved_queries ORDER BY query_id"
    ), [{ query_id: "user:keep-me" }]);
    assert.deepEqual(await rows(
      dbPath,
      "SELECT capture_id FROM demo_buy_captures"
    ), [{ capture_id: "1" }]);

    const names = await readdir(tempDir, { recursive: true });
    assert.equal(names.some((name) => String(name).includes(".new-day-")), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("new trading day bootstraps a fresh v4 active DB when no prior active DB exists", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-new-day-empty-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    const result = await rolloverTradingDay({
      dbPath,
      productVersion: "test-version",
      now: () => 1712345678901
    });

    assert.deepEqual(result, {
      dbPath,
      createdFresh: true,
      archived: false,
      archivePath: null,
      savedQueriesPreserved: 0
    });
    await assertFreshV4(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
