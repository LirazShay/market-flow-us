import assert from "node:assert/strict";
import test from "node:test";

import { createServiceFixture } from "./helpers/service-fixture.mjs";

async function seedAuthority(fixture) {
  const writer = fixture.service.database.writerConnection;

  await writer.run(`
    INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'scanner-session', 'scanner-producer', 'stopped', 1000, 3000,
      'test', 3000, 2, 0, 2, 2200, '{}', NULL
    )
  `);

  await writer.run(`
    INSERT INTO universe (
      security_id, is_current, universe_revision, first_seen_at_ms,
      last_seen_at_ms, paper_name, map_heat_date_change_json, raw_map_heat
    ) VALUES
      ('1001', true, 1, 1000, 2200, 'Alpha', NULL, '{"PaperId":1001}'),
      ('1002', true, 1, 1000, 2200, 'Beta', NULL, '{"PaperId":1002}')
  `);

  await writer.run(`
    INSERT INTO cycles (
      cycle_id, session_id, universe_revision, status, started_at_ms,
      completed_at_ms, committed_at_ms, duration_ms, requested, received,
      unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
      failure_phase, error_json
    ) VALUES
      (1, 'scanner-session', 1, 'complete', 1900, 2000, 2000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
      (2, 'scanner-session', 1, 'complete', 2100, 2200, 2200, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL)
  `);

  await writer.run(`
    INSERT INTO history (
      cycle_id, session_id, universe_revision, security_id, chunk_index,
      cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      LastKnownRate, BaseRateChangePercentage, BuyLimit1, BuyVolume1,
      SellLimit1, SellVolume1, DailyDealsQuantity, LastDealVolume,
      DailyTurnover, DailyNISRevenue, DailyLowestRate, DailyHighestRate,
      LastDealTimeOnly, raw_data
    ) VALUES
      (1, 'scanner-session', 1, '1001', 0, 1900, 1990, 2000, 100, 1, 99, 10, 101, 11, 8, 1, 1000, 10000, 95, 105, '10:00:00', '{}'),
      (1, 'scanner-session', 1, '1002', 0, 1900, 1990, 2000, 200, 2, 199, 12, 201, 13, 9, 2, 2000, 20000, 190, 205, '10:00:01', '{}'),
      (2, 'scanner-session', 1, '1001', 0, 2100, 2190, 2200, 110, 3, 109, 14, 111, 15, 10, 3, 3000, 30000, 95, 115, '10:00:02', '{}'),
      (2, 'scanner-session', 1, '1002', 0, 2100, 2190, 2200, 190, -1, 189, 16, 191, 17, 11, 4, 4000, 40000, 185, 205, '10:00:03', '{}')
  `);

  await writer.run(`
    INSERT INTO latest
    SELECT * FROM history WHERE cycle_id = 2
  `);
}

