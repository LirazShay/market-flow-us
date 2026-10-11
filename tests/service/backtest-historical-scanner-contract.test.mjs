import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openBacktestHistoricalScanner } from "../../backtest-lab/historical-scanner.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

const SAVED_QUERY_SQL = "SELECT security_id FROM latest ORDER BY Price DESC";
const EDITABLE_QUERY_SQL = `SELECT security_id AS securityId, Price
FROM latest
WHERE Price >= 11
ORDER BY Price DESC, security_id`;

async function seedBoundaryEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-historical-scanner-contract-test",
    now: () => 10_000
  });
  const connection = database.writerConnection;

  try {
    await connection.run(`
      INSERT INTO sessions (
        session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
        stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
        last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
      ) VALUES (
        'backtest-contract-session', 'backtest-contract-producer', 'stopped',
        500, 4_000, 'test', 4_000, 4, 1, 5, 3_000, '{}', NULL
      )
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'backtest-contract-session', 1, 'complete', 800, 900, 1_000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'backtest-contract-session', 1, 'complete', 1_800, 1_900, 2_000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'backtest-contract-session', 1, 'failed', 2_300, 2_400, 2_500, 100, 2, 1, 1, 1, 0, 0, 1, '[]', 'provider-fetch', '{"message":"expected"}'),
        (4, 'backtest-contract-session', 1, 'complete', 2_800, 2_900, 3_000, 100, 3, 3, 3, 0, 0, 0, 1, '[]', NULL, NULL),
        (5, 'backtest-contract-session', 1, 'complete', 2_850, 2_950, 3_000, 100, 3, 3, 3, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, Price,
        ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'backtest-contract-session', 1, '1001', 0, 800, 890, 900, NULL, 'AAA', 'Alpha', 'NYSE', 10, 1, 100, '{}'),
        (1, 'backtest-contract-session', 1, '1002', 0, 800, 890, 900, NULL, 'BBB', 'Beta', 'NASDAQ', 20, 2, 200, '{}'),
        (2, 'backtest-contract-session', 1, '1001', 0, 1_800, 1_890, 1_900, NULL, 'AAA', 'Alpha', 'NYSE', 11, 1.1, 110, '{}'),
        (2, 'backtest-contract-session', 1, '1002', 0, 1_800, 1_890, 1_900, NULL, 'BBB', 'Beta', 'NASDAQ', 21, 2.1, 210, '{}'),
        (4, 'backtest-contract-session', 1, '1001', 0, 2_800, 2_890, 2_900, NULL, 'AAA', 'Alpha', 'NYSE', 12, 1.2, 120, '{}'),
        (4, 'backtest-contract-session', 1, '1002', 0, 2_800, 2_890, 2_900, NULL, 'BBB', 'Beta', 'NASDAQ', 22, 2.2, 220, '{}'),
        (4, 'backtest-contract-session', 1, '9999', 0, 2_800, 2_890, 2_900, NULL, 'FUT', 'Future', 'NYSE', 999, 99, 9_999, '{}'),
        (5, 'backtest-contract-session', 1, '1001', 0, 2_850, 2_940, 2_950, NULL, 'AAA', 'Alpha', 'NYSE', 13, 1.3, 130, '{}'),
        (5, 'backtest-contract-session', 1, '1002', 0, 2_850, 2_940, 2_950, NULL, 'BBB', 'Beta', 'NASDAQ', 23, 2.3, 230, '{}'),
        (5, 'backtest-contract-session', 1, '9999', 0, 2_850, 2_940, 2_950, NULL, 'FUT', 'Future', 'NYSE', 1_000, 100, 10_000, '{}')
    `);

    await connection.run("DELETE FROM latest");
    await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 5");
    await connection.run(
      `INSERT INTO scanner_saved_queries (
        query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
      ) VALUES (
        'user:backtest-contract', 'Backtest contract', 'backtest contract',
        $sql, 10_000, 3_000, 3_000
      )`,
      { sql: SAVED_QUERY_SQL }
    );
  } finally {
    await database.close();
  }
}

async function withEvidence(run) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-contract-"));
  try {
    await seedBoundaryEvidence(path.join(dataDir, "market-flow-us.duckdb"));
    await run(dataDir);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("Backtest historical Scanner resolves before/between/equal/after boundaries and ignores failed cycles deterministically", async () => {
  await withEvidence(async (dataDir) => {
    const cases = [
      [999, null],
      [1_000, { cycleId: 1, committedAtMs: 1_000 }],
      [1_500, { cycleId: 1, committedAtMs: 1_000 }],
      [1_999, { cycleId: 1, committedAtMs: 1_000 }],
      [2_000, { cycleId: 2, committedAtMs: 2_000 }],
      [2_500, { cycleId: 2, committedAtMs: 2_000 }],
      [2_999, { cycleId: 2, committedAtMs: 2_000 }],
      [3_000, { cycleId: 5, committedAtMs: 3_000 }],
      [9_999, { cycleId: 5, committedAtMs: 3_000 }]
    ];

    for (const [requestedAtMs, expectedBaseline] of cases) {
      const point = await openBacktestHistoricalScanner({
        dataDir,
        sourceId: "active",
        requestedAtMs
      });
      try {
        assert.equal(point.requestedAtMs, requestedAtMs);
        assert.equal(point.available, expectedBaseline !== null);
        assert.deepEqual(point.baseline, expectedBaseline);
      } finally {
        await point.close();
      }
    }
  });
});

test("Backtest executes current built-in, saved and editable Scanner SQL text unchanged against the historical surface", async () => {
  await withEvidence(async (dataDir) => {
    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000
    });

    try {
      for (const query of MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES) {
        const exactSql = query.sql;
        const result = await point.scanner.execute(exactSql);
        assert.equal(query.sql, exactSql, query.queryId);
        assert.ok(Array.isArray(result.columns), query.queryId);
        assert.ok(Array.isArray(result.rows), query.queryId);
      }

      const saved = await point.scanner.execute(SAVED_QUERY_SQL);
      assert.deepEqual(saved.rows, [["1002"], ["1001"]]);

      const editable = await point.scanner.execute(EDITABLE_QUERY_SQL);
      assert.deepEqual(editable.columns.map((column) => column.name), ["securityId", "Price"]);
      assert.deepEqual(editable.rows, [
        ["1002", 21],
        ["1001", 11]
      ]);
    } finally {
      await point.close();
    }
  });
});
