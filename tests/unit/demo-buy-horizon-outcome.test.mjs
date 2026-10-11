import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_BUY_DEFAULT_HORIZONS_MS,
  DEMO_BUY_HORIZONS_MS,
  DEMO_BUY_OPTIONAL_HORIZONS_MS,
  deriveDemoBuyHorizonOutcome
} from "../../shared/demo-buy/outcome-evidence.js";

test("Demo Buy shared horizons preserve default then optional canonical order", () => {
  assert.deepEqual(DEMO_BUY_DEFAULT_HORIZONS_MS, [
    10000,
    20000,
    30000,
    45000,
    60000,
    90000,
    120000
  ]);
  assert.deepEqual(DEMO_BUY_OPTIONAL_HORIZONS_MS, [
    180000,
    300000,
    600000
  ]);
  assert.deepEqual(DEMO_BUY_HORIZONS_MS, [
    ...DEMO_BUY_DEFAULT_HORIZONS_MS,
    ...DEMO_BUY_OPTIONAL_HORIZONS_MS
  ]);
  assert.equal(Object.isFrozen(DEMO_BUY_DEFAULT_HORIZONS_MS), true);
  assert.equal(Object.isFrozen(DEMO_BUY_OPTIONAL_HORIZONS_MS), true);
  assert.equal(Object.isFrozen(DEMO_BUY_HORIZONS_MS), true);
});

test("Demo Buy shared outcome preserves unavailable-reason precedence", () => {
  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: null,
      futureCycleId: null,
      futurePrice: null
    }),
    {
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "NO_FUTURE_OBSERVATION"
    }
  );

  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: null,
      futureCycleId: 11,
      futurePrice: null
    }),
    {
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "BASELINE_PRICE_UNAVAILABLE"
    }
  );

  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: 0,
      futureCycleId: 11,
      futurePrice: null
    }),
    {
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "BASELINE_PRICE_ZERO"
    }
  );

  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 11,
      futurePrice: null
    }),
    {
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason: "FUTURE_PRICE_UNAVAILABLE"
    }
  );
});

test("Demo Buy shared outcome preserves percentage math and UP DOWN FLAT classification", () => {
  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 11,
      futurePrice: 110
    }),
    {
      changePercent: 10.000000000000009,
      outcome: "UP",
      unavailableReason: null
    }
  );

  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 11,
      futurePrice: 90
    }),
    {
      changePercent: -9.999999999999998,
      outcome: "DOWN",
      unavailableReason: null
    }
  );

  assert.deepEqual(
    deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 11,
      futurePrice: 100
    }),
    {
      changePercent: 0,
      outcome: "FLAT",
      unavailableReason: null
    }
  );
});

test("Demo Buy shared outcome rejects invalid authority values", () => {
  assert.throws(
    () => deriveDemoBuyHorizonOutcome({
      baselinePrice: Number.NaN,
      futureCycleId: 11,
      futurePrice: 100
    }),
    /baselinePrice/
  );
  assert.throws(
    () => deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 0,
      futurePrice: 100
    }),
    /futureCycleId/
  );
  assert.throws(
    () => deriveDemoBuyHorizonOutcome({
      baselinePrice: 100,
      futureCycleId: 11,
      futurePrice: Number.POSITIVE_INFINITY
    }),
    /futurePrice/
  );
});
