import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchEvidenceDomain } from "../../research-server/evidence-domain.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const NOW = 1_830_000_000_000;

async function seedBaseLedger(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => NOW,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await ledger.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer positive 60s outcomes with independent validation.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [60] }
    });
  } finally {
    await ledger.close();
  }
}

test("TREE 11.1 Research Domain rejects camelCase and relative client filesystem paths before evidence persistence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-domain-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    await seedBaseLedger(dbPath);
    domain = await openResearchEvidenceDomain({
      dbPath,
      now: () => NOW + 100,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: () => PARTITION_ID
    });

    await assert.rejects(
      domain.createEvidenceInventory({
        researchRunId: RUN_ID,
        inventory: {
          sources: [{ sourceId: "source_bad", sourcePath: "data/market.duckdb" }]
        }
      }),
      /logical IDs\/fingerprints, not client filesystem paths/u
    );

    const inventory = await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "source_day_2026_10_01",
          sourceFingerprint: "a".repeat(64),
          classification: "ARCHIVE"
        }]
      }
    });
    assert.equal(inventory.evidenceInventoryId, INVENTORY_ID);

    await assert.rejects(
      domain.createEvidencePlan({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        evidenceInventoryId: INVENTORY_ID,
        plan: { algorithmVersion: "chronological-blocks-v1" },
        partitions: [{
          role: "DEVELOPMENT",
          partition: {
            sourceIds: ["source_day_2026_10_01"],
            exportFileName: "evidence.json"
          }
        }]
      }),
      /logical IDs\/fingerprints, not client filesystem paths/u
    );

    const plan = await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "chronological-blocks-v1" },
      partitions: [{
        role: "DEVELOPMENT",
        partition: {
          sourceIds: ["source_day_2026_10_01"],
          range: { fromMs: NOW - 60_000, toMs: NOW }
        }
      }]
    });
    assert.equal(plan.evidencePlanId, PLAN_ID);
    assert.equal(plan.partitions[0].partitionId, PARTITION_ID);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
