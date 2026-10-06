export const DEMO_BUY_POST_WINDOW_MS = 10 * 60 * 1000;

export const DEMO_BUY_OUTCOME_EVIDENCE_STATUS = Object.freeze({
  PARTIAL: "PARTIAL_OUTCOME",
  COMPLETE: "COMPLETE_OUTCOME"
});

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
