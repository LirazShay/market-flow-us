import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES
} from "../../shared/diagnostics/index.js";
import { validateDemoBuyCapturePayload } from "../../shared/demo-buy/capture.js";
import { DEMO_BUY_MAX_ENCODED_REQUEST_BYTES } from "../../shared/demo-buy/limits.js";
import { ERROR_CODES, PROTOCOL_VERSION } from "../../shared/protocol/index.js";

const SOCKET_OPEN = 1;
const UTF8 = new TextEncoder();

export const DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT = Object.freeze({
  COMMITTED: "CONFIRMED_COMMITTED",
  REJECTED: "CONFIRMED_REJECTED",
  UNKNOWN: "ACKNOWLEDGEMENT_UNKNOWN"
});

export const DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT = Object.freeze({
  CREATED: "CONFIRMED_CREATED",
  UNKNOWN: "ACKNOWLEDGEMENT_UNKNOWN"
});

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
    message = "Market Flow US service is unavailable.",
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

function assertPositiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function defaultCreateSocket(url) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new ViewerUnavailableError("Browser WebSocket is unavailable.");
  }
  return new globalThis.WebSocket(url);
}

function encodedRequestBytes(type, requestId, payload) {
  return UTF8.encode(JSON.stringify({
    v: PROTOCOL_VERSION,
    type,
    requestId,
    payload
  })).byteLength;
}

