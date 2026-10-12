import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchEvidenceLedger } from "../../research-server/evidence-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const FAILED_PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const RETRY_PLAN_ID = "plan_22222222-2222-4222-8222-222222222222";
const DUPLICATE_PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const RETRY_DEVELOPMENT_ID = "part_22222222-2222-4222-8222-222222222222";
const RETRY_VALIDATION_ID = "part_33333333-3333-4333-8333-333333333333";
const NOW = 1_840_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

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

function planInput() {
  return {
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    evidenceInventoryId: INVENTORY_ID,
    plan: {
      algorithmVersion: "chronological-blocks-v1",
      purgeMs: 60_000
    },
    partitions: [
      {
        role: "DEVELOPMENT",
        partition: {
          sourceIds: ["source_day_1"],
          range: { fromMs: NOW - 600_000, toMs: NOW - 300_000 }
        }
      },
      {
        role: "VALIDATION",
        partition: {
          sourceIds: ["source_day_1"],
          range: { fromMs: NOW - 240_000, toMs: NOW }
        }
      }
    ]
  };
}

test("TREE 11.1 transaction fault rolls back partially written evidence plan and preserves retry identity", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-tx-fault-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let evidenceLedger = null;

  try {
    await seedBaseLedger(dbPath);

    evidenceLedger = await openResearchEvidenceLedger({
      dbPath,
      now: () => NOW + 100,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => FAILED_PLAN_ID,
      partitionIdFactory: () => DUPLICATE_PARTITION_ID
    });

    await evidenceLedger.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "source_day_1",
          sourceFingerprint: "a".repeat(64),
          classification: "ARCHIVE"
        }]
      }
    });

    await assert.rejects(evidenceLedger.createEvidencePlan(planInput()));

    assert.equal(await evidenceLedger.getEvidencePlan(RUN_ID, FAILED_PLAN_ID), null);
    assert.deepEqual(await evidenceLedger.listEvidencePlans(RUN_ID), []);
    assert.equal(
      await evidenceLedger.getPartition(RUN_ID, DUPLICATE_PARTITION_ID),
      null,
      "the first partition insert must roll back when a later partition insert fails"
    );

    await evidenceLedger.close();
    evidenceLedger = null;

    evidenceLedger = await openResearchEvidenceLedger({
      dbPath,
      now: () => NOW + 200,
      evidencePlanIdFactory: () => RETRY_PLAN_ID,
      partitionIdFactory: sequence([RETRY_DEVELOPMENT_ID, RETRY_VALIDATION_ID])
    });

    assert.equal(await evidenceLedger.getEvidencePlan(RUN_ID, FAILED_PLAN_ID), null);
    assert.deepEqual(await evidenceLedger.listEvidencePlans(RUN_ID), []);

    const retry = await evidenceLedger.createEvidencePlan(planInput());
    assert.equal(retry.evidencePlanId, RETRY_PLAN_ID);
    assert.equal(
      retry.versionNumber,
      1,
      "rolled-back plan must not consume the first durable version number"
    );
    assert.deepEqual(
      retry.partitions.map((partition) => partition.partitionId),
      [RETRY_DEVELOPMENT_ID, RETRY_VALIDATION_ID]
    );

    await evidenceLedger.close();
    evidenceLedger = null;

    evidenceLedger = await openResearchEvidenceLedger({ dbPath, now: () => NOW + 300 });
    const reopened = await evidenceLedger.getEvidencePlan(RUN_ID, RETRY_PLAN_ID);
    assert.deepEqual(reopened, retry);
    assert.equal(await evidenceLedger.getEvidencePlan(RUN_ID, FAILED_PLAN_ID), null);
  } finally {
    if (evidenceLedger) await evidenceLedger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
