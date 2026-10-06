import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase,
  openMarketScopeDatabase
} from "../../local-service/database/database.js";
import {
  LEGACY_V1_SCHEMA_STATEMENTS,
  MARKET_FLOW_US_REQUIRED_TABLES,
  MARKET_FLOW_US_SCHEMA_VERSION
} from "../../local-service/database/schema.js";

async function rowObjects(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function inspectRawDatabase(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    const tables = await rowObjects(
      connection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    );
    const schema = await rowObjects(
      connection,
      "SELECT schema_version, created_at_ms, product_version FROM schema_info"
    );
    return {
      tables: tables.map((row) => row.table_name),
      schema
    };
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function createLegacyV1(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    for (const statement of LEGACY_V1_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES (1, 111, 'legacy-v1')"
    );
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function typeMap(rows) {
  return Object.fromEntries(rows.map((row) => [row.column_name, row.data_type]));
}

test("fresh Market Flow US DuckDB boots as schema v4 with exact U.S. authority columns and hardened connections", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-db-"));
  const dbPath = path.join(tempDir, "fresh.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "test-us",
    now: () => 123456789
  });

  try {
    assert.equal(database.ready, true);
    assert.equal(database.schemaVersion, MARKET_FLOW_US_SCHEMA_VERSION);
    assert.notEqual(database.writerConnection, database.viewerReadConnection);
    assert.notEqual(database.writerConnection, database.scannerConnection);

    const tables = await rowObjects(
      database.viewerReadConnection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    );
    assert.deepEqual(
      tables.map((row) => row.table_name).sort(),
      [...MARKET_FLOW_US_REQUIRED_TABLES].sort()
    );

    const schema = await rowObjects(
      database.viewerReadConnection,
      "SELECT schema_version, created_at_ms, product_version FROM schema_info"
    );
    assert.deepEqual(schema, [{
      schema_version: 4,
      created_at_ms: "123456789",
      product_version: "test-us"
    }]);

    const universeColumns = typeMap(await rowObjects(
      database.viewerReadConnection,
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'main' AND table_name = 'universe'`
    ));
    assert.deepEqual(universeColumns, {
      security_id: "VARCHAR",
      is_current: "BOOLEAN",
      universe_revision: "BIGINT",
      first_seen_at_ms: "BIGINT",
      last_seen_at_ms: "BIGINT",
      Symbol: "VARCHAR",
      PaperNameEng: "VARCHAR",
      PaperNameHeb: "VARCHAR",
      ExchangeName: "VARCHAR",
      raw_source: "JSON"
    });

    const marketColumns = typeMap(await rowObjects(
      database.viewerReadConnection,
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'main' AND table_name = 'history'`
    ));
    for (const [column, type] of Object.entries({
      cycle_id: "BIGINT",
      session_id: "VARCHAR",
      universe_revision: "BIGINT",
      security_id: "VARCHAR",
      chunk_index: "INTEGER",
      cycle_started_at_ms: "BIGINT",
      chunk_received_at_ms: "BIGINT",
      collected_at_ms: "BIGINT",
      source_metadata_json: "JSON",
      Symbol: "VARCHAR",
      PaperNameEng: "VARCHAR",
      PaperNameHeb: "VARCHAR",
      ExchangeName: "VARCHAR",
      TradeDateTime: "VARCHAR",
      CountryName: "VARCHAR",
      CountryNameEng: "VARCHAR",
      Price: "DOUBLE",
      ChangePercent: "DOUBLE",
      DailyHigh: "DOUBLE",
      DailyLow: "DOUBLE",
      YearHigh: "DOUBLE",
      YearLow: "DOUBLE",
      DailyVolume: "DOUBLE",
      BeginYearChangePercent: "DOUBLE",
      Month12ChangePercent: "DOUBLE",
      Month36ChangePercent: "DOUBLE",
      AskRate: "DOUBLE",
      BidRate: "DOUBLE",
      YesterdayRate: "DOUBLE",
      PaperMarketCap: "DOUBLE",
      PaperIdYatab: "DOUBLE",
      CountryId: "DOUBLE",
      PaperType: "DOUBLE",
      ESGRatingId: "DOUBLE",
      ESGScope: "DOUBLE",
      raw_data: "JSON"
    })) {
      assert.equal(marketColumns[column], type, `${column} type`);
    }

    const latestColumns = typeMap(await rowObjects(
      database.viewerReadConnection,
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'main' AND table_name = 'latest'`
    ));
    assert.deepEqual(latestColumns, marketColumns);

    const settings = await rowObjects(
      database.viewerReadConnection,
      `SELECT name, value
       FROM duckdb_settings()
       WHERE name IN (
         'enable_external_access',
         'allow_community_extensions',
         'autoinstall_known_extensions',
         'autoload_known_extensions',
         'allow_persistent_secrets',
         'allow_unsigned_extensions',
         'allow_unredacted_secrets',
         'allowed_configs',
         'lock_configuration'
       )`
    );
    const values = Object.fromEntries(settings.map((row) => [row.name, row.value]));
    assert.equal(values.enable_external_access, "false");
    assert.equal(values.allow_community_extensions, "false");
    assert.equal(values.autoinstall_known_extensions, "false");
    assert.equal(values.autoload_known_extensions, "false");
    assert.equal(values.allow_persistent_secrets, "false");
    assert.equal(values.allow_unsigned_extensions, "false");
    assert.equal(values.allow_unredacted_secrets, "false");
    assert.equal(values.allowed_configs, "[]");
    assert.equal(values.lock_configuration, "true");
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("schema v4 reopens with saved queries and stale-session recovery intact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-reopen-"));
  const dbPath = path.join(tempDir, "reopen.duckdb");

  try {
    const first = await openMarketFlowUsDatabase({ dbPath, now: () => 1000 });
    await first.writerConnection.run(`
      INSERT INTO scanner_saved_queries VALUES (
        'q1', 'US query', 'us query', 'SELECT 1', 3000, 100, 100
      )
    `);
    await first.writerConnection.run(`
      INSERT INTO sessions VALUES (
        'stale', 'producer', 'running', 100, NULL, NULL, 200,
        0, 0, NULL, NULL, '{"snapshotIntervalMs":3000}', NULL
      )
    `);
    await first.close();

    const second = await openMarketFlowUsDatabase({ dbPath, now: () => 1700000000000 });
    try {
      const queryRows = await rowObjects(
        second.viewerReadConnection,
        "SELECT query_id, name, sql_text FROM scanner_saved_queries"
      );
      assert.deepEqual(queryRows, [{ query_id: "q1", name: "US query", sql_text: "SELECT 1" }]);

      const sessionRows = await rowObjects(
        second.viewerReadConnection,
        "SELECT status, stopped_at_ms, stop_reason FROM sessions WHERE session_id = 'stale'"
      );
      assert.deepEqual(sessionRows, [{
        status: "interrupted",
        stopped_at_ms: "1700000000000",
        stop_reason: "service_restart"
      }]);
    } finally {
      await second.close();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Market Flow US rejects old MarketScope v1 and v2 databases without schema mutation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-old-schema-"));
  const v1Path = path.join(tempDir, "v1.duckdb");
  const v2Path = path.join(tempDir, "v2.duckdb");

  try {
    await createLegacyV1(v1Path);
    const legacyV2 = await openMarketScopeDatabase({
      dbPath: v2Path,
      productVersion: "legacy-v2",
      now: () => 222
    });
    await legacyV2.close();

    for (const dbPath of [v1Path, v2Path]) {
      const before = await inspectRawDatabase(dbPath);
      await assert.rejects(
        () => openMarketFlowUsDatabase({ dbPath }),
        (error) => error?.code === "DB_SCHEMA_UNSUPPORTED"
      );
      const after = await inspectRawDatabase(dbPath);
      assert.deepEqual(after, before);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
