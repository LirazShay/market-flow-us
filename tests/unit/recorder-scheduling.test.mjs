import assert from "node:assert/strict";
import test from "node:test";

import { createRecorderConfig, DEFAULT_RECORDER_CONFIG } from "../../browser/recorder/config.js";
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

test("recorder config keeps proven defaults but validates override types", () => {
  assert.deepEqual(DEFAULT_RECORDER_CONFIG, {
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false
  });
  assert.equal(createRecorderConfig({ chunkSize: 2 }).chunkSize, 2);
  assert.throws(() => createRecorderConfig({ chunkSize: 0 }), /chunkSize/);
  assert.throws(() => createRecorderConfig({ snapshotIntervalMs: -1 }), /snapshotIntervalMs/);
  assert.throws(() => createRecorderConfig({ refreshUniverseEveryCycle: "yes" }), /refreshUniverseEveryCycle/);
});

test("recorder requires explicit universe and commit authority callbacks", () => {
  const base = {
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    collectCycle: async () => ({ status: "complete" })
  };

  assert.throws(
    () => createRecorder({ ...base, onCycle: async () => {} }),
    /acceptUniverse must be a function/
  );
  assert.throws(
    () => createRecorder({ ...base, acceptUniverse: async () => {} }),
    /onCycle must be a function/
  );
});

test("universe authority rejection fails closed without collection or provider-failure misclassification", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  let collectCount = 0;
  const providerFailures = [];

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    acceptUniverse: async () => {
      throw new Error("universe ack rejected");
    },
    collectCycle: async () => {
      collectCount++;
      return { status: "complete", completedAtMs: clock.value };
    },
    onCycle: async () => {},
    onFailure: async (failure) => {
      providerFailures.push(failure);
    }
  });

  recorder.start({ snapshotIntervalMs: 50 });
  await scheduler.runNext();

  assert.equal(collectCount, 0);
  assert.equal(providerFailures.length, 0);
  assert.equal(recorder.getState().completedCycles, 0);
  assert.equal(recorder.getState().failedCycles, 1);
  assert.equal(recorder.getState().latestError.message, "universe ack rejected");
});

test("first cycle is immediate and universe activation completes before collection", async () => {
  const clock = { value: 1000 };
  const scheduler = createManualScheduler(clock);
  const events = [];
  const universe = { recordCount: 1, securities: [{ securityId: "1" }] };

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => {
      events.push("load");
      return universe;
    },
    acceptUniverse: async (value) => {
      assert.equal(value, universe);
      events.push("accept");
    },
    collectCycle: async ({ universe: activeUniverse }) => {
      assert.equal(activeUniverse, universe);
      events.push("collect");
      return { status: "complete", completedAtMs: clock.value };
    },
    onCycle: async () => {
      events.push("success");
    }
  });

  recorder.start({ snapshotIntervalMs: 100 });
  assert.equal(scheduler.pending().length, 1);
  assert.equal(scheduler.pending()[0].delayMs, 0);

  await scheduler.runNext();

  assert.deepEqual(events, ["load", "accept", "collect", "success"]);
  assert.equal(recorder.getState().completedCycles, 1);
  assert.equal(scheduler.pending().length, 1);
  assert.equal(scheduler.pending()[0].delayMs, 100);
});

test("commit authority rejection never exposes a completed cycle", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  const providerFailures = [];

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    acceptUniverse: async () => {},
    collectCycle: async () => ({ status: "complete", completedAtMs: clock.value }),
    onCycle: async () => {
      throw new Error("commit rejected");
    },
    onFailure: async (failure) => {
      providerFailures.push(failure);
    }
  });

  recorder.start({ snapshotIntervalMs: 50 });
  await scheduler.runNext();

  assert.equal(providerFailures.length, 0);
  assert.equal(recorder.getState().completedCycles, 0);
  assert.equal(recorder.getState().failedCycles, 1);
  assert.equal(recorder.getState().latestCycle, null);
  assert.equal(recorder.getState().latestError.message, "commit rejected");
});

