const MAX_IDENTIFIER_LENGTH = 256;
const MAX_CANDIDATE_KEY_LENGTH = 512;

export const SUPERVISOR_LIFECYCLE_STATES = Object.freeze([
  "IDLE",
  "WATCHING",
  "ENTRY_PENDING",
  "ENTRY_WORKING",
  "POSITION_OPEN",
  "EXIT_PENDING",
  "EXIT_WORKING",
  "CLOSED"
]);

export const DECISION_PROPOSAL_TYPES = Object.freeze([
  "ENTER",
  "SKIP",
  "SWITCH",
  "HOLD",
  "EXIT"
]);

export const SUPERVISOR_ACTION_TYPES = Object.freeze([
  "NONE",
  "REQUEST_ENTRY",
  "REQUEST_SWITCH",
  "REQUEST_EXIT"
]);

export const SUPERVISOR_BROKER_EVENTS = Object.freeze([
  "WATCH_STARTED",
  "ENTRY_SUBMITTED",
  "ENTRY_FILLED",
  "ENTRY_TERMINAL_NO_POSITION",
  "EXIT_SUBMITTED",
  "EXIT_FILLED"
]);

const PROPOSAL_FIELDS = new Set([
  "decisionType",
  "tradingRunId",
  "tradeEpisodeId",
  "policyVersionId",
  "observedStateVersion",
  "targetCandidateKey"
]);

const PROPOSAL_REQUIRED_FIELDS = [
  "decisionType",
  "tradingRunId",
  "tradeEpisodeId",
  "policyVersionId",
  "observedStateVersion"
];

const ALLOWED_DECISIONS_BY_STATE = Object.freeze({
  WATCHING: new Set(["ENTER", "SKIP", "SWITCH"]),
  POSITION_OPEN: new Set(["HOLD", "EXIT"])
});

const BROKER_EVENT_TRANSITIONS = Object.freeze({
  WATCH_STARTED: Object.freeze({
    from: new Set(["IDLE"]),
    to: "WATCHING",
    idempotentAt: new Set(["WATCHING"])
  }),
  ENTRY_SUBMITTED: Object.freeze({
    from: new Set(["ENTRY_PENDING"]),
    to: "ENTRY_WORKING",
    idempotentAt: new Set(["ENTRY_WORKING"])
  }),
  ENTRY_FILLED: Object.freeze({
    from: new Set(["ENTRY_PENDING", "ENTRY_WORKING"]),
    to: "POSITION_OPEN",
    idempotentAt: new Set(["POSITION_OPEN"])
  }),
  ENTRY_TERMINAL_NO_POSITION: Object.freeze({
    from: new Set(["ENTRY_PENDING", "ENTRY_WORKING"]),
    to: "CLOSED",
    idempotentAt: new Set(["CLOSED"])
  }),
  EXIT_SUBMITTED: Object.freeze({
    from: new Set(["EXIT_PENDING"]),
    to: "EXIT_WORKING",
    idempotentAt: new Set(["EXIT_WORKING"])
  }),
  EXIT_FILLED: Object.freeze({
    from: new Set(["EXIT_PENDING", "EXIT_WORKING"]),
    to: "CLOSED",
    idempotentAt: new Set(["CLOSED"])
  })
});

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBoundedString(value, name, maxLength) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > maxLength
  ) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value;
}

function assertSafeVersion(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value;
}

function assertLifecycleState(value) {
  if (!SUPERVISOR_LIFECYCLE_STATES.includes(value)) {
    throw new TypeError("Supervisor lifecycleState is invalid.");
  }
  return value;
}

function frozenState(state) {
  return Object.freeze({ ...state });
}

function transitionState(state, lifecycleState) {
  if (state.lifecycleState === lifecycleState) return frozenState(state);
  return frozenState({
    ...state,
    lifecycleState,
    stateVersion: state.stateVersion + 1
  });
}

function noAction() {
  return Object.freeze({ type: "NONE" });
}

