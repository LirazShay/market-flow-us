import { createTargetedQuoteWatch } from "./targeted-quote-watch.js";
import { createTradingSupervisorRuntime } from "./supervisor-runtime.js";

export const LIVE_MARKET_SHADOW_CHECK = "LIVE_MARKET_SHADOW_OBSERVATION";

function assertDependency(value, method, label) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${label} with ${method}() is required`);
  }
}

function assertInstrument(instrument) {
  if (!instrument || typeof instrument !== "object" || Array.isArray(instrument)) {
    throw new TypeError("instrument is required");
  }
  const normalized = Object.freeze({
    symbol: String(instrument.symbol ?? "").trim().toUpperCase(),
    secType: String(instrument.secType ?? "").trim().toUpperCase(),
    currency: String(instrument.currency ?? "").trim().toUpperCase(),
    exchange: String(instrument.exchange ?? "").trim().toUpperCase()
  });
  if (!normalized.symbol || normalized.secType !== "STK" || normalized.currency !== "USD" || normalized.exchange !== "SMART") {
    throw new TypeError("live-market shadow instrument must be a non-empty STK/USD/SMART instrument");
  }
  return normalized;
}

function candidateKey(instrument) {
  return [instrument.symbol, instrument.secType, instrument.currency, instrument.exchange].join(":");
}

function compactObservation(observation) {
  if (!observation || typeof observation !== "object") return null;
  return Object.freeze({
    resolutionStatus: observation.resolutionStatus ?? null,
    conid: Number.isSafeInteger(observation.conid) ? observation.conid : null,
    availability: observation.availability ?? null,
    staleness: observation.staleness ?? null,
    usableForNewDecision: observation.usableForNewDecision === true,
    marketDataAvailability: observation.marketDataAvailability ?? null,
    last: Number.isFinite(observation.last) ? observation.last : null,
    bid: Number.isFinite(observation.bid) ? observation.bid : null,
    ask: Number.isFinite(observation.ask) ? observation.ask : null,
    providerUpdatedAtMs: Number.isSafeInteger(observation.providerUpdatedAtMs)
      ? observation.providerUpdatedAtMs
      : null,
    receivedAtMs: Number.isSafeInteger(observation.receivedAtMs)
      ? observation.receivedAtMs
      : null,
    reasonCode: typeof observation.reasonCode === "string" ? observation.reasonCode : null
  });
}

function observationResult(observation) {
  if (!observation) {
    return { status: "FAIL", reasonCode: "SHADOW_OBSERVATION_MISSING" };
  }
  if (typeof observation.reasonCode === "string" && observation.reasonCode.length > 0) {
    return { status: "FAIL", reasonCode: observation.reasonCode };
  }
  if (observation.resolutionStatus !== "EXACT") {
    return { status: "FAIL", reasonCode: "SHADOW_RESOLUTION_NOT_EXACT" };
  }
  if (observation.availability !== "AVAILABLE") {
    return { status: "FAIL", reasonCode: "SHADOW_QUOTE_UNAVAILABLE" };
  }
  if (observation.staleness === "STALE") {
    return { status: "FAIL", reasonCode: "SHADOW_QUOTE_STALE" };
  }
  if (observation.staleness !== "FRESH") {
    return { status: "FAIL", reasonCode: "SHADOW_QUOTE_STALENESS_UNKNOWN" };
  }
  if (observation.usableForNewDecision !== true) {
    return { status: "FAIL", reasonCode: "SHADOW_QUOTE_NOT_USABLE" };
  }
  return { status: "PASS", reasonCode: "SHADOW_LIVE_QUOTE_ACCEPTED" };
}

export async function runLiveMarketShadowObservation({
  ledger,
  adapter,
  instrument,
  maxQuoteAgeMs = 1_000,
  now = Date.now
}) {
  assertDependency(ledger, "createPolicyVersion", "ledger");
  assertDependency(ledger, "createTradingRun", "ledger");
  assertDependency(ledger, "createTradeEpisode", "ledger");
  assertDependency(ledger, "getTradeEpisodeBundle", "ledger");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const normalizedInstrument = assertInstrument(instrument);
  const quoteWatch = createTargetedQuoteWatch({
    adapter,
    maxInstruments: 1,
    maxQuoteAgeMs,
    now
  });

  const policyVersion = await ledger.createPolicyVersion({
    policy: {
      entry: { source: "live-market-shadow-observation" },
      exit: { source: "live-market-shadow-observation" }
    }
  });
  const run = await ledger.createTradingRun({
    policyVersionId: policyVersion.policyVersionId,
    mode: "SHADOW",
    environmentSnapshot: {
      source: "IBKR_CPGW_LIVE_MARKET_SHADOW",
      instrument: normalizedInstrument,
      readOnly: true
    },
    riskEnvelope: {
      orderMutationAllowed: false,
      observationOnly: true
    }
  });
  const episode = await ledger.createTradeEpisode({
    tradingRunId: run.tradingRunId,
    policyVersionId: policyVersion.policyVersionId,
    candidateKey: candidateKey(normalizedInstrument),
    candidateProvenance: {
      version: 1,
      source: "LIVE_MARKET_SHADOW_ACCEPTANCE",
      purpose: "READ_ONLY_OBSERVATION",
      instrument: normalizedInstrument
    }
  });

  let orderIntentBuilds = 0;
  let brokerMutations = 0;
  const supervisor = createTradingSupervisorRuntime({
    ledger,
    quoteWatch,
    protectedOrderBridge: {
      async submitOrderIntent() {
        brokerMutations += 1;
        throw new Error("live-market shadow must not reach broker mutation");
      }
    },
    async buildOrderIntent() {
      orderIntentBuilds += 1;
      throw new Error("live-market shadow must not build an order intent");
    },
    now
  });

  await supervisor.startWatching({
    tradingRunId: run.tradingRunId,
    tradeEpisodeId: episode.tradeEpisodeId
  });
  const decision = await supervisor.evaluateCycle({
    tradingRunId: run.tradingRunId,
    tradeEpisodeId: episode.tradeEpisodeId,
    instrument: normalizedInstrument,
    proposal: null
  });
  const bundle = await ledger.getTradeEpisodeBundle(run.tradingRunId, episode.tradeEpisodeId);
  const durableObservation = bundle?.observations?.at(-1)?.observation ?? null;
  const quoteResult = observationResult(durableObservation);
  const orderPathSafe = (
    decision?.action?.type === "NONE"
    && orderIntentBuilds === 0
    && brokerMutations === 0
    && bundle.orderReferences.length === 0
  );
  const status = quoteResult.status === "PASS" && orderPathSafe ? "PASS" : "FAIL";
  const reasonCode = orderPathSafe ? quoteResult.reasonCode : "SHADOW_ORDER_PATH_REACHED";

  return Object.freeze({
    schemaVersion: 1,
    check: LIVE_MARKET_SHADOW_CHECK,
    status,
    reasonCode,
    mode: run.mode,
    tradingRunId: run.tradingRunId,
    tradeEpisodeId: episode.tradeEpisodeId,
    instrument: normalizedInstrument,
    quote: compactObservation(durableObservation),
    decision: Object.freeze({
      status: decision?.status ?? null,
      actionType: decision?.action?.type ?? null,
      reasonCode: decision?.decision?.reasonCode ?? decision?.reasonCode ?? null
    }),
    durableEvidence: Object.freeze({
      observations: bundle.observations.length,
      decisions: bundle.decisions.length,
      orderReferences: bundle.orderReferences.length
    }),
    orderPath: Object.freeze({
      orderIntentBuilds,
      brokerMutations
    }),
    nextStageEnabled: false
  });
}
