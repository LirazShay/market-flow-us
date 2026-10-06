import { createServer } from "node:http";

import { FakeIbkrAdapter } from "./fake-adapter.js";
import {
  OrderIntentValidationError,
  fingerprintOrderIntent,
  normalizeInstrument,
  normalizeOrderIntent
} from "./intent.js";
import { prepareOrderPreview } from "./live-gates.js";
import { createLiveOrderAuthority } from "./live-order-authority.js";
import { createDryRunOrderAuthority } from "./order-authority.js";
import {
  LocalSecurityError,
  assertAuthorizedCaller,
  assertNoBrowserOrigin,
  generateCallerToken
} from "./security.js";
import {
  DEFAULT_ORDER_STORE_PATH,
  openOrderExecutionStore
} from "./store.js";

export const ORDER_SERVICE_HOST = "127.0.0.1";
export const ORDER_SERVICE_PORT = 8770;
export const ORDER_SERVICE_MAX_BODY_BYTES = 64 * 1024;

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function securityFailure(code, statusCode) {
  const error = new LocalSecurityError(code, statusCode);
  throw error;
}

function routeFailure(code, statusCode = 409) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function assertJsonContentType(contentType) {
  if (typeof contentType !== "string" || contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    securityFailure("UNSUPPORTED_CONTENT_TYPE", 415);
  }
}

function declaredBodyTooLarge(contentLength) {
  if (contentLength === undefined) {
    return false;
  }
  const parsed = Number(contentLength);
  return Number.isFinite(parsed) && parsed > ORDER_SERVICE_MAX_BODY_BYTES;
}

async function readBoundedJson(request) {
  if (declaredBodyTooLarge(request.headers["content-length"])) {
    request.resume();
    securityFailure("REQUEST_TOO_LARGE", 413);
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > ORDER_SERVICE_MAX_BODY_BYTES) {
      request.resume();
      securityFailure("REQUEST_TOO_LARGE", 413);
    }
    chunks.push(chunk);
  }

  if (totalBytes === 0) {
    const error = new Error("request body must contain JSON");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    throw error;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("request body must be valid JSON");
    error.code = "INVALID_JSON";
    error.statusCode = 400;
    throw error;
  }
}

function assertExactBodyKeys(body, keys, code = "INVALID_REQUEST_BODY") {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    routeFailure(code, 400);
  }
  const actual = Object.keys(body).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    routeFailure(code, 400);
  }
}

function sanitizedError(error) {
  if (error instanceof LocalSecurityError) {
    return {
      statusCode: error.statusCode,
      payload: { code: error.code }
    };
  }
  if (error instanceof OrderIntentValidationError) {
    return {
      statusCode: 400,
      payload: { code: error.code, message: error.message }
    };
  }
  if (error && Number.isInteger(error.statusCode) && typeof error.code === "string") {
    return {
      statusCode: error.statusCode,
      payload: { code: error.code }
    };
  }
  return {
    statusCode: 500,
    payload: { code: "ORDER_SERVICE_ERROR" }
  };
}

function supportsProviderPreview(adapter) {
  return [
    "getSessionStatus",
    "getTradableAccounts",
    "checkTradingPermission",
    "resolveInstrument",
    "getSnapshot",
    "previewOrder"
  ].every((method) => typeof adapter?.[method] === "function");
}

function supportsLiveLifecycle(adapter) {
  return supportsProviderPreview(adapter)
    && [
      "getLongPosition",
      "submitOrder",
      "confirmReply",
      "getOrders",
      "getTrades",
      "cancelOrder"
    ].every((method) => typeof adapter?.[method] === "function");
}

function requireAdapterMethod(adapter, method, code) {
  if (typeof adapter?.[method] !== "function") {
    routeFailure(code, 501);
  }
  return adapter[method].bind(adapter);
}

async function handlePreview(body, adapter) {
  const intent = normalizeOrderIntent(body);
  const preview = supportsProviderPreview(adapter)
    ? (await prepareOrderPreview({ intent, adapter })).preview
    : await adapter.previewOrder(intent);
  return {
    requestId: intent.requestId,
    intentFingerprint: fingerprintOrderIntent(intent),
    preview
  };
}

