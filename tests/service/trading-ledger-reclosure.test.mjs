import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";

const POLICY_ID = "pol_33333333-3333-4333-8333-333333333333";
const RUN_ID = "trun_33333333-3333-4333-8333-333333333333";
const NOW = 1_900_100_000_000;

test("TREE 12.1 reopened ledger can discover durable TradingRun state without chat memory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-discovery-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_ID
    });
    await ledger.createPolicyVersion({
      policy: { entry: { minimumScannerRank: 1 } }
    });
    const created = await ledger.createTradingRun({
      policyVersionId: POLICY_ID,
      mode: "DRY_RUN",
      environmentSnapshot: { productVersion: "0.1.0", source: "synthetic" },
      riskEnvelope: { maxOpenEpisodes: 1 }
    });

    await ledger.close();
    ledger = null;

    ledger = await openTradingLedger({ dbPath, now: () => NOW + 1_000 });
    assert.deepEqual(await ledger.listTradingRuns(), [created]);
    await assert.rejects(() => ledger.listTradingRuns({ limit: 0 }), /limit/iu);
    await assert.rejects(() => ledger.listTradingRuns({ limit: 201 }), /limit/iu);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.1 public-safe persistence rejects explicit raw authenticated/provider dump fields", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-raw-dump-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID
    });

    await assert.rejects(
      ledger.createPolicyVersion({
        policy: {
          rawAuthenticatedDump: { synthetic: true }
        }
      }),
      /public-safe|sensitive|authenticated|dump/iu
    );
    await assert.rejects(
      ledger.createPolicyVersion({
        policy: {
          rawProviderDump: { synthetic: true }
        }
      }),
      /public-safe|sensitive|provider|dump/iu
    );
    assert.equal(await ledger.getPolicyVersion(POLICY_ID), null);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
