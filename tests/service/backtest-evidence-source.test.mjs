import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
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
  BacktestEvidenceSourceError,
  openBacktestEvidenceSource
} from "../../backtest-lab/evidence-source.js";
import { listBacktestEvidenceSources } from "../../backtest-lab/source-catalog.js";

async function seedSession(connection, { status = "stopped" } = {}) {
  const running = status === "running";
  await connection.run(
    `INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'session-evidence', 'producer-test', $status, 1000, $stoppedAtMs,
      $stopReason, 1100, 0, 0, NULL, NULL, '{}', NULL
    )`,
    {
      status,
      stoppedAtMs: running ? null : 1200,
      stopReason: running ? null : "normal"
    }
  );
}

async function seedV4(dbPath, { sessionStatus = "stopped" } = {}) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-test-v4",
    now: () => 1700000000000
  });
  try {
    await seedSession(database.writerConnection, { status: sessionStatus });
  } finally {
    await database.close();
  }
}

async function seedV3(dbPath, { sessionStatus = "stopped" } = {}) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("BEGIN TRANSACTION");
    for (const statement of MARKET_FLOW_US_V3_CREATE_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES ($schemaVersion, 1700000000000, 'backtest-test-v3')",
      { schemaVersion: MARKET_FLOW_US_V3_SCHEMA_VERSION }
    );
    await seedSession(connection, { status: sessionStatus });
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

async function queryRows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

async function rawRows(dbPath, sql) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    return await queryRows(connection, sql);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function assertReadOnlySource({ dataDir, sourceId, expectedSchemaVersion }) {
  const sourcePath = sourceId === "active"
    ? path.join(dataDir, "market-flow-us.duckdb")
    : path.join(dataDir, "archive", sourceId.slice("archive:".length));
  const before = await readFile(sourcePath);
  const source = await openBacktestEvidenceSource({ dataDir, sourceId });

  try {
    assert.equal(source.schemaVersion, expectedSchemaVersion);
    assert.equal(source.source.sourceId, sourceId);
    assert.equal(Object.hasOwn(source.source, "path"), false);

    assert.deepEqual(
      await queryRows(source.connection, "SELECT schema_version FROM schema_info"),
      [{ schema_version: expectedSchemaVersion }]
    );
    assert.deepEqual(
      await queryRows(
        source.connection,
        "SELECT session_id, status, stopped_at_ms, stop_reason FROM sessions"
      ),
      [{
        session_id: "session-evidence",
        status: "stopped",
        stopped_at_ms: "1200",
        stop_reason: "normal"
      }]
    );

    const accessMode = await queryRows(
      source.connection,
      "SELECT value FROM duckdb_settings() WHERE name = 'access_mode'"
    );
    assert.deepEqual(accessMode, [{ value: "read_only" }]);

    await assert.rejects(
      () => source.connection.run("CREATE TABLE backtest_must_not_write (id INTEGER)")
    );
  } finally {
    await source.close();
  }

  assert.deepEqual(await readFile(sourcePath), before);
}

test("Backtest source catalog enumerates only product-owned active/archive DuckDB files without exposing paths", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-catalog-"));
  const archiveDir = path.join(dataDir, "archive");
  const archiveName = "market-flow-us-20261010T200000000Z.duckdb";

  try {
    await mkdir(archiveDir, { recursive: true });
    await seedV4(path.join(dataDir, "market-flow-us.duckdb"));
    await seedV3(path.join(archiveDir, archiveName));
    await writeFile(path.join(dataDir, "other.duckdb"), "not a product source");
    await writeFile(path.join(archiveDir, "notes.txt"), "ignore me");
    await writeFile(path.join(archiveDir, "market-flow-us-wrong.db"), "ignore me");

    assert.deepEqual(await listBacktestEvidenceSources({ dataDir }), [
      {
        sourceId: "active",
        kind: "active",
        fileName: "market-flow-us.duckdb"
      },
      {
        sourceId: `archive:${archiveName}`,
        kind: "archive",
        fileName: archiveName
      }
    ]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest opens schema v4 evidence read-only without mutation", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-v4-"));
  try {
    await seedV4(path.join(dataDir, "market-flow-us.duckdb"));
    await assertReadOnlySource({
      dataDir,
      sourceId: "active",
      expectedSchemaVersion: MARKET_FLOW_US_SCHEMA_VERSION
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest opens schema v3 archive evidence read-only without migrating it to v4", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-v3-"));
  const archiveDir = path.join(dataDir, "archive");
  const archiveName = "market-flow-us-20261009T200000000Z.duckdb";

  try {
    await mkdir(archiveDir, { recursive: true });
    await seedV3(path.join(archiveDir, archiveName));
    await assertReadOnlySource({
      dataDir,
      sourceId: `archive:${archiveName}`,
      expectedSchemaVersion: MARKET_FLOW_US_V3_SCHEMA_VERSION
    });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest rejects durable running-session ownership without stale-session recovery or source mutation", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-in-use-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await seedV4(dbPath, { sessionStatus: "running" });
    const before = await readFile(dbPath);

    await assert.rejects(
      () => openBacktestEvidenceSource({ dataDir, sourceId: "active" }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_IN_USE");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );

    assert.deepEqual(await readFile(dbPath), before);
    assert.deepEqual(
      await rawRows(
        dbPath,
        "SELECT session_id, status, stopped_at_ms, stop_reason FROM sessions"
      ),
      [{
        session_id: "session-evidence",
        status: "running",
        stopped_at_ms: null,
        stop_reason: null
      }]
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest rejects arbitrary source ids, missing sources, corrupt files and incompatible schemas with bounded errors", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-errors-"));
  const activePath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await assert.rejects(
      () => openBacktestEvidenceSource({
        dataDir,
        sourceId: "archive:../outside.duckdb"
      }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_INVALID_SELECTION");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );

    await assert.rejects(
      () => openBacktestEvidenceSource({ dataDir, sourceId: "active" }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_MISSING");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );

    await writeFile(activePath, "not a DuckDB database");
    await assert.rejects(
      () => openBacktestEvidenceSource({ dataDir, sourceId: "active" }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_UNAVAILABLE");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );

    await rm(activePath, { force: true });
    const instance = await DuckDBInstance.create(activePath, DUCKDB_HARDENING);
    const connection = await instance.connect();
    try {
      await connection.run("CREATE TABLE unrelated (id INTEGER)");
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
    const before = await readFile(activePath);

    await assert.rejects(
      () => openBacktestEvidenceSource({ dataDir, sourceId: "active" }),
      (error) => {
        assert.ok(error instanceof BacktestEvidenceSourceError);
        assert.equal(error.code, "BACKTEST_SOURCE_INCOMPATIBLE");
        assert.equal(error.message.includes(dataDir), false);
        return true;
      }
    );
    assert.deepEqual(await readFile(activePath), before);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
