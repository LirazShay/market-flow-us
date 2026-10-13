import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { openBacktestEvidenceSource } from "../backtest-lab/evidence-source.js";
import {
  listBacktestEvidenceSources,
  resolveBacktestEvidenceSourcePath
} from "../backtest-lab/source-catalog.js";
import { openManagedResearchDomain } from "../research-server/managed-domain.js";
import { DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY } from "../research-server/runtime-policy.js";
import { fingerprintResearchEvidenceSource } from "../research-server/source-fingerprint.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_PATH = path.join(
  PROJECT_ROOT,
  "test-results",
  "acceptance",
  "research-target-evidence.json"
);
const MAX_SELECTED_SOURCES = 2;
const HORIZON_MS = 10_000;
const OBSERVER_TIMEOUT_MS = 60_000;
const STABLE_ERROR_CODE = /^RESEARCH_TARGET_EVIDENCE_[A-Z0-9_]{1,96}$/u;

/*
Static SQL preflight required by AGENTS.md before first execution.
1. Purpose/contract: locate the latest complete cycle and the latest real T0 at least 10s earlier without assuming cadence density; later count authorized Research rows per selected source. No mutation.
2. Schema/source: `cycles.status` + `cycles.committed_at_ms` are product-owned Market Flow US fields validated by openBacktestEvidenceSource; `research_history.source_id` is the Research SQL projection authority.
3. Cardinality: the cycle-boundary query returns exactly one scalar row per candidate source; Research SQL output <=2 rows because this runner selects at most two logical sources.
4. Access paths: the cycle-boundary query performs at most two scans of `cycles` (latest aggregate plus one scalar eligible-T0 aggregate); Research SQL performs one projection scan. There are no multiplicative joins.
5. Predicates/selectivity: complete/non-null predicates are applied to both cycle scans; the eligible-T0 predicate is applied before its MAX aggregate. Research SQL intentionally covers the complete authorized Development partition.
6. Join/row explosion: no query creates a many-to-many relation; the scalar subquery returns at most one value and the Research grouping is bounded by <=2 authorized source IDs.
7. Sort/group/window: cycle selection uses scalar MAX aggregates with no sort/window; Research SQL has one GROUP BY over <=2 source IDs and a tiny final ORDER BY.
8. Repeated work: the second cycles scan is intentional to remain cadence-agnostic instead of fetching an arbitrary top-N sample; source inspection stops after two usable sources and Research count is one pass.
9. Boundedness/resources: source connections are READ_ONLY, outputs are tiny, no transaction/write path exists, and managed Research result budgets remain authoritative.
10. Architecture alternative: source catalog/evidence opener + existing managed Research Domain already own these semantics; adding a warehouse/index/precompute/helper subsystem would duplicate authority for two bounded reads.
*/
export const TARGET_CYCLE_SAMPLE_SQL = `
  WITH latest AS (
    SELECT MAX(committed_at_ms) AS latest_at_ms
    FROM cycles
    WHERE status = 'complete' AND committed_at_ms IS NOT NULL
  )
  SELECT
    latest_at_ms,
    (
      SELECT MAX(candidate.committed_at_ms)
      FROM cycles AS candidate
      WHERE candidate.status = 'complete'
        AND candidate.committed_at_ms IS NOT NULL
        AND candidate.committed_at_ms <= latest.latest_at_ms - ${HORIZON_MS}
    ) AS t0_at_ms
  FROM latest
`;

export const TARGET_RESEARCH_SQL = `
  SELECT source_id, CAST(COUNT(*) AS DOUBLE) AS row_count
  FROM research_history
  GROUP BY source_id
  ORDER BY source_id
`;

// Reuse the already-proven bounded Scanner query from the synthetic TREE 11.8 workload.
export const TARGET_SCANNER_SQL = `
  SELECT latest.security_id
  FROM latest
  ORDER BY latest.DailyVolume DESC, latest.security_id ASC
  LIMIT 10
`;

