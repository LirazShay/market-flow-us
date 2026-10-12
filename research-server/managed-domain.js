import { createHash } from "node:crypto";

import { openResearchDomain } from "./domain.js";
import { createResearchJobController } from "./job-control.js";
import { openResearchJobLedger } from "./job-ledger.js";
import { createResearchResourceGovernor } from "./resource-governor.js";
import { openResearchResultLedger } from "./result-ledger.js";

const MANAGED_EXPERIMENT_KEYS = new Set([
  "clientRequestId",
  "researchRunId",
  "objectiveVersionId",
  "partitionId",
  "sourceId",
  "queryArtifactIds",
  "fromAtMs",
  "toAtMs",
  "intervalValue",
  "intervalUnit",
  "topX",
  "horizonsMs"
]);
const MANAGED_SQL_KEYS = new Set([
  "clientRequestId",
  "researchRunId",
  "partitionId",
  "experimentIds",
  "sql",
  "purpose",
  "outputMode"
]);
const SQL_PURPOSES = new Set(["PROFILE", "DEBUG", "HYPOTHESIS", "AGGREGATE", "OTHER_BOUNDED"]);
const SQL_OUTPUT_MODES = new Set(["PREVIEW", "PAGED_RESULT", "AGGREGATE"]);
const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const FORBIDDEN_TEXT = /(?:authorization|cookie|set-cookie|password|passwd|api[-_ ]?key|client[-_ ]?secret|access[-_ ]?token|refresh[-_ ]?token|session(?:id)?|account(?:id|number))\s*[:=]\s*\S+/iu;
const BEARER_TEXT = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu;
const MAX_SQL_BYTES = 1024 * 1024;

function jobKey(researchRunId, jobId) {
  return `${researchRunId}\u0000${jobId}`;
}

async function withComponent(opener, options, operation) {
  const component = await opener(options);
  try {
    return await operation(component);
  } finally {
    await component.close();
  }
}

