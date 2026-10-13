import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_VALIDATED = "qry_11111111-1111-4111-8111-111111111111";
const QUERY_UNVALIDATED = "qry_22222222-2222-4222-8222-222222222222";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const PART_HOLDOUT = "part_33333333-3333-4333-8333-333333333333";
const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const EXPOSURE_ID = "vexp_11111111-1111-4111-8111-111111111111";
const FINALIST_ID = "finalist_11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "archive:validation-domain-fixture.duckdb";
const SOURCE_FINGERPRINT = "a".repeat(64);
const NOW = 1_870_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function completedExperimentExecution(input) {
  const request = freezeAuthoritativeExperimentBatchRequest(input);
  const durableRequest = durableAuthoritativeExperimentRequest(request);
  return Object.freeze({
    durableRequest,
    metrics: Object.freeze({
      contractVersion: "research-experiment-metrics-v1",
      requestFingerprint: durableRequest.requestFingerprint,
      denominators: Object.freeze({
        requestedPointCount: 1,
        availablePointCount: 1,
        unavailablePointCount: 0,
        pointAvailabilityRate: 1,
        distinctBaselineCount: 1,
        repeatedBaselineRequestedPointCount: 0,
        queryExecutionCount: 1
      }),
      exclusions: Object.freeze({ unavailablePointReasonBreakdown: Object.freeze({}) }),
      queries: Object.freeze([])
    })
  });
}

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: [10_000, 60_000],
    intervalValue: 1,
    intervalUnit: "seconds",
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    }
  };
}

test("TREE 11.5 Research Domain makes Validation exposure unavoidable and finalists Validation-supported on the frozen deterministic plan", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-validation-domain-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const executions = [];
  let domain = null;

  try {
    domain = await openResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: () => NOW,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: sequence([QUERY_VALIDATED, QUERY_UNVALIDATED]),
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT]),
      experimentIdFactory: () => EXPERIMENT_ID,
      metricSetIdFactory: () => METRIC_SET_ID,
      validationExposureIdFactory: () => EXPOSURE_ID,
      finalistSetIdFactory: () => FINALIST_ID,
      executeExperimentBatch: async (input) => {
        executions.push(input);
        return completedExperimentExecution(input);
      },
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });

    await domain.createResearchRun({
      userIntent: "Choose a Validation-supported finalist without leaking Holdout evidence.",
      budgetPolicy: { maxExperiments: 40 },
      environmentSnapshot: { productVersion: "0.1.0" }
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer robust positive short-horizon outcomes.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3",
      scannerContractVersion: "scanner-authority-v1",
      label: "validated"
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: "SELECT security_id FROM latest ORDER BY PriceChangePercent DESC LIMIT 3",
      scannerContractVersion: "scanner-authority-v1",
      label: "never validated"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: SOURCE_ID,
          sourceFingerprint: SOURCE_FINGERPRINT,
          classification: "ARCHIVE",
          schemaVersion: 4,
          firstCompleteAtMs: 0,
          lastCompleteAtMs: 1_000_000
        }]
      }
    });
    const proposal = await domain.proposeEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      evaluationProfile: evaluationProfile()
    });
    assert.equal(proposal.partitionMode, "CHRONOLOGICAL_BLOCKS");
    const plan = await domain.commitEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      proposal
    });
    assert.equal(plan.evidencePlanId, PLAN_ID);
    const validationSchedule = proposal.partitions[1].partition.validationSchedule.sources[0];

    assert.equal(await domain.getValidationExposureCount(RUN_ID), 0);
    await assert.rejects(
      domain.executeValidationExperiment({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        partitionId: PART_VALIDATION,
        sourceId: SOURCE_ID,
        queryArtifactIds: [QUERY_VALIDATED],
        fromAtMs: validationSchedule.fromAtMs + 1,
        toAtMs: validationSchedule.toAtMs,
        intervalValue: validationSchedule.intervalValue,
        intervalUnit: validationSchedule.intervalUnit,
        topX: 3,
        horizonsMs: [10_000, 60_000]
      }),
      /fromAtMs must match the frozen validationSchedule/u
    );
    assert.equal(executions.length, 0, "invalid Validation schedule must fail before evidence execution");

    const experiment = await domain.executeValidationExperiment({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_VALIDATION,
      sourceId: SOURCE_ID,
      queryArtifactIds: [QUERY_VALIDATED],
      fromAtMs: validationSchedule.fromAtMs,
      toAtMs: validationSchedule.toAtMs,
      intervalValue: validationSchedule.intervalValue,
      intervalUnit: validationSchedule.intervalUnit,
      topX: 3,
      horizonsMs: [10_000, 60_000]
    });

    assert.equal(experiment.phase, "VALIDATION");
    assert.equal(executions.length, 1);
    assert.equal(executions[0].phase, "VALIDATION");
    assert.equal(await domain.getValidationExposureCount(RUN_ID), 1);
    const exposures = await domain.listValidationExposures(RUN_ID);
    assert.equal(exposures.length, 1);
    assert.equal(exposures[0].experimentId, EXPERIMENT_ID);
    assert.equal(exposures[0].partitionId, PART_VALIDATION);
    assert.equal(exposures[0].queryArtifacts[0].queryArtifactId, QUERY_VALIDATED);

    assert.deepEqual(await domain.getExperiment(RUN_ID, EXPERIMENT_ID), experiment);
    assert.equal((await domain.getExperimentSummary(RUN_ID, EXPERIMENT_ID)).phase, "VALIDATION");
    assert.deepEqual(await domain.listExperiments(RUN_ID), [experiment]);
    assert.equal(
      await domain.getValidationExposureCount(RUN_ID),
      1,
      "re-reading the same durable Validation Experiment must remain one counted exposure"
    );

    await assert.rejects(
      domain.createFinalistSet({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        queryArtifactIds: [QUERY_VALIDATED],
        evaluationProfile: { ...evaluationProfile(), topX: 2 },
        justification: "A caller must not change the frozen comparable Validation profile."
      }),
      /evaluationProfile must match the frozen Evidence Plan/u
    );

    await assert.rejects(
      domain.createFinalistSet({
        researchRunId: RUN_ID,
        objectiveVersionId: OBJECTIVE_ID,
        queryArtifactIds: [QUERY_UNVALIDATED],
        evaluationProfile: evaluationProfile(),
        justification: "This query exists but was never exposed on exact Validation evidence."
      }),
      /Finalist Query Artifact requires Validation exposure under the current Objective and Validation partition/u
    );

    const finalist = await domain.createFinalistSet({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      queryArtifactIds: [QUERY_VALIDATED],
      evaluationProfile: evaluationProfile(),
      justification: "Freeze the exact Validation-supported candidate before Holdout access."
    });
    assert.equal(finalist.finalistSetId, FINALIST_ID);
    assert.equal(finalist.validationPartitionId, PART_VALIDATION);
    assert.equal(finalist.holdoutPartitionId, PART_HOLDOUT);
    assert.equal(finalist.validationExposureCountAtLock, 1);

    await domain.close();
    domain = null;

    domain = await openResearchDomain({ dbPath, now: () => NOW + 1_000 });
    assert.equal(await domain.getValidationExposureCount(RUN_ID), 1);
    assert.deepEqual(await domain.getExperiment(RUN_ID, EXPERIMENT_ID), experiment);
    assert.equal(await domain.getValidationExposureCount(RUN_ID), 1);
    assert.deepEqual(await domain.getFinalistSet(RUN_ID, FINALIST_ID), finalist);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
