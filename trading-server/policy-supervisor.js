import { evaluateDeterministicPolicy } from "./policy-promotion.js";
import {
  createSupervisorState,
  evaluateSupervisorDecision
} from "./supervisor.js";

function noAction() {
  return Object.freeze({ type: "NONE" });
}

function policyDecision(state, reasonCode, decisionType = null) {
  return Object.freeze({
    state: createSupervisorState(state),
    decision: Object.freeze({
      decisionType,
      source: "DETERMINISTIC_POLICY",
      proposalStatus: "NOT_APPLICABLE",
      reasonCode
    }),
    action: noAction()
  });
}

function internalProposal(state, decisionType) {
  return Object.freeze({
    decisionType,
    tradingRunId: state.tradingRunId,
    tradeEpisodeId: state.tradeEpisodeId,
    policyVersionId: state.policyVersionId,
    observedStateVersion: state.stateVersion
  });
}

export function evaluateDeterministicSupervisorDecision({
  policy,
  state,
  quote = null,
  nowMs,
  watchStartedAtMs = null,
  positionOpenedAtMs = null,
  entryPrice = null
} = {}) {
  const normalizedState = createSupervisorState(state);
  const evaluated = evaluateDeterministicPolicy({
    policy,
    lifecycleState: normalizedState.lifecycleState,
    nowMs,
    watchStartedAtMs,
    positionOpenedAtMs,
    entryPrice,
    quote
  });

  if (evaluated.decisionType === null) {
    return policyDecision(normalizedState, evaluated.reasonCode);
  }

  const supervisorResult = evaluateSupervisorDecision({
    state: normalizedState,
    proposal: internalProposal(normalizedState, evaluated.decisionType),
    quote
  });

  if (supervisorResult.decision.proposalStatus !== "ACCEPTED") {
    throw new Error(
      `Deterministic Policy decision ${evaluated.decisionType} is incompatible with Supervisor authority: ${supervisorResult.decision.reasonCode}`
    );
  }
  if (supervisorResult.action.type !== evaluated.actionType) {
    throw new Error("Deterministic Policy action does not match Supervisor transition authority");
  }

  return Object.freeze({
    state: supervisorResult.state,
    decision: Object.freeze({
      decisionType: evaluated.decisionType,
      source: "DETERMINISTIC_POLICY",
      proposalStatus: "NOT_APPLICABLE",
      reasonCode: evaluated.reasonCode
    }),
    action: supervisorResult.action
  });
}
