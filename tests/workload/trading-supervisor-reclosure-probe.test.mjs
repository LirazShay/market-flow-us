import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createHardRiskAuthority } from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const REPORT_PATH = process.env.MARKET_FLOW_US_TRADING_SUPERVISOR_REPORT
  ?? path.resolve("test-results/workload/ci-trading-supervisor.json");
const POLICY_ID = "pol_55555555-5555-4555-8555-555555555555";
const RUN_ID = "trun_55555555-5555-4555-8555-555555555555";
const NOW = 1_901_400_000_000;
const PROFILE = process.env.MARKET_FLOW_US_WORKLOAD_PROFILE ?? "ci";
const EPISODE_COUNT = PROFILE === "ci" ? 12 : 30;
const HARD_LIMITS = Object.freeze({
  maxOrderNotionalUsd: 1_000,
  maxConcurrentPositions: 4,
  maxAggregateExposureUsd: 4_000,
  maxOrderAttemptsPerWindow: 100,
  orderAttemptWindowMs: 60_000,
  maxSessionLossUsd: 1_000,
  maxFailedEntryAttempts: 20,
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

async function openLedger(dbPath, { start = 1, episodeStart = 1, now = clock() } = {}) {
  return openTradingLedger({
    dbPath,
    now,
    policyVersionIdFactory: () => POLICY_ID,
    tradingRunIdFactory: () => RUN_ID,
    tradeEpisodeIdFactory: uuidFactory("tep", episodeStart),
    candidateObservationIdFactory: uuidFactory("obs", start),
    decisionRecordIdFactory: uuidFactory("dec", start),
    orderReferenceIdFactory: uuidFactory("ordref", start),
    positionStateIdFactory: uuidFactory("pos", start),
    episodeOutcomeIdFactory: uuidFactory("out", start)
  });
}

function instrument(index) {
  return Object.freeze({
    symbol: `TW${String(index + 1).padStart(2, "0")}`,
    secType: "STK",
    currency: "USD",
    exchange: "SMART"
  });
}

function scannerSource(index) {
  const item = instrument(index);
  return {
    context: {
      generation: 500 + index,
      queryId: "query-trading-workload",
      queryName: "Trading workload",
      sql: "SELECT security_id, last FROM latest ORDER BY last DESC",
      intervalMs: 5_000,
      startedAtMs: NOW + index * 10,
      completedAtMs: NOW + index * 10 + 1
    },
    result: {
      columns: [
        { name: "security_id", type: "VARCHAR" },
        { name: "last", type: "DOUBLE" }
      ],
      rows: [[`NASDAQ:${item.symbol}`, 100 + index / 100]],
      rowCount: 1
    }
  };
}

function quoteObservation(item, index) {
  const last = 100 + index / 100;
  return {
    instrument: item,
    resolutionStatus: "EXACT",
    conid: 800_000 + index,
    availability: "AVAILABLE",
    staleness: "FRESH",
    usableForNewDecision: true,
    marketDataAvailability: null,
    last,
    bid: last - 0.01,
    ask: last + 0.01,
    providerUpdatedAtMs: NOW + index,
    receivedAtMs: NOW + index + 1
  };
}

function proposal({ state, tradeEpisodeId, decisionType }) {
  return {
    decisionType,
    tradingRunId: RUN_ID,
    tradeEpisodeId,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

function createRiskAuthority(ledger) {
  return createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger,
    now: () => NOW + 1_000,
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

function createSyntheticOrderClient() {
  const calls = [];
  return Object.freeze({
    calls,
    async createOrder(intent) {
      calls.push(intent);
      return {
        requestId: intent.requestId,
        localOrderId: `workload_order_${String(calls.length).padStart(4, "0")}`,
        lifecycleState: "SYNTHETIC_ACCEPTED",
        executionMode: "DRY_RUN",
        replayed: false
      };
    }
  });
}

async function seedRun(ledger) {
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
      source: "tree-12.9-integrated-workload",
      publicSafe: true
    },
    riskEnvelope: { maxNotionalUsd: HARD_LIMITS.maxOrderNotionalUsd }
  });
}

function createSupervisor({ ledger, broker, quoteByEpisode }) {
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: createRiskAuthority(ledger),
    orderServiceClient: broker
  });

  return createTradingSupervisorRuntime({
    ledger,
    quoteWatch: {
      async poll(instruments) {
        assert.equal(instruments.length, 1);
        const quote = quoteByEpisode.get(instruments[0].symbol);
        assert.ok(quote);
        return [quote];
      }
    },
    protectedOrderBridge: bridge,
    buildOrderIntent({ action, requestId, quote, run }) {
      assert.equal(run.mode, "SYNTHETIC");
      return {
        requestId,
        instrument: quote.instrument,
        side: action.type === "REQUEST_ENTRY" ? "BUY" : "SELL",
        quantity: 1,
        orderType: "LMT",
        limitPrice: quote.last,
        tif: "DAY",
        executionMode: "DRY_RUN"
      };
    },
    now: clock(NOW + 2_000)
  });
}

