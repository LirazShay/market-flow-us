import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import {
  BACKTEST_LAB_HOST,
  startBacktestLabRuntime
} from "../../backtest-lab/runtime.js";

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

async function seedEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-runtime-test",
    now: () => 1700000000000
  });
  try {
    await database.writerConnection.run(`
      INSERT INTO scanner_saved_queries (
        query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
      ) VALUES (
        'user:runtime-proof', 'Runtime proof', 'runtime proof',
        'SELECT 1 AS answer', 3000, 10, 20
      )
    `);
    await database.writerConnection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'session-runtime-proof', 'producer-runtime-proof', 'stopped', 1000, 1200,
        'normal', 1100, 0, 0, NULL, NULL, '{}', NULL
      )
    `);
    await database.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        1, 1500, 'query-1', 'Query 1', 'SELECT 1', 3000,
        1200, 1300, 1, '{"rows":[]}', 'manual', false, NULL
      )
    `);
    await database.writerConnection.run(`
      INSERT INTO demo_buy_items VALUES (1, 1, 'security-1', 1)
    `);
  } finally {
    await database.close();
  }
}

async function evidenceFacts(dbPath) {
  return {
    schema: await queryRows(dbPath, "SELECT schema_version, product_version FROM schema_info"),
    sessions: await queryRows(
      dbPath,
      "SELECT session_id, status, stopped_at_ms, stop_reason FROM sessions ORDER BY session_id"
    ),
    queries: await queryRows(
      dbPath,
      "SELECT query_id, name, sql_text FROM scanner_saved_queries ORDER BY query_id"
    ),
    marketCounts: await queryRows(
      dbPath,
      `SELECT
         (SELECT COUNT(*) FROM cycles) AS cycles,
         (SELECT COUNT(*) FROM history) AS history,
         (SELECT COUNT(*) FROM latest) AS latest`
    ),
    demoBuy: await queryRows(
      dbPath,
      `SELECT
         (SELECT COUNT(*) FROM demo_buy_captures) AS captures,
         (SELECT COUNT(*) FROM demo_buy_items) AS items`
    )
  };
}

async function requestJson(runtime, pathname, options = {}) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, options);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    body: JSON.parse(text)
  };
}

