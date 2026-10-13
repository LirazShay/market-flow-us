import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";
import {
  roundMs,
  sanitizedFailure,
  workloadMode
} from "./us-workload-support.mjs";

const REPORT_PATH = process.env.MARKET_FLOW_US_RESEARCH_REPORT
  ?? path.resolve("test-results/workload/research-resource.json");
const HARD_ACTIVE_CANCEL_CEILING_MS = 2500;
const HARD_QUEUED_CANCEL_CEILING_MS = 1000;
const RUN_ID = "run_99999999-9999-4999-8999-999999999999";
const OBJECTIVE_ID = "obj_99999999-9999-4999-8999-999999999999";
const QUERY_ID = "qry_99999999-9999-4999-8999-999999999999";
const INVENTORY_ID = "inv_99999999-9999-4999-8999-999999999999";
const PLAN_ID = "plan_99999999-9999-4999-8999-999999999999";
const PART_DEV = "part_99999999-9999-4999-8999-999999999991";
const PART_VALIDATION = "part_99999999-9999-4999-8999-999999999992";
const JOB_SQL_ACTIVE = "job_99999999-9999-4999-8999-999999999991";
const JOB_SQL_QUEUED = "job_99999999-9999-4999-8999-999999999992";
const JOB_EXPERIMENT = "job_99999999-9999-4999-8999-999999999993";
const JOB_SQL_SUCCESS = "job_99999999-9999-4999-8999-999999999994";
const JOB_SQL_RESTART = "job_99999999-9999-4999-8999-999999999995";
const RESULT_SQL_SUCCESS = "res_99999999-9999-4999-8999-999999999991";
const RESULT_SQL_RESTART = "res_99999999-9999-4999-8999-999999999992";
const LONG_SCANNER_SQL = `
  SELECT latest.security_id
  FROM latest
  CROSS JOIN range(0, 1000000000) AS r(i)
  GROUP BY latest.security_id
  ORDER BY SUM(SIN(i::DOUBLE)) DESC
  LIMIT 1
`;
const LONG_RESEARCH_SQL = `
  SELECT research_history.security_id
  FROM research_history
  CROSS JOIN range(0, 1000000000) AS r(i)
  GROUP BY research_history.security_id
  ORDER BY SUM(SIN(i::DOUBLE)) DESC
  LIMIT 1
`;

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("workload ID sequence exhausted");
    return remaining.shift();
  };
}

function resolveProfile() {
  const mode = workloadMode();
  if (mode === "target-e2e" || mode === "target-day") {
    return { name: "target-4096", universeSize: 4096, targetAuthority: true };
  }
  if (mode === "custom") {
    const universeSize = Number(process.env.MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE ?? 512);
    assert.ok(Number.isSafeInteger(universeSize) && universeSize >= 10);
    return { name: `custom-${universeSize}`, universeSize, targetAuthority: false };
  }
  return { name: "ci-256", universeSize: 256, targetAuthority: false };
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
    server: Object.freeze({ workUnits: 20, t0Evaluations: 1000, resultRows: 10_000, resultBytes: 5_000_000 }),
    run: Object.freeze({ workUnits: 10, t0Evaluations: 500, resultRows: 5_000, resultBytes: 2_000_000 }),
    job: Object.freeze({ workUnits: 2, t0Evaluations: 100, resultRows: 1000, resultBytes: 500_000 }),
    request: Object.freeze({ workUnits: 2, t0Evaluations: 100, resultRows: 1000, resultBytes: 500_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 1, t0Evaluations: 100, resultRows: 1000, resultBytes: 500_000 })
  })
});

async function seedMarketData(dataDir, universeSize) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-resource-workload-v1",
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
      )
      SELECT
        cycle_id,
        'research-workload',
        1,
        'complete',
        CASE cycle_id WHEN 1 THEN 1900 WHEN 2 THEN 11900 ELSE 21900 END,
        CASE cycle_id WHEN 1 THEN 1990 WHEN 2 THEN 11990 ELSE 21990 END,
        CASE cycle_id WHEN 1 THEN 2000 WHEN 2 THEN 12000 ELSE 22000 END,
        90,
        ${universeSize},
        ${universeSize},
        ${universeSize},
        0,
        0,
        0,
        1,
        CAST('[]' AS JSON),
        NULL,
        NULL
      FROM range(1, 4) AS cycles(cycle_id)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      )
      SELECT
        cycle_id,
        'research-workload',
        1,
        CAST(1000000 + security_index AS VARCHAR),
        0,
        CASE cycle_id WHEN 1 THEN 1900 WHEN 2 THEN 11900 ELSE 21900 END,
        CASE cycle_id WHEN 1 THEN 1980 WHEN 2 THEN 11980 ELSE 21980 END,
        CASE cycle_id WHEN 1 THEN 1980 WHEN 2 THEN 12000 ELSE 22000 END,
        CAST('{"source":"research-workload"}' AS JSON),
        'RW' || CAST(security_index AS VARCHAR),
        'Research Workload ' || CAST(security_index AS VARCHAR),
        'SYNTH',
        'provider-time',
        100 + (security_index * 0.01) + cycle_id,
        cycle_id * 0.1,
        (security_index * 1000) + cycle_id,
        CAST('{"PaperId":"synthetic"}' AS JSON)
      FROM range(1, 4) AS cycles(cycle_id)
      CROSS JOIN range(0, ${universeSize}) AS securities(security_index)
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
      throw new Error(`Job reached ${job.status} before expected ${expected}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job did not reach ${expected}`);
}

