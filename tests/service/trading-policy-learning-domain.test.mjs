import assert from "node:assert/strict";
import test from "node:test";

import { createTradingDomain } from "../../trading-server/domain.js";

const BASELINE_RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const CANDIDATE_RUN_ID = "trun_22222222-2222-4222-8222-222222222222";
const BASELINE_POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const CANDIDATE_POLICY_ID = "pol_22222222-2222-4222-8222-222222222222";
const BASELINE_EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const CANDIDATE_EPISODE_ID = "tep_22222222-2222-4222-8222-222222222222";
const NOW = 1_900_600_000_000;

const POLICY = Object.freeze({
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: Object.freeze({ enterOnUsableQuote: true, maxWatchMs: 30_000 }),
  exit: Object.freeze({ takeProfitBps: 100, stopLossBps: 50, maxHoldMs: 120_000 })
});

function completedBundle({
  tradingRunId,
  policyVersionId,
  tradeEpisodeId,
  baselinePrice,
  laterPrice,
  offset
}) {
  return Object.freeze({
    episode: Object.freeze({
      tradingRunId,
      policyVersionId,
      tradeEpisodeId,
      lifecycleState: "COMPLETED",
      candidateKey: `NASDAQ:SYN${offset}`,
      completedAtMs: NOW + offset + 20
    }),
    observations: Object.freeze([
      Object.freeze({
        candidateObservationId: `obs_${String(offset).padStart(8, "0")}-1111-4111-8111-111111111111`,
        observedAtMs: NOW + offset + 1,
        observation: Object.freeze({ last: baselinePrice })
      }),
      Object.freeze({
        candidateObservationId: `obs_${String(offset + 1).padStart(8, "0")}-2222-4222-8222-222222222222`,
        observedAtMs: NOW + offset + 2,
        observation: Object.freeze({ last: laterPrice })
      })
    ]),
    decisions: Object.freeze([]),
    orderReferences: Object.freeze([]),
    positionStates: Object.freeze([]),
    outcome: Object.freeze({
      episodeOutcomeId: `out_${String(offset).padStart(8, "0")}-3333-4333-8333-333333333333`,
      reasonCode: "SYNTHETIC_COMPLETE",
      outcome: Object.freeze({ status: "CLOSED" }),
      evidence: Object.freeze({ source: "synthetic-policy-learning-domain" })
    })
  });
}

function learningLedgerStub() {
  const calls = [];
  const runs = new Map([
    [BASELINE_RUN_ID, Object.freeze({
      tradingRunId: BASELINE_RUN_ID,
      policyVersionId: BASELINE_POLICY_ID,
      mode: "DRY_RUN",
      lifecycleState: "COMPLETED"
    })],
    [CANDIDATE_RUN_ID, Object.freeze({
      tradingRunId: CANDIDATE_RUN_ID,
      policyVersionId: CANDIDATE_POLICY_ID,
      mode: "DRY_RUN",
      lifecycleState: "COMPLETED"
    })]
  ]);
  const bundles = new Map([
    [`${BASELINE_RUN_ID}:${BASELINE_EPISODE_ID}`, completedBundle({
      tradingRunId: BASELINE_RUN_ID,
      policyVersionId: BASELINE_POLICY_ID,
      tradeEpisodeId: BASELINE_EPISODE_ID,
      baselinePrice: 100,
      laterPrice: 99,
      offset: 10
    })],
    [`${CANDIDATE_RUN_ID}:${CANDIDATE_EPISODE_ID}`, completedBundle({
      tradingRunId: CANDIDATE_RUN_ID,
      policyVersionId: CANDIDATE_POLICY_ID,
      tradeEpisodeId: CANDIDATE_EPISODE_ID,
      baselinePrice: 100,
      laterPrice: 101,
      offset: 20
    })]
  ]);

  return {
    calls,
    schemaVersion: 1,
    async getTradingRun(tradingRunId) {
      calls.push(["getTradingRun", tradingRunId]);
      return runs.get(tradingRunId) ?? null;
    },
    async listTradingRuns() {
      return Object.freeze([...runs.values()]);
    },
    async listTradeEpisodes(tradingRunId) {
      return Object.freeze([...bundles.values()]
        .filter((bundle) => bundle.episode.tradingRunId === tradingRunId)
        .map((bundle) => bundle.episode));
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeBundle", tradingRunId, tradeEpisodeId]);
      return bundles.get(`${tradingRunId}:${tradeEpisodeId}`) ?? null;
    }
  };
}

