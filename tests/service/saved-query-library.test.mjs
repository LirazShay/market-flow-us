import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DuckDBInstance } from "@duckdb/node-api";
import { WebSocket } from "ws";

import {
  DUCKDB_HARDENING,
  openMarketScopeDatabase
} from "../../local-service/database/database.js";
import {
  LEGACY_V1_SCHEMA_STATEMENTS,
  REQUIRED_TABLES
} from "../../local-service/database/schema.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
import {
  createPersistenceFaultInjector,
  createServiceFixture,
  DEFAULT_TEST_ORIGIN
} from "./helpers/service-fixture.mjs";

async function rows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function createLegacyV1Database(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();

  await connection.run("BEGIN TRANSACTION");
  try {
    for (const statement of LEGACY_V1_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES (1, 111, 'legacy-product')"
    );
    await connection.run(
      `INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES ('legacy-session', 'legacy-producer', 'stopped', 10, 20, 'user', 20, 1, 0, 1, 15, '{}', NULL)`
    );
    await connection.run(
      `INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms, last_seen_at_ms,
        paper_name, map_heat_date_change_json, raw_map_heat
      ) VALUES ('42', true, 1, 1, 2, 'Legacy Paper', 'null', '{"PaperId":42}')`
    );
    await connection.run(
      `INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES (1, 'legacy-session', 1, 'complete', 10, 15, 16, 5, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)`
    );

    const marketColumns = `(
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      server_as_of_date_json, LastKnownRate, BaseRateChangePercentage,
      BuyLimit1, BuyVolume1, SellLimit1, SellVolume1, DailyDealsQuantity,
      LastDealVolume, DailyTurnover, DailyNISRevenue, DailyLowestRate,
      DailyHighestRate, LastDealTimeOnly, raw_data
    )`;
    const marketValues = `(
      1, 'legacy-session', 1, '42', 0, 10, 14, 15, 'null',
      100, 1.5, 99, 10, 101, 12, 20, 3, 2000, 2000, 98, 102,
      '12:00:00', '{"Key":42,"LastKnownRate":100}'
    )`;
    await connection.run(`INSERT INTO history ${marketColumns} VALUES ${marketValues}`);
    await connection.run(`INSERT INTO latest ${marketColumns} VALUES ${marketValues}`);
    await connection.run("COMMIT");
  } catch (error) {
    await connection.run("ROLLBACK");
    throw error;
  } finally {
    connection.closeSync();
  }
}

async function rawFingerprint(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    const info = await rows(connection, "SELECT schema_version, created_at_ms, product_version FROM schema_info");
    const tables = await rows(
      connection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY table_name"
    );
    const counts = {};
    for (const table of ["sessions", "universe", "cycles", "history", "latest"]) {
      const result = await rows(connection, `SELECT COUNT(*) AS count FROM ${table}`);
      counts[table] = String(result[0].count);
    }
    const latest = await rows(
      connection,
      "SELECT security_id, LastKnownRate, raw_data FROM latest ORDER BY security_id"
    );
    return {
      info,
      tables: tables.map((row) => row.table_name),
      counts,
      latest
    };
  } finally {
    connection.closeSync();
  }
}

function serviceConfig(dbPath) {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath,
    maxInboundMessageBytes: 16 * 1024 * 1024,
    producerHeartbeatMs: 5000,
    producerStaleAfterMs: 15000,
    historyPageSize: 500,
    allowedOrigins: [DEFAULT_TEST_ORIGIN]
  };
}

async function openViewer(service, id = "saved-query-viewer") {
  const socket = new WebSocket(`ws://127.0.0.1:${service.port}`, {
    origin: DEFAULT_TEST_ORIGIN
  });
  await once(socket, "open");
  let sequence = 0;

  async function request(type, payload = {}) {
    sequence += 1;
    const response = once(socket, "message");
    socket.send(JSON.stringify({
      v: 1,
      type,
      requestId: `${id}-${sequence}`,
      payload
    }));
    const [data] = await response;
    return JSON.parse(data.toString());
  }

  const hello = await request("client.hello", {
    role: "viewer",
    clientInstanceId: id,
    productVersion: "test-client"
  });
  assert.equal(hello.type, "response.ok");

  return {
    request,
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close");
      socket.close();
      await closed;
    }
  };
}

