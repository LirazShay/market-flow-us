function assertPositiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function assertAdapter(adapter) {
  if (
    adapter === null
    || typeof adapter !== "object"
    || typeof adapter.resolveInstrument !== "function"
    || typeof adapter.getSnapshot !== "function"
  ) {
    throw new TypeError("adapter must provide resolveInstrument() and getSnapshot()");
  }
}

function assertNow(now) {
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
}

function assertInstrument(instrument) {
  if (instrument === null || typeof instrument !== "object" || Array.isArray(instrument)) {
    throw new TypeError("instrument must be a STK/USD/SMART object");
  }
  if (typeof instrument.symbol !== "string" || instrument.symbol.trim().length === 0) {
    throw new TypeError("instrument symbol is required");
  }
  if (instrument.secType !== "STK") {
    throw new TypeError("instrument secType must be STK");
  }
  if (instrument.currency !== "USD") {
    throw new TypeError("instrument currency must be USD");
  }
  if (instrument.exchange !== "SMART") {
    throw new TypeError("instrument exchange must be SMART");
  }
}

function instrumentKey(instrument) {
  return [
    instrument.symbol.trim().toUpperCase(),
    instrument.secType,
    instrument.currency,
    instrument.exchange
  ].join("|");
}

function sanitizePrice(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeProviderTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sanitizeMarketDataAvailability(value) {
  return typeof value === "string" ? value : null;
}

function readReceiveTime(now) {
  const receivedAtMs = now();
  if (!Number.isSafeInteger(receivedAtMs) || receivedAtMs < 0) {
    throw new TypeError("now() must return a non-negative safe integer millisecond timestamp");
  }
  return receivedAtMs;
}

function failClosedObservation({
  instrument,
  resolutionStatus,
  conid = null,
  availability,
  receivedAtMs
}) {
  return {
    instrument,
    resolutionStatus,
    conid,
    availability,
    staleness: "UNKNOWN",
    usableForNewDecision: false,
    marketDataAvailability: null,
    last: null,
    bid: null,
    ask: null,
    providerUpdatedAtMs: null,
    receivedAtMs
  };
}

function classifyStaleness(providerUpdatedAtMs, receivedAtMs, maxQuoteAgeMs) {
  if (providerUpdatedAtMs === null || providerUpdatedAtMs > receivedAtMs) {
    return "UNKNOWN";
  }
  return receivedAtMs - providerUpdatedAtMs <= maxQuoteAgeMs ? "FRESH" : "STALE";
}

function hasDecisionPrice(last, bid, ask) {
  return last !== null || bid !== null || ask !== null;
}

export function createTargetedQuoteWatch({
  adapter,
  now = Date.now,
  maxQuoteAgeMs,
  maxInstruments
}) {
  assertAdapter(adapter);
  assertNow(now);
  assertPositiveSafeInteger(maxQuoteAgeMs, "maxQuoteAgeMs");
  assertPositiveSafeInteger(maxInstruments, "maxInstruments");

  return Object.freeze({
    async poll(instruments) {
      if (!Array.isArray(instruments)) {
        throw new TypeError("quote watch shortlist must be an array");
      }
      if (instruments.length > maxInstruments) {
        throw new RangeError(`quote watch shortlist exceeds maxInstruments bound of ${maxInstruments}`);
      }

      const seen = new Set();
      for (const instrument of instruments) {
        assertInstrument(instrument);
        const key = instrumentKey(instrument);
        if (seen.has(key)) {
          throw new TypeError(`duplicate instrument in quote watch shortlist: ${key}`);
        }
        seen.add(key);
      }

      const observations = [];
      for (const instrument of instruments) {
        const resolution = await adapter.resolveInstrument(instrument);
        const resolutionStatus = typeof resolution?.status === "string"
          ? resolution.status
          : "UNKNOWN";

        if (resolutionStatus !== "EXACT") {
          const receivedAtMs = readReceiveTime(now);
          observations.push(failClosedObservation({
            instrument,
            resolutionStatus,
            availability: resolutionStatus === "AMBIGUOUS" ? "AMBIGUOUS" : "UNRESOLVED",
            receivedAtMs
          }));
          continue;
        }

        const conid = Number.isSafeInteger(resolution?.conid) && resolution.conid > 0
          ? resolution.conid
          : null;
        if (conid === null) {
          const receivedAtMs = readReceiveTime(now);
          observations.push(failClosedObservation({
            instrument,
            resolutionStatus,
            availability: "UNAVAILABLE",
            receivedAtMs
          }));
          continue;
        }

        const snapshot = await adapter.getSnapshot({ resolution });
        const receivedAtMs = readReceiveTime(now);
        if (snapshot?.status !== "READY") {
          observations.push(failClosedObservation({
            instrument,
            resolutionStatus,
            conid,
            availability: "UNAVAILABLE",
            receivedAtMs
          }));
          continue;
        }

        const last = sanitizePrice(snapshot.last);
        const bid = sanitizePrice(snapshot.bid);
        const ask = sanitizePrice(snapshot.ask);
        const providerUpdatedAtMs = sanitizeProviderTimestamp(snapshot.updatedAtMs);
        const staleness = classifyStaleness(providerUpdatedAtMs, receivedAtMs, maxQuoteAgeMs);

        observations.push({
          instrument,
          resolutionStatus,
          conid,
          availability: "AVAILABLE",
          staleness,
          usableForNewDecision: staleness === "FRESH" && hasDecisionPrice(last, bid, ask),
          marketDataAvailability: sanitizeMarketDataAvailability(snapshot.marketDataAvailability),
          last,
          bid,
          ask,
          providerUpdatedAtMs,
          receivedAtMs
        });
      }

      return observations;
    }
  });
}
