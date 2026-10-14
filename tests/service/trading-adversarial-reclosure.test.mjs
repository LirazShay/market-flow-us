import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  HARD_RISK_REASON_CODES,
  createHardRiskAuthority
} from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_66666666-6666-4666-8666-666666666666";
const RUN_ID = "trun_66666666-6666-4666-8666-666666666666";
const EPISODE_ID = "tep_66666666-6666-4666-8666-666666666666";
const NOW = 1_901_300_000_000;
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
      generation: 66,
      queryId: "query-adversarial-reclosure",
      queryName: "Adversarial reclosure",
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

function quoteObservation(overrides = {}) {
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
    receivedAtMs: NOW + 1,
    ...overrides
  };
}

function buildOrderIntent({ action, requestId, run }) {
  assert.equal(run.mode, "SYNTHETIC");
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

function proposal(state, decisionType) {
  return {
    decisionType,
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

async function seed(ledger) {
  await ledger.createPolicyVersion({
    policy: {
      entry: { orderType: "LMT" },
      exit: { orderType: "LMT" }
    }
  });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "SYNTHETIC",
    environmentSnapshot: { source: "tree-12.9-adversarial-reclosure" },
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

function riskAuthority(ledger, riskState = {}) {
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
      instrumentPositionQuantity: 0,
      ...riskState
    })
  });
}

function syntheticBroker() {
  const calls = [];
  return Object.freeze({
    calls,
    async createOrder(intent) {
      calls.push(intent);
      return {
        requestId: intent.requestId,
        localOrderId: `synthetic_adversarial_${calls.length}`,
        lifecycleState: "SYNTHETIC_ACCEPTED",
        executionMode: "DRY_RUN",
        replayed: false
      };
    }
  });
}

function runtime({ ledger, quote, broker, riskState = {} }) {
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: riskAuthority(ledger, riskState),
    orderServiceClient: broker
  });
  return createTradingSupervisorRuntime({
    ledger,
    quoteWatch: {
      async poll(instruments) {
        assert.deepEqual(instruments, [AAPL]);
        return [quote];
      }
    },
    protectedOrderBridge: bridge,
    buildOrderIntent,
    now: clock(NOW + 200)
  });
}

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-adversarial-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;
  try {
    ledger = await openLedger(dbPath);
    await seed(ledger);
    await fn({ ledger, dbPath });
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("TREE 12.9 stale quote fails closed before Hard Risk/order mutation in the composed path", async () => {
  await withFixture(async ({ ledger }) => {
    const broker = syntheticBroker();
    const supervisor = runtime({
      ledger,
      broker,
      quote: quoteObservation({
        staleness: "STALE",
        usableForNewDecision: false,
        providerUpdatedAtMs: NOW - 10_000
      })
    });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal(watching.supervisorState, "ENTER")
    });

    assert.equal(result.status, "DECIDED");
    assert.equal(result.decision.reasonCode, "SUPERVISOR_QUOTE_NOT_USABLE_FOR_ENTRY");
    assert.equal(result.state.lifecycleState, "WATCHING");
    assert.equal(broker.calls.length, 0);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.orderReferences.length, 0);
    assert.equal(bundle.observations.at(-1).observation.staleness, "STALE");
  });
});

test("TREE 12.9 Hard Risk rejection stops a fresh ENTER before the broker seam and remains durable", async () => {
  await withFixture(async ({ ledger }) => {
    const broker = syntheticBroker();
    const supervisor = runtime({
      ledger,
      broker,
      quote: quoteObservation(),
      riskState: {
        openPositionCount: HARD_LIMITS.maxConcurrentPositions,
        instrumentPositionQuantity: 0
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
      proposal: proposal(watching.supervisorState, "ENTER")
    });

    assert.equal(result.status, "ORDER_REJECTED");
    assert.equal(result.reasonCode, HARD_RISK_REASON_CODES.concurrentPositions);
    assert.equal(result.state.lifecycleState, "WATCHING");
    assert.equal(broker.calls.length, 0);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.orderReferences.length, 0);
    assert.ok(bundle.decisions.some((entry) => (
      entry.decisionType === "HARD_RISK_REJECTED"
      && entry.reasonCode === HARD_RISK_REASON_CODES.concurrentPositions
    )));
    assert.equal(bundle.positionStates.at(-1).state.recovery.status, "ORDER_REJECTED_PRE_MUTATION");
  });
});

test("TREE 12.9 duplicate broker fills are idempotent and reordered fills fail closed without duplicate orders", async () => {
  await withFixture(async ({ ledger }) => {
    const broker = syntheticBroker();
    const supervisor = runtime({ ledger, broker, quote: quoteObservation() });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const entered = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal(watching.supervisorState, "ENTER")
    });
    assert.equal(entered.status, "ORDER_SUBMITTED");
    assert.equal(entered.state.lifecycleState, "ENTRY_WORKING");
    assert.equal(broker.calls.length, 1);

    await assert.rejects(
      supervisor.recordBrokerEvent({
        tradingRunId: RUN_ID,
        tradeEpisodeId: EPISODE_ID,
        eventType: "EXIT_FILLED"
      }),
      /EXIT_FILLED is invalid from ENTRY_WORKING/
    );
    assert.equal(broker.calls.length, 1);

    const opened = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "ENTRY_FILLED"
    });
    const duplicateEntryFill = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "ENTRY_FILLED"
    });
    assert.equal(opened.supervisorState.lifecycleState, "POSITION_OPEN");
    assert.equal(duplicateEntryFill.supervisorState.lifecycleState, "POSITION_OPEN");
    assert.equal(duplicateEntryFill.supervisorState.stateVersion, opened.supervisorState.stateVersion);
    assert.equal(broker.calls.length, 1);

    const exited = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal(duplicateEntryFill.supervisorState, "EXIT")
    });
    assert.equal(exited.status, "ORDER_SUBMITTED");
    assert.equal(exited.state.lifecycleState, "EXIT_WORKING");
    assert.equal(broker.calls.length, 2);

    const closed = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "EXIT_FILLED"
    });
    const duplicateExitFill = await supervisor.recordBrokerEvent({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      eventType: "EXIT_FILLED"
    });
    assert.equal(closed.supervisorState.lifecycleState, "CLOSED");
    assert.equal(duplicateExitFill.supervisorState.lifecycleState, "CLOSED");
    assert.equal(duplicateExitFill.supervisorState.stateVersion, closed.supervisorState.stateVersion);
    assert.equal(broker.calls.length, 2);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.orderReferences.length, 2);
    assert.equal(bundle.positionStates.at(-1).state.supervisorState.lifecycleState, "CLOSED");
  });
});
