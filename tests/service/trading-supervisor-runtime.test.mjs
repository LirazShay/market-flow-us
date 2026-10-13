import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import {
  SUPERVISOR_SNAPSHOT_KIND,
  createTradingSupervisorRuntime
} from "../../trading-server/supervisor-runtime.js";
import {
  createSupervisorState,
  evaluateSupervisorDecision
} from "../../trading-server/supervisor.js";

const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});
const BASE_NOW = 1_900_200_000_000;

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

async function openLedger(dbPath, { start = 1, now = clock() } = {}) {
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
    environmentSnapshot: { source: "synthetic-supervisor-test" },
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

function proposal(decisionType, state, extra = {}) {
  return {
    decisionType,
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion,
    ...extra
  };
}

function quoteObservation() {
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
    providerUpdatedAtMs: BASE_NOW,
    receivedAtMs: BASE_NOW + 1
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

function quoteWatch({ fail = false } = {}) {
  return {
    async poll(instruments) {
      assert.deepEqual(instruments, [AAPL]);
      if (fail) throw new Error("synthetic provider loss");
      return [quoteObservation()];
    }
  };
}

function orderBridge(handler) {
  return {
    async submitOrderIntent(input) {
      return handler(input);
    }
  };
}

function runtime({ ledger, bridge, watch = quoteWatch(), now = clock(BASE_NOW + 100) }) {
  return createTradingSupervisorRuntime({
    ledger,
    quoteWatch: watch,
    protectedOrderBridge: bridge,
    buildOrderIntent: intentBuilder,
    now
  });
}

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-supervisor-runtime-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  try {
    await fn(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("TREE 12.4 Supervisor persists decisions, quote evidence, order reference and lifecycle across ledger reopen", async () => {
  await withFixture(async (dbPath) => {
    let ledger = await openLedger(dbPath);
    await seedEpisode(ledger);
    const submitted = [];
    const supervisor = runtime({
      ledger,
      bridge: orderBridge(async (input) => {
        submitted.push(input);
        return {
          requestId: input.intent.requestId,
          localOrderId: "ord_supervisor_1",
          lifecycleState: "DRY_RUN_COMPLETE",
          executionMode: "DRY_RUN",
          replayed: false
        };
      })
    });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(watching.supervisorState.lifecycleState, "WATCHING");
    assert.equal(watching.supervisorState.stateVersion, 1);

    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal("ENTER", watching.supervisorState)
    });
    assert.equal(result.status, "ORDER_SUBMITTED");
    assert.equal(result.state.lifecycleState, "ENTRY_WORKING");
    assert.equal(submitted.length, 1);
    assert.match(submitted[0].intent.requestId, /^sup_[0-9a-f]{64}$/u);
    assert.equal(submitted[0].intent.side, "BUY");

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.observations.length, 1);
    assert.equal(bundle.decisions.at(-1).decisionType, "ENTER");
    assert.equal(bundle.orderReferences.length, 1);
    assert.equal(bundle.orderReferences[0].requestId, submitted[0].intent.requestId);
    assert.equal(bundle.positionStates.at(-1).state.supervisorState.lifecycleState, "ENTRY_WORKING");

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now: clock(BASE_NOW + 1_000) });
    const reopenedCalls = [];
    const reopened = runtime({
      ledger,
      bridge: orderBridge(async (input) => {
        reopenedCalls.push(input);
        throw new Error("restart must not recreate an already durable order");
      }),
      now: clock(BASE_NOW + 2_000)
    });
    const restored = await reopened.restoreEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(restored.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(restored.snapshot.runtimeState, "ACTIVE");
    assert.equal(reopenedCalls.length, 0);
    await ledger.close();
  });
});

test("TREE 12.4 unknown order outcome becomes durable reconciliation state and restart never blind-retries", async () => {
  await withFixture(async (dbPath) => {
    let ledger = await openLedger(dbPath);
    await seedEpisode(ledger);
    let calls = 0;
    const supervisor = runtime({
      ledger,
      bridge: orderBridge(async () => {
        calls += 1;
        const error = new Error("synthetic acknowledgement loss");
        error.code = "ACKNOWLEDGEMENT_UNKNOWN";
        throw error;
      })
    });
    const watching = await supervisor.startWatching({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID });
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal("ENTER", watching.supervisorState)
    });
    assert.equal(result.status, "RECONCILIATION_REQUIRED");
    assert.equal(result.reasonCode, "ORDER_OUTCOME_UNKNOWN");
    assert.equal(calls, 1);

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now: clock(BASE_NOW + 1_000) });
    const restartedCalls = [];
    const restarted = runtime({
      ledger,
      bridge: orderBridge(async (input) => {
        restartedCalls.push(input);
        throw new Error("blind retry is forbidden");
      }),
      now: clock(BASE_NOW + 2_000)
    });
    const blocked = await restarted.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal("ENTER", createSupervisorState({
        tradingRunId: RUN_ID,
        tradeEpisodeId: EPISODE_ID,
        policyVersionId: POLICY_ID,
        candidateKey: "NASDAQ:AAPL",
        lifecycleState: "ENTRY_PENDING",
        stateVersion: 2
      }))
    });
    assert.equal(blocked.status, "RECONCILIATION_REQUIRED");
    assert.equal(restartedCalls.length, 0);
    await ledger.close();
  });
});

