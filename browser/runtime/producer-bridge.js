import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES
} from "../../shared/diagnostics/index.js";
import { ERROR_CODES, PROTOCOL_VERSION } from "../../shared/protocol/index.js";
import { createRecorderConfig } from "../recorder/config.js";

const SOCKET_OPEN = 1;
const COMMIT_CHANNEL = "market-flow-us:v1";

export class ProducerBridgeError extends Error {
  constructor(message, { code = null, retryable = false } = {}) {
    super(message);
    this.name = "ProducerBridgeError";
    this.code = code;
    this.retryable = retryable === true;
  }
}

export class ProducerTransportError extends ProducerBridgeError {
  constructor(
    message = "Producer transport is unavailable.",
    { code = DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE } = {}
  ) {
    super(message, { code, retryable: false });
    this.name = "ProducerTransportError";
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function collectorConfigPayload(configOverrides) {
  const config = createRecorderConfig(configOverrides);
  return Object.freeze({
    snapshotIntervalMs: config.snapshotIntervalMs,
    chunkDelayMs: config.chunkDelayMs,
    chunkSize: config.chunkSize,
    refreshUniverseEveryCycle: config.refreshUniverseEveryCycle
  });
}

function defaultCreateSocket(url) {
  if (typeof globalThis.WebSocket !== "function") {
    throw new ProducerTransportError("Browser WebSocket is unavailable.");
  }
  return new globalThis.WebSocket(url);
}

function defaultCreateBroadcastChannel(name) {
  if (typeof globalThis.BroadcastChannel !== "function") {
    return null;
  }
  return new globalThis.BroadcastChannel(name);
}

function normalizeTransportError(error, fallback) {
  if (error instanceof ProducerBridgeError) return error;
  if (error instanceof Error && error.message) {
    return new ProducerTransportError(error.message);
  }
  return new ProducerTransportError(fallback);
}

export function createProducerBridge({
  url = "ws://127.0.0.1:8765",
  productVersion = "0.1.0",
  clientInstanceId = "market-flow-us-browser-producer",
  createSocket = defaultCreateSocket,
  createBroadcastChannel = defaultCreateBroadcastChannel,
  heartbeatMs = 5000,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (handle) => clearTimeout(handle),
  now = () => Date.now(),
  onDisconnect = () => {},
  diagnosticTracker = createDiagnosticTracker({ productVersion, now })
} = {}) {
  assertNonEmptyString(url, "url");
  assertNonEmptyString(productVersion, "productVersion");
  assertNonEmptyString(clientInstanceId, "clientInstanceId");
  assertPositiveInteger(heartbeatMs, "heartbeatMs");

  for (const [name, value] of Object.entries({
    createSocket,
    createBroadcastChannel,
    schedule,
    cancelSchedule,
    now,
    onDisconnect
  })) {
    if (typeof value !== "function") {
      throw new TypeError(`${name} must be a function.`);
    }
  }

  let socket = null;
  let state = "idle";
  let connectPromise = null;
  let requestSequence = 0;
  let sessionId = null;
  let acknowledgedUniverseRevision = null;
  let heartbeatHandle = null;
  let explicitClose = false;
  let disconnectNotified = false;
  let broadcastChannel = null;
  const pending = new Map();

  function recordFailure({
    component,
    operation,
    operationId,
    checkpoint,
    lastSuccessfulCheckpoint = null,
    error,
    fallbackCode,
    name,
    message
  }) {
    return diagnosticTracker.recordError({
      component,
      operation,
      operationId,
      checkpoint,
      lastSuccessfulCheckpoint,
      error: {
        code: typeof error?.code === "string" ? error.code : fallbackCode,
        name,
        message,
        retryable: error?.retryable === true
      }
    });
  }

  function snapshotState() {
    return Object.freeze({
      state,
      sessionId,
      acknowledgedUniverseRevision,
      pendingRequests: pending.size
    });
  }

  function clearHeartbeat() {
    if (heartbeatHandle === null) return;
    cancelSchedule(heartbeatHandle);
    heartbeatHandle = null;
  }

  function closeBroadcastChannel() {
    if (!broadcastChannel) return;
    try {
      broadcastChannel.close?.();
    } catch {
      // BroadcastChannel is only an invalidation hint; close failures are non-authoritative.
    }
    broadcastChannel = null;
  }

  function rejectPending(error) {
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  }

  function notifyDisconnect(error) {
    if (disconnectNotified || explicitClose || sessionId === null) return;
    disconnectNotified = true;
    Promise.resolve(onDisconnect(error)).catch(() => {});
  }

  function failTransport(error) {
    const previousState = state;
    const normalized = normalizeTransportError(error, "Producer transport was lost.");
    const hadSession = sessionId !== null;

    if (previousState === "ready") {
      recordFailure({
        component: "browser.runtime",
        operation: "service.connection",
        operationId: "producer-service-connection",
        checkpoint: "browser.service.connection",
        lastSuccessfulCheckpoint: diagnosticTracker.snapshot().lastSuccessfulCheckpoint,
        error: new ProducerTransportError("Market Flow US service connection was lost.", {
          code: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED
        }),
        fallbackCode: DIAGNOSTIC_CODES.SERVICE_DISCONNECTED,
        name: "ServiceDisconnectedError",
        message: "Local Market Flow US service connection was lost."
      });
    }

    clearHeartbeat();
    rejectPending(normalized);
    state = "disconnected";
    acknowledgedUniverseRevision = null;

    if (hadSession) {
      notifyDisconnect(normalized);
    }

    sessionId = null;
    closeBroadcastChannel();
    return normalized;
  }

  function closeFailClosed(error) {
    const normalized = failTransport(error);
    if (socket && socket.readyState !== 3) {
      try {
        socket.close(1008, "Producer transport failed");
      } catch {
        // The transport is already failed from the Browser authority perspective.
      }
    }
    return normalized;
  }

  function handleResponseEvent(event) {
    let message;

    try {
      const raw = typeof event?.data === "string"
        ? event.data
        : event?.data?.toString?.();
      message = JSON.parse(raw);
    } catch {
      closeFailClosed(new ProducerTransportError("Service returned an invalid protocol response."));
      return;
    }

    if (
      message?.v !== PROTOCOL_VERSION ||
      (message?.type !== "response.ok" && message?.type !== "response.error") ||
      typeof message?.requestId !== "string"
    ) {
      closeFailClosed(new ProducerTransportError("Service returned an invalid protocol response."));
      return;
    }

    const waiter = pending.get(message.requestId);
    if (!waiter) return;

    if (message?.payload?.requestType !== waiter.requestType) {
      pending.delete(message.requestId);
      waiter.reject(closeFailClosed(
        new ProducerTransportError("Service response correlation is invalid.")
      ));
      return;
    }

    pending.delete(message.requestId);

    if (message.type === "response.ok") {
      waiter.resolve(message.payload?.data ?? {});
      return;
    }

    waiter.reject(new ProducerBridgeError(
      String(message.payload?.message ?? "Service rejected producer request."),
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
        openReject(new ProducerTransportError("Could not connect to Market Flow US service."));
      }
    });

    socket.addEventListener("close", (event) => {
      if (!openSettled) {
        openSettled = true;
        openReject(new ProducerTransportError("Market Flow US service connection closed during startup."));
      }

      if (explicitClose) {
        clearHeartbeat();
        rejectPending(new ProducerTransportError("Producer session is closed."));
        state = "stopped";
        sessionId = null;
        acknowledgedUniverseRevision = null;
        closeBroadcastChannel();
        return;
      }

      closeFailClosed(new ProducerTransportError(
        `Market Flow US service connection closed (code ${event?.code ?? "unknown"}).`
      ));
    });
  }

  function sendRequest(type, payload) {
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return Promise.reject(new ProducerTransportError("Market Flow US service is not connected."));
    }

    requestSequence += 1;
    const requestId = `producer-${requestSequence}`;
    const request = {
      v: PROTOCOL_VERSION,
      type,
      requestId,
      payload
    };

    return new Promise((resolve, reject) => {
      pending.set(requestId, { requestType: type, resolve, reject });
      try {
        socket.send(JSON.stringify(request));
      } catch (error) {
        pending.delete(requestId);
        reject(closeFailClosed(error));
      }
    });
  }

