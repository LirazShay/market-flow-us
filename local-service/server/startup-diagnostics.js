import { DIAGNOSTIC_CODES } from "../../shared/diagnostics/index.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";

const STARTUP_OPERATION = "service.startup";
const STARTUP_OPERATION_ID = "service-startup";

function attachDiagnosticRecord(error, diagnosticRecord) {
  if (error && (typeof error === "object" || typeof error === "function")) {
    try {
      Object.defineProperty(error, "diagnosticRecord", {
        value: diagnosticRecord,
        configurable: true,
        enumerable: false,
        writable: false
      });
      return error;
    } catch {
      // Fall through to a safe wrapper only when the original error cannot carry metadata.
    }
  }

  const wrapped = new Error("MarketScope service startup failed.");
  wrapped.name = "ServiceStartupError";
  Object.defineProperty(wrapped, "diagnosticRecord", {
    value: diagnosticRecord,
    configurable: true,
    enumerable: false,
    writable: false
  });
  return wrapped;
}

function databaseErrorDescriptor(error) {
  if (error?.code === ERROR_CODES.DB_SCHEMA_UNSUPPORTED) {
    return {
      code: ERROR_CODES.DB_SCHEMA_UNSUPPORTED,
      name: "DatabaseSchemaUnsupportedError",
      message: "Database schema version is not supported.",
      retryable: false
    };
  }

  return {
    code: ERROR_CODES.DB_ERROR,
    name: "DatabaseError",
    message: "Database initialization failed.",
    retryable: false
  };
}

export function recordDatabaseReady(tracker) {
  return tracker.recordSuccess({
    component: "node.database",
    operation: STARTUP_OPERATION,
    operationId: STARTUP_OPERATION_ID,
    checkpoint: "node.database.ready"
  });
}

export function recordDatabaseStartupFailure(tracker, error) {
  const record = tracker.recordError({
    component: "node.database",
    operation: STARTUP_OPERATION,
    operationId: STARTUP_OPERATION_ID,
    checkpoint: "node.database.ready",
    error: databaseErrorDescriptor(error)
  });
  return attachDiagnosticRecord(error, record);
}

export function recordServiceReady(tracker) {
  return tracker.recordSuccess({
    component: "node.service",
    operation: STARTUP_OPERATION,
    operationId: STARTUP_OPERATION_ID,
    checkpoint: "node.service.ready"
  });
}

export function recordServiceStartupFailure(
  tracker,
  error,
  {
    code = DIAGNOSTIC_CODES.SERVICE_LISTEN_ERROR,
    name = "ServiceListenError",
    message = "Loopback service listener could not start."
  } = {}
) {
  const record = tracker.recordError({
    component: "node.service",
    operation: STARTUP_OPERATION,
    operationId: STARTUP_OPERATION_ID,
    checkpoint: "node.service.ready",
    lastSuccessfulCheckpoint: "node.database.ready",
    error: {
      code,
      name,
      message,
      retryable: false
    }
  });
  return attachDiagnosticRecord(error, record);
}
