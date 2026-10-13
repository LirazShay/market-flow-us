import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openResearchDomain } from "../../research-server/domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_88888888-8888-4888-8888-888888888888";
const OBJECTIVE_ID = "obj_88888888-8888-4888-8888-888888888888";
const INVENTORY_ID = "inv_88888888-8888-4888-8888-888888888888";
const PLAN_ID = "plan_88888888-8888-4888-8888-888888888888";
const PART_DEV = "part_88888888-8888-4888-8888-888888888888";
const PART_VALIDATION = "part_99999999-9999-4999-8999-999999999999";
const LIMITS = Object.freeze({
  threads: 1,
  memoryLimit: "128MB",
  maxTempDirectorySize: "256MB"
});
const SQL_TIMEOUT_MS = 12_345;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-domain-sql-policy-test-v1",
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
        (1, 'domain-policy-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
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
        (1, 'domain-policy-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

test("TREE 11.4 Research Domain passes SQL timeout and DuckDB resource policy to the Development session", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-domain-policy-"));
  let domain = null;
  let session = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });

    domain = await openResearchDomain({
      dbPath: path.join(tempDir, "research-ledger.duckdb"),
      marketDataDir: tempDir,
      sqlTimeoutMs: SQL_TIMEOUT_MS,
      duckdbResourceLimits: LIMITS,
      now: () => 1_860_000_000_000,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION])
    });

    await domain.createResearchRun({
      userIntent: "Verify bounded Research SQL server policy.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Inspect bounded Development evidence.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprint,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "domain-policy-test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    session = await domain.openDevelopmentResearchSql({
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: []
    });

    assert.equal(session.sqlTimeoutMs, SQL_TIMEOUT_MS);
    assert.deepEqual(session.duckdbResourceLimits, LIMITS);

    const result = await session.execute(
      "SELECT security_id, Price FROM research_history ORDER BY security_id ASC"
    );
    assert.equal(result.rowCount, 1);
    assert.deepEqual(result.rows, [["1001", 100]]);
  } finally {
    if (session) await session.close();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});