test("schema v1 migrates transactionally to v2 and preserves all existing authority facts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-v1-v2-"));
  const dbPath = path.join(tempDir, "legacy.duckdb");

  try {
    await createLegacyV1Database(dbPath);
    const before = await rawFingerprint(dbPath);
    assert.equal(Number(before.info[0].schema_version), 1);

    const database = await openMarketScopeDatabase({
      dbPath,
      productVersion: "v2-test",
      now: () => 999
    });
    await database.close();

    const after = await rawFingerprint(dbPath);
    assert.equal(Number(after.info[0].schema_version), 2);
    assert.equal(String(after.info[0].created_at_ms), "111");
    assert.equal(after.info[0].product_version, "v2-test");
    assert.deepEqual(after.tables.sort(), [...REQUIRED_TABLES].sort());
    assert.deepEqual(after.counts, before.counts);
    assert.deepEqual(after.latest, before.latest);

    const reopened = await openMarketScopeDatabase({
      dbPath,
      productVersion: "v2-reopen",
      now: () => 1000
    });
    await reopened.close();
    const afterReopen = await rawFingerprint(dbPath);
    assert.equal(Number(afterReopen.info[0].schema_version), 2);
    assert.deepEqual(afterReopen.counts, before.counts);
    assert.deepEqual(afterReopen.latest, before.latest);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("injected migration failure rolls back schema change and preserves v1 authority", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-v1-v2-fault-"));
  const dbPath = path.join(tempDir, "legacy.duckdb");

  try {
    await createLegacyV1Database(dbPath);
    const before = await rawFingerprint(dbPath);

    await assert.rejects(
      () => openMarketScopeDatabase({
        dbPath,
        productVersion: "v2-test",
        migrationFault: {
          hit(point) {
            if (point === "M1") throw new Error("injected migration failure");
          }
        }
      }),
      /injected migration failure/
    );

    const after = await rawFingerprint(dbPath);
    assert.deepEqual(after, before);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("saved-query protocol provides durable CRUD, deterministic ordering and explicit conflicts", async () => {
  const fixture = await createServiceFixture({
    now: (() => {
      let value = 1000;
      return () => value++;
    })()
  });

  try {
    const viewer = await fixture.connect("viewer", "query-crud");

    const initial = await viewer.request("scanner.queries.list");
    assert.equal(initial.type, "response.ok");
    assert.deepEqual(
      initial.payload.data.queries.map((query) => [query.queryId, query.name, query.source]),
      [
        ["builtin:all-current-fields", "All current fields", "builtin"],
        ["builtin:market-ranking-example", "Market ranking example", "builtin"]
      ]
    );

    const beta = await viewer.request("scanner.queries.create", {
      name: "Beta",
      sql: "select 2",
      intervalMs: 6000
    });
    assert.equal(beta.type, "response.ok");
    assert.match(beta.payload.data.query.queryId, /^user:/);

    const alpha = await viewer.request("scanner.queries.create", {
      name: "Alpha   Query",
      sql: "select 1",
      intervalMs: 5000
    });
    assert.equal(alpha.type, "response.ok");

    const conflict = await viewer.request("scanner.queries.create", {
      name: "  ALPHA QUERY ",
      sql: "select 3",
      intervalMs: 5000
    });
    assert.equal(conflict.payload.code, "SCANNER_QUERY_NAME_CONFLICT");

    const builtinConflict = await viewer.request("scanner.queries.create", {
      name: " all current fields ",
      sql: "select 4",
      intervalMs: 5000
    });
    assert.equal(builtinConflict.payload.code, "SCANNER_QUERY_NAME_CONFLICT");

    const list = await viewer.request("scanner.queries.list");
    assert.deepEqual(
      list.payload.data.queries.map((query) => query.name),
      ["All current fields", "Market ranking example", "Alpha   Query", "Beta"]
    );

    const alphaId = alpha.payload.data.query.queryId;
    const updated = await viewer.request("scanner.queries.update", {
      queryId: alphaId,
      name: "Gamma",
      sql: "this can be invalid sql and still be saved",
      intervalMs: 7000
    });
    assert.equal(updated.payload.data.query.name, "Gamma");
    assert.equal(updated.payload.data.query.intervalMs, 7000);

    const readonlyUpdate = await viewer.request("scanner.queries.update", {
      queryId: "builtin:all-current-fields",
      name: "Nope",
      sql: "select 1",
      intervalMs: 5000
    });
    assert.equal(readonlyUpdate.payload.code, "SCANNER_QUERY_READ_ONLY");

    const readonlyDelete = await viewer.request("scanner.queries.delete", {
      queryId: "builtin:market-ranking-example"
    });
    assert.equal(readonlyDelete.payload.code, "SCANNER_QUERY_READ_ONLY");

    const missing = await viewer.request("scanner.queries.delete", {
      queryId: "user:00000000-0000-0000-0000-000000000000"
    });
    assert.equal(missing.payload.code, "NOT_FOUND");

    const deleted = await viewer.request("scanner.queries.delete", {
      queryId: beta.payload.data.query.queryId
    });
    assert.equal(deleted.payload.data.queryId, beta.payload.data.query.queryId);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("saved user queries persist across service restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-query-restart-"));
  const dbPath = path.join(tempDir, "queries.duckdb");
  let first;
  let second;

  try {
    first = await startMarketScopeService({
      config: serviceConfig(dbPath),
      serviceVersion: "test-version",
      now: () => 2000
    });
    const viewer1 = await openViewer(first, "restart-one");
    const created = await viewer1.request("scanner.queries.create", {
      name: "Persistent",
      sql: "select * from latest limit 5",
      intervalMs: 9000
    });
    assert.equal(created.type, "response.ok");
    await viewer1.close();
    await first.close();
    first = null;

    second = await startMarketScopeService({
      config: serviceConfig(dbPath),
      serviceVersion: "test-version",
      now: () => 3000
    });
    const viewer2 = await openViewer(second, "restart-two");
    const list = await viewer2.request("scanner.queries.list");
    const persisted = list.payload.data.queries.find((query) => query.name === "Persistent");
    assert.ok(persisted);
    assert.equal(persisted.sql, "select * from latest limit 5");
    assert.equal(persisted.intervalMs, 9000);
    await viewer2.close();
  } finally {
    await first?.close();
    await second?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("injected saved-query CRUD failure rolls back config and leaves market authority unchanged", async () => {
  const persistenceFault = createPersistenceFaultInjector(["Q1"]);
  const fixture = await createServiceFixture({ persistenceFault });

  try {
    const viewer = await fixture.connect("viewer", "query-fault");
    const before = {};
    for (const table of ["sessions", "universe", "cycles", "history", "latest"]) {
      before[table] = await fixture.rows(`SELECT COUNT(*) AS count FROM ${table}`);
    }

    const failed = await viewer.request("scanner.queries.create", {
      name: "Must Roll Back",
      sql: "select 1",
      intervalMs: 5000
    });
    assert.equal(failed.type, "response.error");
    assert.equal(failed.payload.code, "DB_ERROR");

    const saved = await fixture.rows(
      "SELECT query_id FROM scanner_saved_queries WHERE name_key = 'must roll back'"
    );
    assert.deepEqual(saved, []);

    const after = {};
    for (const table of ["sessions", "universe", "cycles", "history", "latest"]) {
      after[table] = await fixture.rows(`SELECT COUNT(*) AS count FROM ${table}`);
    }
    assert.deepEqual(after, before);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
