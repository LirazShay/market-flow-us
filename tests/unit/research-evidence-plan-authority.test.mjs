import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_PARTITION_ALGORITHM,
  WHOLE_DAY_PARTITION_ALGORITHM,
  assertCommittedPlanMatchesProposal,
  assertFinalistProfileMatchesPlan,
  assertValidationRequestMatchesPlan,
  committedPlanInputFromProposal,
  proposeDeterministicEvidencePlan
} from "../../research-server/evidence-plan-authority.js";

function objective(primaryHorizonsSec = [10, 60]) {
  return {
    objectiveVersionId: "obj_11111111-1111-4111-8111-111111111111",
    objective: { targetDirection: "UP", primaryHorizonsSec }
  };
}

function source(sourceId, firstCompleteAtMs, lastCompleteAtMs, fingerprintChar) {
  return {
    sourceId,
    sourceFingerprint: fingerprintChar.repeat(64),
    firstCompleteAtMs,
    lastCompleteAtMs,
    classification: "ARCHIVE"
  };
}

function inventory(sources) {
  return { inventory: { sources } };
}

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: [10_000, 60_000],
    intervalValue: 10,
    intervalUnit: "seconds",
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    }
  };
}

test("TREE 11.5 deterministic evidence planning prefers chronological whole-day units and is input-order independent", () => {
  const sources = [
    source("archive:2026-10-01", 1_000_000, 1_100_000, "a"),
    source("archive:2026-10-02", 2_000_000, 2_100_000, "b"),
    source("archive:2026-10-03", 3_000_000, 3_100_000, "c"),
    source("archive:2026-10-04", 4_000_000, 4_100_000, "d")
  ];
  const first = proposeDeterministicEvidencePlan({
    objectiveVersion: objective(),
    evidenceInventory: inventory([sources[2], sources[0], sources[3], sources[1]]),
    evaluationProfile: evaluationProfile(),
    timingToleranceMs: 2_000
  });
  const second = proposeDeterministicEvidencePlan({
    objectiveVersion: objective(),
    evidenceInventory: inventory(sources),
    evaluationProfile: evaluationProfile(),
    timingToleranceMs: 2_000
  });

  assert.deepEqual(first, second);
  assert.equal(first.algorithmVersion, WHOLE_DAY_PARTITION_ALGORITHM);
  assert.equal(first.partitionMode, "WHOLE_DAY");
  assert.equal(first.maxHorizonMs, 60_000);
  assert.equal(first.purgeMs, 62_000);
  assert.deepEqual(first.sourceOrder, sources.map(({ sourceId }) => sourceId));
  assert.deepEqual(first.partitions.map(({ role }) => role), [
    "DEVELOPMENT",
    "VALIDATION",
    "SEALED_HOLDOUT"
  ]);
  assert.deepEqual(first.partitions[0].partition.sourceIds, [
    "archive:2026-10-01",
    "archive:2026-10-02"
  ]);
  assert.deepEqual(first.partitions[1].partition.validationSchedule.sources, [{
    sourceId: "archive:2026-10-03",
    fromAtMs: 3_000_000,
    toAtMs: 3_100_000,
    intervalValue: 10,
    intervalUnit: "seconds"
  }]);
  assert.deepEqual(first.partitions[2].partition.holdoutSchedule.sources, [{
    sourceId: "archive:2026-10-04",
    fromAtMs: 4_000_000,
    toAtMs: 4_100_000,
    intervalValue: 10,
    intervalUnit: "seconds"
  }]);

  const committed = committedPlanInputFromProposal(first);
  assert.equal(assertCommittedPlanMatchesProposal({ proposal: first, ...committed }), true);
  assert.throws(
    () => assertCommittedPlanMatchesProposal({
      proposal: first,
      plan: { ...committed.plan, purgeMs: 1 },
      partitions: committed.partitions
    }),
    /exactly match/u
  );
});

