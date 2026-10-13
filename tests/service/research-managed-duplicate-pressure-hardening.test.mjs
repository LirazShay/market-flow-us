import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_91919191-9191-4191-8191-919191919191";
const OBJECTIVE_ID = "obj_91919191-9191-4191-8191-919191919191";
const QUERY_ID = "qry_91919191-9191-4191-8191-919191919191";
const INVENTORY_ID = "inv_91919191-9191-4191-8191-919191919191";
const PLAN_ID = "plan_91919191-9191-4191-8191-919191919191";
const PART_DEV = "part_91919191-9191-4191-8191-919191919191";
const PART_VALIDATION = "part_92929292-9292-4292-8292-929292929292";
const JOB_BLOCKER = "job_91919191-9191-4191-8191-919191919191";
const JOB_DUPLICATE = "job_92929292-9292-4292-8292-929292929292";
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
    maxQueuedJobs: 1,
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
    productVersion: "research-duplicate-pressure-test-v1",
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
        (1, 'duplicate-pressure', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'duplicate-pressure', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'duplicate-pressure', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}'),
        (2, 'duplicate-pressure', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

async function waitForStatus(domain, jobId, expected) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, jobId);
    if (job?.status === expected) return job;
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) {
      throw new Error(`Job ${jobId} reached ${job.status} before ${expected}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not reach ${expected}`);
}

async function waitForTerminal(domain, jobId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${jobId} did not reach a terminal state`);
}

async function waitForExecutionCount(readCount, expected) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (readCount() === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`execution count did not reach ${expected}`);
}

function experimentRequest(clientRequestId) {
  return {
    clientRequestId,
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
  };
}

test("TREE 11.7 concurrent duplicate submissions reuse one queued Job without amplifying work or queue pressure", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-duplicate-pressure-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;
  let releaseBlocker;
  const blockerGate = new Promise((resolve) => { releaseBlocker = resolve; });
  let executionCount = 0;

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
      jobIdFactory: sequence([JOB_BLOCKER, JOB_DUPLICATE]),
      executeExperimentBatch: async () => {
        executionCount += 1;
        if (executionCount === 1) {
          await blockerGate;
          const error = new Error("synthetic blocker released");
          error.code = "RESEARCH_TEST_BLOCKER_RELEASED";
          throw error;
        }
        throw new Error("duplicate queued work unexpectedly executed");
      }
    });

    await domain.createResearchRun({
      userIntent: "Prove duplicate submissions cannot amplify queue pressure.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Duplicate-pressure hardening proof.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: QUERY_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "duplicate-pressure"
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
      plan: { algorithmVersion: "duplicate-pressure-proof-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const blocker = await domain.submitDevelopmentExperiment(experimentRequest("blocker-request"));
    assert.equal(blocker.jobId, JOB_BLOCKER);
    await waitForStatus(domain, JOB_BLOCKER, "RUNNING");
    await waitForExecutionCount(() => executionCount, 1);

    const duplicates = await Promise.all(
      Array.from({ length: 32 }, () => domain.submitDevelopmentExperiment(experimentRequest("duplicate-request")))
    );
    assert.equal(new Set(duplicates.map((submission) => submission.jobId)).size, 1);
    assert.equal(duplicates[0].jobId, JOB_DUPLICATE);
    assert.equal(new Set(duplicates.map((submission) => submission.experimentId)).size, 1);

    const queued = await domain.getJob(RUN_ID, JOB_DUPLICATE);
    assert.equal(queued.status, "QUEUED");
    assert.equal(executionCount, 1, "duplicate retries must not create additional active work");

    const jobsBeforeCancel = await domain.listJobs(RUN_ID);
    assert.deepEqual(jobsBeforeCancel.map((job) => job.jobId), [JOB_BLOCKER, JOB_DUPLICATE]);

    const cancelled = await domain.cancelJob(RUN_ID, JOB_DUPLICATE);
    assert.equal(cancelled.accepted, true);
    assert.equal(cancelled.reason, "CANCELLED_BEFORE_START");
    const duplicateTerminal = await waitForTerminal(domain, JOB_DUPLICATE);
    assert.equal(duplicateTerminal.status, "CANCELLED");
    assert.equal(executionCount, 1);

    releaseBlocker();
    const blockerTerminal = await waitForTerminal(domain, JOB_BLOCKER);
    assert.equal(blockerTerminal.status, "FAILED");
    assert.equal(executionCount, 1, "cancelled duplicate work must never execute after queue capacity is released");

    const retryAfterCancel = await domain.submitDevelopmentExperiment(experimentRequest("duplicate-request"));
    assert.deepEqual(retryAfterCancel, duplicates[0]);
    assert.equal((await domain.getJob(RUN_ID, JOB_DUPLICATE)).status, "CANCELLED");
    assert.equal(executionCount, 1);
  } finally {
    releaseBlocker?.();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
