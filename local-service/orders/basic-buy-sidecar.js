import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SIDECAR_ENTRY = path.join(REPO_ROOT, "ibkr-order-service", "index.js");
const EXPECTED_BASE_URL = "http://127.0.0.1:8770";
const READY_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 5_000;
const ORDER_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REMOTE_CODE_LENGTH = 128;

export class BasicBuySidecarError extends Error {
  constructor(code, { orderServiceCode = null, httpStatus = null } = {}) {
    super(code);
    this.name = "BasicBuySidecarError";
    this.code = code;
    this.orderServiceCode = orderServiceCode;
    this.httpStatus = httpStatus;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function boundedLocalOrderId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new BasicBuySidecarError("BASIC_BUY_LOCAL_ORDER_ID_INVALID");
  }
  return value;
}

function stableIntentBody(intent) {
  if (
    !intent
    || typeof intent !== "object"
    || Array.isArray(intent)
    || typeof intent.requestId !== "string"
    || intent.requestId.length === 0
    || intent.requestId.length > 256
  ) {
    throw new BasicBuySidecarError("BASIC_BUY_INTENT_INVALID");
  }
  try {
    return JSON.stringify(intent);
  } catch {
    throw new BasicBuySidecarError("BASIC_BUY_INTENT_INVALID");
  }
}

