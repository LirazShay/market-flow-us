import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";
import { openResearchResultLedger } from "../../research-server/result-ledger.js";

const RUN_ID = "run_dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB_EXPERIMENT = "job_dddddddd-dddd-4ddd-8ddd-dddddddddd01";
const JOB_SQL = "job_dddddddd-dddd-4ddd-8ddd-dddddddddd02";
const JOB_OVERFLOW = "job_dddddddd-dddd-4ddd-8ddd-dddddddddd03";
const RESULT_ONE = "res_dddddddd-dddd-4ddd-8ddd-dddddddddd01";
const RESULT_TWO = "res_dddddddd-dddd-4ddd-8ddd-dddddddddd02";
const RESULT_OVERFLOW = "res_dddddddd-dddd-4ddd-8ddd-dddddddddd03";

const GROWTH_LIMITS = Object.freeze({
  maxJobsPerRun: 2,
  maxExperimentSubmissionsPerRun: 1,
  maxAnalysisSubmissionsPerRun: 2,
  maxResultHandlesPerRun: 2
});

async function createRun(dbPath) {
  const ledger = await openResearchLedger({
    dbPath,
    now: () => 1_930_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({ userIntent: "Prove bounded durable ledger growth." });
  } finally {
    await ledger.close();
  }
}

function jobInput(operation, clientRequestId, witness) {
  return {
    researchRunId: RUN_ID,
    operation,
    clientRequestId,
    intent: { witness }
  };
}

function resultInput(sourceJobId, witness) {
  return {
    researchRunId: RUN_ID,
    sourceJobId,
    resultKind: "RESEARCH_SQL_RESULT",
    columns: [{ name: "value", type: "INTEGER", nullable: false }],
    rows: [{ value: witness }],
    provenance: { witness }
  };
}

function expectGrowthError(dimension) {
  return (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
    && error?.dimension === dimension
    && error?.exhaustedScope === "RUN"
    && error?.amount === 1;
}

test("TREE 11.4 durable Job/submission growth survives restart while exact retries remain idempotent at the ceiling", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-ledger-growth-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const ids = [JOB_EXPERIMENT, JOB_SQL, JOB_OVERFLOW];
  let allocations = 0;
  let jobs = null;

  const jobIdFactory = () => {
    allocations += 1;
    return ids.shift();
  };

  try {
    await createRun(dbPath);
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_930_000_001_000,
      jobIdFactory,
      growthLimits: GROWTH_LIMITS
    });

    const experimentRequest = jobInput(
      "execute_development_experiment",
      "growth-experiment-1",
      "experiment-1"
    );
    const experiment = await jobs.createJob(experimentRequest);
    assert.equal(experiment.jobId, JOB_EXPERIMENT);

    const retryAtCapacityBoundary = await jobs.createJob(experimentRequest);
    assert.deepEqual(retryAtCapacityBoundary, experiment);
    assert.equal(allocations, 1, "idempotent retry must not consume a new durable Job slot");

    await assert.rejects(
      jobs.createJob(jobInput(
        "execute_development_experiment",
        "growth-experiment-2",
        "experiment-2"
      )),
      expectGrowthError("experimentSubmissions")
    );
    assert.equal(allocations, 1, "rejected experiment submission must fail before Job ID allocation");

    const sql = await jobs.createJob(jobInput(
      "execute_development_research_sql",
      "growth-analysis-1",
      "analysis-1"
    ));
    assert.equal(sql.jobId, JOB_SQL);
    assert.equal(allocations, 2);

    await assert.rejects(
      jobs.createJob(jobInput(
        "execute_development_research_sql",
        "growth-analysis-2",
        "analysis-2"
      )),
      expectGrowthError("jobRecords")
    );
    assert.equal(allocations, 2, "full Run must reject before allocating another Job ID");
    assert.equal((await jobs.listJobs(RUN_ID)).length, 2);

    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_930_000_002_000,
      jobIdFactory,
      growthLimits: GROWTH_LIMITS
    });
    assert.deepEqual(await jobs.createJob(experimentRequest), experiment);
    await assert.rejects(
      jobs.createJob(jobInput(
        "execute_development_research_sql",
        "growth-analysis-after-restart",
        "analysis-after-restart"
      )),
      expectGrowthError("jobRecords")
    );
    assert.equal(allocations, 2, "restart must not reset durable Job growth accounting");
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 durable Result Handle count is bounded independently of result row/byte payload limits", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-result-handle-growth-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let jobs = null;
  let results = null;
  const resultIds = [RESULT_ONE, RESULT_TWO, RESULT_OVERFLOW];
  let resultAllocations = 0;

  try {
    await createRun(dbPath);
    jobs = await openResearchJobLedger({
      dbPath,
      now: () => 1_930_000_010_000,
      jobIdFactory: () => JOB_SQL
    });
    await jobs.createJob(jobInput(
      "execute_development_research_sql",
      "result-handle-source",
      "source"
    ));
    await jobs.close();
    jobs = null;

    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_930_000_011_000,
      growthLimits: GROWTH_LIMITS,
      resultHandleFactory: () => {
        resultAllocations += 1;
        return resultIds.shift();
      }
    });

    assert.equal((await results.createResult(resultInput(JOB_SQL, 1))).resultHandle, RESULT_ONE);
    assert.equal((await results.createResult(resultInput(JOB_SQL, 2))).resultHandle, RESULT_TWO);
    await assert.rejects(
      results.createResult(resultInput(JOB_SQL, 3)),
      expectGrowthError("resultHandles")
    );
    assert.equal(resultAllocations, 2, "Result cap must fail before Result Handle allocation");

    await results.close();
    results = null;
    results = await openResearchResultLedger({
      dbPath,
      now: () => 1_930_000_012_000,
      growthLimits: GROWTH_LIMITS,
      resultHandleFactory: () => {
        resultAllocations += 1;
        return resultIds.shift();
      }
    });
    await assert.rejects(
      results.createResult(resultInput(JOB_SQL, 4)),
      expectGrowthError("resultHandles")
    );
    assert.equal(resultAllocations, 2, "restart must not reset retained Result Handle count");
    assert.equal((await results.getResult(RUN_ID, RESULT_ONE)).resultHandle, RESULT_ONE);
    assert.equal((await results.getResult(RUN_ID, RESULT_TWO)).resultHandle, RESULT_TWO);
  } finally {
    if (results) await results.close();
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
