import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { startReplayHost } from "../../replay-host/host.js";

const ORIGIN = "https://provider.example.test";

async function requestJson(baseUrl, pathname, {
  token = null,
  body = undefined
} = {}) {
  const headers = { Origin: ORIGIN };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createControlledChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal) => {
    if (child.exitCode !== null) return false;
    child.signalCode = signal;
    setImmediate(() => {
      if (child.exitCode !== null) return;
      child.exitCode = 0;
      child.emit("exit", 0, signal);
    });
    return true;
  };
  return child;
}

test("Replay Host Stop issued during child startup waits and stops that owned child", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-replay-host-race-"));
  const children = [];
  const spawned = deferred();
  const host = await startReplayHost({
    allowedOrigin: ORIGIN,
    controlPort: 0,
    servicePort: 0,
    replayRoot: path.join(tempDir, "replay-owned"),
    spawnProcess: () => {
      const child = createControlledChild();
      children.push(child);
      spawned.resolve(child);
      return child;
    }
  });

  try {
    const baseUrl = `http://127.0.0.1:${host.controlPort}`;
    const paired = await requestJson(baseUrl, "/pair");
    assert.equal(paired.response.status, 200);
    const token = paired.payload.controlToken;

    const startPromise = requestJson(baseUrl, "/run/start", {
      token,
      body: { reason: "race-start" }
    });
    const child = await spawned.promise;
    assert.equal(children.length, 1);

    const stopPromise = requestJson(baseUrl, "/run/stop", {
      token,
      body: { reason: "race-stop" }
    });
    await settle();
    assert.equal(child.exitCode, null, "Stop must wait for the in-progress owned startup boundary");

    child.stdout.write(`${JSON.stringify({
      event: "service.ready",
      host: "127.0.0.1",
      port: 9123,
      schemaVersion: 4
    })}\n`);

    const start = await startPromise;
    const stop = await stopPromise;
    assert.equal(start.response.status, 200);
    assert.equal(start.payload.status, "ready");
    assert.equal(stop.response.status, 200);
    assert.equal(stop.payload.status, "stopped");
    assert.equal(stop.payload.hadActiveRun, true);
    assert.equal(stop.payload.runId, start.payload.runId);
    assert.equal(host.getState().activeRunId, null);
    assert.equal(child.signalCode, "SIGTERM");
  } finally {
    await host.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
