import { evaluateBacktestOutcomes } from "../backtest-lab/outcome-evaluator.js";
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

async function openInterruptibleEvidenceSource(input, signal) {
  throwIfAborted(signal);
  const evidence = await openBacktestEvidenceSource(input);
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

  const { signal: _signal, ...request } = input;
  throwIfAborted(signal);

  const execution = await executeAuthoritativeExperimentBatch({
    ...request,
    executeSweep: async (sweepInput) => {
      throwIfAborted(signal);
      const sweep = await executeBacktestSweep({
        ...sweepInput,
        resolveBaselines: async (baselineInput) => {
          throwIfAborted(signal);
          const resolved = await resolveBacktestBaselineSeries({ ...baselineInput, signal });
          throwIfAborted(signal);
          return resolved;
        },
        openHistoricalScanner: async (scannerInput) => {
          throwIfAborted(signal);
          return await openBacktestHistoricalScanner({ ...scannerInput, signal });
        },
        openEvidenceSource: async (evidenceInput) => {
          return await openInterruptibleEvidenceSource(evidenceInput, signal);
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
