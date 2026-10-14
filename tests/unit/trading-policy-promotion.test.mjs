import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessPolicyCandidatePromotion,
  createPolicyCandidate,
  evaluateDeterministicPolicy,
  promotePolicyCandidate
} from "../../trading-server/policy-promotion.js";

const POLICY = {
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: { enterOnUsableQuote: true, maxWatchMs: 30_000 },
  exit: { takeProfitBps: 80, stopLossBps: 35, maxHoldMs: 120_000 }
};

function candidate(overrides = {}) {
  return {
    policyCandidateId: "pcand-1",
    baselinePolicyVersionId: "pol-base",
    createdAtMs: 1_900_000_000_000,
    claimScope: "STRATEGY_LEVEL",
    policy: POLICY,
    learningEvidenceRefs: ["episode-comparison:1"],
    ...overrides
  };
}

const EPISODE_PASS = {
  authority: "EPISODE_ATTRIBUTION",
  status: "PASS",
  evidenceRef: "episodes:comparison-1"
};
const HISTORICAL_PASS = {
  authority: "HISTORICAL_BACKTEST",
  status: "PASS",
  evidenceRef: "backtest:run-7"
};

test("TREE 12.8 PolicyCandidate accepts only typed deterministic server-known policy fields", () => {
  const value = createPolicyCandidate(candidate());
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.policy.exit), true);
  assert.deepEqual(value.policy, {
    schemaVersion: 1,
    kind: "DETERMINISTIC_TRADING_POLICY_V1",
    entry: { enterOnUsableQuote: true, maxWatchMs: 30_000 },
    exit: { takeProfitBps: 80, stopLossBps: 35, maxHoldMs: 120_000 }
  });

  assert.throws(
    () => createPolicyCandidate(candidate({
      policy: { ...POLICY, executableCode: "return true" }
    })),
    /executableCode is not supported/iu
  );
});

test("TREE 12.8 promoted policy primitives execute deterministically without AI", () => {
  const input = {
    policy: POLICY,
    lifecycleState: "WATCHING",
    nowMs: 1_010,
    watchStartedAtMs: 1_000,
    quote: { usableForNewDecision: true, last: 100 }
  };
  assert.deepEqual(evaluateDeterministicPolicy(input), evaluateDeterministicPolicy(input));
  assert.deepEqual(evaluateDeterministicPolicy(input), {
    decisionType: "ENTER",
    actionType: "REQUEST_ENTRY",
    reasonCode: "POLICY_USABLE_QUOTE_ENTRY"
  });
  assert.equal(evaluateDeterministicPolicy({
    policy: POLICY,
    lifecycleState: "POSITION_OPEN",
    nowMs: 5_000,
    positionOpenedAtMs: 1_000,
    entryPrice: 100,
    quote: { last: 101 }
  }).reasonCode, "POLICY_TAKE_PROFIT");
  assert.equal(evaluateDeterministicPolicy({
    policy: POLICY,
    lifecycleState: "POSITION_OPEN",
    nowMs: 5_000,
    positionOpenedAtMs: 1_000,
    entryPrice: 100,
    quote: { last: 99.5 }
  }).reasonCode, "POLICY_STOP_LOSS");
});

test("TREE 12.8 strategy-level candidate stays NO_PROMOTION until both evidence authorities pass", () => {
  const incomplete = assessPolicyCandidatePromotion({
    candidate: candidate(),
    validationEvidence: [EPISODE_PASS]
  });
  assert.equal(incomplete.status, "NO_PROMOTION");
  assert.deepEqual(incomplete.reasons, ["VALIDATION_MISSING:HISTORICAL_BACKTEST"]);

  const ready = assessPolicyCandidatePromotion({
    candidate: candidate(),
    validationEvidence: [HISTORICAL_PASS, EPISODE_PASS]
  });
  assert.equal(ready.status, "READY_FOR_EXPLICIT_PROMOTION");
  assert.deepEqual(ready.reasons, []);
});

test("TREE 12.8 execution-only candidate does not invent a strategy-level historical requirement", () => {
  const ready = assessPolicyCandidatePromotion({
    candidate: candidate({ claimScope: "EXECUTION_ONLY" }),
    validationEvidence: [EPISODE_PASS]
  });
  assert.equal(ready.status, "READY_FOR_EXPLICIT_PROMOTION");
  assert.deepEqual(ready.requiredAuthorities, ["EPISODE_ATTRIBUTION"]);
});

test("TREE 12.8 promotion is explicit and NO_PROMOTION never mutates Trading Ledger", async () => {
  const calls = [];
  const ledger = {
    async createPolicyVersion({ policy }) {
      calls.push(policy);
      return {
        policyVersionId: "pol-promoted",
        policy,
        createdAtMs: 1_900_000_000_100
      };
    }
  };

  const notExplicit = await promotePolicyCandidate({
    ledger,
    candidate: candidate(),
    validationEvidence: [EPISODE_PASS, HISTORICAL_PASS]
  });
  assert.equal(notExplicit.status, "NO_PROMOTION");
  assert.deepEqual(notExplicit.reasons, ["EXPLICIT_PROMOTION_REQUIRED"]);
  assert.equal(calls.length, 0);

  const insufficient = await promotePolicyCandidate({
    ledger,
    candidate: candidate(),
    validationEvidence: [EPISODE_PASS],
    explicitPromotion: true
  });
  assert.equal(insufficient.status, "NO_PROMOTION");
  assert.equal(calls.length, 0);

  const promoted = await promotePolicyCandidate({
    ledger,
    candidate: candidate(),
    validationEvidence: [EPISODE_PASS, HISTORICAL_PASS],
    explicitPromotion: true
  });
  assert.equal(promoted.status, "PROMOTED");
  assert.equal(promoted.policyVersion.policyVersionId, "pol-promoted");
  assert.equal(calls.length, 1);
  assert.equal(Object.isFrozen(promoted.policyVersion.policy), true);
});
