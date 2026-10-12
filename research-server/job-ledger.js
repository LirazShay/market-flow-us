import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";

export const RESEARCH_JOB_SCHEMA_VERSION = 1;

const BASE_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
  "research_ledger_info",
  "research_runs"
]);
const JOB_TABLES = Object.freeze([
  "research_job_info",
  "research_jobs"
]);
const JOB_STATUSES = new Set([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);
const MAX_INTENT_CHARS = 65_536;
const MAX_PROGRESS_CHARS = 65_536;

const CREATE_RESEARCH_JOB_INFO = `
CREATE TABLE research_job_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RESEARCH_JOBS = `
CREATE TABLE research_jobs (
  job_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  operation VARCHAR NOT NULL,
  client_request_id VARCHAR NOT NULL,
  intent_json VARCHAR NOT NULL,
  intent_fingerprint VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  progress_json VARCHAR NOT NULL,
  error_code VARCHAR,
  created_at_ms BIGINT NOT NULL,
  started_at_ms BIGINT,
  finished_at_ms BIGINT,
  updated_at_ms BIGINT NOT NULL,
  UNIQUE (research_run_id, operation, client_request_id)
)`;

const JOB_COLUMNS = `
job_id,
research_run_id,
operation,
client_request_id,
intent_json,
intent_fingerprint,
status,
progress_json,
error_code,
created_at_ms,
started_at_ms,
finished_at_ms,
updated_at_ms`;

async function ensureParentDirectory(dbPath) {
  if (dbPath === ":memory:") return;
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
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
  return rows.map((row) => String(row.table_name));
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original transaction/bootstrap error.
  }
}

async function inTransaction(connection, operation) {
  await connection.run("BEGIN TRANSACTION");
  try {
    const result = await operation();
    await connection.run("COMMIT");
    return result;
  } catch (error) {
    await rollbackPreservingOriginal(connection);
    throw error;
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
    // Preserve the original startup error.
  }
}

function assertSafeTimestamp(value, label) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return timestamp;
}

function optionalTimestamp(value, label) {
  if (value === null || value === undefined) return null;
  return assertSafeTimestamp(value, label);
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertJobId(value) {
  if (typeof value !== "string" || !/^job_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("jobId must be a job_ prefixed UUID");
  }
  return value;
}

function assertOperation(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/u.test(value)) {
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
    || !/^[A-Za-z0-9._:-]+$/u.test(value)
  ) {
    throw new TypeError("clientRequestId must be a trimmed bounded request identifier");
  }
  return value;
}

function assertJobStatus(value) {
  if (!JOB_STATUSES.has(value)) {
    throw new Error("research job status persistence is invalid");
  }
  return value;
}

function assertErrorCode(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value)) {
    throw new Error("research job error code persistence is invalid");
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeJsonValue(value, label, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} must be JSON serializable`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} must be JSON serializable`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} must be JSON serializable`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonValue(item, label, ancestors));
    }

    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError(`${label} must be JSON serializable`);
      }
      normalized[key] = normalizeJsonValue(item, label, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function serializeCanonicalJsonObject(value, label, maxChars = MAX_INTENT_CHARS) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  const normalized = normalizeJsonValue(value, label, new Set());
  const serialized = JSON.stringify(normalized);
  if (serialized.length > maxChars) {
    throw new TypeError(`${label} must serialize to at most ${maxChars} characters`);
  }
  return serialized;
}

function parseJsonObject(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} persistence is invalid`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} persistence is invalid`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return parsed;
}

