import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  runBoundedCommand,
  terminateChildTree
} from "../../scripts/acceptance-process.mjs";
import { parseNewTradingDayCliArgs } from "../../scripts/new-trading-day.mjs";
import { buildWorkloadEnvironment } from "../../scripts/run-workload-profile.mjs";
import {
  sanitizeWorkloadDiagnostic,
  sanitizedFailure
} from "../workload/us-workload-support.mjs";

function fakeRunningChild(pid = 4321) {
  const child = new EventEmitter();
  child.pid = pid;
  child.exitCode = null;
  child.signalCode = null;
  child.killCount = 0;
  child.kill = () => {
    child.killCount += 1;
    child.signalCode = "SIGTERM";
    return true;
  };
  return child;
}

function fakeTaskkill() {
  const killer = new EventEmitter();
  killer.exitCode = null;
  killer.signalCode = null;
  killer.killCount = 0;
  killer.kill = () => {
    killer.killCount += 1;
    killer.signalCode = "SIGTERM";
    return true;
  };
  return killer;
}

test("acceptance subprocesses fail closed on a hard timeout", async () => {
  const startedAt = Date.now();
  const result = await runBoundedCommand(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    {
      timeoutMs: 50,
      stdout: null,
      stderr: null
    }
  );

  assert.equal(result.code, 1);
  assert.equal(result.signal, "TIMEOUT");
  assert.match(result.error, /exceeded 50 ms/);
  assert.ok(Date.now() - startedAt < 5000, "timed-out subprocess must be reaped promptly");
});

test("acceptance subprocesses preserve normal exit status", async () => {
  const result = await runBoundedCommand(
    process.execPath,
    ["-e", "process.stdout.write('ok')"],
    {
      timeoutMs: 5000,
      stdout: null,
      stderr: null
    }
  );

  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.error, null);
  assert.equal(result.output, "ok");
});

test("Windows acceptance cleanup bounds a hung taskkill and falls back to the child", async () => {
  const child = fakeRunningChild();
  const killer = fakeTaskkill();
  const startedAt = Date.now();

  await terminateChildTree(child, {
    platform: "win32",
    graceMs: 5,
    taskkillTimeoutMs: 5,
    spawnProcess(command, args, options) {
      assert.equal(command, "taskkill");
      assert.deepEqual(args, ["/PID", String(child.pid), "/T", "/F"]);
      assert.deepEqual(options, {
        stdio: "ignore",
        windowsHide: true,
        shell: false
      });
      return killer;
    }
  });

  assert.equal(killer.killCount, 1, "hung taskkill helper must be stopped at its deadline");
  assert.equal(child.killCount, 1, "hung taskkill must fall back to direct child termination");
  assert.ok(Date.now() - startedAt < 1000, "Windows cleanup must remain bounded");
});

test("Windows acceptance cleanup falls back when taskkill reports failure", async () => {
  const child = fakeRunningChild();
  const killer = fakeTaskkill();

  await terminateChildTree(child, {
    platform: "win32",
    graceMs: 5,
    taskkillTimeoutMs: 100,
    spawnProcess() {
      queueMicrotask(() => {
        killer.exitCode = 1;
        killer.emit("exit", 1, null);
      });
      return killer;
    }
  });

  assert.equal(child.killCount, 1);
  assert.equal(killer.killCount, 0);
});

test("Windows acceptance cleanup verifies the child exited after successful taskkill", async () => {
  const child = fakeRunningChild();
  const killer = fakeTaskkill();

  await terminateChildTree(child, {
    platform: "win32",
    graceMs: 5,
    taskkillTimeoutMs: 100,
    spawnProcess() {
      queueMicrotask(() => {
        killer.exitCode = 0;
        killer.emit("exit", 0, null);
      });
      return killer;
    }
  });

  assert.equal(child.killCount, 1, "taskkill success must not substitute for observed child exit");
});

