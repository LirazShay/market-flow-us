import { createHash } from "node:crypto";

import { normalizeOrderIntent } from "../ibkr-order-service/intent.js";
import { HardRiskRejectionError } from "./hard-risk-authority.js";
import {
  evaluateDeterministicSupervisorDecision,
  isDeterministicPolicy,
  resolveDeterministicPolicyEvidence
} from "./policy-supervisor.js";
import { ProtectedOrderBridgeError } from "./protected-order-bridge.js";
import {
  applySupervisorBrokerEvent,
  createSupervisorState,
  evaluateSupervisorDecision
} from "./supervisor.js";

export const SUPERVISOR_SNAPSHOT_KIND = "TRADING_SUPERVISOR_V1";
export const SUPERVISOR_RUNTIME_STATES = Object.freeze([
  "ACTIVE",
  "SHUTDOWN",
  "RECONCILIATION_REQUIRED"
]);

const DISPATCHING = "DISPATCHING";
const RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED";

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${label} with ${method}() is required`);
  }
}

function readNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("now() must return a non-negative safe integer millisecond timestamp");
  }
  return value;
}

function stableRequestId({ tradingRunId, tradeEpisodeId, decisionRecordId, actionType }) {
  const digest = createHash("sha256")
    .update(`${tradingRunId}\n${tradeEpisodeId}\n${decisionRecordId}\n${actionType}`, "utf8")
    .digest("hex");
  return `sup_${digest}`;
}

function compactQuote(quote) {
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) return null;
  return {
    availability: quote.availability ?? null,
    staleness: quote.staleness ?? null,
    usableForNewDecision: quote.usableForNewDecision === true,
    last: quote.last ?? null,
    bid: quote.bid ?? null,
    ask: quote.ask ?? null,
    providerUpdatedAtMs: quote.providerUpdatedAtMs ?? null,
    receivedAtMs: quote.receivedAtMs ?? null
  };
}

function snapshot({
  supervisorState,
  runtimeState = "ACTIVE",
  dispatch = null,
  recovery = null,
  lastOrderReference = null
}) {
  if (!SUPERVISOR_RUNTIME_STATES.includes(runtimeState)) {
    throw new TypeError("Supervisor runtimeState is invalid");
  }
  return {
    kind: SUPERVISOR_SNAPSHOT_KIND,
    version: 1,
    supervisorState: createSupervisorState(supervisorState),
    runtimeState,
    dispatch,
    recovery,
    lastOrderReference
  };
}

function latestSnapshot(bundle) {
  for (let index = bundle.positionStates.length - 1; index >= 0; index -= 1) {
    const candidate = bundle.positionStates[index].state;
    if (candidate?.kind === SUPERVISOR_SNAPSHOT_KIND && candidate?.version === 1) {
      return snapshot(candidate);
    }
  }
  return null;
}

function safePreMutationRejection(error) {
  return error instanceof HardRiskRejectionError
    || error instanceof ProtectedOrderBridgeError
    || (typeof error?.code === "string" && error.code.startsWith("HARD_RISK_"))
    || error?.code === "LIVE_OPERATOR_CONFIRMATION_REQUIRED"
    || error?.code === "ORDER_SERVICE_REJECTED";
}

function decisionEvidence({ before, result, quote, deterministicPolicyEvidence = null }) {
  return {
    version: 1,
    policyVersionId: before.policyVersionId,
    lifecycleStateBefore: before.lifecycleState,
    stateVersionBefore: before.stateVersion,
    lifecycleStateAfter: result.state.lifecycleState,
    stateVersionAfter: result.state.stateVersion,
    source: result.decision.source,
    proposalStatus: result.decision.proposalStatus,
    actionType: result.action.type,
    quote: compactQuote(quote),
    ...(deterministicPolicyEvidence === null
      ? {}
      : { deterministicPolicyEvidence })
  };
}

function safeRejectedState(state, actionType) {
  const lifecycleState = actionType === "REQUEST_ENTRY" ? "WATCHING" : "POSITION_OPEN";
  return createSupervisorState({
    ...state,
    lifecycleState,
    stateVersion: state.stateVersion + 1
  });
}

export function createTradingSupervisorRuntime({
  ledger,
  quoteWatch,
  protectedOrderBridge,
  buildOrderIntent,
  resolvePolicyLimits = () => null,
  now = Date.now
}) {
  assertDependency(ledger, "getTradeEpisodeBundle", "ledger");
  assertDependency(ledger, "getTradingRun", "ledger");
  assertDependency(ledger, "getPolicyVersion", "ledger");
  assertDependency(ledger, "appendCandidateObservation", "ledger");
  assertDependency(ledger, "appendDecisionRecord", "ledger");
  assertDependency(ledger, "appendOrderReference", "ledger");
  assertDependency(ledger, "appendPositionState", "ledger");
  assertDependency(quoteWatch, "poll", "quoteWatch");
  assertDependency(protectedOrderBridge, "submitOrderIntent", "protectedOrderBridge");
  if (typeof buildOrderIntent !== "function") throw new TypeError("buildOrderIntent must be a function");
  if (typeof resolvePolicyLimits !== "function") throw new TypeError("resolvePolicyLimits must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  async function persistSnapshot(tradingRunId, tradeEpisodeId, value) {
    await ledger.appendPositionState({
      tradingRunId,
      tradeEpisodeId,
      observedAtMs: readNow(now),
      state: value
    });
    return value;
  }

  async function loadAuthority(tradingRunId, tradeEpisodeId) {
    const [bundle, run] = await Promise.all([
      ledger.getTradeEpisodeBundle(tradingRunId, tradeEpisodeId),
      ledger.getTradingRun(tradingRunId)
    ]);
    if (!bundle) throw new Error("Trade Episode was not found");
    if (!run) throw new Error("Trading Run was not found");
    if (bundle.episode.policyVersionId !== run.policyVersionId) {
      throw new Error("Trade Episode PolicyVersion does not match Trading Run");
    }
    const policyVersion = await ledger.getPolicyVersion(run.policyVersionId);
    if (!policyVersion) throw new Error("PolicyVersion was not found");
    return { bundle, run, policyVersion };
  }

  async function restoreEpisode({ tradingRunId, tradeEpisodeId }) {
    const authority = await loadAuthority(tradingRunId, tradeEpisodeId);
    let current = latestSnapshot(authority.bundle);
    if (current === null) {
      current = snapshot({
        supervisorState: createSupervisorState({
          tradingRunId,
          tradeEpisodeId,
          policyVersionId: authority.run.policyVersionId,
          candidateKey: authority.bundle.episode.candidateKey
        })
      });
      return Object.freeze({ ...authority, snapshot: current });
    }

    const state = current.supervisorState;
    if (
      state.tradingRunId !== tradingRunId
      || state.tradeEpisodeId !== tradeEpisodeId
      || state.policyVersionId !== authority.run.policyVersionId
      || state.candidateKey !== authority.bundle.episode.candidateKey
    ) {
      throw new Error("Durable Supervisor snapshot does not match episode authority");
    }

    if (current.dispatch?.status === DISPATCHING) {
      const orderReference = authority.bundle.orderReferences.find(
        (entry) => entry.requestId === current.dispatch.requestId
      );
      if (orderReference) {
        const eventType = current.dispatch.actionType === "REQUEST_ENTRY"
          ? "ENTRY_SUBMITTED"
          : "EXIT_SUBMITTED";
        const recovered = snapshot({
          supervisorState: applySupervisorBrokerEvent({ state, eventType }),
          runtimeState: current.runtimeState === "SHUTDOWN" ? "SHUTDOWN" : "ACTIVE",
          recovery: {
            status: "ORDER_REFERENCE_RECOVERED",
            requestId: orderReference.requestId,
            orderReferenceId: orderReference.orderReferenceId
          },
          lastOrderReference: {
            orderReferenceId: orderReference.orderReferenceId,
            requestId: orderReference.requestId,
            localOrderId: orderReference.localOrderId,
            lifecycleState: orderReference.lifecycleState
          }
        });
        await persistSnapshot(tradingRunId, tradeEpisodeId, recovered);
        return Object.freeze({ ...authority, snapshot: recovered });
      }

      const unknown = snapshot({
        supervisorState: state,
        runtimeState: "RECONCILIATION_REQUIRED",
        dispatch: {
          ...current.dispatch,
          status: RECONCILIATION_REQUIRED
        },
        recovery: {
          status: "ORDER_OUTCOME_UNKNOWN",
          requestId: current.dispatch.requestId
        },
        lastOrderReference: current.lastOrderReference
      });
      await persistSnapshot(tradingRunId, tradeEpisodeId, unknown);
      return Object.freeze({ ...authority, snapshot: unknown });
    }

    return Object.freeze({ ...authority, snapshot: current });
  }

  async function pollQuote({ tradingRunId, tradeEpisodeId, instrument }) {
    let quote = null;
    let observation;
    try {
      const observations = await quoteWatch.poll([instrument]);
      quote = Array.isArray(observations) && observations.length === 1 ? observations[0] : null;
      observation = quote ?? {
        availability: "UNAVAILABLE",
        staleness: "UNKNOWN",
        usableForNewDecision: false,
        reasonCode: "SUPERVISOR_QUOTE_CARDINALITY_INVALID",
        receivedAtMs: readNow(now)
      };
    } catch {
      observation = {
        availability: "UNAVAILABLE",
        staleness: "UNKNOWN",
        usableForNewDecision: false,
        reasonCode: "SUPERVISOR_QUOTE_POLL_FAILED",
        receivedAtMs: readNow(now)
      };
    }

    await ledger.appendCandidateObservation({
      tradingRunId,
      tradeEpisodeId,
      observedAtMs: readNow(now),
      observation
    });
    return quote;
  }

  async function startWatching({ tradingRunId, tradeEpisodeId }) {
    const restored = await restoreEpisode({ tradingRunId, tradeEpisodeId });
    if (restored.snapshot.runtimeState === "RECONCILIATION_REQUIRED") return restored.snapshot;
    const started = snapshot({
      supervisorState: applySupervisorBrokerEvent({
        state: restored.snapshot.supervisorState,
        eventType: "WATCH_STARTED"
      }),
      runtimeState: restored.snapshot.runtimeState,
      recovery: restored.snapshot.recovery,
      lastOrderReference: restored.snapshot.lastOrderReference
    });
    await persistSnapshot(tradingRunId, tradeEpisodeId, started);
    return started;
  }

  async function setShutdown({ tradingRunId, tradeEpisodeId, shutdown }) {
    if (typeof shutdown !== "boolean") throw new TypeError("shutdown must be boolean");
    const restored = await restoreEpisode({ tradingRunId, tradeEpisodeId });
    if (restored.snapshot.runtimeState === "RECONCILIATION_REQUIRED") return restored.snapshot;
    const changed = snapshot({
      ...restored.snapshot,
      runtimeState: shutdown ? "SHUTDOWN" : "ACTIVE"
    });
    await persistSnapshot(tradingRunId, tradeEpisodeId, changed);
    return changed;
  }

  async function evaluateCycle({
    tradingRunId,
    tradeEpisodeId,
    proposal = null,
    instrument,
    authorizedSwitchTargetKeys = []
  }) {
    const restored = await restoreEpisode({ tradingRunId, tradeEpisodeId });
    const current = restored.snapshot;
    if (current.runtimeState !== "ACTIVE") {
      return Object.freeze({
        status: current.runtimeState,
        state: current.supervisorState,
        action: { type: "NONE" }
      });
    }

    const quote = await pollQuote({ tradingRunId, tradeEpisodeId, instrument });
    const before = current.supervisorState;
    const deterministic = isDeterministicPolicy(restored.policyVersion.policy);
    const deterministicPolicyEvidence = deterministic
      ? resolveDeterministicPolicyEvidence({ bundle: restored.bundle, state: before })
      : null;
    const deterministicDecisionAtMs = deterministic ? readNow(now) : null;
    const result = deterministic
      ? evaluateDeterministicSupervisorDecision({
          policy: restored.policyVersion.policy,
          state: before,
          quote,
          nowMs: deterministicDecisionAtMs,
          watchStartedAtMs: deterministicPolicyEvidence.watchStartedAtMs,
          positionOpenedAtMs: deterministicPolicyEvidence.positionOpenedAtMs,
          entryPrice: deterministicPolicyEvidence.entryPrice
        })
      : evaluateSupervisorDecision({
          state: before,
          proposal,
          quote,
          authorizedSwitchTargetKeys
        });
    const decisionRecord = await ledger.appendDecisionRecord({
      tradingRunId,
      tradeEpisodeId,
      decidedAtMs: deterministicDecisionAtMs ?? readNow(now),
      decisionType: result.decision.decisionType ?? "NONE",
      reasonCode: result.decision.reasonCode,
      evidence: decisionEvidence({
        before,
        result,
        quote,
        deterministicPolicyEvidence
      })
    });

    if (result.action.type !== "REQUEST_ENTRY" && result.action.type !== "REQUEST_EXIT") {
      const persisted = snapshot({
        supervisorState: result.state,
        runtimeState: "ACTIVE",
        recovery: current.recovery,
        lastOrderReference: current.lastOrderReference
      });
      await persistSnapshot(tradingRunId, tradeEpisodeId, persisted);
      return Object.freeze({
        status: result.action.type === "REQUEST_SWITCH" ? "SWITCH_READY" : "DECIDED",
        state: persisted.supervisorState,
        decisionRecord,
        decision: result.decision,
        action: result.action,
        quote
      });
    }

    const requestId = stableRequestId({
      tradingRunId,
      tradeEpisodeId,
      decisionRecordId: decisionRecord.decisionRecordId,
      actionType: result.action.type
    });

    let normalizedIntent;
    let policyLimits;
    try {
      normalizedIntent = normalizeOrderIntent(await buildOrderIntent(Object.freeze({
        action: result.action,
        requestId,
        state: result.state,
        quote,
        run: restored.run,
        episode: restored.bundle.episode,
        policyVersion: restored.policyVersion
      })));
      const expectedSide = result.action.type === "REQUEST_ENTRY" ? "BUY" : "SELL";
      if (normalizedIntent.requestId !== requestId || normalizedIntent.side !== expectedSide) {
        throw new TypeError("trusted order intent does not match Supervisor action authority");
      }
      policyLimits = await resolvePolicyLimits(Object.freeze({
        action: result.action,
        state: result.state,
        run: restored.run,
        episode: restored.bundle.episode,
        policyVersion: restored.policyVersion
      }));
    } catch {
      const rejected = safeRejectedState(result.state, result.action.type);
      const persisted = snapshot({
        supervisorState: rejected,
        runtimeState: "ACTIVE",
        recovery: {
          status: "LOCAL_ACTION_BUILD_REJECTED",
          requestId
        },
        lastOrderReference: current.lastOrderReference
      });
      await persistSnapshot(tradingRunId, tradeEpisodeId, persisted);
      return Object.freeze({
        status: "ORDER_REJECTED",
        reasonCode: "SUPERVISOR_ORDER_INTENT_INVALID",
        state: persisted.supervisorState,
        action: { type: "NONE" },
        decisionRecord,
        quote
      });
    }

    const dispatching = snapshot({
      supervisorState: result.state,
      runtimeState: "ACTIVE",
      dispatch: {
        status: DISPATCHING,
        actionType: result.action.type,
        decisionRecordId: decisionRecord.decisionRecordId,
        requestId
      },
      recovery: current.recovery,
      lastOrderReference: current.lastOrderReference
    });
    await persistSnapshot(tradingRunId, tradeEpisodeId, dispatching);

    let order;
    try {
      order = await protectedOrderBridge.submitOrderIntent({
        tradingRunId,
        tradeEpisodeId,
        intent: normalizedIntent,
        quote,
        policyLimits
      });
    } catch (error) {
      if (safePreMutationRejection(error)) {
        const rejected = snapshot({
          supervisorState: safeRejectedState(result.state, result.action.type),
          runtimeState: "ACTIVE",
          recovery: {
            status: "ORDER_REJECTED_PRE_MUTATION",
            requestId,
            reasonCode: error.code ?? "ORDER_REJECTED"
          },
          lastOrderReference: current.lastOrderReference
        });
        await persistSnapshot(tradingRunId, tradeEpisodeId, rejected);
        return Object.freeze({
          status: "ORDER_REJECTED",
          reasonCode: error.code ?? "ORDER_REJECTED",
          state: rejected.supervisorState,
          action: { type: "NONE" },
          decisionRecord,
          quote
        });
      }

      const unknown = snapshot({
        supervisorState: result.state,
        runtimeState: "RECONCILIATION_REQUIRED",
        dispatch: {
          ...dispatching.dispatch,
          status: RECONCILIATION_REQUIRED
        },
        recovery: {
          status: "ORDER_OUTCOME_UNKNOWN",
          requestId
        },
        lastOrderReference: current.lastOrderReference
      });
      await persistSnapshot(tradingRunId, tradeEpisodeId, unknown);
      return Object.freeze({
        status: "RECONCILIATION_REQUIRED",
        reasonCode: "ORDER_OUTCOME_UNKNOWN",
        state: unknown.supervisorState,
        action: { type: "NONE" },
        decisionRecord,
        quote
      });
    }

    if (
      !order
      || typeof order !== "object"
      || order.requestId !== requestId
      || typeof order.localOrderId !== "string"
      || order.localOrderId.length === 0
      || typeof order.lifecycleState !== "string"
      || order.lifecycleState.length === 0
    ) {
      const unknown = snapshot({
        supervisorState: result.state,
        runtimeState: "RECONCILIATION_REQUIRED",
        dispatch: {
          ...dispatching.dispatch,
          status: RECONCILIATION_REQUIRED
        },
        recovery: { status: "ORDER_RESULT_INVALID", requestId },
        lastOrderReference: current.lastOrderReference
      });
      await persistSnapshot(tradingRunId, tradeEpisodeId, unknown);
      return Object.freeze({
        status: "RECONCILIATION_REQUIRED",
        reasonCode: "ORDER_RESULT_INVALID",
        state: unknown.supervisorState,
        action: { type: "NONE" },
        decisionRecord,
        quote
      });
    }

    const orderReference = await ledger.appendOrderReference({
      tradingRunId,
      tradeEpisodeId,
      recordedAtMs: readNow(now),
      localOrderId: order.localOrderId,
      requestId,
      lifecycleState: order.lifecycleState
    });
    const submitted = applySupervisorBrokerEvent({
      state: result.state,
      eventType: result.action.type === "REQUEST_ENTRY" ? "ENTRY_SUBMITTED" : "EXIT_SUBMITTED"
    });
    const persisted = snapshot({
      supervisorState: submitted,
      runtimeState: "ACTIVE",
      recovery: current.recovery,
      lastOrderReference: {
        orderReferenceId: orderReference.orderReferenceId,
        requestId: orderReference.requestId,
        localOrderId: orderReference.localOrderId,
        lifecycleState: orderReference.lifecycleState
      }
    });
    await persistSnapshot(tradingRunId, tradeEpisodeId, persisted);

    return Object.freeze({
      status: "ORDER_SUBMITTED",
      state: persisted.supervisorState,
      decisionRecord,
      orderReference,
      action: result.action,
      quote
    });
  }

  async function recordBrokerEvent({ tradingRunId, tradeEpisodeId, eventType }) {
    const restored = await restoreEpisode({ tradingRunId, tradeEpisodeId });
    if (restored.snapshot.runtimeState === "RECONCILIATION_REQUIRED") {
      return restored.snapshot;
    }
    const changed = snapshot({
      ...restored.snapshot,
      supervisorState: applySupervisorBrokerEvent({
        state: restored.snapshot.supervisorState,
        eventType
      })
    });
    await persistSnapshot(tradingRunId, tradeEpisodeId, changed);
    return changed;
  }

  return Object.freeze({
    restoreEpisode,
    startWatching,
    evaluateCycle,
    recordBrokerEvent,
    setShutdown
  });
}
