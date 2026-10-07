import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

import {
  ReplayHostSecurityError,
  assertExactReplayOrigin,
  assertReplayControlToken,
  generateReplayControlToken
} from "./security.js";

const HOST = "127.0.0.1";
const MAX_CONTROL_BODY_BYTES = 4096;
const CHILD_READY_TIMEOUT_MS = 10_000;
const CHILD_STOP_TIMEOUT_MS = 5_000;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SERVICE_ENTRY = path.join(REPO_ROOT, "local-service", "server", "index.js");

export class ReplayHostError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "ReplayHostError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function settleBeforeTimeout(promise, timeoutMs, {
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimer(() => resolve(false), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimer(timer);
  }
}

function applyCors(response, origin, allowedOrigin) {
  response.setHeader("Vary", "Origin");
  if (origin !== allowedOrigin) return;
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Max-Age", "60");
}

function sendJson(response, statusCode, payload, origin, allowedOrigin) {
  applyCors(response, origin, allowedOrigin);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTROL_BODY_BYTES) {
    throw new ReplayHostError("REPLAY_CONTROL_BODY_TOO_LARGE", 413);
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_CONTROL_BODY_BYTES) {
      throw new ReplayHostError("REPLAY_CONTROL_BODY_TOO_LARGE", 413);
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not-object");
    }
    return value;
  } catch {
    throw new ReplayHostError("REPLAY_CONTROL_BODY_INVALID", 400);
  }
}

function normalizeReason(value) {
  if (value === undefined) return "replay-control";
  if (typeof value !== "string" || value.length === 0 || value.length > 80) {
    throw new ReplayHostError("REPLAY_CONTROL_REASON_INVALID", 400);
  }
  return value;
}

async function assertPortAvailable(port) {
  if (port === 0) return;
  const probe = net.createServer();
  probe.unref();

  try {
    await new Promise((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(port, HOST, resolve);
    });
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      throw new ReplayHostError("REPLAY_SERVICE_PORT_OCCUPIED", 409);
    }
    throw new ReplayHostError("REPLAY_SERVICE_PORT_UNAVAILABLE", 503);
  } finally {
    if (probe.listening) {
      await new Promise((resolve) => probe.close(() => resolve()));
    }
  }
}

async function waitForChildReady(child) {
  const lines = readline.createInterface({ input: child.stdout });
  child.stderr.resume();

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      fail(new ReplayHostError("REPLAY_SERVICE_READY_TIMEOUT", 503));
    }, CHILD_READY_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      lines.removeListener("line", onLine);
      lines.close();
      child.stdout.resume();
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
      fail(new ReplayHostError("REPLAY_SERVICE_SPAWN_FAILED", 503));
    }

    function onExit() {
      fail(new ReplayHostError("REPLAY_SERVICE_START_FAILED", 503));
    }

    function onLine(line) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event?.event !== "service.ready") return;
      if (event.host !== HOST || !Number.isInteger(event.port) || event.port <= 0 || event.port > 65535) {
        fail(new ReplayHostError("REPLAY_SERVICE_READY_INVALID", 503));
        return;
      }
      succeed(Object.freeze({ port: event.port, schemaVersion: event.schemaVersion ?? null }));
    }

    child.once("error", onError);
    child.once("exit", onExit);
    lines.on("line", onLine);
  });
}

export async function stopOwnedChild(child, timerOptions = undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const exited = once(child, "exit").then(() => true);
  child.kill("SIGTERM");
  if (await settleBeforeTimeout(exited, CHILD_STOP_TIMEOUT_MS, timerOptions)) return;

  child.kill("SIGKILL");
  if (await settleBeforeTimeout(exited, CHILD_STOP_TIMEOUT_MS, timerOptions)) return;
  throw new ReplayHostError("REPLAY_SERVICE_STOP_TIMEOUT", 503);
}

function errorResponse(error) {
  if (error instanceof ReplayHostSecurityError || error instanceof ReplayHostError) {
    return { statusCode: error.statusCode, code: error.code };
  }
  return { statusCode: 500, code: "REPLAY_HOST_INTERNAL_ERROR" };
}

