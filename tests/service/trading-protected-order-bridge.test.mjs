import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

import { createOrderRequestHandler } from "../../ibkr-order-service/service.js";
import { createOrderServiceClient } from "../../local-service/orders/order-service-client.js";
import { createHardRiskAuthority, HardRiskRejectionError } from "../../trading-server/hard-risk-authority.js";
import {
  ProtectedOrderBridgeError,
  createProtectedOrderBridge
} from "../../trading-server/protected-order-bridge.js";

const NOW = 1_900_100_000_000;
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

function intent(overrides = {}) {
  return {
    requestId: "trading-bridge-request-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode: "DRY_RUN",
    ...overrides
  };
}

function quote() {
  return {
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: NOW - 100
  };
}

function fakeLedger() {
  const decisions = [];
  return {
    decisions,
    async appendDecisionRecord(record) {
      decisions.push(record);
      return { decisionRecordId: `dec_${decisions.length}`, ...record };
    }
  };
}

function riskAuthority({ globalKillSwitch = false } = {}) {
  return createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger: fakeLedger(),
    now: () => NOW,
    readOperatorControls: async () => ({
      globalKillSwitch,
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

function bridgeRequest(overrides = {}) {
  return {
    tradingRunId: "trun_bridge_test",
    tradeEpisodeId: "tep_bridge_test",
    intent: intent(),
    quote: quote(),
    ...overrides
  };
}

async function startOrderApi() {
  const callerToken = "T".repeat(48);
  const accepted = [];
  const handler = createOrderRequestHandler({
    callerToken,
    adapter: {
      async previewOrder() {
        return { synthetic: true };
      }
    },
    dryRunAuthority: {
      async create(normalizedIntent) {
        accepted.push({ mode: "DRY_RUN", intent: normalizedIntent });
        return {
          requestId: normalizedIntent.requestId,
          localOrderId: "ord_bridge_dry_1",
          lifecycleState: "DRY_RUN_COMPLETE",
          executionMode: "DRY_RUN",
          replayed: false
        };
      }
    },
    liveOrderAuthority: {
      async create(normalizedIntent) {
        accepted.push({ mode: "LIVE", intent: normalizedIntent });
        return {
          requestId: normalizedIntent.requestId,
          localOrderId: "ord_bridge_live_1",
          lifecycleState: "SUBMITTED",
          executionMode: "LIVE",
          replayed: false
        };
      },
      async confirm() {
        throw new Error("protected bridge must not auto-confirm provider replies");
      },
      async cancel() {
        throw new Error("protected bridge must not invent a cancel state machine");
      }
    }
  });
  const server = createServer(handler);
  server.listen({ host: "127.0.0.1", port: 0, exclusive: true });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const client = createOrderServiceClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    callerToken,
    requestTimeoutMs: 1_000
  });

  return {
    accepted,
    client,
    async close() {
      server.close();
      await once(server, "close");
    }
  };
}

test("TREE 12.6 DRY_RUN passes hard risk then reaches the existing authenticated order-service POST /orders path", async () => {
  const api = await startOrderApi();
  try {
    const bridge = createProtectedOrderBridge({
      hardRiskAuthority: riskAuthority(),
      orderServiceClient: api.client
    });

    const result = await bridge.submitOrderIntent(bridgeRequest());

    assert.equal(result.lifecycleState, "DRY_RUN_COMPLETE");
    assert.equal(api.accepted.length, 1);
    assert.equal(api.accepted[0].mode, "DRY_RUN");
    assert.deepEqual(api.accepted[0].intent, intent());
  } finally {
    await api.close();
  }
});

test("TREE 12.6 hard-risk rejection fails before the order-service client", async () => {
  let orderCalls = 0;
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: riskAuthority({ globalKillSwitch: true }),
    orderServiceClient: {
      async createOrder() {
        orderCalls += 1;
        throw new Error("must not reach order service");
      }
    }
  });

  await assert.rejects(
    () => bridge.submitOrderIntent(bridgeRequest()),
    (error) => error instanceof HardRiskRejectionError
      && error.code === "HARD_RISK_GLOBAL_KILL_SWITCH"
  );
  assert.equal(orderCalls, 0);
});

