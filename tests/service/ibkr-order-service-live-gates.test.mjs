import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LiveGateError,
  prepareLiveSubmission
} from "../../ibkr-order-service/live-gates.js";

function validLiveIntent(overrides = {}) {
  return {
    requestId: "req-live-gates-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "LMT",
    limitPrice: 123.45,
    tif: "DAY",
    executionMode: "LIVE",
    ...overrides
  };
}

function createAdapter(overrides = {}) {
  const calls = [];
  const account = Object.freeze({ tradable: true, kind: "synthetic-account" });
  const resolution = Object.freeze({ status: "EXACT", conid: 265598 });
  const snapshot = Object.freeze({ status: "READY", last: 123.4 });
  const preview = Object.freeze({ status: "ACCEPTED", whatIf: true });
  const position = Object.freeze({ status: "EXACT", longQuantity: 10 });

  const base = {
    async getSessionStatus() {
      calls.push("getSessionStatus");
      return { authenticated: true, brokerageSession: true };
    },
    async getTradableAccounts() {
      calls.push("getTradableAccounts");
      return [account];
    },
    async checkTradingPermission() {
      calls.push("checkTradingPermission");
      return { allowed: true };
    },
    async resolveInstrument() {
      calls.push("resolveInstrument");
      return resolution;
    },
    async getSnapshot() {
      calls.push("getSnapshot");
      return snapshot;
    },
    async previewOrder() {
      calls.push("previewOrder");
      return preview;
    },
    async getLongPosition() {
      calls.push("getLongPosition");
      return position;
    }
  };

  const adapter = {};
  for (const [name, fn] of Object.entries(base)) {
    adapter[name] = overrides[name]
      ? async (...args) => {
          calls.push(name);
          return overrides[name](...args);
        }
      : fn;
  }

  return { adapter, calls, account, resolution, snapshot, preview, position };
}

async function expectGateFailure({
  intent = validLiveIntent(),
  processLiveEnabled = true,
  overrides = {},
  code,
  checkpoint,
  expectedCalls
}) {
  const fixture = createAdapter(overrides);
  await assert.rejects(
    prepareLiveSubmission({
      intent,
      adapter: fixture.adapter,
      processLiveEnabled
    }),
    (error) => {
      assert.ok(error instanceof LiveGateError);
      assert.equal(error.code, code);
      assert.equal(error.checkpoint, checkpoint);
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
  assert.deepEqual(fixture.calls, expectedCalls);
}

test("request LIVE and process LIVE are independent fail-closed gates before provider access", async () => {
  await expectGateFailure({
    intent: validLiveIntent({ executionMode: "DRY_RUN" }),
    code: "LIVE_REQUEST_REQUIRED",
    checkpoint: "request-live-gate",
    expectedCalls: []
  });

  await expectGateFailure({
    processLiveEnabled: false,
    code: "LIVE_PROCESS_NOT_ENABLED",
    checkpoint: "process-live-gate",
    expectedCalls: []
  });
});

test("provider/session/account/permission/instrument/snapshot/what-if gates stop at the first missing authority", async () => {
  await expectGateFailure({
    overrides: {
      getSessionStatus: () => ({ authenticated: false, brokerageSession: false })
    },
    code: "PROVIDER_NOT_AUTHENTICATED",
    checkpoint: "brokerage-session",
    expectedCalls: ["getSessionStatus"]
  });

  await expectGateFailure({
    overrides: {
      getSessionStatus: () => ({ authenticated: true, brokerageSession: false })
    },
    code: "BROKERAGE_SESSION_UNAVAILABLE",
    checkpoint: "brokerage-session",
    expectedCalls: ["getSessionStatus"]
  });

  await expectGateFailure({
    overrides: {
      getTradableAccounts: () => []
    },
    code: "TRADABLE_ACCOUNT_UNAVAILABLE",
    checkpoint: "account-discovery",
    expectedCalls: ["getSessionStatus", "getTradableAccounts"]
  });

  await expectGateFailure({
    overrides: {
      getTradableAccounts: () => [
        { tradable: true, kind: "synthetic-1" },
        { tradable: true, kind: "synthetic-2" }
      ]
    },
    code: "TRADABLE_ACCOUNT_AMBIGUOUS",
    checkpoint: "account-discovery",
    expectedCalls: ["getSessionStatus", "getTradableAccounts"]
  });

  await expectGateFailure({
    overrides: {
      checkTradingPermission: () => ({ allowed: false })
    },
    code: "TRADING_PERMISSION_UNAVAILABLE",
    checkpoint: "trading-permission",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission"
    ]
  });

  await expectGateFailure({
    overrides: {
      resolveInstrument: () => ({ status: "AMBIGUOUS" })
    },
    code: "INSTRUMENT_AMBIGUOUS",
    checkpoint: "instrument-resolution",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument"
    ]
  });

  await expectGateFailure({
    overrides: {
      resolveInstrument: () => ({ status: "NOT_FOUND" })
    },
    code: "INSTRUMENT_UNRESOLVED",
    checkpoint: "instrument-resolution",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument"
    ]
  });

  await expectGateFailure({
    overrides: {
      getSnapshot: () => ({ status: "UNAVAILABLE" })
    },
    code: "SNAPSHOT_PREFLIGHT_FAILED",
    checkpoint: "market-data-snapshot",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument",
      "getSnapshot"
    ]
  });

  await expectGateFailure({
    overrides: {
      previewOrder: () => ({ status: "REJECTED" })
    },
    code: "WHAT_IF_REJECTED",
    checkpoint: "what-if-preview",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument",
      "getSnapshot",
      "previewOrder"
    ]
  });
});