function normalizeJob(row) {
  const intentJson = String(row.intent_json);
  const intent = parseJsonObject(intentJson, "job intent");
  const canonicalIntentJson = serializeCanonicalJsonObject(intent, "job intent");
  const intentFingerprint = assertSha256(String(row.intent_fingerprint), "job intent fingerprint");
  if (intentJson !== canonicalIntentJson || intentFingerprint !== sha256(canonicalIntentJson)) {
    throw new Error("research job intent persistence is invalid");
  }

  return Object.freeze({
    jobId: assertJobId(String(row.job_id)),
    researchRunId: assertResearchRunId(String(row.research_run_id)),
    operation: assertOperation(String(row.operation)),
    clientRequestId: assertClientRequestId(String(row.client_request_id)),
    intent,
    intentFingerprint,
    status: assertJobStatus(String(row.status)),
    progress: parseJsonObject(row.progress_json, "job progress"),
    errorCode: assertErrorCode(row.error_code),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs"),
    startedAtMs: optionalTimestamp(row.started_at_ms, "startedAtMs"),
    finishedAtMs: optionalTimestamp(row.finished_at_ms, "finishedAtMs"),
    updatedAtMs: assertSafeTimestamp(row.updated_at_ms, "updatedAtMs")
  });
}

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

function idempotencyConflict() {
  const error = new Error("clientRequestId was already used with different normalized intent");
  error.code = "RESEARCH_IDEMPOTENCY_CONFLICT";
  return error;
}