test("workload failure artifacts redact machine paths and URLs before rethrow", () => {
  const profileTemp = path.join(os.tmpdir(), "market-flow-us-private-profile");
  const raw = [
    `profile=${path.join(profileTemp, "secret.duckdb")}`,
    `repo=${path.join(process.cwd(), "private", "fixture.txt")}`,
    `home=${path.join(os.homedir(), "private", "state.json")}`,
    "provider=https://example.test/private/session?id=123"
  ].join("\n");
  const error = new Error(raw);

  const failure = sanitizedFailure(error, profileTemp);
  const serialized = JSON.stringify(failure);
  for (const secret of [profileTemp, process.cwd(), os.homedir(), "https://example.test"]) {
    assert.equal(serialized.includes(secret), false);
    assert.equal(error.message.includes(secret), false);
  }
  assert.equal(error.message, sanitizeWorkloadDiagnostic(raw, profileTemp));
  assert.match(error.message, /<temp-profile>|<repo>|<home>|<temp>|<url>/);
});

test("authoritative target workload profiles cannot inherit custom shape overrides", () => {
  const baseEnv = {
    KEEP_ME: "yes",
    MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE: "1",
    MARKET_FLOW_US_WORKLOAD_CYCLES: "1",
    MARKET_FLOW_US_WORKLOAD_CADENCE_MS: "1",
    MARKET_FLOW_US_TRADING_DAY_MINUTES: "1",
    MARKET_FLOW_US_PERSISTENCE_UNIVERSE_SIZE: "1",
    MARKET_FLOW_US_PERSISTENCE_CYCLES: "1",
    MARKET_FLOW_US_WORKLOAD_PATTERN: "static",
    MARKET_FLOW_US_WORKLOAD_FAILURE_CYCLES: "1",
    MARKET_FLOW_US_WORKLOAD_REPORT: "custom-report.json"
  };

  for (const profile of ["target-day", "target-e2e"]) {
    const env = buildWorkloadEnvironment(profile, baseEnv);
    assert.equal(env.KEEP_ME, "yes");
    assert.equal(env.MARKET_FLOW_US_WORKLOAD_PROFILE, profile);
    assert.equal(env.MARKET_FLOW_US_WORKLOAD_REPORT, "custom-report.json");
    for (const key of [
      "MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE",
      "MARKET_FLOW_US_WORKLOAD_CYCLES",
      "MARKET_FLOW_US_WORKLOAD_CADENCE_MS",
      "MARKET_FLOW_US_TRADING_DAY_MINUTES",
      "MARKET_FLOW_US_PERSISTENCE_UNIVERSE_SIZE",
      "MARKET_FLOW_US_PERSISTENCE_CYCLES",
      "MARKET_FLOW_US_WORKLOAD_PATTERN",
      "MARKET_FLOW_US_WORKLOAD_FAILURE_CYCLES"
    ]) {
      assert.equal(Object.hasOwn(env, key), false, `${profile} must ignore ${key}`);
    }
  }

  const custom = buildWorkloadEnvironment("custom", baseEnv);
  assert.equal(custom.MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE, "1");
  assert.equal(custom.MARKET_FLOW_US_WORKLOAD_PATTERN, "static");
});

test("new-day CLI rejects missing path option values instead of treating flags as paths", () => {
  assert.throws(
    () => parseNewTradingDayCliArgs(["--db"]),
    /Missing value for --db/
  );
  assert.throws(
    () => parseNewTradingDayCliArgs(["--archive-dir", "--no-archive"]),
    /Missing value for --archive-dir/
  );
  assert.deepEqual(
    parseNewTradingDayCliArgs([
      "--db", "data/custom.duckdb",
      "--archive-dir", "data/custom-archive",
      "--no-archive"
    ]),
    {
      dbPath: "data/custom.duckdb",
      archive: false,
      archiveDir: "data/custom-archive"
    }
  );
});
