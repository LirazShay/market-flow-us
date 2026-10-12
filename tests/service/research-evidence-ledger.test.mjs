import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchEvidenceLedger } from "../../research-server/evidence-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const OBJECTIVE_A = "obj_11111111-1111-4111-8111-111111111111";
const INVENTORY_A = "inv_11111111-1111-4111-8111-111111111111";
const INVENTORY_B = "inv_22222222-2222-4222-8222-222222222222";
const PLAN_A = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEVELOPMENT = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const PART_HOLDOUT = "part_33333333-3333-4333-8333-333333333333";
const NOW = 1_820_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test ID sequence exhausted");
    return remaining.shift();
  };
}

async function seedBaseLedger(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => NOW,
    idFactory: sequence([RUN_A, RUN_B]),
    objectiveVersionIdFactory: sequence([OBJECTIVE_A])
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await ledger.createResearchRun({
      userIntent: "Independent second research run.",
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await ledger.createObjectiveVersion({
      researchRunId: RUN_A,
      interpretationText: "Prefer positive 60s outcomes with independent validation.",
      objective: {
        targetDirection: "UP",
        primaryHorizonsSec: [60],
        selectionPolicy: "TOP_1"
      }
    });
  } finally {
    await ledger.close();
  }
}

function inventoryDefinition() {
  return {
    sources: [
      {
        sourceId: "source_day_2026_10_01",
        sourceFingerprint: "a".repeat(64),
        classification: "ARCHIVE",
        schemaVersion: 4,
        firstCompleteAtMs: NOW - 3_600_000,
        lastCompleteAtMs: NOW,
        cycleCount: 180
      }
    ],
    coverage: {
      cadenceP50Ms: 10_000,
      effectiveBaselines: 175
    }
  };
}

function planDefinition() {
  return {
    algorithmVersion: "chronological-blocks-v1",
    sourceIds: ["source_day_2026_10_01"],
    horizonAwarePurgeMs: 120_000
  };
}

function partitionDefinitions() {
  return [
    {
      role: "DEVELOPMENT",
      partition: {
        sourceIds: ["source_day_2026_10_01"],
        range: { fromMs: NOW - 3_600_000, toMs: NOW - 2_400_000 },
        schedule: { kind: "COMPLETE_CYCLES" }
      }
    },
    {
      role: "VALIDATION",
      partition: {
        sourceIds: ["source_day_2026_10_01"],
        range: { fromMs: NOW - 2_200_000, toMs: NOW - 1_000_000 },
        schedule: { kind: "COMPLETE_CYCLES" }
      }
    },
    {
      role: "SEALED_HOLDOUT",
      partition: {
        sourceIds: ["source_day_2026_10_01"],
        range: { fromMs: NOW - 800_000, toMs: NOW },
        schedule: { kind: "COMPLETE_CYCLES" }
      }
    }
  ];
}

test("TREE 11.1 evidence inventory/plan/partitions are immutable run-scoped facts and survive restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-evidence-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let evidence = null;

  try {
    await seedBaseLedger(dbPath);

    evidence = await openResearchEvidenceLedger({
      dbPath,
      now: () => NOW + 100,
      evidenceInventoryIdFactory: sequence([INVENTORY_A]),
      evidencePlanIdFactory: sequence([PLAN_A]),
      partitionIdFactory: sequence([PART_DEVELOPMENT, PART_VALIDATION, PART_HOLDOUT])
    });

    const inventory = await evidence.createEvidenceInventory({
      researchRunId: RUN_A,
      inventory: inventoryDefinition()
    });
    assert.equal(inventory.evidenceInventoryId, INVENTORY_A);
    assert.match(inventory.inventoryHash, /^[0-9a-f]{64}$/u);
    assert.deepEqual(await evidence.getEvidenceInventory(RUN_A, INVENTORY_A), inventory);
    assert.equal(await evidence.getEvidenceInventory(RUN_B, INVENTORY_A), null);

    const plan = await evidence.createEvidencePlan({
      researchRunId: RUN_A,
      objectiveVersionId: OBJECTIVE_A,
      evidenceInventoryId: INVENTORY_A,
      plan: planDefinition(),
      partitions: partitionDefinitions()
    });

    assert.equal(plan.evidencePlanId, PLAN_A);
    assert.equal(plan.versionNumber, 1);
    assert.match(plan.planHash, /^[0-9a-f]{64}$/u);
    assert.deepEqual(
      plan.partitions.map((partition) => partition.role),
      ["DEVELOPMENT", "VALIDATION", "SEALED_HOLDOUT"]
    );
    for (const partition of plan.partitions) {
      assert.match(partition.partitionHash, /^[0-9a-f]{64}$/u);
    }
    assert.deepEqual(await evidence.getEvidencePlan(RUN_A, PLAN_A), plan);
    assert.deepEqual(await evidence.getCurrentEvidencePlan(RUN_A), plan);
    assert.deepEqual(await evidence.listEvidencePlans(RUN_A), [plan]);
    assert.equal(await evidence.getEvidencePlan(RUN_B, PLAN_A), null);
    assert.equal(await evidence.getPartition(RUN_B, PART_DEVELOPMENT), null);

    await evidence.close();
    evidence = null;

    const base = await openResearchLedger({ dbPath, now: () => NOW + 200 });
    try {
      assert.equal((await base.getResearchRun(RUN_A)).researchRunId, RUN_A);
      assert.equal((await base.getObjectiveVersion(RUN_A, OBJECTIVE_A)).objectiveVersionId, OBJECTIVE_A);
    } finally {
      await base.close();
    }

    evidence = await openResearchEvidenceLedger({ dbPath, now: () => NOW + 300 });
    assert.deepEqual(await evidence.getEvidenceInventory(RUN_A, INVENTORY_A), inventory);
    assert.deepEqual(await evidence.getEvidencePlan(RUN_A, PLAN_A), plan);
  } finally {
    if (evidence) await evidence.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.1 evidence references fail closed across runs and client filesystem paths never persist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-evidence-boundary-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let evidence = null;

  try {
    await seedBaseLedger(dbPath);
    evidence = await openResearchEvidenceLedger({
      dbPath,
      now: () => NOW + 500,
      evidenceInventoryIdFactory: sequence([INVENTORY_A, INVENTORY_B]),
      evidencePlanIdFactory: sequence([PLAN_A]),
      partitionIdFactory: sequence([PART_DEVELOPMENT])
    });

    await evidence.createEvidenceInventory({
      researchRunId: RUN_A,
      inventory: inventoryDefinition()
    });

    await assert.rejects(
      evidence.createEvidencePlan({
        researchRunId: RUN_B,
        objectiveVersionId: OBJECTIVE_A,
        evidenceInventoryId: INVENTORY_A,
        plan: planDefinition(),
        partitions: [partitionDefinitions()[0]]
      }),
      /Objective Version was not found in this Research Run/u
    );

    await assert.rejects(
      evidence.createEvidenceInventory({
        researchRunId: RUN_B,
        inventory: {
          sources: [{ sourceId: "source_bad", sourcePath: "C:\\private\\market.duckdb" }]
        }
      }),
      /logical IDs\/fingerprints, not client filesystem paths/u
    );

    await assert.rejects(
      evidence.createEvidencePlan({
        researchRunId: RUN_A,
        objectiveVersionId: OBJECTIVE_A,
        evidenceInventoryId: INVENTORY_A,
        plan: planDefinition(),
        partitions: [
          {
            role: "DEVELOPMENT",
            partition: { sourceIds: ["source_day_2026_10_01"], filePath: "/tmp/market.duckdb" }
          }
        ]
      }),
      /logical IDs\/fingerprints, not client filesystem paths/u
    );

    assert.deepEqual(await evidence.listEvidenceInventories(RUN_B), []);
    assert.deepEqual(await evidence.listEvidencePlans(RUN_B), []);
  } finally {
    if (evidence) await evidence.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