async function authorityFingerprint(fixture) {
  const tables = ["schema_info", "sessions", "universe", "cycles", "history", "latest"];
  const snapshot = {
    schema: await fixture.rows(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'main'
        AND table_name IN ('schema_info', 'sessions', 'universe', 'cycles', 'history', 'latest')
      ORDER BY table_name, ordinal_position
    `),
    sequences: await fixture.rows(`
      SELECT sequence_name
      FROM duckdb_sequences()
      ORDER BY sequence_name
    `)
  };

  for (const table of tables) {
    snapshot[table] = await fixture.rows(`SELECT * FROM ${table} ORDER BY ALL`);
  }

  return JSON.stringify(snapshot);
}

test("scanner executes broad admitted analytical SELECTs with exact columns and row order", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    await seedAuthority(fixture);
    const viewer = await fixture.connect("viewer", "scanner-positive");

    const simple = await viewer.request("scanner.execute", {
      sql: "SELECT 42 AS answer"
    });
    assert.equal(simple.type, "response.ok");
    assert.deepEqual(simple.payload.data.columns, [{ name: "answer", type: "INTEGER" }]);
    assert.deepEqual(simple.payload.data.rows, [[42]]);
    assert.equal(simple.payload.data.rowCount, 1);
    assert.equal(simple.payload.data.startedAtMs, 5000);
    assert.equal(simple.payload.data.completedAtMs, 5000);
    assert.equal(simple.payload.data.durationMs, 0);

    const joined = await viewer.request("scanner.execute", {
      sql: `
        SELECT u.security_id, u.paper_name, l.LastKnownRate
        FROM latest AS l
        JOIN universe AS u ON u.security_id = l.security_id
        WHERE l.LastKnownRate >= 100
        ORDER BY l.LastKnownRate DESC
        LIMIT 2
      `
    });
    assert.equal(joined.type, "response.ok");
    assert.deepEqual(joined.payload.data.rows, [
      ["1002", "Beta", 190],
      ["1001", "Alpha", 110]
    ]);

    const grouped = await viewer.request("scanner.execute", {
      sql: `
        SELECT security_id, COUNT(*) AS samples, MAX(LastKnownRate) AS peak
        FROM history
        GROUP BY security_id
        HAVING COUNT(*) >= 2
        ORDER BY peak DESC
      `
    });
    assert.equal(grouped.type, "response.ok");
    assert.deepEqual(grouped.payload.data.rows, [
      ["1002", "2", 200],
      ["1001", "2", 110]
    ]);

    const ranked = await viewer.request("scanner.execute", {
      sql: `
        SELECT security_id, collected_at_ms,
               RANK() OVER (PARTITION BY security_id ORDER BY collected_at_ms DESC) AS recency_rank
        FROM history
        WHERE collected_at_ms >= 2000
        ORDER BY security_id, collected_at_ms DESC
      `
    });
    assert.equal(ranked.type, "response.ok");
    assert.deepEqual(ranked.payload.data.rows, [
      ["1001", "2200", "1"],
      ["1001", "2000", "2"],
      ["1002", "2200", "1"],
      ["1002", "2000", "2"]
    ]);

    const temporal = await viewer.request("scanner.execute", {
      sql: "SELECT DATE '2026-09-27' + INTERVAL 1 DAY AS next_day"
    });
    assert.equal(temporal.type, "response.ok");
    assert.deepEqual(temporal.payload.data.columns, [
      { name: "next_day", type: "TIMESTAMP" }
    ]);
    assert.equal(temporal.payload.data.rowCount, 1);

    const duplicateColumns = await viewer.request("scanner.execute", {
      sql: "SELECT 1 AS duplicate, 2 AS duplicate"
    });
    assert.equal(duplicateColumns.type, "response.ok");
    assert.deepEqual(duplicateColumns.payload.data.columns, [
      { name: "duplicate", type: "INTEGER" },
      { name: "duplicate", type: "INTEGER" }
    ]);
    assert.deepEqual(duplicateColumns.payload.data.rows, [[1, 2]]);

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("scanner rejects non-read-only or unsafe SQL and preserves authority for every rejection", async () => {
  const fixture = await createServiceFixture();

  try {
    await seedAuthority(fixture);
    await fixture.service.database.writerConnection.run("CREATE SEQUENCE scanner_guard_sequence START 7");
    const viewer = await fixture.connect("viewer", "scanner-negative");

    const cases = [
      ["   ", "SCANNER_EMPTY_SQL"],
      ["SELECT 1; SELECT 2", "SCANNER_MULTIPLE_STATEMENTS"],
      ["INSERT INTO universe (security_id) VALUES ('x')", "SCANNER_NON_SELECT"],
      ["UPDATE universe SET paper_name = 'changed'", "SCANNER_NON_SELECT"],
      ["DELETE FROM universe", "SCANNER_NON_SELECT"],
      ["CREATE TABLE scanner_bad(i INTEGER)", "SCANNER_NON_SELECT"],
      ["DROP TABLE latest", "SCANNER_NON_SELECT"],
      ["ALTER TABLE universe ADD COLUMN scanner_bad INTEGER", "SCANNER_NON_SELECT"],
      ["SELECT $1", "SCANNER_PARAMETERS_UNSUPPORTED"],
      ["SELECT * FROM query('SELECT 1')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT * FROM query_table('latest')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT nextval('scanner_guard_sequence')", "SCANNER_FORBIDDEN_FUNCTION"],
      ["SELECT * FROM \"query_table\"('latest')", "SCANNER_FORBIDDEN_FUNCTION"]
    ];

    for (const [sql, expectedCode] of cases) {
      const before = await authorityFingerprint(fixture);
      const response = await viewer.request("scanner.execute", { sql });
      const after = await authorityFingerprint(fixture);

      assert.equal(response.type, "response.error", sql);
      assert.equal(response.payload.code, expectedCode, sql);
      assert.equal(after, before, sql);
    }

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
