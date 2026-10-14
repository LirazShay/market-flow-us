import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createOrderServiceRuntime } from "../../ibkr-order-service/service.js";
import { openOrderExecutionStore } from "../../ibkr-order-service/store.js";
import { createOrderServiceClient } from "../../local-service/orders/order-service-client.js";
import { createHardRiskAuthority } from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_88888888-8888-4888-8888-888888888888";
const RUN_ID = "trun_88888888-8888-4888-8888-888888888888";
const EPISODE_ID = "tep_88888888-8888-4888-8888-888888888888";
const NOW = 1_901_200_000_000;
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
      generation: 88,
      queryId: "query-dry-run-provider-acceptance",
      queryName: "DRY RUN provider acceptance",
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

function buildOrderIntent({ action, requestId, run }) {
  assert.equal(run.mode, "DRY_RUN");
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

function decisionProposal(state) {
  return {
    decisionType: "ENTER",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: state.stateVersion
  };
}

function createControlledProviderAdapter({ rejectWhatIf = false } = {}) {
  const calls = [];
  let submitOrderCalls = 0;
  let confirmReplyCalls = 0;
  let cancelOrderCalls = 0;

  return Object.freeze({
    calls,
    get submitOrderCalls() {
      return submitOrderCalls;
    },
    get confirmReplyCalls() {
      return confirmReplyCalls;
    },
    get cancelOrderCalls() {
      return cancelOrderCalls;
    },
    async getSessionStatus() {
      calls.push({ method: "getSessionStatus" });
      return { authenticated: true, brokerageSession: true };
    },
    async getTradableAccounts() {
      calls.push({ method: "getTradableAccounts" });
      return [{ tradable: true, fixture: "CONTROLLED_PROVIDER" }];
    },
    async checkTradingPermission({ account, instrument, side }) {
      calls.push({ method: "checkTradingPermission", account, instrument, side });
      return { allowed: true };
    },
    async resolveInstrument(instrument) {
      calls.push({ method: "resolveInstrument", instrument });
      return { status: "EXACT", conid: 265598, instrument };
    },
    async getSnapshot({ account, resolution }) {
      calls.push({ method: "getSnapshot", account, resolution });
      return {
        status: "READY",
        conid: resolution.conid,
        last: 100,
        bid: 99.9,
        ask: 100.1,
        providerUpdatedAtMs: NOW
      };
    },
    async previewOrder(intent, context) {
      calls.push({ method: "previewOrder", intent, context });
      return rejectWhatIf
        ? { status: "REJECTED", synthetic: true, reasonCode: "CONTROLLED_WHAT_IF_REJECTION" }
        : {
            status: "ACCEPTED",
            synthetic: true,
            kind: "CONTROLLED_PROVIDER_WHAT_IF",
            evidence: {
              estimatedCommissionUsd: 0.01,
              estimatedOrderValueUsd: 100
            }
          };
    },
    async getLongPosition() {
      calls.push({ method: "getLongPosition" });
      return { status: "EXACT", longQuantity: 1 };
    },
    async submitOrder() {
      submitOrderCalls += 1;
      throw new Error("DRY_RUN/provider-what-if stage must never submit a provider order");
    },
    async confirmReply() {
      confirmReplyCalls += 1;
      throw new Error("DRY_RUN/provider-what-if stage must never confirm a provider reply");
    },
    async getOrders() {
      calls.push({ method: "getOrders" });
      return [];
    },
    async getTrades() {
      calls.push({ method: "getTrades" });
      return [];
    },
    async cancelOrder() {
      cancelOrderCalls += 1;
      throw new Error("DRY_RUN/provider-what-if stage must never cancel a provider order");
    }
  });
}

async function startOrderApi({ adapter, store }) {
  const runtime = createOrderServiceRuntime({
    adapter,
    store,
    processLiveEnabled: false
  });
  assert.equal(runtime.liveCapable, true);
  assert.equal(runtime.liveEnabled, false);

  const server = createServer(runtime.handler);
  server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    runtime,
    client: createOrderServiceClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      callerToken: runtime.callerToken,
      requestTimeoutMs: 1_000
    }),
    async close() {
      server.close();
      await once(server, "close");
    }
  };
}

