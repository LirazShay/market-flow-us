import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applySupervisorBrokerEvent,
  createSupervisorState,
  evaluateSupervisorDecision,
  validateDecisionProposal
} from "../../trading-server/supervisor.js";

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

function proposal(decisionType, overrides = {}) {
  return {
    decisionType,
    tradingRunId: "run-1",
    tradeEpisodeId: "episode-1",
    policyVersionId: "policy-1",
    observedStateVersion: 4,
    ...overrides
  };
}

const FRESH_QUOTE = Object.freeze({ usableForNewDecision: true });

test("TREE 12.4 same exact state, policy and proposal produce the same deterministic decision", () => {
  const input = {
    state: state(),
    proposal: proposal("ENTER"),
    quote: FRESH_QUOTE
  };

  const first = evaluateSupervisorDecision(input);
  const second = evaluateSupervisorDecision(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    state: {
      tradingRunId: "run-1",
      tradeEpisodeId: "episode-1",
      policyVersionId: "policy-1",
      candidateKey: "AAPL",
      lifecycleState: "ENTRY_PENDING",
      stateVersion: 5
    },
    decision: {
      decisionType: "ENTER",
      source: "AI_PROPOSAL",
      proposalStatus: "ACCEPTED",
      reasonCode: "AI_PROPOSAL_ACCEPTED"
    },
    action: { type: "REQUEST_ENTRY" }
  });
});

test("TREE 12.4 stale or wrong-policy proposals fail closed without changing authoritative state", () => {
  for (const [overrides, reasonCode] of [
    [{ observedStateVersion: 3 }, "AI_PROPOSAL_STALE_STATE"],
    [{ policyVersionId: "policy-old" }, "AI_PROPOSAL_POLICY_MISMATCH"],
    [{ tradingRunId: "run-other" }, "AI_PROPOSAL_RUN_MISMATCH"],
    [{ tradeEpisodeId: "episode-other" }, "AI_PROPOSAL_EPISODE_MISMATCH"]
  ]) {
    const current = state();
    const result = evaluateSupervisorDecision({
      state: current,
      proposal: proposal("ENTER", overrides),
      quote: FRESH_QUOTE
    });

    assert.deepEqual(result.state, current);
    assert.deepEqual(result.action, { type: "NONE" });
    assert.equal(result.decision.source, "DETERMINISTIC_FALLBACK");
    assert.equal(result.decision.proposalStatus, "REJECTED");
    assert.equal(result.decision.reasonCode, reasonCode);
  }
});

test("TREE 12.4 malformed proposals cannot smuggle broker orders or hard-risk changes", () => {
  for (const injectedField of ["orderIntent", "hardRiskLimits", "providerRequest"]) {
    const validation = validateDecisionProposal({
      state: state(),
      proposal: proposal("ENTER", { [injectedField]: { bypass: true } })
    });

    assert.deepEqual(validation, {
      accepted: false,
      reasonCode: "AI_PROPOSAL_MALFORMED"
    });
  }
});

test("TREE 12.4 missing or stale quote authority fails closed for ENTER", () => {
  for (const quote of [null, {}, { usableForNewDecision: false }]) {
    const current = state();
    const result = evaluateSupervisorDecision({
      state: current,
      proposal: proposal("ENTER"),
      quote
    });

    assert.deepEqual(result.state, current);
    assert.deepEqual(result.action, { type: "NONE" });
    assert.equal(result.decision.proposalStatus, "REJECTED");
    assert.equal(result.decision.reasonCode, "SUPERVISOR_QUOTE_NOT_USABLE_FOR_ENTRY");
  }
});

test("TREE 12.4 AI loss leaves deterministic WATCHING and POSITION_OPEN fallback behavior active", () => {
  const watching = state();
  const watchResult = evaluateSupervisorDecision({ state: watching });
  assert.deepEqual(watchResult.state, watching);
  assert.deepEqual(watchResult.action, { type: "NONE" });
  assert.deepEqual(watchResult.decision, {
    decisionType: null,
    source: "DETERMINISTIC_FALLBACK",
    proposalStatus: "NOT_PRESENT",
    reasonCode: "AI_UNAVAILABLE_FALLBACK_WAIT"
  });

  const position = state({ lifecycleState: "POSITION_OPEN", stateVersion: 8 });
  const positionResult = evaluateSupervisorDecision({ state: position });
  assert.deepEqual(positionResult.state, position);
  assert.deepEqual(positionResult.action, { type: "NONE" });
  assert.deepEqual(positionResult.decision, {
    decisionType: "HOLD",
    source: "DETERMINISTIC_FALLBACK",
    proposalStatus: "NOT_PRESENT",
    reasonCode: "AI_UNAVAILABLE_FALLBACK_HOLD"
  });
});

