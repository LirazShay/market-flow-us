import assert from "node:assert/strict";
import test from "node:test";

import { createRecorder } from "../../browser/recorder/recorder.js";

function candidateFailureScheduler() {
  let scheduled = null;
  return {
    schedule(callback, delayMs) {
      scheduled = { callback, delayMs };
      return scheduled;
    },
    cancelSchedule() {
      scheduled = null;
    },
    take() {
      const value = scheduled;
      scheduled = null;
      return value;
    }
  };
}

test("provider failure report crosses the Node boundary with a fixed sanitized descriptor only", async () => {
  const scheduler = candidateFailureScheduler();
  const failures = [];
  const privateMessage = "cookie=SENTINEL_COOKIE account=SENTINEL_ACCOUNT authorization=SENTINEL_AUTH";

  const recorder = createRecorder({
    collectCandidate: async () => {
      const error = new Error(privateMessage);
      Object.defineProperty(error, "marketFlowUsPhase", { value: "provider-fetch" });
      throw error;
    },
    acceptUniverse: async () => {},
    onCycle: async () => {},
    onFailure: async (failure) => failures.push(failure),
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancelSchedule,
    now: () => 1000
  });

  recorder.start({ snapshotIntervalMs: 3000 });
  const first = scheduler.take();
  assert.ok(first);
  assert.equal(first.delayMs, 0);
  await first.callback();
  recorder.stop("test_complete");

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0].error, {
    name: "ProviderSnapshotError",
    message: "Provider snapshot acquisition or validation failed."
  });

  const serializedFailure = JSON.stringify(failures[0]);
  for (const forbidden of ["SENTINEL_COOKIE", "SENTINEL_ACCOUNT", "SENTINEL_AUTH"] ) {
    assert.equal(serializedFailure.includes(forbidden), false, forbidden);
  }

  const localState = recorder.getState();
  assert.equal(localState.failedCycles, 1);
  assert.equal(localState.latestError.message, privateMessage);
});
