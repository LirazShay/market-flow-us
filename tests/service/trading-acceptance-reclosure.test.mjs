import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createOrderRequestHandler } from "../../ibkr-order-service/service.js";
import { createOrderServiceClient } from "../../local-service/orders/order-service-client.js";
import { createHardRiskAuthority } from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_99999999-9999-4999-8999-999999999999";
const RUN_ID = "trun_99999999-9999-4999-8999-999999999999";
const EPISODE_ID = "tep_99999999-9999-4999-8999-999999999999";
const NOW = 1_901_000_000_000;
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
      generation: 42,
      queryId: "query-acceptance-momentum",
      queryName: "Acceptance momentum",
      sql: "SELECT security_id, last, score FROM latest ORDER BY score DESC",
      intervalMs: 5_000,
      startedAtMs: NOW - 500,
      completedAtMs: NOW - 100
    },
    result: {
      columns: [
        { name: "security_id", type: "VARCHAR" },
        { name: "last", type: "DOUBLE" },
        { name: "score", type: "DOUBLE" }
      ],
      rows: [["NASDAQ:AAPL", 100, 0.91]],
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
    marketDataAvailability: "RpB",
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: NOW,
    receivedAtMs: NOW + 1
  };
}

function buildOrderIntent({ action, requestId }) {
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

async function startSyntheticOrderApi() {
  const callerToken = "T".repeat(48);
  const accepted = [];
  const handler = createOrderRequestHandler({
    callerToken,
    adapter: {
      async previewOrder() {
        return { synthetic: true, providerWhatIf: true };
      }
    },
    dryRunAuthority: {
      async create(normalizedIntent) {
        accepted.push(normalizedIntent);
        return {
          requestId: normalizedIntent.requestId,
          localOrderId: "ord_tree_12_9_dry_run",
          lifecycleState: "DRY_RUN_COMPLETE",
          executionMode: "DRY_RUN",
          replayed: false
        };
      }
    },
    liveOrderAuthority: {
      async create() {
        throw new Error("TREE 12.9 composed DRY_RUN proof must never submit LIVE");
      },
      async confirm() {
        throw new Error("TREE 12.9 proof must not auto-confirm provider replies");
      },
      async cancel() {
        throw new Error("TREE 12.9 proof must not invent cancellation authority");
      }
    }
  });
  const server = createServer(handler);
  server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    accepted,
    client: createOrderServiceClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      callerToken,
      requestTimeoutMs: 1_000
    }),
    async close() {
      server.close();
      await once(server, "close");
    }
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

function proposal(state) {
  return {
    decisionType: "ENTER",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

test("TREE 12.9 composed synthetic DRY_RUN path preserves Scanner provenance, risk/order evidence and restart safety", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-acceptance-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  const orderApi = await startSyntheticOrderApi();
  let ledger = null;

  try {
    ledger = await openLedger(dbPath);
    await ledger.createPolicyVersion({
      policy: {
        entry: { orderType: "LMT" },
        exit: { orderType: "LMT" }
      }
    });
    await ledger.createTradingRun({
      policyVersionId: POLICY_ID,
      mode: "DRY_RUN",
      environmentSnapshot: { source: "tree-12.9-synthetic-acceptance" },
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

    const bridge = createProtectedOrderBridge({
      hardRiskAuthority: riskAuthority(ledger),
      orderServiceClient: orderApi.client
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
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: proposal(watching.supervisorState)
    });

    assert.equal(result.status, "ORDER_SUBMITTED");
    assert.equal(result.state.lifecycleState, "ENTRY_WORKING");
    assert.equal(orderApi.accepted.length, 1);
    assert.equal(orderApi.accepted[0].executionMode, "DRY_RUN");
    assert.equal(orderApi.accepted[0].side, "BUY");

    const beforeRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(beforeRestart.episode.candidateProvenance.scannerGeneration.generation, 42);
    assert.equal(beforeRestart.episode.candidateProvenance.sourceQuery.queryId, "query-acceptance-momentum");
    assert.equal(beforeRestart.episode.candidateProvenance.resultRank, 1);
    assert.equal(beforeRestart.observations.length, 1);
    assert.equal(beforeRestart.orderReferences.length, 1);
    assert.equal(beforeRestart.orderReferences[0].requestId, orderApi.accepted[0].requestId);
    assert.equal(beforeRestart.positionStates.at(-1).state.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.ok(beforeRestart.decisions.some((decision) => decision.reasonCode === "HARD_RISK_AUTHORIZED"));

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now: clock(NOW + 1_000) });

    let duplicateOrderCalls = 0;
    const restarted = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll() {
          throw new Error("restore must not require fabricated quote continuity");
        }
      },
      protectedOrderBridge: {
        async submitOrderIntent() {
          duplicateOrderCalls += 1;
          throw new Error("restart must not duplicate an already durable order");
        }
      },
      buildOrderIntent,
      now: clock(NOW + 2_000)
    });

    const restored = await restarted.restoreEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(restored.snapshot.supervisorState.lifecycleState, "ENTRY_WORKING");
    assert.equal(duplicateOrderCalls, 0);

    const afterRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(afterRestart.orderReferences.length, 1);
    assert.equal(afterRestart.orderReferences[0].requestId, orderApi.accepted[0].requestId);
  } finally {
    if (ledger) await ledger.close();
    await orderApi.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});