import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ResearchBudgetExceededError,
  ResearchConcurrencyLimitError,
  createResearchResourceGovernor
} from "../../research-server/resource-governor.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const RUN_C = "run_33333333-3333-4333-8333-333333333333";
const RUN_D = "run_44444444-4444-4444-8444-444444444444";
const JOB_A1 = "job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const JOB_A2 = "job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const JOB_B1 = "job_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const JOB_C1 = "job_cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const JOB_D1 = "job_dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

function governor(overrides = {}) {
  return createResearchResourceGovernor({
    concurrency: {
      maxActiveJobs: 2,
      maxQueuedJobs: 2,
      maxActiveJobsPerRun: 1,
      maxAnalyticalReaders: 2,
      maxAnalyticalReadersPerRun: 1,
      maxAnalyticalReadersPerJob: 1,
      ...overrides.concurrency
    },
    budgets: {
      server: { expensiveUnits: 12, queryCount: 12, ...overrides.budgets?.server },
      run: { expensiveUnits: 8, queryCount: 8, ...overrides.budgets?.run },
      job: { expensiveUnits: 6, queryCount: 6, ...overrides.budgets?.job }
    }
  });
}

function byScope(snapshot) {
  return new Map(snapshot.map((entry) => [entry.scope, entry]));
}

test("TREE 11.4 budget consumption is atomic across request, SQL, job, run and server scopes", () => {
  const resources = governor();
  const job = resources.createJobBudget({ researchRunId: RUN_A, jobId: JOB_A1 });
  const request = job.createScope({
    kind: "REQUEST",
    limits: { expensiveUnits: 4, queryCount: 4 }
  });
  const sql = request.createScope({
    kind: "SQL_ANALYSIS",
    limits: { expensiveUnits: 2, queryCount: 2 }
  });

  sql.consume("expensiveUnits", 2);
  const after = byScope(sql.snapshot());
  assert.deepEqual(after.get("SQL_ANALYSIS").dimensions.expensiveUnits, {
    limit: 2,
    consumed: 2,
    remaining: 0
  });
  assert.deepEqual(after.get("REQUEST").dimensions.expensiveUnits, {
    limit: 4,
    consumed: 2,
    remaining: 2
  });
  assert.deepEqual(after.get("JOB").dimensions.expensiveUnits, {
    limit: 6,
    consumed: 2,
    remaining: 4
  });
  assert.deepEqual(after.get("RUN").dimensions.expensiveUnits, {
    limit: 8,
    consumed: 2,
    remaining: 6
  });
  assert.deepEqual(after.get("SERVER").dimensions.expensiveUnits, {
    limit: 12,
    consumed: 2,
    remaining: 10
  });

  assert.throws(
    () => sql.consume("expensiveUnits", 1),
    (error) => {
      assert.ok(error instanceof ResearchBudgetExceededError);
      assert.equal(error.code, "RESEARCH_BUDGET_EXCEEDED");
      assert.equal(error.dimension, "expensiveUnits");
      assert.equal(error.amount, 1);
      assert.equal(error.exhaustedScope, "SQL_ANALYSIS");
      const errorScopes = byScope(error.budgets);
      assert.equal(errorScopes.get("SQL_ANALYSIS").dimensions.expensiveUnits.consumed, 2);
      assert.equal(errorScopes.get("JOB").dimensions.expensiveUnits.consumed, 2);
      assert.equal(errorScopes.get("SERVER").dimensions.expensiveUnits.consumed, 2);
      return true;
    }
  );

  const unchanged = byScope(job.snapshot());
  assert.equal(unchanged.get("JOB").dimensions.expensiveUnits.consumed, 2);
  assert.equal(unchanged.get("RUN").dimensions.expensiveUnits.consumed, 2);
  assert.equal(unchanged.get("SERVER").dimensions.expensiveUnits.consumed, 2);
});