async function createDryRunEpisode(ledger) {
  await ledger.createPolicyVersion({
    policy: {
      entry: { orderType: "LMT" },
      exit: { orderType: "LMT" }
    }
  });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    environmentSnapshot: {
      source: "tree-12.9-dry-run-provider-acceptance",
      provider: "CONTROLLED_WHAT_IF"
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

async function createSupervisor({ ledger, client, riskPermits = [] }) {
  const actualRiskAuthority = riskAuthority(ledger);
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: {
      async gateOrderIntent(input, forwardAuthorizedIntent) {
        return actualRiskAuthority.gateOrderIntent(input, async (authorization) => {
          riskPermits.push(authorization.riskPermit);
          return forwardAuthorizedIntent(authorization);
        });
      }
    },
    orderServiceClient: client
  });

  return createTradingSupervisorRuntime({
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
}

function providerMethodSequence(adapter) {
  return adapter.calls.map((call) => call.method);
}

const EXPECTED_PROVIDER_PREFLIGHT = Object.freeze([
  "getSessionStatus",
  "getTradableAccounts",
  "checkTradingPermission",
  "resolveInstrument",
  "getSnapshot",
  "previewOrder"
]);

test("TREE 12.9 DRY_RUN stage traverses full provider what-if preflight without provider mutation", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-dry-run-provider-"));
  const ledgerPath = path.join(tempDir, "trading-ledger.duckdb");
  const orderStorePath = path.join(tempDir, "order-store.duckdb");
  let ledger = null;
  let store = null;
  let orderApi = null;

  try {
    ledger = await openLedger(ledgerPath);
    store = await openOrderExecutionStore({
      dbPath: orderStorePath,
      now: () => NOW + 300
    });
    await createDryRunEpisode(ledger);

    const adapter = createControlledProviderAdapter();
    orderApi = await startOrderApi({ adapter, store });
    const riskPermits = [];
    const supervisor = await createSupervisor({ ledger, client: orderApi.client, riskPermits });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: decisionProposal(watching.supervisorState)
    });

    assert.equal(result.status, "ORDER_SUBMITTED");
    assert.equal(result.state.lifecycleState, "ENTRY_WORKING");
    assert.equal(riskPermits.length, 1);
    assert.equal(riskPermits[0].reasonCode, "HARD_RISK_AUTHORIZED");
    assert.equal(riskPermits[0].orderNotionalUsd, 100);
    assert.deepEqual(riskPermits[0].effectiveLimits, HARD_LIMITS);
    assert.deepEqual(providerMethodSequence(adapter), EXPECTED_PROVIDER_PREFLIGHT);

    const previewCall = adapter.calls.at(-1);
    assert.equal(previewCall.method, "previewOrder");
    assert.equal(previewCall.intent.executionMode, "DRY_RUN");
    assert.equal(previewCall.intent.side, "BUY");
    assert.equal(previewCall.context.whatIf, true);
    assert.equal(previewCall.context.resolution.status, "EXACT");
    assert.equal(previewCall.context.snapshot.status, "READY");
    assert.equal(adapter.submitOrderCalls, 0);
    assert.equal(adapter.confirmReplyCalls, 0);
    assert.equal(adapter.cancelOrderCalls, 0);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.episode.candidateProvenance.scannerGeneration.generation, 88);
    assert.equal(bundle.observations.length, 1);
    assert.equal(bundle.orderReferences.length, 1);
    assert.equal(bundle.orderReferences[0].lifecycleState, "DRY_RUN_COMPLETE");
    const requestId = bundle.orderReferences[0].requestId;

    const stored = await store.getByRequestId(requestId);
    assert.ok(stored);
    assert.equal(stored.lifecycleState, "DRY_RUN_COMPLETE");
    assert.equal(stored.localOrderId, bundle.orderReferences[0].localOrderId);
    assert.equal(await store.getProviderState(stored.localOrderId), null);

    const replay = await orderApi.client.createOrder({
      requestId,
      instrument: AAPL,
      side: "BUY",
      quantity: 1,
      orderType: "LMT",
      limitPrice: 100,
      tif: "DAY",
      executionMode: "DRY_RUN"
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.localOrderId, stored.localOrderId);
    assert.equal(replay.lifecycleState, "DRY_RUN_COMPLETE");
    assert.deepEqual(
      providerMethodSequence(adapter),
      [...EXPECTED_PROVIDER_PREFLIGHT, ...EXPECTED_PROVIDER_PREFLIGHT]
    );
    assert.equal(adapter.submitOrderCalls, 0);
    assert.equal(adapter.confirmReplyCalls, 0);
    assert.equal(adapter.cancelOrderCalls, 0);
    assert.equal((await store.getByRequestId(requestId)).localOrderId, stored.localOrderId);
    assert.equal(await store.getProviderState(stored.localOrderId), null);
  } finally {
    if (orderApi) await orderApi.close();
    if (ledger) await ledger.close();
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.9 DRY_RUN stage fails closed when provider what-if rejects", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-dry-run-what-if-reject-"));
  const ledgerPath = path.join(tempDir, "trading-ledger.duckdb");
  const orderStorePath = path.join(tempDir, "order-store.duckdb");
  let ledger = null;
  let store = null;
  let orderApi = null;

  try {
    ledger = await openLedger(ledgerPath);
    store = await openOrderExecutionStore({
      dbPath: orderStorePath,
      now: () => NOW + 300
    });
    await createDryRunEpisode(ledger);

    const adapter = createControlledProviderAdapter({ rejectWhatIf: true });
    orderApi = await startOrderApi({ adapter, store });
    const riskPermits = [];
    const supervisor = await createSupervisor({ ledger, client: orderApi.client, riskPermits });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    const result = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: decisionProposal(watching.supervisorState)
    });

    assert.equal(result.status, "ORDER_REJECTED");
    assert.equal(result.reasonCode, "ORDER_SERVICE_REJECTED");
    assert.equal(result.state.lifecycleState, "WATCHING");
    assert.equal(riskPermits.length, 1);
    assert.equal(riskPermits[0].reasonCode, "HARD_RISK_AUTHORIZED");
    assert.deepEqual(providerMethodSequence(adapter), EXPECTED_PROVIDER_PREFLIGHT);
    assert.equal(adapter.calls.at(-1).context.whatIf, true);
    assert.equal(adapter.submitOrderCalls, 0);
    assert.equal(adapter.confirmReplyCalls, 0);
    assert.equal(adapter.cancelOrderCalls, 0);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(bundle.observations.length, 1);
    assert.equal(bundle.orderReferences.length, 0);
    assert.equal(bundle.positionStates.at(-1).state.recovery.status, "ORDER_REJECTED_PRE_MUTATION");
    assert.equal(bundle.positionStates.at(-1).state.recovery.reasonCode, "ORDER_SERVICE_REJECTED");
    const rejectedRequestId = bundle.positionStates.at(-1).state.recovery.requestId;
    assert.equal(await store.getByRequestId(rejectedRequestId), null);
  } finally {
    if (orderApi) await orderApi.close();
    if (ledger) await ledger.close();
    if (store) await store.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
