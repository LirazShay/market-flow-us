import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openBacktestHistoricalScanner } from "../../backtest-lab/historical-scanner.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_33333333-3333-4333-8333-333333333333";
const OBJECTIVE_ID = "obj_33333333-3333-4333-8333-333333333333";
const QUERY_ID = "qry_33333333-3333-4333-8333-333333333333";
const INVENTORY_ID = "inv_33333333-3333-4333-8333-333333333333";
const PLAN_ID = "plan_33333333-3333-4333-8333-333333333333";
const PART_DEV = "part_33333333-3333-4333-8333-333333333333";
const JOB_ID = "job_33333333-3333-4333-8333-333333333333";
const LONG_QUERY = `
  SELECT latest.security_id
  FROM latest
  CROSS JOIN range(0, 1000000000) AS r(i)
  GROUP BY latest.security_id
  ORDER BY SUM(SIN(i::DOUBLE)) DESC
  LIMIT 1
`;

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
    productVersion: "research-experiment-cancellation-test-v1",
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
        (1, 'cancel-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'cancel-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'cancel-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}'),
        (2, 'cancel-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`cancellation proof exceeded ${ms}ms`)), ms);
  });
}

async function waitForStatus(domain, jobId, expected) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, jobId);
    if (job?.status === expected) return job;
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) {
      throw new Error(`Job reached ${job.status} before expected ${expected}`);
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

test("TREE 11.4 AbortSignal interrupts an active Backtest Historical Scanner DuckDB query", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-interrupt-"));
  const controller = new AbortController();
  let historical = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    historical = await openBacktestHistoricalScanner({
      dataDir: tempDir,
      sourceId: "active",
      requestedAtMs: 2_000,
      signal: controller.signal,
      now: () => 1_860_000_000_000
    });
    assert.equal(historical.available, true);

    let settled = false;
    const execution = historical.scanner.execute(LONG_QUERY).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(settled, false, "long Backtest SQL must still be active before abort");

    controller.abort();
    await assert.rejects(Promise.race([execution, timeoutAfter(2_000)]));
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (historical) await historical.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.4 managed active Development experiment cancellation never commits Experiment or result success", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-managed-experiment-cancel-"));
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
      partitionIdFactory: () => PART_DEV,
      jobIdFactory: () => JOB_ID
    });

    await domain.createResearchRun({
      userIntent: "Prove bounded experiment cancellation.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Cancellation proof.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: LONG_QUERY,
      scannerContractVersion: "scanner-authority-v1",
      label: "long-cancellation-proof"
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
      plan: { algorithmVersion: "experiment-cancellation-proof-v1" },
      partitions: [{ role: "DEVELOPMENT", partition: { sourceIds: ["active"] } }]
    });

    const submitted = await domain.submitDevelopmentExperiment({
      clientRequestId: "managed-experiment-cancel-1",
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
    assert.equal(submitted.jobId, JOB_ID);
    await waitForStatus(domain, JOB_ID, "RUNNING");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const cancellation = await domain.cancelJob(RUN_ID, JOB_ID);
    assert.equal(cancellation.accepted, true);
    assert.equal(cancellation.reason, "CANCELLATION_REQUESTED");

    const terminal = await Promise.race([waitForTerminal(domain, JOB_ID), timeoutAfter(2_500)]);
    assert.equal(terminal.status, "CANCELLED");
    assert.equal(terminal.cancellationPossible, false);
    assert.equal(terminal.progress.completedUnits, 0);
    assert.deepEqual(terminal.progress.resultHandles, []);
    assert.deepEqual(await domain.listExperiments(RUN_ID), []);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
