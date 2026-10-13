const DEFAULT_BASE_URL = "http://127.0.0.1:8770";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REMOTE_CODE_LENGTH = 128;

const DEFAULT_CODES = Object.freeze({
  invalidIntent: "ORDER_SERVICE_INTENT_INVALID",
  invalidLocalOrderId: "ORDER_SERVICE_LOCAL_ORDER_ID_INVALID",
  responseUnknown: "ORDER_SERVICE_RESPONSE_UNKNOWN",
  rejected: "ORDER_SERVICE_REJECTED",
  acknowledgementUnknown: "ACKNOWLEDGEMENT_UNKNOWN"
});

export class OrderServiceClientError extends Error {
  constructor(code, { orderServiceCode = null, httpStatus = null } = {}) {
    super(code);
    this.name = "OrderServiceClientError";
    this.code = code;
    this.orderServiceCode = orderServiceCode;
    this.httpStatus = httpStatus;
  }
}

function validCallerToken(value) {
  return typeof value === "string" && value.length >= 32 && value.length <= 256;
}

function boundedRemoteCode(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_REMOTE_CODE_LENGTH
    && /^[A-Z0-9_]+$/u.test(value)
    ? value
    : null;
}

function normalizeBaseUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError("order-service baseUrl must be a bounded loopback URL");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("order-service baseUrl must be a bounded loopback URL");
  }
  if (
    parsed.protocol !== "http:"
    || parsed.hostname !== "127.0.0.1"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new TypeError("order-service baseUrl must use HTTP loopback without credentials/path/query/fragment");
  }
  const port = Number(parsed.port || 80);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new TypeError("order-service baseUrl port is invalid");
  }
  return `http://127.0.0.1:${port}`;
}

function normalizeCodes(input) {
  if (input === undefined) return DEFAULT_CODES;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("order-service client codes must be an object");
  }
  const expected = Object.keys(DEFAULT_CODES);
  if (Object.keys(input).length !== expected.length) {
    throw new TypeError("order-service client codes must define the exact supported keys");
  }
  const result = {};
  for (const key of expected) {
    if (typeof input[key] !== "string" || input[key].length === 0 || input[key].length > 128) {
      throw new TypeError(`order-service client code ${key} is invalid`);
    }
    result[key] = input[key];
  }
  return Object.freeze(result);
}

function boundedLocalOrderId(value, fail) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw fail("invalidLocalOrderId");
  }
  return value;
}

function stableIntentBody(intent, fail) {
  if (
    !intent
    || typeof intent !== "object"
    || Array.isArray(intent)
    || typeof intent.requestId !== "string"
    || intent.requestId.length === 0
    || intent.requestId.length > 256
  ) {
    throw fail("invalidIntent");
  }
  try {
    return JSON.stringify(intent);
  } catch {
    throw fail("invalidIntent");
  }
}

export function createOrderServiceClient({
  baseUrl = DEFAULT_BASE_URL,
  callerToken,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  codes,
  errorFactory = (code, details) => new OrderServiceClientError(code, details),
  assertAvailable = null
} = {}) {
  const effectiveBaseUrl = normalizeBaseUrl(baseUrl);
  const effectiveCodes = normalizeCodes(codes);
  if (!validCallerToken(callerToken)) {
    throw new TypeError("order-service callerToken must be an opaque bounded token");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new TypeError("requestTimeoutMs must be a positive integer");
  }
  if (typeof errorFactory !== "function") throw new TypeError("errorFactory must be a function");
  if (assertAvailable !== null && typeof assertAvailable !== "function") {
    throw new TypeError("assertAvailable must be a function when supplied");
  }

  function fail(key, details) {
    return errorFactory(effectiveCodes[key], details);
  }

  async function requestOnce(pathname, { method, bodyJson }) {
    assertAvailable?.();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    try {
      response = await fetchImpl(`${effectiveBaseUrl}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${callerToken}`,
          ...(bodyJson === undefined ? {} : { "Content-Type": "application/json" })
        },
        ...(bodyJson === undefined ? {} : { body: bodyJson }),
        redirect: "error",
        signal: controller.signal
      });
    } catch {
      throw fail("responseUnknown");
    } finally {
      clearTimeout(timeout);
    }

    let payload;
    try {
      const contentType = response?.headers?.get?.("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        throw new Error("unexpected content type");
      }
      payload = await response.json();
    } catch {
      throw fail("responseUnknown");
    }

    if (!response.ok) {
      throw fail("rejected", {
        orderServiceCode: boundedRemoteCode(payload?.code),
        httpStatus: Number.isInteger(response.status) ? response.status : null
      });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw fail("responseUnknown");
    }
    return payload;
  }

  async function createOrder(intent) {
    const bodyJson = stableIntentBody(intent, fail);
    try {
      return await requestOnce("/orders", { method: "POST", bodyJson });
    } catch (error) {
      if (error?.code !== effectiveCodes.responseUnknown) throw error;
    }

    // One bounded retry reuses the exact requestId + exact serialized intent.
    // The existing order service remains the idempotency/reconciliation authority.
    try {
      return await requestOnce("/orders", { method: "POST", bodyJson });
    } catch (error) {
      if (error?.code === effectiveCodes.responseUnknown) {
        throw fail("acknowledgementUnknown");
      }
      throw error;
    }
  }

  async function confirmReply(localOrderId) {
    const id = encodeURIComponent(boundedLocalOrderId(localOrderId, fail));
    return await requestOnce(`/orders/${id}/confirm`, {
      method: "POST",
      bodyJson: JSON.stringify({ confirmed: true })
    });
  }

  async function getOrder(localOrderId) {
    const id = encodeURIComponent(boundedLocalOrderId(localOrderId, fail));
    return await requestOnce(`/orders/${id}`, { method: "GET" });
  }

  return Object.freeze({
    createOrder,
    confirmReply,
    getOrder
  });
}
