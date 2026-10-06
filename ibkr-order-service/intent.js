import { createHash } from "node:crypto";

export const ORDER_INTENT_LIMITS = Object.freeze({
  requestIdChars: 128,
  symbolChars: 32
});

const INSTRUMENT_KEYS = Object.freeze([
  "currency",
  "exchange",
  "secType",
  "symbol"
]);
const COMMON_INTENT_KEYS = Object.freeze([
  "executionMode",
  "instrument",
  "orderType",
  "quantity",
  "requestId",
  "side",
  "tif"
]);
const LMT_INTENT_KEYS = Object.freeze([...COMMON_INTENT_KEYS, "limitPrice"].sort());
const MKT_INTENT_KEYS = COMMON_INTENT_KEYS;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export class OrderIntentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderIntentValidationError";
    this.code = "INVALID_ORDER_INTENT";
  }
}

function invalid(message) {
  throw new OrderIntentValidationError(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actualKeys.length !== expected.length
      || actualKeys.some((key, index) => key !== expected[index])) {
    invalid(`${label} keys are invalid; expected exactly ${expected.join(", ")}`);
  }
}

function requireBoundedString(value, { label, maxChars, normalize = (input) => input }) {
  if (typeof value !== "string") {
    invalid(`${label} must be a string`);
  }
  if (value.length === 0 || value.length > maxChars || value.trim() !== value || CONTROL_CHARACTERS.test(value)) {
    invalid(`${label} is invalid or exceeds ${maxChars} characters`);
  }
  return normalize(value);
}

function requireExact(value, expected, label) {
  if (value !== expected) {
    invalid(`${label} must be ${expected}`);
  }
  return value;
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) {
    invalid(`${label} must be one of ${allowed.join(" | ")}`);
  }
  return value;
}

function requirePositiveFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    invalid(`${label} must be a positive finite number`);
  }
  return value;
}

export function normalizeOrderIntent(input) {
  if (!isObject(input)) {
    invalid("order intent must be an object");
  }

  const orderType = requireEnum(input.orderType, ["LMT", "MKT"], "orderType");
  assertExactKeys(input, orderType === "LMT" ? LMT_INTENT_KEYS : MKT_INTENT_KEYS, "order intent");

  if (!isObject(input.instrument)) {
    invalid("instrument must be an object");
  }
  assertExactKeys(input.instrument, INSTRUMENT_KEYS, "instrument");

  const requestId = requireBoundedString(input.requestId, {
    label: "requestId",
    maxChars: ORDER_INTENT_LIMITS.requestIdChars
  });
  const symbol = requireBoundedString(input.instrument.symbol, {
    label: "instrument.symbol",
    maxChars: ORDER_INTENT_LIMITS.symbolChars,
    normalize: (value) => value.toUpperCase()
  });
  const secType = requireExact(input.instrument.secType, "STK", "instrument.secType");
  const currency = requireExact(input.instrument.currency, "USD", "instrument.currency");
  const exchange = requireExact(input.instrument.exchange, "SMART", "instrument.exchange");
  const side = requireEnum(input.side, ["BUY", "SELL"], "side");
  const quantity = requirePositiveFiniteNumber(input.quantity, "quantity");
  const tif = requireEnum(input.tif, ["DAY", "GTC"], "tif");
  const executionMode = requireEnum(input.executionMode, ["DRY_RUN", "LIVE"], "executionMode");

  const normalized = {
    requestId,
    instrument: { symbol, secType, currency, exchange },
    side,
    quantity,
    orderType,
    ...(orderType === "LMT"
      ? { limitPrice: requirePositiveFiniteNumber(input.limitPrice, "limitPrice") }
      : {}),
    tif,
    executionMode
  };

  return Object.freeze({
    ...normalized,
    instrument: Object.freeze(normalized.instrument)
  });
}

function intentFingerprintPayload(normalizedIntent) {
  return {
    instrument: {
      symbol: normalizedIntent.instrument.symbol,
      secType: normalizedIntent.instrument.secType,
      currency: normalizedIntent.instrument.currency,
      exchange: normalizedIntent.instrument.exchange
    },
    side: normalizedIntent.side,
    quantity: normalizedIntent.quantity,
    orderType: normalizedIntent.orderType,
    ...(normalizedIntent.orderType === "LMT"
      ? { limitPrice: normalizedIntent.limitPrice }
      : {}),
    tif: normalizedIntent.tif,
    executionMode: normalizedIntent.executionMode
  };
}

export function fingerprintOrderIntent(normalizedIntent) {
  const canonical = normalizeOrderIntent(normalizedIntent);
  const payload = JSON.stringify(intentFingerprintPayload(canonical));
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
