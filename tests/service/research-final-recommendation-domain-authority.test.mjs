import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";
import {
  durableAuthoritativeExperimentRequest,
  freezeAuthoritativeExperimentBatchRequest
} from "../../research-server/experiment-authority.js";

const RUN_ID = "run_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECTIVE_ID = "obj_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUERY_FINALIST = "qry_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUERY_REVISED = "qry_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INVENTORY_ID = "inv_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "plan_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PART_DEV = "part_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PART_VALIDATION = "part_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PART_HOLDOUT = "part_cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VALIDATION_EXPERIMENT_ID = "exp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALIDATION_METRIC_SET_ID = "metrics_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXPOSURE_ID = "vexp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FINALIST_ID = "finalist_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOLDOUT_ID = "holdout_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARTIFACT_ID = "artifact_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOURCE_ID = "archive:final-recommendation-fixture.duckdb";
const SOURCE_FINGERPRINT = "c".repeat(64);
const FINALIST_SQL = "SELECT security_id FROM latest ORDER BY Price DESC LIMIT 3";
const REVISED_SQL = "SELECT security_id FROM latest ORDER BY PriceChangePercent DESC LIMIT 3";
const NOW = 1_890_000_000_000;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function artifactPayloadHash(artifact) {
  const { artifactHash, ...payload } = artifact;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)), "utf8")
    .digest("hex");
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

