import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import { openMarketScopeDatabase } from "../database/database.js";
import { createSerializedWriter } from "../database/writer.js";
import { createProducerPersistence } from "../persistence/producer-authority.js";
import { createCycleAuthorityPersistence } from "../persistence/cycle-authority.js";
import { createDemoBuyCapturePersistence } from "../persistence/demo-buy-capture.js";
import { createViewerReads } from "../reads/viewer-reads.js";
import { createScannerAuthority } from "../scanner/scanner.js";
import { createSavedQueryLibrary } from "../scanner/query-library.js";
import {
  createDiagnosticTracker,
  DIAGNOSTIC_CODES
} from "../../shared/diagnostics/index.js";
import {
  recordDatabaseReady,
  recordDatabaseStartupFailure,
  recordServiceReady,
  recordServiceStartupFailure
} from "./startup-diagnostics.js";
import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  ProtocolValidationError,
  createErrorResponse,
  createOkResponse,
  errorResponseFrom,
  validateRequest
} from "../../shared/protocol/index.js";

function safeRequestContext(value) {
  return {
    requestId: typeof value?.requestId === "string" ? value.requestId : "unknown",
    requestType: typeof value?.type === "string" ? value.type : "unknown"
  };
}

function rejectUpgrade(socket, statusCode, statusText) {
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
    "Connection: close\r\n" +
    "Content-Length: 0\r\n" +
    "\r\n"
  );
}

function sendJson(socket, value, callback) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(value), callback);
}

function invalidMessageResponse(parsed) {
  return createErrorResponse({
    ...safeRequestContext(parsed),
    code: ERROR_CODES.INVALID_MESSAGE,
    retryable: false
  });
}

function operationError(code) {
  return new ProtocolValidationError(code);
}

async function closeWebSocket(socket) {
  if (socket.readyState === WebSocket.CLOSED) return;

  if (socket.readyState === WebSocket.CONNECTING) {
    socket.terminate();
    return;
  }

  const closed = once(socket, "close");
  socket.close(1001, "Service shutting down");
  await closed;
}

