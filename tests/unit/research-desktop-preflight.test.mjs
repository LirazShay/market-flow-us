import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  terminateProcessTree,
  validateDesktopPluginRepositoryContract
} from "../../scripts/check-research-desktop-preflight.mjs";

test("TREE 11.8 Desktop preflight validates repo marketplace, plugin and PATH executable contract", async () => {
  assert.deepEqual(
    await validateDesktopPluginRepositoryContract(),
    {
      marketplaceEntry: true,
      pluginManifest: true,
      mcpStdio: true,
      packageBin: true
    }
  );
});

test("TREE 11.8 Desktop preflight terminates the full Windows launcher process tree", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };
  const killer = new EventEmitter();
  let invocation = null;

  const cleanup = terminateProcessTree(child, {
    platform: "win32",
    spawnProcess(command, args, options) {
      invocation = { command, args, options };
      queueMicrotask(() => killer.emit("exit", 0, null));
      return killer;
    }
  });

  await cleanup;

  assert.deepEqual(invocation, {
    command: "taskkill",
    args: ["/PID", "4321", "/T", "/F"],
    options: { stdio: "ignore", windowsHide: true }
  });
  assert.equal(child.killCalls, 0, "successful taskkill tree cleanup must not fall back to shell-only kill");
});

test("TREE 11.8 Desktop preflight bounds a hung Windows taskkill and falls back without hanging", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };
  const killer = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  });

  await terminateProcessTree(child, {
    platform: "win32",
    timeoutMs: 5,
    spawnProcess() {
      return killer;
    }
  });

  assert.equal(killer.killCalls, 1, "hung taskkill helper must be terminated at the cleanup deadline");
  assert.equal(child.killCalls, 1, "cleanup timeout must fall back to best-effort direct child termination");
});

test("TREE 11.8 Desktop preflight keeps direct child cleanup on non-Windows platforms", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };

  await terminateProcessTree(child, {
    platform: "linux",
    spawnProcess() {
      assert.fail("non-Windows cleanup must not invoke taskkill");
    }
  });

  assert.equal(child.killCalls, 1);
});