  async function connect() {
    if (state === "ready") return snapshotState();
    if (connectPromise) return await connectPromise;
    if (state !== "idle") {
      throw new ProducerTransportError("Producer bridge requires an explicit relaunch after disconnect.");
    }

    state = "connecting";
    explicitClose = false;
    disconnectNotified = false;

    connectPromise = (async () => {
      socket = createSocket(url);
      if (!socket || typeof socket.addEventListener !== "function") {
        throw new ProducerTransportError("createSocket must return a WebSocket-compatible object.");
      }

      await new Promise((resolve, reject) => {
        attachSocketListeners(resolve, reject);
      });

      const hello = await sendRequest("client.hello", {
        role: "producer",
        clientInstanceId,
        productVersion
      });

      if (hello.protocolVersion !== PROTOCOL_VERSION || hello.role !== "producer" || hello.ready !== true) {
        throw closeFailClosed(new ProducerTransportError("Market Flow US service hello was not ready."));
      }

      state = "ready";
      diagnosticTracker.recordSuccess({
        component: "browser.runtime",
        operation: "service.hello",
        operationId: "producer-service-hello",
        checkpoint: "browser.service.hello"
      });
      return snapshotState();
    })();

    try {
      return await connectPromise;
    } catch (error) {
      recordFailure({
        component: "browser.runtime",
        operation: "service.hello",
        operationId: "producer-service-hello",
        checkpoint: "browser.service.hello",
        lastSuccessfulCheckpoint: "browser.runtime.loaded",
        error: new ProducerTransportError("Could not connect to Market Flow US service."),
        fallbackCode: DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE,
        name: "ServiceUnavailableError",
        message: "Local Market Flow US service is unavailable."
      });
      throw closeFailClosed(error);
    } finally {
      connectPromise = null;
    }
  }

