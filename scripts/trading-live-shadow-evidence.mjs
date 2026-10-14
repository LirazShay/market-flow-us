const COMMIT_RE = /^[0-9a-f]{7,40}$/u;

const TOP_LEVEL_KEYS = Object.freeze([
  "candidateCommit",
  "check",
  "checkoutClean",
  "decision",
  "durableEvidence",
  "instrument",
  "mode",
  "nextStageEnabled",
  "orderPath",
  "quote",
  "reasonCode",
  "schemaVersion",
  "status",
  "tradeEpisodeId",
  "tradingRunId"
]);

const INSTRUMENT_KEYS = Object.freeze(["currency", "exchange", "secType", "symbol"]);
const QUOTE_KEYS = Object.freeze([
  "ask",
  "availability",
  "bid",
  "conid",
  "last",
  "marketDataAvailability",
  "providerUpdatedAtMs",
  "reasonCode",
  "receivedAtMs",
  "resolutionStatus",
  "staleness",
  "usableForNewDecision"
]);
const DECISION_KEYS = Object.freeze(["actionType", "reasonCode", "status"]);
const DURABLE_EVIDENCE_KEYS = Object.freeze(["decisions", "observations", "orderReferences"]);
const ORDER_PATH_KEYS = Object.freeze(["brokerMutations", "orderIntentBuilds"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertObject(value, code = "LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH") {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function assertExactKeys(value, expected) {
  assertObject(value);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }
}

function assertNonEmptyString(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }
}

function assertPrice(value) {
  if (value !== null && !Number.isFinite(value)) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }
}

function assertStringOrNull(value) {
  if (value !== null && typeof value !== "string") {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }
}

function normalizeExpectedCommit(value) {
  if (typeof value !== "string" || !COMMIT_RE.test(value.toLowerCase())) {
    fail("LIVE_SHADOW_EVIDENCE_EXPECTED_COMMIT_INVALID");
  }
  return value.toLowerCase();
}

export function validateTradingLiveShadowEvidence(report, { expectedCommit } = {}) {
  assertExactKeys(report, TOP_LEVEL_KEYS);

  const normalizedExpectedCommit = normalizeExpectedCommit(expectedCommit);
  if (typeof report.candidateCommit !== "string" || !COMMIT_RE.test(report.candidateCommit)) {
    fail("LIVE_SHADOW_EVIDENCE_COMMIT_MISMATCH");
  }
  if (report.candidateCommit !== normalizedExpectedCommit) {
    fail("LIVE_SHADOW_EVIDENCE_COMMIT_MISMATCH");
  }
  if (report.checkoutClean !== true) {
    fail("LIVE_SHADOW_EVIDENCE_CHECKOUT_NOT_CLEAN");
  }

  if (
    report.schemaVersion !== 1
    || report.check !== "LIVE_MARKET_SHADOW_OBSERVATION"
    || report.status !== "PASS"
    || report.reasonCode !== "SHADOW_LIVE_QUOTE_ACCEPTED"
    || report.mode !== "SHADOW"
  ) {
    fail("LIVE_SHADOW_EVIDENCE_NOT_PASS");
  }

  assertNonEmptyString(report.tradingRunId);
  assertNonEmptyString(report.tradeEpisodeId);

  assertExactKeys(report.instrument, INSTRUMENT_KEYS);
  assertNonEmptyString(report.instrument.symbol);
  if (
    report.instrument.secType !== "STK"
    || report.instrument.currency !== "USD"
    || report.instrument.exchange !== "SMART"
  ) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }

  assertExactKeys(report.quote, QUOTE_KEYS);
  if (
    report.quote.resolutionStatus !== "EXACT"
    || report.quote.availability !== "AVAILABLE"
    || report.quote.staleness !== "FRESH"
    || report.quote.usableForNewDecision !== true
    || report.quote.reasonCode !== null
  ) {
    fail("LIVE_SHADOW_EVIDENCE_QUOTE_NOT_ACCEPTED");
  }
  if (!Number.isSafeInteger(report.quote.conid) || report.quote.conid <= 0) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }
  assertStringOrNull(report.quote.marketDataAvailability);
  assertPrice(report.quote.last);
  assertPrice(report.quote.bid);
  assertPrice(report.quote.ask);
  if (
    !Number.isSafeInteger(report.quote.providerUpdatedAtMs)
    || !Number.isSafeInteger(report.quote.receivedAtMs)
  ) {
    fail("LIVE_SHADOW_EVIDENCE_SCHEMA_MISMATCH");
  }

  assertExactKeys(report.decision, DECISION_KEYS);
  if (
    report.decision.status !== "DECIDED"
    || report.decision.actionType !== "NONE"
    || report.decision.reasonCode !== "AI_UNAVAILABLE_FALLBACK_WAIT"
  ) {
    fail("LIVE_SHADOW_EVIDENCE_DECISION_NOT_READ_ONLY");
  }

  assertExactKeys(report.durableEvidence, DURABLE_EVIDENCE_KEYS);
  if (
    report.durableEvidence.observations !== 1
    || report.durableEvidence.decisions !== 1
    || report.durableEvidence.orderReferences !== 0
  ) {
    fail("LIVE_SHADOW_EVIDENCE_DURABLE_COUNTS_INVALID");
  }

  assertExactKeys(report.orderPath, ORDER_PATH_KEYS);
  if (
    report.orderPath.orderIntentBuilds !== 0
    || report.orderPath.brokerMutations !== 0
    || report.nextStageEnabled !== false
  ) {
    fail("LIVE_SHADOW_EVIDENCE_ORDER_PATH_UNSAFE");
  }

  return Object.freeze({
    schemaVersion: 1,
    check: "LIVE_MARKET_SHADOW_EVIDENCE_VERIFY",
    status: "PASS",
    candidateCommit: report.candidateCommit,
    sourceCheck: report.check,
    sourceStatus: report.status,
    orderPathSafe: true,
    nextStageEnabled: false
  });
}
