import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateDeterministicSupervisorDecision,
  isDeterministicPolicy,
  resolveDeterministicPolicyEvidence
} from "../../trading-server/policy-supervisor.js";
import { createSupervisorState } from "../../trading-server/supervisor.js";

const POLICY = Object.freeze({
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: Object.freeze({
    enterOnUsableQuote: true,
    maxWatchMs: 30_000
  }),
  exit: Object.freeze({
    takeProfitBps: 100,
    stopLossBps: 50,
    maxHoldMs: 120_000
  })
});

function state(overrides = {}) {
  return createSupervisorState({
    tradingRunId: "run-1",
    tradeEpisodeId: "episode-1",
    policyVersionId: "policy-1",
    candidateKey: "AAPL",
    lifecycleState: "WATCHING",
    stateVersion: 4,
    ...overrides
  });
}

function supervisorRecord(observedAtMs, lifecycleState, stateVersion) {
  return {
    observedAtMs,
    state: {
      kind: "TRADING_SUPERVISOR_V1",
      version: 1,
      supervisorState: state({ lifecycleState, stateVersion })
    }
  };
}

const FRESH_QUOTE = Object.freeze({
  usableForNewDecision: true,
  last: 101
});

test("TREE 12.8 deterministic policy kind is explicit and narrow", () => {
  assert.equal(isDeterministicPolicy(POLICY), true);
  assert.equal(isDeterministicPolicy({ kind: "OTHER" }), false);
  assert.equal(isDeterministicPolicy(null), false);
});

test("TREE 12.8 deterministic policy can enter through existing Supervisor transition authority without AI", () => {
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: state(),
    quote: FRESH_QUOTE,
    nowMs: 10_000,
    watchStartedAtMs: 0
  });

  assert.equal(result.state.lifecycleState, "ENTRY_PENDING");
  assert.equal(result.state.stateVersion, 5);
  assert.deepEqual(result.action, { type: "REQUEST_ENTRY" });
  assert.deepEqual(result.decision, {
    decisionType: "ENTER",
    source: "DETERMINISTIC_POLICY",
    proposalStatus: "NOT_APPLICABLE",
    reasonCode: "POLICY_USABLE_QUOTE_ENTRY"
  });
});

test("TREE 12.8 deterministic policy remains fail-closed when entry quote is not usable", () => {
  const current = state();
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: current,
    quote: { usableForNewDecision: false, last: 101 },
    nowMs: 10_000,
    watchStartedAtMs: 0
  });

  assert.deepEqual(result.state, current);
  assert.deepEqual(result.action, { type: "NONE" });
  assert.equal(result.decision.source, "DETERMINISTIC_POLICY");
  assert.equal(result.decision.reasonCode, "POLICY_WAIT_FOR_ENTRY");
});

test("TREE 12.8 missing durable watch evidence fails closed instead of fabricating a timer", () => {
  const current = state();
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: current,
    quote: FRESH_QUOTE,
    nowMs: 10_000
  });

  assert.deepEqual(result.state, current);
  assert.deepEqual(result.action, { type: "NONE" });
  assert.equal(result.decision.decisionType, null);
  assert.equal(result.decision.reasonCode, "POLICY_WATCH_EVIDENCE_MISSING");
});

test("TREE 12.8 deterministic entry timeout closes the episode through Supervisor SKIP transition", () => {
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: state(),
    quote: FRESH_QUOTE,
    nowMs: 30_000,
    watchStartedAtMs: 0
  });

  assert.equal(result.state.lifecycleState, "CLOSED");
  assert.equal(result.state.stateVersion, 5);
  assert.deepEqual(result.action, { type: "NONE" });
  assert.equal(result.decision.decisionType, "SKIP");
  assert.equal(result.decision.reasonCode, "POLICY_ENTRY_TIMEOUT");
});

test("TREE 12.8 deterministic take-profit exits through existing Supervisor transition authority without AI", () => {
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: state({ lifecycleState: "POSITION_OPEN", stateVersion: 8 }),
    quote: FRESH_QUOTE,
    nowMs: 20_000,
    positionOpenedAtMs: 1_000,
    entryPrice: 100
  });

  assert.equal(result.state.lifecycleState, "EXIT_PENDING");
  assert.equal(result.state.stateVersion, 9);
  assert.deepEqual(result.action, { type: "REQUEST_EXIT" });
  assert.deepEqual(result.decision, {
    decisionType: "EXIT",
    source: "DETERMINISTIC_POLICY",
    proposalStatus: "NOT_APPLICABLE",
    reasonCode: "POLICY_TAKE_PROFIT"
  });
});

test("TREE 12.8 missing durable position evidence fails closed instead of inventing entry price", () => {
  const current = state({ lifecycleState: "POSITION_OPEN", stateVersion: 8 });
  const result = evaluateDeterministicSupervisorDecision({
    policy: POLICY,
    state: current,
    quote: FRESH_QUOTE,
    nowMs: 20_000,
    positionOpenedAtMs: 1_000
  });

  assert.deepEqual(result.state, current);
  assert.deepEqual(result.action, { type: "NONE" });
  assert.equal(result.decision.decisionType, "HOLD");
  assert.equal(result.decision.reasonCode, "POLICY_POSITION_EVIDENCE_MISSING");
});

test("TREE 12.8 durable policy evidence is derived only from episode records", () => {
  const current = state({ lifecycleState: "POSITION_OPEN", stateVersion: 8 });
  const evidence = resolveDeterministicPolicyEvidence({
    state: current,
    bundle: {
      positionStates: [
        supervisorRecord(1_000, "WATCHING", 1),
        supervisorRecord(2_000, "POSITION_OPEN", 7),
        { observedAtMs: 2_100, state: { side: "LONG", quantity: 1, averagePrice: 100.25 } },
        { observedAtMs: 2_200, state: { side: "LONG", quantity: 1, averagePrice: 100.5 } }
      ]
    }
  });

  assert.deepEqual(evidence, {
    watchStartedAtMs: 1_000,
    positionOpenedAtMs: 2_000,
    entryPrice: 100.5,
    lifecycleState: "POSITION_OPEN"
  });
});

test("TREE 12.8 deterministic Supervisor integration is reproducible for identical policy and evidence", () => {
  const input = {
    policy: POLICY,
    state: state({ lifecycleState: "POSITION_OPEN", stateVersion: 8 }),
    quote: { usableForNewDecision: true, last: 99 },
    nowMs: 20_000,
    positionOpenedAtMs: 1_000,
    entryPrice: 100
  };

  assert.deepEqual(
    evaluateDeterministicSupervisorDecision(input),
    evaluateDeterministicSupervisorDecision(input)
  );
  assert.equal(evaluateDeterministicSupervisorDecision(input).decision.reasonCode, "POLICY_STOP_LOSS");
});