test("TREE 12.4 SWITCH is allowed only to an explicitly authorized candidate and closes the immutable current episode", () => {
  const target = "MSFT";
  const rejected = evaluateSupervisorDecision({
    state: state(),
    proposal: proposal("SWITCH", { targetCandidateKey: target }),
    authorizedSwitchTargetKeys: []
  });
  assert.equal(rejected.decision.reasonCode, "AI_PROPOSAL_UNAUTHORIZED_SWITCH_TARGET");
  assert.deepEqual(rejected.action, { type: "NONE" });

  const accepted = evaluateSupervisorDecision({
    state: state(),
    proposal: proposal("SWITCH", { targetCandidateKey: target }),
    authorizedSwitchTargetKeys: [target]
  });
  assert.equal(accepted.state.candidateKey, "AAPL");
  assert.equal(accepted.state.lifecycleState, "CLOSED");
  assert.equal(accepted.state.stateVersion, 5);
  assert.deepEqual(accepted.action, {
    type: "REQUEST_SWITCH",
    targetCandidateKey: "MSFT"
  });
});

test("TREE 12.4 proposal type is state-aware", () => {
  const result = evaluateSupervisorDecision({
    state: state({ lifecycleState: "POSITION_OPEN", stateVersion: 9 }),
    proposal: proposal("ENTER", { observedStateVersion: 9 }),
    quote: FRESH_QUOTE
  });

  assert.equal(result.decision.decisionType, "HOLD");
  assert.equal(result.decision.source, "DETERMINISTIC_FALLBACK");
  assert.equal(result.decision.reasonCode, "AI_PROPOSAL_DECISION_NOT_ALLOWED");
  assert.deepEqual(result.action, { type: "NONE" });
});

test("TREE 12.4 deterministic lifecycle follows accepted decisions and authoritative broker outcomes", () => {
  let current = state({ lifecycleState: "IDLE", stateVersion: 0 });
  current = applySupervisorBrokerEvent({ state: current, eventType: "WATCH_STARTED" });
  assert.equal(current.lifecycleState, "WATCHING");
  assert.equal(current.stateVersion, 1);

  let step = evaluateSupervisorDecision({
    state: current,
    proposal: proposal("ENTER", { observedStateVersion: 1 }),
    quote: FRESH_QUOTE
  });
  current = step.state;
  assert.equal(current.lifecycleState, "ENTRY_PENDING");

  current = applySupervisorBrokerEvent({ state: current, eventType: "ENTRY_SUBMITTED" });
  assert.equal(current.lifecycleState, "ENTRY_WORKING");
  current = applySupervisorBrokerEvent({ state: current, eventType: "ENTRY_FILLED" });
  assert.equal(current.lifecycleState, "POSITION_OPEN");

  step = evaluateSupervisorDecision({
    state: current,
    proposal: proposal("HOLD", { observedStateVersion: current.stateVersion })
  });
  assert.equal(step.state.lifecycleState, "POSITION_OPEN");
  assert.equal(step.state.stateVersion, current.stateVersion);

  step = evaluateSupervisorDecision({
    state: current,
    proposal: proposal("EXIT", { observedStateVersion: current.stateVersion })
  });
  current = step.state;
  assert.equal(current.lifecycleState, "EXIT_PENDING");
  assert.deepEqual(step.action, { type: "REQUEST_EXIT" });

  current = applySupervisorBrokerEvent({ state: current, eventType: "EXIT_SUBMITTED" });
  assert.equal(current.lifecycleState, "EXIT_WORKING");
  current = applySupervisorBrokerEvent({ state: current, eventType: "EXIT_FILLED" });
  assert.equal(current.lifecycleState, "CLOSED");
});

test("TREE 12.4 replayed broker outcomes are idempotent but contradictory transitions fail closed", () => {
  const working = state({ lifecycleState: "ENTRY_WORKING", stateVersion: 12 });
  assert.deepEqual(
    applySupervisorBrokerEvent({ state: working, eventType: "ENTRY_SUBMITTED" }),
    working
  );

  assert.throws(
    () => applySupervisorBrokerEvent({ state: working, eventType: "EXIT_SUBMITTED" }),
    /invalid from ENTRY_WORKING/
  );
});
