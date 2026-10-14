import assert from "node:assert/strict";
import { test } from "node:test";

import { validateTradingLiveShadowEvidence } from "../../scripts/trading-live-shadow-evidence.mjs";
import { parseEvidenceArgs } from "../../scripts/verify-trading-live-shadow-evidence.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function validReport() {
  return {
    schemaVersion: 1,
    check: "LIVE_MARKET_SHADOW_OBSERVATION",
    status: "PASS",
    reasonCode: "SHADOW_LIVE_QUOTE_ACCEPTED",
    mode: "SHADOW",
    tradingRunId: "trun_77777777-7777-4777-8777-777777777777",
    tradeEpisodeId: "tep_77777777-7777-4777-8777-777777777777",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    quote: {
      resolutionStatus: "EXACT",
      conid: 265598,
      availability: "AVAILABLE",
      staleness: "FRESH",
      usableForNewDecision: true,
      marketDataAvailability: "RpB",
      last: 221.5,
      bid: 221.49,
      ask: 221.51,
      providerUpdatedAtMs: 10_000,
      receivedAtMs: 10_050,
      reasonCode: null
    },
    decision: {
      status: "DECIDED",
      actionType: "NONE",
      reasonCode: "AI_UNAVAILABLE_FALLBACK_WAIT"
    },
    durableEvidence: {
      observations: 1,
      decisions: 1,
      orderReferences: 0
    },
    orderPath: {
      orderIntentBuilds: 0,
      brokerMutations: 0
    },
    nextStageEnabled: false,
    candidateCommit: COMMIT,
    checkoutClean: true
  };
}

test("TREE 12.9 shadow evidence verifier accepts only the exact safe read-only PASS contract", () => {
  const result = validateTradingLiveShadowEvidence(validReport(), { expectedCommit: COMMIT });

  assert.deepEqual(result, {
    schemaVersion: 1,
    check: "LIVE_MARKET_SHADOW_EVIDENCE_VERIFY",
    status: "PASS",
    candidateCommit: COMMIT,
    sourceCheck: "LIVE_MARKET_SHADOW_OBSERVATION",
    sourceStatus: "PASS",
    orderPathSafe: true,
    nextStageEnabled: false
  });
});

test("TREE 12.9 shadow evidence verifier rejects a report from another commit", () => {
  assert.throws(
    () => validateTradingLiveShadowEvidence(validReport(), {
      expectedCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }),
    (error) => error?.code === "LIVE_SHADOW_EVIDENCE_COMMIT_MISMATCH"
  );
});

test("TREE 12.9 shadow evidence verifier rejects unknown fields so private provider/account material cannot hitchhike", () => {
  assert.throws(
    () => validateTradingLiveShadowEvidence({
      ...validReport(),
      accountId: "must-not-be-accepted"
    }, { expectedCommit: COMMIT }),
    (error) => error?.code === "LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH"
  );
});

test("TREE 12.9 shadow evidence verifier rejects stale quote evidence even when the caller labels the report PASS", () => {
  const report = validReport();
  report.quote = { ...report.quote, staleness: "STALE", usableForNewDecision: false };

  assert.throws(
    () => validateTradingLiveShadowEvidence(report, { expectedCommit: COMMIT }),
    (error) => error?.code === "LIVE_SHADOW_EVIDENCE_QUOTE_NOT_ACCEPTED"
  );
});

test("TREE 12.9 shadow evidence verifier rejects any order path or attempted stage advancement", () => {
  const mutated = validReport();
  mutated.orderPath = { orderIntentBuilds: 1, brokerMutations: 0 };
  assert.throws(
    () => validateTradingLiveShadowEvidence(mutated, { expectedCommit: COMMIT }),
    (error) => error?.code === "LIVE_SHADOW_EVIDENCE_ORDER_PATH_UNSAFE"
  );

  const advanced = validReport();
  advanced.nextStageEnabled = true;
  assert.throws(
    () => validateTradingLiveShadowEvidence(advanced, { expectedCommit: COMMIT }),
    (error) => error?.code === "LIVE_SHADOW_EVIDENCE_ORDER_PATH_UNSAFE"
  );
});

test("shadow evidence verifier CLI defaults to the ignored evidence file and keeps explicit commit optional", () => {
  assert.deepEqual(parseEvidenceArgs([]), {
    reportPath: "tmp/trading-live-shadow-evidence.json",
    expectedCommit: null,
    help: false
  });
  assert.deepEqual(parseEvidenceArgs([
    "--report=tmp/custom-shadow.json",
    `--expected-commit=${COMMIT.toUpperCase()}`
  ]), {
    reportPath: "tmp/custom-shadow.json",
    expectedCommit: COMMIT,
    help: false
  });
});