export async function startMarketScopeService({
  config,
  serviceVersion = "0.1.0",
  now = () => Date.now(),
  openDatabase = openMarketScopeDatabase,
  persistenceFault = null,
  diagnosticTracker = createDiagnosticTracker({ productVersion: serviceVersion, now })
}) {
  if (!config || !Array.isArray(config.allowedOrigins) || config.allowedOrigins.length === 0) {
    throw new TypeError("Service config with at least one allowed Origin is required");
  }

  const allowedOrigins = new Set(config.allowedOrigins);
  let database;
  try {
    database = await openDatabase({
      dbPath: config.dbPath,
      productVersion: serviceVersion,
      now
    });
    recordDatabaseReady(diagnosticTracker);
  } catch (error) {
    throw recordDatabaseStartupFailure(diagnosticTracker, error);
  }

  const writer = createSerializedWriter(database.writerConnection);
  const producerPersistence = createProducerPersistence({
    writer,
    now,
    persistenceFault
  });
  const cycleAuthorityPersistence = createCycleAuthorityPersistence({
    writer,
    now,
    persistenceFault
  });
  const demoBuyCapturePersistence = createDemoBuyCapturePersistence({
    writer,
    now,
    persistenceFault
  });
  const savedQueryLibrary = createSavedQueryLibrary({
    writer,
    readConnection: database.viewerReadConnection,
    now,
    persistenceFault
  });
  const viewerReads = createViewerReads({
    connection: database.viewerReadConnection,
    now,
    staleAfterMs: config.producerStaleAfterMs,
    historyPageSize: config.historyPageSize
  });

  let scannerAuthority;
  try {
    scannerAuthority = await createScannerAuthority({
      connection: database.scannerConnection,
      now
    });
  } catch (error) {
    await database.close();
    throw recordServiceStartupFailure(diagnosticTracker, error, {
      code: ERROR_CODES.DB_ERROR,
      name: "ServiceInitializationError",
      message: "Service authority initialization failed."
    });
  }

  const httpServer = createServer((_request, response) => {
    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end("Not Found");
  });

  const webSocketServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: config.maxInboundMessageBytes
  });

  let activeProducer = null;
  let closed = false;
  const connectionTasks = new Set();

  function knownErrorCode(error, fallback = ERROR_CODES.DB_ERROR) {
    const candidate = error?.code;
    return Object.values(ERROR_CODES).includes(candidate) ? candidate : fallback;
  }

  function recordBoundarySuccess({
    component,
    operation,
    operationId,
    checkpoint,
    context
  }) {
    return diagnosticTracker.recordSuccess({
      component,
      operation,
      operationId,
      checkpoint,
      context
    });
  }

  function recordBoundaryFailure({
    component,
    operation,
    operationId,
    checkpoint,
    lastSuccessfulCheckpoint = null,
    error,
    fallbackCode = ERROR_CODES.DB_ERROR,
    name = "OperationError",
    message = "Operation failed safely.",
    context
  }) {
    return diagnosticTracker.recordError({
      component,
      operation,
      operationId,
      checkpoint,
      lastSuccessfulCheckpoint,
      error: {
        code: knownErrorCode(error, fallbackCode),
        name,
        message,
        retryable: false
      },
      context
    });
  }

  function viewerDiagnosticSpec(type) {
    if (type === "viewer.current.get" || type === "viewer.status.get") {
      return {
        component: "viewer",
        checkpoint: "viewer.current.read",
        message: "Trusted Current/status read failed."
      };
    }
    if (type === "viewer.security.get" || type === "viewer.history.page") {
      return {
        component: "viewer",
        checkpoint: "viewer.detail.read",
        message: "Trusted Detail/history read failed."
      };
    }
    if (type === "scanner.execute") {
      return {
        component: "scanner",
        checkpoint: "scanner.execute",
        message: "Scanner execution failed."
      };
    }
    if (type.startsWith("scanner.queries.")) {
      return {
        component: "scanner",
        checkpoint: "scanner.query_library",
        message: "Saved-query library operation failed."
      };
    }
    if (type === "demo.buy.capture") {
      return {
        component: "demo_buy",
        checkpoint: "demo_buy.capture",
        message: "Demo Buy capture failed safely."
      };
    }
    return null;
  }

  function producerDiagnosticSpec(type) {
    if (type === "producer.session.start") {
      return {
        component: "producer",
        checkpoint: "producer.session.started",
        lastSuccessfulCheckpoint: null,
        message: "Producer session establishment failed."
      };
    }
    if (type === "producer.universe.replace") {
      return {
        component: "producer",
        checkpoint: "producer.universe.accepted",
        lastSuccessfulCheckpoint: "producer.session.started",
        message: "Universe acceptance failed."
      };
    }
    if (type === "producer.cycle.commit") {
      return {
        component: "persistence",
        checkpoint: "producer.cycle.committed",
        lastSuccessfulCheckpoint: "producer.universe.accepted",
        message: "Cycle persistence failed."
      };
    }
    return null;
  }

  async function createNodeSupportSnapshot() {
    const status = await viewerReads.status();
    return {
      schemaVersion: 1,
      generatedAtMs: now(),
      service: {
        productVersion: serviceVersion,
        ready: database.ready === true,
        schemaVersion: database.schemaVersion,
        health: status.recorderHealth,
        producerState: activeProducer?.readyState === WebSocket.OPEN ? "connected" : "none"
      },
      authority: {
        lastCommittedCycleId: status.lastCompletedCycleId,
        lastCommittedAtMs: status.lastCompletedAtMs,
        completedCycles: status.completedCycles,
        failedCycles: status.failedCycles,
        latestCount: status.latestCount,
        historyCount: status.historyCount
      },
      diagnostics: diagnosticTracker.snapshot()
    };
  }

  function trackConnectionTask(task) {
    connectionTasks.add(task);
    task.then(
      () => connectionTasks.delete(task),
      () => connectionTasks.delete(task)
    );
    return task;
  }

  webSocketServer.on("connection", (socket) => {
    let role = null;
    let helloComplete = false;
    let producerInstanceId = null;
    let sessionId = null;
    let acknowledgedUniverseRevision = null;
    let sessionStartedEver = false;
    let heartbeatDeadline = null;
    let messageTail = Promise.resolve();

    function releaseProducerOwnership() {
      if (activeProducer === socket) {
        activeProducer = null;
      }
    }

    function clearHeartbeatDeadline() {
      if (heartbeatDeadline === null) return;
      clearTimeout(heartbeatDeadline);
      heartbeatDeadline = null;
    }

    async function interruptRunningSession(reason) {
      const interruptedSessionId = sessionId;
      if (!interruptedSessionId) return;

      sessionId = null;
      acknowledgedUniverseRevision = null;
      clearHeartbeatDeadline();
      releaseProducerOwnership();

      await producerPersistence.interruptSession({
        sessionId: interruptedSessionId,
        reason
      });
    }

    function queueConnectionTask(work) {
      const task = messageTail
        .then(work)
        .catch(() => {
          releaseProducerOwnership();
        });
      messageTail = task;
      trackConnectionTask(task);
      return task;
    }

    function armHeartbeatDeadline() {
      clearHeartbeatDeadline();
      if (!sessionId) return;

      heartbeatDeadline = setTimeout(() => {
        heartbeatDeadline = null;
        queueConnectionTask(async () => {
          if (!sessionId) return;
          await interruptRunningSession("heartbeat_stale");
          if (socket.readyState === WebSocket.OPEN) {
            socket.close(1008, "Producer heartbeat stale");
          }
        });
      }, config.producerStaleAfterMs);
    }

    socket.on("error", () => {
      // Protocol/size failures are reflected through the socket close/error boundary.
    });

    socket.on("close", () => {
      clearHeartbeatDeadline();
      releaseProducerOwnership();

      if (sessionId) {
        const reason = closed ? "service_shutdown" : "connection_lost";
        queueConnectionTask(async () => {
          await interruptRunningSession(reason);
        });
      }
    });

    async function handleMessage(data, isBinary) {
      let parsed = null;

      if (isBinary) {
        sendJson(socket, invalidMessageResponse(null));
        return;
      }

      try {
        parsed = JSON.parse(data.toString());
      } catch {
        sendJson(socket, invalidMessageResponse(null));
        return;
      }

      try {
        validateRequest(parsed, { role, helloComplete });
      } catch (error) {
        const response = error instanceof ProtocolValidationError
          ? errorResponseFrom(error, safeRequestContext(parsed))
          : invalidMessageResponse(parsed);
        sendJson(socket, response);
        return;
      }

      if (!helloComplete) {
        const requestedRole = parsed.payload.role;

        if (requestedRole === "producer" && activeProducer && activeProducer.readyState === WebSocket.OPEN) {
          recordBoundaryFailure({
            component: "producer",
            operation: "producer.session.establish",
            operationId: parsed.requestId,
            checkpoint: "producer.session.started",
            error: new ProtocolValidationError(ERROR_CODES.PRODUCER_ALREADY_ACTIVE),
            fallbackCode: ERROR_CODES.PRODUCER_ALREADY_ACTIVE,
            name: "ProducerAlreadyActiveError",
            message: "A producer is already active."
          });
          sendJson(socket, createErrorResponse({
            ...safeRequestContext(parsed),
            code: ERROR_CODES.PRODUCER_ALREADY_ACTIVE,
            retryable: false
          }), () => socket.close(1008, "Producer already active"));
          return;
        }

        role = requestedRole;
        helloComplete = true;

        if (role === "producer") {
          activeProducer = socket;
          producerInstanceId = parsed.payload.clientInstanceId;
        }

        sendJson(socket, createOkResponse({
          requestId: parsed.requestId,
          requestType: parsed.type,
          data: {
            protocolVersion: PROTOCOL_VERSION,
            serviceVersion,
            role,
            ready: database.ready === true
          }
        }));
        return;
      }

      if (role === "viewer") {
        const diagnosticSpec = viewerDiagnosticSpec(parsed.type);
        try {
          let result;
          let diagnosticContext;
          if (parsed.type === "viewer.current.get") {
            result = await viewerReads.current();
          } else if (parsed.type === "viewer.status.get") {
            result = await viewerReads.status();
          } else if (parsed.type === "viewer.security.get") {
            result = await viewerReads.security(parsed.payload.securityId);
          } else if (parsed.type === "viewer.history.page") {
            result = await viewerReads.historyPage(
              parsed.payload.securityId,
              parsed.payload.cursor
            );
          } else if (parsed.type === "viewer.support.snapshot") {
            result = await createNodeSupportSnapshot();
          } else if (parsed.type === "scanner.execute") {
            result = await scannerAuthority.execute(parsed.payload.sql);
          } else if (parsed.type === "scanner.queries.list") {
            result = await savedQueryLibrary.list();
          } else if (parsed.type === "scanner.queries.create") {
            result = await savedQueryLibrary.create(parsed.payload);
          } else if (parsed.type === "scanner.queries.update") {
            result = await savedQueryLibrary.update(parsed.payload);
          } else if (parsed.type === "scanner.queries.delete") {
            result = await savedQueryLibrary.delete(parsed.payload);
          } else if (parsed.type === "demo.buy.capture") {
            const captured = await demoBuyCapturePersistence.capture(parsed.payload);
            result = {
              captureId: captured.captureId,
              capturedAtMs: captured.capturedAtMs,
              capturedItemCount: captured.capturedItemCount
            };
            diagnosticContext = {
              captureId: captured.captureId,
              capturedItemCount: captured.capturedItemCount,
              timingAnomaly: captured.timingAnomaly
            };
          } else {
            throw operationError(ERROR_CODES.SERVICE_NOT_READY);
          }

          if (diagnosticSpec) {
            recordBoundarySuccess({
              ...diagnosticSpec,
              operation: parsed.type,
              operationId: parsed.requestId,
              context: diagnosticContext
            });
          }

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }));
        } catch (error) {
          if (diagnosticSpec) {
            recordBoundaryFailure({
              ...diagnosticSpec,
              operation: parsed.type,
              operationId: parsed.requestId,
              error,
              name: parsed.type.startsWith("scanner.queries.")
                ? "ScannerQueryLibraryError"
                : diagnosticSpec.component === "scanner"
                  ? "ScannerExecutionError"
                  : diagnosticSpec.component === "demo_buy"
                    ? "DemoBuyCaptureError"
                    : "ViewerReadError"
            });
          }
          sendJson(socket, errorResponseFrom(error, safeRequestContext(parsed)));
        }
        return;
      }

      try {
        if (parsed.type === "producer.session.start") {
          if (sessionStartedEver) {
            throw operationError(ERROR_CODES.SESSION_ALREADY_STARTED);
          }

          const started = await producerPersistence.startSession({
            producerInstanceId,
            startedAtMs: parsed.payload.startedAtMs,
            config: parsed.payload.config
          });

          sessionId = started.sessionId;
          sessionStartedEver = true;
          armHeartbeatDeadline();

          recordBoundarySuccess({
            component: "producer",
            operation: parsed.type,
            operationId: parsed.requestId,
            checkpoint: "producer.session.started"
          });

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: {
              sessionId
            }
          }));
          return;
        }

        if (!sessionId) {
          throw operationError(ERROR_CODES.SESSION_NOT_STARTED);
        }

        if (parsed.type === "producer.universe.replace") {
          const result = await producerPersistence.replaceUniverse({
            sessionId,
            universe: parsed.payload
          });

          acknowledgedUniverseRevision = result.universeRevision;

          recordBoundarySuccess({
            component: "producer",
            operation: parsed.type,
            operationId: parsed.requestId,
            checkpoint: "producer.universe.accepted",
            context: { universeRevision: result.universeRevision }
          });

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }));
          return;
        }

        if (parsed.type === "producer.cycle.commit") {
          if (
            acknowledgedUniverseRevision === null ||
            parsed.payload.universeRevision !== acknowledgedUniverseRevision
          ) {
            throw operationError(ERROR_CODES.UNIVERSE_REVISION_MISMATCH);
          }

          const result = await cycleAuthorityPersistence.commitCycle({
            sessionId,
            universeRevision: parsed.payload.universeRevision,
            cycle: parsed.payload.cycle
          });

          recordBoundarySuccess({
            component: "persistence",
            operation: parsed.type,
            operationId: parsed.requestId,
            checkpoint: "producer.cycle.committed",
            context: {
              universeRevision: parsed.payload.universeRevision,
              cycleId: result.cycleId
            }
          });

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }));
          return;
        }

        if (parsed.type === "producer.cycle.failed") {
          const result = await cycleAuthorityPersistence.persistFailedCycle({
            sessionId,
            report: parsed.payload.report
          });

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }));
          return;
        }

        if (parsed.type === "producer.heartbeat") {
          const result = await producerPersistence.heartbeat({
            sessionId
          });
          armHeartbeatDeadline();

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }));
          return;
        }

        if (parsed.type === "producer.session.stop") {
          const stoppedSessionId = sessionId;
          const result = await producerPersistence.stopSession({
            sessionId: stoppedSessionId,
            stoppedAtMs: parsed.payload.stoppedAtMs,
            reason: parsed.payload.reason
          });

          sessionId = null;
          acknowledgedUniverseRevision = null;
          clearHeartbeatDeadline();

          sendJson(socket, createOkResponse({
            requestId: parsed.requestId,
            requestType: parsed.type,
            data: result
          }), () => {
            releaseProducerOwnership();
          });
          return;
        }

        sendJson(socket, createErrorResponse({
          ...safeRequestContext(parsed),
          code: ERROR_CODES.SERVICE_NOT_READY,
          retryable: false
        }));
      } catch (error) {
        const diagnosticSpec = producerDiagnosticSpec(parsed.type);
        if (diagnosticSpec) {
          recordBoundaryFailure({
            ...diagnosticSpec,
            operation: parsed.type,
            operationId: parsed.requestId,
            error,
            name: diagnosticSpec.component === "persistence"
              ? "PersistenceError"
              : "ProducerError"
          });
        }
        sendJson(socket, errorResponseFrom(error, safeRequestContext(parsed)));
      }
    }

    socket.on("message", (data, isBinary) => {
      const task = messageTail
        .then(() => handleMessage(data, isBinary))
        .catch(() => {
          sendJson(socket, createErrorResponse({
            requestId: "unknown",
            requestType: "unknown",
            code: ERROR_CODES.DB_ERROR,
            retryable: false
          }));
        });
      messageTail = task;
      trackConnectionTask(task);
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !allowedOrigins.has(origin)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(config.port, config.host);
    });
  } catch (error) {
    webSocketServer.close();
    await writer.drain();
    await database.close();
    throw recordServiceStartupFailure(diagnosticTracker, error, {
      code: DIAGNOSTIC_CODES.SERVICE_LISTEN_ERROR,
      name: "ServiceListenError",
      message: "Loopback service listener could not start."
    });
  }

  recordServiceReady(diagnosticTracker);

  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : config.port;

  return {
    host: config.host,
    port,
    database,
    webSocketServer,
    persistenceFault,
    diagnostics: diagnosticTracker,
    async close() {
      if (closed) return;
      closed = true;

      const httpClosed = new Promise((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });

      const sockets = [...webSocketServer.clients];
      await Promise.all(sockets.map((socket) => closeWebSocket(socket)));
      await Promise.allSettled([...connectionTasks]);

      await new Promise((resolve) => {
        webSocketServer.close(() => resolve());
      });

      await httpClosed;
      await writer.drain();
      await database.close();
    }
  };
}
