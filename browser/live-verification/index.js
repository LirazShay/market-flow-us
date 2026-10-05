import { runBoundedLiveVerification } from "./harness.js";
import {
  attachMovementEvidence,
  evaluateMovementEvidence
} from "./movement-evidence.js";

export const LIVE_VERIFICATION_RESULT_KEY = "__MARKET_FLOW_US_LIVE_VERIFICATION_RESULT_V1__";
export const LIVE_VERIFICATION_PROMISE_KEY = "__MARKET_FLOW_US_LIVE_VERIFICATION_PROMISE_V1__";

const CANDIDATE_COMMIT = __MARKET_FLOW_US_CANDIDATE_COMMIT__;

function safeUnexpectedFailure(now = () => Date.now()) {
  const completedAtMs = now();
  return Object.freeze({
    verification: "market-flow-us-real-provider",
    candidateCommit: CANDIDATE_COMMIT,
    providerOriginHost: null,
    transportCspLna: "FAIL",
    lastSuccessfulCheckpoint: null,
    progress: Object.freeze({
      completedCycles: 0,
      commitAckCount: 0,
      universeAckCount: 0,
      lastCycleId: null,
      elapsedMs: 0
    }),
    overall: "FAIL",
    failure: Object.freeze({
      checkpoint: "gate.runtime",
      code: "LIVE_GATE_RUNTIME_FAILED",
      message: "Live verification gate failed unexpectedly."
    }),
    startedAtMs: completedAtMs,
    completedAtMs
  });
}

function publishReport(target, report) {
  Object.defineProperty(target, LIVE_VERIFICATION_RESULT_KEY, {
    value: report,
    configurable: true,
    enumerable: false,
    writable: false
  });

  const json = JSON.stringify(report, null, 2);
  target.console?.info?.("[Market Flow US live verification]", report);

  if (typeof target.prompt === "function") {
    target.prompt("Market Flow US live verification report (sanitized JSON):", json);
  }

  return report;
}

async function addMovementEvidence(report) {
  if (report?.overall !== "PASS") return report;
  const movement = await evaluateMovementEvidence({ baseReport: report });
  return attachMovementEvidence(report, movement);
}

export function startLiveVerificationGate(target = globalThis) {
  const existing = target?.[LIVE_VERIFICATION_PROMISE_KEY];
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(() => runBoundedLiveVerification({
      candidateCommit: CANDIDATE_COMMIT,
      providerOrigin: target?.location?.origin ?? "",
      userAgent: target?.navigator?.userAgent ?? ""
    }))
    .then(addMovementEvidence)
    .catch(() => safeUnexpectedFailure())
    .then((report) => publishReport(target, report));

  Object.defineProperty(target, LIVE_VERIFICATION_PROMISE_KEY, {
    value: promise,
    configurable: true,
    enumerable: false,
    writable: false
  });

  return promise;
}

startLiveVerificationGate();
