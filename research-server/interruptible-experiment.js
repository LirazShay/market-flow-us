import { evaluateBacktestOutcomes } from "../backtest-lab/outcome-evaluator.js";
import {
  resolveResearchDuckDbResourceLimits
} from "../backtest-lab/duckdb-resource-limits.js";
import { openBacktestEvidenceSource } from "../backtest-lab/evidence-source.js";
import {
  openBacktestHistoricalScanner,
  resolveBacktestBaselineSeries
} from "../backtest-lab/historical-scanner.js";
import { executeBacktestSweep } from "../backtest-lab/sweep-execution.js";
import { executeAuthoritativeExperimentBatch } from "./experiment-authority.js";

export const DEFAULT_RESEARCH_EXPERIMENT_TIMEOUT_MS = 60_000;
export const RESEARCH_EXPERIMENT_TIMEOUT_ENV = "MARKET_FLOW_US_RESEARCH_EXPERIMENT_TIMEOUT_MS";

function assertPositiveTimeoutMs(value, label) {
  const number = typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
}

export function resolveResearchExperimentTimeoutMs(
  explicitTimeoutMs,
  environment = process.env
) {
  if (explicitTimeoutMs !== undefined) {
    return assertPositiveTimeoutMs(explicitTimeoutMs, "experimentTimeoutMs");
  }
  if (environment?.[RESEARCH_EXPERIMENT_TIMEOUT_ENV] !== undefined) {
    return assertPositiveTimeoutMs(
      environment[RESEARCH_EXPERIMENT_TIMEOUT_ENV],
      RESEARCH_EXPERIMENT_TIMEOUT_ENV
    );
  }
  return DEFAULT_RESEARCH_EXPERIMENT_TIMEOUT_MS;
}

function experimentTimeoutError(timeoutMs) {
  const error = new Error(`Research Experiment exceeded the ${timeoutMs}ms execution ceiling`);
  error.code = "RESEARCH_EXPERIMENT_TIMEOUT";
  return error;
}

function assertAbortSignal(signal) {
  if (signal === undefined || signal === null) return null;
  if (
    typeof signal !== "object"
    || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function"
  ) {
    throw new TypeError("experiment execution signal must be an AbortSignal");
  }
  return signal;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  const error = new Error("Experiment execution was aborted");
  error.name = "AbortError";
  throw error;
}

async function openInterruptibleEvidenceSource(input, signal, duckdbResourceLimits) {
  throwIfAborted(signal);
  const evidence = await openBacktestEvidenceSource({ ...input, duckdbResourceLimits });
  let closed = false;
  const interrupt = () => {
    try {
      evidence.connection.interrupt();
    } catch {
      // Cancellation remains observable through AbortSignal even if interrupt races close.
    }
  };

  signal.addEventListener("abort", interrupt, { once: true });
  if (signal.aborted) interrupt();

  return Object.freeze({
    ...evidence,
    async close() {
      if (closed) return;
      closed = true;
      signal.removeEventListener("abort", interrupt);
      await evidence.close();
    }
  });
}

export async function executeInterruptibleAuthoritativeExperimentBatch(input = {}) {
  const callerSignal = assertAbortSignal(input.signal);
  const timeoutMs = resolveResearchExperimentTimeoutMs(input.experimentTimeoutMs);
  const deadline = new AbortController();
  let abortReason = null;
  const callerAbort = () => {
    if (abortReason !== null) return;
    abortReason = "CALLER";
    deadline.abort();
  };
  if (callerSignal?.aborted) callerAbort();
  else callerSignal?.addEventListener("abort", callerAbort, { once: true });

  const timer = setTimeout(() => {
    if (abortReason !== null) return;
    abortReason = "TIMEOUT";
    deadline.abort();
  }, timeoutMs);
  timer.unref?.();

  const signal = deadline.signal;
  const duckdbResourceLimits = resolveResearchDuckDbResourceLimits(input.duckdbResourceLimits);
  const {
    signal: _signal,
    experimentTimeoutMs: _experimentTimeoutMs,
    duckdbResourceLimits: _duckdbResourceLimits,
    ...request
  } = input;

  try {
    throwIfAborted(signal);

    const execution = await executeAuthoritativeExperimentBatch({
      ...request,
      executeSweep: async (sweepInput) => {
        throwIfAborted(signal);
        const sweep = await executeBacktestSweep({
          ...sweepInput,
          resolveBaselines: async (baselineInput) => {
            throwIfAborted(signal);
            const resolved = await resolveBacktestBaselineSeries({
              ...baselineInput,
              signal,
              duckdbResourceLimits
            });
            throwIfAborted(signal);
            return resolved;
          },
          openHistoricalScanner: async (scannerInput) => {
            throwIfAborted(signal);
            return await openBacktestHistoricalScanner({
              ...scannerInput,
              signal,
              duckdbResourceLimits
            });
          },
          openEvidenceSource: async (evidenceInput) => {
            return await openInterruptibleEvidenceSource(
              evidenceInput,
              signal,
              duckdbResourceLimits
            );
          },
          evaluateOutcomes: async (outcomeInput) => {
            throwIfAborted(signal);
            const result = await evaluateBacktestOutcomes(outcomeInput);
            throwIfAborted(signal);
            return result;
          }
        });
        throwIfAborted(signal);
        return sweep;
      }
    });

    throwIfAborted(signal);
    return execution;
  } catch (error) {
    if (abortReason === "TIMEOUT") throw experimentTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", callerAbort);
  }
}
