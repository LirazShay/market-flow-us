import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createHardRiskAuthority } from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_77777777-7777-4777-8777-777777777777";
const RUN_ID = "trun_77777777-7777-4777-8777-777777777777";
const EPISODE_ID = "tep_77777777-7777-4777-8777-777777777777";
const NOW = 1_901_100_000_000;
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});
const HARD_LIMITS = Object.freeze({
  maxOrderNotionalUsd: 500,
  maxConcurrentPositions: 2,
  maxAggregateExposureUsd: 800,
  maxOrderAttemptsPerWindow: 3,
  orderAttemptWindowMs: 60_000,
  maxSessionLossUsd: 100,
  maxFailedEntryAttempts: 2,
  maxQuoteAgeMs: 5_000
});

function uuidFactory(prefix, start = 1) {
  let value = start;
  return () => {
    const tail = String(value).padStart(12, "0");
    value += 1;
    return `${prefix}_00000000-0000-4000-8000-${tail}`;
  };
}

function clock(start = NOW) {
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

function scannerSource() {
  return {
    context: {
      generation: 77,
      queryId: "query-synthetic-broker-acceptance",
      queryName: "Synthetic broker acceptance",
      sql: "SELECT security_id, last FROM latest ORDER BY last DESC",
      intervalMs: 5_000,
      startedAtMs: NOW - 500,
      completedAtMs: NOW - 100
    },
    result: {
      columns: [
        { name: "security_id", type: "VARCHAR" },
        { name: "last", type: "DOUBLE" }
      ],
      rows: [["NASDAQ:AAPL", 100]],
      rowCount: 1
    }
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
    marketDataAvailability: null,
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: NOW,
    receivedAtMs: NOW + 1
  };
}

function buildOrderIntent({ action, requestId, run }, executionMode = "DRY_RUN") {
  assert.equal(run.mode, "SYNTHETIC");
  return {
    requestId,
    instrument: AAPL,
    side: action.type === "REQUEST_ENTRY" ? "BUY" : "SELL",
    quantity: 1,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode
  };
}

function riskAuthority(ledger) {
  return createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger,
    now: () => NOW + 100,
    readOperatorControls: async () => ({
      globalKillSwitch: false,
      newEntryPaused: false
    }),
    readRiskState: async () => ({
      openPositionCount: 0,
      aggregateExposureUsd: 0,
      recentOrderAttemptTimestampsMs: [],
      pnlUsd: 0,
      failedEntryAttempts: 0,
      instrumentPositionQuantity: 0
    })
  });
}

function decisionProposal(state, decisionType) {
  return {
    decisionType,
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

function createSyntheticBrokerClient() {
  const calls = [];
  const results = new Map();

  return Object.freeze({
    calls,
    async createOrder(normalizedIntent) {
      assert.equal(normalizedIntent.executionMode, "DRY_RUN");
      calls.push(normalizedIntent);
      const existing = results.get(normalizedIntent.requestId);
      if (existing) {
        return Object.freeze({ ...existing, replayed: true });
      }
      const result = Object.freeze({
        requestId: normalizedIntent.requestId,
        localOrderId: `synthetic_order_${results.size + 1}`,
        lifecycleState: "SYNTHETIC_ACCEPTED",
        executionMode: "DRY_RUN",
        replayed: false
      });
      results.set(normalizedIntent.requestId, result);
      return result;
    }
  });
}

async function createSyntheticRun(ledger) {
  await ledger.createPolicyVersion({
    policy: {
      entry: { orderType: "LMT" },
      exit: { orderType: "LMT" }
    }
  });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "SYNTHETIC",
    environmentSnapshot: {
      source: "tree-12.9-synthetic-broker-acceptance",
      broker: "IN_MEMORY_SYNTHETIC"
    },
    riskEnvelope: { maxNotionalUsd: HARD_LIMITS.maxOrderNotionalUsd }
  });
  await admitScannerCandidate({
    ledger,
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    ...scannerSource(),
    resultRank: 1,
    admittedAtMs: NOW
  });
}

