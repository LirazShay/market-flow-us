import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchEvidenceLedger } from "../../research-server/evidence-ledger.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";
import { openResearchExperimentLedger } from "../../research-server/experiment-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchValidationLedger } from "../../research-server/validation-ledger.js";

const RUN_ID = "run_71717171-7171-4171-8171-717171717171";
const OBJECTIVE_ID = "obj_71717171-7171-4171-8171-717171717171";
const QUERY_ID = "qry_71717171-7171-4171-8171-717171717171";
const INVENTORY_ID = "inv_71717171-7171-4171-8171-717171717171";
const PLAN_A = "plan_71717171-7171-4171-8171-717171717171";
const PLAN_B = "plan_72727272-7272-4272-8272-727272727272";
const PART_A_DEV = "part_71717171-7171-4171-8171-717171717171";
const PART_A_VALIDATION = "part_72727272-7272-4272-8272-727272727272";
const PART_A_HOLDOUT = "part_73737373-7373-4373-8373-737373737373";
const PART_B_DEV = "part_74747474-7474-4474-8474-747474747474";
const PART_B_VALIDATION = "part_75757575-7575-4575-8575-757575757575";
const PART_B_HOLDOUT = "part_76767676-7676-4676-8676-767676767676";
const EXPERIMENT_ID = "exp_71717171-7171-4171-8171-717171717171";
const METRIC_SET_ID = "metrics_71717171-7171-4171-8171-717171717171";
const EXPOSURE_ID = "vexp_71717171-7171-4171-8171-717171717171";
const FINALIST_ID = "finalist_71717171-7171-4171-8171-717171717171";
const SOURCE_ID = "archive:finalist-plan-race.duckdb";
const SOURCE_FINGERPRINT = "7".repeat(64);
const SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const NOW = 1_971_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test ID sequence exhausted");
    return remaining.shift();
  };
}

function partitions(devId, validationId, holdoutId) {
  return {
    ids: [devId, validationId, holdoutId],
    definitions: [
      { role: "DEVELOPMENT", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 1_000, toMs: 9_000 } } },
      { role: "VALIDATION", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 20_000, toMs: 29_000 } } },
      { role: "SEALED_HOLDOUT", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 40_000, toMs: 49_000 } } }
    ]
  };
}

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: [10_000, 60_000],
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    }
  };
}

async function seedPlanAValidationAuthority(dbPath) {
  const base = await openResearchLedger({
    dbPath,
    now: () => NOW,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: () => QUERY_ID
  });
  let query;
  try {
    await base.createResearchRun({
      userIntent: "Freeze a finalist only from the current Validation partition.",
      budgetPolicy: {},
      environmentSnapshot: {}
    });
    await base.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer robust positive outcomes.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
    });
    query = await base.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "plan-a candidate"
    });
  } finally {
    await base.close();
  }

  const planA = partitions(PART_A_DEV, PART_A_VALIDATION, PART_A_HOLDOUT);
  const evidence = await openResearchEvidenceLedger({
    dbPath,
    now: () => NOW + 10,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_A,
    partitionIdFactory: sequence(planA.ids)
  });
  try {
    await evidence.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: SOURCE_ID,
          sourceFingerprint: SOURCE_FINGERPRINT,
          classification: "ARCHIVE",
          schemaVersion: 4
        }]
      }
    });
    await evidence.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "chronological-purged-v1", horizonAwarePurgeMs: 60_000 },
      partitions: planA.definitions
    });
  } finally {
    await evidence.close();
  }

  const experiments = await openResearchExperimentLedger({
    dbPath,
    now: () => NOW + 20,
    experimentIdFactory: () => EXPERIMENT_ID,
    metricSetIdFactory: () => METRIC_SET_ID
  });
  try {
    const request = freezeAuthoritativeExperimentBatchRequest({
      objectiveVersionId: OBJECTIVE_ID,
      evidencePartitionId: PART_A_VALIDATION,
      phase: "VALIDATION",
      sourceId: SOURCE_ID,
      sourceFingerprint: SOURCE_FINGERPRINT,
      queryArtifacts: [query],
      fromAtMs: 20_000,
      toAtMs: 20_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 3,
      horizonsMs: [10_000, 60_000]
    });
    const durableRequest = durableAuthoritativeExperimentRequest(request);
    await experiments.recordCompletedExperiment({
      researchRunId: RUN_ID,
      request: durableRequest,
      metrics: {
        contractVersion: "research-experiment-metrics-v1",
        requestFingerprint: durableRequest.requestFingerprint
      }
    });
  } finally {
    await experiments.close();
  }

  const validation = await openResearchValidationLedger({
    dbPath,
    now: () => NOW + 30,
    validationExposureIdFactory: () => EXPOSURE_ID
  });
  try {
    const exposure = await validation.recordValidationExposure({
      researchRunId: RUN_ID,
      experimentId: EXPERIMENT_ID
    });
    assert.equal(exposure.partitionId, PART_A_VALIDATION);
  } finally {
    await validation.close();
  }
}

async function commitPlanB(dbPath) {
  const planB = partitions(PART_B_DEV, PART_B_VALIDATION, PART_B_HOLDOUT);
  const evidence = await openResearchEvidenceLedger({
    dbPath,
    now: () => NOW + 40,
    evidencePlanIdFactory: () => PLAN_B,
    partitionIdFactory: sequence(planB.ids)
  });
  try {
    const plan = await evidence.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "chronological-purged-v1", horizonAwarePurgeMs: 60_000 },
      partitions: planB.definitions
    });
    assert.equal(plan.evidencePlanId, PLAN_B);
  } finally {
    await evidence.close();
  }
}

test("TREE 11.7 Finalist Set cannot inherit Validation support from a superseded Evidence Plan", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-finalist-plan-race-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let validation = null;

  try {
    await seedPlanAValidationAuthority(dbPath);
    await commitPlanB(dbPath);

    validation = await openResearchValidationLedger({
      dbPath,
      now: () => NOW + 50,
      finalistSetIdFactory: () => FINALIST_ID
    });

    assert.equal((await validation.listValidationExposures(RUN_ID))[0].partitionId, PART_A_VALIDATION);
    await assert.rejects(
      validation.createFinalistSet({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        queryArtifactIds: [QUERY_ID],
        evaluationProfile: evaluationProfile(),
        justification: "Plan A Validation exposure must not authorize a Plan B Finalist."
      }),
      /Finalist Query Artifact requires Validation exposure under the current Objective and Validation partition/u
    );
    assert.deepEqual(await validation.listFinalistSets(RUN_ID), []);
  } finally {
    if (validation) await validation.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
