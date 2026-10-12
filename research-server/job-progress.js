import { DuckDBInstance } from "@duckdb/node-api";

import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING
} from "./ledger.js";

const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const JOB_ID = /^job_[0-9a-f-]{36}$/u;
const MAX_PROGRESS_CHARS = 65_536;

function assertId(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function assertSafeTimestamp(value, label) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return timestamp;
}

function normalizeJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("progress must be JSON serializable");
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("progress must be JSON serializable");
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => normalizeJson(item, ancestors));
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => {
        const item = value[key];
        if (item === undefined || typeof item === "function" || typeof item === "symbol") {
          throw new TypeError("progress must be JSON serializable");
        }
        return [key, normalizeJson(item, ancestors)];
      })
    );
  } finally {
    ancestors.delete(value);
  }
}

function serializeProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    throw new TypeError("progress must be a JSON object");
  }
  const normalized = normalizeJson(progress);
  const serialized = JSON.stringify(normalized);
  if (serialized.length > MAX_PROGRESS_CHARS) {
    throw new TypeError(`progress must serialize to at most ${MAX_PROGRESS_CHARS} characters`);
  }
  return serialized;
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original open/update error.
  }
}

export async function openResearchJobProgressStore({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const tables = await queryRows(
      connection,
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'main'
         AND table_name IN ('research_job_info', 'research_jobs')
       ORDER BY table_name`
    );
    if (tables.length !== 2) {
      throw new Error("Research Job progress requires the durable Research Job ledger");
    }
    await connection.run("SET allowed_configs = []");
    await connection.run("SET lock_configuration = true");
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  return Object.freeze({
    async updateProgress(researchRunId, jobId, progress) {
      if (closed) throw new Error("Research Job progress store is closed");
      const runId = assertId(researchRunId, "researchRunId", RUN_ID);
      const durableJobId = assertId(jobId, "jobId", JOB_ID);
      const progressJson = serializeProgress(progress);
      const timestamp = assertSafeTimestamp(now(), "now()");
      const rows = await queryRows(
        connection,
        `SELECT status
         FROM research_jobs
         WHERE research_run_id = $researchRunId
           AND job_id = $jobId
         LIMIT 2`,
        { researchRunId: runId, jobId: durableJobId }
      );
      if (rows.length !== 1) throw new Error("Research Job was not found in this Research Run");
      const status = String(rows[0].status);
      if (status !== "QUEUED" && status !== "RUNNING") {
        throw new Error(`Research Job progress cannot change after ${status}`);
      }
      await connection.run(
        `UPDATE research_jobs
         SET progress_json = $progressJson,
             updated_at_ms = $timestamp
         WHERE research_run_id = $researchRunId
           AND job_id = $jobId
           AND status = $status`,
        {
          researchRunId: runId,
          jobId: durableJobId,
          progressJson,
          timestamp,
          status
        }
      );
      return JSON.parse(progressJson);
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
