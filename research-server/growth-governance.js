import { DuckDBInstance } from "@duckdb/node-api";

import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING
} from "./ledger.js";

export const RESEARCH_EXPERIMENT_OPERATION = "execute_development_experiment";
export const RESEARCH_ANALYSIS_OPERATION = "execute_development_research_sql";

const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const OPERATION_ID = /^[a-z][a-z0-9_.-]{0,127}$/u;
const REQUEST_ID = /^[A-Za-z0-9._:-]+$/u;
const REQUIRED_LIMIT_KEYS = Object.freeze([
  "maxJobsPerRun",
  "maxExperimentSubmissionsPerRun",
  "maxAnalysisSubmissionsPerRun",
  "maxResultHandlesPerRun"
]);

function assertPositiveLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertRunId(value) {
  if (typeof value !== "string" || !RUN_ID.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertOperation(value) {
  if (typeof value !== "string" || !OPERATION_ID.test(value)) {
    throw new TypeError("operation must be a bounded lowercase operation identifier");
  }
  return value;
}

function assertClientRequestId(value) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length < 1
    || value.length > 128
    || !REQUEST_ID.test(value)
  ) {
    throw new TypeError("clientRequestId must be a trimmed bounded request identifier");
  }
  return value;
}

function assertCount(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} persistence is invalid`);
  }
  return number;
}

function growthError({ dimension, consumed, limit }) {
  const error = new Error(`Research budget exceeded for ${dimension} at RUN scope`);
  error.code = "RESEARCH_BUDGET_EXCEEDED";
  error.dimension = dimension;
  error.amount = 1;
  error.exhaustedScope = "RUN";
  error.consumed = consumed;
  error.limit = limit;
  return error;
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

async function tableNames(connection) {
  const rows = await queryRows(
    connection,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
  );
  return new Set(rows.map((row) => String(row.table_name)));
}

async function requireTables(connection, required) {
  const present = await tableNames(connection);
  const missing = required.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research growth governance requires tables: ${missing.join(", ")}`);
  }
}

async function lockConfiguration(connection) {
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original capacity-check error.
  }
}

async function withConnection(dbPath, requiredTables, operation) {
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await requireTables(connection, requiredTables);
    await lockConfiguration(connection);
    return await operation(connection);
  } finally {
    closeQuietly(connection);
    closeQuietly(instance);
  }
}

export function normalizeResearchGrowthLimits(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("growthLimits must be an object");
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...REQUIRED_LIMIT_KEYS].sort())) {
    throw new TypeError(`growthLimits must contain exactly ${REQUIRED_LIMIT_KEYS.join(", ")}`);
  }
  return Object.freeze({
    maxJobsPerRun: assertPositiveLimit(value.maxJobsPerRun, "growthLimits.maxJobsPerRun"),
    maxExperimentSubmissionsPerRun: assertPositiveLimit(
      value.maxExperimentSubmissionsPerRun,
      "growthLimits.maxExperimentSubmissionsPerRun"
    ),
    maxAnalysisSubmissionsPerRun: assertPositiveLimit(
      value.maxAnalysisSubmissionsPerRun,
      "growthLimits.maxAnalysisSubmissionsPerRun"
    ),
    maxResultHandlesPerRun: assertPositiveLimit(
      value.maxResultHandlesPerRun,
      "growthLimits.maxResultHandlesPerRun"
    )
  });
}

export function resolveManagedResearchGrowthLimits(resourcePolicy) {
  const runWorkUnits = assertPositiveLimit(
    resourcePolicy?.budgets?.run?.workUnits,
    "resourcePolicy.budgets.run.workUnits"
  );
  return Object.freeze({
    maxJobsPerRun: runWorkUnits,
    maxExperimentSubmissionsPerRun: runWorkUnits,
    maxAnalysisSubmissionsPerRun: runWorkUnits,
    maxResultHandlesPerRun: runWorkUnits
  });
}

