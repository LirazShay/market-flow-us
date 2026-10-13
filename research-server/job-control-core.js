export class ResearchJobCancelledError extends Error {
  constructor(message = "Research Job was cancelled") {
    super(message);
    this.name = "ResearchJobCancelledError";
    this.code = "RESEARCH_JOB_CANCELLED";
  }
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

function jobKey(researchRunId, jobId) {
  return `${researchRunId}\u0000${jobId}`;
}

function requireJobLedger(jobLedger) {
  const methods = [
    "getJob",
    "markJobRunning",
    "markJobSucceeded",
    "markJobFailed",
    "finalizeJobCancelled"
  ];
  if (!jobLedger || methods.some((name) => typeof jobLedger[name] !== "function")) {
    throw new TypeError("jobLedger must expose the durable Research Job transition API");
  }
  return jobLedger;
}

function invokeCancelHandler(entry) {
  if (!entry.cancelHandler || entry.cancelHandlerInvokedVersion === entry.cancelHandlerVersion) return;
  const handler = entry.cancelHandler;
  entry.cancelHandlerInvokedVersion = entry.cancelHandlerVersion;
  entry.cancelHandlerPromise = Promise.resolve()
    .then(() => handler())
    .catch((error) => {
      entry.cancelHandlerError = error;
    });
}

function cancellationResult(accepted, job, reason) {
  return Object.freeze({ accepted, job, reason });
}

export function createResearchJobController({ jobLedger } = {}) {
  const durableJobs = requireJobLedger(jobLedger);
  const active = new Map();
  const controlTails = new Map();

  async function serialize(key, operation) {
    const previous = controlTails.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    controlTails.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (controlTails.get(key) === current) controlTails.delete(key);
    }
  }

  async function beginSuccessCommit(entry) {
    return await serialize(entry.key, async () => {
      if (entry.abortController.signal.aborted) {
        throw new ResearchJobCancelledError();
      }
      if (entry.finishing === null) {
        entry.finishing = "SUCCEEDED";
        return;
      }
      if (entry.finishing !== "SUCCEEDED") {
        throw new Error(`Research Job cannot enter success commit while finishing as ${entry.finishing}`);
      }
    });
  }

  function contextFor(entry) {
    return Object.freeze({
      signal: entry.abortController.signal,
      checkpoint() {
        if (entry.abortController.signal.aborted) {
          throw new ResearchJobCancelledError();
        }
      },
      async beginSuccessCommit() {
        return await beginSuccessCommit(entry);
      },
      setCancelHandler(handler) {
        if (handler !== null && typeof handler !== "function") {
          throw new TypeError("cancel handler must be a function or null");
        }
        entry.cancelHandlerVersion += 1;
        const version = entry.cancelHandlerVersion;
        entry.cancelHandler = handler;
        if (entry.abortController.signal.aborted) invokeCancelHandler(entry);
        return () => {
          if (entry.cancelHandlerVersion !== version) return;
          entry.cancelHandlerVersion += 1;
          entry.cancelHandler = null;
        };
      }
    });
  }

  async function finishCancelled(entry) {
    return await serialize(entry.key, async () => {
      if (!entry.finishing) entry.finishing = "CANCELLED";
      const current = await durableJobs.getJob(entry.researchRunId, entry.jobId);
      if (!current) throw new Error("Research Job disappeared before cancellation finalization");
      if (current.status === "CANCELLED") return current;
      if (current.status !== "RUNNING" && current.status !== "QUEUED") {
        throw new Error(`Research Job cancellation lost terminal race to ${current.status}`);
      }
      return await durableJobs.finalizeJobCancelled(entry.researchRunId, entry.jobId);
    });
  }

  return Object.freeze({
    async runJob({
      researchRunId,
      jobId,
      work,
      commitSuccess = null,
      failureCode = "RESEARCH_JOB_FAILED"
    } = {}) {
      const runId = assertResearchRunId(researchRunId);
      const durableJobId = assertJobId(jobId);
      if (typeof work !== "function") throw new TypeError("work must be a function");
      if (commitSuccess !== null && typeof commitSuccess !== "function") {
        throw new TypeError("commitSuccess must be a function or null");
      }

      const key = jobKey(runId, durableJobId);
      let entry;
      await serialize(key, async () => {
        if (active.has(key)) throw new Error("Research Job is already active in this controller");
        await durableJobs.markJobRunning(runId, durableJobId);
        entry = {
          key,
          researchRunId: runId,
          jobId: durableJobId,
          abortController: new AbortController(),
          cancelHandler: null,
          cancelHandlerVersion: 0,
          cancelHandlerInvokedVersion: -1,
          cancelHandlerPromise: null,
          cancelHandlerError: null,
          finishing: null
        };
        active.set(key, entry);
      });

      const context = contextFor(entry);
      try {
        const workValue = await work(context);
        context.checkpoint();
        if (commitSuccess !== null) await beginSuccessCommit(entry);
        const committedValue = commitSuccess === null
          ? workValue
          : await commitSuccess(workValue, context);
        context.checkpoint();

        let terminalJob;
        await serialize(key, async () => {
          if (entry.abortController.signal.aborted) {
            throw new ResearchJobCancelledError();
          }
          if (entry.finishing === null) entry.finishing = "SUCCEEDED";
          if (entry.finishing !== "SUCCEEDED") {
            throw new Error(`Research Job cannot succeed while finishing as ${entry.finishing}`);
          }
          terminalJob = await durableJobs.markJobSucceeded(runId, durableJobId);
        });
        return Object.freeze({ value: committedValue, job: terminalJob });
      } catch (error) {
        if (entry.abortController.signal.aborted || error?.code === "RESEARCH_JOB_CANCELLED") {
          await finishCancelled(entry);
          if (error?.code === "RESEARCH_JOB_CANCELLED") throw error;
          throw new ResearchJobCancelledError();
        }

        await serialize(key, async () => {
          entry.finishing = "FAILED";
          await durableJobs.markJobFailed(runId, durableJobId, failureCode);
        });
        throw error;
      } finally {
        await serialize(key, async () => {
          if (active.get(key) === entry) active.delete(key);
        });
      }
    },

    async cancelJob(researchRunId, jobId) {
      const runId = assertResearchRunId(researchRunId);
      const durableJobId = assertJobId(jobId);
      const key = jobKey(runId, durableJobId);

      return await serialize(key, async () => {
        const current = await durableJobs.getJob(runId, durableJobId);
        if (!current) throw new Error("Research Job was not found in this Research Run");

        if (current.status === "CANCELLED") {
          return cancellationResult(true, current, "ALREADY_CANCELLED");
        }
        if (current.status === "QUEUED") {
          const cancelled = await durableJobs.finalizeJobCancelled(runId, durableJobId);
          return cancellationResult(true, cancelled, "CANCELLED_BEFORE_START");
        }
        if (current.status === "SUCCEEDED" || current.status === "FAILED") {
          return cancellationResult(false, current, "ALREADY_TERMINAL");
        }

        const entry = active.get(key);
        if (!entry || entry.finishing !== null) {
          return cancellationResult(false, current, "CANCELLATION_NOT_AVAILABLE");
        }

        if (!entry.abortController.signal.aborted) {
          entry.abortController.abort();
        }
        invokeCancelHandler(entry);
        return cancellationResult(true, current, "CANCELLATION_REQUESTED");
      });
    },

    isActive(researchRunId, jobId) {
      const runId = assertResearchRunId(researchRunId);
      const durableJobId = assertJobId(jobId);
      return active.has(jobKey(runId, durableJobId));
    }
  });
}