  function armHeartbeat() {
    clearHeartbeat();
    if (sessionId === null || state !== "ready") return;

    heartbeatHandle = schedule(async () => {
      heartbeatHandle = null;
      if (sessionId === null || state !== "ready") return;

      try {
        await sendRequest("producer.heartbeat", { atMs: now() });
      } catch (error) {
        closeFailClosed(error);
        return;
      }

      armHeartbeat();
    }, heartbeatMs);
  }

  async function startSession(configOverrides = {}) {
    if (sessionId !== null) {
      throw new ProducerBridgeError("Producer session is already started.");
    }

    await connect();

    const config = collectorConfigPayload(configOverrides);
    try {
      const data = await sendRequest("producer.session.start", {
        startedAtMs: now(),
        config
      });

      assertNonEmptyString(data.sessionId, "sessionId");
      sessionId = data.sessionId;
      acknowledgedUniverseRevision = null;

      diagnosticTracker.recordSuccess({
        component: "producer",
        operation: "producer.session.start",
        operationId: "producer-session-start",
        checkpoint: "producer.session.started"
      });

      if (!broadcastChannel) {
        broadcastChannel = createBroadcastChannel(COMMIT_CHANNEL);
      }

      armHeartbeat();
      return data;
    } catch (error) {
      recordFailure({
        component: "producer",
        operation: "producer.session.start",
        operationId: "producer-session-start",
        checkpoint: "producer.session.started",
        error,
        fallbackCode: ERROR_CODES.DB_ERROR,
        name: "ProducerSessionError",
        message: "Producer session establishment failed."
      });
      throw error;
    }
  }

