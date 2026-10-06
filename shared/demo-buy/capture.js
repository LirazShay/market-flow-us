import {
  DEMO_BUY_CONTEXT_MAX_ROWS,
  DEMO_BUY_MAX_CAPTURE_ITEMS,
  DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS,
  DEMO_BUY_MAX_SOURCE_SQL_BYTES
} from "./limits.js";
import {
  serializeDemoBuyScannerContext,
  validateDemoBuyScannerContext
} from "./context.js";

const UTF8 = new TextEncoder();
const SELECTION_MODES = new Set(["manual", "all", "top_x"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, required) {
  if (!isPlainObject(value)) {
    throw new TypeError("Demo Buy capture object is invalid.");
  }
  const expected = new Set(required);
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new TypeError("Demo Buy capture object keys are invalid.");
  }
}

function assertSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function assertNullableBoundedString(value, name, maxLength) {
  if (value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function validateSecurityId(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
  ) {
    throw new TypeError("Demo Buy securityId is invalid.");
  }
  return value;
}

function validateItems(items, rowCount) {
  if (
    !Array.isArray(items)
    || items.length < 1
    || items.length > DEMO_BUY_MAX_CAPTURE_ITEMS
  ) {
    throw new TypeError("Demo Buy capture item count is invalid.");
  }

  const securityIds = new Set();
  const resultRanks = new Set();
  let previousRank = 0;

  const normalized = items.map((item) => {
    assertExactKeys(item, ["securityId", "resultRank"]);
    const securityId = validateSecurityId(item.securityId);
    assertSafeInteger(item.resultRank, "Demo Buy resultRank", { min: 1, max: rowCount });

    if (securityIds.has(securityId) || resultRanks.has(item.resultRank)) {
      throw new TypeError("Demo Buy capture items contain duplicate identity or returned position.");
    }
    if (item.resultRank <= previousRank) {
      throw new TypeError("Demo Buy capture item returned positions must be strictly increasing.");
    }

    securityIds.add(securityId);
    resultRanks.add(item.resultRank);
    previousRank = item.resultRank;
    return Object.freeze({ securityId, resultRank: item.resultRank });
  });

  return Object.freeze(normalized);
}

function validateSourceQuery(sourceQuery) {
  assertExactKeys(sourceQuery, ["queryId", "name", "sql", "intervalMs"]);
  assertNullableBoundedString(sourceQuery.queryId, "Demo Buy source queryId", 128);
  assertNullableBoundedString(sourceQuery.name, "Demo Buy source query name", 512);
  if (typeof sourceQuery.sql !== "string" || sourceQuery.sql.length === 0) {
    throw new TypeError("Demo Buy source SQL is invalid.");
  }
  if (UTF8.encode(sourceQuery.sql).byteLength > DEMO_BUY_MAX_SOURCE_SQL_BYTES) {
    throw new TypeError("Demo Buy source SQL exceeds the provenance bound.");
  }
  assertSafeInteger(sourceQuery.intervalMs, "Demo Buy source interval", { min: 1 });

  return Object.freeze({
    queryId: sourceQuery.queryId,
    name: sourceQuery.name,
    sql: sourceQuery.sql,
    intervalMs: sourceQuery.intervalMs
  });
}

function validateSourceResult(sourceResult) {
  assertExactKeys(sourceResult, ["startedAtMs", "completedAtMs", "rowCount", "context"]);
  assertSafeInteger(sourceResult.startedAtMs, "Demo Buy source result startedAtMs");
  assertSafeInteger(sourceResult.completedAtMs, "Demo Buy source result completedAtMs");
  assertSafeInteger(sourceResult.rowCount, "Demo Buy source result rowCount");

  const validatedContext = validateDemoBuyScannerContext(sourceResult.context);
  if (sourceResult.context.sourceRowCount !== sourceResult.rowCount) {
    throw new TypeError("Demo Buy source result rowCount does not match Scanner context.");
  }

  return Object.freeze({
    startedAtMs: sourceResult.startedAtMs,
    completedAtMs: sourceResult.completedAtMs,
    rowCount: sourceResult.rowCount,
    context: sourceResult.context,
    contextJson: serializeDemoBuyScannerContext(sourceResult.context),
    identityValueIndex: validatedContext.identityValueIndex
  });
}

function validateMode({ selectionMode, isAutomatic, topX, items }) {
  if (!SELECTION_MODES.has(selectionMode)) {
    throw new TypeError("Demo Buy selection mode is invalid.");
  }
  if (typeof isAutomatic !== "boolean") {
    throw new TypeError("Demo Buy automatic flag is invalid.");
  }

  if (selectionMode === "top_x") {
    assertSafeInteger(topX, "Demo Buy topX", {
      min: 1,
      max: DEMO_BUY_MAX_CAPTURE_ITEMS
    });
    if (items.some((item) => item.resultRank > topX)) {
      throw new TypeError("Demo Buy Top X capture contains a returned position outside Top X.");
    }
  } else if (topX !== null) {
    throw new TypeError("Demo Buy topX must be null outside Top X mode.");
  }

  if (isAutomatic && selectionMode === "manual") {
    throw new TypeError("Automatic Demo Buy capture cannot use manual mode.");
  }
}

function crossCheckContext(items, sourceResult) {
  const retainedByRank = new Map(
    sourceResult.context.rows.map((row) => [row.resultRank, row])
  );

  for (const item of items) {
    if (item.resultRank > DEMO_BUY_CONTEXT_MAX_ROWS) continue;
    const row = retainedByRank.get(item.resultRank);
    if (!row) {
      throw new TypeError("Demo Buy capture item is missing from retained Scanner context.");
    }
    const contextSecurityId = row.values[sourceResult.identityValueIndex];
    if (contextSecurityId !== item.securityId) {
      throw new TypeError("Demo Buy capture item identity does not match retained Scanner context.");
    }
  }
}

export function deriveDemoBuyCaptureTiming({
  sourceResultStartedAtMs,
  sourceResultCompletedAtMs,
  capturedAtMs,
  baselineCollectedAtMs
}) {
  for (const [name, value] of Object.entries({
    sourceResultStartedAtMs,
    sourceResultCompletedAtMs,
    capturedAtMs,
    baselineCollectedAtMs
  })) {
    assertSafeInteger(value, `Demo Buy timing ${name}`);
  }

  const anomalies = [];
  const scannerDurationRaw = sourceResultCompletedAtMs - sourceResultStartedAtMs;
  const captureLatencyRaw = capturedAtMs - sourceResultCompletedAtMs;
  const baselineAgeRaw = capturedAtMs - baselineCollectedAtMs;

  if (scannerDurationRaw < 0) anomalies.push("SCANNER_CLOCK_REGRESSION");
  if (captureLatencyRaw < 0) anomalies.push("CAPTURE_CLOCK_REGRESSION");
  if (baselineAgeRaw < 0) anomalies.push("BASELINE_CLOCK_REGRESSION");

  return Object.freeze({
    scannerDurationMs: scannerDurationRaw >= 0 ? scannerDurationRaw : null,
    captureLatencyMs: captureLatencyRaw >= 0 ? captureLatencyRaw : null,
    baselineAgeMs: baselineAgeRaw >= 0 ? baselineAgeRaw : null,
    timingAnomaly: anomalies.length === 0 ? null : anomalies.join("|")
  });
}

export function validateDemoBuyCapturePayload(payload) {
  assertExactKeys(payload, [
    "items",
    "sourceQuery",
    "sourceResult",
    "selectionMode",
    "isAutomatic",
    "topX"
  ]);

  const sourceQuery = validateSourceQuery(payload.sourceQuery);
  const sourceResult = validateSourceResult(payload.sourceResult);
  const items = validateItems(payload.items, sourceResult.rowCount);
  validateMode({
    selectionMode: payload.selectionMode,
    isAutomatic: payload.isAutomatic,
    topX: payload.topX,
    items
  });
  crossCheckContext(items, sourceResult);

  return Object.freeze({
    items,
    sourceQuery,
    sourceResult,
    selectionMode: payload.selectionMode,
    isAutomatic: payload.isAutomatic,
    topX: payload.topX
  });
}
