import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  BasicBuySidecarError,
  startBasicBuySidecar
} from "../../local-service/orders/basic-buy-sidecar.js";

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.kills = [];
  }

  kill(signal) {
    this.kills.push(signal);
    this.signalCode = signal;
    queueMicrotask(() => this.emit("exit", 0, signal));
    return true;
  }
}

function readyMessage(mode, callerToken = "x".repeat(48)) {
  return {
    type: "ibkr-order-service.ready",
    baseUrl: "http://127.0.0.1:8770",
    mode,
    callerToken
  };
}

function spawnHarness(onSpawn) {
  const calls = [];
  return {
    calls,
    spawnProcess(command, args, options) {
      const child = new FakeChild();
      calls.push({ command, args, options, child });
      queueMicrotask(() => onSpawn(child));
      return child;
    }
  };
}

test("Basic BUY owns exactly one DRY_RUN sidecar and receives readiness only through IPC", async () => {
  const harness = spawnHarness((child) => child.emit("message", readyMessage("DRY_RUN", "S".repeat(48))));

  const sidecar = await startBasicBuySidecar({
    buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
    spawnProcess: harness.spawnProcess.bind(harness),
    readyTimeoutMs: 100,
    stopTimeoutMs: 100
  });

  assert.equal(harness.calls.length, 1);
  const [{ args, options, child }] = harness.calls;
  assert.equal(args.at(-1).endsWith("ibkr-order-service/index.js"), true);
  assert.equal(args.includes("--live"), false);
  assert.deepEqual(options.stdio, ["ignore", "inherit", "inherit", "ipc"]);
  assert.equal(sidecar.isReady(), true);
  assert.deepEqual(sidecar.getState(), { state: "ready", mode: "DRY_RUN" });
  assert.equal(JSON.stringify(sidecar).includes("SSSS"), false);

  await sidecar.close();
  assert.deepEqual(child.kills, ["SIGTERM"]);
  assert.equal(sidecar.isReady(), false);
  assert.deepEqual(sidecar.getState(), { state: "stopped", mode: "DRY_RUN" });
});

test("LIVE composition arms only the owned sidecar child with the existing literal --live gate", async () => {
  const harness = spawnHarness((child) => child.emit("message", readyMessage("LIVE")));

  const sidecar = await startBasicBuySidecar({
    buyConfig: { enabled: true, quantity: 1, mode: "LIVE" },
    spawnProcess: harness.spawnProcess.bind(harness),
    readyTimeoutMs: 100,
    stopTimeoutMs: 100
  });

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0].args.slice(-1), ["--live"]);
  assert.equal(sidecar.isReady(), true);
  await sidecar.close();
});

test("invalid or foreign readiness fails closed and stops only the child that Market Flow US spawned", async () => {
  const harness = spawnHarness((child) => child.emit("message", {
    ...readyMessage("DRY_RUN"),
    baseUrl: "http://127.0.0.1:9999"
  }));

  await assert.rejects(
    () => startBasicBuySidecar({
      buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
      spawnProcess: harness.spawnProcess.bind(harness),
      readyTimeoutMs: 100,
      stopTimeoutMs: 100
    }),
    (error) => error instanceof BasicBuySidecarError
      && error.code === "BASIC_BUY_SIDECAR_READY_INVALID"
  );

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0].child.kills, ["SIGTERM"]);
});

test("child exit before readiness is unavailable and is never treated as an attachable foreign sidecar", async () => {
  const harness = spawnHarness((child) => {
    child.exitCode = 1;
    child.emit("exit", 1, null);
  });

  await assert.rejects(
    () => startBasicBuySidecar({
      buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
      spawnProcess: harness.spawnProcess.bind(harness),
      readyTimeoutMs: 100,
      stopTimeoutMs: 100
    }),
    (error) => error instanceof BasicBuySidecarError
      && error.code === "BASIC_BUY_SIDECAR_START_FAILED"
  );

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0].child.kills, []);
});

test("owned sidecar exit after readiness immediately revokes BUY readiness", async () => {
  const harness = spawnHarness((child) => child.emit("message", readyMessage("DRY_RUN")));
  const sidecar = await startBasicBuySidecar({
    buyConfig: { enabled: true, quantity: 2, mode: "DRY_RUN" },
    spawnProcess: harness.spawnProcess.bind(harness),
    readyTimeoutMs: 100,
    stopTimeoutMs: 100
  });

  const child = harness.calls[0].child;
  child.exitCode = 1;
  child.emit("exit", 1, null);

  assert.equal(sidecar.isReady(), false);
  assert.deepEqual(sidecar.getState(), { state: "unavailable", mode: "DRY_RUN" });
});