async function validateBaseLedger(connection) {
  const present = new Set(await tableNames(connection));
  const missingBase = BASE_TABLES.filter((table) => !present.has(table));
  if (missingBase.length > 0) {
    throw new Error(`Research job ledger requires base research tables: ${missingBase.join(", ")}`);
  }

  const baseInfo = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (baseInfo.length !== 1 || Number(baseInfo[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research job ledger requires the supported base research ledger schema");
  }

  return present;
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = await validateBaseLedger(connection);
  const presentJobTables = JOB_TABLES.filter((table) => present.has(table));

  if (presentJobTables.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_JOB_INFO);
      await connection.run(CREATE_RESEARCH_JOBS);
      await connection.run(
        `INSERT INTO research_job_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: RESEARCH_JOB_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }

  const missing = JOB_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research job ledger is missing required tables: ${missing.join(", ")}`);
  }

  const info = await queryRows(connection, "SELECT schema_version FROM research_job_info");
  if (info.length !== 1) {
    throw new Error("Research job ledger must contain exactly one schema version row");
  }
  const schemaVersion = Number(info[0].schema_version);
  if (schemaVersion !== RESEARCH_JOB_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported research job schema version ${schemaVersion}; expected ${RESEARCH_JOB_SCHEMA_VERSION}`
    );
  }
}

async function reconcileInterruptedRunningJobs(connection, timestamp) {
  await connection.run(
    `UPDATE research_jobs
     SET status = 'FAILED',
         error_code = 'RESEARCH_JOB_INTERRUPTED',
         finished_at_ms = $timestamp,
         updated_at_ms = $timestamp
     WHERE status = 'RUNNING'`,
    { timestamp }
  );
}

export async function openResearchJobLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  jobIdFactory = () => `job_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof jobIdFactory !== "function") {
    throw new TypeError("jobIdFactory must be a function");
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const openedAtMs = assertSafeTimestamp(now(), "now()");
    await bootstrapOrValidate(connection, openedAtMs);
    await reconcileInterruptedRunningJobs(connection, openedAtMs);
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  async function requireRun(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    const rows = await queryRows(
      connection,
      `SELECT research_run_id
       FROM research_runs
       WHERE research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length !== 1) {
      if (rows.length === 0) throw new Error("Research Run was not found");
      throw new Error("research_runs violated research_run_id uniqueness");
    }
    return runId;
  }

  async function getJob(researchRunId, jobId) {
    const runId = assertResearchRunId(researchRunId);
    const durableJobId = assertJobId(jobId);
    const rows = await queryRows(
      connection,
      `SELECT ${JOB_COLUMNS}
       FROM research_jobs
       WHERE research_run_id = $researchRunId
         AND job_id = $jobId
       LIMIT 2`,
      { researchRunId: runId, jobId: durableJobId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("research_jobs violated scoped job identity uniqueness");
    }
    return normalizeJob(rows[0]);
  }

  async function requireJob(researchRunId, jobId) {
    const current = await getJob(researchRunId, jobId);
    if (!current) throw new Error("Research Job was not found in this Research Run");
    return current;
  }

  async function getJobByRequest(researchRunId, operation, clientRequestId) {
    const rows = await queryRows(
      connection,
      `SELECT ${JOB_COLUMNS}
       FROM research_jobs
       WHERE research_run_id = $researchRunId
         AND operation = $operation
         AND client_request_id = $clientRequestId
       LIMIT 2`,
      { researchRunId, operation, clientRequestId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("research_jobs violated request idempotency uniqueness");
    }
    return normalizeJob(rows[0]);
  }

  async function transitionTerminal(researchRunId, jobId, {
    targetStatus,
    errorCode,
    idempotentErrorCode = undefined
  }) {
    const runId = await requireRun(researchRunId);
    const durableJobId = assertJobId(jobId);
    let result;

    await inTransaction(connection, async () => {
      const current = await requireJob(runId, durableJobId);
      if (current.status === targetStatus) {
        if (idempotentErrorCode !== undefined && current.errorCode !== idempotentErrorCode) {
          throw new Error(`Research Job ${targetStatus} error code does not match the existing terminal state`);
        }
        result = current;
        return;
      }
      if (targetStatus === "CANCELLED") {
        if (current.status !== "QUEUED" && current.status !== "RUNNING") {
          throw new Error(`Research Job cannot cancel from ${current.status}`);
        }
      } else if (current.status !== "RUNNING") {
        throw new Error(`Research Job cannot transition to ${targetStatus} from ${current.status}`);
      }

      const timestamp = assertSafeTimestamp(now(), "now()");
      await connection.run(
        `UPDATE research_jobs
         SET status = $targetStatus,
             error_code = $errorCode,
             finished_at_ms = $timestamp,
             updated_at_ms = $timestamp
         WHERE research_run_id = $researchRunId
           AND job_id = $jobId
           AND status = $currentStatus`,
        {
          researchRunId: runId,
          jobId: durableJobId,
          currentStatus: current.status,
          targetStatus,
          errorCode,
          timestamp
        }
      );
      result = await requireJob(runId, durableJobId);
      if (result.status !== targetStatus || result.errorCode !== errorCode) {
        throw new Error(`Research Job ${targetStatus} transition did not persist atomically`);
      }
    });

    return result;
  }

  return Object.freeze({
    schemaVersion: RESEARCH_JOB_SCHEMA_VERSION,

    async createJob({ researchRunId, operation, clientRequestId, intent }) {
      const runId = assertResearchRunId(researchRunId);
      const operationId = assertOperation(operation);
      const requestId = assertClientRequestId(clientRequestId);
      const intentJson = serializeCanonicalJsonObject(intent, "intent");
      const intentFingerprint = sha256(intentJson);
      let createdOrExisting;

      await inTransaction(connection, async () => {
        await requireRun(runId);
        const existing = await getJobByRequest(runId, operationId, requestId);
        if (existing) {
          if (existing.intentFingerprint !== intentFingerprint) {
            throw idempotencyConflict();
          }
          createdOrExisting = existing;
          return;
        }

        const jobId = assertJobId(jobIdFactory());
        const timestamp = assertSafeTimestamp(now(), "now()");
        await connection.run(
          `INSERT INTO research_jobs (
             job_id,
             research_run_id,
             operation,
             client_request_id,
             intent_json,
             intent_fingerprint,
             status,
             progress_json,
             error_code,
             created_at_ms,
             started_at_ms,
             finished_at_ms,
             updated_at_ms
           )
           VALUES (
             $jobId,
             $researchRunId,
             $operation,
             $clientRequestId,
             $intentJson,
             $intentFingerprint,
             'QUEUED',
             '{}',
             NULL,
             $timestamp,
             NULL,
             NULL,
             $timestamp
           )`,
          {
            jobId,
            researchRunId: runId,
            operation: operationId,
            clientRequestId: requestId,
            intentJson,
            intentFingerprint,
            timestamp
          }
        );
        createdOrExisting = await requireJob(runId, jobId);
      });

      return createdOrExisting;
    },

    async getJob(researchRunId, jobId) {
      return getJob(researchRunId, jobId);
    },

    async listJobs(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${JOB_COLUMNS}
         FROM research_jobs
         WHERE research_run_id = $researchRunId
         ORDER BY created_at_ms ASC, job_id ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeJob));
    },

    async updateJobProgress(researchRunId, jobId, progress) {
      const runId = await requireRun(researchRunId);
      const durableJobId = assertJobId(jobId);
      const progressJson = serializeCanonicalJsonObject(progress, "progress", MAX_PROGRESS_CHARS);
      let result;

      await inTransaction(connection, async () => {
        const current = await requireJob(runId, durableJobId);
        if (current.status !== "QUEUED" && current.status !== "RUNNING") {
          throw new Error(`Research Job progress cannot change after ${current.status}`);
        }
        const timestamp = assertSafeTimestamp(now(), "now()");
        await connection.run(
          `UPDATE research_jobs
           SET progress_json = $progressJson,
               updated_at_ms = $timestamp
           WHERE research_run_id = $researchRunId
             AND job_id = $jobId
             AND status = $currentStatus`,
          {
            researchRunId: runId,
            jobId: durableJobId,
            currentStatus: current.status,
            progressJson,
            timestamp
          }
        );
        result = await requireJob(runId, durableJobId);
        if (serializeCanonicalJsonObject(result.progress, "progress", MAX_PROGRESS_CHARS) !== progressJson) {
          throw new Error("Research Job progress update did not persist atomically");
        }
      });

      return result;
    },

    async markJobRunning(researchRunId, jobId) {
      const runId = await requireRun(researchRunId);
      const durableJobId = assertJobId(jobId);
      let result;

      await inTransaction(connection, async () => {
        const current = await requireJob(runId, durableJobId);
        if (current.status === "RUNNING") {
          result = current;
          return;
        }
        if (current.status !== "QUEUED") {
          throw new Error(`Research Job cannot start from ${current.status}`);
        }
        const timestamp = assertSafeTimestamp(now(), "now()");
        await connection.run(
          `UPDATE research_jobs
           SET status = 'RUNNING',
               started_at_ms = $timestamp,
               updated_at_ms = $timestamp
           WHERE research_run_id = $researchRunId
             AND job_id = $jobId
             AND status = 'QUEUED'`,
          { researchRunId: runId, jobId: durableJobId, timestamp }
        );
        result = await requireJob(runId, durableJobId);
        if (result.status !== "RUNNING") {
          throw new Error("Research Job start transition did not persist atomically");
        }
      });

      return result;
    },

    async markJobSucceeded(researchRunId, jobId) {
      return transitionTerminal(researchRunId, jobId, {
        targetStatus: "SUCCEEDED",
        errorCode: null
      });
    },

    async markJobFailed(researchRunId, jobId, errorCode = "RESEARCH_JOB_FAILED") {
      const stableErrorCode = assertErrorCode(errorCode);
      if (stableErrorCode === null) {
        throw new TypeError("errorCode is required for FAILED jobs");
      }
      return transitionTerminal(researchRunId, jobId, {
        targetStatus: "FAILED",
        errorCode: stableErrorCode,
        idempotentErrorCode: stableErrorCode
      });
    },

    async finalizeJobCancelled(researchRunId, jobId) {
      return transitionTerminal(researchRunId, jobId, {
        targetStatus: "CANCELLED",
        errorCode: null
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
