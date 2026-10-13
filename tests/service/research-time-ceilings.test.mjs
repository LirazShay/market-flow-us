import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { DUCKDB_HARDENING } from "../../local-service/database/database.js";
import { createResearchJobController } from "../../research-server/job-control.js";
import {
  RESEARCH_QUEUE_WAIT_TIMEOUT_ENV,
  createResearchResourceGovernor,
  resolveResearchQueueWaitTimeoutMs
} from "../../research-server/resource-governor.js";
import {
  RESEARCH_SQL_TIMEOUT_ENV,
  openDevelopmentResearchSqlSession,
  resolveResearchSqlTimeoutMs
} from "../../research-server/research-sql-session.js";

const RUN_A = "run_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_B = "run_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB_A = "job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_B = "job_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PARTITION_ID = "part_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "plan_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVENTORY_ID = "inv_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function concurrency(overrides = {}) {
  return {
    maxActiveJobs: 1,
    maxQueuedJobs: 1,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1,
    ...overrides
  };
}

function budgets() {
  return {
    server: { workUnits: 10 },
    run: { workUnits: 10 },
    job: { workUnits: 10 }
  };
}

function fakeJobLedger() {
  let job = Object.freeze({
    researchRunId: RUN_A,
    jobId: JOB_A,
    status: "QUEUED",
    errorCode: null
  });
  return Object.freeze({
    async getJob() {
      return job;
    },
    async markJobRunning() {
      job = Object.freeze({ ...job, status: "RUNNING" });
      return job;
    },
    async markJobSucceeded() {
      job = Object.freeze({ ...job, status: "SUCCEEDED", errorCode: null });
      return job;
    },
    async markJobFailed(_researchRunId, _jobId, errorCode) {
      job = Object.freeze({ ...job, status: "FAILED", errorCode });
      return job;
    },
    async finalizeJobCancelled() {
      job = Object.freeze({ ...job, status: "CANCELLED", errorCode: null });
      return job;
    },
    snapshot() {
      return job;
    }
  });
}

function hardeningResult() {
  const settings = {
    ...DUCKDB_HARDENING,
    allowed_configs: "[]",
    lock_configuration: "true"
  };
  return {
    rowCount: 1,
    columns: Object.keys(settings).map((name) => ({ name, type: "VARCHAR" })),
    rows: [Object.values(settings)]
  };
}

function fakeInterruptibleSandbox() {
  let activeReject = null;
  let interruptCalls = 0;
  let closeCalls = 0;
  let closed = false;

  return {
    sandbox: Object.freeze({
      dataSurfaceVersion: "research-data-surface-v1",
      phase: "DEVELOPMENT",
      describeSchema() {
        return { relations: [] };
      },
      async execute(sql) {
        if (sql.includes("current_setting(")) return hardeningResult();
        if (closed) throw new Error("fake sandbox is closed");
        return await new Promise((resolve, reject) => {
          activeReject = reject;
        });
      },
      interrupt() {
        interruptCalls += 1;
        const reject = activeReject;
        activeReject = null;
        reject?.(new Error("fake DuckDB interrupt"));
      },
      async close() {
        if (closed) return;
        closed = true;
        closeCalls += 1;
      }
    }),
    stats() {
      return { interruptCalls, closeCalls, closed };
    }
  };
}

test("TREE 11.4 queue wait has a configurable finite timeout and preserves caller cancellation semantics", async () => {
  assert.equal(
    resolveResearchQueueWaitTimeoutMs({}, { [RESEARCH_QUEUE_WAIT_TIMEOUT_ENV]: "17" }),
    17
  );
  const resources = createResearchResourceGovernor({
    concurrency: concurrency({ maxQueueWaitMs: 25 }),
    budgets: budgets()
  });
  assert.equal(resources.maxQueueWaitMs, 25);

  const active = await resources.acquireJob({ researchRunId: RUN_A, jobId: JOB_A });
  const started = performance.now();
  await assert.rejects(
    resources.acquireJob({ researchRunId: RUN_B, jobId: JOB_B }),
    (error) => error?.code === "RESEARCH_QUEUE_TIMEOUT"
  );
  assert.ok(performance.now() - started < 1_000, "queue deadline must remain a finite failure ceiling");

  const abort = new AbortController();
  const queued = resources.acquireJob({ researchRunId: RUN_B, jobId: JOB_B, signal: abort.signal });
  abort.abort();
  await assert.rejects(queued, (error) => error?.code === "RESEARCH_QUEUE_CANCELLED");
  active.release();
});

test("TREE 11.4 stable work failures are persisted instead of being collapsed to RESEARCH_JOB_FAILED", async () => {
  const ledger = fakeJobLedger();
  const controller = createResearchJobController({ jobLedger: ledger });
  await assert.rejects(
    controller.runJob({
      researchRunId: RUN_A,
      jobId: JOB_A,
      async work() {
        const error = new Error("bounded SQL timeout");
        error.code = "RESEARCH_SQL_TIMEOUT";
        throw error;
      }
    }),
    (error) => error?.code === "RESEARCH_SQL_TIMEOUT"
  );
  assert.equal(ledger.snapshot().status, "FAILED");
  assert.equal(ledger.snapshot().errorCode, "RESEARCH_SQL_TIMEOUT");
});

test("TREE 11.4 Research SQL timeout closes the session through the proven interrupt seam", async () => {
  assert.equal(
    resolveResearchSqlTimeoutMs(undefined, { [RESEARCH_SQL_TIMEOUT_ENV]: "19" }),
    19
  );
  const fake = fakeInterruptibleSandbox();
  const session = await openDevelopmentResearchSqlSession({
    dataDir: "unused-by-fake-sandbox",
    researchRunId: RUN_A,
    partitionId: PARTITION_ID,
    experimentIds: [],
    sqlTimeoutMs: 25,
    verifySourceFingerprint: async () => undefined,
    getPartition: async () => ({
      partitionId: PARTITION_ID,
      evidencePlanId: PLAN_ID,
      role: "DEVELOPMENT"
    }),
    getEvidencePlan: async () => ({
      evidencePlanId: PLAN_ID,
      evidenceInventoryId: INVENTORY_ID
    }),
    getEvidenceInventory: async () => ({ evidenceInventoryId: INVENTORY_ID }),
    reconstructExperiment: async () => {
      throw new Error("no Experiment reconstruction expected");
    },
    openSandbox: async () => fake.sandbox
  });

  assert.equal(session.sqlTimeoutMs, 25);
  const started = performance.now();
  await assert.rejects(
    session.execute("SELECT 1 AS value"),
    (error) => error?.code === "RESEARCH_SQL_TIMEOUT"
  );
  assert.ok(performance.now() - started < 1_000, "SQL timeout must remain a finite failure ceiling");
  assert.deepEqual(fake.stats(), { interruptCalls: 1, closeCalls: 1, closed: true });
  await session.close();
});