test("TREE 12.9 integrated Trading workload keeps composed episode/order counts bounded and restart-safe", { timeout: 30_000 }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-workload-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  const cpuBefore = process.cpuUsage();
  const rssBeforeBytes = process.memoryUsage().rss;
  const startedAt = performance.now();

  try {
    ledger = await openLedger(dbPath);
    await seedRun(ledger);

    const broker = createSyntheticOrderClient();
    const quoteByEpisode = new Map();
    const supervisor = createSupervisor({ ledger, broker, quoteByEpisode });
    const episodeIds = [];

    for (let index = 0; index < EPISODE_COUNT; index += 1) {
      const item = instrument(index);
      quoteByEpisode.set(item.symbol, quoteObservation(item, index));
      const episode = await admitScannerCandidate({
        ledger,
        tradingRunId: RUN_ID,
        policyVersionId: POLICY_ID,
        ...scannerSource(index),
        resultRank: 1,
        admittedAtMs: NOW + index * 10 + 2
      });
      const tradeEpisodeId = episode.tradeEpisodeId;
      episodeIds.push(tradeEpisodeId);

      const watching = await supervisor.startWatching({
        tradingRunId: RUN_ID,
        tradeEpisodeId
      });
      const entered = await supervisor.evaluateCycle({
        tradingRunId: RUN_ID,
        tradeEpisodeId,
        instrument: item,
        proposal: proposal({
          state: watching.supervisorState,
          tradeEpisodeId,
          decisionType: "ENTER"
        })
      });
      assert.equal(entered.status, "ORDER_SUBMITTED");

      const opened = await supervisor.recordBrokerEvent({
        tradingRunId: RUN_ID,
        tradeEpisodeId,
        eventType: "ENTRY_FILLED"
      });
      assert.equal(opened.supervisorState.lifecycleState, "POSITION_OPEN");

      const exited = await supervisor.evaluateCycle({
        tradingRunId: RUN_ID,
        tradeEpisodeId,
        instrument: item,
        proposal: proposal({
          state: opened.supervisorState,
          tradeEpisodeId,
          decisionType: "EXIT"
        })
      });
      assert.equal(exited.status, "ORDER_SUBMITTED");

      const closed = await supervisor.recordBrokerEvent({
        tradingRunId: RUN_ID,
        tradeEpisodeId,
        eventType: "EXIT_FILLED"
      });
      assert.equal(closed.supervisorState.lifecycleState, "CLOSED");
    }

    assert.equal(broker.calls.length, EPISODE_COUNT * 2);
    assert.equal(new Set(broker.calls.map((entry) => entry.requestId)).size, EPISODE_COUNT * 2);

    await ledger.close();
    ledger = await openLedger(dbPath, {
      start: 10_000,
      episodeStart: 10_000,
      now: clock(NOW + 10_000)
    });

    let totalObservations = 0;
    let totalDecisions = 0;
    let totalOrderReferences = 0;
    for (const tradeEpisodeId of episodeIds) {
      const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, tradeEpisodeId);
      assert.equal(bundle.positionStates.at(-1).state.supervisorState.lifecycleState, "CLOSED");
      assert.equal(bundle.orderReferences.length, 2);
      assert.deepEqual(bundle.decisions.map((entry) => entry.decisionType), ["ENTER", "EXIT"]);
      totalObservations += bundle.observations.length;
      totalDecisions += bundle.decisions.length;
      totalOrderReferences += bundle.orderReferences.length;
    }

    const elapsedMs = performance.now() - startedAt;
    const cpu = process.cpuUsage(cpuBefore);
    const rssAfterBytes = process.memoryUsage().rss;
    const report = {
      schemaVersion: 1,
      product: "Market Flow US",
      task: "12.9",
      profile: PROFILE,
      publicSafe: true,
      episodeCount: EPISODE_COUNT,
      completedEpisodes: episodeIds.length,
      observations: totalObservations,
      decisions: totalDecisions,
      orderReferences: totalOrderReferences,
      brokerCalls: broker.calls.length,
      uniqueRequestIds: new Set(broker.calls.map((entry) => entry.requestId)).size,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      cpuUserMicros: cpu.user,
      cpuSystemMicros: cpu.system,
      rssBeforeBytes,
      rssAfterBytes,
      rssDeltaBytes: rssAfterBytes - rssBeforeBytes,
      evidenceScope: {
        includes: "Scanner admission, Trading Ledger, Supervisor, fresh quote decision evidence, Hard Risk Authority, Protected Order Bridge, synthetic order seam, entry/exit broker events and ledger reopen",
        excludes: "real provider latency, authenticated provider/account state and real-money LIVE submission"
      }
    };

    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    assert.equal(totalObservations, EPISODE_COUNT * 2);
    assert.equal(totalDecisions, EPISODE_COUNT * 2);
    assert.equal(totalOrderReferences, EPISODE_COUNT * 2);
    assert.ok(elapsedMs < 20_000, `integrated Trading workload exceeded 20s bound: ${elapsedMs}ms`);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
