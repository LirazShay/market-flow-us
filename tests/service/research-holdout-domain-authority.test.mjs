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
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_FINALIST = "qry_11111111-1111-4111-8111-111111111111";
const QUERY_SAME = "qry_22222222-2222-4222-8222-222222222222";
const QUERY_REVISED = "qry_33333333-3333-4333-8333-333333333333";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const PART_HOLDOUT = "part_33333333-3333-4333-8333-333333333333";
const VALIDATION_EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const VALIDATION_METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const EXPOSURE_ID = "vexp_11111111-1111-4111-8111-111111111111";
const FINALIST_ID = "finalist_11111111-1111-4111-8111-111111111111";
const HOLDOUT_ID = "holdout_11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "archive:holdout-domain-fixture.duckdb";
const SOURCE_FINGERPRINT = "a".repeat(64);
const FINALIST_SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const NOW = 1_880_000_000_000;

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
        queryArtifactId: QUERY_FINALIST,
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

test("TREE 11.5 Research Domain keeps Holdout sealed, evaluates frozen finalists once and derives only material post-Holdout SQL contamination", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-holdout-domain-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const executions = [];
  let domain = null;
  let baseLedger = null;

  try {
    domain = await openResearchDomain({
      dbPath,
      marketDataDir: "server-owned-market-data",
      now: (() => {
        let value = NOW;
        return () => value++;
      })(),
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: sequence([QUERY_FINALIST, QUERY_SAME]),
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT]),
      experimentIdFactory: () => VALIDATION_EXPERIMENT_ID,
      metricSetIdFactory: () => VALIDATION_METRIC_SET_ID,
      validationExposureIdFactory: () => EXPOSURE_ID,
      finalistSetIdFactory: () => FINALIST_ID,
      holdoutEvaluationIdFactory: () => HOLDOUT_ID,
      executeExperimentBatch: async (input) => {
        executions.push(input);
        return completedExecution(input);
      },
      verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
        assert.equal(sourceId, SOURCE_ID);
        assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
        return expectedFingerprint;
      }
    });

    await domain.createResearchRun({
      userIntent: "Confirm a frozen finalist on independent sealed evidence.",
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
      label: "finalist"
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
    const holdoutSchedule = proposal.partitions[2].partition.holdoutSchedule.sources[0];

    await domain.executeValidationExperiment({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_VALIDATION,
      sourceId: SOURCE_ID,
      queryArtifactIds: [QUERY_FINALIST],
      fromAtMs: validationSchedule.fromAtMs,
      toAtMs: validationSchedule.toAtMs,
      intervalValue: validationSchedule.intervalValue,
      intervalUnit: validationSchedule.intervalUnit,
      topX: 3,
      horizonsMs: [10_000, 60_000]
    });
    const finalist = await domain.createFinalistSet({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      queryArtifactIds: [QUERY_FINALIST],
      evaluationProfile: evaluationProfile(),
      justification: "Freeze the exact validated query before any Holdout outcome is visible."
    });
    assert.equal(finalist.finalistSetId, FINALIST_ID);

    await assert.rejects(
      domain.openDevelopmentResearchSql({
        researchRunId: RUN_ID,
        partitionId: PART_HOLDOUT,
        experimentIds: []
      }),
      /DEVELOPMENT partition/u
    );

    const holdout = await domain.executeHoldoutEvaluation({
      researchRunId: RUN_ID,
      finalistSetId: FINALIST_ID
    });
    assert.equal(holdout.holdoutEvaluationId, HOLDOUT_ID);
    assert.equal(holdout.finalistSetId, FINALIST_ID);
    assert.equal(holdout.partitionId, PART_HOLDOUT);
    assert.equal(holdout.contaminationState, "CLEAN");
    assert.ok(Number.isSafeInteger(holdout.exposedAtMs));
    assert.equal(Object.hasOwn(holdout, "rows"), false);
    assert.equal(Object.hasOwn(holdout, "outcomes"), false);
    assert.equal(holdout.sourceResults.length, 1);
    assert.equal(holdout.sourceResults[0].sourceId, SOURCE_ID);
    assert.deepEqual(holdout.sourceResults[0].schedule, {
      fromAtMs: holdoutSchedule.fromAtMs,
      toAtMs: holdoutSchedule.toAtMs,
      intervalValue: holdoutSchedule.intervalValue,
      intervalUnit: holdoutSchedule.intervalUnit
    });

    assert.equal(executions.length, 2);
    assert.equal(executions[1].evidencePartitionId, PART_HOLDOUT);
    assert.equal(executions[1].sourceId, SOURCE_ID);
    assert.equal(executions[1].queryArtifacts[0].queryArtifactId, QUERY_FINALIST);
    assert.equal(executions[1].fromAtMs, holdoutSchedule.fromAtMs);
    assert.equal(executions[1].toAtMs, holdoutSchedule.toAtMs);
    assert.equal(executions[1].topX, 3);
    assert.deepEqual(executions[1].horizonsMs, [10_000, 60_000]);

    assert.deepEqual(
      await domain.executeHoldoutEvaluation({ researchRunId: RUN_ID, finalistSetId: FINALIST_ID }),
      holdout,
      "same Finalist Set must not consume sealed evidence twice"
    );
    assert.equal(executions.length, 2);

    const sameSql = await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      parentQueryArtifactId: QUERY_FINALIST,
      sqlText: FINALIST_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "byte-identical post-holdout lineage"
    });
    assert.equal(sameSql.queryArtifactId, QUERY_SAME);
    const stillClean = await domain.getHoldoutEvaluation(RUN_ID, HOLDOUT_ID);
    assert.equal(stillClean.contaminationState, "CLEAN");
    assert.deepEqual(stillClean.contaminatedQueryArtifactIds, []);

    await domain.close();
    domain = null;

    baseLedger = await openResearchLedger({
      dbPath,
      now: () => holdout.exposedAtMs + 1,
      queryArtifactIdFactory: () => QUERY_REVISED
    });
    const revised = await baseLedger.createQueryArtifact({
      researchRunId: RUN_ID,
      parentQueryArtifactId: QUERY_SAME,
      sqlText: "SELECT security_id FROM latest ORDER BY PriceChangePercent DESC LIMIT 3",
      scannerContractVersion: "scanner-authority-v1",
      label: "post-holdout revision"
    });
    assert.equal(revised.queryArtifactId, QUERY_REVISED);
    await baseLedger.close();
    baseLedger = null;

    domain = await openResearchDomain({ dbPath, now: () => NOW + 10_000 });
    const afterRestart = await domain.getHoldoutEvaluation(RUN_ID, HOLDOUT_ID);
    assert.equal(afterRestart.contaminationState, "CONTAMINATED");
    assert.deepEqual(afterRestart.contaminatedQueryArtifactIds, [QUERY_REVISED]);
    assert.equal(afterRestart.exposedAtMs, holdout.exposedAtMs);
  } finally {
    if (baseLedger) await baseLedger.close();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
