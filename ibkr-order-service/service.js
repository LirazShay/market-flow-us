import { createServer } from "node:http";

import { FakeIbkrAdapter } from "./fake-adapter.js";
import {
  OrderIntentValidationError,
  fingerprintOrderIntent,
  normalizeOrderIntent
} from "./intent.js";
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

const PROTECTED_READ_PATHS = new Set([
  "/session",
  "/orders",
  "/trades"
]);

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

function isProtectedReadPath(pathname) {
  return PROTECTED_READ_PATHS.has(pathname) || /^\/orders\/[^/]+$/u.test(pathname);
}

function isKnownProtectedMutation(pathname) {
  return pathname === "/session/init"
    || pathname === "/instruments/resolve"
    || pathname === "/orders/preview"
    || pathname === "/orders"
    || /^\/orders\/[^/]+\/(confirm|cancel)$/u.test(pathname);
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

async function handlePreview(body, adapter) {
  const intent = normalizeOrderIntent(body);
  const preview = await adapter.previewOrder(intent);
  return {
    requestId: intent.requestId,
    intentFingerprint: fingerprintOrderIntent(intent),
    preview
  };
}

async function handleDryRunOrder(body, orderAuthority) {
  const intent = normalizeOrderIntent(body);
  return orderAuthority.create(intent);
}

export function createOrderRequestHandler({ callerToken, adapter, orderAuthority }) {
  if (typeof callerToken !== "string" || callerToken.length === 0) {
    throw new TypeError("callerToken is required");
  }
  if (!adapter || typeof adapter.previewOrder !== "function") {
    throw new TypeError("adapter with previewOrder() is required");
  }
  if (!orderAuthority || typeof orderAuthority.create !== "function") {
    throw new TypeError("orderAuthority with create() is required");
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

      if (request.method === "POST") {
        assertJsonContentType(request.headers["content-type"]);
        const body = await readBoundedJson(request);

        if (pathname === "/orders/preview") {
          writeJson(response, 200, await handlePreview(body, adapter));
          return;
        }
        if (pathname === "/orders") {
          writeJson(response, 200, await handleDryRunOrder(body, orderAuthority));
          return;
        }
        if (isKnownProtectedMutation(pathname)) {
          writeJson(response, 501, { code: "NOT_IMPLEMENTED" });
          return;
        }
        writeJson(response, 404, { code: "NOT_FOUND" });
        return;
      }

      if (request.method === "GET" && isProtectedReadPath(pathname)) {
        writeJson(response, 501, { code: "NOT_IMPLEMENTED" });
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
  store
} = {}) {
  const callerToken = generateCallerToken();
  const orderAuthority = createDryRunOrderAuthority({ adapter, store });
  const handler = createOrderRequestHandler({ callerToken, adapter, orderAuthority });
  return Object.freeze({ callerToken, handler });
}

export async function startOrderService({
  adapter = new FakeIbkrAdapter(),
  dbPath = DEFAULT_ORDER_STORE_PATH
} = {}) {
  const store = await openOrderExecutionStore({ dbPath });
  const runtime = createOrderServiceRuntime({ adapter, store });
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
