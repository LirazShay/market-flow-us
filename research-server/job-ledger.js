import { DuckDBInstance } from "@duckdb/node-api";

import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING
} from "./ledger.js";
import {
  RESEARCH_JOB_SCHEMA_VERSION,
  openResearchJobLedger as openCoreResearchJobLedger
} from "./job-ledger-core.js";
import {
  RESEARCH_ANALYSIS_OPERATION,
  RESEARCH_EXPERIMENT_OPERATION,
  assertResearchGrowthCapacity,
  normalizeResearchGrowthLimits,
  readResearchSubmissionGrowthState
} from "./growth-governance.js";

export { RESEARCH_JOB_SCHEMA_VERSION };

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const FALLBACK_ERROR_CODE = "RESEARCH_JOB_FAILED";

function requestKey(operation, clientRequestId) {
  return `${operation}\u0000${clientRequestId}`;
}

function mergeDurableCounts(target, durable) {
  target.jobs = Math.max(target.jobs, durable.jobs);
  target.experimentSubmissions = Math.max(
    target.experimentSubmissions,
    durable.experimentSubmissions
  );
  target.analysisSubmissions = Math.max(
    target.analysisSubmissions,
    durable.analysisSubmissions
  );
}

function publicSafeProgress(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return progress;
  const failure = progress.failure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure) || !Object.hasOwn(failure, "code")) {
    return progress;
  }
  if (typeof failure.code === "string" && STABLE_ERROR_CODE.test(failure.code)) return progress;
  return {
    ...progress,
    failure: {
      ...failure,
      code: FALLBACK_ERROR_CODE
    }
  };
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

function progressWithoutResults(progressJson, context) {
  if (typeof progressJson !== "string") {
    throw new Error(`research job progress persistence is invalid during ${context}`);
  }
  let progress;
  try {
    progress = JSON.parse(progressJson);
  } catch {
    throw new Error(`research job progress persistence is invalid during ${context}`);
  }
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    throw new Error(`research job progress persistence is invalid during ${context}`);
  }
  if (!Object.hasOwn(progress, "resultHandles")) return progressJson;
  progress.resultHandles = [];
  return JSON.stringify(progress);
}

async function rollbackQuietly(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original reconciliation error.
  }
}

async function deleteResultArtifacts(connection, researchRunId, jobId) {
  const tableRows = await queryRows(
    connection,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
  );
  const tables = new Set(tableRows.map((row) => String(row.table_name)));
  if (!tables.has("research_results") || !tables.has("research_result_rows")) return;

  const provisionalResults = await queryRows(
    connection,
    `SELECT result_handle
     FROM research_results
     WHERE research_run_id = $researchRunId
       AND source_job_id = $jobId
     ORDER BY result_handle ASC`,
    { researchRunId, jobId }
  );
  for (const row of provisionalResults) {
    const resultHandle = String(row.result_handle);
    await connection.run(
      "DELETE FROM research_result_rows WHERE result_handle = $resultHandle",
      { resultHandle }
    );
    await connection.run(
      `DELETE FROM research_results
       WHERE research_run_id = $researchRunId
         AND result_handle = $resultHandle
         AND source_job_id = $jobId`,
      { researchRunId, resultHandle, jobId }
    );
  }
}