async function postJson(runtime, pathname, body) {
  return requestJson(runtime, pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

test("Backtest runtime binds only loopback, enumerates controlled sources and validates evidence without mutation", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-runtime-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  let runtime = null;

  try {
    await seedEvidence(dbPath);
    const beforeBytes = await readFile(dbPath);
    const beforeFacts = await evidenceFacts(dbPath);

    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });
    assert.equal(runtime.host, BACKTEST_LAB_HOST);

    const health = await requestJson(runtime, "/health");
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, {
      ready: true,
      service: "market-flow-us-backtest-lab"
    });
    assert.equal(health.headers.get("access-control-allow-origin"), null);
    assert.equal(health.headers.get("cache-control"), "no-store");

    const catalog = await requestJson(runtime, "/api/sources");
    assert.equal(catalog.status, 200);
    assert.deepEqual(catalog.body, {
      sources: [{
        sourceId: "active",
        kind: "active",
        fileName: "market-flow-us.duckdb"
      }],
      count: 1
    });
    assert.equal(catalog.text.includes(dataDir), false);
    assert.equal(catalog.text.includes("path"), false);

    const validated = await postJson(runtime, "/api/source/validate", { sourceId: "active" });
    assert.equal(validated.status, 200);
    assert.deepEqual(validated.body, {
      source: {
        sourceId: "active",
        kind: "active",
        fileName: "market-flow-us.duckdb"
      },
      schemaVersion: 4
    });
    assert.equal(validated.text.includes(dataDir), false);

    assert.deepEqual(await readFile(dbPath), beforeBytes);
    assert.deepEqual(await evidenceFacts(dbPath), beforeFacts);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest runtime exposes empty catalog safely and never accepts a browser filesystem path", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-empty-"));
  let runtime = null;

  try {
    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });

    const catalog = await requestJson(runtime, "/api/sources");
    assert.deepEqual(catalog.body, { sources: [], count: 0 });

    const missing = await postJson(runtime, "/api/source/validate", { sourceId: "active" });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "BACKTEST_SOURCE_MISSING");
    assert.equal(missing.text.includes(dataDir), false);

    const arbitraryPath = await postJson(runtime, "/api/source/validate", {
      sourceId: "active",
      path: path.join(dataDir, "private.duckdb")
    });
    assert.equal(arbitraryPath.status, 400);
    assert.equal(arbitraryPath.body.error.code, "BACKTEST_REQUEST_INVALID");
    assert.equal(arbitraryPath.text.includes(dataDir), false);

    const traversal = await postJson(runtime, "/api/source/validate", {
      sourceId: "archive:../private.duckdb"
    });
    assert.equal(traversal.status, 400);
    assert.equal(traversal.body.error.code, "BACKTEST_SOURCE_INVALID_SELECTION");
    assert.equal(traversal.text.includes(dataDir), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest runtime maps private unexpected failures to bounded public-safe diagnostics", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-private-"));
  let runtime = null;

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      openSource: async () => {
        throw new Error(`private failure at ${dataDir}/market-flow-us.duckdb with raw data`);
      }
    });

    const response = await postJson(runtime, "/api/source/validate", { sourceId: "active" });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: {
        code: "BACKTEST_RUNTIME_ERROR",
        message: "Backtest Lab operation failed safely."
      }
    });
    assert.equal(response.text.includes(dataDir), false);
    assert.equal(response.text.includes("raw data"), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest runtime rejects durable active ownership and never disrupts the existing live database owner", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-owned-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  let database = null;
  let runtime = null;

  try {
    database = await openMarketFlowUsDatabase({
      dbPath,
      productVersion: "live-owner-proof",
      now: () => 1700000000000
    });
    await database.writerConnection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'session-live-owner', 'producer-live-owner', 'running', 1000, NULL,
        NULL, 1100, 0, 0, NULL, NULL, '{}', NULL
      )
    `);

    runtime = await startBacktestLabRuntime({ dataDir, port: 0 });

    const response = await postJson(runtime, "/api/source/validate", { sourceId: "active" });
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, "BACKTEST_SOURCE_IN_USE");
    assert.equal(response.text.includes(dataDir), false);

    const sessionReader = await database.viewerReadConnection.runAndReadAll(
      "SELECT status, stopped_at_ms, stop_reason FROM sessions WHERE session_id = 'session-live-owner'"
    );
    assert.deepEqual(sessionReader.getRowObjectsJson(), [{
      status: "running",
      stopped_at_ms: null,
      stop_reason: null
    }]);

    await database.writerConnection.run(`
      INSERT INTO scanner_saved_queries VALUES (
        'user:owner-still-alive', 'Owner still alive', 'owner still alive',
        'SELECT 1', 3000, 1, 1
      )
    `);
    const reader = await database.viewerReadConnection.runAndReadAll(
      "SELECT query_id FROM scanner_saved_queries WHERE query_id = 'user:owner-still-alive'"
    );
    assert.deepEqual(reader.getRowObjectsJson(), [{ query_id: "user:owner-still-alive" }]);
  } finally {
    await runtime?.close();
    await database?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest runtime boundary has no child-process, provider, Replay or order-service ownership hooks", async () => {
  const runtimeSource = await readFile(
    new URL("../../backtest-lab/runtime.js", import.meta.url),
    "utf8"
  );
  const entrySource = await readFile(
    new URL("../../backtest-lab/index.js", import.meta.url),
    "utf8"
  );
  const source = `${runtimeSource}\n${entrySource}`;

  for (const forbidden of [
    "node:child_process",
    "replay-host",
    "Replay Host",
    "ibkr-order-service",
    "local-service/server",
    "process.kill("
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
