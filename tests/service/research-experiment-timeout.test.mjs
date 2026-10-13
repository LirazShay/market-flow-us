import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  RESEARCH_EXPERIMENT_TIMEOUT_ENV,
  resolveResearchExperimentTimeoutMs
} from "../../research-server/interruptible-experiment.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_55555555-5555-4555-8555-555555555555";
const OBJECTIVE_ID = "obj_55555555-5555-4555-8555-555555555555";
const QUERY_ID = "qry_55555555-5555-4555-8555-555555555555";
const INVENTORY_ID = "inv_55555555-5555-4555-8555-555555555555";
const PLAN_ID = "plan_55555555-5555-4555-8555-555555555555";
const PART_DEV = "part_55555555-5555-4555-8555-555555555555";
const PART_VALIDATION = "part_66666666-6666-4666-8666-666666666666";
const JOB_ID = "job_55555555-5555-4555-8555-555555555555";
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

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-experiment-timeout-test-v1",
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
        (1, 'timeout-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'timeout-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'timeout-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}'),
        (2, 'timeout-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`experiment timeout proof exceeded ${ms}ms`)), ms);
  });
}

async function waitForTerminal(domain) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, JOB_ID);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${JOB_ID} did not reach a terminal state`);
}

function restoreEnvironment(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("TREE 11.4 Development Experiment timeout is finite, configurable and rejects unsafe values", () => {
  assert.equal(
    resolveResearchExperimentTimeoutMs(undefined, { [RESEARCH_EXPERIMENT_TIMEOUT_ENV]: "75" }),
    75
  );
  assert.equal(resolveResearchExperimentTimeoutMs(125, {}), 125);
  assert.throws(
    () => resolveResearchExperimentTimeoutMs(0, {}),
    /experimentTimeoutMs must be a positive safe integer/u
  );
  assert.throws(
    () => resolveResearchExperimentTimeoutMs(undefined, { [RESEARCH_EXPERIMENT_TIMEOUT_ENV]: "unbounded" }),
    new RegExp(RESEARCH_EXPERIMENT_TIMEOUT_ENV, "u")
  );
});

test("TREE 11.4 managed Development Experiment timeout interrupts DuckDB and fails without Experiment or Result success", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-managed-experiment-timeout-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const previousTimeout = process.env[RESEARCH_EXPERIMENT_TIMEOUT_ENV];
  let domain = null;

  process.env[RESEARCH_EXPERIMENT_TIMEOUT_ENV] = "75";
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
      jobIdFactory: () => JOB_ID
    });

    await domain.createResearchRun({
      userIntent: "Prove bounded autonomous Experiment execution time.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Experiment timeout proof.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: LONG_QUERY,
      scannerContractVersion: "scanner-authority-v1",
      label: "long-timeout-proof"
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
      plan: { algorithmVersion: "experiment-timeout-proof-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const started = performance.now();
    const submitted = await domain.submitDevelopmentExperiment({
      clientRequestId: "managed-experiment-timeout-1",
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

    const terminal = await Promise.race([waitForTerminal(domain), timeoutAfter(2_500)]);
    const elapsedMs = performance.now() - started;
    assert.ok(elapsedMs < 2_500, "Experiment timeout must stop active work within the hard proof ceiling");
    assert.equal(terminal.status, "FAILED");
    assert.equal(terminal.errorCode, "RESEARCH_EXPERIMENT_TIMEOUT");
    assert.equal(terminal.cancellationPossible, false);
    assert.equal(terminal.progress.completedUnits, 0);
    assert.deepEqual(terminal.progress.resultHandles, []);
    assert.equal(terminal.progress.failure.code, "RESEARCH_EXPERIMENT_TIMEOUT");
    assert.deepEqual(await domain.listExperiments(RUN_ID), []);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    restoreEnvironment(RESEARCH_EXPERIMENT_TIMEOUT_ENV, previousTimeout);
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
