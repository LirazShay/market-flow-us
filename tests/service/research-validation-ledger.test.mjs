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
import {
  HOLDOUT_FINAL_CAPABILITY
} from "../../research-server/validation-authority-core.js";
import { openResearchValidationLedger } from "../../research-server/validation-ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const PART_HOLDOUT = "part_33333333-3333-4333-8333-333333333333";
const VALIDATION_EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const DEVELOPMENT_EXPERIMENT_ID = "exp_22222222-2222-4222-8222-222222222222";
const VALIDATION_METRICS_ID = "metrics_11111111-1111-4111-8111-111111111111";
const DEVELOPMENT_METRICS_ID = "metrics_22222222-2222-4222-8222-222222222222";
const EXPOSURE_ID = "vexp_11111111-1111-4111-8111-111111111111";
const FINALIST_ID = "finalist_11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "archive:validation-ledger-fixture.duckdb";
const SOURCE_FINGERPRINT = "a".repeat(64);
const SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const NOW = 1_860_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test ID sequence exhausted");
    return remaining.shift();
  };
}

async function seedAuthority(dbPath) {
  let base = await openResearchLedger({
    dbPath,
    now: () => NOW,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: () => QUERY_ID
  });
  let query;
  try {
    await base.createResearchRun({
      userIntent: "Find robust short-horizon upward momentum candidates.",
      budgetPolicy: {},
      environmentSnapshot: {}
    });
    await base.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer robust positive outcomes on frozen evidence.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
    });
    query = await base.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "validation candidate"
    });
  } finally {
    await base.close();
    base = null;
  }

  const evidence = await openResearchEvidenceLedger({
    dbPath,
    now: () => NOW + 10,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT])
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
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 1_000, toMs: 9_000 } } },
        { role: "VALIDATION", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 20_000, toMs: 29_000 } } },
        { role: "SEALED_HOLDOUT", partition: { sourceIds: [SOURCE_ID], range: { fromMs: 40_000, toMs: 49_000 } } }
      ]
    });
  } finally {
    await evidence.close();
  }

  const experiments = await openResearchExperimentLedger({
    dbPath,
    now: () => NOW + 20,
    experimentIdFactory: sequence([VALIDATION_EXPERIMENT_ID, DEVELOPMENT_EXPERIMENT_ID]),
    metricSetIdFactory: sequence([VALIDATION_METRICS_ID, DEVELOPMENT_METRICS_ID])
  });
  try {
    for (const [phase, partitionId] of [
      ["VALIDATION", PART_VALIDATION],
      ["DEVELOPMENT", PART_DEV]
    ]) {
      const request = freezeAuthoritativeExperimentBatchRequest({
        objectiveVersionId: OBJECTIVE_ID,
        evidencePartitionId: partitionId,
        phase,
        sourceId: SOURCE_ID,
        sourceFingerprint: SOURCE_FINGERPRINT,
        queryArtifacts: [query],
        fromAtMs: phase === "VALIDATION" ? 20_000 : 1_000,
        toAtMs: phase === "VALIDATION" ? 20_000 : 1_000,
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
    }
  } finally {
    await experiments.close();
  }
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

test("TREE 11.5 Validation exposure and Finalist Set are durable, counted once and restart-safe", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-validation-ledger-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let validation = null;

  try {
    await seedAuthority(dbPath);
    validation = await openResearchValidationLedger({
      dbPath,
      now: () => NOW + 30,
      validationExposureIdFactory: () => EXPOSURE_ID,
      finalistSetIdFactory: () => FINALIST_ID
    });

    assert.equal(await validation.getValidationExposureCount(RUN_ID), 0);
    const exposure = await validation.recordValidationExposure({
      researchRunId: RUN_ID,
      experimentId: VALIDATION_EXPERIMENT_ID
    });
    assert.equal(exposure.validationExposureId, EXPOSURE_ID);
    assert.equal(exposure.exposureIndex, 1);
    assert.equal(exposure.partitionId, PART_VALIDATION);
    assert.equal(exposure.queryArtifacts[0].queryArtifactId, QUERY_ID);
    assert.deepEqual(exposure.schedule.horizonsMs, [10_000, 60_000]);
    assert.match(exposure.exposureHash, /^[0-9a-f]{64}$/u);

    assert.deepEqual(
      await validation.recordValidationExposure({
        researchRunId: RUN_ID,
        experimentId: VALIDATION_EXPERIMENT_ID
      }),
      exposure,
      "same durable Validation Experiment must count once"
    );
    assert.equal(await validation.getValidationExposureCount(RUN_ID), 1);
    assert.deepEqual(await validation.listValidationExposures(RUN_ID), [exposure]);

    await assert.rejects(
      validation.recordValidationExposure({
        researchRunId: RUN_ID,
        experimentId: DEVELOPMENT_EXPERIMENT_ID
      }),
      /requires a completed VALIDATION experiment/u
    );
    assert.equal(await validation.getValidationExposureCount(RUN_ID), 1);

    await assert.rejects(
      validation.authorizePartitionUse({
        researchRunId: RUN_ID,
        partitionId: PART_HOLDOUT,
        capability: "GENERAL_RESEARCH_SQL"
      }),
      /unavailable outside dedicated HOLDOUT_FINAL/u
    );
    await assert.rejects(
      validation.authorizePartitionUse({
        researchRunId: RUN_ID,
        partitionId: PART_HOLDOUT,
        capability: HOLDOUT_FINAL_CAPABILITY
      }),
      /requires an immutable Finalist Set/u
    );

    const finalist = await validation.createFinalistSet({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      queryArtifactIds: [QUERY_ID],
      evaluationProfile: evaluationProfile(),
      justification: "Freeze the Validation-supported candidate before final Holdout evaluation."
    });
    assert.equal(finalist.finalistSetId, FINALIST_ID);
    assert.equal(finalist.evidencePlanId, PLAN_ID);
    assert.equal(finalist.validationPartitionId, PART_VALIDATION);
    assert.equal(finalist.holdoutPartitionId, PART_HOLDOUT);
    assert.equal(finalist.validationExposureCountAtLock, 1);
    assert.equal(finalist.queryArtifacts[0].queryArtifactId, QUERY_ID);
    assert.deepEqual(finalist.evaluationProfile, evaluationProfile());
    assert.match(finalist.finalistHash, /^[0-9a-f]{64}$/u);

    const authorization = await validation.authorizePartitionUse({
      researchRunId: RUN_ID,
      partitionId: PART_HOLDOUT,
      capability: HOLDOUT_FINAL_CAPABILITY,
      finalistSetId: FINALIST_ID
    });
    assert.equal(authorization.finalistSetId, FINALIST_ID);
    assert.equal(authorization.holdoutPartitionId, PART_HOLDOUT);
    assert.equal(Object.hasOwn(authorization, "rows"), false);
    assert.equal(Object.hasOwn(authorization, "outcomes"), false);

    await validation.close();
    validation = null;

    validation = await openResearchValidationLedger({ dbPath, now: () => NOW + 40 });
    assert.equal(await validation.getValidationExposureCount(RUN_ID), 1);
    assert.deepEqual(await validation.listValidationExposures(RUN_ID), [exposure]);
    assert.deepEqual(await validation.getFinalistSet(RUN_ID, FINALIST_ID), finalist);
    assert.deepEqual(await validation.listFinalistSets(RUN_ID), [finalist]);
    assert.equal(
      (await validation.authorizeHoldoutEvaluation({
        researchRunId: RUN_ID,
        finalistSetId: FINALIST_ID
      })).finalistHash,
      finalist.finalistHash
    );
  } finally {
    if (validation) await validation.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
