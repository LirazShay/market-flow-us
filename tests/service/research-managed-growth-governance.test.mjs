import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openManagedResearchDomain } from "../../research-server/managed-domain.js";

const RUN_EXPERIMENT = "run_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const RUN_ANALYSIS = "run_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const JOB_IDS = Object.freeze([
  "job_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  "job_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
  "job_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3",
  "job_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4"
]);

const RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 8,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({ workUnits: 20, t0Evaluations: 100, resultRows: 100, resultBytes: 100_000 }),
    run: Object.freeze({ workUnits: 2, t0Evaluations: 20, resultRows: 20, resultBytes: 20_000 }),
    job: Object.freeze({ workUnits: 2, t0Evaluations: 10, resultRows: 10, resultBytes: 10_000 }),
    request: Object.freeze({ workUnits: 2, t0Evaluations: 10, resultRows: 10, resultBytes: 10_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 1, t0Evaluations: 10, resultRows: 10, resultBytes: 10_000 })
  })
});

const EXPECTED_GROWTH_LIMITS = Object.freeze({
  maxJobsPerRun: 2,
  maxExperimentSubmissionsPerRun: 2,
  maxAnalysisSubmissionsPerRun: 2,
  maxResultHandlesPerRun: 2
});

function sequence(values, label) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error(`${label} sequence exhausted`);
    return remaining.shift();
  };
}

function expectGrowthError(dimension) {
  return (error) => error?.code === "RESEARCH_BUDGET_EXCEEDED"
    && error?.dimension === dimension
    && error?.exhaustedScope === "RUN"
    && error?.amount === 1;
}

function experimentRequest(runId, clientRequestId, witness) {
  return {
    clientRequestId,
    researchRunId: runId,
    objectiveVersionId: `obj_eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${witness}`,
    partitionId: `part_eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${witness}`,
    sourceId: "active",
    queryArtifactIds: [`qry_eeeeeeee-eeee-4eee-8eee-eeeeeeeeee${witness}`],
    fromAtMs: 1_000,
    toAtMs: 1_000,
    intervalValue: 1,
    intervalUnit: "seconds",
    topX: 1,
    horizonsMs: [10_000]
  };
}

function analysisRequest(runId, clientRequestId) {
  return {
    clientRequestId,
    researchRunId: runId,
    partitionId: "part_ffffffff-ffff-4fff-8fff-ffffffffffff",
    experimentIds: [],
    sql: "SELECT 1 AS value",
    purpose: "DEBUG",
    outputMode: "PAGED_RESULT"
  };
}

test("TREE 11.4 managed growth limits are server-owned, observable and restart-stable", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-managed-growth-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let jobAllocations = 0;

  const jobIdFactory = sequence(JOB_IDS, "job id");
  const allocatingJobIdFactory = () => {
    jobAllocations += 1;
    return jobIdFactory();
  };

  try {
    await assert.rejects(
      openManagedResearchDomain({
        dbPath,
        resourcePolicy: RESOURCE_POLICY,
        growthLimits: EXPECTED_GROWTH_LIMITS
      }),
      /growthLimits is server-owned/u
    );

    domain = await openManagedResearchDomain({
      dbPath,
      now: () => 1_940_000_000_000,
      resourcePolicy: RESOURCE_POLICY,
      idFactory: sequence([RUN_EXPERIMENT, RUN_ANALYSIS], "run id"),
      jobIdFactory: allocatingJobIdFactory
    });
    assert.deepEqual(domain.resourceLimits.growth, EXPECTED_GROWTH_LIMITS);

    await domain.createResearchRun({
      userIntent: "Bound experiment submissions.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createResearchRun({
      userIntent: "Bound analysis submissions.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });

    const experimentOneRequest = experimentRequest(RUN_EXPERIMENT, "managed-growth-exp-1", "01");
    const experimentOne = await domain.submitDevelopmentExperiment(experimentOneRequest);
    await domain.submitDevelopmentExperiment(experimentRequest(
      RUN_EXPERIMENT,
      "managed-growth-exp-2",
      "02"
    ));
    assert.equal(jobAllocations, 2);
    assert.deepEqual(await domain.submitDevelopmentExperiment(experimentOneRequest), experimentOne);
    assert.equal(jobAllocations, 2, "idempotent retry must not allocate a third Job");
    await assert.rejects(
      domain.submitDevelopmentExperiment(experimentRequest(
        RUN_EXPERIMENT,
        "managed-growth-exp-3",
        "03"
      )),
      expectGrowthError("experimentSubmissions")
    );
    assert.equal(jobAllocations, 2, "experiment cap must reject before Job ID allocation");

    const analysisOneRequest = analysisRequest(RUN_ANALYSIS, "managed-growth-sql-1");
    const analysisOne = await domain.submitDevelopmentResearchSql(analysisOneRequest);
    await domain.submitDevelopmentResearchSql(analysisRequest(
      RUN_ANALYSIS,
      "managed-growth-sql-2"
    ));
    assert.equal(jobAllocations, 4);
    assert.deepEqual(await domain.submitDevelopmentResearchSql(analysisOneRequest), analysisOne);
    assert.equal(jobAllocations, 4, "idempotent SQL retry must not allocate another Job");
    await assert.rejects(
      domain.submitDevelopmentResearchSql(analysisRequest(
        RUN_ANALYSIS,
        "managed-growth-sql-3"
      )),
      expectGrowthError("analysisSubmissions")
    );
    assert.equal(jobAllocations, 4, "analysis cap must reject before Job ID allocation");

    const experimentRun = await domain.getResearchRun(RUN_EXPERIMENT);
    assert.deepEqual(experimentRun.counts, { experiments: 0, analyses: 0, jobs: 2 });
    const analysisRun = await domain.getResearchRun(RUN_ANALYSIS);
    assert.deepEqual(analysisRun.counts, { experiments: 0, analyses: 2, jobs: 2 });

    await domain.close();
    domain = null;

    domain = await openManagedResearchDomain({
      dbPath,
      now: () => 1_940_000_001_000,
      resourcePolicy: RESOURCE_POLICY,
      jobIdFactory: () => {
        throw new Error("restart cap must reject before allocating a new Job ID");
      }
    });
    assert.deepEqual(domain.resourceLimits.growth, EXPECTED_GROWTH_LIMITS);
    assert.deepEqual((await domain.getResearchRun(RUN_EXPERIMENT)).counts, {
      experiments: 0,
      analyses: 0,
      jobs: 2
    });
    assert.deepEqual((await domain.getResearchRun(RUN_ANALYSIS)).counts, {
      experiments: 0,
      analyses: 2,
      jobs: 2
    });
    assert.deepEqual(await domain.submitDevelopmentExperiment(experimentOneRequest), experimentOne);
    assert.deepEqual(await domain.submitDevelopmentResearchSql(analysisOneRequest), analysisOne);
    await assert.rejects(
      domain.submitDevelopmentExperiment(experimentRequest(
        RUN_EXPERIMENT,
        "managed-growth-exp-after-restart",
        "04"
      )),
      expectGrowthError("experimentSubmissions")
    );
    await assert.rejects(
      domain.submitDevelopmentResearchSql(analysisRequest(
        RUN_ANALYSIS,
        "managed-growth-sql-after-restart"
      )),
      expectGrowthError("analysisSubmissions")
    );
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
