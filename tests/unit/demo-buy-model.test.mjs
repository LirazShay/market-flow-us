import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_BUY_HORIZON_LABELS,
  DEMO_BUY_VIEW_STATE,
  applyDemoBuyContinuation,
  applyDemoBuyContinuationError,
  applyDemoBuyFirstPage,
  applyDemoBuyFirstPageError,
  applyDemoBuyObservationError,
  applyDemoBuyProvenance,
  applyDemoBuyProvenanceError,
  applyDemoBuyProvenanceLoading,
  createInitialDemoBuyModel,
  currentDemoBuyContinuation,
  demoBuyCaptureModeText,
  demoBuyHorizonProgress,
  demoBuyObservationKey,
  describeDemoBuyHorizon,
  formatDemoBuyPercent,
  formatDemoBuyPrice,
  groupDemoBuyPages,
  replaceDemoBuyObservation
} from "../../browser/viewer/demo-buy-model.js";

const HORIZONS = [...DEMO_BUY_HORIZON_LABELS.keys()];

function observation({
  captureId = 9,
  resultRank = 1,
  securityId = "1001",
  outcome = "UP",
  unavailableReason = null,
  observedCount = 10,
  capturedItemCount = 3
} = {}) {
  return Object.freeze({
    capture: Object.freeze({
      captureId,
      capturedAtMs: 100000,
      sourceQueryId: "q-1",
      sourceQueryName: "Momentum",
      sourceIntervalMs: 3000,
      sourceResultStartedAtMs: 99000,
      sourceResultCompletedAtMs: 99500,
      sourceResultRowCount: 7,
      selectionMode: "top_x",
      isAutomatic: false,
      topX: 3,
      capturedItemCount,
      scannerDurationMs: 500,
      captureLatencyMs: 500,
      timingAnomaly: null
    }),
    resultRank,
    securityId,
    buyCycleId: 5,
    baseline: Object.freeze({
      cycleId: 5,
      collectedAtMs: 99000,
      price: 100,
      symbol: `SYM${securityId}`,
      paperName: `Security ${securityId}`,
      exchangeName: "NASDAQ",
      ageMs: 1000
    }),
    timing: Object.freeze({
      scannerDurationMs: 500,
      captureLatencyMs: 500,
      baselineAgeMs: 1000,
      anomaly: null
    }),
    horizons: Object.freeze(HORIZONS.map((horizonMs, index) => Object.freeze({
      horizonMs,
      targetAtMs: 100000 + horizonMs,
      observedAtMs: index < observedCount ? 100000 + horizonMs + 500 : null,
      actualElapsedMs: index < observedCount ? horizonMs + 500 : null,
      price: index < observedCount ? 101 : null,
      changePercent: index < observedCount && unavailableReason === null ? 1 : null,
      outcome: index < observedCount ? outcome : "UNAVAILABLE",
      unavailableReason: index < observedCount ? unavailableReason : "NO_FUTURE_OBSERVATION",
      timingAnomaly: null
    })))
  });
}

function page(items, { hasMore = false, nextCursor = null } = {}) {
  return { items, hasMore, nextCursor };
}

test("Demo Buy model keeps the exact ten horizon labels and neutral Scanner-position data", () => {
  assert.deepEqual(
    [...DEMO_BUY_HORIZON_LABELS.entries()],
    [
      [10000, "10s"],
      [20000, "20s"],
      [30000, "30s"],
      [45000, "45s"],
      [60000, "60s"],
      [90000, "90s"],
      [120000, "120s"],
      [180000, "3m"],
      [300000, "5m"],
      [600000, "10m"]
    ]
  );
  assert.equal(observation({ resultRank: 1 }).resultRank, 1);
  assert.equal(demoBuyCaptureModeText(observation().capture), "Manual · Top 3");
});

test("first-page refresh replaces the pagination walk while refresh errors preserve prior trustworthy data", () => {
  let model = createInitialDemoBuyModel();
  assert.equal(model.state, DEMO_BUY_VIEW_STATE.LOADING);

  model = applyDemoBuyFirstPage(model, page([
    observation({ captureId: 9, securityId: "1001" })
  ], { hasMore: true, nextCursor: "cursor-1" }));
  model = applyDemoBuyContinuation(model, page([
    observation({ captureId: 8, securityId: "1002" })
  ]));
  assert.equal(model.pages.length, 2);

  const beforeError = model.pages;
  model = applyDemoBuyFirstPageError(model, new Error("latest unavailable"));
  assert.equal(model.state, DEMO_BUY_VIEW_STATE.READY);
  assert.equal(model.pages, beforeError);
  assert.equal(model.firstPageError, "latest unavailable");

  model = applyDemoBuyFirstPage(model, page([
    observation({ captureId: 10, securityId: "1003" })
  ]));
  assert.equal(model.pages.length, 1);
  assert.equal(model.pages[0].items[0].capture.captureId, 10);
  assert.equal(model.firstPageError, null);
});

