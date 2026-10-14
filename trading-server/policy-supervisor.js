import { evaluateDeterministicPolicy } from "./policy-promotion.js";
import {
  createSupervisorState,
  evaluateSupervisorDecision
} from "./supervisor.js";

export const DETERMINISTIC_POLICY_KIND = "DETERMINISTIC_TRADING_POLICY_V1";

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

function isSupervisorSnapshot(value) {
  return value?.kind === "TRADING_SUPERVISOR_V1" && value?.version === 1;
}

function firstLifecycleObservedAt(positionStates, lifecycleState) {
  for (const record of positionStates) {
    if (
      Number.isSafeInteger(record?.observedAtMs)
      && record.observedAtMs >= 0
      && isSupervisorSnapshot(record?.state)
      && record.state.supervisorState?.lifecycleState === lifecycleState
    ) {
      return record.observedAtMs;
    }
  }
  return null;
}

function latestAveragePrice(positionStates, minimumObservedAtMs) {
  for (let index = positionStates.length - 1; index >= 0; index -= 1) {
    const record = positionStates[index];
    if (
      !Number.isSafeInteger(record?.observedAtMs)
      || record.observedAtMs < minimumObservedAtMs
      || isSupervisorSnapshot(record?.state)
    ) {
      continue;
    }
    const averagePrice = record.state?.averagePrice;
    if (typeof averagePrice === "number" && Number.isFinite(averagePrice) && averagePrice > 0) {
      return averagePrice;
    }
  }
  return null;
}

export function isDeterministicPolicy(policy) {
  return policy?.kind === DETERMINISTIC_POLICY_KIND;
}

export function resolveDeterministicPolicyEvidence({ bundle, state } = {}) {
  const normalizedState = createSupervisorState(state);
  const positionStates = Array.isArray(bundle?.positionStates) ? bundle.positionStates : [];
  const watchStartedAtMs = firstLifecycleObservedAt(positionStates, "WATCHING");
  const positionOpenedAtMs = firstLifecycleObservedAt(positionStates, "POSITION_OPEN");
  const entryPrice = positionOpenedAtMs === null
    ? null
    : latestAveragePrice(positionStates, positionOpenedAtMs);

  return Object.freeze({
    watchStartedAtMs,
    positionOpenedAtMs,
    entryPrice,
    lifecycleState: normalizedState.lifecycleState
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

  if (normalizedState.lifecycleState === "WATCHING" && watchStartedAtMs === null) {
    return policyDecision(normalizedState, "POLICY_WATCH_EVIDENCE_MISSING");
  }
  if (
    normalizedState.lifecycleState === "POSITION_OPEN"
    && (positionOpenedAtMs === null || entryPrice === null)
  ) {
    return policyDecision(normalizedState, "POLICY_POSITION_EVIDENCE_MISSING", "HOLD");
  }

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