function fallbackForState(state, proposalStatus, rejectionReasonCode = null) {
  if (state.lifecycleState === "WATCHING") {
    return Object.freeze({
      state: frozenState(state),
      decision: Object.freeze({
        decisionType: null,
        source: "DETERMINISTIC_FALLBACK",
        proposalStatus,
        reasonCode: rejectionReasonCode ?? "AI_UNAVAILABLE_FALLBACK_WAIT"
      }),
      action: noAction()
    });
  }

  if (state.lifecycleState === "POSITION_OPEN") {
    return Object.freeze({
      state: frozenState(state),
      decision: Object.freeze({
        decisionType: "HOLD",
        source: "DETERMINISTIC_FALLBACK",
        proposalStatus,
        reasonCode: rejectionReasonCode ?? "AI_UNAVAILABLE_FALLBACK_HOLD"
      }),
      action: noAction()
    });
  }

  return Object.freeze({
    state: frozenState(state),
    decision: Object.freeze({
      decisionType: null,
      source: "DETERMINISTIC",
      proposalStatus,
      reasonCode: rejectionReasonCode ?? "SUPERVISOR_STATE_NOT_DECISION_READY"
    }),
    action: noAction()
  });
}

function reject(reasonCode) {
  return Object.freeze({ accepted: false, reasonCode });
}

function accept(normalizedProposal) {
  return Object.freeze({
    accepted: true,
    reasonCode: "AI_PROPOSAL_ACCEPTED",
    proposal: Object.freeze(normalizedProposal)
  });
}

export function createSupervisorState({
  tradingRunId,
  tradeEpisodeId,
  policyVersionId,
  candidateKey,
  lifecycleState = "IDLE",
  stateVersion = 0
}) {
  return frozenState({
    tradingRunId: assertBoundedString(tradingRunId, "Supervisor tradingRunId", MAX_IDENTIFIER_LENGTH),
    tradeEpisodeId: assertBoundedString(tradeEpisodeId, "Supervisor tradeEpisodeId", MAX_IDENTIFIER_LENGTH),
    policyVersionId: assertBoundedString(policyVersionId, "Supervisor policyVersionId", MAX_IDENTIFIER_LENGTH),
    candidateKey: assertBoundedString(candidateKey, "Supervisor candidateKey", MAX_CANDIDATE_KEY_LENGTH),
    lifecycleState: assertLifecycleState(lifecycleState),
    stateVersion: assertSafeVersion(stateVersion, "Supervisor stateVersion")
  });
}

export function validateDecisionProposal({ state, proposal, authorizedSwitchTargetKeys = [] }) {
  const normalizedState = createSupervisorState(state);

  if (!isPlainObject(proposal)) {
    return reject("AI_PROPOSAL_MALFORMED");
  }

  const keys = Object.keys(proposal);
  if (
    keys.some((key) => !PROPOSAL_FIELDS.has(key))
    || PROPOSAL_REQUIRED_FIELDS.some((key) => !Object.hasOwn(proposal, key))
  ) {
    return reject("AI_PROPOSAL_MALFORMED");
  }

  if (!DECISION_PROPOSAL_TYPES.includes(proposal.decisionType)) {
    return reject("AI_PROPOSAL_MALFORMED");
  }

  for (const [field, expected] of [
    ["tradingRunId", normalizedState.tradingRunId],
    ["tradeEpisodeId", normalizedState.tradeEpisodeId],
    ["policyVersionId", normalizedState.policyVersionId]
  ]) {
    if (typeof proposal[field] !== "string" || proposal[field] !== expected) {
      return reject(field === "policyVersionId"
        ? "AI_PROPOSAL_POLICY_MISMATCH"
        : field === "tradingRunId"
          ? "AI_PROPOSAL_RUN_MISMATCH"
          : "AI_PROPOSAL_EPISODE_MISMATCH");
    }
  }

  if (
    !Number.isSafeInteger(proposal.observedStateVersion)
    || proposal.observedStateVersion < 0
  ) {
    return reject("AI_PROPOSAL_MALFORMED");
  }
  if (proposal.observedStateVersion !== normalizedState.stateVersion) {
    return reject("AI_PROPOSAL_STALE_STATE");
  }

  const allowed = ALLOWED_DECISIONS_BY_STATE[normalizedState.lifecycleState];
  if (!allowed?.has(proposal.decisionType)) {
    return reject("AI_PROPOSAL_DECISION_NOT_ALLOWED");
  }

  if (proposal.decisionType === "SWITCH") {
    if (
      typeof proposal.targetCandidateKey !== "string"
      || proposal.targetCandidateKey.trim().length === 0
      || proposal.targetCandidateKey.length > MAX_CANDIDATE_KEY_LENGTH
      || proposal.targetCandidateKey === normalizedState.candidateKey
    ) {
      return reject("AI_PROPOSAL_MALFORMED");
    }
    if (
      !Array.isArray(authorizedSwitchTargetKeys)
      || !authorizedSwitchTargetKeys.includes(proposal.targetCandidateKey)
    ) {
      return reject("AI_PROPOSAL_UNAUTHORIZED_SWITCH_TARGET");
    }
  } else if (Object.hasOwn(proposal, "targetCandidateKey")) {
    return reject("AI_PROPOSAL_MALFORMED");
  }

  return accept({
    decisionType: proposal.decisionType,
    tradingRunId: proposal.tradingRunId,
    tradeEpisodeId: proposal.tradeEpisodeId,
    policyVersionId: proposal.policyVersionId,
    observedStateVersion: proposal.observedStateVersion,
    ...(proposal.decisionType === "SWITCH"
      ? { targetCandidateKey: proposal.targetCandidateKey }
      : {})
  });
}

