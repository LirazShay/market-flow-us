import {
  SUPERVISOR_SNAPSHOT_KIND,
  createTradingSupervisorRuntime
} from "./supervisor-runtime.js";
import { applySupervisorBrokerEvent } from "./supervisor.js";

const DECISION_READY_STATES = new Set(["WATCHING", "POSITION_OPEN"]);
const RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED";
const MAX_INTERVAL_MS = 60_000;

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${label} with ${method}() is required`);
  }
}

function assertIntervalMs(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_INTERVAL_MS) {
    throw new TypeError(`intervalMs must be an integer between 1 and ${MAX_INTERVAL_MS}`);
  }
  return value;
}

function readNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("now() must return a non-negative safe integer millisecond timestamp");
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function orderReferenceSummary(orderReference) {
  return {
    orderReferenceId: orderReference.orderReferenceId,
    requestId: orderReference.requestId,
    localOrderId: orderReference.localOrderId,
    lifecycleState: orderReference.lifecycleState
  };
}

function reconciliationSnapshot({ current, orderReference }) {
  const actionType = current.dispatch?.actionType;
  if (actionType !== "REQUEST_ENTRY" && actionType !== "REQUEST_EXIT") {
    throw new Error("Durable reconciliation action is invalid");
  }
  const eventType = actionType === "REQUEST_ENTRY" ? "ENTRY_SUBMITTED" : "EXIT_SUBMITTED";
  return {
    kind: SUPERVISOR_SNAPSHOT_KIND,
    version: 1,
    supervisorState: applySupervisorBrokerEvent({
      state: current.supervisorState,
      eventType
    }),
    runtimeState: "ACTIVE",
    dispatch: null,
    recovery: {
      status: "ORDER_RECONCILED",
      requestId: orderReference.requestId,
      orderReferenceId: orderReference.orderReferenceId
    },
    lastOrderReference: orderReferenceSummary(orderReference)
  };
}

function normalizeReconciledOrder(value, requestId) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("readReconciledOrder must return an object or null");
  }
  if (value.requestId !== requestId) {
    throw new TypeError("reconciled order requestId does not match durable dispatch");
  }
  return {
    requestId,
    localOrderId: assertNonEmptyString(value.localOrderId, "reconciled localOrderId"),
    lifecycleState: assertNonEmptyString(value.lifecycleState, "reconciled lifecycleState")
  };
}

function publicLoopSnapshot(state) {
  if (state === null) return Object.freeze({ running: false });
  return Object.freeze({
    running: !state.stopped,
    tradingRunId: state.tradingRunId,
    tradeEpisodeId: state.tradeEpisodeId,
    intervalMs: state.intervalMs,
    cyclesCompleted: state.cyclesCompleted,
    lastStatus: state.lastStatus
  });
}

export function createContinuousTradingSupervisor({
  runtime,
  ledger,
  readDecisionProposal = async () => null,
  readReconciledOrder = async () => null,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("runtime is required");
  }
  for (const method of ["restoreEpisode", "startWatching", "evaluateCycle"]) {
    assertDependency(runtime, method, "runtime");
  }
  assertDependency(ledger, "getTradeEpisodeBundle", "ledger");
  assertDependency(ledger, "appendOrderReference", "ledger");
  assertDependency(ledger, "appendPositionState", "ledger");
  if (typeof readDecisionProposal !== "function") {
    throw new TypeError("readDecisionProposal must be a function");
  }
  if (typeof readReconciledOrder !== "function") {
    throw new TypeError("readReconciledOrder must be a function");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
    throw new TypeError("timer functions are required");
  }

  let active = null;

  async function appendReconciledSnapshot({ tradingRunId, tradeEpisodeId, current, orderReference }) {
    const recovered = reconciliationSnapshot({ current, orderReference });
    await ledger.appendPositionState({
      tradingRunId,
      tradeEpisodeId,
      observedAtMs: readNow(now),
      state: recovered
    });
    return recovered;
  }

  async function reconcileEpisode({ tradingRunId, tradeEpisodeId }) {
    const restored = await runtime.restoreEpisode({ tradingRunId, tradeEpisodeId });
    const current = restored.snapshot;
    if (current.runtimeState !== RECONCILIATION_REQUIRED) {
      return Object.freeze({
        status: current.runtimeState,
        snapshot: current,
        reconciled: false
      });
    }

    const requestId = current.dispatch?.requestId;
    if (typeof requestId !== "string" || requestId.length === 0) {
      throw new Error("Durable reconciliation requestId is missing");
    }

    const bundle = await ledger.getTradeEpisodeBundle(tradingRunId, tradeEpisodeId);
    if (!bundle) throw new Error("Trade Episode was not found during reconciliation");
    let orderReference = bundle.orderReferences.find((entry) => entry.requestId === requestId) ?? null;

    if (orderReference === null) {
      let authoritativeOrder;
      try {
        authoritativeOrder = await readReconciledOrder(Object.freeze({
          tradingRunId,
          tradeEpisodeId,
          requestId,
          actionType: current.dispatch.actionType
        }));
      } catch {
        return Object.freeze({
          status: RECONCILIATION_REQUIRED,
          snapshot: current,
          reconciled: false
        });
      }
      const normalized = normalizeReconciledOrder(authoritativeOrder, requestId);
      if (normalized === null) {
        return Object.freeze({
          status: RECONCILIATION_REQUIRED,
          snapshot: current,
          reconciled: false
        });
      }
      orderReference = await ledger.appendOrderReference({
        tradingRunId,
        tradeEpisodeId,
        recordedAtMs: readNow(now),
        localOrderId: normalized.localOrderId,
        requestId: normalized.requestId,
        lifecycleState: normalized.lifecycleState
      });
    }

    const recovered = await appendReconciledSnapshot({
      tradingRunId,
      tradeEpisodeId,
      current,
      orderReference
    });
    return Object.freeze({
      status: "ACTIVE",
      snapshot: recovered,
      reconciled: true,
      orderReference
    });
  }

  async function proposalOrFallback(restored) {
    try {
      return await readDecisionProposal(Object.freeze({
        tradingRunId: restored.snapshot.supervisorState.tradingRunId,
        tradeEpisodeId: restored.snapshot.supervisorState.tradeEpisodeId,
        policyVersionId: restored.snapshot.supervisorState.policyVersionId,
        state: restored.snapshot.supervisorState,
        policyVersion: restored.policyVersion
      }));
    } catch {
      return null;
    }
  }

  async function runCycle(state) {
    if (active !== state || state.stopped) return;

    let restored = await runtime.restoreEpisode({
      tradingRunId: state.tradingRunId,
      tradeEpisodeId: state.tradeEpisodeId
    });

    if (restored.snapshot.runtimeState === RECONCILIATION_REQUIRED) {
      const recovery = await reconcileEpisode({
        tradingRunId: state.tradingRunId,
        tradeEpisodeId: state.tradeEpisodeId
      });
      state.lastStatus = recovery.status;
      state.cyclesCompleted += 1;
      scheduleNext(state, state.intervalMs);
      return;
    }

    if (restored.snapshot.runtimeState !== "ACTIVE") {
      state.lastStatus = restored.snapshot.runtimeState;
      state.cyclesCompleted += 1;
      scheduleNext(state, state.intervalMs);
      return;
    }

    if (restored.snapshot.supervisorState.lifecycleState === "IDLE") {
      await runtime.startWatching({
        tradingRunId: state.tradingRunId,
        tradeEpisodeId: state.tradeEpisodeId
      });
      restored = await runtime.restoreEpisode({
        tradingRunId: state.tradingRunId,
        tradeEpisodeId: state.tradeEpisodeId
      });
    }

    const lifecycleState = restored.snapshot.supervisorState.lifecycleState;
    if (!DECISION_READY_STATES.has(lifecycleState)) {
      state.lastStatus = lifecycleState;
      state.cyclesCompleted += 1;
      scheduleNext(state, state.intervalMs);
      return;
    }

    const proposal = (await proposalOrFallback(restored)) ?? null;
    const result = await runtime.evaluateCycle({
      tradingRunId: state.tradingRunId,
      tradeEpisodeId: state.tradeEpisodeId,
      instrument: state.instrument,
      proposal,
      authorizedSwitchTargetKeys: state.authorizedSwitchTargetKeys
    });
    state.lastStatus = result.status;
    state.cyclesCompleted += 1;
    scheduleNext(state, state.intervalMs);
  }

  function failLoop(state, error) {
    if (active !== state || state.stopped) return;
    state.stopped = true;
    active = null;
    state.rejectDone(error);
  }

  function scheduleNext(state, delayMs) {
    if (active !== state || state.stopped) return;
    state.timer = setTimeoutFn(async () => {
      state.timer = null;
      try {
        await runCycle(state);
      } catch (error) {
        failLoop(state, error);
      }
    }, delayMs);
  }

  async function start({
    tradingRunId,
    tradeEpisodeId,
    instrument,
    intervalMs,
    authorizedSwitchTargetKeys = []
  }) {
    if (active !== null) {
      throw new Error("Continuous Trading Supervisor is already running");
    }
    if (!instrument || typeof instrument !== "object" || Array.isArray(instrument)) {
      throw new TypeError("instrument is required");
    }
    if (!Array.isArray(authorizedSwitchTargetKeys)) {
      throw new TypeError("authorizedSwitchTargetKeys must be an array");
    }

    await runtime.restoreEpisode({ tradingRunId, tradeEpisodeId });

    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    void done.catch(() => {});
    const state = {
      tradingRunId,
      tradeEpisodeId,
      instrument: Object.freeze({ ...instrument }),
      intervalMs: assertIntervalMs(intervalMs),
      authorizedSwitchTargetKeys: Object.freeze([...authorizedSwitchTargetKeys]),
      cyclesCompleted: 0,
      lastStatus: null,
      timer: null,
      stopped: false,
      resolveDone,
      rejectDone,
      done
    };
    active = state;
    scheduleNext(state, 0);

    return Object.freeze({
      stop() {
        if (active !== state || state.stopped) return;
        state.stopped = true;
        if (state.timer !== null) clearTimeoutFn(state.timer);
        active = null;
        state.resolveDone();
      },
      done,
      get status() {
        return publicLoopSnapshot(state);
      }
    });
  }

  return Object.freeze({
    start,
    reconcileEpisode,
    get status() {
      return publicLoopSnapshot(active);
    }
  });
}

export function createContinuousTradingSupervisorRuntime(options) {
  const runtime = createTradingSupervisorRuntime(options);
  return Object.freeze({
    runtime,
    continuous: createContinuousTradingSupervisor({
      runtime,
      ledger: options.ledger,
      readDecisionProposal: options.readDecisionProposal,
      readReconciledOrder: options.readReconciledOrder,
      now: options.now,
      setTimeoutFn: options.setTimeoutFn,
      clearTimeoutFn: options.clearTimeoutFn
    })
  });
}