function stableFailureCode(error, fallback = "RESEARCH_TARGET_EVIDENCE_FAILED") {
  return typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) fail("RESEARCH_TARGET_EVIDENCE_ID_SEQUENCE_EXHAUSTED");
    return remaining.shift();
  };
}

async function queryJsonRows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

function selectT0(cycleRows) {
  if (!Array.isArray(cycleRows) || cycleRows.length !== 1) return null;
  const row = cycleRows[0];
  if (row.latest_at_ms === null || row.t0_at_ms === null) return null;
  const latestAtMs = Number(row.latest_at_ms);
  const t0AtMs = Number(row.t0_at_ms);
  if (
    !Number.isSafeInteger(latestAtMs)
    || !Number.isSafeInteger(t0AtMs)
    || latestAtMs < 0
    || t0AtMs < 0
    || latestAtMs - t0AtMs < HORIZON_MS
  ) {
    return null;
  }
  return Object.freeze({ latestAtMs, t0AtMs });
}

export async function selectTargetEvidenceSources({
  dataDir,
  maxSources = MAX_SELECTED_SOURCES
} = {}) {
  if (typeof dataDir !== "string" || !path.isAbsolute(dataDir)) {
    fail("RESEARCH_TARGET_EVIDENCE_DATA_DIR_NOT_ABSOLUTE");
  }
  if (!Number.isSafeInteger(maxSources) || maxSources < 1 || maxSources > MAX_SELECTED_SOURCES) {
    throw new TypeError(`maxSources must be between 1 and ${MAX_SELECTED_SOURCES}`);
  }

  const catalog = await listBacktestEvidenceSources({ dataDir });
  const selected = [];
  for (const source of catalog) {
    if (selected.length >= maxSources) break;
    let opened = null;
    try {
      opened = await openBacktestEvidenceSource({ dataDir, sourceId: source.sourceId });
      const timing = selectT0(await queryJsonRows(opened.connection, TARGET_CYCLE_SAMPLE_SQL));
      if (!timing) continue;
      selected.push(Object.freeze({
        sourceId: source.sourceId,
        kind: source.kind,
        schemaVersion: opened.schemaVersion,
        ...timing
      }));
    } catch {
      // One unavailable/in-use/incompatible source must not hide another product-owned source.
    } finally {
      await opened?.close();
    }
  }

  if (selected.length < 1) fail("RESEARCH_TARGET_EVIDENCE_NO_USABLE_MARKET_EVIDENCE");
  return Object.freeze({
    catalogCount: catalog.length,
    selected: Object.freeze(selected)
  });
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

async function sourceState(dataDir, selected) {
  const states = [];
  for (const source of selected) {
    const sourcePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId: source.sourceId });
    const sourceStat = await stat(sourcePath);
    states.push(Object.freeze({
      sourceId: source.sourceId,
      fingerprint: await fingerprintResearchEvidenceSource({ dataDir, sourceId: source.sourceId }),
      bytes: sourceStat.size
    }));
  }
  return Object.freeze(states);
}

function sourceStateEqual(before, after) {
  if (before.length !== after.length) return false;
  return before.every((left, index) => (
    left.sourceId === after[index]?.sourceId
    && left.fingerprint === after[index]?.fingerprint
    && left.bytes === after[index]?.bytes
  ));
}

async function waitForTerminal(domain, researchRunId, jobId, timeoutMs = OBSERVER_TIMEOUT_MS) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const job = await domain.getJob(researchRunId, jobId);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  fail("RESEARCH_TARGET_EVIDENCE_JOB_OBSERVER_TIMEOUT");
}

function requireSucceeded(job, code) {
  if (job?.status !== "SUCCEEDED") fail(code);
  const handles = job.progress?.resultHandles;
  if (!Array.isArray(handles) || handles.length !== 1) {
    fail("RESEARCH_TARGET_EVIDENCE_RESULT_HANDLE_INVALID");
  }
  return handles[0];
}

