import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveHistoricalBacktestValidation } from "../../trading-server/policy-historical-validation.js";

const RESEARCH_RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const QUERY_ARTIFACT_ID = "qry_11111111-1111-4111-8111-111111111111";
const ARTIFACT_ID = "artifact_11111111-1111-4111-8111-111111111111";
const FINALIST_SET_ID = "finalist_11111111-1111-4111-8111-111111111111";

const TARGET = Object.freeze({
  researchRunId: RESEARCH_RUN_ID,
  queryArtifactId: QUERY_ARTIFACT_ID
});

function domain(artifact) {
  return {
    async getRecommendationArtifact(researchRunId) {
      assert.equal(researchRunId, RESEARCH_RUN_ID);
      return artifact;
    }
  };
}

function artifact(overrides = {}) {
  return {
    artifactId: ARTIFACT_ID,
    researchRunId: RESEARCH_RUN_ID,
    finalistSetId: FINALIST_SET_ID,
    outcome: "SELECTED_QUERY",
    confidenceClassification: "INDEPENDENT_HOLDOUT_SUPPORTED",
    selectedQuery: { queryArtifactId: QUERY_ARTIFACT_ID },
    ...overrides
  };
}

test("TREE 12.8 Research recommendation with independent Holdout support produces historical PASS only for the bound QueryArtifact", async () => {
  const pass = await resolveHistoricalBacktestValidation({
    researchDomain: domain(artifact()),
    strategyValidationTarget: TARGET
  });
  assert.deepEqual(pass, {
    validationEvidence: {
      authority: "HISTORICAL_BACKTEST",
      status: "PASS",
      evidenceRef: `research-recommendation:${ARTIFACT_ID}:query:${QUERY_ARTIFACT_ID}`
    },
    reasonCode: "HISTORICAL_SELECTED_QUERY_INDEPENDENTLY_SUPPORTED"
  });

  const mismatch = await resolveHistoricalBacktestValidation({
    researchDomain: domain(artifact({
      selectedQuery: { queryArtifactId: "qry_22222222-2222-4222-8222-222222222222" }
    })),
    strategyValidationTarget: TARGET
  });
  assert.equal(mismatch.validationEvidence.status, "FAIL");
  assert.equal(mismatch.reasonCode, "HISTORICAL_SELECTED_DIFFERENT_QUERY");
});

test("TREE 12.8 Research authority distinguishes failed Holdout recommendation from insufficient independent evidence", async () => {
  const noRecommendation = await resolveHistoricalBacktestValidation({
    researchDomain: domain(artifact({
      outcome: "NO_RECOMMENDATION",
      confidenceClassification: "INSUFFICIENT_FOR_RECOMMENDATION",
      selectedQuery: null
    })),
    strategyValidationTarget: TARGET
  });
  assert.equal(noRecommendation.validationEvidence.status, "FAIL");
  assert.equal(noRecommendation.reasonCode, "HISTORICAL_NO_RECOMMENDATION");

  const insufficient = await resolveHistoricalBacktestValidation({
    researchDomain: domain(artifact({
      finalistSetId: null,
      outcome: "NO_RECOMMENDATION",
      confidenceClassification: "INSUFFICIENT_FOR_RECOMMENDATION",
      selectedQuery: null
    })),
    strategyValidationTarget: TARGET
  });
  assert.equal(insufficient.validationEvidence.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(insufficient.reasonCode, "HISTORICAL_INSUFFICIENT_INDEPENDENT_EVIDENCE");
});

test("TREE 12.8 missing Research terminal artifact is valid insufficient evidence, never an invented PASS", async () => {
  const result = await resolveHistoricalBacktestValidation({
    researchDomain: domain(null),
    strategyValidationTarget: TARGET
  });
  assert.equal(result.validationEvidence.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.reasonCode, "HISTORICAL_TERMINAL_ARTIFACT_MISSING");
});
