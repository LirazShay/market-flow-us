import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_ID = "run_88888888-8888-4888-8888-888888888888";
const JOB_ONE = "job_88888888-8888-4888-8888-888888888881";
const JOB_TWO = "job_88888888-8888-4888-8888-888888888882";
const RESULT_ONE = "res_88888888-8888-4888-8888-888888888881";
const RESULT_TWO = "res_88888888-8888-4888-8888-888888888882";

function budgetSnapshot({ serverRows = 0, runRows = 0, jobRows = 0, requestRows = 0 } = {}) {
  function view(scope, rowLimit, rowConsumed) {
    return {
      scope,
      dimensions: {
        workUnits: { limit: 10, consumed: 1, remaining: 9 },
        t0Evaluations: { limit: 10, consumed: 0, remaining: 10 },
        resultRows: { limit: rowLimit, consumed: rowConsumed, remaining: rowLimit - rowConsumed },
        resultBytes: { limit: 10_000, consumed: 0, remaining: 10_000 }
      }
    };
  }
  return [
    view("SERVER", 2, serverRows),
    view("RUN", 1, runRows),
    view("JOB", 1, jobRows),
    view("REQUEST", 1, requestRows)
  ];
}

async function createRun(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_910_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({ userIntent: "Prove restart-safe result budgets." });
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

async function setInitialProgress(jobs, jobId) {
  return await jobs.updateJobProgress(RUN_ID, jobId, {
    completedUnits: 0,
    totalUnits: 1,
    resultHandles: [],
    budget: budgetSnapshot()
  });
}

function resultInput(jobId) {
  return {
    researchRunId: RUN_ID,
    sourceJobId: jobId,
    resultKind: "RESEARCH_SQL_RESULT",
    columns: [{ name: "value", type: "INTEGER", nullable: false }],
    rows: [{ value: 1 }],
    provenance: { purpose: "restart-budget-proof" }
  };
}

test("TREE 11.4 durable result-row budget rejects post-restart result creation before a handle is committed", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-result-budget-restart-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const ids = [JOB_ONE, JOB_TWO];
  let jobs = null;
  let results = null;

  try {
    await createRun(dbPath);
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_910_000_001_000,
      jobIdFactory: () => ids.shift()
    });
    await createRunningJob(jobs, JOB_ONE, "result-budget-1");
    await setInitialProgress(jobs, JOB_ONE);
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_910_000_001_100,
      resultHandleFactory: () => RESULT_ONE
    });
    const first = await results.createResult(resultInput(JOB_ONE));
    assert.equal(first.resultHandle, RESULT_ONE);
    await results.close();
    results = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_910_000_001_200,
      reconcileInterrupted: false,
      jobIdFactory: () => { throw new Error("result reservation must not allocate a Job ID"); }
    });
    const firstAfterReservation = await jobs.getJob(RUN_ID, JOB_ONE);
    assert.equal(firstAfterReservation.progress.budget[1].dimensions.resultRows.consumed, 1);
    assert.equal(firstAfterReservation.progress.budget[2].dimensions.resultRows.consumed, 1);
    await jobs.markJobFailed(RUN_ID, JOB_ONE, "RESEARCH_JOB_FAILED");
    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_910_000_002_000,
      jobIdFactory: () => ids.shift()
    });
    await createRunningJob(jobs, JOB_TWO, "result-budget-2");
    const secondInitial = await setInitialProgress(jobs, JOB_TWO);
    assert.equal(secondInitial.progress.budget[1].dimensions.resultRows.consumed, 1);
    assert.equal(secondInitial.progress.budget[1].dimensions.resultRows.remaining, 0);
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_910_000_002_100,
      resultHandleFactory: () => RESULT_TWO
    });
    await assert.rejects(
      results.createResult(resultInput(JOB_TWO)),
      (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
        && error?.dimension === "resultRows"
        && error?.exhaustedScope === "RUN"
    );
    assert.equal(await results.getResult(RUN_ID, RESULT_TWO), null);
  } finally {
    if (results) await results.close();
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
