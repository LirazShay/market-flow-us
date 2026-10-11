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
import {
  openMarketFlowUsDatabase
} from "../../local-service/database/database.js";
import {
  openBacktestHistoricalScanner
} from "../../backtest-lab/historical-scanner.js";

async function seedEvidence(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "backtest-historical-scanner-test",
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
        'backtest-session', 'backtest-producer', 'stopped', 500, 4_000,
        'test', 4_000, 4, 1, 5, 3_000, '{}', NULL
      )
    `);

    await connection.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName,
        raw_source
      ) VALUES
        ('1001', true, 1, 500, 3_000, 'AAA', 'Alpha', NULL, 'NYSE', '{"PaperId":1001}'),
        ('1002', true, 1, 500, 3_000, 'BBB', 'Beta', NULL, 'NASDAQ', '{"PaperId":1002}'),
        ('9999', true, 1, 3_000, 3_000, 'FUT', 'Future Canary', NULL, 'NYSE', '{"PaperId":9999}')
    `);

    await connection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'backtest-session', 1, 'complete', 800, 900, 1_000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'backtest-session', 1, 'complete', 1_800, 1_900, 2_000, 100, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'backtest-session', 1, 'failed', 2_300, 2_400, 2_500, 100, 2, 1, 1, 1, 0, 0, 1, '[]', 'provider-fetch', '{"message":"expected test failure"}'),
        (4, 'backtest-session', 1, 'complete', 2_800, 2_900, 3_000, 100, 3, 3, 3, 0, 0, 0, 1, '[]', NULL, NULL),
        (5, 'backtest-session', 1, 'complete', 2_850, 2_950, 3_000, 100, 3, 3, 3, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await connection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, Price,
        ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'backtest-session', 1, '1001', 0, 800, 890, 900, NULL, 'AAA', 'Alpha', 'NYSE', 10, 1, 100, '{"PaperId":1001,"Price":10}'),
        (1, 'backtest-session', 1, '1002', 0, 800, 890, 900, NULL, 'BBB', 'Beta', 'NASDAQ', 20, 2, 200, '{"PaperId":1002,"Price":20}'),
        (2, 'backtest-session', 1, '1001', 0, 1_800, 1_890, 1_900, NULL, 'AAA', 'Alpha', 'NYSE', 11, 1.1, 110, '{"PaperId":1001,"Price":11}'),
        (2, 'backtest-session', 1, '1002', 0, 1_800, 1_890, 1_900, NULL, 'BBB', 'Beta', 'NASDAQ', 21, 2.1, 210, '{"PaperId":1002,"Price":21}'),
        (4, 'backtest-session', 1, '1001', 0, 2_800, 2_890, 2_900, NULL, 'AAA', 'Alpha', 'NYSE', 12, 1.2, 120, '{"PaperId":1001,"Price":12}'),
        (4, 'backtest-session', 1, '1002', 0, 2_800, 2_890, 2_900, NULL, 'BBB', 'Beta', 'NASDAQ', 22, 2.2, 220, '{"PaperId":1002,"Price":22}'),
        (4, 'backtest-session', 1, '9999', 0, 2_800, 2_890, 2_900, NULL, 'FUT', 'Future Canary', 'NYSE', 999, 99, 9_999, '{"PaperId":9999,"Price":999}'),
        (5, 'backtest-session', 1, '1001', 0, 2_850, 2_940, 2_950, NULL, 'AAA', 'Alpha', 'NYSE', 13, 1.3, 130, '{"PaperId":1001,"Price":13}'),
        (5, 'backtest-session', 1, '1002', 0, 2_850, 2_940, 2_950, NULL, 'BBB', 'Beta', 'NASDAQ', 23, 2.3, 230, '{"PaperId":1002,"Price":23}'),
        (5, 'backtest-session', 1, '9999', 0, 2_850, 2_940, 2_950, NULL, 'FUT', 'Future Canary', 'NYSE', 1_000, 100, 10_000, '{"PaperId":9999,"Price":1000}')
    `);

    await connection.run("DELETE FROM latest");
    await connection.run("INSERT INTO latest SELECT * FROM history WHERE cycle_id = 5");

    await connection.run(`
      INSERT INTO scanner_saved_queries (
        query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
      ) VALUES (
        'future-query', 'Future Query', 'future query',
        'SELECT security_id FROM latest ORDER BY Price DESC',
        10_000, 3_000, 3_000
      )
    `);

    await connection.run(`
      INSERT INTO demo_buy_captures (
        capture_id, captured_at_ms, source_query_id, source_query_name,
        source_query_sql, source_interval_ms, source_result_started_at_ms,
        source_result_completed_at_ms, source_result_row_count,
        source_result_context_json, selection_mode, is_automatic, top_x
      ) VALUES (
        1, 3_100, NULL, NULL, 'SELECT security_id FROM latest', 10_000,
        3_000, 3_000, 1, '{}', 'manual', false, NULL
      )
    `);
  } finally {
    await database.close();
  }
}

function expectScannerCode(expectedCode) {
  return (error) => {
    assert.equal(error?.code, expectedCode);
    return true;
  };
}

async function withEvidencePoint(requestedAtMs, run) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-history-"));
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  try {
    await seedEvidence(dbPath);
    await run({ dataDir, dbPath, requestedAtMs });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("Backtest historical Scanner resolves the last complete committed cycle at-or-before T and reconstructs exact latest/history", async () => {
  await withEvidencePoint(2_000, async ({ dataDir, dbPath, requestedAtMs }) => {
    const before = await readFile(dbPath);
    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs,
      now: () => 9_000
    });

    try {
      assert.equal(point.available, true);
      assert.equal(point.requestedAtMs, 2_000);
      assert.deepEqual(point.baseline, {
        cycleId: 2,
        committedAtMs: 2_000
      });
      assert.ok(point.scanner);

      const latest = await point.scanner.execute(`
        SELECT cycle_id, security_id, Symbol, Price
        FROM latest
        ORDER BY Price DESC
      `);
      assert.deepEqual(latest.rows, [
        ["2", "1002", "BBB", 21],
        ["2", "1001", "AAA", 11]
      ]);

      const history = await point.scanner.execute(`
        SELECT cycle_id, security_id, Price
        FROM history
        ORDER BY cycle_id, security_id
      `);
      assert.deepEqual(history.rows, [
        ["1", "1001", 10],
        ["1", "1002", 20],
        ["2", "1001", 11],
        ["2", "1002", 21]
      ]);

      const futureCanary = await point.scanner.execute(`
        SELECT COUNT(*) AS leaked
        FROM history
        WHERE cycle_id > 2 OR security_id = '9999'
      `);
      assert.deepEqual(futureCanary.rows, [["0"]]);
    } finally {
      await point.close();
    }

    assert.deepEqual(await readFile(dbPath), before);
  });
});

test("Backtest historical Scanner ignores failed cycles and resolves equal commit timestamps by highest cycle_id", async () => {
  await withEvidencePoint(3_000, async ({ dataDir, requestedAtMs }) => {
    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs
    });

    try {
      assert.equal(point.available, true);
      assert.deepEqual(point.baseline, {
        cycleId: 5,
        committedAtMs: 3_000
      });

      const latest = await point.scanner.execute(`
        SELECT DISTINCT cycle_id
        FROM latest
      `);
      assert.deepEqual(latest.rows, [["5"]]);
    } finally {
      await point.close();
    }
  });
});

test("Backtest historical Scanner returns explicit unavailable before the first complete committed cycle", async () => {
  await withEvidencePoint(999, async ({ dataDir, requestedAtMs }) => {
    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs
    });

    try {
      assert.equal(point.available, false);
      assert.equal(point.requestedAtMs, 999);
      assert.equal(point.baseline, null);
      assert.equal(point.scanner, null);
    } finally {
      await point.close();
    }
  });
});

test("Backtest historical Scanner safely attaches a product-owned path containing SQL punctuation", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-path-"));
  const dataDir = path.join(rootDir, "quote'; CREATE TABLE injected(i INTEGER); --");
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");

  try {
    await mkdir(dataDir, { recursive: true });
    await seedEvidence(dbPath);

    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000
    });

    try {
      const visible = await point.scanner.execute(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
      `);
      assert.deepEqual(visible.rows, [["history"], ["latest"]]);

      const latest = await point.scanner.execute(`
        SELECT security_id, Price
        FROM latest
        ORDER BY security_id
      `);
      assert.deepEqual(latest.rows, [
        ["1001", 11],
        ["1002", 21]
      ]);
    } finally {
      await point.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Backtest historical Scanner exposes only detached latest/history and blocks source-catalog/future authority bypass", async () => {
  await withEvidencePoint(2_000, async ({ dataDir }) => {
    const outsideCsv = path.join(dataDir, "existing-canary.csv");
    await writeFile(outsideCsv, "value\nsecret\n");

    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000
    });

    try {
      const visible = await point.scanner.execute(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
      `);
      assert.deepEqual(visible.rows, [["history"], ["latest"]]);

      const detached = await point.scanner.execute(`
        SELECT database_name
        FROM duckdb_databases()
        WHERE lower(database_name) = 'evidence'
      `);
      assert.deepEqual(detached.rows, []);

      for (const sql of [
        "SELECT * FROM cycles",
        "SELECT * FROM sessions",
        "SELECT * FROM universe",
        "SELECT * FROM scanner_saved_queries",
        "SELECT * FROM demo_buy_captures",
        "SELECT * FROM evidence.main.history"
      ]) {
        await assert.rejects(
          () => point.scanner.execute(sql),
          expectScannerCode("SCANNER_EXECUTION_ERROR")
        );
      }

      const csvSql = `SELECT * FROM read_csv_auto('${outsideCsv.replaceAll("'", "''")}')`;
      await assert.rejects(
        () => point.scanner.execute(csvSql),
        expectScannerCode("SCANNER_EXECUTION_ERROR")
      );
    } finally {
      await point.close();
    }
  });
});

