import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES
} from "../../shared/diagnostics/index.js";
import { ERROR_CODES, PROTOCOL_VERSION } from "../../shared/protocol/index.js";

const SOCKET_OPEN = 1;

export class ViewerClientError extends Error {
  constructor(message, { code = null, retryable = false } = {}) {
    super(message);
    this.name = "ViewerClientError";
    this.code = code;
    this.retryable = retryable === true;
  }
}

export class ViewerUnavailableError extends ViewerClientError {
  constructor(
    message = "MarketScope service is unavailable.",
    { code = DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE } = {}
  ) {
    super(message, { code, retryable: false });
    this.name = "ViewerUnavailableError";
  }
}

function assertNonEmptyString(value, name, maxLength = 4096) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function defaultCreateSocket(url) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new ViewerUnavailableError("Browser WebSocket is unavailable.");
  }
  return new globalThis.WebSocket(url);
}

export function createViewerClient({
  url = "ws://127.0.0.1:8765",
  productVersion = "0.1.0",
  clientInstanceId = "market-scope-browser-viewer",
  createSocket = defaultCreateSocket,
  diagnosticTracker = createDiagnosticTracker({ productVersion })
} = {}) {
  assertNonEmptyString(url, "url");
  assertNonEmptyString(productVersion, "productVersion", 128);
  assertNonEmptyString(clientInstanceId, "clientInstanceId", 128);
  if (typeof createSocket !== "function") {
    throw new TypeError("createSocket must be a function.");
  }

  let socket = null;
  let state = "idle";
  let connectPromise = null;
  let requestSequence = 0;
  let explicitClose = false;
  const pending = new Map();

  function diagnosticSpec(type) {
    if (type === "viewer.current.get" || type === "viewer.status.get") {
      return {
        component: "viewer",
        checkpoint: "viewer.current.read",
        name: "ViewerReadError",
        message: "Trusted Current/status read failed."
      };
    }
    if (type === "viewer.security.get" || type === "viewer.history.page") {
      return {
        component: "viewer",
        checkpoint: "viewer.detail.read",
        name: "ViewerReadError",
        message: "Trusted Detail/history read failed."
      };
    }
    if (type === "scanner.execute") {
      return {
        component: "scanner",
        checkpoint: "scanner.execute",
        name: "ScannerExecutionError",
        message: "Scanner execution failed."
      };
    }
    if (type.startsWith("scanner.queries.")) {
      return {
        component: "scanner",
        checkpoint: "scanner.query_library",
        name: "ScannerQueryLibraryError",
        message: "Saved-query library operation failed."
      };
    }
    return null;
  }

  function recordServiceHelloFailure() {
    return diagnosticTracker.recordError({
      component: "browser.runtime",
      operation: "service.hello",
      operationId: "viewer-service-hello",
      checkpoint: "browser.service.hello",
      lastSuccessfulCheckpoint: "browser.runtime.loaded",
      error: {
        code: DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE,
        name: "ServiceUnavailableError",
        message: "Local MarketScope service is unavailable.",
        retryable: false
      }
    });
  }

  function snapshotState() {
    return Object.freeze({
      state,
      pendingRequests: pending.size
    });
  }

  function rejectPending(error) {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  }

  function failTransport(message) {
    const previousState = state;
    const error = new ViewerUnavailableError(message, {
      code: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED
    });
    state = "disconnected";
    rejectPending(error);

    if (previousState === "ready") {
      diagnosticTracker.recordError({
        component: "browser.runtime",
        operation: "service.connection",
        operationId: "viewer-service-connection",
        checkpoint: "browser.service.connection",
        lastSuccessfulCheckpoint: diagnosticTracker.snapshot().lastSuccessfulCheckpoint,
        error: {
          code: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED,
          name: "ServiceDisconnectedError",
          message: "Local MarketScope service connection was lost.",
          retryable: false
        }
      });
    }

    if (socket && socket.readyState !== 3) {
      try {
        socket.close(1008, "Viewer transport failed");
      } catch {
        // The Viewer already considers the transport unavailable.
      }
    }

    return error;
  }

  function handleResponseEvent(event) {
    let message;

    try {
      const raw = typeof event?.data === "string"
        ? event.data
        : event?.data?.toString?.();
      message = JSON.parse(raw);
    } catch {
      failTransport("MarketScope service returned an invalid response.");
      return;
    }

    if (
      message?.v !== PROTOCOL_VERSION ||
      (message?.type !== "response.ok" && message?.type !== "response.error") ||
      typeof message?.requestId !== "string"
    ) {
      failTransport("MarketScope service returned an invalid response.");
      return;
    }

    const waiter = pending.get(message.requestId);
    if (!waiter) return;

    if (message?.payload?.requestType !== waiter.requestType) {
      pending.delete(message.requestId);
      waiter.reject(failTransport("MarketScope response correlation failed."));
      return;
    }

    pending.delete(message.requestId);

    if (message.type === "response.ok") {
      waiter.resolve(message.payload?.data ?? {});
      return;
    }

    waiter.reject(new ViewerClientError(
      typeof message.payload?.message === "string"
        ? message.payload.message
        : "MarketScope service rejected the request.",
      {
        code: typeof message.payload?.code === "string" ? message.payload.code : null,
        retryable: message.payload?.retryable === true
      }
    ));
  }

  function attachSocketListeners(openResolve, openReject) {
    let openSettled = false;

    socket.addEventListener("open", () => {
      if (openSettled) return;
      openSettled = true;
      openResolve();
    });

    socket.addEventListener("message", handleResponseEvent);

    socket.addEventListener("error", () => {
      if (!openSettled) {
        openSettled = true;
        openReject(new ViewerUnavailableError("Could not connect to MarketScope service."));
      }
    });

    socket.addEventListener("close", () => {
      if (!openSettled) {
        openSettled = true;
        openReject(new ViewerUnavailableError("Could not connect to MarketScope service."));
      }

      if (explicitClose) {
        state = "closed";
        rejectPending(new ViewerUnavailableError("Viewer client is closed."));
        return;
      }

      if (state !== "disconnected") {
        failTransport("MarketScope service connection was lost.");
      }
    });
  }

  function sendRequest(type, payload) {
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return Promise.reject(new ViewerUnavailableError("MarketScope service is unavailable."));
    }

    requestSequence += 1;
    const requestId = `viewer-${requestSequence}`;

    return new Promise((resolve, reject) => {
      pending.set(requestId, { requestType: type, resolve, reject });

      try {
        socket.send(JSON.stringify({
          v: PROTOCOL_VERSION,
          type,
          requestId,
          payload
        }));
      } catch {
        pending.delete(requestId);
        reject(failTransport("MarketScope service connection was lost."));
      }
    });
  }

  async function connect() {
    if (state === "ready") return snapshotState();
    if (connectPromise) return await connectPromise;
    if (state !== "idle") {
      throw new ViewerUnavailableError(
        "Viewer client requires an explicit relaunch after disconnect."
      );
    }

    state = "connecting";
    explicitClose = false;

    connectPromise = (async () => {
      try {
        socket = createSocket(url);
      } catch {
        throw new ViewerUnavailableError("Could not connect to MarketScope service.");
      }

      if (!socket || typeof socket.addEventListener !== "function") {
        throw new ViewerUnavailableError("Could not connect to MarketScope service.");
      }

      await new Promise((resolve, reject) => {
        attachSocketListeners(resolve, reject);
      });

      const hello = await sendRequest("client.hello", {
        role: "viewer",
        clientInstanceId,
        productVersion
      });

      if (
        hello.protocolVersion !== PROTOCOL_VERSION ||
        hello.role !== "viewer" ||
        hello.ready !== true
      ) {
        throw failTransport("MarketScope service is not ready.");
      }

      state = "ready";
      diagnosticTracker.recordSuccess({
        component: "browser.runtime",
        operation: "service.hello",
        operationId: "viewer-service-hello",
        checkpoint: "browser.service.hello"
      });
      return snapshotState();
    })();

    try {
      return await connectPromise;
    } catch (error) {
      state = "disconnected";
      rejectPending(error instanceof Error ? error : new ViewerUnavailableError());
      recordServiceHelloFailure();
      if (error instanceof ViewerUnavailableError) {
        throw error;
      }
      throw new ViewerUnavailableError("Could not connect to MarketScope service.");
    } finally {
      connectPromise = null;
    }
  }

  async function request(type, payload) {
    const spec = diagnosticSpec(type);
    try {
      await connect();
      const result = await sendRequest(type, payload);
      if (spec) {
        diagnosticTracker.recordSuccess({
          component: spec.component,
          operation: type,
          operationId: `viewer-${requestSequence}`,
          checkpoint: spec.checkpoint
        });
      }
      return result;
    } catch (error) {
      if (spec && !(error instanceof ViewerUnavailableError)) {
        diagnosticTracker.recordError({
          component: spec.component,
          operation: type,
          operationId: `viewer-${requestSequence}`,
          checkpoint: spec.checkpoint,
          error: {
            code: typeof error?.code === "string" ? error.code : ERROR_CODES.DB_ERROR,
            name: spec.name,
            message: spec.message,
            retryable: error?.retryable === true
          }
        });
      }
      throw error;
    }
  }

  async function getCurrent() {
    return await request("viewer.current.get", {});
  }

  async function getStatus() {
    return await request("viewer.status.get", {});
  }

  async function getSecurity(securityId) {
    assertNonEmptyString(securityId, "securityId", 128);
    return await request("viewer.security.get", { securityId });
  }

  async function getHistoryPage(securityId, cursor = null) {
    assertNonEmptyString(securityId, "securityId", 128);
    if (cursor !== null) {
      assertNonEmptyString(cursor, "cursor");
    }
    return await request("viewer.history.page", { securityId, cursor });
  }

  async function getSupportSnapshot() {
    return await request("viewer.support.snapshot", {});
  }

  async function executeScanner(sql) {
    if (typeof sql !== "string") {
      throw new TypeError("sql must be a string.");
    }
    return await request("scanner.execute", { sql });
  }

  async function listScannerQueries() {
    return await request("scanner.queries.list", {});
  }

  async function createScannerQuery({ name, sql, intervalMs }) {
    return await request("scanner.queries.create", { name, sql, intervalMs });
  }

  async function updateScannerQuery({ queryId, name, sql, intervalMs }) {
    return await request("scanner.queries.update", {
      queryId,
      name,
      sql,
      intervalMs
    });
  }

  async function deleteScannerQuery(queryId) {
    assertNonEmptyString(queryId, "queryId", 128);
    return await request("scanner.queries.delete", { queryId });
  }

  function close() {
    if (state === "closed") return;
    explicitClose = true;
    state = "closed";
    rejectPending(new ViewerUnavailableError("Viewer client is closed."));

    if (socket && socket.readyState !== 3) {
      socket.close(1000, "Viewer client closed");
    }
  }

  return Object.freeze({
    connect,
    getCurrent,
    getStatus,
    getSecurity,
    getHistoryPage,
    getSupportSnapshot,
    executeScanner,
    listScannerQueries,
    createScannerQuery,
    updateScannerQuery,
    deleteScannerQuery,
    close,
    getState: snapshotState
  });
}
