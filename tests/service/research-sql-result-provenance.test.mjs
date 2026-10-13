import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchEvidenceDomain } from "../../research-server/evidence-domain.js";
import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_ID = "run_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OBJECTIVE_ID = "obj_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const INVENTORY_ID = "inv_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PLAN_ID = "plan_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PART_DEV = "part_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PART_VALIDATION = "part_ffffffff-ffff-4fff-8fff-ffffffffffff";
const JOB_ID = "job_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const RESULT_ID = "res_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ANALYSIS_ID = "analysis_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SOURCE_FINGERPRINT = "a".repeat(64);

async function seedAuthority(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_940_000_000_000,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Freeze Research SQL evidence provenance."
    });
    await ledger.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Use the authorized Development partition.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
  } finally {
    await ledger.close();
  }

  const evidence = await openResearchEvidenceDomain({
    dbPath,
    now: () => 1_940_000_001_000,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory: (() => {
      const ids = [PART_DEV, PART_VALIDATION];
      return () => ids.shift();
    })()
  });
  try {
    const inventory = await evidence.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: SOURCE_FINGERPRINT,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    const plan = await evidence.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: inventory.evidenceInventoryId,
      plan: { algorithmVersion: "research-sql-provenance-test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });
    return { inventory, plan, partition: plan.partitions.find((item) => item.role === "DEVELOPMENT") };
  } finally {
    await evidence.close();
  }
}

async function seedJob(dbPath) {
  const jobs = await openResearchJobLedger({
    dbPath,
    now: () => 1_940_000_002_000,
    jobIdFactory: () => JOB_ID
  });
  try {
    return await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "execute_development_research_sql",
      clientRequestId: "provenance-analysis-1",
      intent: { partitionId: PART_DEV }
    });
  } finally {
    await jobs.close();
  }
}

test("TREE 11.4 Research SQL Result freezes authorized evidence hashes and source fingerprints across reopen", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-sql-result-provenance-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let results = null;

  try {
    const authority = await seedAuthority(dbPath);
    await seedJob(dbPath);

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_940_000_003_000,
      resultHandleFactory: () => RESULT_ID,
      freezeResearchSqlProvenance: true
    });
    const created = await results.createResult({
      researchRunId: RUN_ID,
      sourceJobId: JOB_ID,
      resultKind: "RESEARCH_SQL_RESULT",
      columns: [{ name: "value", type: "INTEGER", nullable: false }],
      rows: [{ value: 1 }],
      provenance: {
        analysisId: ANALYSIS_ID,
        partitionId: PART_DEV,
        experimentIds: [],
        purpose: "DEBUG",
        outputMode: "PAGED_RESULT"
      }
    });

    assert.deepEqual(created.provenance.evidence, {
      authorizedSources: [{ sourceId: "active", sourceFingerprint: SOURCE_FINGERPRINT }],
      evidenceInventoryId: INVENTORY_ID,
      evidencePlanId: PLAN_ID,
      inventoryHash: authority.inventory.inventoryHash,
      partitionHash: authority.partition.partitionHash,
      partitionId: PART_DEV,
      planHash: authority.plan.planHash
    });

    await results.close();
    results = await openResearchResultLedger({ dbPath, freezeResearchSqlProvenance: true });
    const reopened = await results.getResult(RUN_ID, RESULT_ID);
    assert.deepEqual(reopened.provenance, created.provenance);
  } finally {
    if (results) await results.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
