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
  const signal = assertAbortSignal(input.signal);
  if (signal === null) {
    return await executeAuthoritativeExperimentBatch(input);
  }

  const duckdbResourceLimits = resolveResearchDuckDbResourceLimits(input.duckdbResourceLimits);
  const {
    signal: _signal,
    duckdbResourceLimits: _duckdbResourceLimits,
    ...request
  } = input;
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
}