async function waitForReady(child, expectedMode, timeoutMs) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new BasicBuySidecarError("BASIC_BUY_SIDECAR_READY_TIMEOUT"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      child.removeListener("message", onMessage);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
    }

    function succeed(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function onError() {
      fail(new BasicBuySidecarError("BASIC_BUY_SIDECAR_SPAWN_FAILED"));
    }

    function onExit() {
      fail(new BasicBuySidecarError("BASIC_BUY_SIDECAR_START_FAILED"));
    }

    function onMessage(message) {
      if (message?.type !== "ibkr-order-service.ready") return;
      if (
        message.baseUrl !== EXPECTED_BASE_URL
        || message.mode !== expectedMode
        || !validCallerToken(message.callerToken)
      ) {
        fail(new BasicBuySidecarError("BASIC_BUY_SIDECAR_READY_INVALID"));
        return;
      }
      succeed(Object.freeze({ callerToken: message.callerToken }));
    }

    child.on("message", onMessage);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function stopOwnedChild(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const exited = once(child, "exit").then(() => true);
  child.kill("SIGTERM");
  if (await Promise.race([exited, delay(timeoutMs).then(() => false)])) return;

  child.kill("SIGKILL");
  if (await Promise.race([exited, delay(timeoutMs).then(() => false)])) return;
  throw new BasicBuySidecarError("BASIC_BUY_SIDECAR_STOP_TIMEOUT");
}

export async function startBasicBuySidecar({
  buyConfig,
  spawnProcess = spawn,
  fetchImpl = globalThis.fetch,
  sidecarEntry = DEFAULT_SIDECAR_ENTRY,
  readyTimeoutMs = READY_TIMEOUT_MS,
  stopTimeoutMs = STOP_TIMEOUT_MS,
  orderRequestTimeoutMs = ORDER_REQUEST_TIMEOUT_MS
} = {}) {
  if (!buyConfig || buyConfig.enabled !== true) {
    throw new TypeError("enabled BUY config is required");
  }
  if (buyConfig.mode !== "DRY_RUN" && buyConfig.mode !== "LIVE") {
    throw new TypeError("BUY mode must be DRY_RUN or LIVE");
  }
  if (typeof spawnProcess !== "function") throw new TypeError("spawnProcess must be a function");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs <= 0) {
    throw new TypeError("readyTimeoutMs must be a positive integer");
  }
  if (!Number.isSafeInteger(stopTimeoutMs) || stopTimeoutMs <= 0) {
    throw new TypeError("stopTimeoutMs must be a positive integer");
  }
  if (!Number.isSafeInteger(orderRequestTimeoutMs) || orderRequestTimeoutMs <= 0) {
    throw new TypeError("orderRequestTimeoutMs must be a positive integer");
  }

  const args = [sidecarEntry];
  if (buyConfig.mode === "LIVE") args.push("--live");

  let state = "starting";
  let callerToken = null;
  const child = spawnProcess(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    windowsHide: true
  });

  child.once("exit", () => {
    callerToken = null;
    if (state !== "stopped" && state !== "stopping") state = "unavailable";
  });

  try {
    const ready = await waitForReady(child, buyConfig.mode, readyTimeoutMs);
    callerToken = ready.callerToken;
    state = "ready";
  } catch (error) {
    state = "unavailable";
    callerToken = null;
    try {
      await stopOwnedChild(child, stopTimeoutMs);
    } catch {
      // Preserve the startup failure; only this Market Flow US-owned child is touched.
    }
    throw error;
  }

  function isReady() {
    return state === "ready"
      && callerToken !== null
      && child.exitCode === null
      && child.signalCode === null;
  }

  function assertReady() {
    if (!isReady()) {
      throw new BasicBuySidecarError("BASIC_BUY_SIDECAR_NOT_READY");
    }
  }

  async function requestOnce(pathname, { method, bodyJson }) {
    assertReady();
    const token = callerToken;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), orderRequestTimeoutMs);
    let response;
    try {
      response = await fetchImpl(`${EXPECTED_BASE_URL}${pathname}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(bodyJson === undefined ? {} : { "Content-Type": "application/json" })
        },
        ...(bodyJson === undefined ? {} : { body: bodyJson }),
        redirect: "error",
        signal: controller.signal
      });
    } catch {
      throw new BasicBuySidecarError("BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN");
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
      throw new BasicBuySidecarError("BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN");
    }

    if (!response.ok) {
      throw new BasicBuySidecarError("BASIC_BUY_ORDER_SERVICE_REJECTED", {
        orderServiceCode: boundedRemoteCode(payload?.code),
        httpStatus: Number.isInteger(response.status) ? response.status : null
      });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BasicBuySidecarError("BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN");
    }
    return payload;
  }

  async function createOrder(intent) {
    const bodyJson = stableIntentBody(intent);
    try {
      return await requestOnce("/orders", { method: "POST", bodyJson });
    } catch (error) {
      if (!(error instanceof BasicBuySidecarError)
        || error.code !== "BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN") {
        throw error;
      }
    }

    // One bounded retry is safe because it reuses the exact requestId + normalized intent.
    // The order service owns idempotency/reconciliation and never blind-resubmits by key.
    try {
      return await requestOnce("/orders", { method: "POST", bodyJson });
    } catch (error) {
      if (error instanceof BasicBuySidecarError
        && error.code === "BASIC_BUY_ORDER_SERVICE_RESPONSE_UNKNOWN") {
        throw new BasicBuySidecarError("ACKNOWLEDGEMENT_UNKNOWN");
      }
      throw error;
    }
  }

  async function confirmReply(localOrderId) {
    const id = encodeURIComponent(boundedLocalOrderId(localOrderId));
    return await requestOnce(`/orders/${id}/confirm`, {
      method: "POST",
      bodyJson: JSON.stringify({ confirmed: true })
    });
  }

  async function getOrder(localOrderId) {
    const id = encodeURIComponent(boundedLocalOrderId(localOrderId));
    return await requestOnce(`/orders/${id}`, { method: "GET" });
  }

  return Object.freeze({
    isReady,
    getState() {
      return Object.freeze({ state, mode: buyConfig.mode });
    },
    createOrder,
    confirmReply,
    getOrder,
    async close() {
      if (state === "stopped") return;
      state = "stopping";
      callerToken = null;
      try {
        await stopOwnedChild(child, stopTimeoutMs);
        state = "stopped";
      } catch (error) {
        state = "unavailable";
        throw error;
      }
    }
  });
}
