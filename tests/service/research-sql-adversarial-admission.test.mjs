import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openDevelopmentResearchSqlSession } from "../../research-server/research-sql-session.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";

const RUN_ID = "run_33333333-3333-4333-8333-333333333333";
const PARTITION_ID = "part_33333333-3333-4333-8333-333333333333";
const PLAN_ID = "plan_33333333-3333-4333-8333-333333333333";
const INVENTORY_ID = "inv_33333333-3333-4333-8333-333333333333";

async function seedMarketData(dataDir) {
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-sql-adversarial-v4",
    now: () => 1_700_000_000_000
  });
  try {
    await database.writerConnection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'adversarial-seed', 1, 'complete', 1900, 1990, 2000, 90, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await database.writerConnection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'adversarial-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}'),
        (1, 'adversarial-seed', 1, '1002', 0, 1900, 1980, 1981,
         '{}', 'BBB', 'Beta', 'NASDAQ', 'provider-t0', 90, -0.5, 900,
         '{"PaperId":"1002","ExtraSignal":5}')
    `);
  } finally {
    await database.close();
  }
  return dbPath;
}

function assertScannerForbidden(error) {
  return error?.code === ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION;
}

test("TREE 11.3 research SQL rejects escape attempts while preserving broad analytical SELECTs", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-sql-adversarial-"));
  const outputPath = path.join(dataDir, "must-not-exist.csv");
  let session = null;

  try {
    const dbPath = await seedMarketData(dataDir);
    const sourceBefore = await readFile(dbPath);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });

    const partition = Object.freeze({
      partitionId: PARTITION_ID,
      evidencePlanId: PLAN_ID,
      role: "DEVELOPMENT",
      partition: Object.freeze({ sourceIds: Object.freeze(["active"]) })
    });
    const inventory = Object.freeze({
      evidenceInventoryId: INVENTORY_ID,
      inventory: Object.freeze({
        sources: Object.freeze([Object.freeze({
          sourceId: "active",
          sourceFingerprint: fingerprint,
          classification: "ACTIVE",
          schemaVersion: 4
        })])
      })
    });

    session = await openDevelopmentResearchSqlSession({
      dataDir,
      researchRunId: RUN_ID,
      partitionId: PARTITION_ID,
      experimentIds: [],
      now: () => 10_000,
      getPartition: async () => partition,
      getEvidencePlan: async () => ({
        evidencePlanId: PLAN_ID,
        evidenceInventoryId: INVENTORY_ID
      }),
      getEvidenceInventory: async () => inventory,
      reconstructExperiment: async () => {
        throw new Error("no Experiment reconstruction expected");
      }
    });

    const analytical = await session.execute(`
      WITH observations AS (
        SELECT
          security_id,
          Price,
          avg(Price) OVER () AS average_price,
          row_number() OVER (ORDER BY Price DESC, security_id) AS position
        FROM research_history
      )
      SELECT security_id, Price, average_price, position
      FROM observations
      ORDER BY position
    `);
    assert.deepEqual(analytical.rows, [
      ["1001", 100, 95, "1"],
      ["1002", 90, 95, "2"]
    ]);

    const safeCatalog = await session.execute(`
      SELECT table_name
      FROM duckdb_tables()
      WHERE schema_name = 'main' AND table_name LIKE 'research_%'
      ORDER BY table_name
    `);
    assert.deepEqual(safeCatalog.rows.map((row) => row[0]), [
      "research_authoritative_outcomes",
      "research_cycles",
      "research_decision_points",
      "research_history",
      "research_partition",
      "research_sources",
      "research_universe"
    ]);

    const inert = await session.execute(`
      SELECT
        '../../etc/passwd' AS inert_path,
        'read_csv(../../etc/passwd)' AS inert_reader,
        $$query_table('research_history')$$ AS inert_dynamic
      -- duckdb_settings() and read_json('https://example.invalid/data.json') are comments
    `);
    assert.deepEqual(inert.rows, [[
      "../../etc/passwd",
      "read_csv(../../etc/passwd)",
      "query_table('research_history')"
    ]]);

    const forbiddenCalls = [
      "SELECT * FROM read_csv('../../etc/passwd')",
      "SELECT * FROM read_json('https://example.invalid/data.json')",
      "SELECT * FROM read_parquet('../../secret.parquet')",
      "SELECT read_text('../../etc/passwd')",
      "SELECT read_blob('../../etc/passwd')",
      "SELECT * FROM glob('../../*')",
      "SELECT * FROM sqlite_scan('../../other.db', 'secret_table')",
      "SELECT * FROM postgres_scan('host=example.invalid', 'public', 'secret_table')",
      "SELECT * FROM http_get('https://example.invalid/private')",
      "SELECT getenv('HOME')",
      "SELECT current_setting('temp_directory')",
      "SELECT * FROM duckdb_databases()",
      "SELECT * FROM duckdb_settings()",
      "SELECT * FROM duckdb_extensions()",
      "SELECT * FROM duckdb_secrets()",
      "SELECT * FROM duckdb_temporary_files()",
      "SELECT * FROM duckdb_external_file_cache()",
      "SELECT which_secret('s3://private/object', 's3')",
      "SELECT * FROM query_table('research_history')",
      "SELECT query('SELECT * FROM research_history')",
      "SELECT * FROM \"read_csv\" /* comment-obfuscated */ ('../../etc/passwd')",
      "SELECT * FROM query_table /* comment-obfuscated */ ('research_history')"
    ];
    for (const sql of forbiddenCalls) {
      await assert.rejects(() => session.execute(sql), assertScannerForbidden, sql);
    }

    const forbiddenStatements = [
      "SELECT 1; SELECT 2",
      "CREATE TABLE escaped(value INTEGER)",
      "INSERT INTO research_history SELECT * FROM research_history",
      "DELETE FROM research_history",
      "ATTACH '../../escape.duckdb' AS escaped",
      "DETACH main",
      `COPY research_history TO '${outputPath.replaceAll("'", "''")}' (HEADER, DELIMITER ',')`,
      "PRAGMA enable_external_access=true",
      "SET enable_external_access=true",
      "RESET enable_external_access",
      "INSTALL httpfs",
      "LOAD httpfs",
      "CREATE SECRET escaped (TYPE S3, KEY_ID 'x', SECRET 'y')"
    ];
    for (const sql of forbiddenStatements) {
      await assert.rejects(() => session.execute(sql), undefined, sql);
    }

    await assert.rejects(
      () => session.execute("SELECT setseed(0.5)"),
      assertScannerForbidden,
      "side-effecting functions discovered from duckdb_functions() must remain forbidden"
    );

    await assert.rejects(() => session.execute("SELECT * FROM '../../etc/passwd'"));
    await assert.rejects(() => session.execute("SELECT * FROM 'https://example.invalid/data.csv'"));
    await assert.rejects(() => session.execute("SELECT * FROM evidence.main.history"));
    await assert.rejects(() => session.execute("SELECT * FROM research_holdout"));
    await assert.rejects(() => access(outputPath));

    const stillUsable = await session.execute("SELECT count(*) FROM research_history");
    assert.deepEqual(stillUsable.rows, [["2"]]);

    await session.close();
    session = null;

    assert.deepEqual(await readFile(dbPath), sourceBefore);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" }),
      fingerprint
    );
    await assert.rejects(() => access(outputPath));
  } finally {
    if (session) await session.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
