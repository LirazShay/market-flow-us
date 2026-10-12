import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_77777777-7777-4777-8777-777777777777";
const JOB_ONE = "job_77777777-7777-4777-8777-777777777771";
const JOB_TWO = "job_77777777-7777-4777-8777-777777777772";
const JOB_THREE = "job_77777777-7777-4777-8777-777777777773";

function budgetSnapshot({ serverConsumed, runConsumed, jobConsumed }) {
  function view(scope, limit, consumed) {
    return {
      scope,
      dimensions: {
        workUnits: {
          limit,
          consumed,
          remaining: limit - consumed
        }
      }
    };
  }
  return [
    view("SERVER", 3, serverConsumed),
    view("RUN", 2, runConsumed),
    view("JOB", 1, jobConsumed),
    view("REQUEST", 1, jobConsumed)
  ];
}

async function createRun(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_900_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({ userIntent: "Prove restart-safe resource budgets." });
  } finally {
    await ledger.close();
  }
}

async function createRunningJob(jobs, jobId, clientRequestId) {
  const created = await jobs.createJob({
    researchRunId: RUN_ID,
    operation: "execute_development_research_sql",
    clientRequestId,
    intent: { sql: "SELECT 1" }
  });
  assert.equal(created.jobId, jobId);
  return await jobs.markJobRunning(RUN_ID, jobId);
}

test("TREE 11.4 run/server budget consumption survives restart and stale governor snapshots cannot bypass it", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-budget-restart-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const ids = [JOB_ONE, JOB_TWO, JOB_THREE];
  let jobs = null;

  try {
    await createRun(dbPath);
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_900_000_001_000,
      jobIdFactory: () => ids.shift()
    });

    await createRunningJob(jobs, JOB_ONE, "budget-restart-1");
    const first = await jobs.updateJobProgress(RUN_ID, JOB_ONE, {
      completedUnits: 0,
      totalUnits: 1,
      resultHandles: [],
      budget: budgetSnapshot({ serverConsumed: 1, runConsumed: 1, jobConsumed: 1 })
    });
    assert.equal(first.progress.budget[0].dimensions.workUnits.consumed, 1);
    assert.equal(first.progress.budget[1].dimensions.workUnits.consumed, 1);
    await jobs.markJobFailed(RUN_ID, JOB_ONE, "RESEARCH_JOB_FAILED");

    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_900_000_002_000,
      jobIdFactory: () => ids.shift()
    });

    await createRunningJob(jobs, JOB_TWO, "budget-restart-2");
    const second = await jobs.updateJobProgress(RUN_ID, JOB_TWO, {
      completedUnits: 0,
      totalUnits: 1,
      resultHandles: [],
      // Simulate the in-memory governor after process restart: it only knows this process consumed one unit.
      budget: budgetSnapshot({ serverConsumed: 1, runConsumed: 1, jobConsumed: 1 })
    });
    assert.equal(second.progress.budget[0].dimensions.workUnits.consumed, 2);
    assert.equal(second.progress.budget[0].dimensions.workUnits.remaining, 1);
    assert.equal(second.progress.budget[1].dimensions.workUnits.consumed, 2);
    assert.equal(second.progress.budget[1].dimensions.workUnits.remaining, 0);
    assert.equal(second.progress.budget[2].dimensions.workUnits.consumed, 1);
    await jobs.markJobFailed(RUN_ID, JOB_TWO, "RESEARCH_JOB_FAILED");

    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_900_000_003_000,
      jobIdFactory: () => ids.shift()
    });
    await createRunningJob(jobs, JOB_THREE, "budget-restart-3");

    await assert.rejects(
      jobs.updateJobProgress(RUN_ID, JOB_THREE, {
        completedUnits: 0,
        totalUnits: 1,
        resultHandles: [],
        budget: budgetSnapshot({ serverConsumed: 1, runConsumed: 1, jobConsumed: 1 })
      }),
      (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
        && error?.dimension === "workUnits"
        && error?.exhaustedScope === "RUN"
    );

    const rejected = await jobs.getJob(RUN_ID, JOB_THREE);
    assert.deepEqual(rejected.progress, {});
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
