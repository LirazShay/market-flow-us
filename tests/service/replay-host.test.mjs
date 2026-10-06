import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startReplayHost } from "../../replay-host/host.js";

const ORIGIN = "https://provider.example.test";

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function requestJson(baseUrl, pathname, {
  origin = ORIGIN,
  token = null,
  body = undefined
} = {}) {
  const headers = { Origin: origin };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

test("Replay Host pairs once, requires exact Origin + token, and creates isolated fresh runs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-replay-host-"));
  const replayRoot = path.join(tempDir, "replay-owned");
  const liveDbCanary = path.join(tempDir, "market-flow-us.duckdb");
  await writeFile(liveDbCanary, "LIVE_DB_CANARY", "utf8");

  const host = await startReplayHost({
    allowedOrigin: ORIGIN,
    controlPort: 0,
    servicePort: 0,
    replayRoot
  });

  try {
    const baseUrl = `http://127.0.0.1:${host.controlPort}`;

    const foreignPair = await requestJson(baseUrl, "/pair", {
      origin: "https://evil.example.test"
    });
    assert.equal(foreignPair.response.status, 403);
    assert.equal(foreignPair.payload.code, "REPLAY_ORIGIN_REJECTED");

    const paired = await requestJson(baseUrl, "/pair");
    assert.equal(paired.response.status, 200);
    assert.match(paired.payload.controlToken, /^[A-Za-z0-9_-]{40,}$/);
    const token = paired.payload.controlToken;

    const secondPair = await requestJson(baseUrl, "/pair");
    assert.equal(secondPair.response.status, 409);
    assert.equal(secondPair.payload.code, "REPLAY_PAIRING_CONSUMED");

    const unauthorizedStart = await requestJson(baseUrl, "/run/start");
    assert.equal(unauthorizedStart.response.status, 401);
    assert.equal(unauthorizedStart.payload.code, "REPLAY_CONTROL_UNAUTHORIZED");

    const firstStart = await requestJson(baseUrl, "/run/start", {
      token,
      body: { reason: "initial-play" }
    });
    assert.equal(firstStart.response.status, 200);
    assert.equal(firstStart.payload.status, "ready");
    assert.match(firstStart.payload.runId, /^run-\d{4}$/);
    assert.match(firstStart.payload.serviceUrl, /^ws:\/\/127\.0\.0\.1:\d+$/);

    const firstStop = await requestJson(baseUrl, "/run/stop", {
      token,
      body: { reason: "stop" }
    });
    assert.equal(firstStop.response.status, 200);
    assert.equal(firstStop.payload.status, "stopped");

    const secondStart = await requestJson(baseUrl, "/run/start", {
      token,
      body: { reason: "play-after-stop" }
    });
    assert.equal(secondStart.response.status, 200);
    assert.equal(secondStart.payload.status, "ready");
    assert.notEqual(secondStart.payload.runId, firstStart.payload.runId);

    const secondStop = await requestJson(baseUrl, "/run/stop", {
      token,
      body: { reason: "cleanup" }
    });
    assert.equal(secondStop.response.status, 200);

    const ownedFiles = await readdir(replayRoot, { recursive: true });
    const dbFiles = ownedFiles.filter((entry) => entry.endsWith(".duckdb"));
    assert.equal(dbFiles.length, 2);
    assert.equal(await readFile(liveDbCanary, "utf8"), "LIVE_DB_CANARY");
  } finally {
    await host.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Replay Host fails closed when the configured service port belongs to another process", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-replay-host-port-"));
  const replayRoot = path.join(tempDir, "replay-owned");
  const servicePort = await freePort();
  const foreignServer = net.createServer((socket) => socket.end("foreign"));
  foreignServer.listen(servicePort, "127.0.0.1");
  await once(foreignServer, "listening");

  const host = await startReplayHost({
    allowedOrigin: ORIGIN,
    controlPort: 0,
    servicePort,
    replayRoot
  });

  try {
    const baseUrl = `http://127.0.0.1:${host.controlPort}`;
    const paired = await requestJson(baseUrl, "/pair");
    const start = await requestJson(baseUrl, "/run/start", {
      token: paired.payload.controlToken,
      body: { reason: "occupied-port-proof" }
    });

    assert.equal(start.response.status, 409);
    assert.equal(start.payload.code, "REPLAY_SERVICE_PORT_OCCUPIED");
    assert.equal(foreignServer.listening, true);
    await assert.rejects(readdir(replayRoot), { code: "ENOENT" });
  } finally {
    await host.close();
    await new Promise((resolve, reject) => foreignServer.close((error) => error ? reject(error) : resolve()));
    await rm(tempDir, { recursive: true, force: true });
  }
});