async function handleCreateOrder(body, dryRunAuthority, liveOrderAuthority) {
  const intent = normalizeOrderIntent(body);
  if (intent.executionMode === "DRY_RUN") {
    return dryRunAuthority.create(intent);
  }
  if (!liveOrderAuthority) {
    routeFailure("LIVE_EXECUTION_NOT_ENABLED");
  }
  return liveOrderAuthority.create(intent);
}

async function getLocalOrder(localOrderId, { store, liveOrderAuthority }) {
  if (!store || typeof store.getByLocalOrderId !== "function") {
    routeFailure("ORDER_LOOKUP_UNAVAILABLE", 501);
  }
  const execution = await store.getByLocalOrderId(localOrderId);
  if (!execution) {
    routeFailure("ORDER_NOT_FOUND", 404);
  }
  const provider = typeof store.getProviderState === "function"
    ? await store.getProviderState(localOrderId)
    : null;
  if (provider) {
    if (!liveOrderAuthority) {
      routeFailure("LIVE_EXECUTION_NOT_ENABLED");
    }
    return liveOrderAuthority.get(localOrderId);
  }
  return Object.freeze({
    requestId: execution.requestId,
    intentFingerprint: execution.intentFingerprint,
    localOrderId: execution.localOrderId,
    lifecycleState: execution.lifecycleState,
    executionMode: "DRY_RUN",
    replayed: true
  });
}

function matchOrderAction(pathname) {
  const match = pathname.match(/^\/orders\/([^/]+)\/(confirm|cancel)$/u);
  if (!match) return null;
  return { localOrderId: decodeURIComponent(match[1]), action: match[2] };
}

function matchOrderRead(pathname) {
  const match = pathname.match(/^\/orders\/([^/]+)$/u);
  return match ? decodeURIComponent(match[1]) : null;
}