  async function acceptUniverse(universe) {
    if (sessionId === null) {
      throw new ProducerBridgeError("Producer session is not started.");
    }

    try {
      const data = await sendRequest("producer.universe.replace", universe);
      if (!Number.isSafeInteger(data.universeRevision) || data.universeRevision <= 0) {
        throw closeFailClosed(new ProducerTransportError("Universe ACK is invalid."));
      }

      acknowledgedUniverseRevision = data.universeRevision;
      diagnosticTracker.recordSuccess({
        component: "producer",
        operation: "producer.universe.replace",
        operationId: "producer-universe-replace",
        checkpoint: "producer.universe.accepted",
        context: { universeRevision: data.universeRevision }
      });
      return data;
    } catch (error) {
      recordFailure({
        component: "producer",
        operation: "producer.universe.replace",
        operationId: "producer-universe-replace",
        checkpoint: "producer.universe.accepted",
        lastSuccessfulCheckpoint: "provider.universe.collected",
        error,
        fallbackCode: ERROR_CODES.UNIVERSE_INVALID,
        name: "UniverseAcceptanceError",
        message: "Validated universe was not accepted by local authority."
      });
      throw error;
    }
  }

  async function commitCycle(cycle) {
    if (sessionId === null) {
      throw new ProducerBridgeError("Producer session is not started.");
    }
    if (acknowledgedUniverseRevision === null) {
      throw new ProducerBridgeError("No acknowledged universe revision is available.");
    }

    try {
      const data = await sendRequest("producer.cycle.commit", {
        universeRevision: acknowledgedUniverseRevision,
        cycle
      });

      if (!Number.isSafeInteger(data.cycleId) || data.cycleId <= 0) {
        throw closeFailClosed(new ProducerTransportError("Cycle COMMIT ACK is invalid."));
      }

      diagnosticTracker.recordSuccess({
        component: "persistence",
        operation: "producer.cycle.commit",
        operationId: "producer-cycle-commit",
        checkpoint: "producer.cycle.committed",
        context: { cycleId: data.cycleId, universeRevision: acknowledgedUniverseRevision }
      });

      broadcastChannel?.postMessage({
        type: "CYCLE_COMMITTED",
        cycleId: data.cycleId,
        completedAtMs: cycle.completedAtMs
      });

      return data;
    } catch (error) {
      recordFailure({
        component: "persistence",
        operation: "producer.cycle.commit",
        operationId: "producer-cycle-commit",
        checkpoint: "producer.cycle.committed",
        lastSuccessfulCheckpoint: "provider.cycle.collected",
        error,
        fallbackCode: ERROR_CODES.DB_ERROR,
        name: "PersistenceError",
        message: "Cycle COMMIT was not acknowledged by local authority."
      });
      throw error;
    }
  }

  async function reportFailedCycle(report) {
    if (sessionId === null) {
      throw new ProducerBridgeError("Producer session is not started.");
    }
    return await sendRequest("producer.cycle.failed", { report });
  }

  async function stopSession(reason = "manual") {
    if (sessionId === null) {
      return snapshotState();
    }

    assertNonEmptyString(String(reason), "reason");
    clearHeartbeat();

    let data;
    try {
      data = await sendRequest("producer.session.stop", {
        stoppedAtMs: now(),
        reason: String(reason)
      });
    } catch (error) {
      throw closeFailClosed(error);
    }

    sessionId = null;
    acknowledgedUniverseRevision = null;
    explicitClose = true;
    state = "stopped";
    closeBroadcastChannel();

    if (socket && socket.readyState !== 3) {
      socket.close(1000, "Producer session stopped");
    }

    return data;
  }

  function getRecorderCallbacks() {
    return Object.freeze({
      acceptUniverse: async (universe) => await acceptUniverse(universe),
      onCycle: async (cycle) => await commitCycle(cycle),
      onFailure: async (report) => await reportFailedCycle(report)
    });
  }

  return Object.freeze({
    connect,
    startSession,
    acceptUniverse,
    commitCycle,
    reportFailedCycle,
    stopSession,
    getRecorderCallbacks,
    getState: snapshotState
  });
}