function comparisonInput() {
  return {
    baseline: {
      tradingRunId: BASELINE_RUN_ID,
      tradeEpisodeIds: [BASELINE_EPISODE_ID]
    },
    candidate: {
      tradingRunId: CANDIDATE_RUN_ID,
      tradeEpisodeIds: [CANDIDATE_EPISODE_ID]
    },
    minimumConclusiveEpisodes: 1
  };
}

test("TREE 12.8 Trading Domain derives five-layer attribution from durable episode authority", async () => {
  const ledger = learningLedgerStub();
  const domain = createTradingDomain({ ledger, now: () => NOW });

  const attribution = await domain.getTradeEpisodeAttribution(
    CANDIDATE_RUN_ID,
    CANDIDATE_EPISODE_ID
  );

  assert.equal(attribution.tradeEpisodeId, CANDIDATE_EPISODE_ID);
  assert.equal(attribution.policyVersionId, CANDIDATE_POLICY_ID);
  assert.equal(attribution.layers.scanner.outcome, "SUCCESS");
  assert.equal(attribution.layers.entry.outcome, "INCONCLUSIVE");
  assert.equal(attribution.layers.fill.outcome, "NOT_APPLICABLE");
  assert.equal(
    ledger.calls.some(([name, runId, episodeId]) => (
      name === "getTradeEpisodeBundle"
      && runId === CANDIDATE_RUN_ID
      && episodeId === CANDIDATE_EPISODE_ID
    )),
    true
  );
});

test("TREE 12.8 policy comparison is exact, bounded, compact and reproducible from durable episode IDs", async () => {
  const domain = createTradingDomain({ ledger: learningLedgerStub(), now: () => NOW });
  const first = await domain.comparePolicyVersions(comparisonInput());
  const second = await domain.comparePolicyVersions(comparisonInput());

  assert.deepEqual(second, first);
  assert.match(first.evidenceRef, /^policy-attribution-comparison:sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(first.baseline.episodeIds, [BASELINE_EPISODE_ID]);
  assert.deepEqual(first.candidate.episodeIds, [CANDIDATE_EPISODE_ID]);
  assert.equal(first.comparison.layers.scanner.status, "COMPARABLE");
  assert.equal(first.comparison.layers.scanner.deltaSuccessRate, 1);
  assert.equal(first.baseline.summary.layers.scanner.evidenceRefCount > 0, true);
  assert.equal(first.candidate.summary.layers.scanner.evidenceRefCount > 0, true);
  assert.equal(Object.hasOwn(first.baseline.summary.layers.scanner, "evidenceRefs"), false);
  assert.equal(Object.hasOwn(first.candidate.summary.layers.scanner, "evidenceRefs"), false);
});

test("TREE 12.8 PolicyCandidate build binds learning evidence and creation time to server-derived comparison authority", async () => {
  const domain = createTradingDomain({ ledger: learningLedgerStub(), now: () => NOW });
  const result = await domain.buildPolicyCandidate({
    ...comparisonInput(),
    policyCandidateId: "pcand-domain-1",
    claimScope: "EXECUTION_ONLY",
    policy: POLICY
  });

  assert.equal(result.candidate.createdAtMs, NOW);
  assert.equal(result.candidate.baselinePolicyVersionId, BASELINE_POLICY_ID);
  assert.deepEqual(result.candidate.learningEvidenceRefs, [result.learningComparison.evidenceRef]);
  assert.equal(result.assessment.status, "NO_PROMOTION");
  assert.deepEqual(result.assessment.reasons, ["VALIDATION_MISSING:EPISODE_ATTRIBUTION"]);

  await assert.rejects(
    domain.buildPolicyCandidate({
      ...comparisonInput(),
      policyCandidateId: "pcand-spoofed",
      claimScope: "EXECUTION_ONLY",
      policy: POLICY,
      learningEvidenceRefs: ["client-authored:pass"]
    }),
    /learningEvidenceRefs.*not supported/iu
  );
});

test("TREE 12.8 policy comparison rejects unbounded or duplicate episode selections before evidence loading", async () => {
  const ledger = learningLedgerStub();
  const domain = createTradingDomain({ ledger, now: () => NOW });

  await assert.rejects(
    domain.comparePolicyVersions({
      ...comparisonInput(),
      baseline: {
        tradingRunId: BASELINE_RUN_ID,
        tradeEpisodeIds: Array.from({ length: 26 }, (_, index) => `tep-${index}`)
      }
    }),
    /between 1 and 25/iu
  );
  await assert.rejects(
    domain.comparePolicyVersions({
      ...comparisonInput(),
      candidate: {
        tradingRunId: CANDIDATE_RUN_ID,
        tradeEpisodeIds: [CANDIDATE_EPISODE_ID, CANDIDATE_EPISODE_ID]
      }
    }),
    /unique/iu
  );
});