test("TREE 12.9 synthetic broker stage completes entry/exit durably without HTTP/provider execution", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-synthetic-broker-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openLedger(dbPath);
    await createSyntheticRun(ledger);

    const authorizations = [];
    const actualRiskAuthority = riskAuthority(ledger);
    const syntheticBroker = createSyntheticBrokerClient();
    let liveConfirmationCalls = 0;
    const bridge = createProtectedOrderBridge({
      hardRiskAuthority: {
        async gateOrderIntent(input, forwardAuthorizedIntent) {
          return actualRiskAuthority.gateOrderIntent(input, async (authorization) => {
            authorizations.push(authorization);
            return forwardAuthorizedIntent(authorization);
          });
        }
      },
      orderServiceClient: syntheticBroker,
      requestLiveOperatorConfirmation: async () => {
        liveConfirmationCalls += 1;
        throw new Error("synthetic broker stage must never request LIVE confirmation");
      }
    });
    const supervisor = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll(instruments) {
          assert.deepEqual(instruments, [AAPL]);
          return [quoteObservation()];
        }
      },
      protectedOrderBridge: bridge,
      buildOrderIntent,
      now: clock(NOW + 200)
    });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const entered = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: decisionProposal(watching.supervisorState, "ENTER")
    });

    assert.equal(entered.status, "ORDER_SUBMITTED");
    assert.equal(entered.state.lifecycleState, "ENTRY_WORKING");
    assert.equal(syntheticBroker.calls.length, 1);
    assert.equal(syntheticBroker.calls[0].side, "BUY");
    assert.equal(liveConfirmationCalls, 0);

    const positionOpen = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "ENTRY_FILLED"
    });
    assert.equal(positionOpen.supervisorState.lifecycleState, "POSITION_OPEN");

    const exited = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: decisionProposal(positionOpen.supervisorState, "EXIT")
    });

    assert.equal(exited.status, "ORDER_SUBMITTED");
    assert.equal(exited.state.lifecycleState, "EXIT_WORKING");
    assert.equal(syntheticBroker.calls.length, 2);
    assert.equal(syntheticBroker.calls[1].side, "SELL");
    assert.equal(liveConfirmationCalls, 0);

    const closed = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "EXIT_FILLED"
    });
    assert.equal(closed.supervisorState.lifecycleState, "CLOSED");

    assert.equal(authorizations.length, 2);
    assert.deepEqual(authorizations.map((entry) => entry.normalizedIntent.side), ["BUY", "SELL"]);
    assert.ok(authorizations.every((entry) => entry.riskPermit.reasonCode === "HARD_RISK_AUTHORIZED"));
    assert.ok(authorizations.every((entry) => entry.riskPermit.orderNotionalUsd === 100));

    const beforeRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(beforeRestart.episode.candidateProvenance.scannerGeneration.generation, 77);
    assert.equal(beforeRestart.observations.length, 2);
    assert.deepEqual(beforeRestart.decisions.map((entry) => entry.decisionType), ["ENTER", "EXIT"]);
    assert.equal(beforeRestart.orderReferences.length, 2);
    assert.ok(beforeRestart.orderReferences.every((entry) => entry.lifecycleState === "SYNTHETIC_ACCEPTED"));
    assert.equal(beforeRestart.positionStates.at(-1).state.supervisorState.lifecycleState, "CLOSED");

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now: clock(NOW + 1_000) });

    const restoredRun = await ledger.getTradingRun(RUN_ID);
    assert.equal(restoredRun.mode, "SYNTHETIC");

    let duplicateOrderCalls = 0;
    const restarted = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll() {
          throw new Error("closed synthetic episode restore must not poll quotes");
        }
      },
      protectedOrderBridge: {
        async submitOrderIntent() {
          duplicateOrderCalls += 1;
          throw new Error("closed synthetic episode restore must not duplicate orders");
        }
      },
      buildOrderIntent,
      now: clock(NOW + 2_000)
    });
    const restored = await restarted.restoreEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });

    assert.equal(restored.snapshot.supervisorState.lifecycleState, "CLOSED");
    assert.equal(duplicateOrderCalls, 0);
    assert.equal(syntheticBroker.calls.length, 2);
    const afterRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(afterRestart.orderReferences.length, 2);
    assert.equal(afterRestart.positionStates.at(-1).state.supervisorState.lifecycleState, "CLOSED");
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.9 synthetic broker stage fails closed if a SYNTHETIC run is miswired as LIVE", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-synthetic-live-escalation-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openLedger(dbPath);
    await createSyntheticRun(ledger);

    const syntheticBroker = createSyntheticBrokerClient();
    const bridge = createProtectedOrderBridge({
      hardRiskAuthority: riskAuthority(ledger),
      orderServiceClient: syntheticBroker
    });
    const supervisor = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll() {
          return [quoteObservation()];
        }
      },
      protectedOrderBridge: bridge,
      buildOrderIntent: (context) => buildOrderIntent(context, "LIVE"),
      now: clock(NOW + 300)
    });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: decisionProposal(watching.supervisorState, "ENTER")
    });

    assert.equal(result.status, "ORDER_REJECTED");
    assert.equal(result.reasonCode, "LIVE_OPERATOR_CONFIRMATION_REQUIRED");
    assert.equal(result.state.lifecycleState, "WATCHING");
    assert.equal(syntheticBroker.calls.length, 0);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.observations.length, 1);
    assert.equal(bundle.orderReferences.length, 0);
    assert.equal(bundle.positionStates.at(-1).state.recovery.status, "ORDER_REJECTED_PRE_MUTATION");
    assert.equal(bundle.positionStates.at(-1).state.recovery.reasonCode, "LIVE_OPERATOR_CONFIRMATION_REQUIRED");
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
