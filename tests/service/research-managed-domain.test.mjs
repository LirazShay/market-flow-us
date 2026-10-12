import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_ID = "qry_11111111-1111-4111-8111-111111111111";
const INVENTORY_ID = "inv_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const PART_DEV = "part_11111111-1111-4111-8111-111111111111";
const PART_VALIDATION = "part_22222222-2222-4222-8222-222222222222";
const EXPERIMENT_ID = "exp_11111111-1111-4111-8111-111111111111";
const METRIC_SET_ID = "metrics_11111111-1111-4111-8111-111111111111";
const JOB_EXPERIMENT = "job_11111111-1111-4111-8111-111111111111";
const JOB_SQL = "job_22222222-2222-4222-8222-222222222222";
const RESULT_EXPERIMENT = "res_11111111-1111-4111-8111-111111111111";
const RESULT_SQL = "res_22222222-2222-4222-8222-222222222222";
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

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-managed-domain-test-v1",
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
        (1, 'managed-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'managed-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'managed-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}'),
        (2, 'managed-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001","ExtraSignal":9}')
    `);
  } finally {
    await database.close();
  }
}

async function waitForTerminal(domain, researchRunId, jobId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(researchRunId, jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not reach a terminal state`);
}

function terminalDiagnostic(job) {
  return JSON.stringify({
    status: job.status,
    errorCode: job.errorCode,
    progress: job.progress
  });
}

function jobResultHandle(job) {
  assert.equal(job.progress.completedUnits, 1);
  assert.equal(job.progress.totalUnits, 1);
  assert.equal(job.progress.resultHandles.length, 1);
  return job.progress.resultHandles[0].resultHandle;
}

test("TREE 11.4 managed Research Domain composes jobs, budgets, durable progress and result handles around 11.2/11.3", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-managed-research-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    domain = await openManagedResearchDomain({
      dbPath,
      marketDataDir: tempDir,
      now: () => 1_860_000_000_000,
      resourcePolicy: RESOURCE_POLICY,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
      experimentIdFactory: () => EXPERIMENT_ID,
      metricSetIdFactory: () => METRIC_SET_ID,
      jobIdFactory: sequence([JOB_EXPERIMENT, JOB_SQL]),
      resultHandleFactory: sequence([RESULT_EXPERIMENT, RESULT_SQL])
    });

    assert.deepEqual(domain.schemaVersions, {
      ledger: 1,
      evidence: 1,
      experiments: 1,
      memory: 1,
      jobs: 1,
      results: 1
    });

    await domain.createResearchRun({
      userIntent: "Research short-horizon momentum.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
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
      plan: { algorithmVersion: "managed-domain-test-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const submittedExperiment = await domain.submitDevelopmentExperiment({
      clientRequestId: "managed-experiment-1",
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
    assert.equal(submittedExperiment.jobId, JOB_EXPERIMENT);

    const experimentJob = await waitForTerminal(domain, RUN_ID, JOB_EXPERIMENT);
    assert.equal(experimentJob.status, "SUCCEEDED", terminalDiagnostic(experimentJob));
    assert.equal(experimentJob.errorCode, null);
    assert.equal(experimentJob.cancellationPossible, false);
    assert.equal(experimentJob.progress.experimentId, EXPERIMENT_ID);
    assert.ok(experimentJob.progress.budget.some((scope) => scope.scope === "RUN"));
    const experimentResultHandle = jobResultHandle(experimentJob);
    assert.equal(experimentResultHandle, RESULT_EXPERIMENT);
    const experimentPage = await domain.getResultPage(RUN_ID, RESULT_EXPERIMENT, { pageSize: 10 });
    assert.equal(experimentPage.rows.length, 1);
    assert.equal(experimentPage.rows[0].experimentId, EXPERIMENT_ID);

    const sqlRequest = {
      clientRequestId: "managed-sql-1",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [EXPERIMENT_ID],
      sql: "SELECT security_id, Price FROM research_history ORDER BY cycle_id",
      purpose: "DEBUG",
      outputMode: "PAGED_RESULT"
    };
    const submittedSql = await domain.submitDevelopmentResearchSql(sqlRequest);
    assert.equal(submittedSql.jobId, JOB_SQL);
    assert.match(submittedSql.analysisId, /^analysis_/u);

    const sqlJob = await waitForTerminal(domain, RUN_ID, JOB_SQL);
    assert.equal(sqlJob.status, "SUCCEEDED", terminalDiagnostic(sqlJob));
    assert.equal(sqlJob.progress.analysisId, submittedSql.analysisId);
    assert.ok(sqlJob.progress.budget.some((scope) => scope.scope === "SQL_ANALYSIS"));
    const sqlResultHandle = jobResultHandle(sqlJob);
    assert.equal(sqlResultHandle, RESULT_SQL);
    const sqlPage = await domain.getResultPage(RUN_ID, RESULT_SQL, { pageSize: 10 });
    assert.deepEqual(sqlPage.rows, [
      { Price: 100, security_id: "1001" },
      { Price: 101, security_id: "1001" }
    ]);

    const retrySql = await domain.submitDevelopmentResearchSql(sqlRequest);
    assert.deepEqual(retrySql, submittedSql);
    assert.deepEqual(await domain.getResultPage(RUN_ID, RESULT_SQL, { pageSize: 10 }), sqlPage);

    const jobs = await domain.listJobs(RUN_ID);
    assert.deepEqual(jobs.map(({ jobId, status }) => ({ jobId, status })), [
      { jobId: JOB_EXPERIMENT, status: "SUCCEEDED" },
      { jobId: JOB_SQL, status: "SUCCEEDED" }
    ]);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