async function waitForTerminal(domain, jobId) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Job did not reach terminal state");
}

async function measureCancellation(domain, jobId, hardCeilingMs) {
  const started = performance.now();
  const response = await domain.cancelJob(RUN_ID, jobId);
  const terminal = await waitForTerminal(domain, jobId);
  const latencyMs = performance.now() - started;
  assert.equal(response.accepted, true);
  assert.equal(terminal.status, "CANCELLED");
  assert.ok(latencyMs < hardCeilingMs, `cancellation exceeded hard failure ceiling ${hardCeilingMs}ms`);
  return {
    latencyMs: roundMs(latencyMs),
    hardCeilingMs,
    reason: response.reason,
    status: terminal.status
  };
}

function resultHandle(job) {
  assert.equal(job.status, "SUCCEEDED");
  assert.equal(job.progress.resultHandles.length, 1);
  return job.progress.resultHandles[0];
}

test("TREE 11.4 representative managed workload measures cancellation, restart and bounded resource reuse", { timeout: 3 * 60 * 1000 }, async () => {
  const profile = resolveProfile();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-workload-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  const jobIdFactory = sequence([
    JOB_SQL_ACTIVE,
    JOB_SQL_QUEUED,
    JOB_EXPERIMENT,
    JOB_SQL_SUCCESS,
    JOB_SQL_RESTART
  ]);
  const resultHandleFactory = sequence([RESULT_SQL_SUCCESS, RESULT_SQL_RESTART]);
  const partitionIdFactory = sequence([PART_DEV, PART_VALIDATION]);
  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    profileMode: workloadMode(),
    profile,
    result: "running",
    limits: RESOURCE_POLICY,
    cancellation: null,
    successfulSqlMs: null,
    resultPageMs: null,
    closeMs: null,
    reopenMs: null,
    postRestartSqlMs: null,
    sourceFingerprintEqual: null,
    marketDbBytes: null,
    researchLedgerBytes: null,
    rssBeforeBytes: process.memoryUsage().rss,
    rssAfterBytes: null,
    rssDeltaBytes: null,
    tuningDecision: null,
    error: null
  };
  let domain = null;
  let failure = null;

  const openOptions = {
    dbPath,
    marketDataDir: tempDir,
    now: () => 1_920_000_000_000,
    resourcePolicy: RESOURCE_POLICY,
    idFactory: () => RUN_ID,
    objectiveVersionIdFactory: () => OBJECTIVE_ID,
    queryArtifactIdFactory: () => QUERY_ID,
    evidenceInventoryIdFactory: () => INVENTORY_ID,
    evidencePlanIdFactory: () => PLAN_ID,
    partitionIdFactory,
    jobIdFactory,
    resultHandleFactory
  };

  try {
    await seedMarketData(tempDir, profile.universeSize);
    const fingerprintBefore = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    domain = await openManagedResearchDomain(openOptions);
    assert.deepEqual(domain.resourceLimits.concurrency, RESOURCE_POLICY.concurrency);

    await domain.createResearchRun({
      userIntent: "Measure bounded cancellation/restart resource behavior.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Workload cancellation proof.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: LONG_SCANNER_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "workload-long-query"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprintBefore,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "research-resource-workload-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    await domain.submitDevelopmentResearchSql({
      clientRequestId: "workload-sql-active",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [],
      sql: LONG_RESEARCH_SQL,
      purpose: "DEBUG",
      outputMode: "PAGED_RESULT"
    });
    await waitForStatus(domain, JOB_SQL_ACTIVE, "RUNNING");

    await domain.submitDevelopmentResearchSql({
      clientRequestId: "workload-sql-queued",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [],
      sql: LONG_RESEARCH_SQL,
      purpose: "DEBUG",
      outputMode: "PAGED_RESULT"
    });
    await waitForStatus(domain, JOB_SQL_QUEUED, "QUEUED");
    const queued = await measureCancellation(domain, JOB_SQL_QUEUED, HARD_QUEUED_CANCEL_CEILING_MS);
    const activeSql = await measureCancellation(domain, JOB_SQL_ACTIVE, HARD_ACTIVE_CANCEL_CEILING_MS);

    await domain.submitDevelopmentExperiment({
      clientRequestId: "workload-experiment-active",
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
    await waitForStatus(domain, JOB_EXPERIMENT, "RUNNING");
    await new Promise((resolve) => setTimeout(resolve, 25));
    const activeExperiment = await measureCancellation(domain, JOB_EXPERIMENT, HARD_ACTIVE_CANCEL_CEILING_MS);
    report.cancellation = { queued, activeSql, activeExperiment };

    let started = performance.now();
    await domain.submitDevelopmentResearchSql({
      clientRequestId: "workload-sql-success",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [],
      sql: "SELECT CAST(COUNT(*) AS DOUBLE) AS row_count FROM research_history",
      purpose: "AGGREGATE",
      outputMode: "PAGED_RESULT"
    });
    const successful = await waitForTerminal(domain, JOB_SQL_SUCCESS);
    report.successfulSqlMs = roundMs(performance.now() - started);
    assert.equal(successful.status, "SUCCEEDED");
    const successfulResult = resultHandle(successful);
    assert.equal(successfulResult.resultHandle, RESULT_SQL_SUCCESS);

    started = performance.now();
    const page = await domain.getResultPage(RUN_ID, RESULT_SQL_SUCCESS, { pageSize: 10 });
    report.resultPageMs = roundMs(performance.now() - started);
    assert.equal(page.rows.length, 1);
    assert.equal(page.truncated, false);

    started = performance.now();
    await domain.close();
    domain = null;
    report.closeMs = roundMs(performance.now() - started);

    started = performance.now();
    domain = await openManagedResearchDomain(openOptions);
    report.reopenMs = roundMs(performance.now() - started);
    assert.equal((await domain.getJob(RUN_ID, JOB_SQL_ACTIVE)).status, "CANCELLED");
    assert.equal((await domain.getJob(RUN_ID, JOB_SQL_QUEUED)).status, "CANCELLED");
    assert.equal((await domain.getJob(RUN_ID, JOB_EXPERIMENT)).status, "CANCELLED");
    assert.equal((await domain.getJob(RUN_ID, JOB_SQL_SUCCESS)).status, "SUCCEEDED");
    assert.deepEqual(
      await domain.getResultPage(RUN_ID, RESULT_SQL_SUCCESS, { pageSize: 10 }),
      page
    );

    started = performance.now();
    await domain.submitDevelopmentResearchSql({
      clientRequestId: "workload-sql-after-restart",
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: [],
      sql: "SELECT MAX(Price) AS max_price FROM research_history",
      purpose: "AGGREGATE",
      outputMode: "PAGED_RESULT"
    });
    const restarted = await waitForTerminal(domain, JOB_SQL_RESTART);
    report.postRestartSqlMs = roundMs(performance.now() - started);
    assert.equal(restarted.status, "SUCCEEDED");
    assert.equal(resultHandle(restarted).resultHandle, RESULT_SQL_RESTART);
    assert.ok(
      restarted.progress.budget.find((scope) => scope.scope === "RUN")
        .dimensions.workUnits.consumed >= 4,
      "restart must preserve prior run-level work-unit consumption"
    );

    await domain.close();
    domain = null;
    const fingerprintAfter = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    report.sourceFingerprintEqual = fingerprintAfter === fingerprintBefore;
    assert.equal(report.sourceFingerprintEqual, true);
    report.marketDbBytes = (await stat(path.join(tempDir, "market-flow-us.duckdb"))).size;
    report.researchLedgerBytes = (await stat(dbPath)).size;
    report.rssAfterBytes = process.memoryUsage().rss;
    report.rssDeltaBytes = report.rssAfterBytes - report.rssBeforeBytes;
    report.tuningDecision = {
      increaseConcurrency: false,
      reason: "Bounded serial heavy-job/reader policy remained responsive; no CI evidence justifies higher parallelism."
    };
    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = sanitizedFailure(error, tempDir);
  } finally {
    try {
      await domain?.close();
    } catch {}
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rm(tempDir, { recursive: true, force: true });
  }

  if (failure) throw failure;
});
