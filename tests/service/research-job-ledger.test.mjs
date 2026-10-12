import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openResearchJobLedger } from "../../research-server/job-ledger.js";
import { openResearchLedger } from "../../research-server/ledger.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const QUEUED_JOB_ID = "job_22222222-2222-4222-8222-222222222222";
const RUNNING_JOB_ID = "job_33333333-3333-4333-8333-333333333333";

async function createRun(ledgerPath) {
  const ledger = await openResearchLedger({
    dbPath: ledgerPath,
    now: () => 1_800_000_000_000,
    idFactory: () => RUN_ID
  });
  try {
    await ledger.createResearchRun({
      userIntent: "Find a robust short-horizon US momentum method."
    });
  } finally {
    await ledger.close();
  }
}

function expectedJob({
  jobId,
  clientRequestId,
  intent,
  status = "QUEUED",
  createdAtMs = 1_800_000_001_000,
  startedAtMs = null,
  finishedAtMs = null,
  updatedAtMs = createdAtMs,
  errorCode = null
}) {
  return {
    jobId,
    researchRunId: RUN_ID,
    operation: "execute_development_experiment",
    clientRequestId,
    intent,
    intentFingerprint: assert.match(
      "placeholder",
      /placeholder/u
    ),
    status,
    progress: {},
    errorCode,
    createdAtMs,
    startedAtMs,
    finishedAtMs,
    updatedAtMs
  };
}

function withoutFingerprint(job) {
  const { intentFingerprint, ...rest } = job;
  assert.match(intentFingerprint, /^[0-9a-f]{64}$/u);
  return rest;
}

test("TREE 11.4 durable jobs survive reopen and interrupted RUNNING work fails closed", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-jobs-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  const ids = [QUEUED_JOB_ID, RUNNING_JOB_ID];
  let jobs = null;

  try {
    await createRun(ledgerPath);

    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_001_000,
      jobIdFactory: () => ids.shift()
    });

    const queued = await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "execute_development_experiment",
      clientRequestId: "request-queued",
      intent: {
        queryArtifactIds: ["qry_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        sourceId: "primary"
      }
    });
    const running = await jobs.createJob({
      researchRunId: RUN_ID,
      operation: "execute_development_experiment",
      clientRequestId: "request-running",
      intent: {
        queryArtifactIds: ["qry_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
        sourceId: "primary"
      }
    });
    const started = await jobs.markJobRunning(RUN_ID, running.jobId);

    assert.deepEqual(withoutFingerprint(queued), {
      jobId: QUEUED_JOB_ID,
      researchRunId: RUN_ID,
      operation: "execute_development_experiment",
      clientRequestId: "request-queued",
      intent: {
        queryArtifactIds: ["qry_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        sourceId: "primary"
      },
      status: "QUEUED",
      progress: {},
      errorCode: null,
      createdAtMs: 1_800_000_001_000,
      startedAtMs: null,
      finishedAtMs: null,
      updatedAtMs: 1_800_000_001_000
    });
    assert.equal(started.status, "RUNNING");
    assert.equal(started.startedAtMs, 1_800_000_001_000);

    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_002_000,
      jobIdFactory: () => {
        throw new Error("reopen must not allocate an ID");
      }
    });

    const reopenedQueued = await jobs.getJob(RUN_ID, QUEUED_JOB_ID);
    const interrupted = await jobs.getJob(RUN_ID, RUNNING_JOB_ID);

    assert.equal(reopenedQueued.status, "QUEUED");
    assert.equal(reopenedQueued.updatedAtMs, 1_800_000_001_000);
    assert.equal(interrupted.status, "FAILED");
    assert.equal(interrupted.errorCode, "RESEARCH_JOB_INTERRUPTED");
    assert.equal(interrupted.startedAtMs, 1_800_000_001_000);
    assert.equal(interrupted.finishedAtMs, 1_800_000_002_000);
    assert.equal(interrupted.updatedAtMs, 1_800_000_002_000);

    assert.deepEqual(
      (await jobs.listJobs(RUN_ID)).map(({ jobId, status }) => ({ jobId, status })),
      [
        { jobId: QUEUED_JOB_ID, status: "QUEUED" },
        { jobId: RUNNING_JOB_ID, status: "FAILED" }
      ]
    );
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 clientRequestId retries reuse durable work and changed intent fails closed", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-jobs-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let jobs = null;
  let allocations = 0;

  const request = {
    researchRunId: RUN_ID,
    operation: "execute_development_experiment",
    clientRequestId: "retry-safe-request",
    intent: {
      sourceId: "primary",
      schedule: {
        intervalUnit: "seconds",
        intervalValue: 10
      },
      queryArtifactIds: [
        "qry_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "qry_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      ]
    }
  };

  try {
    await createRun(ledgerPath);
    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_010_000,
      jobIdFactory: () => {
        allocations += 1;
        return QUEUED_JOB_ID;
      }
    });

    const first = await jobs.createJob(request);
    const sameIntentDifferentKeyOrder = await jobs.createJob({
      ...request,
      intent: {
        queryArtifactIds: request.intent.queryArtifactIds,
        schedule: {
          intervalValue: 10,
          intervalUnit: "seconds"
        },
        sourceId: "primary"
      }
    });

    assert.deepEqual(sameIntentDifferentKeyOrder, first);
    assert.equal(allocations, 1);

    await jobs.close();
    jobs = null;

    jobs = await openResearchJobLedger({
      dbPath: ledgerPath,
      now: () => 1_800_000_011_000,
      jobIdFactory: () => {
        allocations += 1;
        return RUNNING_JOB_ID;
      }
    });

    const retryAfterReopen = await jobs.createJob(request);
    assert.deepEqual(retryAfterReopen, first);
    assert.equal(allocations, 1);

    await assert.rejects(
      jobs.createJob({
        ...request,
        intent: {
          ...request.intent,
          sourceId: "changed-source"
        }
      }),
      (error) => error?.code === "RESEARCH_IDEMPOTENCY_CONFLICT"
    );
    assert.equal(allocations, 1);
    assert.equal((await jobs.listJobs(RUN_ID)).length, 1);
  } finally {
    if (jobs) await jobs.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
