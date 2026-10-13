import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import {
  createContinuousTradingSupervisor
} from "../../trading-server/continuous-supervisor.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});
const BASE_NOW = 1_800_000_000_000;

function uuidFactory(prefix, start = 1) {
  let value = start;
  return () => {
    const tail = String(value).padStart(12, "0");
    value += 1;
    return `${prefix}_00000000-0000-4000-8000-${tail}`;
  };
}

function clock(start = BASE_NOW) {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

async function openLedger(dbPath, { start = 1, now } = {}) {
  return openTradingLedger({
    dbPath,
    now,
    policyVersionIdFactory: () => POLICY_ID,
    tradingRunIdFactory: () => RUN_ID,
    tradeEpisodeIdFactory: () => EPISODE_ID,
    candidateObservationIdFactory: uuidFactory("obs", start),
    decisionRecordIdFactory: uuidFactory("dec", start),
    orderReferenceIdFactory: uuidFactory("ordref", start),
    positionStateIdFactory: uuidFactory("pos", start),
    episodeOutcomeIdFactory: uuidFactory("out", start)
  });
}

async function seedEpisode(ledger) {
  await ledger.createPolicyVersion({
    policy: {
      entry: { orderType: "LMT" },
      exit: { orderType: "LMT" }
    }
  });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    environmentSnapshot: { source: "continuous-supervisor-test" },
    riskEnvelope: { maxNotionalUsd: 500 }
  });
  await ledger.createTradeEpisode({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    candidateKey: "NASDAQ:AAPL",
    candidateProvenance: {
      scannerGeneration: 7,
      resultRank: 1,
      securityId: "NASDAQ:AAPL"
    }
  });
}

function quoteObservation(nowMs = BASE_NOW) {
  return {
    instrument: AAPL,
    resolutionStatus: "EXACT",
    conid: 265598,
    availability: "AVAILABLE",
    staleness: "FRESH",
    usableForNewDecision: true,
    marketDataAvailability: "RpB",
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: nowMs,
    receivedAtMs: nowMs + 1
  };
}

function intentBuilder({ action, requestId }) {
  return {
    requestId,
    instrument: AAPL,
    side: action.type === "REQUEST_ENTRY" ? "BUY" : "SELL",
    quantity: 1,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode: "DRY_RUN"
  };
}

