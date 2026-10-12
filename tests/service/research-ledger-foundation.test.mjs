import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  RESEARCH_LEDGER_SCHEMA_VERSION,
  openResearchLedger
} from "../../research-server/ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";

function expectedRun() {
  return {
    researchRunId: RUN_ID,
    userIntent: "Find a robust short-horizon US momentum method.",
    status: "ACTIVE",
    currentPhase: "DEVELOPMENT",
    budgetPolicy: {
      maxExperiments: 120
    },
    environmentSnapshot: {
      productVersion: "0.1.0",
      nodeVersion: "24.x"
    },
    createdAtMs: 1_800_000_000_000,
    updatedAtMs: 1_800_000_000_000
  };
}

test("TREE 11.1 research ledger bootstraps separately and Research Run survives reopen", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-ledger-"));
  const ledgerPath = path.join(tempDir, "research", "research-ledger.duckdb");
  const marketPath = path.join(tempDir, "market-authority.duckdb");
  const marketSentinel = Buffer.from("synthetic-market-authority-must-not-change", "utf8");
  let ledger = null;

  try {
    await writeFile(marketPath, marketSentinel);

    ledger = await openResearchLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_000_000,
      idFactory: () => RUN_ID
    });

    assert.equal(ledger.schemaVersion, RESEARCH_LEDGER_SCHEMA_VERSION);
    assert.equal(await ledger.getResearchRun(RUN_ID), null);
    assert.deepEqual(await ledger.listResearchRuns(), []);

    const created = await ledger.createResearchRun({
      userIntent: "Find a robust short-horizon US momentum method.",
      currentPhase: "DEVELOPMENT",
      budgetPolicy: {
        maxExperiments: 120
      },
      environmentSnapshot: {
        productVersion: "0.1.0",
        nodeVersion: "24.x"
      }
    });
    assert.deepEqual(created, expectedRun());
    assert.deepEqual(await ledger.getResearchRun(RUN_ID), expectedRun());
    assert.deepEqual(await ledger.listResearchRuns(), [expectedRun()]);

    await ledger.close();
    ledger = null;

    ledger = await openResearchLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_000_500,
      idFactory: () => "run_22222222-2222-4222-8222-222222222222"
    });

    assert.equal(ledger.schemaVersion, RESEARCH_LEDGER_SCHEMA_VERSION);
    assert.deepEqual(await ledger.getResearchRun(RUN_ID), expectedRun());
    assert.deepEqual(await ledger.listResearchRuns(), [expectedRun()]);
    assert.deepEqual(await readFile(marketPath), marketSentinel);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.1 Research Run creation validates stable identity inputs and list bounds", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-ledger-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openResearchLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_100_000,
      idFactory: () => RUN_ID
    });

    await assert.rejects(
      ledger.createResearchRun({ userIntent: "" }),
      /userIntent/u
    );
    await assert.rejects(
      ledger.createResearchRun({
        userIntent: "valid",
        currentPhase: "UNKNOWN_PHASE"
      }),
      /currentPhase/u
    );
    await assert.rejects(
      ledger.listResearchRuns({ limit: 0 }),
      /limit/u
    );

    await ledger.createResearchRun({
      userIntent: "Find a robust short-horizon US momentum method.",
      currentPhase: "DEVELOPMENT",
      budgetPolicy: { maxExperiments: 120 },
      environmentSnapshot: { productVersion: "0.1.0", nodeVersion: "24.x" }
    });

    await assert.rejects(
      ledger.createResearchRun({
        userIntent: "A duplicate generated identity must fail closed."
      })
    );
    assert.deepEqual(await ledger.listResearchRuns({ limit: 1 }), [expectedRun()]);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