test("cycles never overlap and slow cycles schedule one immediate successor without catch-up burst", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  let signalFirstEntered;
  const firstEntered = new Promise((resolve) => {
    signalFirstEntered = resolve;
  });
  let cycleCount = 0;

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    acceptUniverse: async () => {},
    collectCycle: async () => {
      cycleCount++;
      active++;
      maxActive = Math.max(maxActive, active);
      if (cycleCount === 1) {
        signalFirstEntered();
        await new Promise((resolve) => {
          releaseFirst = resolve;
        });
      }
      active--;
      return { status: "complete", completedAtMs: clock.value };
    },
    onCycle: async () => {}
  });

  recorder.start({ snapshotIntervalMs: 100 });
  const firstTask = scheduler.next();
  assert.equal(firstTask.delayMs, 0);

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

  await scheduler.runNext();
  assert.equal(cycleCount, 2);
  assert.equal(maxActive, 1);
  assert.equal(scheduler.pending().length, 1);
});

test("cached universe is reused, while configured refresh is load -> accept -> collect every cycle", async () => {
  async function runTwo(refreshUniverseEveryCycle) {
    const clock = { value: 0 };
    const scheduler = createManualScheduler(clock);
    const events = [];
    let universeNumber = 0;

    const recorder = createRecorder({
      now: () => clock.value,
      schedule: scheduler.schedule,
      cancelSchedule: scheduler.cancelSchedule,
      loadUniverse: async () => {
        universeNumber++;
        events.push(`load-${universeNumber}`);
        return { recordCount: 1, securities: [{ securityId: String(universeNumber) }] };
      },
      acceptUniverse: async (universe) => {
        events.push(`accept-${universe.securities[0].securityId}`);
      },
      collectCycle: async ({ universe }) => {
        events.push(`collect-${universe.securities[0].securityId}`);
        return { status: "complete", completedAtMs: clock.value };
      },
      onCycle: async () => {}
    });

    recorder.start({ snapshotIntervalMs: 10, refreshUniverseEveryCycle });
    await scheduler.runNext();
    await scheduler.runNext();
    recorder.stop();
    return events;
  }

  assert.deepEqual(
    await runTwo(false),
    ["load-1", "accept-1", "collect-1", "collect-1"]
  );
  assert.deepEqual(
    await runTwo(true),
    ["load-1", "accept-1", "collect-1", "load-2", "accept-2", "collect-2"]
  );
});

test("provider failure ends only the affected cycle, records failure, and never fabricates success", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  const failures = [];
  let successCount = 0;

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    acceptUniverse: async () => {},
    collectCycle: async () => {
      throw new Error("provider down");
    },
    onCycle: async () => {
      successCount++;
    },
    onFailure: async (failure) => {
      failures.push(failure);
    }
  });

  recorder.start({ snapshotIntervalMs: 50 });
  await scheduler.runNext();

  assert.equal(successCount, 0);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].phase, "chunk-fetch");
  assert.equal(failures[0].error.name, "CycleCollectionError");
  assert.equal(failures[0].error.message, "Provider cycle acquisition failed.");
  assert.equal(recorder.getState().latestError.message, "provider down");
  assert.equal(recorder.getState().completedCycles, 0);
  assert.equal(recorder.getState().failedCycles, 1);
  assert.equal(scheduler.pending().length, 1);
});

test("stop cancels the next scheduled cycle and does not start new work", async () => {
  const clock = { value: 0 };
  const scheduler = createManualScheduler(clock);
  let cycles = 0;

  const recorder = createRecorder({
    now: () => clock.value,
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    loadUniverse: async () => ({ recordCount: 1, securities: [{ securityId: "1" }] }),
    acceptUniverse: async () => {},
    collectCycle: async () => {
      cycles++;
      return { status: "complete", completedAtMs: clock.value };
    },
    onCycle: async () => {}
  });

  recorder.start({ snapshotIntervalMs: 10 });
  await scheduler.runNext();
  assert.equal(cycles, 1);
  recorder.stop("manual");
  assert.equal(scheduler.pending().length, 0);
  assert.equal(recorder.getState().status, "stopped");
});