test("TREE 12.4 restart recovers a durable order reference after a crash-window snapshot without creating a second order", async () => {
  await withFixture(async (dbPath) => {
    let ledger = await openLedger(dbPath);
    await seedEpisode(ledger);

    const watchingState = createSupervisorState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      policyVersionId: POLICY_ID,
      candidateKey: "NASDAQ:AAPL",
      lifecycleState: "WATCHING",
      stateVersion: 1
    });
    const entered = evaluateSupervisorDecision({
      state: watchingState,
      proposal: proposal("ENTER", watchingState),
      quote: quoteObservation()
    });
    const decision = await ledger.appendDecisionRecord({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      decidedAtMs: BASE_NOW + 20,
      decisionType: "ENTER",
      reasonCode: "AI_PROPOSAL_ACCEPTED",
      evidence: { syntheticCrashWindow: true }
    });
    const requestId = "sup_crash_window_request_1";
    await ledger.appendPositionState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      observedAtMs: BASE_NOW + 21,
      state: {
        kind: SUPERVISOR_SNAPSHOT_KIND,
        version: 1,
        supervisorState: entered.state,
        runtimeState: "ACTIVE",
        dispatch: {
          status: "DISPATCHING",
          actionType: "REQUEST_ENTRY",
          decisionRecordId: decision.decisionRecordId,
          requestId
        },
        recovery: null,
        lastOrderReference: null
      }
    });
    await ledger.appendOrderReference({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      recordedAtMs: BASE_NOW + 22,
      localOrderId: "ord_crash_window_1",
      requestId,
      lifecycleState: "SUBMITTED"
    });
    await ledger.close();

    ledger = await openLedger(dbPath, { start: 100, now: clock(BASE_NOW + 1_000) });
    let calls = 0;
    const restarted = runtime({
      ledger,
      bridge: orderBridge(async () => {
        calls += 1;
        throw new Error("must recover from durable order reference");
      }),
      now: clock(BASE_NOW + 2_000)
    });
    const restored = await restarted.restoreEpisode({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID });
    assert.equal(restored.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(restored.snapshot.recovery.status, "ORDER_REFERENCE_RECOVERED");
    assert.equal(restored.snapshot.lastOrderReference.requestId, requestId);
    assert.equal(calls, 0);
    await ledger.close();
  });
});

test("TREE 12.4 provider loss fails closed for new entry and explicit shutdown prevents decision or broker work", async () => {
  await withFixture(async (dbPath) => {
    const ledger = await openLedger(dbPath);
    await seedEpisode(ledger);
    let orderCalls = 0;
    const supervisor = runtime({
      ledger,
      watch: quoteWatch({ fail: true }),
      bridge: orderBridge(async () => {
        orderCalls += 1;
        throw new Error("new entry must fail closed without quote authority");
      })
    });
    const watching = await supervisor.startWatching({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID });
    const failedClosed = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal("ENTER", watching.supervisorState)
    });
    assert.equal(failedClosed.status, "DECIDED");
    assert.equal(failedClosed.state.lifecycleState, "WATCHING");
    assert.equal(failedClosed.decision.reasonCode, "SUPERVISOR_QUOTE_NOT_USABLE_FOR_ENTRY");
    assert.equal(orderCalls, 0);

    const shutdown = await supervisor.setShutdown({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      shutdown: true
    });
    assert.equal(shutdown.runtimeState, "SHUTDOWN");
    const whileStopped = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal("SKIP", shutdown.supervisorState)
    });
    assert.equal(whileStopped.status, "SHUTDOWN");
    assert.deepEqual(whileStopped.action, { type: "NONE" });
    assert.equal(orderCalls, 0);
    await ledger.close();
  });
});
