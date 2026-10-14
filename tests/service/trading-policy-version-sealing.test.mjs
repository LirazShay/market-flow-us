import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import { promotePolicyCandidate } from "../../trading-server/policy-promotion.js";

const DETERMINISTIC_POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const LEGACY_POLICY_ID = "pol_22222222-2222-4222-8222-222222222222";
const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const NOW = 1_900_400_000_000;

const DETERMINISTIC_POLICY = Object.freeze({
  schemaVersion: 1,
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: Object.freeze({
    enterOnUsableQuote: true,
    maxWatchMs: 30_000
  }),
  exit: Object.freeze({
    takeProfitBps: 100,
    stopLossBps: 50,
    maxHoldMs: 120_000
  })
});

const LEGACY_POLICY = Object.freeze({
  entry: Object.freeze({ minimumScannerRank: 1 }),
  exit: Object.freeze({ maxHoldMs: 120_000 })
});

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-policy-sealing-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  try {
    await fn(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("TREE 12.8 promoted deterministic PolicyVersion is immutable from creation across restart while legacy semantics remain intact", async () => {
  await withFixture(async (dbPath) => {
    const policyIds = [DETERMINISTIC_POLICY_ID, LEGACY_POLICY_ID];
    let ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => policyIds.shift(),
      tradingRunIdFactory: () => RUN_ID
    });

    const promotion = await promotePolicyCandidate({
      ledger,
      candidate: {
        policyCandidateId: "pcand-durable-seal-1",
        baselinePolicyVersionId: "baseline-policy-v1",
        createdAtMs: NOW,
        claimScope: "EXECUTION_ONLY",
        policy: DETERMINISTIC_POLICY,
        learningEvidenceRefs: ["episode-attribution:comparison-1"]
      },
      validationEvidence: [{
        authority: "EPISODE_ATTRIBUTION",
        status: "PASS",
        evidenceRef: "episode-attribution:comparison-1"
      }],
      explicitPromotion: true
    });
    assert.equal(promotion.status, "PROMOTED");
    assert.equal(promotion.policyVersion.policyVersionId, DETERMINISTIC_POLICY_ID);
    assert.deepEqual(promotion.policyVersion.policy, DETERMINISTIC_POLICY);

    const legacy = await ledger.createPolicyVersion({ policy: LEGACY_POLICY });
    assert.deepEqual(legacy.policy, LEGACY_POLICY);

    await assert.rejects(
      ledger.replacePolicyVersion(DETERMINISTIC_POLICY_ID, {
        ...DETERMINISTIC_POLICY,
        exit: { ...DETERMINISTIC_POLICY.exit, maxHoldMs: 60_000 }
      }),
      /deterministic.*immutable|immutable.*creation/iu
    );

    const legacyReplacement = {
      entry: { minimumScannerRank: 2 },
      exit: { maxHoldMs: 90_000 }
    };
    assert.deepEqual(
      (await ledger.replacePolicyVersion(LEGACY_POLICY_ID, legacyReplacement)).policy,
      legacyReplacement,
      "legacy PolicyVersion must remain replaceable before first TradingRun use"
    );

    await ledger.close();
    ledger = null;

    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW + 1_000,
      tradingRunIdFactory: () => RUN_ID
    });

    await assert.rejects(
      ledger.replacePolicyVersion(DETERMINISTIC_POLICY_ID, {
        ...DETERMINISTIC_POLICY,
        exit: { ...DETERMINISTIC_POLICY.exit, maxHoldMs: 45_000 }
      }),
      /deterministic.*immutable|immutable.*creation/iu,
      "deterministic sealing must derive from durable policy_json after reopen"
    );
    assert.deepEqual(
      (await ledger.getPolicyVersion(DETERMINISTIC_POLICY_ID)).policy,
      DETERMINISTIC_POLICY
    );

    await ledger.createTradingRun({
      policyVersionId: LEGACY_POLICY_ID,
      mode: "DRY_RUN",
      environmentSnapshot: { source: "synthetic-policy-sealing-test" },
      riskEnvelope: { maxNotionalUsd: 250 }
    });
    await assert.rejects(
      ledger.replacePolicyVersion(LEGACY_POLICY_ID, LEGACY_POLICY),
      /immutable.*Trading Run|in use/iu,
      "legacy PolicyVersion must keep the existing immutable-after-use contract"
    );

    await ledger.close();
  });
});
