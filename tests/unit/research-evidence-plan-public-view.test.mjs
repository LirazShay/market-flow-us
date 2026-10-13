import assert from "node:assert/strict";
import test from "node:test";

import { publicEvidencePlanProposal } from "../../research-server/evidence-plan-public-view.js";

const fullProposal = Object.freeze({
  contractVersion: "research-evidence-plan-authority-v1",
  status: "PROPOSED",
  algorithmVersion: "chronological-blocks-purged-v1",
  partitionMode: "CHRONOLOGICAL_BLOCKS",
  maxHorizonMs: 60_000,
  timingToleranceMs: 0,
  purgeMs: 60_000,
  sourceOrder: Object.freeze(["archive:one"]),
  evaluationProfile: Object.freeze({
    selectionPolicy: "TOP_N",
    topX: 3,
    horizonsMs: Object.freeze([10_000, 60_000]),
    intervalValue: 1,
    intervalUnit: "seconds",
    metricProfile: Object.freeze({ contractVersion: "research-experiment-metrics-v1" })
  }),
  partitions: Object.freeze([
    Object.freeze({
      role: "DEVELOPMENT",
      partition: Object.freeze({
        sourceIds: Object.freeze(["archive:one"]),
        range: Object.freeze({ fromMs: 0, toMs: 500_000 })
      })
    }),
    Object.freeze({
      role: "VALIDATION",
      partition: Object.freeze({
        sourceIds: Object.freeze(["archive:one"]),
        range: Object.freeze({ fromMs: 600_000, toMs: 700_000 }),
        validationSchedule: Object.freeze({
          sources: Object.freeze([Object.freeze({
            sourceId: "archive:one",
            fromAtMs: 600_000,
            toAtMs: 700_000,
            intervalValue: 1,
            intervalUnit: "seconds"
          })])
        })
      })
    }),
    Object.freeze({
      role: "SEALED_HOLDOUT",
      partition: Object.freeze({
        sourceIds: Object.freeze(["archive:one"]),
        range: Object.freeze({ fromMs: 800_000, toMs: 1_000_000 }),
        holdoutSchedule: Object.freeze({
          sources: Object.freeze([Object.freeze({
            sourceId: "archive:one",
            fromAtMs: 800_000,
            toAtMs: 1_000_000,
            intervalValue: 1,
            intervalUnit: "seconds"
          })])
        })
      })
    })
  ]),
  proposalHash: "a".repeat(64)
});

test("TREE 11.5 public Evidence Plan proposal seals Holdout metadata without mutating internal authority", () => {
  const publicView = publicEvidencePlanProposal(fullProposal);

  assert.deepEqual(publicView.partitions[0], fullProposal.partitions[0]);
  assert.deepEqual(publicView.partitions[1], fullProposal.partitions[1]);
  assert.deepEqual(publicView.partitions[2], {
    role: "SEALED_HOLDOUT",
    partition: { sealed: true }
  });
  assert.equal(JSON.stringify(publicView).includes("holdoutSchedule"), false);
  assert.equal(JSON.stringify(publicView).includes("800000"), false);
  assert.equal(publicView.proposalHash, fullProposal.proposalHash);

  assert.equal(fullProposal.partitions[2].partition.holdoutSchedule.sources[0].fromAtMs, 800_000);
  assert.equal(Object.isFrozen(publicView), true);
  assert.equal(Object.isFrozen(publicView.partitions[2].partition), true);
});

test("TREE 11.5 insufficient planning decision remains reproducible and unchanged", () => {
  const insufficient = Object.freeze({
    contractVersion: "research-evidence-plan-authority-v1",
    status: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
    reasonCode: "INSUFFICIENT_CHRONOLOGICAL_SPAN",
    maxHorizonMs: 60_000,
    purgeMs: 60_000,
    sourceIds: Object.freeze(["archive:short"])
  });

  assert.deepEqual(publicEvidencePlanProposal(insufficient), insufficient);
});
