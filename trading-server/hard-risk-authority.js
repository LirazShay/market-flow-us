import { normalizeOrderIntent } from "../ibkr-order-service/intent.js";

export const HARD_RISK_REASON_CODES = Object.freeze({
  globalKillSwitch: "HARD_RISK_GLOBAL_KILL_SWITCH",
  newEntryPaused: "HARD_RISK_NEW_ENTRY_PAUSED",
  staleQuote: "HARD_RISK_STALE_QUOTE",
  orderNotional: "HARD_RISK_ORDER_NOTIONAL_LIMIT",
  concurrentPositions: "HARD_RISK_CONCURRENT_POSITION_LIMIT",
  aggregateExposure: "HARD_RISK_AGGREGATE_EXPOSURE_LIMIT",
  orderAttemptRate: "HARD_RISK_ORDER_ATTEMPT_RATE_LIMIT",
  lossLimit: "HARD_RISK_SESSION_LOSS_LIMIT",
  failedEntries: "HARD_RISK_FAILED_ENTRY_LIMIT"
});

const REQUIRED_HARD_LIMIT_KEYS = Object.freeze([
  "maxOrderNotionalUsd",
  "maxConcurrentPositions",
  "maxAggregateExposureUsd",
  "maxOrderAttemptsPerWindow",
  "orderAttemptWindowMs",
  "maxSessionLossUsd",
  "maxFailedEntryAttempts",
  "maxQuoteAgeMs"
]);

const POLICY_NUMERIC_LIMIT_KEYS = Object.freeze([
  "maxOrderNotionalUsd",
  "maxConcurrentPositions",
  "maxAggregateExposureUsd",
  "maxOrderAttemptsPerWindow",
  "maxSessionLossUsd",
  "maxFailedEntryAttempts",
  "maxQuoteAgeMs"
]);

const POLICY_CONTROL_KEYS = Object.freeze([
  "pauseNewEntries",
  "stopAllTrading"
]);

const POLICY_KEYS = new Set([...POLICY_NUMERIC_LIMIT_KEYS, ...POLICY_CONTROL_KEYS]);
const INTEGER_LIMIT_KEYS = new Set([
  "maxConcurrentPositions",
  "maxOrderAttemptsPerWindow",
  "orderAttemptWindowMs",
  "maxFailedEntryAttempts",
  "maxQuoteAgeMs"
]);

export class HardRiskRejectionError extends Error {
  constructor(reasonCode, decisionRecord = null) {
    super(`order intent rejected by independent hard-risk authority: ${reasonCode}`);
    this.name = "HardRiskRejectionError";
    this.code = reasonCode;
    this.reasonCode = reasonCode;
    this.statusCode = 409;
    this.decisionRecordId = decisionRecord?.decisionRecordId ?? null;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPositiveLimit(value, key) {
  const valid = INTEGER_LIMIT_KEYS.has(key)
    ? Number.isSafeInteger(value) && value > 0
    : typeof value === "number" && Number.isFinite(value) && value > 0;
  if (!valid) {
    throw new TypeError(`${key} must be a positive ${INTEGER_LIMIT_KEYS.has(key) ? "safe integer" : "finite number"}`);
  }
  return value;
}

function normalizeHardLimits(input) {
  if (!isObject(input)) {
    throw new TypeError("hard limits are required");
  }
  const actualKeys = Object.keys(input);
  const missing = REQUIRED_HARD_LIMIT_KEYS.filter((key) => !Object.hasOwn(input, key));
  const unexpected = actualKeys.filter((key) => !REQUIRED_HARD_LIMIT_KEYS.includes(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new TypeError([
      missing.length > 0 ? `hard limits missing: ${missing.join(", ")}` : null,
      unexpected.length > 0 ? `hard limits unexpected: ${unexpected.join(", ")}` : null
    ].filter(Boolean).join("; "));
  }

  return Object.freeze(Object.fromEntries(
    REQUIRED_HARD_LIMIT_KEYS.map((key) => [key, assertPositiveLimit(input[key], key)])
  ));
}

function normalizePolicyLimits(input, hardLimits) {
  if (input === undefined || input === null) {
    return Object.freeze({
      effectiveLimits: hardLimits,
      pauseNewEntries: false,
      stopAllTrading: false
    });
  }
  if (!isObject(input)) {
    throw new TypeError("policyLimits must be an object when supplied");
  }
  for (const key of Object.keys(input)) {
    if (!POLICY_KEYS.has(key)) {
      throw new TypeError(`policyLimits contains unsupported key ${key}`);
    }
  }

  const effective = { ...hardLimits };
  for (const key of POLICY_NUMERIC_LIMIT_KEYS) {
    if (!Object.hasOwn(input, key)) continue;
    const requested = assertPositiveLimit(input[key], key);
    effective[key] = Math.min(hardLimits[key], requested);
  }
  for (const key of POLICY_CONTROL_KEYS) {
    if (Object.hasOwn(input, key) && typeof input[key] !== "boolean") {
      throw new TypeError(`policyLimits.${key} must be a boolean`);
    }
  }

  return Object.freeze({
    effectiveLimits: Object.freeze(effective),
    pauseNewEntries: input.pauseNewEntries === true,
    stopAllTrading: input.stopAllTrading === true
  });
}

function normalizeOperatorControls(input) {
  if (!isObject(input)) {
    throw new TypeError("operator controls must be an object");
  }
  if (typeof input.globalKillSwitch !== "boolean" || typeof input.newEntryPaused !== "boolean") {
    throw new TypeError("operator controls require boolean globalKillSwitch and newEntryPaused");
  }
  return Object.freeze({
    globalKillSwitch: input.globalKillSwitch,
    newEntryPaused: input.newEntryPaused
  });
}

function assertNonNegativeFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
  return value;
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeRiskState(input, nowMs) {
  if (!isObject(input)) {
    throw new TypeError("risk state must be an object");
  }
  if (!Array.isArray(input.recentOrderAttemptTimestampsMs)) {
    throw new TypeError("recentOrderAttemptTimestampsMs must be an array");
  }
  const recentOrderAttemptTimestampsMs = input.recentOrderAttemptTimestampsMs.map((value) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > nowMs) {
      throw new TypeError("recent order-attempt timestamps must be non-negative safe integers not in the future");
    }
    return value;
  });
  if (typeof input.pnlUsd !== "number" || !Number.isFinite(input.pnlUsd)) {
    throw new TypeError("pnlUsd must be a finite number");
  }

  return Object.freeze({
    openPositionCount: assertNonNegativeInteger(input.openPositionCount, "openPositionCount"),
    aggregateExposureUsd: assertNonNegativeFinite(input.aggregateExposureUsd, "aggregateExposureUsd"),
    recentOrderAttemptTimestampsMs: Object.freeze(recentOrderAttemptTimestampsMs),
    pnlUsd: input.pnlUsd,
    failedEntryAttempts: assertNonNegativeInteger(input.failedEntryAttempts, "failedEntryAttempts"),
    instrumentPositionQuantity: assertNonNegativeFinite(
      input.instrumentPositionQuantity,
      "instrumentPositionQuantity"
    )
  });
}

function readNow(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("now() must return a non-negative safe integer millisecond timestamp");
  }
  return value;
}

