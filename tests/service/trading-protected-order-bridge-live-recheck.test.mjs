import assert from "node:assert/strict";
import { test } from "node:test";

import { createHardRiskAuthority, HardRiskRejectionError } from "../../trading-server/hard-risk-authority.js";
import { createProtectedOrderBridge } from "../../trading-server/protected-order-bridge.js";

const START = 1_900_200_000_000;
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

function liveIntent() {
  return {
    requestId: "trading-bridge-live-recheck",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 1,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode: "LIVE"
  };
}

test("TREE 12.6 LIVE re-runs hard risk after human confirmation and blocks a quote that became stale", async () => {
  let nowMs = START;
  const decisions = [];
  const authority = createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger: {
      async appendDecisionRecord(record) {
        decisions.push(record);
        return { decisionRecordId: `dec_${decisions.length}`, ...record };
      }
    },
    now: () => nowMs,
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
  let orderCalls = 0;
  let confirmationCalls = 0;
  const bridge = createProtectedOrderBridge({
    hardRiskAuthority: authority,
    orderServiceClient: {
      async createOrder() {
        orderCalls += 1;
      }
    },
    requestLiveOperatorConfirmation: async () => {
      confirmationCalls += 1;
      nowMs += HARD_LIMITS.maxQuoteAgeMs + 1;
      return { confirmed: true };
    }
  });

  await assert.rejects(
    () => bridge.submitOrderIntent({
      tradingRunId: "trun_live_recheck",
      tradeEpisodeId: "tep_live_recheck",
      intent: liveIntent(),
      quote: {
        last: 100,
        bid: 99.9,
        ask: 100.1,
        providerUpdatedAtMs: START
      }
    }),
    (error) => error instanceof HardRiskRejectionError
      && error.code === "HARD_RISK_STALE_QUOTE"
  );

  assert.equal(confirmationCalls, 1);
  assert.equal(orderCalls, 0);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].reasonCode, "HARD_RISK_STALE_QUOTE");
});
