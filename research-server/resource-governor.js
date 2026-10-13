import {
  ResearchBudgetExceededError,
  ResearchConcurrencyLimitError,
  createResearchResourceGovernor as createCoreResearchResourceGovernor
} from "./resource-governor-core.js";

export { ResearchBudgetExceededError, ResearchConcurrencyLimitError };

export const DEFAULT_RESEARCH_QUEUE_WAIT_TIMEOUT_MS = 60_000;
export const RESEARCH_QUEUE_WAIT_TIMEOUT_ENV = "MARKET_FLOW_US_RESEARCH_QUEUE_WAIT_TIMEOUT_MS";

function assertPositiveTimeoutMs(value, label) {
  const number = typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}

export function resolveResearchQueueWaitTimeoutMs(
  concurrency,
  environment = process.env
) {
  if (concurrency?.maxQueueWaitMs !== undefined) {
    return assertPositiveTimeoutMs(concurrency.maxQueueWaitMs, "maxQueueWaitMs");
  }
  if (environment?.[RESEARCH_QUEUE_WAIT_TIMEOUT_ENV] !== undefined) {
    return assertPositiveTimeoutMs(
      environment[RESEARCH_QUEUE_WAIT_TIMEOUT_ENV],
      RESEARCH_QUEUE_WAIT_TIMEOUT_ENV
    );
  }
  return DEFAULT_RESEARCH_QUEUE_WAIT_TIMEOUT_MS;
}

export function createResearchResourceGovernor({ concurrency, budgets } = {}) {
  const maxQueueWaitMs = resolveResearchQueueWaitTimeoutMs(concurrency);
  const governor = createCoreResearchResourceGovernor({ concurrency, budgets });

  return Object.freeze({
    ...governor,
    maxQueueWaitMs,
    async acquireJob({ researchRunId, jobId, signal } = {}) {
      if (signal !== undefined && !(signal instanceof AbortSignal)) {
        throw new TypeError("signal must be an AbortSignal");
      }

      const deadline = new AbortController();
      let timedOut = false;
      let callerAborted = false;
      const callerAbort = () => {
        callerAborted = true;
        deadline.abort();
      };
      if (signal?.aborted) callerAbort();
      else signal?.addEventListener("abort", callerAbort, { once: true });

      const timer = setTimeout(() => {
        timedOut = true;
        deadline.abort();
      }, maxQueueWaitMs);
      timer.unref?.();

      try {
        return await governor.acquireJob({
          researchRunId,
          jobId,
          signal: deadline.signal
        });
      } catch (error) {
        if (timedOut && !callerAborted && error?.code === "RESEARCH_QUEUE_CANCELLED") {
          throw new ResearchConcurrencyLimitError(
            `Research Job exceeded the ${maxQueueWaitMs}ms queue-wait ceiling`,
            "RESEARCH_QUEUE_TIMEOUT"
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", callerAbort);
      }
    }
  });
}
