import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_US_RECORDER_CONFIG,
  createUsRecorderConfig
} from "../../browser/recorder/config.js";
import { createRecorder } from "../../browser/recorder/recorder.js";

function createManualScheduler(clock) {
  const queue = [];
  let nextId = 1;
  return {
    schedule(callback, delayMs) {
      const task = { id: nextId++, callback, delayMs, cancelled: false };
      queue.push(task);
      return task.id;
    },
    cancelSchedule(id) {
      const task = queue.find((item) => item.id === id);
      if (task) task.cancelled = true;
    },
    next() {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task.cancelled) return task;
      }
      return null;
    },
    pending() {
      return queue.filter((task) => !task.cancelled);
    },
    async runNext() {
      const task = this.next();
      assert.ok(task, "expected one scheduled task");
      clock.value += task.delayMs;
      await task.callback();
      return task;
    }
  };
}

function candidate(ids, responseOrder = ids) {
  const membership = ids.map(String).sort();
  const securities = responseOrder.map((id) => Object.freeze({
    securityId: String(id),
    chunkIndex: 0,
    data: { PaperId: id }
  }));
  return Object.freeze({
    universe: Object.freeze({
      recordCount: ids.length,
      membership: Object.freeze(membership),
      securities: Object.freeze(ids.map((id) => ({ securityId: String(id) })))
    }),
    cycle: Object.freeze({
      status: "complete",
      requested: ids.length,
      received: ids.length,
      unique: ids.length,
      missing: 0,
      duplicates: 0,
      unexpected: 0,
      completedAtMs: 1,
      chunks: Object.freeze([Object.freeze({ chunkIndex: 0 })]),
      securities: Object.freeze(securities)
    })
  });
}

function createUsRecorderHarness({ candidates, acceptUniverse, onCycle, onFailure } = {}) {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  let index = 0;
  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    collectCandidate: async () => candidates[index++],
    acceptUniverse: acceptUniverse ?? (async () => {}),
    onCycle: onCycle ?? (async () => {}),
    onFailure: onFailure ?? (async () => {})
  });
  return { clock, scheduler, recorder };
}

test("U.S. Recorder config is cadence-only with the 3000 ms offline default", () => {
  assert.deepEqual(DEFAULT_US_RECORDER_CONFIG, { snapshotIntervalMs: 3000 });
  assert.deepEqual(createUsRecorderConfig(), { snapshotIntervalMs: 3000 });
  assert.equal(createUsRecorderConfig({ snapshotIntervalMs: 10 }).snapshotIntervalMs, 10);
  assert.throws(() => createUsRecorderConfig({ chunkSize: 187 }), /Unsupported U\.S\. Recorder config/);
  assert.throws(() => createUsRecorderConfig({ chunkDelayMs: 1000 }), /Unsupported U\.S\. Recorder config/);
  assert.throws(() => createUsRecorderConfig({ snapshotIntervalMs: -1 }), /snapshotIntervalMs/);
});

test("U.S. Recorder reuses revision for reorder and replaces before commit on add/remove membership", async () => {
  const events = [];
  const first = candidate(["1", "2"], ["1", "2"]);
  const reordered = candidate(["1", "2"], ["2", "1"]);
  const changed = candidate(["1", "3"], ["3", "1"]);
  const { scheduler, recorder } = createUsRecorderHarness({
    candidates: [first, reordered, changed],
    acceptUniverse: async (universe) => events.push(`accept:${universe.membership.join(",")}`),
    onCycle: async (cycle) => events.push(`commit:${cycle.securities.map((item) => item.securityId).join(",")}`)
  });

  recorder.start({ snapshotIntervalMs: 10 });
  await scheduler.runNext();
  await scheduler.runNext();
  await scheduler.runNext();
  recorder.stop();

  assert.deepEqual(events, [
    "accept:1,2",
    "commit:1,2",
    "commit:2,1",
    "accept:1,3",
    "commit:3,1"
  ]);
  assert.equal(recorder.getState().completedCycles, 3);
});