test("BUY returns a prepared submission only after every pre-submit gate passes", async () => {
  const fixture = createAdapter();
  const prepared = await prepareLiveSubmission({
    intent: validLiveIntent(),
    adapter: fixture.adapter,
    processLiveEnabled: true
  });

  assert.equal(prepared.intent.executionMode, "LIVE");
  assert.equal(prepared.intent.side, "BUY");
  assert.equal(prepared.account, fixture.account);
  assert.equal(prepared.resolution, fixture.resolution);
  assert.equal(prepared.snapshot, fixture.snapshot);
  assert.equal(prepared.preview, fixture.preview);
  assert.equal(prepared.position, null);
  assert.deepEqual(fixture.calls, [
    "getSessionStatus",
    "getTradableAccounts",
    "checkTradingPermission",
    "resolveInstrument",
    "getSnapshot",
    "previewOrder"
  ]);
});

test("LIVE SELL requires exact known long coverage and never permits an opening short", async () => {
  const sellIntent = validLiveIntent({ side: "SELL", quantity: 4 });

  await expectGateFailure({
    intent: sellIntent,
    overrides: {
      getLongPosition: () => ({ status: "UNAVAILABLE" })
    },
    code: "SELL_POSITION_UNAVAILABLE",
    checkpoint: "sell-position-guard",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument",
      "getSnapshot",
      "previewOrder",
      "getLongPosition"
    ]
  });

  await expectGateFailure({
    intent: sellIntent,
    overrides: {
      getLongPosition: () => ({ status: "EXACT", longQuantity: Number.NaN })
    },
    code: "SELL_POSITION_AMBIGUOUS",
    checkpoint: "sell-position-guard",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument",
      "getSnapshot",
      "previewOrder",
      "getLongPosition"
    ]
  });

  await expectGateFailure({
    intent: sellIntent,
    overrides: {
      getLongPosition: () => ({ status: "EXACT", longQuantity: 3 })
    },
    code: "SELL_POSITION_INSUFFICIENT",
    checkpoint: "sell-position-guard",
    expectedCalls: [
      "getSessionStatus",
      "getTradableAccounts",
      "checkTradingPermission",
      "resolveInstrument",
      "getSnapshot",
      "previewOrder",
      "getLongPosition"
    ]
  });

  const fixture = createAdapter({
    getLongPosition: () => ({ status: "EXACT", longQuantity: 4 })
  });
  const prepared = await prepareLiveSubmission({
    intent: sellIntent,
    adapter: fixture.adapter,
    processLiveEnabled: true
  });
  assert.equal(prepared.intent.side, "SELL");
  assert.equal(prepared.position.status, "EXACT");
  assert.equal(prepared.position.longQuantity, 4);
  assert.equal(fixture.calls.at(-1), "getLongPosition");
});
