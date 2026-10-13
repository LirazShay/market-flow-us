import {
  ResearchJobCancelledError,
  createResearchJobController as createCoreResearchJobController
} from "./job-control-core.js";

export { ResearchJobCancelledError };

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

function jobKey(researchRunId, jobId) {
  return `${researchRunId}\u0000${jobId}`;
}

function captureStableFailureCode(target, key, error) {
  if (typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)) {
    target.set(key, error.code);
  }
}

export function createResearchJobController({ jobLedger } = {}) {
  if (!jobLedger || typeof jobLedger.markJobFailed !== "function") {
    return createCoreResearchJobController({ jobLedger });
  }

  const failureCodes = new Map();
  const durableLedger = Object.freeze({
    ...jobLedger,
    async markJobFailed(researchRunId, jobId, fallbackCode) {
      const code = failureCodes.get(jobKey(researchRunId, jobId)) ?? fallbackCode;
      return await jobLedger.markJobFailed(researchRunId, jobId, code);
    }
  });
  const controller = createCoreResearchJobController({ jobLedger: durableLedger });

  return Object.freeze({
    ...controller,
    async runJob(options = {}) {
      const key = jobKey(options.researchRunId, options.jobId);
      const work = options.work;
      const commitSuccess = options.commitSuccess;
      const wrappedWork = typeof work === "function"
        ? async (context) => {
            try {
              return await work(context);
            } catch (error) {
              captureStableFailureCode(failureCodes, key, error);
              throw error;
            }
          }
        : work;
      const wrappedCommitSuccess = typeof commitSuccess === "function"
        ? async (value, context) => {
            try {
              return await commitSuccess(value, context);
            } catch (error) {
              captureStableFailureCode(failureCodes, key, error);
              throw error;
            }
          }
        : commitSuccess;

      try {
        return await controller.runJob({
          ...options,
          work: wrappedWork,
          commitSuccess: wrappedCommitSuccess
        });
      } finally {
        failureCodes.delete(key);
      }
    }
  });
}