export function createViewerClient({
  url = "ws://127.0.0.1:8765",
  productVersion = "0.1.0",
  clientInstanceId = "market-flow-us-browser-viewer",
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
  let captureAcknowledgementLocked = false;
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
    if (type === "order.buy.prepare") {
      return {
        component: "basic_buy",
        checkpoint: "basic_buy.prepare",
        name: "BasicBuyPrepareError",
        message: "Basic BUY preparation failed safely."
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
    if (type === "demo.buy.capture") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.capture",
        name: "DemoBuyCaptureError",
        message: "Demo Buy capture did not receive a confirmed commit."
      };
    }
    if (type === "demo.buy.page") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.read",
        name: "DemoBuyReadError",
        message: "Demo Buy page read failed."
      };
    }
    if (type === "demo.buy.observation.get") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.observation_read",
        name: "DemoBuyObservationReadError",
        message: "Demo Buy observation read failed."
      };
    }
    if (type === "demo.buy.capture.get") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.provenance_read",
        name: "DemoBuyProvenanceReadError",
        message: "Demo Buy provenance read failed."
      };
    }
    if (type === "demo.buy.ai-pack.create") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.ai_pack_export",
        name: "DemoBuyAiPackExportError",
        message: "AI Investigation pack generation failed."
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
        message: "Local Market Flow US service is unavailable.",
        retryable: false
      }
    });
  }

  function snapshotState() {
    return Object.freeze({
      state,
      pendingRequests: pending.size,
      captureAcknowledgementLocked
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
          message: "Local Market Flow US service connection was lost.",
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
      failTransport("Market Flow US service returned an invalid response.");
      return;
    }

    if (
      message?.v !== PROTOCOL_VERSION ||
      (message?.type !== "response.ok" && message?.type !== "response.error") ||
      typeof message?.requestId !== "string"
    ) {
      failTransport("Market Flow US service returned an invalid response.");
      return;
    }

    const waiter = pending.get(message.requestId);
    if (!waiter) return;

    if (message?.payload?.requestType !== waiter.requestType) {
      pending.delete(message.requestId);
      waiter.reject(failTransport("Market Flow US response correlation failed."));
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
        : "Market Flow US service rejected the request.",
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
        openReject(new ViewerUnavailableError("Could not connect to Market Flow US service."));
      }
    });

    socket.addEventListener("close", () => {
      if (!openSettled) {
        openSettled = true;
        openReject(new ViewerUnavailableError("Could not connect to Market Flow US service."));
      }

      if (explicitClose) {
        state = "closed";
        rejectPending(new ViewerUnavailableError("Viewer client is closed."));
        return;
      }

      if (state !== "disconnected") {
        failTransport("Market Flow US service connection was lost.");
      }
    });
  }

  function nextRequestId() {
    requestSequence += 1;
    return `viewer-${requestSequence}`;
  }

  function sendRequest(type, payload, requestId = nextRequestId(), { onDispatched = null } = {}) {
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return Promise.reject(new ViewerUnavailableError("Market Flow US service is unavailable."));
    }

    return new Promise((resolve, reject) => {
      pending.set(requestId, { requestType: type, resolve, reject });

      try {
        socket.send(JSON.stringify({
          v: PROTOCOL_VERSION,
          type,
          requestId,
          payload
        }));
        onDispatched?.();
      } catch {
        pending.delete(requestId);
        reject(failTransport("Market Flow US service connection was lost."));
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
        throw new ViewerUnavailableError("Could not connect to Market Flow US service.");
      }

      if (!socket || typeof socket.addEventListener !== "function") {
        throw new ViewerUnavailableError("Could not connect to Market Flow US service.");
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
        throw failTransport("Market Flow US service is not ready.");
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
      throw new ViewerUnavailableError("Could not connect to Market Flow US service.");
    } finally {
      connectPromise = null;
    }
  }

  async function request(type, payload) {
    const spec = diagnosticSpec(type);
    let requestId = null;
    try {
      await connect();
      requestId = nextRequestId();
      const result = await sendRequest(type, payload, requestId);
      if (spec) {
        diagnosticTracker.recordSuccess({
          component: spec.component,
          operation: type,
          operationId: requestId,
          checkpoint: spec.checkpoint
        });
      }
      return result;
    } catch (error) {
      if (spec && requestId !== null && !(error instanceof ViewerUnavailableError)) {
        diagnosticTracker.recordError({
          component: spec.component,
          operation: type,
          operationId: requestId,
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

  async function captureDemoBuy(payload) {
    validateDemoBuyCapturePayload(payload);
    if (captureAcknowledgementLocked) {
      throw new ViewerUnavailableError(
        "Demo Buy capture requires an explicit Viewer relaunch after acknowledgement became unknown."
      );
    }

    await connect();
    const requestId = nextRequestId();
    if (encodedRequestBytes("demo.buy.capture", requestId, payload) > DEMO_BUY_MAX_ENCODED_REQUEST_BYTES) {
      throw new TypeError("Demo Buy capture request exceeds the 16 MiB transport limit.");
    }

    let dispatched = false;
    const spec = diagnosticSpec("demo.buy.capture");
    try {
      const result = await sendRequest(
        "demo.buy.capture",
        payload,
        requestId,
        { onDispatched: () => { dispatched = true; } }
      );
      diagnosticTracker.recordSuccess({
        component: spec.component,
        operation: "demo.buy.capture",
        operationId: requestId,
        checkpoint: spec.checkpoint,
        context: {
          captureId: result.captureId,
          capturedItemCount: result.capturedItemCount
        }
      });
      return Object.freeze({
        status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.COMMITTED,
        captureId: result.captureId,
        capturedAtMs: result.capturedAtMs,
        capturedItemCount: result.capturedItemCount
      });
    } catch (error) {
      if (error instanceof ViewerUnavailableError) {
        if (!dispatched) throw error;
        captureAcknowledgementLocked = true;
        diagnosticTracker.recordError({
          component: spec.component,
          operation: "demo.buy.capture",
          operationId: requestId,
          checkpoint: spec.checkpoint,
          error: {
            code: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED,
            name: "DemoBuyAcknowledgementUnknown",
            message: "Demo Buy acknowledgement is unknown after transport loss.",
            retryable: false
          }
        });
        return Object.freeze({
          status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.UNKNOWN
        });
      }

      diagnosticTracker.recordError({
        component: spec.component,
        operation: "demo.buy.capture",
        operationId: requestId,
        checkpoint: spec.checkpoint,
        error: {
          code: typeof error?.code === "string" ? error.code : ERROR_CODES.DB_ERROR,
          name: spec.name,
          message: spec.message,
          retryable: false
        }
      });
      return Object.freeze({
        status: DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.REJECTED,
        code: typeof error?.code === "string" ? error.code : ERROR_CODES.DB_ERROR,
        message: error instanceof Error ? error.message : spec.message
      });
    }
  }

  async function createDemoBuyAiPack(captureId, securityId) {
    assertPositiveSafeInteger(captureId, "captureId");
    assertNonEmptyString(securityId, "securityId", 128);

    await connect();
    const requestId = nextRequestId();
    const spec = diagnosticSpec("demo.buy.ai-pack.create");
    let dispatched = false;

    try {
      const result = await sendRequest(
        "demo.buy.ai-pack.create",
        { captureId, securityId },
        requestId,
        { onDispatched: () => { dispatched = true; } }
      );
      diagnosticTracker.recordSuccess({
        component: spec.component,
        operation: "demo.buy.ai-pack.create",
        operationId: requestId,
        checkpoint: spec.checkpoint,
        context: {
          captureId,
          securityId,
          fileCount: result.fileCount,
          targetInScannerContext: result.targetInScannerContext,
          outcomeEvidenceStatus: result.outcomeEvidenceStatus
        }
      });
      return Object.freeze({
        status: DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.CREATED,
        ...result
      });
    } catch (error) {
      if (error instanceof ViewerUnavailableError) {
        if (!dispatched) throw error;
        diagnosticTracker.recordError({
          component: spec.component,
          operation: "demo.buy.ai-pack.create",
          operationId: requestId,
          checkpoint: spec.checkpoint,
          error: {
            code: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED,
            name: "DemoBuyAiPackAcknowledgementUnknown",
            message: "AI Investigation pack acknowledgement is unknown after transport loss.",
            retryable: true
          }
        });
        return Object.freeze({
          status: DEMO_BUY_AI_PACK_ACKNOWLEDGEMENT.UNKNOWN
        });
      }

      diagnosticTracker.recordError({
        component: spec.component,
        operation: "demo.buy.ai-pack.create",
        operationId: requestId,
        checkpoint: spec.checkpoint,
        error: {
          code: typeof error?.code === "string" ? error.code : ERROR_CODES.DB_ERROR,
          name: spec.name,
          message: spec.message,
          retryable: error?.retryable === true
        }
      });
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

  async function prepareBuy(securityId) {
    assertNonEmptyString(securityId, "securityId", 128);
    return await request("order.buy.prepare", { securityId });
  }

  async function getDemoBuyPage(cursor = null) {
    if (cursor !== null) assertNonEmptyString(cursor, "cursor");
    return await request("demo.buy.page", { cursor });
  }

  async function getDemoBuyObservation(captureId, securityId) {
    assertPositiveSafeInteger(captureId, "captureId");
    assertNonEmptyString(securityId, "securityId", 128);
    return await request("demo.buy.observation.get", { captureId, securityId });
  }

  async function getDemoBuyCapture(captureId) {
    assertPositiveSafeInteger(captureId, "captureId");
    return await request("demo.buy.capture.get", { captureId });
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
    prepareBuy,
    getDemoBuyPage,
    getDemoBuyObservation,
    getDemoBuyCapture,
    createDemoBuyAiPack,
    getSupportSnapshot,
    executeScanner,
    listScannerQueries,
    createScannerQuery,
    updateScannerQuery,
    deleteScannerQuery,
    captureDemoBuy,
    close,
    getState: snapshotState
  });
}