export function createOrderRequestHandler({
  callerToken,
  adapter,
  dryRunAuthority,
  orderAuthority,
  liveOrderAuthority = null,
  store = null
}) {
  const effectiveDryRunAuthority = dryRunAuthority ?? orderAuthority;
  if (typeof callerToken !== "string" || callerToken.length === 0) {
    throw new TypeError("callerToken is required");
  }
  if (!adapter || typeof adapter.previewOrder !== "function") {
    throw new TypeError("adapter with previewOrder() is required");
  }
  if (!effectiveDryRunAuthority || typeof effectiveDryRunAuthority.create !== "function") {
    throw new TypeError("dryRunAuthority with create() is required");
  }

  return async function orderRequestHandler(request, response) {
    try {
      const url = new URL(request.url ?? "/", `http://${ORDER_SERVICE_HOST}`);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/health") {
        assertNoBrowserOrigin(request.headers.origin);
        writeJson(response, 200, {
          service: "ibkr-order-service",
          status: "ok"
        });
        return;
      }

      assertAuthorizedCaller(request.headers.authorization, callerToken);
      assertNoBrowserOrigin(request.headers.origin);

      if (request.method === "GET" && pathname === "/session") {
        const getSessionStatus = requireAdapterMethod(
          adapter,
          "getSessionStatus",
          "PROVIDER_SESSION_UNAVAILABLE"
        );
        writeJson(response, 200, await getSessionStatus());
        return;
      }

      if (request.method === "GET" && pathname === "/orders") {
        const getOrders = requireAdapterMethod(adapter, "getOrders", "PROVIDER_ORDERS_UNAVAILABLE");
        writeJson(response, 200, { orders: await getOrders() });
        return;
      }

      if (request.method === "GET" && pathname === "/trades") {
        const getTrades = requireAdapterMethod(adapter, "getTrades", "PROVIDER_TRADES_UNAVAILABLE");
        writeJson(response, 200, { trades: await getTrades() });
        return;
      }

      if (request.method === "GET") {
        const localOrderId = matchOrderRead(pathname);
        if (localOrderId !== null) {
          writeJson(response, 200, await getLocalOrder(localOrderId, {
            store,
            liveOrderAuthority
          }));
          return;
        }
      }

      if (request.method === "POST") {
        assertJsonContentType(request.headers["content-type"]);
        const body = await readBoundedJson(request);

        if (pathname === "/session/init") {
          assertExactBodyKeys(body, []);
          const initializeSession = requireAdapterMethod(
            adapter,
            "initializeSession",
            "PROVIDER_SESSION_INIT_UNAVAILABLE"
          );
          writeJson(response, 200, await initializeSession());
          return;
        }

        if (pathname === "/instruments/resolve") {
          const instrument = normalizeInstrument(body);
          const resolveInstrument = requireAdapterMethod(
            adapter,
            "resolveInstrument",
            "PROVIDER_INSTRUMENT_RESOLUTION_UNAVAILABLE"
          );
          writeJson(response, 200, await resolveInstrument(instrument));
          return;
        }

        if (pathname === "/orders/preview") {
          writeJson(response, 200, await handlePreview(body, adapter));
          return;
        }

        if (pathname === "/orders") {
          writeJson(response, 200, await handleCreateOrder(
            body,
            effectiveDryRunAuthority,
            liveOrderAuthority
          ));
          return;
        }

        const action = matchOrderAction(pathname);
        if (action) {
          if (!liveOrderAuthority) {
            routeFailure("LIVE_EXECUTION_NOT_ENABLED");
          }
          if (action.action === "confirm") {
            assertExactBodyKeys(body, ["confirmed"]);
            writeJson(response, 200, await liveOrderAuthority.confirm(
              action.localOrderId,
              { confirmed: body.confirmed }
            ));
            return;
          }
          assertExactBodyKeys(body, []);
          writeJson(response, 200, await liveOrderAuthority.cancel(action.localOrderId));
          return;
        }

        writeJson(response, 404, { code: "NOT_FOUND" });
        return;
      }

      writeJson(response, 404, { code: "NOT_FOUND" });
    } catch (error) {
      const failure = sanitizedError(error);
      writeJson(response, failure.statusCode, failure.payload);
    }
  };
}

export function createOrderServiceRuntime({
  adapter = new FakeIbkrAdapter(),
  store,
  processLiveEnabled = false
} = {}) {
  const callerToken = generateCallerToken();
  const dryRunAdapter = supportsProviderPreview(adapter)
    ? Object.freeze({
        async previewOrder(intent) {
          return (await prepareOrderPreview({ intent, adapter })).preview;
        }
      })
    : adapter;
  const dryRunAuthority = createDryRunOrderAuthority({
    adapter: dryRunAdapter,
    store
  });
  const liveOrderAuthority = store && supportsLiveLifecycle(adapter)
    ? createLiveOrderAuthority({
        adapter,
        store,
        processLiveEnabled
      })
    : null;
  const handler = createOrderRequestHandler({
    callerToken,
    adapter,
    dryRunAuthority,
    liveOrderAuthority,
    store
  });
  return Object.freeze({
    callerToken,
    handler,
    liveCapable: liveOrderAuthority !== null,
    liveEnabled: liveOrderAuthority !== null && processLiveEnabled === true
  });
}

export async function startOrderService({
  adapter = new FakeIbkrAdapter(),
  dbPath = DEFAULT_ORDER_STORE_PATH,
  processLiveEnabled = false
} = {}) {
  const store = await openOrderExecutionStore({ dbPath });
  const runtime = createOrderServiceRuntime({
    adapter,
    store,
    processLiveEnabled
  });
  const server = createServer(runtime.handler);

  try {
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen({
        host: ORDER_SERVICE_HOST,
        port: ORDER_SERVICE_PORT,
        exclusive: true
      });
    });
  } catch (error) {
    await store.close();
    throw error;
  }

  let closed = false;
  return Object.freeze({
    server,
    callerToken: runtime.callerToken,
    liveCapable: runtime.liveCapable,
    liveEnabled: runtime.liveEnabled,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await store.close();
    }
  });
}
