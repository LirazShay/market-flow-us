import assert from "node:assert/strict";
import test from "node:test";
import { createScannerScheduler } from "../../browser/viewer/scanner-scheduler.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createManualTimers() {
  let nextId = 1;
  const timers = new Map();

  return {
    setTimer(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    pending() {
      return [...timers.entries()].map(([id, timer]) => ({
        id,
        delayMs: timer.delayMs
      }));
    },
    fire(id) {
      const timer = timers.get(id);
      assert.ok(timer, `timer ${id} must exist`);
      timers.delete(id);
      timer.callback();
    }
  };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("Scanner scheduler preserves active draft, waits after completion and never overlaps generations", async () => {
  const timers = createManualTimers();
  const executions = [];
  const results = [];
  let concurrent = 0;
  let maxConcurrent = 0;

  const scheduler = createScannerScheduler({
    execute(sql) {
      const pending = deferred();
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      executions.push({ sql, pending });
      return pending.promise.finally(() => {
        concurrent -= 1;
      });
    },
    onResult(result, context) {
      results.push([context.generation, context.sql, result]);
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  scheduler.setDraft({ sql: "SELECT 'A'", intervalMs: 50 });
  scheduler.activate();
  assert.deepEqual(executions.map((item) => item.sql), ["SELECT 'A'"]);
  assert.equal(scheduler.getState().inFlight, true);

  scheduler.setDraft({ sql: "SELECT 'B'", intervalMs: 5 });
  executions[0].pending.resolve({ marker: "A1" });
  await flush();

  assert.deepEqual(results, [[1, "SELECT 'A'", { marker: "A1" }]]);
  assert.deepEqual(timers.pending().map((timer) => timer.delayMs), [50]);

  timers.fire(timers.pending()[0].id);
  await flush();
  assert.deepEqual(executions.map((item) => item.sql), ["SELECT 'A'", "SELECT 'A'"]);

  scheduler.activate();
  assert.equal(scheduler.getState().generation, 2);
  assert.equal(scheduler.getState().activeSql, "SELECT 'B'");
  assert.deepEqual(executions.map((item) => item.sql), ["SELECT 'A'", "SELECT 'A'"]);
  assert.equal(maxConcurrent, 1);

  executions[1].pending.resolve({ marker: "stale-A2" });
  await flush();

  assert.deepEqual(executions.map((item) => item.sql), [
    "SELECT 'A'",
    "SELECT 'A'",
    "SELECT 'B'"
  ]);
  assert.deepEqual(results, [[1, "SELECT 'A'", { marker: "A1" }]]);
  assert.equal(maxConcurrent, 1);

  executions[2].pending.resolve({ marker: "B1" });
  await flush();

  assert.deepEqual(results, [
    [1, "SELECT 'A'", { marker: "A1" }],
    [2, "SELECT 'B'", { marker: "B1" }]
  ]);
  assert.deepEqual(timers.pending().map((timer) => timer.delayMs), [5]);
  assert.equal(maxConcurrent, 1);

  scheduler.stop();
  assert.equal(timers.pending().length, 0);
});

test("Scanner scheduler stop is resumable and suppresses a stale in-flight result", async () => {
  const timers = createManualTimers();
  const executions = [];
  const results = [];

  const scheduler = createScannerScheduler({
    execute(sql) {
      const pending = deferred();
      executions.push({ sql, pending });
      return pending.promise;
    },
    onResult(result, context) {
      results.push([context.generation, context.sql, result]);
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  scheduler.setDraft({ sql: "SELECT 'before-stop'", intervalMs: 50 });
  scheduler.activate();
  assert.equal(scheduler.getState().generation, 1);
  assert.equal(scheduler.getState().inFlight, true);

  scheduler.stop();
  assert.equal(scheduler.getState().stopped, true);
  assert.equal(scheduler.getState().generation, 2);
  assert.equal(timers.pending().length, 0);

  scheduler.setDraft({ sql: "SELECT 'after-stop'", intervalMs: 25 });
  assert.doesNotThrow(() => scheduler.activate());
  assert.equal(scheduler.getState().stopped, false);
  assert.equal(scheduler.getState().generation, 3);
  assert.equal(scheduler.getState().activeSql, "SELECT 'after-stop'");
  assert.deepEqual(executions.map((item) => item.sql), ["SELECT 'before-stop'"]);

  executions[0].pending.resolve({ marker: "stale" });
  await flush();

  assert.deepEqual(results, []);
  assert.deepEqual(executions.map((item) => item.sql), [
    "SELECT 'before-stop'",
    "SELECT 'after-stop'"
  ]);

  executions[1].pending.resolve({ marker: "fresh" });
  await flush();

  assert.deepEqual(results, [[3, "SELECT 'after-stop'", { marker: "fresh" }]]);
  assert.deepEqual(timers.pending().map((timer) => timer.delayMs), [25]);

  scheduler.stop();
});

test("Scanner scheduler requires a positive integer interval at activation", () => {
  const scheduler = createScannerScheduler({
    execute: async () => ({})
  });

  for (const intervalMs of [null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    scheduler.setDraft({ sql: "SELECT 1", intervalMs });
    assert.throws(() => scheduler.activate(), /positive integer/);
  }

  scheduler.setDraft({ sql: "SELECT 1", intervalMs: 1 });
  assert.doesNotThrow(() => scheduler.activate());
  scheduler.stop();
});