function proposal(decisionType, state) {
  return {
    decisionType,
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

function runtime({ ledger, now, bridge, quoteWatch }) {
  return createTradingSupervisorRuntime({
    ledger,
    quoteWatch: quoteWatch ?? {
      async poll() {
        return [quoteObservation()];
      }
    },
    protectedOrderBridge: bridge,
    buildOrderIntent: intentBuilder,
    now
  });
}

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-continuous-supervisor-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  try {
    await fn(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function driveToUnknown({ ledger, now }) {
  let orderCalls = 0;
  const supervisor = runtime({
    ledger,
    now,
    bridge: {
      async submitOrderIntent() {
        orderCalls += 1;
        const error = new Error("synthetic acknowledgement loss");
        error.code = "ACKNOWLEDGEMENT_UNKNOWN";
        throw error;
      }
    }
  });
  const watching = await supervisor.startWatching({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID
  });
  const result = await supervisor.evaluateCycle({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    instrument: AAPL,
    proposal: proposal("ENTER", watching.supervisorState)
  });
  assert.equal(result.status, "RECONCILIATION_REQUIRED");
  assert.equal(orderCalls, 1);
  return supervisor;
}

function manualScheduler() {
  const tasks = [];
  return {
    setTimeoutFn(fn, delayMs) {
      const task = { fn, delayMs, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimeoutFn(task) {
      task.cancelled = true;
    },
    async runNext() {
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (task.cancelled) continue;
        await task.fn();
        return task.delayMs;
      }
      throw new Error("no scheduled Supervisor cycle");
    },
    get pendingCount() {
      return tasks.filter((task) => !task.cancelled).length;
    }
  };
}

test("TREE 12.4 authoritative reconciliation exits durable recovery without a second broker mutation and survives reopen", async () => {
  await withFixture(async (dbPath) => {
    const now = clock();
    let ledger = await openLedger(dbPath, { now });
    await seedEpisode(ledger);
    const supervisor = await driveToUnknown({ ledger, now });
    const before = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    const requestId = before.positionStates.at(-1).state.dispatch.requestId;
    let reconcileReads = 0;

    const continuous = createContinuousTradingSupervisor({
      runtime: supervisor,
      ledger,
      now,
      readReconciledOrder: async (request) => {
        reconcileReads += 1;
        assert.deepEqual(request, {
          tradingRunId: RUN_ID,
          tradeEpisodeId: EPISODE_ID,
          requestId,
          actionType: "REQUEST_ENTRY"
        });
        return {
          requestId,
          localOrderId: "ord_reconciled_1",
          lifecycleState: "SUBMITTED"
        };
      }
    });

    const recovered = await continuous.reconcileEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(recovered.reconciled, true);
    assert.equal(recovered.status, "ACTIVE");
    assert.equal(recovered.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(recovered.snapshot.recovery.status, "ORDER_RECONCILED");
    assert.equal(recovered.orderReference.requestId, requestId);
    assert.equal(reconcileReads, 1);

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now });
    const reopened = runtime({
      ledger,
      now,
      bridge: {
        async submitOrderIntent() {
          throw new Error("reopen must not submit a second order");
        }
      }
    });
    const restored = await reopened.restoreEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(restored.snapshot.runtimeState, "ACTIVE");
    assert.equal(restored.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(restored.bundle.orderReferences.length, 1);
    await ledger.close();
  });
});

test("TREE 12.4 recovery consumes an already durable matching order reference without calling an external resolver", async () => {
  await withFixture(async (dbPath) => {
    const now = clock();
    const ledger = await openLedger(dbPath, { now });
    await seedEpisode(ledger);
    const supervisor = await driveToUnknown({ ledger, now });
    const before = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    const requestId = before.positionStates.at(-1).state.dispatch.requestId;
    await ledger.appendOrderReference({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      recordedAtMs: now(),
      localOrderId: "ord_already_durable_1",
      requestId,
      lifecycleState: "SUBMITTED"
    });
    let resolverCalls = 0;
    const continuous = createContinuousTradingSupervisor({
      runtime: supervisor,
      ledger,
      now,
      readReconciledOrder: async () => {
        resolverCalls += 1;
        throw new Error("durable evidence should win without another provider read");
      }
    });

    const recovered = await continuous.reconcileEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(recovered.reconciled, true);
    assert.equal(recovered.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(resolverCalls, 0);
    assert.equal((await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID)).orderReferences.length, 1);
    await ledger.close();
  });
});

test("TREE 12.4 malformed reconciliation evidence fails closed without changing durable Supervisor truth", async () => {
  await withFixture(async (dbPath) => {
    const now = clock();
    const ledger = await openLedger(dbPath, { now });
    await seedEpisode(ledger);
    const supervisor = await driveToUnknown({ ledger, now });
    const before = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    const positionStateCount = before.positionStates.length;
    const requestId = before.positionStates.at(-1).state.dispatch.requestId;
    const continuous = createContinuousTradingSupervisor({
      runtime: supervisor,
      ledger,
      now,
      readReconciledOrder: async () => ({
        requestId: `${requestId}-wrong`,
        localOrderId: "ord_wrong_1",
        lifecycleState: "SUBMITTED"
      })
    });

    await assert.rejects(
      continuous.reconcileEpisode({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID }),
      /requestId does not match durable dispatch/
    );
    const after = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(after.orderReferences.length, 0);
    assert.equal(after.positionStates.length, positionStateCount);
    assert.equal(after.positionStates.at(-1).state.runtimeState, "RECONCILIATION_REQUIRED");
    await ledger.close();
  });
});

test("TREE 12.4 continuous owner keeps deterministic fallback alive when AI is unavailable and honors shutdown without overlapping cycles", async () => {
  await withFixture(async (dbPath) => {
    const now = clock();
    const ledger = await openLedger(dbPath, { now });
    await seedEpisode(ledger);
    const scheduler = manualScheduler();
    let quoteCalls = 0;
    let proposalCalls = 0;
    let brokerCalls = 0;
    let quoteInFlight = 0;
    let maxQuoteInFlight = 0;
    const supervisor = runtime({
      ledger,
      now,
      quoteWatch: {
        async poll() {
          quoteCalls += 1;
          quoteInFlight += 1;
          maxQuoteInFlight = Math.max(maxQuoteInFlight, quoteInFlight);
          await Promise.resolve();
          quoteInFlight -= 1;
          return [quoteObservation()];
        }
      },
      bridge: {
        async submitOrderIntent() {
          brokerCalls += 1;
          throw new Error("AI-unavailable fallback must not submit an entry");
        }
      }
    });
    const continuous = createContinuousTradingSupervisor({
      runtime: supervisor,
      ledger,
      now,
      readDecisionProposal: async () => {
        proposalCalls += 1;
        throw new Error("synthetic AI outage");
      },
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn
    });
    const handle = await continuous.start({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      intervalMs: 25
    });

    assert.equal(scheduler.pendingCount, 1);
    assert.equal(await scheduler.runNext(), 0);
    assert.equal(handle.status.cyclesCompleted, 1);
    assert.equal(handle.status.lastStatus, "DECIDED");
    assert.equal(quoteCalls, 1);
    assert.equal(proposalCalls, 1);
    assert.equal(brokerCalls, 0);
    assert.equal(maxQuoteInFlight, 1);
    assert.equal(scheduler.pendingCount, 1);

    assert.equal(await scheduler.runNext(), 25);
    assert.equal(handle.status.cyclesCompleted, 2);
    assert.equal(quoteCalls, 2);
    assert.equal(proposalCalls, 2);
    assert.equal(maxQuoteInFlight, 1);
    assert.equal(scheduler.pendingCount, 1);

    await supervisor.setShutdown({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      shutdown: true
    });
    assert.equal(await scheduler.runNext(), 25);
    assert.equal(handle.status.lastStatus, "SHUTDOWN");
    assert.equal(quoteCalls, 2);
    assert.equal(proposalCalls, 2);
    assert.equal(brokerCalls, 0);

    await supervisor.setShutdown({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      shutdown: false
    });
    assert.equal(await scheduler.runNext(), 25);
    assert.equal(handle.status.cyclesCompleted, 4);
    assert.equal(handle.status.lastStatus, "DECIDED");
    assert.equal(quoteCalls, 3);
    assert.equal(proposalCalls, 3);
    assert.equal(brokerCalls, 0);
    assert.equal(maxQuoteInFlight, 1);

    handle.stop();
    await handle.done;
    assert.equal(handle.status.running, false);
    assert.equal(continuous.status.running, false);
    assert.equal(scheduler.pendingCount, 0);
    await ledger.close();
  });
});