async function createFixture({
  dbPath,
  queryArtifactIds = [QUERY_FINALIST],
  verificationGate = { allow: true }
} = {}) {
  const domain = await openResearchDomain({
    dbPath,
    marketDataDir: "server-owned-market-data",
    now: (() => {
      let value = NOW;
      return () => value++;
    })(),
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: sequence(queryArtifactIds),
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory: sequence([PART_DEV, PART_VALIDATION, PART_HOLDOUT]),
    experimentIdFactory: () => VALIDATION_EXPERIMENT_ID,
    metricSetIdFactory: () => VALIDATION_METRIC_SET_ID,
    validationExposureIdFactory: () => EXPOSURE_ID,
    finalistSetIdFactory: () => FINALIST_ID,
    holdoutEvaluationIdFactory: () => HOLDOUT_ID,
    recommendationArtifactIdFactory: () => ARTIFACT_ID,
    executeExperimentBatch: async (input) => completedExecution(input),
    verifySourceFingerprint: async ({ sourceId, expectedFingerprint }) => {
      assert.equal(sourceId, SOURCE_ID);
      assert.equal(expectedFingerprint, SOURCE_FINGERPRINT);
      if (!verificationGate.allow) throw new Error("source fingerprint drift fixture");
      return expectedFingerprint;
    }
  });

  await domain.createResearchRun({
    userIntent: "Find a defensible short-horizon upward-momentum Scanner query.",
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
  await domain.createFinalistSet({
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    queryArtifactIds: [QUERY_FINALIST],
    evaluationProfile: evaluationProfile(),
    justification: "Freeze the validated candidate before independent Holdout exposure."
  });
  await domain.executeHoldoutEvaluation({
    researchRunId: RUN_ID,
    finalistSetId: FINALIST_ID
  });
  return domain;
}

test("TREE 11.5 final recommendation is deterministic, evidence-complete and restart-safe for one frozen clean finalist", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-final-recommendation-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  const request = {
    researchRunId: RUN_ID,
    finalistSetId: FINALIST_ID,
    holdoutEvaluationId: HOLDOUT_ID,
    outcome: "SELECTED_QUERY",
    queryArtifactId: QUERY_FINALIST,
    stoppingReason: "The frozen finalist remained supported on independent Holdout evidence.",
    interpretation: "Use the exact frozen Scanner SQL as the final recommendation.",
    limitations: ["Fixture contains one archive source and one deterministic scheduled phase split."]
  };

  try {
    domain = await createFixture({ dbPath });
    const artifact = await domain.buildRecommendationArtifact(request);

    assert.equal(artifact.artifactId, ARTIFACT_ID);
    assert.match(artifact.artifactHash, /^[0-9a-f]{64}$/u);
    assert.equal(artifact.artifactHash, artifactPayloadHash(artifact));
    assert.equal(artifact.researchRunId, RUN_ID);
    assert.equal(artifact.outcome, "SELECTED_QUERY");
    assert.equal(artifact.confidenceClassification, "INDEPENDENT_HOLDOUT_SUPPORTED");
    assert.equal(artifact.terminalIntent.queryArtifactId, QUERY_FINALIST);
    assert.equal(artifact.selectedQuery.queryArtifactId, QUERY_FINALIST);
    assert.equal(artifact.selectedQuery.sqlText, FINALIST_SQL);
    assert.equal(artifact.objective.objectiveVersionId, OBJECTIVE_ID);
    assert.equal(artifact.objective.userIntent, "Find a defensible short-horizon upward-momentum Scanner query.");
    assert.equal(artifact.evidence.evidenceInventoryId, INVENTORY_ID);
    assert.equal(artifact.evidence.evidencePlanId, PLAN_ID);
    assert.deepEqual(
      artifact.evidence.partitions.map((partition) => partition.role),
      ["DEVELOPMENT", "VALIDATION", "SEALED_HOLDOUT"]
    );
    assert.deepEqual(artifact.searchBreadth, {
      candidateArtifactCount: 1,
      experimentCount: 1,
      analysisCount: 0,
      validationExposureCount: 1
    });
    assert.equal(artifact.validation.supportingEvidence.length, 1);
    assert.equal(artifact.validation.supportingEvidence[0].experimentId, VALIDATION_EXPERIMENT_ID);
    assert.equal(artifact.validation.supportingEvidence[0].metrics.denominators.requestedPointCount, 1);
    assert.equal(artifact.holdout.holdoutEvaluationId, HOLDOUT_ID);
    assert.equal(artifact.holdout.contaminationState, "CLEAN");
    assert.equal(artifact.holdout.independentProofForSelectedQuery, true);
    assert.equal(Object.hasOwn(artifact.holdout, "rows"), false);
    assert.equal(Object.hasOwn(artifact.holdout, "outcomes"), false);
    assert.equal(artifact.comparisonContext.baselineReference, null);
    assert.deepEqual(artifact.comparisonContext.alternativeQueryArtifactIds, []);
    assert.equal(artifact.reproductionReferences.finalistSetId, FINALIST_ID);
    assert.equal(artifact.reproductionReferences.holdoutEvaluationId, HOLDOUT_ID);
    assert.deepEqual(artifact.limitations, request.limitations);

    assert.deepEqual(await domain.buildRecommendationArtifact(request), artifact);
    await assert.rejects(
      domain.buildRecommendationArtifact({
        ...request,
        stoppingReason: "Conflicting terminal rationale."
      }),
      /already finalized with different terminal intent/u
    );

    const run = await domain.getResearchRun(RUN_ID);
    assert.equal(run.status, "COMPLETED");
    assert.equal(run.currentPhase, "FINALIZATION");

    await domain.close();
    domain = await openResearchDomain({
      dbPath,
      now: () => NOW + 10_000,
      marketDataDir: "server-owned-market-data",
      verifySourceFingerprint: async () => SOURCE_FINGERPRINT
    });
    assert.deepEqual(await domain.getRecommendationArtifact(RUN_ID), artifact);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.5 revised post-Holdout SQL cannot claim independent proof and NO_RECOMMENDATION remains a complete terminal artifact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-final-no-recommendation-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    domain = await createFixture({ dbPath, queryArtifactIds: [QUERY_FINALIST, QUERY_REVISED] });
    const revised = await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      parentQueryArtifactId: QUERY_FINALIST,
      sqlText: REVISED_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "post-holdout revision"
    });
    assert.equal(revised.queryArtifactId, QUERY_REVISED);

    await assert.rejects(
      domain.buildRecommendationArtifact({
        researchRunId: RUN_ID,
        finalistSetId: FINALIST_ID,
        holdoutEvaluationId: HOLDOUT_ID,
        outcome: "SELECTED_QUERY",
        queryArtifactId: QUERY_REVISED,
        stoppingReason: "Attempt to promote a post-Holdout revision.",
        limitations: []
      }),
      /exact frozen Finalist Set|independent Holdout proof/u
    );

    const artifact = await domain.buildRecommendationArtifact({
      researchRunId: RUN_ID,
      finalistSetId: FINALIST_ID,
      holdoutEvaluationId: HOLDOUT_ID,
      outcome: "NO_RECOMMENDATION",
      stoppingReason: "Post-Holdout tuning contaminated the revised lineage, so no independent final candidate remains defensible.",
      interpretation: "Preserve the evidence and decline to recommend revised SQL as independently validated.",
      limitations: ["Fresh independent Holdout evidence would be required for the revised lineage."]
    });

    assert.equal(artifact.outcome, "NO_RECOMMENDATION");
    assert.equal(artifact.confidenceClassification, "INSUFFICIENT_FOR_RECOMMENDATION");
    assert.equal(artifact.selectedQuery, null);
    assert.equal(artifact.strongestCandidates.length, 1);
    assert.equal(artifact.strongestCandidates[0].queryArtifactId, QUERY_FINALIST);
    assert.equal(artifact.strongestCandidates[0].sqlText, FINALIST_SQL);
    assert.equal(artifact.holdout.contaminationState, "CONTAMINATED");
    assert.deepEqual(artifact.holdout.contaminatedQueryArtifactIds, [QUERY_REVISED]);
    assert.equal(artifact.holdout.independentProofForSelectedQuery, false);
    assert.equal(artifact.searchBreadth.candidateArtifactCount, 2);
    assert.deepEqual(artifact.comparisonContext.alternativeQueryArtifactIds, [QUERY_FINALIST]);
    assert.equal(artifact.stoppingReason.includes("no independent final candidate"), true);
    assert.deepEqual(
      artifact.limitations,
      ["Fresh independent Holdout evidence would be required for the revised lineage."]
    );
    assert.equal(artifact.artifactHash, artifactPayloadHash(artifact));
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.5 finalization fails closed on source fingerprint drift without fabricating a terminal artifact", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-final-source-drift-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const verificationGate = { allow: true };
  let domain = null;

  try {
    domain = await createFixture({ dbPath, verificationGate });
    verificationGate.allow = false;

    await assert.rejects(
      domain.buildRecommendationArtifact({
        researchRunId: RUN_ID,
        finalistSetId: FINALIST_ID,
        holdoutEvaluationId: HOLDOUT_ID,
        outcome: "NO_RECOMMENDATION",
        stoppingReason: "Do not finalize when reproduction evidence bytes no longer match their fingerprint.",
        limitations: ["Source fingerprint drift prevents trustworthy reproduction."]
      }),
      /source fingerprint drift fixture/u
    );

    assert.equal(await domain.getRecommendationArtifact(RUN_ID), null);
    const run = await domain.getResearchRun(RUN_ID);
    assert.equal(run.status, "ACTIVE");
    assert.notEqual(run.currentPhase, "FINALIZATION");
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