test("TREE 11.5 one-day fallback creates chronological blocks with horizon-aware purge gaps", () => {
  const proposal = proposeDeterministicEvidencePlan({
    objectiveVersion: objective(),
    evidenceInventory: inventory([
      source("archive:single-day", 1_000_000, 2_000_000, "e")
    ]),
    evaluationProfile: evaluationProfile(),
    timingToleranceMs: 5_000
  });

  assert.equal(proposal.algorithmVersion, BLOCK_PARTITION_ALGORITHM);
  assert.equal(proposal.partitionMode, "CHRONOLOGICAL_BLOCKS");
  assert.equal(proposal.purgeMs, 65_000);
  const [development, validation, holdout] = proposal.partitions;
  assert.equal(development.partition.range.toMs, 1_535_000);
  assert.equal(validation.partition.range.fromMs, 1_600_000);
  assert.equal(validation.partition.range.toMs, 1_735_000);
  assert.equal(holdout.partition.range.fromMs, 1_800_000);
  assert.equal(
    validation.partition.range.fromMs - development.partition.range.toMs,
    proposal.purgeMs
  );
  assert.equal(
    holdout.partition.range.fromMs - validation.partition.range.toMs,
    proposal.purgeMs
  );
});

test("TREE 11.5 evidence planning reports insufficient independent chronology instead of fabricating a holdout", () => {
  const proposal = proposeDeterministicEvidencePlan({
    objectiveVersion: objective([60]),
    evidenceInventory: inventory([
      source("archive:too-short", 10_000, 100_000, "f")
    ]),
    evaluationProfile: {
      ...evaluationProfile(),
      horizonsMs: [60_000]
    }
  });

  assert.equal(proposal.status, "INSUFFICIENT_INDEPENDENT_EVIDENCE");
  assert.equal(proposal.reasonCode, "INSUFFICIENT_CHRONOLOGICAL_SPAN");
  assert.equal(Object.hasOwn(proposal, "partitions"), false);
});

test("TREE 11.5 Validation and Finalist authorities require the exact frozen plan schedule/profile", () => {
  const proposal = proposeDeterministicEvidencePlan({
    objectiveVersion: objective(),
    evidenceInventory: inventory([
      source("archive:dev", 1_000_000, 1_100_000, "1"),
      source("archive:validation", 2_000_000, 2_100_000, "2"),
      source("archive:holdout", 3_000_000, 3_100_000, "3")
    ]),
    evaluationProfile: evaluationProfile()
  });
  const committed = committedPlanInputFromProposal(proposal);
  const plan = { plan: committed.plan };
  const validation = proposal.partitions[1];
  const frozenSchedule = validation.partition.validationSchedule.sources[0];

  assert.equal(assertValidationRequestMatchesPlan({
    plan,
    partition: validation,
    request: {
      sourceId: frozenSchedule.sourceId,
      fromAtMs: frozenSchedule.fromAtMs,
      toAtMs: frozenSchedule.toAtMs,
      intervalValue: frozenSchedule.intervalValue,
      intervalUnit: frozenSchedule.intervalUnit,
      topX: 3,
      horizonsMs: [10_000, 60_000]
    }
  }), true);
  assert.throws(
    () => assertValidationRequestMatchesPlan({
      plan,
      partition: validation,
      request: {
        ...frozenSchedule,
        fromAtMs: frozenSchedule.fromAtMs + 1,
        topX: 3,
        horizonsMs: [10_000, 60_000]
      }
    }),
    /fromAtMs/u
  );
  assert.throws(
    () => assertValidationRequestMatchesPlan({
      plan,
      partition: validation,
      request: {
        ...frozenSchedule,
        topX: 4,
        horizonsMs: [10_000, 60_000]
      }
    }),
    /Top-X\/horizons/u
  );

  assert.equal(assertFinalistProfileMatchesPlan({
    plan,
    evaluationProfile: evaluationProfile()
  }), true);
  assert.throws(
    () => assertFinalistProfileMatchesPlan({
      plan,
      evaluationProfile: { ...evaluationProfile(), topX: 2 }
    }),
    /must match/u
  );
});
