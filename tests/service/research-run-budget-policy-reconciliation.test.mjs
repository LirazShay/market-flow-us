import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchDomain } from "../../research-server/domain.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";

const RUN_ID = "run_cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 2,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({ workUnits: 20, t0Evaluations: 200, resultRows: 200, resultBytes: 200_000 }),
    run: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 100_000 }),
    job: Object.freeze({ workUnits: 5, t0Evaluations: 50, resultRows: 50, resultBytes: 50_000 }),
    request: Object.freeze({ workUnits: 5, t0Evaluations: 50, resultRows: 50, resultBytes: 50_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 3, t0Evaluations: 50, resultRows: 25, resultBytes: 25_000 })
  })
});

const EXPECTED_POLICY = Object.freeze({
  contractVersion: "research-managed-budget-policy-v1",
  budgets: Object.freeze({
    run: Object.freeze({ resultBytes: 100_000, resultRows: 100, t0Evaluations: 100, workUnits: 10 }),
    job: Object.freeze({ resultBytes: 50_000, resultRows: 50, t0Evaluations: 50, workUnits: 5 }),
    request: Object.freeze({ resultBytes: 50_000, resultRows: 50, t0Evaluations: 50, workUnits: 5 }),
    sqlAnalysis: Object.freeze({ resultBytes: 25_000, resultRows: 25, t0Evaluations: 50, workUnits: 3 })
  })
});

function managedOptions(dbPath) {
  return {
    dbPath,
    resourcePolicy: RESOURCE_POLICY,
    now: () => 1_870_000_000_000
  };
}

function assertEmptyAccounting(run) {
  assert.deepEqual(run.budgetPolicy, EXPECTED_POLICY);
  assert.deepEqual(run.budget, {
    policy: EXPECTED_POLICY,
    accountingAvailable: true,
    used: { resultBytes: 0, resultRows: 0, t0Evaluations: 0, workUnits: 0 },
    remaining: { resultBytes: 100_000, resultRows: 100, t0Evaluations: 100, workUnits: 10 }
  });
  assert.deepEqual(run.counts, { experiments: 0, analyses: 0, jobs: 0 });
}

test("TREE 11.4 legacy empty Run budgetPolicy reconciles once to managed policy and remains durable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-run-policy-reconcile-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let base = null;
  let managed = null;

  try {
    base = await openResearchDomain({
      dbPath,
      now: () => 1_860_000_000_000,
      idFactory: () => RUN_ID
    });
    const legacy = await base.createResearchRun({
      userIntent: "Legacy Run created before managed budget snapshots.",
      budgetPolicy: {},
      environmentSnapshot: {}
    });
    assert.deepEqual(legacy.budgetPolicy, {});
    await base.close();
    base = null;

    managed = await openManagedResearchDomain(managedOptions(dbPath));
    assertEmptyAccounting(await managed.getResearchRun(RUN_ID));
    assertEmptyAccounting(await managed.resumeResearchRun(RUN_ID));
    await managed.close();
    managed = null;

    base = await openResearchDomain({ dbPath, now: () => 1_880_000_000_000 });
    const persisted = await base.getResearchRun(RUN_ID);
    assert.deepEqual(persisted.budgetPolicy, EXPECTED_POLICY);
    await base.close();
    base = null;

    managed = await openManagedResearchDomain(managedOptions(dbPath));
    assertEmptyAccounting(await managed.getResearchRun(RUN_ID));
  } finally {
    if (managed) await managed.close();
    if (base) await base.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
