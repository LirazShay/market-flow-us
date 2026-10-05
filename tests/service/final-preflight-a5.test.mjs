import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";

import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import { rolloverTradingDay } from "../../scripts/new-trading-day.mjs";

async function queryRows(dbPath, sql) {
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

async function seedStoppedAuthority(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "a5-proof",
    now: () => 1700000000000
  });
  try {
    await database.writerConnection.run(`
      INSERT INTO scanner_saved_queries (
        query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
      ) VALUES (
        'user:a5-keep', 'A5 keep', 'a5 keep', 'SELECT 7 AS value', 5000, 100, 200
      )
    `);
    await database.writerConnection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'a5-old-session', 'a5-old-producer', 'stopped', 1000, 1200,
        'normal', 1100, 3, 0, 3, 1200, '{}', NULL
      )
    `);
  } finally {
    await database.close();
  }
}

test("no-archive new-day failure after fresh install restores the exact prior authority", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-a5-new-day-"));
  const dbPath = path.join(tempDir, "market-flow-us.duckdb");

  try {
    await seedStoppedAuthority(dbPath);

    await assert.rejects(
      () => rolloverTradingDay({
        dbPath,
        archive: false,
        productVersion: "a5-proof",
        now: () => 1712345678901,
        fault: {
          hit(checkpoint) {
            if (checkpoint === "after-fresh-install") {
              throw new Error("synthetic post-install failure");
            }
          }
        }
      }),
      /synthetic post-install failure/
    );

    assert.deepEqual(
      await queryRows(dbPath, "SELECT session_id, status FROM sessions ORDER BY session_id"),
      [{ session_id: "a5-old-session", status: "stopped" }]
    );
    assert.deepEqual(
      await queryRows(dbPath, "SELECT query_id FROM scanner_saved_queries ORDER BY query_id"),
      [{ query_id: "user:a5-keep" }]
    );

    const names = await readdir(tempDir, { recursive: true });
    assert.equal(names.some((name) => String(name).includes(".previous-")), false);
    assert.equal(names.some((name) => String(name).includes(".new-day-")), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("new-day API rejects an empty archive directory instead of resolving it to cwd", async () => {
  await assert.rejects(
    () => rolloverTradingDay({ archiveDir: "" }),
    /archiveDir must be null or a non-empty string/
  );
});