test("U.S. universe ACK rejection never commits and is retried on the next changed-membership response", async () => {
  let accepts = 0;
  let commits = 0;
  const first = candidate(["1"]);
  const changed = candidate(["2"]);
  const { scheduler, recorder } = createUsRecorderHarness({
    candidates: [first, changed, changed],
    acceptUniverse: async (universe) => {
      accepts++;
      if (universe.membership[0] === "2" && accepts === 2) throw new Error("revision rejected");
    },
    onCycle: async () => { commits++; }
  });

  recorder.start({ snapshotIntervalMs: 10 });
  await scheduler.runNext();
  await scheduler.runNext();
  await scheduler.runNext();
  recorder.stop();

  assert.equal(accepts, 3);
  assert.equal(commits, 2);
  assert.equal(recorder.getState().completedCycles, 2);
  assert.equal(recorder.getState().failedCycles, 1);
});

test("U.S. provider failure fails closed, reports provider-fetch and schedules recovery", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  const failures = [];
  let attempts = 0;
  let commits = 0;
  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    collectCandidate: async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("provider down");
        Object.defineProperty(error, "marketFlowUsPhase", { value: "provider-fetch" });
        throw error;
      }
      return candidate(["1"]);
    },
    acceptUniverse: async () => {},
    onCycle: async () => { commits++; },
    onFailure: async (failure) => failures.push(failure)
  });

  recorder.start({ snapshotIntervalMs: 10 });
  await scheduler.runNext();
  assert.equal(commits, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].phase, "provider-fetch");
  assert.equal(recorder.getState().failedCycles, 1);
  assert.equal(scheduler.pending().length, 1);

  await scheduler.runNext();
  recorder.stop();
  assert.equal(commits, 1);
  assert.equal(recorder.getState().completedCycles, 1);
});

test("U.S. candidate cycles never overlap and stop cancels future work", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  let active = 0;
  let maxActive = 0;
  let cycles = 0;
  let releaseFirst;
  let entered;
  const firstEntered = new Promise((resolve) => { entered = resolve; });

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    collectCandidate: async () => {
      cycles++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (cycles === 1) {
        entered();
        await new Promise((resolve) => { releaseFirst = resolve; });
      }
      active--;
      return candidate(["1"]);
    },
    acceptUniverse: async () => {},
    onCycle: async () => {}
  });

  recorder.start({ snapshotIntervalMs: 100 });
  const firstTask = scheduler.next();
  const firstRun = firstTask.callback();
  await firstEntered;
  assert.equal(active, 1);
  assert.equal(scheduler.pending().length, 0);

  clock.value = 150;
  releaseFirst();
  await firstRun;
  assert.equal(maxActive, 1);
  assert.equal(scheduler.pending().length, 1);
  assert.equal(scheduler.pending()[0].delayMs, 0);

  recorder.stop("manual");
  assert.equal(scheduler.pending().length, 0);
  assert.equal(recorder.getState().status, "stopped");
  assert.equal(cycles, 1);
});

test("U.S. candidate validation rejects mismatched universe/cycle membership before authority", async () => {
  const bad = candidate(["1", "2"]);
  const mismatched = {
    ...bad,
    cycle: { ...bad.cycle, securities: [{ securityId: "1", chunkIndex: 0 }, { securityId: "3", chunkIndex: 0 }] }
  };
  let accepts = 0;
  let commits = 0;
  const { scheduler, recorder } = createUsRecorderHarness({
    candidates: [mismatched],
    acceptUniverse: async () => { accepts++; },
    onCycle: async () => { commits++; }
  });

  recorder.start({ snapshotIntervalMs: 10 });
  await scheduler.runNext();
  recorder.stop();

  assert.equal(accepts, 0);
  assert.equal(commits, 0);
  assert.equal(recorder.getState().failedCycles, 1);
  assert.match(recorder.getState().latestError.message, /membership differ/);
});
