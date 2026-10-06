export const DIAGNOSTIC_COMPONENTS = Object.freeze([
  "browser.runtime",
  "node.service",
  "node.database",
  "producer",
  "provider",
  "persistence",
  "viewer",
  "scanner",
  "demo_buy",
  "demo"
]);

export const DIAGNOSTIC_CHECKPOINTS = Object.freeze({
  "browser.runtime.loaded": "browser.runtime",
  "browser.service.hello": "browser.runtime",
  "browser.service.connection": "browser.runtime",
  "node.database.ready": "node.database",
  "node.service.ready": "node.service",
  "producer.session.started": "producer",
  "provider.universe.collected": "provider",
  "producer.universe.accepted": "producer",
  "provider.cycle.collected": "provider",
  "producer.cycle.committed": "persistence",
  "viewer.current.read": "viewer",
  "viewer.detail.read": "viewer",
  "scanner.execute": "scanner",
  "scanner.query_library": "scanner",
  "demo_buy.capture": "demo_buy",
  "demo_buy.evaluate": "demo_buy",
  "demo_buy.read": "demo_buy",
  "demo_buy.provenance_read": "demo_buy",
  "demo_buy.observation_read": "demo_buy",
  "demo.runtime.built": "demo",
  "demo.fake_market.ready": "demo",
  "demo.stack.ready": "demo"
});

export const DIAGNOSTIC_CODES = Object.freeze({
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  SERVICE_DISCONNECTED: "SERVICE_DISCONNECTED",
  SERVICE_LISTEN_ERROR: "SERVICE_LISTEN_ERROR",
  BROWSER_BUILD_ERROR: "BROWSER_BUILD_ERROR",
  FAKE_MARKET_START_ERROR: "FAKE_MARKET_START_ERROR",
  DEMO_START_ERROR: "DEMO_START_ERROR"
});

const COMPONENT_SET = new Set(DIAGNOSTIC_COMPONENTS);
const MAX_OPERATION_ID_LENGTH = 128;
const SAFE_OPERATION_ID = /^[A-Za-z0-9._:-]+$/;
const MAX_TEXT_LENGTH = 256;
const ALLOWED_CONTEXT_KEYS = new Set([
  "universeRevision",
  "cycleId",
  "captureId",
  "capturedItemCount",
  "itemCount",
  "hasMore",
  "timingAnomaly",
  "requested",
  "received",
  "unique",
  "uniqueCount",
  "missing",
  "duplicates",
  "unexpected",
  "latestCount",
  "historyCount",
  "completedCycles",
  "failedCycles",
  "serviceHealth",
  "producerState",
  "runtimeState",
  "viewerSurface",
  "selectedSecurityIdPresent",
  "scannerActive",
  "scannerIntervalMs",
  "ready",
  "schemaVersion"
]);

function boundedText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  return trimmed.slice(0, MAX_TEXT_LENGTH);
}

function diagnosticMessage(value, fallback) {
  return boundedText(value, fallback).replaceAll("MarketScope", "Market Flow US");
}

function sanitizeScalar(value) {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "string"
  ) {
    return typeof value === "string" ? value.slice(0, MAX_TEXT_LENGTH) : value;
  }
  return undefined;
}

export function sanitizeDiagnosticContext(context = {}) {
  const safe = {};
  if (!context || typeof context !== "object" || Array.isArray(context)) return safe;

  for (const [key, value] of Object.entries(context)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) continue;
    const scalar = sanitizeScalar(value);
    if (scalar !== undefined) safe[key] = scalar;
  }

  return safe;
}

export function sanitizeOperationId(value, fallback) {
  if (
    typeof value === "string"
    && value.length > 0
    && value.length <= MAX_OPERATION_ID_LENGTH
    && SAFE_OPERATION_ID.test(value)
  ) {
    return value;
  }
  return fallback;
}

function assertCheckpoint(component, checkpoint) {
  if (!COMPONENT_SET.has(component)) {
    throw new TypeError(`Unknown diagnostic component: ${component}`);
  }
  if (DIAGNOSTIC_CHECKPOINTS[checkpoint] !== component) {
    throw new TypeError(`Checkpoint ${checkpoint} does not belong to component ${component}`);
  }
}

function sanitizeError(error) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    throw new TypeError("A sanitized diagnostic error descriptor is required.");
  }

  return Object.freeze({
    code: boundedText(error.code, "UNKNOWN_ERROR"),
    name: boundedText(error.name, "Error"),
    message: diagnosticMessage(error.message, "Operation failed."),
    retryable: error.retryable === true
  });
}

export function createDiagnosticTracker({
  productVersion = "0.1.0",
  now = () => Date.now(),
  maxRecords = 32
} = {}) {
  if (typeof productVersion !== "string" || productVersion.length === 0 || productVersion.length > 128) {
    throw new TypeError("productVersion must be a non-empty string up to 128 characters.");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0 || maxRecords > 32) {
    throw new RangeError("maxRecords must be an integer between 1 and 32.");
  }

  const recent = [];
  let sequence = 0;

  function nextOperationId() {
    sequence += 1;
    return `diag-${sequence}`;
  }

  function lastSuccessFor(operationId) {
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      const record = recent[index];
      if (record.operationId === operationId && record.status === "ok") {
        return record.checkpoint;
      }
    }
    return null;
  }

  function append(record) {
    recent.push(Object.freeze(record));
    while (recent.length > maxRecords) recent.shift();
    return recent.at(-1);
  }

  function baseRecord({ component, operation, operationId, checkpoint, context }) {
    assertCheckpoint(component, checkpoint);
    const safeOperationId = sanitizeOperationId(operationId, nextOperationId());
    return {
      schemaVersion: 1,
      atMs: now(),
      productVersion,
      component,
      operation: boundedText(operation, "operation"),
      operationId: safeOperationId,
      checkpoint,
      context: Object.freeze(sanitizeDiagnosticContext(context))
    };
  }

  function recordSuccess(input) {
    const base = baseRecord(input);
    return append({
      ...base,
      status: "ok",
      lastSuccessfulCheckpoint: base.checkpoint,
      error: null
    });
  }

  function recordError(input) {
    const base = baseRecord(input);
    return append({
      ...base,
      status: "error",
      lastSuccessfulCheckpoint: input.lastSuccessfulCheckpoint
        ?? lastSuccessFor(base.operationId),
      error: sanitizeError(input.error)
    });
  }

  function snapshot() {
    const lastError = [...recent].reverse().find((record) => record.status === "error") ?? null;
    const lastSuccessful = [...recent].reverse().find((record) => record.status === "ok") ?? null;
    return Object.freeze({
      lastSuccessfulCheckpoint: lastSuccessful?.checkpoint ?? null,
      lastError,
      recent: Object.freeze([...recent])
    });
  }

  return Object.freeze({
    recordSuccess,
    recordError,
    snapshot
  });
}

export function formatCliDiagnostic(record) {
  if (!record || record.schemaVersion !== 1 || record.status !== "error") {
    throw new TypeError("A DiagnosticRecord error is required.");
  }
  return `MARKET_FLOW_US_DIAGNOSTIC ${JSON.stringify(record)}`;
}