test("first-page error without trusted data is terminal for the initial view", () => {
  const model = applyDemoBuyFirstPageError(
    createInitialDemoBuyModel(),
    new Error("cannot load")
  );
  assert.equal(model.state, DEMO_BUY_VIEW_STATE.ERROR);
  assert.equal(model.pages.length, 0);
  assert.equal(model.firstPageError, "cannot load");
});

test("Load more appends stable pages, scopes continuation failure, and repeats a continued capture header", () => {
  let model = applyDemoBuyFirstPage(
    createInitialDemoBuyModel(),
    page([
      observation({ captureId: 9, resultRank: 1, securityId: "1001" }),
      observation({ captureId: 9, resultRank: 2, securityId: "1002" })
    ], { hasMore: true, nextCursor: "cursor-a" })
  );
  assert.equal(currentDemoBuyContinuation(model), "cursor-a");

  model = applyDemoBuyContinuationError(model, new Error("next failed"));
  assert.equal(model.pages.length, 1);
  assert.equal(model.continuationError, "next failed");

  model = applyDemoBuyContinuation(model, page([
    observation({ captureId: 9, resultRank: 3, securityId: "1003" }),
    observation({ captureId: 8, resultRank: 1, securityId: "2001" })
  ]));
  const pages = groupDemoBuyPages(model);
  assert.equal(pages.length, 2);
  assert.equal(pages[1].groups[0].capture.captureId, 9);
  assert.equal(pages[1].groups[0].continued, true);
  assert.equal(pages[1].groups[1].continued, false);
  assert.equal(model.continuationError, null);
  assert.equal(currentDemoBuyContinuation(model), null);
});

test("targeted refresh replaces exactly one loaded observation and row-scoped error never discards prior values", () => {
  const first = observation({ captureId: 9, resultRank: 1, securityId: "1001", observedCount: 2 });
  const other = observation({ captureId: 9, resultRank: 2, securityId: "1002", observedCount: 1 });
  let model = applyDemoBuyFirstPage(createInitialDemoBuyModel(), page([first, other]));

  model = applyDemoBuyObservationError(model, 9, "1001", new Error("refresh failed"));
  assert.equal(model.pages[0].items[0], first);
  assert.equal(model.observationErrors[demoBuyObservationKey(9, "1001")], "refresh failed");

  const refreshed = observation({ captureId: 9, resultRank: 1, securityId: "1001", observedCount: 7 });
  model = replaceDemoBuyObservation(model, refreshed);
  assert.equal(model.pages[0].items[0], refreshed);
  assert.equal(model.pages[0].items[1], other);
  assert.equal(model.observationErrors[demoBuyObservationKey(9, "1001")], undefined);
});

test("provenance loading/error is isolated and preserves already loaded provenance", () => {
  let model = applyDemoBuyFirstPage(
    createInitialDemoBuyModel(),
    page([observation()])
  );
  model = applyDemoBuyProvenanceLoading(model, 9);
  assert.equal(model.provenance[9].state, "LOADING");
  assert.equal(model.provenance[9].data, null);

  const provenance = Object.freeze({ captureId: 9, sourceQuerySql: "SELECT 1" });
  model = applyDemoBuyProvenance(model, 9, provenance);
  model = applyDemoBuyProvenanceLoading(model, 9);
  assert.equal(model.provenance[9].state, "LOADING");
  assert.equal(model.provenance[9].data, provenance);

  model = applyDemoBuyProvenanceError(model, 9, new Error("detail unavailable"));
  assert.equal(model.provenance[9].state, "READY");
  assert.equal(model.provenance[9].data, provenance);
  assert.equal(model.provenance[9].error, "detail unavailable");
  assert.equal(model.pages.length, 1);
});

test("horizon presentation distinguishes Pending, warnings and direction without color", () => {
  const complete = observation();
  assert.deepEqual(describeDemoBuyHorizon(complete.horizons[0]), {
    kind: "up",
    primary: "UP ▲ +1.00%",
    secondary: "$101",
    observed: true
  });

  const partial = observation({ observedCount: 3 });
  assert.deepEqual(demoBuyHorizonProgress(partial), { observed: 3, total: 10 });
  assert.deepEqual(describeDemoBuyHorizon(partial.horizons[3]), {
    kind: "pending",
    primary: "Pending / ממתין",
    secondary: "",
    observed: false
  });

  const warning = observation({
    outcome: "UNAVAILABLE",
    unavailableReason: "BASELINE_PRICE_ZERO"
  });
  assert.deepEqual(describeDemoBuyHorizon(warning.horizons[0]), {
    kind: "warning",
    primary: "UNAVAILABLE ⚠",
    secondary: "baseline Price is zero",
    observed: true
  });

  const down = {
    ...complete.horizons[0],
    outcome: "DOWN",
    changePercent: -0.425,
    price: 99.575
  };
  assert.equal(describeDemoBuyHorizon(down).primary, "DOWN ▼ -0.42%");
  assert.equal(formatDemoBuyPercent(0), "0.00%");
  assert.equal(formatDemoBuyPrice(0), "$0");
});