function targetIds() {
  return Object.freeze({
    runId: `run_${randomUUID()}`,
    objectiveId: `obj_${randomUUID()}`,
    queryId: `qry_${randomUUID()}`,
    inventoryId: `inv_${randomUUID()}`,
    planId: `plan_${randomUUID()}`,
    developmentPartitionId: `part_${randomUUID()}`,
    validationPartitionId: `part_${randomUUID()}`,
    experimentJobId: `job_${randomUUID()}`,
    sqlJobId: `job_${randomUUID()}`,
    experimentResultId: `res_${randomUUID()}`,
    sqlResultId: `res_${randomUUID()}`
  });
}

async function persistReport(reportPath, report) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function runResearchTargetEvidenceWorkload({
  dataDir = process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR ?? path.join(PROJECT_ROOT, "data"),
  reportPath = process.env.MARKET_FLOW_US_RESEARCH_TARGET_REPORT ?? DEFAULT_REPORT_PATH,
  tempRoot = os.tmpdir()
} = {}) {
  const absoluteDataDir = path.resolve(dataDir);
  const absoluteReportPath = path.resolve(reportPath);
  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    gate: "TREE_11_8_TARGET_MACHINE_ACTUAL_EVIDENCE",
    result: "running",
    actualEvidence: true,
    configuredDataDirOverride: Boolean(process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR),
    source: null,
    measurements: null,
    restart: null,
    sourceImmutability: null,
    resourcePolicy: DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY,
    desktopAcceptance: "STILL_REQUIRED",
    error: null
  };

  if (!path.isAbsolute(dataDir)) {
    report.result = "fail";
    report.error = { code: "RESEARCH_TARGET_EVIDENCE_DATA_DIR_NOT_ABSOLUTE" };
    await persistReport(absoluteReportPath, report);
    return report;
  }

  let tempDir = null;
  let domain = null;
  let failure = null;
  const wallStarted = performance.now();
  const cpuBefore = process.cpuUsage();
  const resourcesBefore = process.resourceUsage();
  const rssBefore = process.memoryUsage().rss;

  try {
    const selection = await selectTargetEvidenceSources({ dataDir: absoluteDataDir });
    const selected = selection.selected;
    const before = await sourceState(absoluteDataDir, selected);
    const sourceBytesBefore = before.reduce((sum, value) => sum + value.bytes, 0);

    tempDir = await mkdtemp(path.join(path.resolve(tempRoot), "market-flow-us-target-research-"));
    const dbPath = path.join(tempDir, "research-ledger.duckdb");
    const ids = targetIds();
    const sourceIds = selected.map((source) => source.sourceId);

    const openOptions = {
      dbPath,
      marketDataDir: absoluteDataDir,
      resourcePolicy: DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY,
      idFactory: () => ids.runId,
      objectiveVersionIdFactory: () => ids.objectiveId,
      queryArtifactIdFactory: () => ids.queryId,
      evidenceInventoryIdFactory: () => ids.inventoryId,
      evidencePlanIdFactory: () => ids.planId,
      partitionIdFactory: sequence([ids.developmentPartitionId, ids.validationPartitionId]),
      jobIdFactory: sequence([ids.experimentJobId, ids.sqlJobId]),
      resultHandleFactory: sequence([ids.experimentResultId, ids.sqlResultId])
    };

    domain = await openManagedResearchDomain(openOptions);
    await domain.createResearchRun({
      userIntent: "Measure TREE 11.8 target-machine actual-evidence Research resource behavior.",
      environmentSnapshot: { acceptanceGate: "TREE_11_8_TARGET_MACHINE_ACTUAL_EVIDENCE" },
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: ids.runId,
      interpretationText: "Measure bounded upward 10 second Research execution on actual product evidence.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: ids.runId,
      sqlText: TARGET_SCANNER_SQL,
      scannerContractVersion: "scanner-authority-v1",
      label: "target-machine-actual-evidence"
    });
    await domain.createEvidenceInventory({
      researchRunId: ids.runId,
      inventory: {
        sources: selected.map((source, index) => ({
          sourceId: source.sourceId,
          sourceFingerprint: before[index].fingerprint,
          classification: source.kind === "active" ? "ACTIVE" : "ARCHIVE",
          schemaVersion: source.schemaVersion
        }))
      }
    });
    await domain.createEvidencePlan({
      researchRunId: ids.runId,
      objectiveVersionId: ids.objectiveId,
      evidenceInventoryId: ids.inventoryId,
      plan: { algorithmVersion: "target-machine-actual-evidence-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds } },
        { role: "VALIDATION", partition: { sourceIds } }
      ]
    });

    const experimentRequest = {
      clientRequestId: "target-machine-actual-evidence-experiment",
      researchRunId: ids.runId,
      objectiveVersionId: ids.objectiveId,
      partitionId: ids.developmentPartitionId,
      sourceId: selected[0].sourceId,
      queryArtifactIds: [ids.queryId],
      fromAtMs: selected[0].t0AtMs,
      toAtMs: selected[0].t0AtMs,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 10,
      horizonsMs: [HORIZON_MS]
    };

    let started = performance.now();
    const duplicateSubmissions = await Promise.all(
      Array.from({ length: 16 }, () => domain.submitDevelopmentExperiment(experimentRequest))
    );
    const experimentJobIds = new Set(duplicateSubmissions.map((value) => value.jobId));
    const experimentIds = new Set(duplicateSubmissions.map((value) => value.experimentId));
    if (experimentJobIds.size !== 1 || experimentIds.size !== 1) {
      fail("RESEARCH_TARGET_EVIDENCE_DUPLICATE_IDEMPOTENCY_FAILED");
    }
    const experimentJob = await waitForTerminal(domain, ids.runId, ids.experimentJobId);
    const experimentResult = requireSucceeded(
      experimentJob,
      "RESEARCH_TARGET_EVIDENCE_EXPERIMENT_FAILED"
    );
    const experimentMs = roundMs(performance.now() - started);

    started = performance.now();
    const submittedSql = await domain.submitDevelopmentResearchSql({
      clientRequestId: "target-machine-actual-evidence-sql",
      researchRunId: ids.runId,
      partitionId: ids.developmentPartitionId,
      experimentIds: [duplicateSubmissions[0].experimentId],
      sql: TARGET_RESEARCH_SQL,
      purpose: "AGGREGATE",
      outputMode: "PAGED_RESULT"
    });
    const sqlJob = await waitForTerminal(domain, ids.runId, ids.sqlJobId);
    const sqlResult = requireSucceeded(sqlJob, "RESEARCH_TARGET_EVIDENCE_SQL_FAILED");
    const researchSqlMs = roundMs(performance.now() - started);

    started = performance.now();
    const experimentPage = await domain.getResultPage(ids.runId, experimentResult.resultHandle, { pageSize: 10 });
    const sqlPage = await domain.getResultPage(ids.runId, sqlResult.resultHandle, { pageSize: 10 });
    const resultPageMs = roundMs(performance.now() - started);
    if (experimentPage.rows.length < 1 || sqlPage.rows.length < 1 || sqlPage.rows.length > selected.length) {
      fail("RESEARCH_TARGET_EVIDENCE_RESULT_PAGE_INVALID");
    }

    started = performance.now();
    await domain.close();
    domain = null;
    const closeMs = roundMs(performance.now() - started);
    const ledgerBytesBeforeReopen = (await stat(dbPath)).size;

    started = performance.now();
    domain = await openManagedResearchDomain({
      dbPath,
      marketDataDir: absoluteDataDir,
      resourcePolicy: DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY
    });
    const reopenMs = roundMs(performance.now() - started);

    started = performance.now();
    const experimentAfterRestart = await domain.getResultPage(
      ids.runId,
      experimentResult.resultHandle,
      { pageSize: 10 }
    );
    const sqlAfterRestart = await domain.getResultPage(
      ids.runId,
      sqlResult.resultHandle,
      { pageSize: 10 }
    );
    const postRestartReadMs = roundMs(performance.now() - started);
    if (
      JSON.stringify(experimentAfterRestart) !== JSON.stringify(experimentPage)
      || JSON.stringify(sqlAfterRestart) !== JSON.stringify(sqlPage)
    ) {
      fail("RESEARCH_TARGET_EVIDENCE_RESTART_RESULT_MISMATCH");
    }

    await domain.close();
    domain = null;
    const after = await sourceState(absoluteDataDir, selected);
    const sourceBytesAfter = after.reduce((sum, value) => sum + value.bytes, 0);
    const immutable = sourceStateEqual(before, after);
    if (!immutable) fail("RESEARCH_TARGET_EVIDENCE_SOURCE_MUTATED");

    const cpuDelta = process.cpuUsage(cpuBefore);
    const rssAfter = process.memoryUsage().rss;
    const resourcesAfter = process.resourceUsage();
    const tempDirBytes = await directoryBytes(tempDir);

    report.source = {
      catalogCount: selection.catalogCount,
      selectedSourceCount: selected.length,
      selectedKinds: selected.map((source) => source.kind),
      schemaVersions: selected.map((source) => source.schemaVersion),
      sourceBytesBefore,
      sourceBytesAfter,
      sourceBytesEqual: sourceBytesBefore === sourceBytesAfter,
      absolutePathsRedacted: true
    };
    report.measurements = {
      wallClockMs: roundMs(performance.now() - wallStarted),
      experimentMs,
      researchSqlMs,
      resultPageMs,
      closeMs,
      reopenMs,
      postRestartReadMs,
      duplicateSubmissions: 16,
      uniqueExperimentJobs: experimentJobIds.size,
      uniqueExperiments: experimentIds.size,
      experimentResultRows: experimentResult.rowCount,
      experimentResultBytes: experimentResult.serializedBytes,
      researchSqlResultRows: sqlResult.rowCount,
      researchSqlResultBytes: sqlResult.serializedBytes,
      ledgerBytesBeforeReopen,
      tempDirBytes,
      rssBeforeBytes: rssBefore,
      rssAfterBytes: rssAfter,
      rssDeltaBytes: rssAfter - rssBefore,
      maxRssBeforeBytes: resourcesBefore.maxRSS * 1024,
      maxRssAfterBytes: resourcesAfter.maxRSS * 1024,
      cpuUserMicros: cpuDelta.user,
      cpuSystemMicros: cpuDelta.system,
      concurrency: DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY.concurrency
    };
    report.restart = {
      durableExperimentResultRead: true,
      durableResearchSqlResultRead: true,
      researchRunId: ids.runId,
      experimentJobId: ids.experimentJobId,
      researchSqlJobId: ids.sqlJobId,
      experimentResultHandle: experimentResult.resultHandle,
      researchSqlResultHandle: sqlResult.resultHandle,
      analysisId: submittedSql.analysisId
    };
    report.sourceImmutability = {
      fingerprintEqual: immutable,
      bytesEqual: sourceBytesBefore === sourceBytesAfter
    };
    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = { code: stableFailureCode(error) };
  } finally {
    try {
      await domain?.close();
    } catch {
      if (!failure) {
        report.result = "fail";
        report.error = { code: "RESEARCH_TARGET_EVIDENCE_DOMAIN_CLEANUP_FAILED" };
      }
    }
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        if (!failure) {
          report.result = "fail";
          report.error = { code: "RESEARCH_TARGET_EVIDENCE_TEMP_CLEANUP_FAILED" };
        }
      }
    }
    try {
      await persistReport(absoluteReportPath, report);
    } catch {
      report.result = "fail";
      report.error = { code: "RESEARCH_TARGET_EVIDENCE_REPORT_PERSIST_FAILED" };
    }
  }

  return report;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const report = await runResearchTargetEvidenceWorkload();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.result !== "pass") process.exitCode = 1;
}
