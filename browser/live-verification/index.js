import { runBoundedLiveVerification } from "./harness.js";

export const LIVE_VERIFICATION_RESULT_KEY = "__MARKET_SCOPE_LIVE_VERIFICATION_RESULT_V1__";
export const LIVE_VERIFICATION_PROMISE_KEY = "__MARKET_SCOPE_LIVE_VERIFICATION_PROMISE_V1__";

const CANDIDATE_COMMIT = __MARKET_SCOPE_CANDIDATE_COMMIT__;

function safeUnexpectedFailure(now = () => Date.now()) {
  const completedAtMs = now();
  return Object.freeze({
    verification: "market-scope-real-provider",
    candidateCommit: CANDIDATE_COMMIT,
    providerOriginHost: null,
    transportCspLna: "FAIL",
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
  target.console?.info?.("[MarketScope live verification]", report);

  if (typeof target.prompt === "function") {
    target.prompt("MarketScope live verification report (sanitized JSON):", json);
  }

  return report;
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
