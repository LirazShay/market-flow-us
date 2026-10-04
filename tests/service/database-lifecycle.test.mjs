import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { openMarketScopeDatabase } from "../../local-service/database/database.js";
import { REQUIRED_TABLES } from "../../local-service/database/schema.js";

async function rowObjects(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

function worker(mode, dbPath) {
  const result = spawnSync(
    process.execPath,
    ["tests/service/helpers/database-worker.mjs", mode, dbPath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env }
    }
  );

  assert.equal(
    result.status,
    0,
    `worker ${mode} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );

  const line = result.stdout.trim().split("\n").filter(Boolean).at(-1);
  return line ? JSON.parse(line) : null;
}

test("fresh native DuckDB creates exact schema-v2 and hardened fixed connections", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-db-"));
  const dbPath = path.join(tempDir, "fresh.duckdb");
  const database = await openMarketScopeDatabase({
    dbPath,
    productVersion: "test-version",
    now: () => 123456789
  });

  try {
    assert.equal(database.ready, true);
    assert.notEqual(database.writerConnection, database.viewerReadConnection);
    assert.notEqual(database.writerConnection, database.scannerConnection);

    const tables = await rowObjects(
      database.viewerReadConnection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    );
    assert.deepEqual(
      tables.map((row) => row.table_name).sort(),
      [...REQUIRED_TABLES].sort()
    );

    const schema = await rowObjects(
      database.viewerReadConnection,
      "SELECT schema_version, created_at_ms, product_version FROM schema_info"
    );
    assert.deepEqual(schema, [{
      schema_version: 2,
      created_at_ms: "123456789",
      product_version: "test-version"
    }]);

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
       )
       ORDER BY name`
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

    await assert.rejects(
      () => database.scannerConnection.run("SET threads = 1"),
      /configuration|locked/i
    );
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("schema-v2 reopens cleanly across processes and stale running sessions recover before readiness", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-reopen-"));
  const dbPath = path.join(tempDir, "reopen.duckdb");

  try {
    const first = worker("bootstrap", dbPath);
    assert.deepEqual(first.tables.sort(), [...REQUIRED_TABLES].sort());

    const second = worker("bootstrap", dbPath);
    assert.deepEqual(second.tables.sort(), [...REQUIRED_TABLES].sort());

    assert.deepEqual(worker("seed-running", dbPath), { seeded: true });
    const recovered = worker("inspect-stale", dbPath);

    assert.equal(recovered.status, "interrupted");
    assert.equal(recovered.stopped_at_ms, "1700000000000");
    assert.equal(recovered.stop_reason, "service_restart");

    const afterRecovery = worker("bootstrap", dbPath);
    assert.deepEqual(afterRecovery.tables.sort(), [...REQUIRED_TABLES].sort());
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("unsupported future schema version fails closed with stable DB_SCHEMA_UNSUPPORTED code", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-schema-"));
  const dbPath = path.join(tempDir, "unsupported.duckdb");

  try {
    worker("bootstrap", dbPath);
    assert.deepEqual(worker("set-unsupported", dbPath), { schemaVersion: 99 });
    assert.deepEqual(worker("expect-unsupported", dbPath), {
      code: "DB_SCHEMA_UNSUPPORTED"
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
