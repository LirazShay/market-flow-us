import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createResearchJobController } from "../../research-server/job-control.js";
import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_44444444-4444-4444-8444-444444444444";
const QUEUED_JOB_ID = "job_55555555-5555-4555-8555-555555555555";
const RUNNING_JOB_ID = "job_66666666-6666-4666-8666-666666666666";
const SUCCESS_JOB_ID = "job_77777777-7777-4777-8777-777777777777";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function createRun(ledgerPath) {
  const ledger = await openResearchLedger({
    dbPath: ledgerPath,
    now: () => 1_810_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({ userIntent: "Bounded cancellation proof." });
  } finally {
    await ledger.close();
  }
}

async function createJob(jobs, jobId, clientRequestId) {
  return await jobs.createJob({
    researchRunId: RUN_ID,
    operation: "execute_development_experiment",
    clientRequestId,
    intent: {
      jobIdWitness: jobId,
      sourceId: "primary"
    }
  });
}

test("TREE 11.4 queued cancellation is durable, idempotent and never starts work", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-job-cancel-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let nowMs = 1_810_000_001_000;
  let jobs = null;

  try {
    await createRun(ledgerPath);
    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => nowMs,
      jobIdFactory: () => QUEUED_JOB_ID
    });
    const queued = await createJob(jobs, QUEUED_JOB_ID, "cancel-before-start");
    const controller = createResearchJobController({ jobLedger: jobs });

    nowMs = 1_810_000_002_000;
    const firstCancel = await controller.cancelJob(RUN_ID, queued.jobId);
    assert.equal(firstCancel.accepted, true);
    assert.equal(firstCancel.reason, "CANCELLED_BEFORE_START");
    assert.equal(firstCancel.job.status, "CANCELLED");
    assert.equal(firstCancel.job.startedAtMs, null);
    assert.equal(firstCancel.job.finishedAtMs, nowMs);
    assert.equal(firstCancel.job.errorCode, null);

    const repeated = await controller.cancelJob(RUN_ID, queued.jobId);
    assert.equal(repeated.accepted, true);
    assert.equal(repeated.reason, "ALREADY_CANCELLED");
    assert.deepEqual(repeated.job, firstCancel.job);

    let workCalls = 0;
    await assert.rejects(
      controller.runJob({
        researchRunId: RUN_ID,
        jobId: queued.jobId,
        async work() {
          workCalls += 1;
        }
      }),
      /cannot start from CANCELLED/u
    );
    assert.equal(workCalls, 0);

    await jobs.close();
    jobs = null;
    nowMs = 1_810_000_003_000;
    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => nowMs,
      jobIdFactory: () => {
        throw new Error("reopen must not allocate a Job ID");
      }
    });
    const reopened = await jobs.getJob(RUN_ID, QUEUED_JOB_ID);
    assert.equal(reopened.status, "CANCELLED");
    assert.equal(reopened.startedAtMs, null);
    assert.equal(reopened.finishedAtMs, 1_810_000_002_000);
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 running cancellation propagates once, stops future units and cannot become success", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-job-cancel-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let nowMs = 1_810_000_010_000;
  let jobs = null;

  try {
    await createRun(ledgerPath);
    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => nowMs,
      jobIdFactory: () => RUNNING_JOB_ID
    });
    const job = await createJob(jobs, RUNNING_JOB_ID, "cancel-running");
    const controller = createResearchJobController({ jobLedger: jobs });
    const activeUnit = deferred();
    const workStarted = deferred();
    const units = [];
    let interruptCalls = 0;
    let successCommits = 0;

    const runPromise = controller.runJob({
      researchRunId: RUN_ID,
      jobId: job.jobId,
      async work(context) {
        units.push("unit-1");
        context.setCancelHandler(() => {
          interruptCalls += 1;
          activeUnit.resolve();
        });
        workStarted.resolve();
        await activeUnit.promise;
        context.checkpoint();
        units.push("unit-2");
        return "partial-output-must-not-succeed";
      },
      async commitSuccess(value) {
        successCommits += 1;
        return value;
      }
    });

    await workStarted.promise;
    assert.equal(controller.isActive(RUN_ID, job.jobId), true);
    const running = await jobs.getJob(RUN_ID, job.jobId);
    assert.equal(running.status, "RUNNING");
    assert.equal(running.startedAtMs, 1_810_000_010_000);

    nowMs = 1_810_000_011_000;
    const cancellation = await controller.cancelJob(RUN_ID, job.jobId);
    assert.equal(cancellation.accepted, true);
    assert.equal(cancellation.reason, "CANCELLATION_REQUESTED");
    assert.equal(cancellation.job.status, "RUNNING");

    await assert.rejects(
      runPromise,
      (error) => error?.code === "RESEARCH_JOB_CANCELLED"
    );

    const cancelled = await jobs.getJob(RUN_ID, job.jobId);
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.startedAtMs, 1_810_000_010_000);
    assert.equal(cancelled.finishedAtMs, 1_810_000_011_000);
    assert.equal(cancelled.errorCode, null);
    assert.deepEqual(units, ["unit-1"]);
    assert.equal(interruptCalls, 1);
    assert.equal(successCommits, 0);
    assert.equal(controller.isActive(RUN_ID, job.jobId), false);

    const repeated = await controller.cancelJob(RUN_ID, job.jobId);
    assert.equal(repeated.accepted, true);
    assert.equal(repeated.reason, "ALREADY_CANCELLED");
    assert.equal(interruptCalls, 1);
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 cancellation wins after compute but before durable success and terminal success rejects later cancel", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-job-cancel-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let nowMs = 1_810_000_020_000;
  let jobs = null;
  const ids = [RUNNING_JOB_ID, SUCCESS_JOB_ID];

  try {
    await createRun(ledgerPath);
    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => nowMs,
      jobIdFactory: () => ids.shift()
    });
    const cancelRaceJob = await createJob(jobs, RUNNING_JOB_ID, "cancel-before-commit");
    const successJob = await createJob(jobs, SUCCESS_JOB_ID, "complete-success");
    const controller = createResearchJobController({ jobLedger: jobs });
    const computeFinished = deferred();
    const releaseCompute = deferred();
    let successCommits = 0;

    const cancelledRun = controller.runJob({
      researchRunId: RUN_ID,
      jobId: cancelRaceJob.jobId,
      async work() {
        computeFinished.resolve();
        await releaseCompute.promise;
        return "computed";
      },
      async commitSuccess(value) {
        successCommits += 1;
        return value;
      }
    });

    await computeFinished.promise;
    nowMs = 1_810_000_021_000;
    const cancellation = await controller.cancelJob(RUN_ID, cancelRaceJob.jobId);
    assert.equal(cancellation.accepted, true);
    releaseCompute.resolve();
    await assert.rejects(cancelledRun, (error) => error?.code === "RESEARCH_JOB_CANCELLED");
    assert.equal(successCommits, 0);
    assert.equal((await jobs.getJob(RUN_ID, cancelRaceJob.jobId)).status, "CANCELLED");

    nowMs = 1_810_000_022_000;
    const success = await controller.runJob({
      researchRunId: RUN_ID,
      jobId: successJob.jobId,
      async work() {
        return "complete";
      },
      async commitSuccess(value) {
        successCommits += 1;
        return `${value}-durable`;
      }
    });
    assert.equal(success.value, "complete-durable");
    assert.equal(success.job.status, "SUCCEEDED");
    assert.equal(success.job.finishedAtMs, 1_810_000_022_000);
    assert.equal(successCommits, 1);

    const tooLate = await controller.cancelJob(RUN_ID, successJob.jobId);
    assert.equal(tooLate.accepted, false);
    assert.equal(tooLate.reason, "ALREADY_TERMINAL");
    assert.equal(tooLate.job.status, "SUCCEEDED");
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
