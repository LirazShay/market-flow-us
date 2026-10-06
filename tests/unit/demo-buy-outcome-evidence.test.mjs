import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_BUY_OUTCOME_EVIDENCE_STATUS,
  DEMO_BUY_POST_WINDOW_MS,
  deriveDemoBuyOutcomeEvidenceStatus
} from "../../shared/demo-buy/outcome-evidence.js";

test("Demo Buy outcome evidence completes only when persisted watermark reaches the full post window", () => {
  const capturedAtMs = 1000;
  const postWindowEndMs = capturedAtMs + DEMO_BUY_POST_WINDOW_MS;

  assert.equal(
    deriveDemoBuyOutcomeEvidenceStatus(null, postWindowEndMs),
    DEMO_BUY_OUTCOME_EVIDENCE_STATUS.PARTIAL
  );
  assert.equal(
    deriveDemoBuyOutcomeEvidenceStatus(postWindowEndMs - 1, postWindowEndMs),
    DEMO_BUY_OUTCOME_EVIDENCE_STATUS.PARTIAL
  );
  assert.equal(
    deriveDemoBuyOutcomeEvidenceStatus(postWindowEndMs, postWindowEndMs),
    DEMO_BUY_OUTCOME_EVIDENCE_STATUS.COMPLETE
  );
  assert.equal(
    deriveDemoBuyOutcomeEvidenceStatus(postWindowEndMs + 1, postWindowEndMs),
    DEMO_BUY_OUTCOME_EVIDENCE_STATUS.COMPLETE
  );
});

test("Demo Buy outcome evidence rejects invalid authority timestamps", () => {
  assert.throws(
    () => deriveDemoBuyOutcomeEvidenceStatus(-1, 1000),
    /evidenceWatermarkMs/
  );
  assert.throws(
    () => deriveDemoBuyOutcomeEvidenceStatus(1000, -1),
    /postWindowEndMs/
  );
  assert.throws(
    () => deriveDemoBuyOutcomeEvidenceStatus(1.5, 1000),
    /evidenceWatermarkMs/
  );
});
