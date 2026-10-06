import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDemoBuyCaptureTiming,
  validateDemoBuyCapturePayload
} from "../../shared/demo-buy/capture.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import {
  DEMO_BUY_MAX_CAPTURE_ITEMS,
  DEMO_BUY_MAX_SOURCE_SQL_BYTES
} from "../../shared/demo-buy/limits.js";

function payloadForRows(rows, overrides = {}) {
  const columns = [
    { name: "security_id", type: "VARCHAR" },
    { name: "score", type: "DOUBLE" }
  ];
  const context = shapeDemoBuyScannerContext({ columns, rows });
  return {
    items: rows.slice(0, Math.min(rows.length, DEMO_BUY_MAX_CAPTURE_ITEMS)).map((row, index) => ({
      securityId: row[0],
      resultRank: index + 1
    })),
    sourceQuery: {
      queryId: "user:alpha",
      name: "Alpha",
      sql: "SELECT security_id, score FROM latest ORDER BY score DESC, security_id",
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs: 1000,
      completedAtMs: 1100,
      rowCount: rows.length,
      context
    },
    selectionMode: "all",
    isAutomatic: false,
    topX: null,
    ...overrides
  };
}

test("capture validation preserves exact ordered items and immutable provenance without a buy price", () => {
  const payload = payloadForRows([
    ["101", 9.5],
    ["202", 8.5]
  ]);
  const validated = validateDemoBuyCapturePayload(payload);

  assert.deepEqual(validated.items, [
    { securityId: "101", resultRank: 1 },
    { securityId: "202", resultRank: 2 }
  ]);
  assert.equal(validated.sourceQuery.sql, payload.sourceQuery.sql);
  assert.equal(validated.sourceResult.context, payload.sourceResult.context);
  assert.equal(Object.hasOwn(validated.items[0], "price"), false);
});

test("capture validation rejects duplicate identity/rank, rank repair, invalid mode and Top X range", () => {
  const base = payloadForRows([
    ["101", 9.5],
    ["202", 8.5],
    ["303", 7.5]
  ]);

  assert.throws(() => validateDemoBuyCapturePayload({
    ...base,
    items: [
      { securityId: "101", resultRank: 1 },
      { securityId: "101", resultRank: 2 }
    ]
  }), /duplicate/i);

  assert.throws(() => validateDemoBuyCapturePayload({
    ...base,
    items: [
      { securityId: "202", resultRank: 2 },
      { securityId: "101", resultRank: 1 }
    ]
  }), /strictly increasing/i);

  assert.throws(() => validateDemoBuyCapturePayload({
    ...base,
    selectionMode: "manual",
    isAutomatic: true
  }), /automatic/i);

  assert.throws(() => validateDemoBuyCapturePayload({
    ...base,
    items: [{ securityId: "303", resultRank: 3 }],
    selectionMode: "top_x",
    topX: 2
  }), /Top X/i);
});

test("capture validation enforces context position/identity integrity only inside retained first 50 rows", () => {
  const rows = Array.from({ length: 51 }, (_, index) => [`S${index + 1}`, 100 - index]);
  const base = payloadForRows(rows);

  const mismatched = structuredClone(base);
  mismatched.items = [{ securityId: "WRONG", resultRank: 1 }];
  assert.throws(() => validateDemoBuyCapturePayload(mismatched), /identity does not match/i);

  const outsideContext = structuredClone(base);
  outsideContext.items = [{ securityId: "S51", resultRank: 51 }];
  assert.doesNotThrow(() => validateDemoBuyCapturePayload(outsideContext));
});

test("capture validation accepts 5000 items exactly and rejects limit plus one", () => {
  const exactRows = Array.from(
    { length: DEMO_BUY_MAX_CAPTURE_ITEMS },
    (_, index) => [`S${index + 1}`, index]
  );
  const exact = payloadForRows(exactRows);
  assert.equal(validateDemoBuyCapturePayload(exact).items.length, DEMO_BUY_MAX_CAPTURE_ITEMS);

  const plusOneRows = [...exactRows, ["S5001", 5001]];
  const plusOne = payloadForRows(plusOneRows);
  plusOne.items = plusOneRows.map((row, index) => ({
    securityId: row[0],
    resultRank: index + 1
  }));
  assert.throws(() => validateDemoBuyCapturePayload(plusOne), /item count/i);
});

test("capture SQL provenance accepts exact 1 MiB UTF-8 and rejects limit plus one", () => {
  const base = payloadForRows([["101", 1]]);
  const exact = {
    ...base,
    sourceQuery: {
      ...base.sourceQuery,
      sql: "x".repeat(DEMO_BUY_MAX_SOURCE_SQL_BYTES)
    }
  };
  assert.doesNotThrow(() => validateDemoBuyCapturePayload(exact));

  assert.throws(() => validateDemoBuyCapturePayload({
    ...exact,
    sourceQuery: {
      ...exact.sourceQuery,
      sql: `${exact.sourceQuery.sql}x`
    }
  }), /provenance bound/i);
});

test("wall-clock regressions preserve raw authority inputs and null only derived timing diagnostics", () => {
  assert.deepEqual(deriveDemoBuyCaptureTiming({
    sourceResultStartedAtMs: 200,
    sourceResultCompletedAtMs: 150,
    capturedAtMs: 140,
    baselineCollectedAtMs: 160
  }), {
    scannerDurationMs: null,
    captureLatencyMs: null,
    baselineAgeMs: null,
    timingAnomaly: "SCANNER_CLOCK_REGRESSION|CAPTURE_CLOCK_REGRESSION|BASELINE_CLOCK_REGRESSION"
  });

  assert.deepEqual(deriveDemoBuyCaptureTiming({
    sourceResultStartedAtMs: 100,
    sourceResultCompletedAtMs: 120,
    capturedAtMs: 150,
    baselineCollectedAtMs: 140
  }), {
    scannerDurationMs: 20,
    captureLatencyMs: 30,
    baselineAgeMs: 10,
    timingAnomaly: null
  });
});