async function removeJobResultArtifacts(options, researchRunId, jobId) {
  const dbPath = options.dbPath ?? DEFAULT_RESEARCH_LEDGER_PATH;
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("BEGIN TRANSACTION");
    try {
      const rows = await queryRows(
        connection,
        `SELECT progress_json
         FROM research_jobs
         WHERE research_run_id = $researchRunId
           AND job_id = $jobId
         LIMIT 2`,
        { researchRunId, jobId }
      );
      if (rows.length !== 1) {
        throw new Error("Research Job was not found uniquely during non-success Result cleanup");
      }

      await deleteResultArtifacts(connection, researchRunId, jobId);
      const progressJson = progressWithoutResults(
        String(rows[0].progress_json),
        "non-success Result cleanup"
      );
      await connection.run(
        `UPDATE research_jobs
         SET progress_json = $progressJson
         WHERE research_run_id = $researchRunId
           AND job_id = $jobId`,
        { researchRunId, jobId, progressJson }
      );
      await connection.run("COMMIT");
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function reconcileInterruptedJobArtifacts(options) {
  const dbPath = options.dbPath ?? DEFAULT_RESEARCH_LEDGER_PATH;
  const now = options.now ?? Date.now;
  if (typeof now !== "function") throw new TypeError("now must be a function");
  const timestamp = Number(now());
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError("now() must be a non-negative safe integer");
  }

  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  try {
    await connection.run("BEGIN TRANSACTION");
    try {
      const nonSuccessfulJobs = await queryRows(
        connection,
        `SELECT job_id, research_run_id, status, progress_json
         FROM research_jobs
         WHERE status IN ('RUNNING', 'FAILED', 'CANCELLED')
         ORDER BY created_at_ms ASC, job_id ASC`
      );

      for (const row of nonSuccessfulJobs) {
        const jobId = String(row.job_id);
        const researchRunId = String(row.research_run_id);
        const status = String(row.status);
        await deleteResultArtifacts(connection, researchRunId, jobId);
        const progressJson = progressWithoutResults(
          String(row.progress_json),
          "restart reconciliation"
        );
        await connection.run(
          `UPDATE research_jobs
           SET progress_json = $progressJson
           WHERE research_run_id = $researchRunId
             AND job_id = $jobId
             AND status = $status`,
          { researchRunId, jobId, status, progressJson }
        );
      }

      await connection.run(
        `UPDATE research_jobs
         SET status = 'FAILED',
             error_code = 'RESEARCH_JOB_INTERRUPTED',
             finished_at_ms = $timestamp,
             updated_at_ms = $timestamp
         WHERE status = 'RUNNING'`,
        { timestamp }
      );
      await connection.run("COMMIT");
    } catch (error) {
      await rollbackQuietly(connection);
      throw error;
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

export async function openResearchJobLedger(options = {}) {
  const growthLimits = normalizeResearchGrowthLimits(options.growthLimits);
  if (options.reconcileInterrupted !== undefined && typeof options.reconcileInterrupted !== "boolean") {
    throw new TypeError("reconcileInterrupted must be boolean");
  }
  const shouldReconcileInterrupted = options.reconcileInterrupted !== false;
  const transientOptions = Object.freeze({ ...options, reconcileInterrupted: false });
  let core = await openCoreResearchJobLedger(transientOptions);
  const schemaVersion = core.schemaVersion;
  if (shouldReconcileInterrupted) {
    await core.close();
    core = null;
    await reconcileInterruptedJobArtifacts(options);
    core = await openCoreResearchJobLedger(transientOptions);
  }

  const runGrowth = new Map();
  let closed = false;
  let coreTail = Promise.resolve();

  async function serializeCore(operation) {
    const previous = coreTail;
    let release;
    coreTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (closed || !core) throw new Error("Research Job Ledger is closed");
      return await operation();
    } finally {
      release();
    }
  }

  async function createGrowthGovernedJob(input) {
    const durable = await readResearchSubmissionGrowthState({
      dbPath: options.dbPath,
      researchRunId: input?.researchRunId,
      operation: input?.operation,
      clientRequestId: input?.clientRequestId
    });
    const runId = input.researchRunId;
    const key = requestKey(input.operation, input.clientRequestId);
    let state = runGrowth.get(runId);
    if (!state) {
      state = {
        counts: { ...durable.counts },
        requestKeys: new Set()
      };
      runGrowth.set(runId, state);
    } else {
      mergeDurableCounts(state.counts, durable.counts);
    }

    if (durable.existingRequest || state.requestKeys.has(key)) {
      state.requestKeys.add(key);
      return await core.createJob(input);
    }

    assertResearchGrowthCapacity({
      growthLimits,
      operation: input.operation,
      counts: state.counts
    });
    const created = await core.createJob(input);
    state.requestKeys.add(key);
    state.counts.jobs += 1;
    if (input.operation === RESEARCH_EXPERIMENT_OPERATION) {
      state.counts.experimentSubmissions += 1;
    }
    if (input.operation === RESEARCH_ANALYSIS_OPERATION) {
      state.counts.analysisSubmissions += 1;
    }
    return created;
  }

  async function cleanupWithFreshCore(researchRunId, jobId) {
    await core.close();
    core = null;
    try {
      await removeJobResultArtifacts(options, researchRunId, jobId);
    } finally {
      core = await openCoreResearchJobLedger(transientOptions);
    }
  }

  return Object.freeze({
    schemaVersion,
    growthLimits,

    async createJob(input) {
      return await serializeCore(async () => {
        if (growthLimits === null) return await core.createJob(input);
        return await createGrowthGovernedJob(input);
      });
    },

    async getJob(researchRunId, jobId) {
      return await serializeCore(() => core.getJob(researchRunId, jobId));
    },

    async listJobs(researchRunId, listOptions) {
      return await serializeCore(() => core.listJobs(researchRunId, listOptions));
    },

    async updateJobProgress(researchRunId, jobId, progress) {
      return await serializeCore(
        () => core.updateJobProgress(researchRunId, jobId, publicSafeProgress(progress))
      );
    },

    async markJobRunning(researchRunId, jobId) {
      return await serializeCore(() => core.markJobRunning(researchRunId, jobId));
    },

    async markJobSucceeded(researchRunId, jobId) {
      return await serializeCore(() => core.markJobSucceeded(researchRunId, jobId));
    },

    async markJobFailed(researchRunId, jobId, errorCode = FALLBACK_ERROR_CODE) {
      return await serializeCore(async () => {
        const current = await core.getJob(researchRunId, jobId);
        if (!current) return await core.markJobFailed(researchRunId, jobId, errorCode);
        if (typeof errorCode !== "string" || !STABLE_ERROR_CODE.test(errorCode)) {
          return await core.markJobFailed(researchRunId, jobId, errorCode);
        }
        if (current.status !== "RUNNING" && current.status !== "FAILED") {
          return await core.markJobFailed(researchRunId, jobId, errorCode);
        }
        if (current.status === "FAILED" && current.errorCode !== errorCode) {
          return await core.markJobFailed(researchRunId, jobId, errorCode);
        }
        await cleanupWithFreshCore(researchRunId, jobId);
        return await core.markJobFailed(researchRunId, jobId, errorCode);
      });
    },

    async finalizeJobCancelled(researchRunId, jobId) {
      return await serializeCore(async () => {
        const current = await core.getJob(researchRunId, jobId);
        if (!current) return await core.finalizeJobCancelled(researchRunId, jobId);
        if (!["QUEUED", "RUNNING", "CANCELLED"].includes(current.status)) {
          return await core.finalizeJobCancelled(researchRunId, jobId);
        }
        await cleanupWithFreshCore(researchRunId, jobId);
        return await core.finalizeJobCancelled(researchRunId, jobId);
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      await coreTail;
      if (core) {
        await core.close();
        core = null;
      }
    }
  });
}