function assertExactKeys(input, allowed, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`);
  }
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new TypeError(`${key} is not part of ${label}`);
  }
  return input;
}

function assertPublicSafeText(value, label) {
  if (typeof value !== "string" || FORBIDDEN_TEXT.test(value) || BEARER_TEXT.test(value)) {
    throw new TypeError(`${label} contains content that is not public-safe research data`);
  }
  return value;
}

function assertResourcePolicy(resourcePolicy) {
  if (!resourcePolicy || typeof resourcePolicy !== "object" || Array.isArray(resourcePolicy)) {
    throw new TypeError("resourcePolicy is required for managed research execution");
  }
  const budgets = resourcePolicy.budgets;
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    throw new TypeError("resourcePolicy.budgets is required");
  }
  for (const scope of ["server", "run", "job", "request", "sqlAnalysis"]) {
    if (!budgets[scope] || typeof budgets[scope] !== "object" || Array.isArray(budgets[scope])) {
      throw new TypeError(`resourcePolicy.budgets.${scope} is required`);
    }
    for (const dimension of ["workUnits", "t0Evaluations", "resultRows", "resultBytes"]) {
      if (!Number.isSafeInteger(budgets[scope][dimension]) || budgets[scope][dimension] < 1) {
        throw new TypeError(`resourcePolicy.budgets.${scope}.${dimension} must be a positive safe integer`);
      }
    }
  }
  return resourcePolicy;
}

function experimentIntent(input) {
  const request = assertExactKeys(input, MANAGED_EXPERIMENT_KEYS, "managed development experiment request");
  return Object.freeze({
    researchRunId: request.researchRunId,
    objectiveVersionId: request.objectiveVersionId,
    partitionId: request.partitionId,
    sourceId: request.sourceId,
    queryArtifactIds: request.queryArtifactIds,
    fromAtMs: request.fromAtMs,
    toAtMs: request.toAtMs,
    intervalValue: request.intervalValue,
    intervalUnit: request.intervalUnit,
    topX: request.topX,
    horizonsMs: request.horizonsMs
  });
}

function deterministicAnalysisId(researchRunId, clientRequestId) {
  const hex = createHash("sha256")
    .update(`research-sql\u0000${researchRunId}\u0000${clientRequestId}`, "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `analysis_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function sqlIntent(input) {
  const request = assertExactKeys(input, MANAGED_SQL_KEYS, "managed development research SQL request");
  const sql = assertPublicSafeText(request.sql, "research SQL");
  if (sql.trim().length === 0 || Buffer.byteLength(sql, "utf8") > MAX_SQL_BYTES) {
    throw new TypeError(`research SQL must be non-empty UTF-8 text of at most ${MAX_SQL_BYTES} bytes`);
  }
  if (!SQL_PURPOSES.has(request.purpose)) throw new TypeError("research SQL purpose is invalid");
  if (!SQL_OUTPUT_MODES.has(request.outputMode)) throw new TypeError("research SQL outputMode is invalid");
  return Object.freeze({
    researchRunId: request.researchRunId,
    partitionId: request.partitionId,
    experimentIds: request.experimentIds ?? [],
    sql,
    purpose: request.purpose,
    outputMode: request.outputMode
  });
}

function estimatedT0Count(input) {
  if (!Number.isSafeInteger(input.fromAtMs) || !Number.isSafeInteger(input.toAtMs) || input.toAtMs < input.fromAtMs) return 0;
  const unitMs = input.intervalUnit === "seconds" ? 1000 : input.intervalUnit === "minutes" ? 60_000 : null;
  if (unitMs === null || !Number.isSafeInteger(input.intervalValue) || input.intervalValue < 1) return 0;
  const intervalMs = input.intervalValue * unitMs;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) return 0;
  const count = Math.floor((input.toAtMs - input.fromAtMs) / intervalMs) + 1;
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function resultBytes(rows) {
  return Buffer.byteLength(JSON.stringify(rows), "utf8");
}

function rowsFromSqlResult(result) {
  if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows)) {
    throw new Error("Research SQL returned an invalid bounded result");
  }
  const names = result.columns.map((column) => String(column.name));
  return {
    columns: result.columns.map((column) => Object.freeze({
      name: String(column.name),
      type: String(column.type ?? "UNKNOWN"),
      nullable: true
    })),
    rows: result.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== names.length) {
        throw new Error("Research SQL row shape does not match its columns");
      }
      return Object.fromEntries(names.map((name, index) => [name, row[index]]));
    })
  };
}

function resultReference(result) {
  return Object.freeze({
    resultHandle: result.resultHandle,
    resultKind: result.resultKind,
    rowCount: result.rowCount,
    serializedBytes: result.serializedBytes
  });
}

function cancellationPossible(job) {
  return job.status === "QUEUED" || job.status === "RUNNING";
}

