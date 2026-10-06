import assert from "node:assert/strict";
import test from "node:test";

import {
  OrderIntentValidationError,
  fingerprintOrderIntent,
  normalizeOrderIntent
} from "../../ibkr-order-service/intent.js";
import {
  FakeIbkrAdapter,
  buildProviderOrderPayload
} from "../../ibkr-order-service/fake-adapter.js";

function validIntent(overrides = {}) {
  return {
    requestId: "req-001",
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
    executionMode: "DRY_RUN",
    ...overrides
  };
}

function assertInvalid(input, pattern = /invalid/i) {
  assert.throws(
    () => normalizeOrderIntent(input),
    (error) => error instanceof OrderIntentValidationError
      && error.code === "INVALID_ORDER_INTENT"
      && pattern.test(error.message)
  );
}

test("normalizes the exact U.S. STK/USD/SMART LMT contract", () => {
  const normalized = normalizeOrderIntent(validIntent({
    instrument: {
      symbol: "aapl",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    }
  }));

  assert.deepEqual(normalized, {
    requestId: "req-001",
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
    executionMode: "DRY_RUN"
  });
});

test("supports SELL MKT and forbids limitPrice on market orders", () => {
  const input = validIntent({
    side: "SELL",
    quantity: 2.5,
    orderType: "MKT",
    tif: "GTC",
    executionMode: "LIVE"
  });
  delete input.limitPrice;

  assert.deepEqual(normalizeOrderIntent(input), input);
  assertInvalid({ ...input, limitPrice: 10 }, /limitPrice/);
});

test("requires limitPrice to be positive and finite for LMT", () => {
  for (const limitPrice of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const input = validIntent({ limitPrice });
    if (limitPrice === undefined) delete input.limitPrice;
    assertInvalid(input, /limitPrice/);
  }
});

test("requires positive finite quantity", () => {
  for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
    assertInvalid(validIntent({ quantity }), /quantity/);
  }
});

test("rejects missing or extra object keys", () => {
  const missingRequestId = validIntent();
  delete missingRequestId.requestId;
  assertInvalid(missingRequestId, /keys/);

  assertInvalid(validIntent({ surprise: true }), /keys/);
  assertInvalid(validIntent({
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART",
      accountId: "SYNTHETIC-ACCOUNT"
    }
  }), /instrument.*keys/);
});

test("rejects unsupported enums and casing", () => {
  const cases = [
    ["secType", { instrument: { symbol: "AAPL", secType: "stk", currency: "USD", exchange: "SMART" } }],
    ["currency", { instrument: { symbol: "AAPL", secType: "STK", currency: "usd", exchange: "SMART" } }],
    ["exchange", { instrument: { symbol: "AAPL", secType: "STK", currency: "USD", exchange: "smart" } }],
    ["side", { side: "buy" }],
    ["orderType", { orderType: "lmt" }],
    ["tif", { tif: "day" }],
    ["executionMode", { executionMode: "dry_run" }]
  ];

  for (const [field, overrides] of cases) {
    assertInvalid(validIntent(overrides), new RegExp(field));
  }
});

test("bounds requestId and symbol and rejects control characters", () => {
  assertInvalid(validIntent({ requestId: "r".repeat(129) }), /requestId/);
  assertInvalid(validIntent({ requestId: " leading-space" }), /requestId/);
  assertInvalid(validIntent({ requestId: "bad\nkey" }), /requestId/);
  assertInvalid(validIntent({
    instrument: {
      symbol: "A".repeat(33),
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    }
  }), /symbol/);
});

test("intent fingerprint is canonical and excludes the idempotency key", () => {
  const first = normalizeOrderIntent(validIntent());
  const reordered = normalizeOrderIntent({
    executionMode: "DRY_RUN",
    tif: "DAY",
    limitPrice: 100,
    orderType: "LMT",
    quantity: 1,
    side: "BUY",
    instrument: {
      exchange: "SMART",
      currency: "USD",
      secType: "STK",
      symbol: "aapl"
    },
    requestId: "different-request-key"
  });

  assert.equal(fingerprintOrderIntent(first), fingerprintOrderIntent(reordered));
  assert.notEqual(
    fingerprintOrderIntent(first),
    fingerprintOrderIntent(normalizeOrderIntent(validIntent({ quantity: 2 })))
  );
  assert.match(fingerprintOrderIntent(first), /^[a-f0-9]{64}$/);
});

test("shapes exact synthetic provider payloads for BUY LMT and SELL MKT", () => {
  const buy = normalizeOrderIntent(validIntent());
  assert.deepEqual(buildProviderOrderPayload(buy, { conid: 900000001 }), {
    conid: 900000001,
    side: "BUY",
    orderType: "LMT",
    quantity: 1,
    tif: "DAY",
    price: 100
  });

  const sellInput = validIntent({ side: "SELL", orderType: "MKT", tif: "GTC", quantity: 3 });
  delete sellInput.limitPrice;
  const sell = normalizeOrderIntent(sellInput);
  assert.deepEqual(buildProviderOrderPayload(sell, { conid: 900000002 }), {
    conid: 900000002,
    side: "SELL",
    orderType: "MKT",
    quantity: 3,
    tif: "GTC"
  });
});

test("fake adapter produces deterministic synthetic what-if-style preview evidence", async () => {
  const adapter = new FakeIbkrAdapter();
  const intent = normalizeOrderIntent(validIntent());

  const first = await adapter.previewOrder(intent);
  const second = await adapter.previewOrder(intent);

  assert.deepEqual(first, second);
  assert.equal(first.kind, "SYNTHETIC_WHAT_IF");
  assert.equal(first.status, "ACCEPTED");
  assert.equal(first.providerPayload.side, "BUY");
  assert.equal(first.providerPayload.price, 100);
  assert.equal(first.synthetic, true);
  assert.deepEqual(adapter.getCallCounts(), {
    resolveInstrument: 2,
    previewOrder: 2,
    submitOrder: 0
  });
});