function quoteAgeMs(quote, nowMs) {
  if (!isObject(quote)) return null;
  const updatedAtMs = quote.providerUpdatedAtMs;
  if (!Number.isSafeInteger(updatedAtMs) || updatedAtMs < 0 || updatedAtMs > nowMs) return null;
  return nowMs - updatedAtMs;
}

function usablePrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function quotePriceForMarketIntent(intent, quote) {
  if (!isObject(quote)) return null;
  const preferred = intent.side === "BUY"
    ? [quote.ask, quote.last, quote.bid]
    : [quote.bid, quote.last, quote.ask];
  for (const candidate of preferred) {
    const price = usablePrice(candidate);
    if (price !== null) return price;
  }
  return null;
}

function orderNotionalUsd(intent, quote) {
  const price = intent.orderType === "LMT"
    ? intent.limitPrice
    : quotePriceForMarketIntent(intent, quote);
  if (price === null || price === undefined) return null;
  const notional = intent.quantity * price;
  return Number.isFinite(notional) && notional > 0 ? notional : null;
}

function compactEvidence(intent, category, details = {}) {
  return {
    requestId: intent.requestId,
    symbol: intent.instrument.symbol,
    side: intent.side,
    category,
    ...details
  };
}

function countRecentAttempts(timestamps, nowMs, windowMs) {
  const lowerBound = nowMs - windowMs;
  return timestamps.filter((timestamp) => timestamp >= lowerBound && timestamp <= nowMs).length;
}

function assertDependencies({ ledger, now, readRiskState, readOperatorControls }) {
  if (!ledger || typeof ledger.appendDecisionRecord !== "function") {
    throw new TypeError("ledger with appendDecisionRecord() is required");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof readRiskState !== "function") throw new TypeError("readRiskState must be a function");
  if (typeof readOperatorControls !== "function") {
    throw new TypeError("readOperatorControls must be a function");
  }
}