test("TREE 12.6 LIVE cannot be enabled by AI/request data and requires a trusted composition-time operator confirmation authority", async () => {
  let orderCalls = 0;
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: riskAuthority(),
    orderServiceClient: {
      async createOrder() {
        orderCalls += 1;
        return { lifecycleState: "must-not-submit" };
      }
    }
  });

  await assert.rejects(
    () => bridge.submitOrderIntent(bridgeRequest({
      intent: intent({ executionMode: "LIVE" }),
      operatorConfirmed: true,
      confirmation: { confirmed: true }
    })),
    (error) => error instanceof ProtectedOrderBridgeError
      && error.code === "LIVE_OPERATOR_CONFIRMATION_REQUIRED"
  );
  assert.equal(orderCalls, 0);
});

test("TREE 12.6 trusted operator confirmation denial remains fail-closed before existing LIVE order state", async () => {
  let orderCalls = 0;
  let confirmationCalls = 0;
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: riskAuthority(),
    orderServiceClient: {
      async createOrder() {
        orderCalls += 1;
      }
    },
    requestLiveOperatorConfirmation: async ({ intent: reviewedIntent, riskPermit }) => {
      confirmationCalls += 1;
      assert.equal(reviewedIntent.executionMode, "LIVE");
      assert.equal(riskPermit.reasonCode, "HARD_RISK_AUTHORIZED");
      return { confirmed: false };
    }
  });

  await assert.rejects(
    () => bridge.submitOrderIntent(bridgeRequest({
      intent: intent({ executionMode: "LIVE" })
    })),
    (error) => error instanceof ProtectedOrderBridgeError
      && error.code === "LIVE_OPERATOR_CONFIRMATION_REQUIRED"
  );
  assert.equal(confirmationCalls, 1);
  assert.equal(orderCalls, 0);
});

test("TREE 12.6 trusted LIVE confirmation reaches only the existing order-service state machine", async () => {
  const api = await startOrderApi();
  let confirmationCalls = 0;
  try {
    const bridge = createProtectedOrderBridge({
      hardRiskAuthority: riskAuthority(),
      orderServiceClient: api.client,
      requestLiveOperatorConfirmation: async ({ intent: reviewedIntent }) => {
        confirmationCalls += 1;
        assert.equal(reviewedIntent.requestId, "trading-bridge-request-1");
        return { confirmed: true };
      }
    });

    const result = await bridge.submitOrderIntent(bridgeRequest({
      intent: intent({ executionMode: "LIVE" })
    }));

    assert.equal(confirmationCalls, 1);
    assert.equal(result.lifecycleState, "SUBMITTED");
    assert.equal(api.accepted.length, 1);
    assert.equal(api.accepted[0].mode, "LIVE");
    assert.equal(api.accepted[0].intent.requestId, "trading-bridge-request-1");
    assert.equal(typeof bridge.confirmReply, "undefined");
    assert.equal(typeof bridge.cancelOrder, "undefined");
  } finally {
    await api.close();
  }
});

test("TREE 12.6 ACKNOWLEDGEMENT_UNKNOWN is propagated unchanged and the bridge never retries or changes requestId", async () => {
  const acknowledgementUnknown = Object.assign(new Error("ACKNOWLEDGEMENT_UNKNOWN"), {
    code: "ACKNOWLEDGEMENT_UNKNOWN"
  });
  const received = [];
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: riskAuthority(),
    orderServiceClient: {
      async createOrder(normalizedIntent) {
        received.push(normalizedIntent);
        throw acknowledgementUnknown;
      }
    }
  });

  await assert.rejects(
    () => bridge.submitOrderIntent(bridgeRequest()),
    (error) => error === acknowledgementUnknown
  );
  assert.equal(received.length, 1);
  assert.equal(received[0].requestId, "trading-bridge-request-1");
});
