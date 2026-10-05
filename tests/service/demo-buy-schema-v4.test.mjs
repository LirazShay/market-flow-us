import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";

import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import {
  MARKET_FLOW_US_REQUIRED_TABLES,
  MARKET_FLOW_US_SCHEMA_VERSION,
  MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS,
  MARKET_FLOW_US_V3_SCHEMA_VERSION
} from "../../local-service/database/schema.js";

async function rows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function inspectRaw(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    return {
      tables: (await rows(
        connection,
        "SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name"
      )).map((row) => row.table_name),
      schema: await rows(connection, "SELECT schema_version, product_version FROM schema_info"),
      savedQueries: await rows(
        connection,
        "SELECT query_id, name, sql_text FROM scanner_saved_queries ORDER BY query_id"
      )
    };
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function createValidV3(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    for (const statement of MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES ($version, 100, 'schema-v3-fixture')",
      { version: MARKET_FLOW_US_V3_SCHEMA_VERSION }
    );
    await connection.run(`
      INSERT INTO scanner_saved_queries VALUES (
        'q1', 'Keep query', 'keep query', 'SELECT 42', 3000, 10, 20
      )
    `);
    await connection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        's1', 'p1', 'stopped', 1, 9, 'normal', 9, 1, 0, 1, 8, '{}', NULL
      )
    `);
    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms, last_seen_at_ms,
        Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      ) VALUES ('101', true, 1, 1, 8, 'AAA', 'Alpha', NULL, 'NASDAQ', '{}')
    `);
    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status,
        started_at_ms, completed_at_ms, committed_at_ms, duration_ms
      ) VALUES (1, 's1', 1, 'committed', 1, 8, 8, 7)
    `);
    for (const table of ["history", "latest"]) {
      await connection.run(`
        INSERT INTO ${table} (
          cycle_id, session_id, universe_revision, security_id, chunk_index,
          cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
          Symbol, Price, raw_data
        ) VALUES (1, 's1', 1, '101', 0, 1, 8, 8, 'AAA', 12.5, '{"PaperId":101,"Price":12.5}')
      `);
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function columnTypes(columnRows) {
  return Object.fromEntries(columnRows.map((row) => [row.column_name, row.data_type]));
}

test("fresh Market Flow US DB boots schema v4 with exact Demo Buy tables and direct constraints", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-v4-fresh-"));
  const dbPath = path.join(tempDir, "fresh.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "test-v4",
    now: () => 1234
  });

  try {
    assert.equal(database.schemaVersion, MARKET_FLOW_US_SCHEMA_VERSION);
    assert.equal(MARKET_FLOW_US_SCHEMA_VERSION, 4);

    const tableRows = await rows(
      database.viewerReadConnection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name"
    );
    assert.deepEqual(
      tableRows.map((row) => row.table_name).sort(),
      [...MARKET_FLOW_US_REQUIRED_TABLES].sort()
    );
    assert.deepEqual(
      await rows(database.viewerReadConnection, "SELECT schema_version, product_version FROM schema_info"),
      [{ schema_version: 4, product_version: "test-v4" }]
    );

    assert.deepEqual(columnTypes(await rows(
      database.viewerReadConnection,
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema='main' AND table_name='demo_buy_captures'
       ORDER BY ordinal_position`
    )), {
      capture_id: "BIGINT",
      captured_at_ms: "BIGINT",
      source_query_id: "VARCHAR",
      source_query_name: "VARCHAR",
      source_query_sql: "VARCHAR",
      source_interval_ms: "BIGINT",
      source_result_started_at_ms: "BIGINT",
      source_result_completed_at_ms: "BIGINT",
      source_result_row_count: "BIGINT",
      source_result_context_json: "JSON",
      selection_mode: "VARCHAR",
      is_automatic: "BOOLEAN",
      top_x: "BIGINT"
    });
    assert.deepEqual(columnTypes(await rows(
      database.viewerReadConnection,
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema='main' AND table_name='demo_buy_items'
       ORDER BY ordinal_position`
    )), {
      capture_id: "BIGINT",
      result_rank: "BIGINT",
      security_id: "VARCHAR",
      buy_cycle_id: "BIGINT"
    });

    await assert.rejects(() => database.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        0, 100, NULL, NULL, 'SELECT 1', 3000, 90, 95, 1,
        '{}', 'manual', false, NULL
      )
    `));
    await assert.rejects(() => database.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        1, 100, NULL, NULL, 'SELECT 1', 3000, 90, 95, 1,
        '{}', 'manual', false, 1
      )
    `));
    await assert.rejects(() => database.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        1, 100, NULL, NULL, 'SELECT 1', 3000, 90, 95, 1,
        '{}', 'unknown', false, NULL
      )
    `));

    await database.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        1, 100, NULL, 'Query', 'SELECT 1', 3000, 90, 95, 1,
        '{"version":1}', 'all', true, NULL
      )
    `);
    await database.writerConnection.run(
      "INSERT INTO demo_buy_items VALUES (1, 1, '101', 1)"
    );
    await assert.rejects(() => database.writerConnection.run(
      "INSERT INTO demo_buy_items VALUES (1, 1, '102', 1)"
    ));
    await assert.rejects(() => database.writerConnection.run(
      "INSERT INTO demo_buy_items VALUES (1, 2, '101', 1)"
    ));
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("valid schema v3 migrates transactionally to v4 without rewriting market authority or saved queries", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-v3-to-v4-"));
  const dbPath = path.join(tempDir, "migrate.duckdb");

  try {
    await createValidV3(dbPath);
    const database = await openMarketFlowUsDatabase({
      dbPath,
      productVersion: "migrated-v4",
      now: () => 999
    });
    try {
      assert.equal(database.schemaVersion, 4);
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT schema_version, product_version FROM schema_info"),
        [{ schema_version: 4, product_version: "migrated-v4" }]
      );
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT security_id, Symbol, Price FROM history"),
        [{ security_id: "101", Symbol: "AAA", Price: 12.5 }]
      );
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT security_id, Symbol, Price FROM latest"),
        [{ security_id: "101", Symbol: "AAA", Price: 12.5 }]
      );
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT query_id, name, sql_text FROM scanner_saved_queries"),
        [{ query_id: "q1", name: "Keep query", sql_text: "SELECT 42" }]
      );
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT COUNT(*) AS count FROM demo_buy_captures"),
        [{ count: "0" }]
      );
      assert.deepEqual(
        await rows(database.viewerReadConnection, "SELECT COUNT(*) AS count FROM demo_buy_items"),
        [{ count: "0" }]
      );
    } finally {
      await database.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("schema v3 containing partial or pre-existing Demo Buy structures fails closed without normalization", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-v3-partial-demo-"));

  try {
    for (const variant of ["captures-only", "both"]) {
      const dbPath = path.join(tempDir, `${variant}.duckdb`);
      await createValidV3(dbPath);
      const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
      const connection = await instance.connect();
      try {
        await connection.run("CREATE TABLE demo_buy_captures (capture_id BIGINT)");
        if (variant === "both") {
          await connection.run("CREATE TABLE demo_buy_items (capture_id BIGINT)");
        }
      } finally {
        connection.closeSync();
        instance.closeSync();
      }

      const before = await inspectRaw(dbPath);
      await assert.rejects(
        () => openMarketFlowUsDatabase({ dbPath }),
        (error) => error?.code === "DB_SCHEMA_UNSUPPORTED"
      );
      const after = await inspectRaw(dbPath);
      assert.deepEqual(after, before);
      assert.equal(Number(after.schema[0].schema_version), 3);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("injected v3-to-v4 migration failures roll back every Demo Buy DDL phase and leave v3 usable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-v3-migration-fault-"));

  try {
    for (const checkpoint of ["M1", "M2", "M3"]) {
      const dbPath = path.join(tempDir, `${checkpoint}.duckdb`);
      await createValidV3(dbPath);

      await assert.rejects(
        () => openMarketFlowUsDatabase({
          dbPath,
          productVersion: "should-not-stick",
          migrationFault: {
            hit(value) {
              if (value === checkpoint) throw new Error(`fault-${checkpoint}`);
            }
          }
        }),
        new RegExp(`fault-${checkpoint}`)
      );

      const state = await inspectRaw(dbPath);
      assert.deepEqual(state.tables.includes("demo_buy_captures"), false);
      assert.deepEqual(state.tables.includes("demo_buy_items"), false);
      assert.deepEqual(state.schema, [{
        schema_version: 3,
        product_version: "schema-v3-fixture"
      }]);
      assert.deepEqual(state.savedQueries, [{
        query_id: "q1",
        name: "Keep query",
        sql_text: "SELECT 42"
      }]);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("schema v4 restart preserves active-day Demo Buy capture and bounded context provenance", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-v4-restart-"));
  const dbPath = path.join(tempDir, "restart.duckdb");

  try {
    const first = await openMarketFlowUsDatabase({ dbPath, now: () => 100 });
    await first.writerConnection.run(`
      INSERT INTO demo_buy_captures VALUES (
        7, 100, 'q7', 'Q7', 'SELECT securityId FROM latest', 3000,
        80, 90, 1,
        '{"version":1,"rows":[{"resultRank":1,"values":["101"]}]}',
        'manual', false, NULL
      )
    `);
    await first.writerConnection.run(
      "INSERT INTO demo_buy_items VALUES (7, 1, '101', 1)"
    );
    await first.close();

    const second = await openMarketFlowUsDatabase({ dbPath, now: () => 200 });
    try {
      assert.deepEqual(await rows(
        second.viewerReadConnection,
        `SELECT capture_id, source_query_id, source_query_sql,
                CAST(source_result_context_json AS VARCHAR) AS context_json
         FROM demo_buy_captures`
      ), [{
        capture_id: "7",
        source_query_id: "q7",
        source_query_sql: "SELECT securityId FROM latest",
        context_json: '{"version":1,"rows":[{"resultRank":1,"values":["101"]}]}'
      }]);
      assert.deepEqual(await rows(
        second.viewerReadConnection,
        "SELECT capture_id, result_rank, security_id, buy_cycle_id FROM demo_buy_items"
      ), [{
        capture_id: "7",
        result_rank: "1",
        security_id: "101",
        buy_cycle_id: "1"
      }]);
    } finally {
      await second.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
