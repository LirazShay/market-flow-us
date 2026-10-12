import { DuckDBInstance } from "@duckdb/node-api";

import {
  RESEARCH_ANALYSIS_OPERATION
} from "./growth-governance.js";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING
} from "./ledger.js";
import { deterministicManagedAnalysisId } from "./managed-identities.js";

const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const ANALYSIS_ID = /^analysis_[0-9a-f-]{36}$/u;

function assertRunId(value) {
  if (typeof value !== "string" || !RUN_ID.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertAnalysisId(value) {
  if (typeof value !== "string" || !ANALYSIS_ID.test(value)) {
    throw new TypeError("analysisId must be an analysis_ prefixed UUID");
  }
  return value;
}

function assertPositiveLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("maxAnalysisSubmissionsPerRun must be a positive safe integer");
  }
  return value;
}

async function queryRows(connection, sql, values) {
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original retrieval error.
  }
}

export async function findManagedAnalysisJobId({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  researchRunId,
  analysisId,
  maxAnalysisSubmissionsPerRun
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  const runId = assertRunId(researchRunId);
  const targetAnalysisId = assertAnalysisId(analysisId);
  const limit = assertPositiveLimit(maxAnalysisSubmissionsPerRun);
  if (limit >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("maxAnalysisSubmissionsPerRun is too large for bounded retrieval");
  }

  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("SET allowed_configs = []");
    await connection.run("SET lock_configuration = true");
    const rows = await queryRows(
      connection,
      `SELECT job_id, client_request_id
       FROM research_jobs
       WHERE research_run_id = $researchRunId
         AND operation = $operation
       LIMIT ${limit + 1}`,
      { researchRunId: runId, operation: RESEARCH_ANALYSIS_OPERATION }
    );
    if (rows.length > limit) {
      throw new Error("Research analysis records exceed the managed growth policy");
    }

    let match = null;
    for (const row of rows) {
      const candidate = deterministicManagedAnalysisId(runId, String(row.client_request_id));
      if (candidate !== targetAnalysisId) continue;
      if (match !== null) throw new Error("analysisId matched more than one durable Research Job");
      match = String(row.job_id);
    }
    return match;
  } finally {
    closeQuietly(connection);
    closeQuietly(instance);
  }
}
