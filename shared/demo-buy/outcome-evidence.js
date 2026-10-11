export const DEMO_BUY_DEFAULT_HORIZONS_MS = Object.freeze([
  10000,
  20000,
  30000,
  45000,
  60000,
  90000,
  120000
]);

export const DEMO_BUY_OPTIONAL_HORIZONS_MS = Object.freeze([
  180000,
  300000,
  600000
]);

export const DEMO_BUY_HORIZONS_MS = Object.freeze([
  ...DEMO_BUY_DEFAULT_HORIZONS_MS,
  ...DEMO_BUY_OPTIONAL_HORIZONS_MS
]);

export const DEMO_BUY_POST_WINDOW_MS = 10 * 60 * 1000;

export const DEMO_BUY_OUTCOME_EVIDENCE_STATUS = Object.freeze({
  PARTIAL: "PARTIAL_OUTCOME",
  COMPLETE: "COMPLETE_OUTCOME"
});

function assertNullableFiniteNumber(value, name) {
  if (value === null) return;
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be null or a finite number.`);
  }
}

function assertNullableFutureCycleId(value) {
  if (value === null) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("futureCycleId must be null or a positive safe integer.");
  }
}

export function deriveDemoBuyHorizonOutcome({
  baselinePrice,
  futureCycleId,
  futurePrice
}) {
  assertNullableFiniteNumber(baselinePrice, "baselinePrice");
  assertNullableFutureCycleId(futureCycleId);
  assertNullableFiniteNumber(futurePrice, "futurePrice");

  let unavailableReason = null;
  if (futureCycleId === null) {
    unavailableReason = "NO_FUTURE_OBSERVATION";
  } else if (baselinePrice === null) {
    unavailableReason = "BASELINE_PRICE_UNAVAILABLE";
  } else if (baselinePrice === 0) {
    unavailableReason = "BASELINE_PRICE_ZERO";
  } else if (futurePrice === null) {
    unavailableReason = "FUTURE_PRICE_UNAVAILABLE";
  }

  if (unavailableReason !== null) {
    return Object.freeze({
      changePercent: null,
      outcome: "UNAVAILABLE",
      unavailableReason
    });
  }

  const changePercent = ((futurePrice / baselinePrice) - 1) * 100;
  return Object.freeze({
    changePercent,
    outcome: changePercent > 0
      ? "UP"
      : changePercent < 0
        ? "DOWN"
        : "FLAT",
    unavailableReason: null
  });
}

export function deriveDemoBuyOutcomeEvidenceStatus(evidenceWatermarkMs, postWindowEndMs) {
  if (!Number.isSafeInteger(postWindowEndMs) || postWindowEndMs < 0) {
    throw new TypeError("postWindowEndMs must be a non-negative safe integer.");
  }
  if (
    evidenceWatermarkMs !== null
    && (!Number.isSafeInteger(evidenceWatermarkMs) || evidenceWatermarkMs < 0)
  ) {
    throw new TypeError("evidenceWatermarkMs must be null or a non-negative safe integer.");
  }

  return evidenceWatermarkMs !== null && evidenceWatermarkMs >= postWindowEndMs
    ? DEMO_BUY_OUTCOME_EVIDENCE_STATUS.COMPLETE
    : DEMO_BUY_OUTCOME_EVIDENCE_STATUS.PARTIAL;
}
