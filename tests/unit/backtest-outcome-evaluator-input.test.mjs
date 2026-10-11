import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKTEST_OUTCOME_ERROR_CODES,
  BacktestOutcomeEvaluationError,
  evaluateBacktestOutcomes
} from "../../backtest-lab/outcome-evaluator.js";
import {
  DEMO_BUY_DEFAULT_HORIZONS_MS,
  DEMO_BUY_HORIZONS_MS
} from "../../shared/demo-buy/outcome-evidence.js";

function expectInputInvalid(run) {
  return assert.rejects(run, (error) => {
    assert.ok(error instanceof BacktestOutcomeEvaluationError);
    assert.equal(error.code, BACKTEST_OUTCOME_ERROR_CODES.INPUT_INVALID);
    return true;
  });
}

function validRequest(overrides = {}) {
  return {
    dataDir: "unused-for-invalid-input",
    sourceId: "active",
    baselineCycleId: 7,
    requestedAtMs: 20_000,
    selectedItems: [{ returnedPosition: 1, securityId: "1001" }],
    horizonsMs: [10_000, 20_000],
    ...overrides
  };
}

test("Backtest outcome evaluator default horizons exactly reuse the Demo Buy default contract for an empty result", async () => {
  const result = await evaluateBacktestOutcomes({
    dataDir: "not-opened-for-empty-result",
    sourceId: "active",
    baselineCycleId: 7,
    requestedAtMs: 20_000,
    selectedItems: []
  });

  assert.deepEqual(result.horizonsMs, DEMO_BUY_DEFAULT_HORIZONS_MS);
  assert.deepEqual(result.horizonsMs, [
    10_000,
    20_000,
    30_000,
    45_000,
    60_000,
    90_000,
    120_000
  ]);
  assert.deepEqual(result.items, []);
});

test("Backtest outcome evaluator accepts the complete optional Demo Buy horizon set only in canonical order", async () => {
  const result = await evaluateBacktestOutcomes({
    dataDir: "not-opened-for-empty-result",
    sourceId: "active",
    baselineCycleId: 7,
    requestedAtMs: 20_000,
    selectedItems: [],
    horizonsMs: [...DEMO_BUY_HORIZONS_MS]
  });

  assert.deepEqual(result.horizonsMs, [
    10_000,
    20_000,
    30_000,
    45_000,
    60_000,
    90_000,
    120_000,
    180_000,
    300_000,
    600_000
  ]);
});

test("Backtest outcome evaluator rejects malformed, duplicate or reordered decision identity before opening evidence", async () => {
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    selectedItems: [{ returnedPosition: 0, securityId: "1001" }]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    selectedItems: [
      { returnedPosition: 2, securityId: "1001" },
      { returnedPosition: 1, securityId: "1002" }
    ]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    selectedItems: [
      { returnedPosition: 1, securityId: "1001" },
      { returnedPosition: 2, securityId: "1001" }
    ]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    selectedItems: [{ returnedPosition: 1, securityId: "" }]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    selectedItems: [{ returnedPosition: 1, securityId: "1001", extra: true }]
  })));
});

test("Backtest outcome evaluator rejects unsupported, duplicate or non-canonical horizons and unsafe target overflow", async () => {
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    horizonsMs: []
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    horizonsMs: [20_000, 10_000]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    horizonsMs: [10_000, 10_000]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    horizonsMs: [15_000]
  })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({
    requestedAtMs: Number.MAX_SAFE_INTEGER - 5_000,
    horizonsMs: [10_000]
  })));
});

test("Backtest outcome evaluator rejects invalid baseline and decision-time authority before evidence access", async () => {
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({ baselineCycleId: 0 })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({ baselineCycleId: 1.5 })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({ requestedAtMs: -1 })));
  await expectInputInvalid(() => evaluateBacktestOutcomes(validRequest({ requestedAtMs: 1.5 })));
});
