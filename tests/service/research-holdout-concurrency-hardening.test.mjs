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

const RUN_ID = "run_41414141-4141-4141-8141-414141414141";
const OBJECTIVE_ID = "obj_41414141-4141-4141-8141-414141414141";
const QUERY_ID = "qry_41414141-4141-4141-8141-414141414141";
const INVENTORY_ID = "inv_41414141-4141-4141-8141-414141414141";
const PLAN_ID = "plan_41414141-4141-4141-8141-414141414141";
const PART_DEV = "part_41414141-4141-4141-8141-414141414141";
const PART_VALIDATION = "part_42424242-4242-4242-8242-424242424242";
const PART_HOLDOUT = "part_43434343-4343-4343-8343-434343434343";
const VALIDATION_EXPERIMENT_ID = "exp_41414141-4141-4141-8141-414141414141";
const VALIDATION_METRIC_SET_ID = "metrics_41414141-4141-4141-8141-414141414141";
const EXPOSURE_ID = "vexp_41414141-4141-4141-8141-414141414141";
const FINALIST_ID = "finalist_41414141-4141-4141-8141-414141414141";
const HOLDOUT_ID = "holdout_41414141-4141-4141-8141-414141414141";
const SOURCE_ID = "archive:holdout-concurrency-hardening.duckdb";
const SOURCE_FINGERPRINT = "4".repeat(64);
const FINALIST_SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const NOW = 1_941_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function completedExecution(input) {
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
      queries: Object.freeze([Object.freeze({
        queryArtifactId: QUERY_ID,
        zeroResultPointCount: 0,
        horizons: Object.freeze([])
      })])
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

test("TREE 11.7 concurrent Holdout requests consume sealed authority at most once", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-holdout-concurrency-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let releaseHoldout;

  try {
    let holdoutExecutionCount = 0;
    let firstHoldoutEntered;
    const firstHoldoutEntry = new Promise((resolve) => {
      firstHoldoutEntered = resolve;
    });
    let secondHoldoutEntered;
    const secondHoldoutEntry = new Promise((resolve) => {
      secondHoldoutEntered = resolve;
    });
    const holdoutRelease = new Promise((resolve) => {
      releaseHoldout = resolve;
    });

    domain = await openResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: (() => {
        let value = NOW;
        return () => value++;
      })(),
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT]),
      experimentIdFactory: () => VALIDATION_EXPERIMENT_ID,
      metricSetIdFactory: () => VALIDATION_METRIC_SET_ID,
      validationExposureIdFactory: () => EXPOSURE_ID,
      finalistSetIdFactory: () => FINALIST_ID,
      holdoutEvaluationIdFactory: () => HOLDOUT_ID,
      executeExperimentBatch: async (input) => {
        if (input.evidencePartitionId === PART_HOLDOUT) {
          holdoutExecutionCount += 1;
          if (holdoutExecutionCount === 1) firstHoldoutEntered();
          if (holdoutExecutionCount === 2) secondHoldoutEntered();
          await holdoutRelease;
        }
        return completedExecution(input);
      },
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });

    await domain.createResearchRun({
      userIntent: "Prove one-shot Holdout authority under concurrent calls.",
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
      sqlText: FINALIST_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "concurrency finalist"
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
    await domain.commitEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      proposal
    });

    const validationSchedule = proposal.partitions[1].partition.validationSchedule.sources[0];
    await domain.executeValidationExperiment({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_VALIDATION,
      sourceId: SOURCE_ID,
      queryArtifactIds: [QUERY_ID],
      fromAtMs: validationSchedule.fromAtMs,
      toAtMs: validationSchedule.toAtMs,
      intervalValue: validationSchedule.intervalValue,
      intervalUnit: validationSchedule.intervalUnit,
      topX: 3,
      horizonsMs: [10_000, 60_000]
    });
    await domain.createFinalistSet({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      queryArtifactIds: [QUERY_ID],
      evaluationProfile: evaluationProfile(),
      justification: "Freeze exact Validation-supported authority before Holdout."
    });

    const first = domain.executeHoldoutEvaluation({
      researchRunId: RUN_ID,
      finalistSetId: FINALIST_ID
    });
    await firstHoldoutEntry;

    const second = domain.executeHoldoutEvaluation({
      researchRunId: RUN_ID,
      finalistSetId: FINALIST_ID
    });
    const duplicateExecutionObserved = await Promise.race([
      secondHoldoutEntry.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 100))
    ]);

    releaseHoldout();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(
      duplicateExecutionObserved,
      false,
      "a concurrent duplicate request must join the in-flight Holdout evaluation instead of consuming sealed evidence again"
    );
    assert.equal(holdoutExecutionCount, 1);
    assert.deepEqual(secondResult, firstResult);
    assert.equal(firstResult.holdoutEvaluationId, HOLDOUT_ID);
  } finally {
    releaseHoldout?.();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
