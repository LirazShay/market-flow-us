import assert from "node:assert/strict";
import { test } from "node:test";

import {
  POLICY_ATTRIBUTION_LAYERS,
  comparePolicyVersions,
  createEpisodeAttribution,
  summarizePolicyAttribution
} from "../../trading-server/policy-distillation.js";

const BASELINE_POLICY = "pol_11111111-1111-4111-8111-111111111111";
const CANDIDATE_POLICY = "pol_22222222-2222-4222-8222-222222222222";

function layer(outcome, evidenceRef = null) {
  return {
    outcome,
    evidenceRefs: evidenceRef === null ? [] : [evidenceRef]
  };
}

function episode({
  tradeEpisodeId,
  policyVersionId = BASELINE_POLICY,
  completedAtMs,
  scanner = layer("SUCCESS", `${tradeEpisodeId}:scanner`),
  entry = layer("SUCCESS", `${tradeEpisodeId}:entry`),
  fill = layer("SUCCESS", `${tradeEpisodeId}:fill`),
  positionManagement = layer("SUCCESS", `${tradeEpisodeId}:position`),
  exit = layer("SUCCESS", `${tradeEpisodeId}:exit`)
}) {
  return {
    tradeEpisodeId,
    policyVersionId,
    completedAtMs,
    layers: { scanner, entry, fill, positionManagement, exit }
  };
}

test("TREE 12.8 episode attribution requires all five explicit evidence-backed layers", () => {
  const value = createEpisodeAttribution(episode({
    tradeEpisodeId: "tep-a",
    completedAtMs: 10
  }));

  assert.deepEqual(Object.keys(value.layers), POLICY_ATTRIBUTION_LAYERS);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.layers.entry), true);

  const missingExit = episode({ tradeEpisodeId: "tep-b", completedAtMs: 20 });
  delete missingExit.layers.exit;
  assert.throws(
    () => createEpisodeAttribution(missingExit),
    /exactly the five attribution layers/iu
  );

  assert.throws(
    () => createEpisodeAttribution(episode({
      tradeEpisodeId: "tep-c",
      completedAtMs: 30,
      entry: layer("FAILURE")
    })),
    /requires evidence/iu
  );
});

test("TREE 12.8 attribution keeps Scanner quality separate from entry/fill/position/exit denominators", () => {
  const summary = summarizePolicyAttribution({
    policyVersionId: BASELINE_POLICY,
    episodes: [
      episode({
        tradeEpisodeId: "tep-bad-entry",
        completedAtMs: 10,
        scanner: layer("SUCCESS", "scanner:good-candidate"),
        entry: layer("FAILURE", "entry:late-entry"),
        fill: layer("NOT_APPLICABLE"),
        positionManagement: layer("NOT_APPLICABLE"),
        exit: layer("NOT_APPLICABLE")
      }),
      episode({
        tradeEpisodeId: "tep-bad-scanner",
        completedAtMs: 20,
        scanner: layer("FAILURE", "scanner:weak-candidate"),
        entry: layer("NOT_APPLICABLE"),
        fill: layer("NOT_APPLICABLE"),
        positionManagement: layer("NOT_APPLICABLE"),
        exit: layer("NOT_APPLICABLE")
      })
    ]
  });

  assert.deepEqual(summary.layers.scanner.successRate, {
    numerator: 1,
    denominator: 2,
    value: 0.5
  });
  assert.equal(summary.layers.entry.failureEpisodes, 1);
  assert.equal(summary.layers.entry.successRate.denominator, 1);
  assert.equal(summary.layers.fill.successRate.denominator, 0);
  assert.equal(summary.layers.fill.successRate.value, null);
  assert.equal(summary.layers.fill.notApplicableEpisodes, 2);
  assert.deepEqual(summary.layers.scanner.evidenceRefs, [
    "scanner:good-candidate",
    "scanner:weak-candidate"
  ]);
});

test("TREE 12.8 policy comparison is deterministic, layer-specific and never invents an aggregate winner", () => {
  const evidence = [
    episode({
      tradeEpisodeId: "tep-base-2",
      completedAtMs: 20,
      scanner: layer("FAILURE", "base2:scanner"),
      entry: layer("FAILURE", "base2:entry")
    }),
    episode({
      tradeEpisodeId: "tep-candidate-2",
      policyVersionId: CANDIDATE_POLICY,
      completedAtMs: 40,
      scanner: layer("SUCCESS", "candidate2:scanner"),
      entry: layer("SUCCESS", "candidate2:entry")
    }),
    episode({
      tradeEpisodeId: "tep-base-1",
      completedAtMs: 10
    }),
    episode({
      tradeEpisodeId: "tep-candidate-1",
      policyVersionId: CANDIDATE_POLICY,
      completedAtMs: 30
    })
  ];

  const first = comparePolicyVersions({
    baselinePolicyVersionId: BASELINE_POLICY,
    candidatePolicyVersionId: CANDIDATE_POLICY,
    episodes: evidence,
    minimumConclusiveEpisodes: 2
  });
  const second = comparePolicyVersions({
    baselinePolicyVersionId: BASELINE_POLICY,
    candidatePolicyVersionId: CANDIDATE_POLICY,
    episodes: [...evidence].reverse(),
    minimumConclusiveEpisodes: 2
  });

  assert.deepEqual(first, second);
  assert.deepEqual(first.baseline.episodeIds, ["tep-base-1", "tep-base-2"]);
  assert.deepEqual(first.candidate.episodeIds, ["tep-candidate-1", "tep-candidate-2"]);
  assert.equal(first.comparison.layers.scanner.status, "COMPARABLE");
  assert.equal(first.comparison.layers.scanner.deltaSuccessRate, 0.5);
  assert.equal(first.comparison.layers.entry.deltaSuccessRate, 0.5);
  assert.equal(Object.hasOwn(first.comparison, "winner"), false);
  assert.equal(Object.hasOwn(first.comparison, "score"), false);
});

test("TREE 12.8 insufficient evidence is an explicit comparison result rather than an inferred policy claim", () => {
  const result = comparePolicyVersions({
    baselinePolicyVersionId: BASELINE_POLICY,
    candidatePolicyVersionId: CANDIDATE_POLICY,
    episodes: [
      episode({
        tradeEpisodeId: "tep-base",
        completedAtMs: 10,
        fill: layer("NOT_APPLICABLE"),
        positionManagement: layer("NOT_APPLICABLE"),
        exit: layer("NOT_APPLICABLE")
      }),
      episode({
        tradeEpisodeId: "tep-candidate",
        policyVersionId: CANDIDATE_POLICY,
        completedAtMs: 20,
        fill: layer("NOT_APPLICABLE"),
        positionManagement: layer("NOT_APPLICABLE"),
        exit: layer("NOT_APPLICABLE")
      })
    ],
    minimumConclusiveEpisodes: 2
  });

  assert.equal(result.comparison.comparisonStatus, "INSUFFICIENT_EVIDENCE");
  for (const layerName of POLICY_ATTRIBUTION_LAYERS) {
    assert.equal(result.comparison.layers[layerName].status, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.comparison.layers[layerName].deltaSuccessRate, null);
  }
});

test("TREE 12.8 duplicate episode evidence cannot silently inflate attribution denominators", () => {
  const duplicated = episode({ tradeEpisodeId: "tep-duplicate", completedAtMs: 10 });
  assert.throws(
    () => summarizePolicyAttribution({
      policyVersionId: BASELINE_POLICY,
      episodes: [duplicated, duplicated]
    }),
    /duplicate TradeEpisode/iu
  );
});
