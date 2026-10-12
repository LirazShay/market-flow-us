import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OBJECTIVE_ID = "obj_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const QUERY_ID = "qry_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVENTORY_ID = "inv_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAN_ID = "plan_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PART_DEV = "part_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PART_VALIDATION = "part_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const METRIC_SET_ID = "metrics_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_EXPERIMENT = "job_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_SQL = "job_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RESULT_EXPERIMENT = "res_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESULT_SQL = "res_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const QUERY_SQL = "SELECT * FROM latest ORDER BY Price DESC LIMIT 1";

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

const RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 4,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({ workUnits: 100, t0Evaluations: 1000, resultRows: 1000, resultBytes: 1_000_000 }),
    run: Object.freeze({ workUnits: 50, t0Evaluations: 500, resultRows: 500, resultBytes: 500_000 }),
    job: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    request: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 5, t0Evaluations: 100, resultRows: 50, resultBytes: 100_000 })
  })
});

const CHANGED_POLICY = Object.freeze({
  ...RESOURCE_POLICY,
  budgets: Object.freeze({
    ...RESOURCE_POLICY.budgets,
    run: Object.freeze({ ...RESOURCE_POLICY.budgets.run, workUnits: 49 })
  })
});

function expectedBudgetPolicy() {
  return {
    contractVersion: "research-managed-budget-policy-v1",
    budgets: {
      run: { resultBytes: 500_000, resultRows: 500, t0Evaluations: 500, workUnits: 50 },
      job: { resultBytes: 250_000, resultRows: 100, t0Evaluations: 100, workUnits: 10 },
      request: { resultBytes: 250_000, resultRows: 100, t0Evaluations: 100, workUnits: 10 },
      sqlAnalysis: { resultBytes: 100_000, resultRows: 50, t0Evaluations: 100, workUnits: 5 }
    }
  };
}

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-run-observability-test-v1",
    now: () => 1_700_000_000_000
  });
  try {
    const writer = database.writerConnection;
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'run-accounting-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'run-accounting-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'run-accounting-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}'),
        (2, 'run-accounting-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

function domainOptions(tempDir, resourcePolicy = RESOURCE_POLICY) {
  return {
    dbPath: path.join(tempDir, "research-ledger.duckdb"),
    marketDataDir: tempDir,
    now: () => 1_860_000_000_000,
    resourcePolicy,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: () => QUERY_ID,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
    metricSetIdFactory: () => METRIC_SET_ID,
    jobIdFactory: sequence([JOB_EXPERIMENT, JOB_SQL]),
    resultHandleFactory: sequence([RESULT_EXPERIMENT, RESULT_SQL])
  };
}

async function waitForTerminal(domain, jobId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not reach a terminal state`);
}

function assertRunAccounting(value) {
  assert.deepEqual(value.counts, { experiments: 1, analyses: 1, jobs: 2 });
  assert.deepEqual(value.budget.policy, expectedBudgetPolicy());
  assert.equal(value.budget.accountingAvailable, true);
  assert.equal(value.budget.used.workUnits, 2);
  assert.equal(value.budget.remaining.workUnits, 48);
  assert.equal(value.budget.used.t0Evaluations, 1);
  assert.equal(value.budget.remaining.t0Evaluations, 499);
  assert.equal(value.budget.used.resultRows, 3);
  assert.equal(value.budget.remaining.resultRows, 497);
  assert.ok(value.budget.used.resultBytes > 0);
  assert.equal(
    value.budget.remaining.resultBytes,
    RESOURCE_POLICY.budgets.run.resultBytes - value.budget.used.resultBytes
  );
}

test("TREE 11.4 managed Run exposes durable budget used/remaining and experiment/analysis/job counts across restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-run-accounting-"));
  let domain = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    domain = await openManagedResearchDomain(domainOptions(tempDir));

    const created = await domain.createResearchRun({
      userIntent: "Observe durable managed research budgets.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    assert.deepEqual(created.budgetPolicy, expectedBudgetPolicy());

    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Prefer upward 10 second outcomes.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: QUERY_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "baseline"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprint,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "run-accounting-test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const experiment = await domain.submitDevelopmentExperiment({
      clientRequestId: "run-accounting-experiment",
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_DEV,
      sourceId: "active",
      queryArtifactIds: [QUERY_ID],
      fromAtMs: 2_000,
      toAtMs: 2_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [10_000]
    });
    assert.match(experiment.experimentId, /^exp_[0-9a-f-]{36}$/u);
    const experimentJob = await waitForTerminal(domain, experiment.jobId);
    assert.equal(experimentJob.status, "SUCCEEDED");
    assert.equal(experimentJob.progress.experimentId, experiment.experimentId);

    const analysis = await domain.submitDevelopmentResearchSql({
      clientRequestId: "run-accounting-sql",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [experiment.experimentId],
      sql: "SELECT security_id, Price FROM research_history ORDER BY cycle_id",
      purpose: "DEBUG",
      outputMode: "PAGED_RESULT"
    });
    assert.equal((await waitForTerminal(domain, analysis.jobId)).status, "SUCCEEDED");

    const run = await domain.getResearchRun(RUN_ID);
    assertRunAccounting(run);
    assert.deepEqual(run.budgetPolicy, expectedBudgetPolicy());

    const resumed = await domain.resumeResearchRun(RUN_ID);
    assertRunAccounting(resumed);

    await domain.close();
    domain = null;

    domain = await openManagedResearchDomain(domainOptions(tempDir));
    assertRunAccounting(await domain.getResearchRun(RUN_ID));
    assertRunAccounting(await domain.resumeResearchRun(RUN_ID));
    await domain.close();
    domain = null;

    domain = await openManagedResearchDomain(domainOptions(tempDir, CHANGED_POLICY));
    await assert.rejects(
      domain.getResearchRun(RUN_ID),
      (error) => error?.code === "RESEARCH_BUDGET_POLICY_MISMATCH"
    );
    await assert.rejects(
      domain.submitDevelopmentResearchSql({
        clientRequestId: "must-not-create-job-under-drifted-policy",
        researchRunId: RUN_ID,
        partitionId: PART_DEV,
        experimentIds: [experiment.experimentId],
        sql: "SELECT 1",
        purpose: "DEBUG",
        outputMode: "PREVIEW"
      }),
      (error) => error?.code === "RESEARCH_BUDGET_POLICY_MISMATCH"
    );
    assert.equal((await domain.listJobs(RUN_ID)).length, 2);

    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