export async function startReplayHost({
  allowedOrigin,
  controlPort = 8766,
  servicePort = 8765,
  replayRoot = path.resolve(process.cwd(), "data", "replay"),
  serviceEntry = DEFAULT_SERVICE_ENTRY,
  spawnProcess = spawn
} = {}) {
  if (typeof allowedOrigin !== "string" || allowedOrigin.length === 0) {
    throw new TypeError("allowedOrigin is required");
  }
  if (!Number.isInteger(controlPort) || controlPort < 0 || controlPort > 65535) {
    throw new TypeError("controlPort must be an integer between 0 and 65535");
  }
  if (!Number.isInteger(servicePort) || servicePort < 0 || servicePort > 65535) {
    throw new TypeError("servicePort must be an integer between 0 and 65535");
  }

  const hostRunId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const ownedRoot = path.join(path.resolve(replayRoot), `host-${hostRunId}`);
  const controlToken = generateReplayControlToken();
  let pairingConsumed = false;
  let runSequence = 0;
  let activeRun = null;
  let closing = false;
  let lifecycle = Promise.resolve();

  function serializeLifecycle(operation) {
    const result = lifecycle.then(operation, operation);
    lifecycle = result.catch(() => {});
    return result;
  }

  async function startRunOperation() {
    if (activeRun !== null) {
      throw new ReplayHostError("REPLAY_RUN_ALREADY_ACTIVE", 409);
    }

    await assertPortAvailable(servicePort);
    runSequence += 1;
    const runId = `run-${String(runSequence).padStart(4, "0")}`;
    const runDir = path.join(ownedRoot, runId);
    const dbPath = path.join(runDir, "market-flow-us-replay.duckdb");
    await mkdir(runDir, { recursive: true });

    const child = spawnProcess(process.execPath, [
      serviceEntry,
      "--db", dbPath,
      "--host", HOST,
      "--port", String(servicePort),
      "--allowed-origin", allowedOrigin
    ], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    let ready;
    try {
      ready = await waitForChildReady(child);
    } catch (error) {
      try {
        await stopOwnedChild(child);
      } catch {
        // Preserve the startup failure; only this Host-owned child is touched.
      }
      throw error;
    }

    activeRun = {
      runId,
      dbPath,
      child,
      port: ready.port
    };
    child.once("exit", () => {
      if (activeRun?.child === child) activeRun = null;
    });

    return Object.freeze({
      status: "ready",
      runId,
      serviceUrl: `ws://${HOST}:${ready.port}`,
      schemaVersion: ready.schemaVersion
    });
  }

  async function stopRunOperation() {
    const owned = activeRun;
    if (owned === null) {
      return Object.freeze({ status: "stopped", runId: null, hadActiveRun: false });
    }

    await stopOwnedChild(owned.child);
    if (activeRun?.child === owned.child) activeRun = null;
    return Object.freeze({ status: "stopped", runId: owned.runId, hadActiveRun: true });
  }

  function startRun() {
    return serializeLifecycle(startRunOperation);
  }

  function stopRun() {
    return serializeLifecycle(stopRunOperation);
  }

  const server = http.createServer((request, response) => {
    void (async () => {
      const origin = request.headers.origin;
      assertExactReplayOrigin(origin, allowedOrigin);

      if (request.method === "OPTIONS") {
        applyCors(response, origin, allowedOrigin);
        response.statusCode = 204;
        response.end();
        return;
      }

      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          status: "ready",
          paired: pairingConsumed,
          activeRun: activeRun !== null
        }, origin, allowedOrigin);
        return;
      }

      if (request.method !== "POST") {
        throw new ReplayHostError("REPLAY_CONTROL_NOT_FOUND", 404);
      }

      if (request.url === "/pair") {
        if (pairingConsumed) throw new ReplayHostError("REPLAY_PAIRING_CONSUMED", 409);
        pairingConsumed = true;
        sendJson(response, 200, {
          status: "paired",
          controlToken
        }, origin, allowedOrigin);
        return;
      }

      assertReplayControlToken(request.headers.authorization, controlToken, pairingConsumed);
      const body = await readJsonBody(request);
      normalizeReason(body.reason);

      if (request.url === "/run/start") {
        sendJson(response, 200, await startRun(), origin, allowedOrigin);
        return;
      }

      if (request.url === "/run/stop") {
        sendJson(response, 200, await stopRun(), origin, allowedOrigin);
        return;
      }

      throw new ReplayHostError("REPLAY_CONTROL_NOT_FOUND", 404);
    })().catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const failure = errorResponse(error);
      sendJson(response, failure.statusCode, { code: failure.code }, request.headers.origin, allowedOrigin);
    });
  });

  try {
    server.listen(controlPort, HOST);
    await once(server, "listening");
  } catch {
    server.close();
    throw new ReplayHostError("REPLAY_HOST_LISTEN_FAILED", 503);
  }

  const address = server.address();
  const actualControlPort = typeof address === "object" && address ? address.port : controlPort;

  async function close() {
    if (closing) return;
    closing = true;
    try {
      await stopRun();
    } finally {
      if (server.listening) {
        await new Promise((resolve) => server.close(() => resolve()));
      }
    }
  }

  return Object.freeze({
    host: HOST,
    controlPort: actualControlPort,
    close,
    getState() {
      return Object.freeze({
        paired: pairingConsumed,
        activeRunId: activeRun?.runId ?? null,
        runSequence
      });
    }
  });
}
