import assert from "node:assert/strict";
import test from "node:test";

import {
  HOLDOUT_FINAL_CAPABILITY,
  authorizeSealedHoldout,
  freezeFinalistSet,
  freezeValidationExposure
} from "../../research-server/validation-authority-core.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const VALIDATION_PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const HOLDOUT_PARTITION_ID = "part_22222222-2222-4222-8222-222222222222";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const EXPOSURE_ID = "vexp_11111111-1111-4111-8111-111111111111";
const FINALIST_ID = "finalist_11111111-1111-4111-8111-111111111111";
const HASH = "a".repeat(64);
const QUERY = Object.freeze({
  queryArtifactId: QUERY_ID,
  sqlHash: HASH,
  scannerContractVersion: "scanner-authority-v1"
});

function finalist() {
  return freezeFinalistSet({
    finalistSetId: FINALIST_ID,
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    evidencePlanId: PLAN_ID,
    validationPartitionId: VALIDATION_PARTITION_ID,
    holdoutPartitionId: HOLDOUT_PARTITION_ID,
    queryArtifacts: [QUERY],
    evaluationProfile: {
      selectionPolicy: "TOP_N",
      topX: 3,
      horizonsMs: [10_000, 60_000],
      metricProfile: { contractVersion: "research-experiment-metrics-v1" }
    },
    validationExposureCountAtLock: 2,
    justification: "Freeze the strongest validation-supported candidate before sealed evaluation.",
    createdAtMs: 1_860_000_000_000
  });
}

test("TREE 11.5 Validation exposure is immutable, count-addressable durable payload", () => {
  const exposure = freezeValidationExposure({
    validationExposureId: EXPOSURE_ID,
    researchRunId: RUN_ID,
    objectiveVersionId: OBJECTIVE_ID,
    partitionId: VALIDATION_PARTITION_ID,
    experimentId: EXPERIMENT_ID,
    metricSetId: METRIC_SET_ID,
    requestFingerprint: HASH,
    queryArtifacts: [QUERY],
    schedule: {
      requestedAtMsList: [1000, 2000],
      topX: 3,
      horizonsMs: [10_000, 60_000]
    },
    exposureIndex: 2,
    createdAtMs: 1_860_000_000_000
  });

  assert.equal(exposure.exposureIndex, 2);
  assert.equal(exposure.experimentId, EXPERIMENT_ID);
  assert.equal(exposure.queryArtifacts[0].queryArtifactId, QUERY_ID);
  assert.match(exposure.exposureHash, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(exposure), true);
  assert.equal(Object.isFrozen(exposure.schedule), true);
});

test("TREE 11.5 Finalist Set freezes exact query/objective/evidence/evaluation authority", () => {
  const frozen = finalist();

  assert.equal(frozen.objectiveVersionId, OBJECTIVE_ID);
  assert.equal(frozen.evidencePlanId, PLAN_ID);
  assert.equal(frozen.queryArtifacts[0].queryArtifactId, QUERY_ID);
  assert.deepEqual(frozen.evaluationProfile.horizonsMs, [10_000, 60_000]);
  assert.equal(frozen.validationExposureCountAtLock, 2);
  assert.match(frozen.finalistHash, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(frozen.evaluationProfile.metricProfile), true);
});

test("TREE 11.5 Sealed Holdout is denied unless dedicated final capability carries exact Finalist Set", () => {
  const frozen = finalist();

  assert.throws(
    () => authorizeSealedHoldout({
      capability: "GENERAL_RESEARCH_SQL",
      researchRunId: RUN_ID,
      holdoutPartitionId: HOLDOUT_PARTITION_ID,
      finalistSet: frozen
    }),
    /unavailable outside dedicated HOLDOUT_FINAL/u
  );

  assert.throws(
    () => authorizeSealedHoldout({
      capability: HOLDOUT_FINAL_CAPABILITY,
      researchRunId: RUN_ID,
      holdoutPartitionId: HOLDOUT_PARTITION_ID
    }),
    /requires an immutable Finalist Set/u
  );

  const authorization = authorizeSealedHoldout({
    capability: HOLDOUT_FINAL_CAPABILITY,
    researchRunId: RUN_ID,
    holdoutPartitionId: HOLDOUT_PARTITION_ID,
    finalistSet: frozen
  });

  assert.deepEqual(authorization.queryArtifacts, frozen.queryArtifacts);
  assert.deepEqual(authorization.evaluationProfile, frozen.evaluationProfile);
  assert.equal(authorization.finalistHash, frozen.finalistHash);
  assert.equal(Object.hasOwn(authorization, "rows"), false);
  assert.equal(Object.hasOwn(authorization, "outcomes"), false);
});

test("TREE 11.5 Holdout authorization rejects cross-run and cross-partition reuse", () => {
  const frozen = finalist();

  assert.throws(
    () => authorizeSealedHoldout({
      capability: HOLDOUT_FINAL_CAPABILITY,
      researchRunId: "run_22222222-2222-4222-8222-222222222222",
      holdoutPartitionId: HOLDOUT_PARTITION_ID,
      finalistSet: frozen
    }),
    /different Research Run/u
  );

  assert.throws(
    () => authorizeSealedHoldout({
      capability: HOLDOUT_FINAL_CAPABILITY,
      researchRunId: RUN_ID,
      holdoutPartitionId: "part_33333333-3333-4333-8333-333333333333",
      finalistSet: frozen
    }),
    /does not authorize this Sealed Holdout partition/u
  );
});
