import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { stopOwnedChild } from "../../replay-host/host.js";

function createFakeTimers() {
  let nextId = 0;
  const pending = new Map();

  return {
    pending,
    get createdCount() {
      return nextId;
    },
    setTimer(callback, ms) {
      const id = ++nextId;
      pending.set(id, { callback, ms });
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    fireNext() {
      const next = pending.entries().next();
      assert.equal(next.done, false, "expected a pending timer");
      const [id, timer] = next.value;
      pending.delete(id);
      timer.callback();
    }
  };
}

class FakeChild extends EventEmitter {
  constructor({ exitOnSignal, onKill } = {}) {
    super();
    this.exitCode = null;
    this.signalCode = null;
    this.killSignals = [];
    this.exitOnSignal = exitOnSignal ?? null;
    this.onKill = onKill ?? (() => {});
  }

  kill(signal) {
    this.killSignals.push(signal);
    this.onKill(signal);
    if (signal === this.exitOnSignal) {
      queueMicrotask(() => {
        this.exitCode = 0;
        this.emit("exit", 0, signal);
      });
    }
    return true;
  }
}

test("Replay Host cancels the losing stop timer when SIGTERM exits promptly", async () => {
  const timers = createFakeTimers();
  const child = new FakeChild({ exitOnSignal: "SIGTERM" });

  await stopOwnedChild(child, {
    setTimer: timers.setTimer.bind(timers),
    clearTimer: timers.clearTimer.bind(timers)
  });

  assert.deepEqual(child.killSignals, ["SIGTERM"]);
  assert.equal(timers.createdCount, 1, "stop must create the bounded SIGTERM wait");
  assert.equal(timers.pending.size, 0, "the losing timeout must be cancelled after child exit");
});

test("Replay Host cancels the second stop timer when SIGKILL exits promptly", async () => {
  const timers = createFakeTimers();
  let signalKillSent;
  const signalKill = new Promise((resolve) => {
    signalKillSent = resolve;
  });
  const child = new FakeChild({
    exitOnSignal: "SIGKILL",
    onKill(signal) {
      if (signal === "SIGKILL") signalKillSent();
    }
  });

  const stopped = stopOwnedChild(child, {
    setTimer: timers.setTimer.bind(timers),
    clearTimer: timers.clearTimer.bind(timers)
  });

  assert.deepEqual(child.killSignals, ["SIGTERM"]);
  assert.equal(timers.pending.size, 1);
  timers.fireNext();

  await signalKill;
  assert.deepEqual(child.killSignals, ["SIGTERM", "SIGKILL"]);

  await stopped;

  assert.equal(timers.createdCount, 2, "SIGKILL escalation must use a second bounded wait");
  assert.equal(timers.pending.size, 0, "the second losing timeout must be cancelled after child exit");
});