export async function openManagedResearchDomain(options = {}) {
  const resourcePolicy = assertResourcePolicy(options.resourcePolicy);
  const base = await openResearchDomain(options);
  const jobSchemaVersion = await withComponent(
    openResearchJobLedger,
    options,
    async (jobLedger) => jobLedger.schemaVersion
  );
  const resultSchemaVersion = await withComponent(
    openResearchResultLedger,
    options,
    async (results) => results.schemaVersion
  );
  const governor = createResearchResourceGovernor({
    concurrency: resourcePolicy.concurrency,
    budgets: {
      server: resourcePolicy.budgets.server,
      run: resourcePolicy.budgets.run,
      job: resourcePolicy.budgets.job
    }
  });
  const failureCodes = new Map();
  const queueWaits = new Map();
  const background = new Map();
  let accepting = true;
  let activeJobLedger = null;

  async function jobs() {
    if (!activeJobLedger) activeJobLedger = await openResearchJobLedger(options);
    return activeJobLedger;
  }

  async function useResults(operation) {
    return await withComponent(openResearchResultLedger, options, operation);
  }

  const controllerLedger = Object.freeze({
    async getJob(researchRunId, jobId) {
      return await (await jobs()).getJob(researchRunId, jobId);
    },
    async markJobRunning(researchRunId, jobId) {
      return await (await jobs()).markJobRunning(researchRunId, jobId);
    },
    async markJobSucceeded(researchRunId, jobId) {
      return await (await jobs()).markJobSucceeded(researchRunId, jobId);
    },
    async markJobFailed(researchRunId, jobId, fallbackCode) {
      return await (await jobs()).markJobFailed(
        researchRunId,
        jobId,
        failureCodes.get(jobKey(researchRunId, jobId)) ?? fallbackCode
      );
    },
    async finalizeJobCancelled(researchRunId, jobId) {
      return await (await jobs()).finalizeJobCancelled(researchRunId, jobId);
    }
  });
  const controller = createResearchJobController({ jobLedger: controllerLedger });

  function requestScope(jobBudget) {
    return jobBudget.createScope({ kind: "REQUEST", limits: resourcePolicy.budgets.request });
  }

  async function persistProgress(researchRunId, jobId, progress) {
    return await (await jobs()).updateJobProgress(researchRunId, jobId, progress);
  }

  async function safeFailureProgress(researchRunId, jobId, error, budget) {
    try {
      await persistProgress(researchRunId, jobId, {
        completedUnits: 0,
        totalUnits: 1,
        resultHandles: [],
        budget: budget?.snapshot() ?? [],
        failure: { code: typeof error?.code === "string" ? error.code : "RESEARCH_JOB_FAILED" }
      });
    } catch {
      // Preserve the original execution failure; the durable Job state remains authoritative.
    }
  }

  async function runWithFailureCode(researchRunId, jobId, operation) {
    const key = jobKey(researchRunId, jobId);
    try {
      return await operation();
    } catch (error) {
      if (typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)) {
        failureCodes.set(key, error.code);
      }
      throw error;
    }
  }

  async function failQueuedAdmission(job, error) {
    const key = jobKey(job.researchRunId, job.jobId);
    if (typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)) {
      failureCodes.set(key, error.code);
    }
    try {
      await controller.runJob({
        researchRunId: job.researchRunId,
        jobId: job.jobId,
        work: async () => { throw error; }
      });
    } catch {
      // Durable FAILED is the observable outcome.
    } finally {
      failureCodes.delete(key);
    }
  }

  function launch(job, work) {
    const key = jobKey(job.researchRunId, job.jobId);
    if (job.status !== "QUEUED" || background.has(key)) return;
    const queueAbort = new AbortController();
    queueWaits.set(key, queueAbort);
    const task = (async () => {
      let lease = null;
      try {
        lease = await governor.acquireJob({
          researchRunId: job.researchRunId,
          jobId: job.jobId,
          signal: queueAbort.signal
        });
        queueWaits.delete(key);
        if (queueAbort.signal.aborted) return;
        await runWithFailureCode(job.researchRunId, job.jobId, async () => {
          await controller.runJob({ researchRunId: job.researchRunId, jobId: job.jobId, work });
        });
      } catch (error) {
        const current = await (await jobs()).getJob(job.researchRunId, job.jobId);
        if (current?.status === "CANCELLED" || error?.code === "RESEARCH_JOB_CANCELLED") return;
        if (current?.status === "QUEUED") await failQueuedAdmission(current, error);
      } finally {
        queueWaits.delete(key);
        lease?.release();
        failureCodes.delete(key);
        background.delete(key);
      }
    })();
    background.set(key, { task, researchRunId: job.researchRunId, jobId: job.jobId });
  }

  function launchExperiment(job, intent) {
    launch(job, async (control) => {
      const budget = governor.createJobBudget({ researchRunId: job.researchRunId, jobId: job.jobId });
      const requestBudget = requestScope(budget);
      try {
        requestBudget.consume("workUnits", 1);
        const t0Count = estimatedT0Count(intent);
        if (t0Count > 0) requestBudget.consume("t0Evaluations", t0Count);
        await persistProgress(job.researchRunId, job.jobId, {
          completedUnits: 0,
          totalUnits: 1,
          resultHandles: [],
          budget: requestBudget.snapshot()
        });
        control.checkpoint();
        const experiment = await base.executeDevelopmentExperiment(intent);
        control.checkpoint();
        const summary = await base.getExperimentSummary(job.researchRunId, experiment.experimentId);
        const rows = [{
          experimentId: experiment.experimentId,
          metricSetId: experiment.metricSetId,
          phase: experiment.phase,
          requestFingerprint: experiment.requestFingerprint
        }];
        requestBudget.consume("resultRows", rows.length);
        requestBudget.consume("resultBytes", resultBytes(rows));
        const result = await useResults((results) => results.createResult({
          researchRunId: job.researchRunId,
          sourceJobId: job.jobId,
          resultKind: "EXPERIMENT_SUMMARY",
          columns: [
            { name: "experimentId", type: "VARCHAR", nullable: false },
            { name: "metricSetId", type: "VARCHAR", nullable: false },
            { name: "phase", type: "VARCHAR", nullable: false },
            { name: "requestFingerprint", type: "VARCHAR", nullable: false }
          ],
          rows,
          provenance: {
            experimentId: experiment.experimentId,
            metricSetId: experiment.metricSetId,
            partitionId: experiment.partitionId,
            sourceFingerprint: experiment.request.source.sourceFingerprint
          }
        }));
        await persistProgress(job.researchRunId, job.jobId, {
          completedUnits: 1,
          totalUnits: 1,
          experimentId: experiment.experimentId,
          metricSetId: experiment.metricSetId,
          resultHandles: [resultReference(result)],
          budget: requestBudget.snapshot()
        });
        return { experiment, result, summary };
      } catch (error) {
        await safeFailureProgress(job.researchRunId, job.jobId, error, requestBudget);
        throw error;
      }
    });
  }

  function launchResearchSql(job, intent, analysisId) {
    launch(job, async (control) => {
      const budget = governor.createJobBudget({ researchRunId: job.researchRunId, jobId: job.jobId });
      const requestBudget = requestScope(budget);
      const sqlBudget = requestBudget.createScope({
        kind: "SQL_ANALYSIS",
        limits: resourcePolicy.budgets.sqlAnalysis
      });
      let readerLease = null;
      let session = null;
      let clearCancelHandler = null;
      try {
        sqlBudget.consume("workUnits", 1);
        await persistProgress(job.researchRunId, job.jobId, {
          completedUnits: 0,
          totalUnits: 1,
          analysisId,
          resultHandles: [],
          budget: sqlBudget.snapshot()
        });
        control.checkpoint();
        readerLease = governor.acquireAnalyticalReader({ researchRunId: job.researchRunId, jobId: job.jobId });
        session = await base.openDevelopmentResearchSql({
          researchRunId: intent.researchRunId,
          partitionId: intent.partitionId,
          experimentIds: intent.experimentIds
        });
        clearCancelHandler = control.setCancelHandler(() => session.close());
        control.checkpoint();
        const sqlResult = await session.execute(intent.sql);
        control.checkpoint();
        const bounded = rowsFromSqlResult(sqlResult);
        sqlBudget.consume("resultRows", bounded.rows.length);
        sqlBudget.consume("resultBytes", resultBytes(bounded.rows));
        const result = await useResults((results) => results.createResult({
          researchRunId: job.researchRunId,
          sourceJobId: job.jobId,
          resultKind: "RESEARCH_SQL_RESULT",
          columns: bounded.columns,
          rows: bounded.rows,
          provenance: {
            analysisId,
            partitionId: intent.partitionId,
            experimentIds: intent.experimentIds,
            purpose: intent.purpose,
            outputMode: intent.outputMode
          }
        }));
        await persistProgress(job.researchRunId, job.jobId, {
          completedUnits: 1,
          totalUnits: 1,
          analysisId,
          resultHandles: [resultReference(result)],
          budget: sqlBudget.snapshot()
        });
        return { result };
      } catch (error) {
        await safeFailureProgress(job.researchRunId, job.jobId, error, sqlBudget);
        throw error;
      } finally {
        clearCancelHandler?.();
        await session?.close();
        readerLease?.release();
      }
    });
  }

  async function initializeQueuedProgress(job, extra = {}) {
    if (job.status !== "QUEUED" || Object.keys(job.progress ?? {}).length > 0) return;
    await persistProgress(job.researchRunId, job.jobId, {
      completedUnits: 0,
      totalUnits: 1,
      resultHandles: [],
      budget: [],
      ...extra
    });
  }

  return Object.freeze({
    ...base,
    schemaVersions: Object.freeze({
      ...base.schemaVersions,
      jobs: jobSchemaVersion,
      results: resultSchemaVersion
    }),
    resourceLimits: governor.limits,

    async submitDevelopmentExperiment(input) {
      if (!accepting) throw new Error("Managed Research Domain is closed");
      const intent = experimentIntent(input);
      const job = await (await jobs()).createJob({
        researchRunId: intent.researchRunId,
        operation: "execute_development_experiment",
        clientRequestId: input.clientRequestId,
        intent
      });
      await initializeQueuedProgress(job);
      const current = await (await jobs()).getJob(job.researchRunId, job.jobId);
      if (current.status === "QUEUED") launchExperiment(current, intent);
      return Object.freeze({ researchRunId: current.researchRunId, jobId: current.jobId });
    },

    async submitDevelopmentResearchSql(input) {
      if (!accepting) throw new Error("Managed Research Domain is closed");
      const intent = sqlIntent(input);
      const analysisId = deterministicAnalysisId(intent.researchRunId, input.clientRequestId);
      const job = await (await jobs()).createJob({
        researchRunId: intent.researchRunId,
        operation: "execute_development_research_sql",
        clientRequestId: input.clientRequestId,
        intent
      });
      await initializeQueuedProgress(job, { analysisId });
      const current = await (await jobs()).getJob(job.researchRunId, job.jobId);
      if (current.status === "QUEUED") launchResearchSql(current, intent, analysisId);
      return Object.freeze({ researchRunId: current.researchRunId, analysisId, jobId: current.jobId });
    },

    async getJob(researchRunId, jobId) {
      const job = await (await jobs()).getJob(researchRunId, jobId);
      if (!job) return null;
      return Object.freeze({ ...job, cancellationPossible: cancellationPossible(job) });
    },

    async listJobs(researchRunId, listOptions) {
      const values = await (await jobs()).listJobs(researchRunId, listOptions);
      return Object.freeze(values.map((job) => Object.freeze({
        ...job,
        cancellationPossible: cancellationPossible(job)
      })));
    },

    async cancelJob(researchRunId, jobId) {
      const key = jobKey(researchRunId, jobId);
      queueWaits.get(key)?.abort();
      return await controller.cancelJob(researchRunId, jobId);
    },

    async getResult(researchRunId, resultHandle) {
      return await useResults((results) => results.getResult(researchRunId, resultHandle));
    },

    async getResultPage(researchRunId, resultHandle, pageOptions) {
      return await useResults((results) => results.getResultPage(researchRunId, resultHandle, pageOptions));
    },

    async close() {
      if (!accepting) return;
      accepting = false;
      for (const controllerValue of queueWaits.values()) controllerValue.abort();
      const tasks = [...background.values()];
      await Promise.allSettled(tasks.map(async ({ task, researchRunId, jobId }) => {
        try {
          await controller.cancelJob(researchRunId, jobId);
        } catch {
          // Restart reconciliation remains the final crash boundary.
        }
        await task;
      }));
      await activeJobLedger?.close();
      activeJobLedger = null;
      await base.close();
    }
  });
}