export function createHardRiskAuthority({
  hardLimits,
  ledger,
  now = Date.now,
  readRiskState,
  readOperatorControls
}) {
  const operatorHardLimits = normalizeHardLimits(hardLimits);
  assertDependencies({ ledger, now, readRiskState, readOperatorControls });

  async function reject({
    tradingRunId,
    tradeEpisodeId,
    decidedAtMs,
    intent,
    reasonCode,
    category,
    details
  }) {
    const decisionRecord = await ledger.appendDecisionRecord({
      tradingRunId,
      tradeEpisodeId,
      decidedAtMs,
      decisionType: "HARD_RISK_REJECTED",
      reasonCode,
      evidence: compactEvidence(intent, category, details)
    });
    throw new HardRiskRejectionError(reasonCode, decisionRecord);
  }

  return Object.freeze({
    hardLimits: operatorHardLimits,

    async gateOrderIntent({
      tradingRunId,
      tradeEpisodeId,
      intent,
      quote,
      policyLimits
    }, forwardAuthorizedIntent) {
      if (typeof forwardAuthorizedIntent !== "function") {
        throw new TypeError("forwardAuthorizedIntent must be a function");
      }

      const normalizedIntent = normalizeOrderIntent(intent);
      const evaluatedAtMs = readNow(now);
      const narrowed = normalizePolicyLimits(policyLimits, operatorHardLimits);
      const effectiveLimits = narrowed.effectiveLimits;
      const operatorControls = normalizeOperatorControls(await readOperatorControls({
        tradingRunId,
        tradeEpisodeId
      }));
      const isEntry = normalizedIntent.side === "BUY";

      if (operatorControls.globalKillSwitch || narrowed.stopAllTrading) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.globalKillSwitch,
          category: operatorControls.globalKillSwitch ? "operator-control" : "policy-narrowing"
        });
      }

      if (isEntry && (operatorControls.newEntryPaused || narrowed.pauseNewEntries)) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.newEntryPaused,
          category: operatorControls.newEntryPaused ? "operator-control" : "policy-narrowing"
        });
      }

      const ageMs = quoteAgeMs(quote, evaluatedAtMs);
      if (ageMs === null || ageMs > effectiveLimits.maxQuoteAgeMs) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.staleQuote,
          category: "quote-staleness",
          details: {
            ...(ageMs === null ? {} : { quoteAgeMs: ageMs }),
            limit: effectiveLimits.maxQuoteAgeMs
          }
        });
      }

      const notionalUsd = orderNotionalUsd(normalizedIntent, quote);
      if (notionalUsd === null || notionalUsd > effectiveLimits.maxOrderNotionalUsd) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.orderNotional,
          category: "order-notional",
          details: {
            ...(notionalUsd === null ? {} : { observed: notionalUsd }),
            limit: effectiveLimits.maxOrderNotionalUsd
          }
        });
      }

      const riskState = normalizeRiskState(await readRiskState({
        tradingRunId,
        tradeEpisodeId,
        instrument: normalizedIntent.instrument,
        evaluatedAtMs
      }), evaluatedAtMs);

      const opensNewPosition = isEntry && riskState.instrumentPositionQuantity === 0;
      if (opensNewPosition && riskState.openPositionCount >= effectiveLimits.maxConcurrentPositions) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.concurrentPositions,
          category: "concurrent-positions",
          details: {
            observed: riskState.openPositionCount,
            limit: effectiveLimits.maxConcurrentPositions
          }
        });
      }

      const projectedExposureUsd = riskState.aggregateExposureUsd + (isEntry ? notionalUsd : 0);
      if (isEntry && projectedExposureUsd > effectiveLimits.maxAggregateExposureUsd) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.aggregateExposure,
          category: "aggregate-exposure",
          details: {
            observed: projectedExposureUsd,
            limit: effectiveLimits.maxAggregateExposureUsd
          }
        });
      }

      const recentAttemptCount = countRecentAttempts(
        riskState.recentOrderAttemptTimestampsMs,
        evaluatedAtMs,
        operatorHardLimits.orderAttemptWindowMs
      );
      if (recentAttemptCount >= effectiveLimits.maxOrderAttemptsPerWindow) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.orderAttemptRate,
          category: "order-attempt-rate",
          details: {
            observed: recentAttemptCount,
            limit: effectiveLimits.maxOrderAttemptsPerWindow,
            windowMs: operatorHardLimits.orderAttemptWindowMs
          }
        });
      }

      if (isEntry && riskState.pnlUsd <= -effectiveLimits.maxSessionLossUsd) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.lossLimit,
          category: "loss-ceiling",
          details: {
            observed: Math.abs(Math.min(riskState.pnlUsd, 0)),
            limit: effectiveLimits.maxSessionLossUsd
          }
        });
      }

      if (isEntry && riskState.failedEntryAttempts >= effectiveLimits.maxFailedEntryAttempts) {
        return reject({
          tradingRunId,
          tradeEpisodeId,
          decidedAtMs: evaluatedAtMs,
          intent: normalizedIntent,
          reasonCode: HARD_RISK_REASON_CODES.failedEntries,
          category: "failed-entry-ceiling",
          details: {
            observed: riskState.failedEntryAttempts,
            limit: effectiveLimits.maxFailedEntryAttempts
          }
        });
      }

      const riskPermit = Object.freeze({
        reasonCode: "HARD_RISK_AUTHORIZED",
        evaluatedAtMs,
        orderNotionalUsd: notionalUsd,
        effectiveLimits
      });
      return forwardAuthorizedIntent(Object.freeze({ normalizedIntent, riskPermit }));
    }
  });
}
