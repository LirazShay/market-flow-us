import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { duckDbSizeToBytes } from "../../backtest-lab/duckdb-resource-limits.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openDevelopmentResearchSqlSandbox } from "../../research-server/research-sql.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const LIMITS = Object.freeze({
  threads: 1,
  memoryLimit: "128MB",
  maxTempDirectorySize: "256MB"
});
const PARTITION_ID = "part_77777777-7777-4777-8777-777777777777";
const PLAN_ID = "plan_77777777-7777-4777-8777-777777777777";

async function seedMarketData(dataDir) {
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-sql-duckdb-limits-test-v1",
    now: () => 1_700_000_000_000
  });
  try {
    const writer = database.writerConnection;
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'research-sql-limit-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms, last_seen_at_ms,
        Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      ) VALUES
        ('1001', true, 1, 1900, 2000, 'AAA', 'Alpha', NULL, 'NYSE', '{}')
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'research-sql-limit-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
  return dbPath;
}

function assertBoundedSize(actual, requested, label) {
  const actualBytes = duckDbSizeToBytes(String(actual));
  const requestedBytes = duckDbSizeToBytes(requested);
  assert.ok(actualBytes > 0, `${label} must stay positive`);
  assert.ok(
    actualBytes <= requestedBytes * 1.02,
    `${label} ${actual} must not exceed requested ${requested}`
  );
}

test("TREE 11.4 Research SQL sandbox applies CPU/RAM/temp-disk ceilings before locked execution", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-sql-limits-"));
  const dbPath = await seedMarketData(dataDir);
  const before = await readFile(dbPath);
  let sandbox = null;

  try {
    const sourceFingerprint = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });
    sandbox = await openDevelopmentResearchSqlSandbox({
      dataDir,
      partition: {
        partitionId: PARTITION_ID,
        evidencePlanId: PLAN_ID,
        role: "DEVELOPMENT",
        partition: {
          sourceIds: ["active"],
          range: { fromMs: 0, toMs: 3000 },
          maxAuthorizedHorizonMs: 120_000
        }
      },
      inventory: {
        inventory: {
          sources: [{
            sourceId: "active",
            sourceFingerprint,
            classification: "ACTIVE",
            schemaVersion: 4
          }]
        }
      },
      duckdbResourceLimits: LIMITS,
      now: () => 10_000
    });

    assert.deepEqual(sandbox.resourceLimits, LIMITS);
    assert.equal(Number(sandbox.appliedResourceLimits.threads), 1);
    assertBoundedSize(
      sandbox.appliedResourceLimits.memoryLimit,
      LIMITS.memoryLimit,
      "memory_limit"
    );
    assertBoundedSize(
      sandbox.appliedResourceLimits.maxTempDirectorySize,
      LIMITS.maxTempDirectorySize,
      "max_temp_directory_size"
    );

    const result = await sandbox.execute(
      "SELECT security_id, Price FROM research_history ORDER BY security_id ASC"
    );
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows, [["1001", 100]]);
  } finally {
    if (sandbox) await sandbox.close();
    assert.deepEqual(await readFile(dbPath), before);
    await rm(dataDir, { recursive: true, force: true });
  }
});