test("TREE 11.4 parent budgets cannot be bypassed by separate jobs or lower-level scopes", () => {
  const resources = governor({
    budgets: {
      server: { expensiveUnits: 5, queryCount: 12 },
      run: { expensiveUnits: 5, queryCount: 8 },
      job: { expensiveUnits: 5, queryCount: 6 }
    }
  });
  const first = resources.createJobBudget({ researchRunId: RUN_A, jobId: JOB_A1 });
  const second = resources.createJobBudget({ researchRunId: RUN_B, jobId: JOB_B1 });

  first.consume("expensiveUnits", 3);
  second.consume("expensiveUnits", 2);

  assert.throws(
    () => first.consume("expensiveUnits", 1),
    (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
      && error.exhaustedScope === "SERVER"
      && byScope(error.budgets).get("SERVER").dimensions.expensiveUnits.remaining === 0
  );

  assert.throws(
    () => first.createScope({
      kind: "REQUEST",
      limits: { expensiveUnits: 6, queryCount: 6 }
    }),
    /cannot exceed its parent limit/u
  );
});

test("TREE 11.4 heavy-job queue is bounded and dispatches fairly around per-run saturation", async () => {
  const resources = governor();
  const a1 = await resources.acquireJob({ researchRunId: RUN_A, jobId: JOB_A1 });
  const b1 = await resources.acquireJob({ researchRunId: RUN_B, jobId: JOB_B1 });

  const a2Promise = resources.acquireJob({ researchRunId: RUN_A, jobId: JOB_A2 });
  const c1Promise = resources.acquireJob({ researchRunId: RUN_C, jobId: JOB_C1 });

  await assert.rejects(
    resources.acquireJob({ researchRunId: RUN_D, jobId: JOB_D1 }),
    (error) => error instanceof ResearchConcurrencyLimitError && error.code === "RESEARCH_QUEUE_FULL"
  );

  assert.equal(resources.snapshot({ researchRunId: RUN_A, jobId: JOB_A1 }).queuedJobs, 2);

  b1.release();
  const c1 = await c1Promise;
  assert.equal(c1.researchRunId, RUN_C);
  assert.equal(resources.snapshot({ researchRunId: RUN_A, jobId: JOB_A1 }).queuedJobs, 1);

  let a2Settled = false;
  a2Promise.then(() => { a2Settled = true; });
  await Promise.resolve();
  assert.equal(a2Settled, false, "same-run queued job must not bypass maxActiveJobsPerRun");

  c1.release();
  await Promise.resolve();
  assert.equal(a2Settled, false, "free global capacity is insufficient while the run remains saturated");

  a1.release();
  const a2 = await a2Promise;
  assert.equal(a2.researchRunId, RUN_A);
  assert.equal(resources.snapshot({ researchRunId: RUN_A, jobId: JOB_A2 }).queuedJobs, 0);
  a2.release();
});

test("TREE 11.4 queued admission can be cancelled and releases queue capacity", async () => {
  const resources = governor({
    concurrency: {
      maxActiveJobs: 1,
      maxQueuedJobs: 1,
      maxActiveJobsPerRun: 1
    }
  });
  const active = await resources.acquireJob({ researchRunId: RUN_A, jobId: JOB_A1 });
  const abort = new AbortController();
  const queued = resources.acquireJob({
    researchRunId: RUN_B,
    jobId: JOB_B1,
    signal: abort.signal
  });
  assert.equal(resources.snapshot({ researchRunId: RUN_A, jobId: JOB_A1 }).queuedJobs, 1);

  abort.abort();
  await assert.rejects(
    queued,
    (error) => error?.code === "RESEARCH_QUEUE_CANCELLED"
  );
  assert.equal(resources.snapshot({ researchRunId: RUN_A, jobId: JOB_A1 }).queuedJobs, 0);

  const c1Promise = resources.acquireJob({ researchRunId: RUN_C, jobId: JOB_C1 });
  active.release();
  const c1 = await c1Promise;
  c1.release();
});

test("TREE 11.4 analytical reader leases enforce global, run and job bounds and release idempotently", () => {
  const resources = governor();
  const a1 = resources.acquireAnalyticalReader({ researchRunId: RUN_A, jobId: JOB_A1 });

  assert.throws(
    () => resources.acquireAnalyticalReader({ researchRunId: RUN_A, jobId: JOB_A1 }),
    (error) => error?.code === "RESEARCH_CONCURRENCY_LIMIT"
  );
  assert.throws(
    () => resources.acquireAnalyticalReader({ researchRunId: RUN_A, jobId: JOB_A2 }),
    (error) => error?.code === "RESEARCH_CONCURRENCY_LIMIT"
  );

  const b1 = resources.acquireAnalyticalReader({ researchRunId: RUN_B, jobId: JOB_B1 });
  assert.equal(resources.snapshot({ researchRunId: RUN_B, jobId: JOB_B1 }).activeAnalyticalReaders, 2);
  assert.throws(
    () => resources.acquireAnalyticalReader({ researchRunId: RUN_C, jobId: JOB_C1 }),
    (error) => error?.code === "RESEARCH_CONCURRENCY_LIMIT"
  );

  a1.release();
  a1.release();
  const c1 = resources.acquireAnalyticalReader({ researchRunId: RUN_C, jobId: JOB_C1 });
  assert.equal(resources.snapshot({ researchRunId: RUN_C, jobId: JOB_C1 }).activeAnalyticalReaders, 2);
  b1.release();
  c1.release();
  assert.equal(resources.snapshot({ researchRunId: RUN_C, jobId: JOB_C1 }).activeAnalyticalReaders, 0);
});