export function evaluateSupervisorDecision({
  state,
  proposal = null,
  quote = null,
  authorizedSwitchTargetKeys = []
}) {
  const normalizedState = createSupervisorState(state);

  if (proposal === null || proposal === undefined) {
    return fallbackForState(normalizedState, "NOT_PRESENT");
  }

  const validation = validateDecisionProposal({
    state: normalizedState,
    proposal,
    authorizedSwitchTargetKeys
  });
  if (!validation.accepted) {
    return fallbackForState(normalizedState, "REJECTED", validation.reasonCode);
  }

  const accepted = validation.proposal;
  if (accepted.decisionType === "ENTER") {
    if (!isPlainObject(quote) || quote.usableForNewDecision !== true) {
      return fallbackForState(
        normalizedState,
        "REJECTED",
        "SUPERVISOR_QUOTE_NOT_USABLE_FOR_ENTRY"
      );
    }
    return Object.freeze({
      state: transitionState(normalizedState, "ENTRY_PENDING"),
      decision: Object.freeze({
        decisionType: "ENTER",
        source: "AI_PROPOSAL",
        proposalStatus: "ACCEPTED",
        reasonCode: "AI_PROPOSAL_ACCEPTED"
      }),
      action: Object.freeze({ type: "REQUEST_ENTRY" })
    });
  }

  if (accepted.decisionType === "SKIP") {
    return Object.freeze({
      state: transitionState(normalizedState, "CLOSED"),
      decision: Object.freeze({
        decisionType: "SKIP",
        source: "AI_PROPOSAL",
        proposalStatus: "ACCEPTED",
        reasonCode: "AI_PROPOSAL_ACCEPTED"
      }),
      action: noAction()
    });
  }

  if (accepted.decisionType === "SWITCH") {
    return Object.freeze({
      state: transitionState(normalizedState, "CLOSED"),
      decision: Object.freeze({
        decisionType: "SWITCH",
        source: "AI_PROPOSAL",
        proposalStatus: "ACCEPTED",
        reasonCode: "AI_PROPOSAL_ACCEPTED"
      }),
      action: Object.freeze({
        type: "REQUEST_SWITCH",
        targetCandidateKey: accepted.targetCandidateKey
      })
    });
  }

  if (accepted.decisionType === "HOLD") {
    return Object.freeze({
      state: frozenState(normalizedState),
      decision: Object.freeze({
        decisionType: "HOLD",
        source: "AI_PROPOSAL",
        proposalStatus: "ACCEPTED",
        reasonCode: "AI_PROPOSAL_ACCEPTED"
      }),
      action: noAction()
    });
  }

  return Object.freeze({
    state: transitionState(normalizedState, "EXIT_PENDING"),
    decision: Object.freeze({
      decisionType: "EXIT",
      source: "AI_PROPOSAL",
      proposalStatus: "ACCEPTED",
      reasonCode: "AI_PROPOSAL_ACCEPTED"
    }),
    action: Object.freeze({ type: "REQUEST_EXIT" })
  });
}

export function applySupervisorBrokerEvent({ state, eventType }) {
  const normalizedState = createSupervisorState(state);
  if (!SUPERVISOR_BROKER_EVENTS.includes(eventType)) {
    throw new TypeError("Supervisor broker eventType is invalid.");
  }

  const transition = BROKER_EVENT_TRANSITIONS[eventType];
  if (transition.idempotentAt.has(normalizedState.lifecycleState)) {
    return frozenState(normalizedState);
  }
  if (!transition.from.has(normalizedState.lifecycleState)) {
    throw new TypeError(
      `Supervisor broker event ${eventType} is invalid from ${normalizedState.lifecycleState}.`
    );
  }

  return transitionState(normalizedState, transition.to);
}