export function assertResearchGrowthCapacity({ growthLimits, operation, counts }) {
  const limits = normalizeResearchGrowthLimits(growthLimits);
  if (limits === null) return;
  const operationId = assertOperation(operation);
  const jobCount = assertCount(counts?.jobs, "Job count");
  const experimentCount = assertCount(counts?.experimentSubmissions, "Experiment submission count");
  const analysisCount = assertCount(counts?.analysisSubmissions, "Analysis submission count");

  if (
    operationId === RESEARCH_EXPERIMENT_OPERATION
    && experimentCount >= limits.maxExperimentSubmissionsPerRun
  ) {
    throw growthError({
      dimension: "experimentSubmissions",
      consumed: experimentCount,
      limit: limits.maxExperimentSubmissionsPerRun
    });
  }
  if (
    operationId === RESEARCH_ANALYSIS_OPERATION
    && analysisCount >= limits.maxAnalysisSubmissionsPerRun
  ) {
    throw growthError({
      dimension: "analysisSubmissions",
      consumed: analysisCount,
      limit: limits.maxAnalysisSubmissionsPerRun
    });
  }
  if (jobCount >= limits.maxJobsPerRun) {
    throw growthError({ dimension: "jobRecords", consumed: jobCount, limit: limits.maxJobsPerRun });
  }
}

export async function readResearchSubmissionGrowthState({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  researchRunId,
  operation,
  clientRequestId
} = {}) {
  const runId = assertRunId(researchRunId);
  const operationId = assertOperation(operation);
  const requestId = assertClientRequestId(clientRequestId);

  return await withConnection(
    dbPath,
    ["research_runs", "research_jobs"],
    async (connection) => {
      const runRows = await queryRows(
        connection,
        `SELECT research_run_id
         FROM research_runs
         WHERE research_run_id = $researchRunId
         LIMIT 2`,
        { researchRunId: runId }
      );
      if (runRows.length === 0) throw new Error("Research Run was not found");
      if (runRows.length !== 1) throw new Error("research_runs violated research_run_id uniqueness");

      const existing = await queryRows(
        connection,
        `SELECT job_id
         FROM research_jobs
         WHERE research_run_id = $researchRunId
           AND operation = $operation
           AND client_request_id = $clientRequestId
         LIMIT 2`,
        { researchRunId: runId, operation: operationId, clientRequestId: requestId }
      );
      if (existing.length > 1) throw new Error("research_jobs violated request idempotency uniqueness");

      const counts = await queryRows(
        connection,
        `SELECT
           COUNT(*) AS job_count,
           SUM(CASE WHEN operation = $experimentOperation THEN 1 ELSE 0 END) AS experiment_count,
           SUM(CASE WHEN operation = $analysisOperation THEN 1 ELSE 0 END) AS analysis_count
         FROM research_jobs
         WHERE research_run_id = $researchRunId`,
        {
          researchRunId: runId,
          experimentOperation: RESEARCH_EXPERIMENT_OPERATION,
          analysisOperation: RESEARCH_ANALYSIS_OPERATION
        }
      );
      if (counts.length !== 1) {
        throw new Error("Research Job growth count query returned invalid cardinality");
      }

      return Object.freeze({
        existingRequest: existing.length === 1,
        counts: Object.freeze({
          jobs: assertCount(counts[0].job_count, "Job count"),
          experimentSubmissions: assertCount(
            counts[0].experiment_count ?? 0,
            "Experiment submission count"
          ),
          analysisSubmissions: assertCount(
            counts[0].analysis_count ?? 0,
            "Analysis submission count"
          )
        })
      });
    }
  );
}

export async function assertResearchSubmissionCapacity(input = {}) {
  const limits = normalizeResearchGrowthLimits(input.growthLimits);
  if (limits === null) return Object.freeze({ existingRequest: false });
  const state = await readResearchSubmissionGrowthState(input);
  if (state.existingRequest) return state;
  assertResearchGrowthCapacity({
    growthLimits: limits,
    operation: input.operation,
    counts: state.counts
  });
  return state;
}

export async function assertResearchResultCapacity({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  growthLimits,
  researchRunId
} = {}) {
  const limits = normalizeResearchGrowthLimits(growthLimits);
  if (limits === null) return;
  const runId = assertRunId(researchRunId);
  await withConnection(
    dbPath,
    ["research_runs", "research_results"],
    async (connection) => {
      const rows = await queryRows(
        connection,
        `SELECT COUNT(*) AS result_count
         FROM research_results
         WHERE research_run_id = $researchRunId`,
        { researchRunId: runId }
      );
      if (rows.length !== 1) throw new Error("Research Result growth count query returned invalid cardinality");
      const resultCount = assertCount(rows[0].result_count, "Result Handle count");
      if (resultCount >= limits.maxResultHandlesPerRun) {
        throw growthError({
          dimension: "resultHandles",
          consumed: resultCount,
          limit: limits.maxResultHandlesPerRun
        });
      }
    }
  );
}