test("Backtest historical Scanner reuses unchanged Scanner admission instead of adding a second SQL policy", async () => {
  await withEvidencePoint(2_000, async ({ dataDir }) => {
    const point = await openBacktestHistoricalScanner({
      dataDir,
      sourceId: "active",
      requestedAtMs: 2_000
    });

    try {
      for (const [sql, code] of [
        ["SELECT 1; SELECT 2", "SCANNER_MULTIPLE_STATEMENTS"],
        ["CREATE TABLE forbidden(i INTEGER)", "SCANNER_NON_SELECT"],
        ["SELECT $1", "SCANNER_PARAMETERS_UNSUPPORTED"],
        ["SELECT * FROM query('SELECT 1')", "SCANNER_FORBIDDEN_FUNCTION"],
        ["SELECT * FROM query_table('latest')", "SCANNER_FORBIDDEN_FUNCTION"]
      ]) {
        await assert.rejects(
          () => point.scanner.execute(sql),
          expectScannerCode(code)
        );
      }

      const representative = await point.scanner.execute(`
        WITH ranked AS (
          SELECT
            security_id,
            Price,
            ROW_NUMBER() OVER (
              PARTITION BY security_id
              ORDER BY collected_at_ms DESC, cycle_id DESC
            ) AS rn
          FROM history
        )
        SELECT l.security_id, l.Price, r.Price AS previous_price
        FROM latest AS l
        JOIN ranked AS r
          ON r.security_id = l.security_id
         AND r.rn = 2
        ORDER BY l.Price DESC, l.security_id
      `);
      assert.deepEqual(representative.rows, [
        ["1002", 21, 20],
        ["1001", 11, 10]
      ]);
    } finally {
      await point.close();
    }
  });
});
