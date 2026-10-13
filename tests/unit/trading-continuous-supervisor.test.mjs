import assert from "node:assert/strict";
import { test } from "node:test";

import { createContinuousTradingSupervisor } from "../../trading-server/continuous-supervisor.js";

function supervisorState(lifecycleState, stateVersion) {
  return {
    tradingRunId: "run-1",
    tradeEpisodeId: "episode-1",
    policyVersionId: "policy-1",
    candidateKey: "AAPL",
    lifecycleState,
    stateVersion
  };
}

function manualScheduler() {
  const tasks = [];
  return {
    setTimeoutFn(fn, delayMs) {
      const task = { fn, delayMs, cancelled: false };
      tasks.push(task);
      return task;
    },
    clearTimeoutFn(task) {
      task.cancelled = true;
    },
    async runNext() {
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (task.cancelled) continue;
        await task.fn();
        return task.delayMs;
      }
      throw new Error("no scheduled Supervisor work");
    },
    get pendingCount() {
      return tasks.filter((task) => !task.cancelled).length;
    }
  };
}

test("TREE 12.4 a hung AI proposal times out to deterministic fallback without accumulating proposal calls", async () => {
  const scheduler = manualScheduler();
  let current = supervisorState("IDLE", 0);
  let proposalCalls = 0;
  let evaluateCalls = 0;
  let proposalStartedResolve;
  const proposalStarted = new Promise((resolve) => {
    proposalStartedResolve = resolve;
  });
  let capturedSignal = null;

  const runtime = {
    async restoreEpisode() {
      return {
        snapshot: {
          runtimeState: "ACTIVE",
          supervisorState: current
        },
        policyVersion: {
          policyVersionId: "policy-1",
          policy: { entry: { enabled: true } }
        }
      };
    },
    async startWatching() {
      current = supervisorState("WATCHING", 1);
      return { runtimeState: "ACTIVE", supervisorState: current };
    },
    async evaluateCycle(input) {
      evaluateCalls += 1;
      assert.equal(input.proposal, null);
      assert.equal(input.tradingRunId, "run-1");
      assert.equal(input.tradeEpisodeId, "episode-1");
      return { status: "DECIDED" };
    }
  };
  const ledger = {
    async getTradeEpisodeBundle() {
      return { orderReferences: [] };
    },
    async appendOrderReference() {
      throw new Error("reconciliation is not expected in this test");
    },
    async appendPositionState() {
      throw new Error("reconciliation is not expected in this test");
    }
  };
  const continuous = createContinuousTradingSupervisor({
    runtime,
    ledger,
    proposalTimeoutMs: 10,
    readDecisionProposal: async ({ signal }) => {
      proposalCalls += 1;
      capturedSignal = signal;
      proposalStartedResolve();
      return new Promise(() => {});
    },
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn
  });
  const handle = await continuous.start({
    tradingRunId: "run-1",
    tradeEpisodeId: "episode-1",
    instrument: { symbol: "AAPL" },
    intervalMs: 25
  });

  const firstCycle = scheduler.runNext();
  await proposalStarted;
  assert.equal(proposalCalls, 1);
  assert.equal(evaluateCalls, 0);
  assert.equal(scheduler.pendingCount, 1);
  assert.equal(await scheduler.runNext(), 10);
  await firstCycle;

  assert.equal(capturedSignal.aborted, true);
  assert.equal(handle.status.cyclesCompleted, 1);
  assert.equal(handle.status.lastStatus, "DECIDED");
  assert.equal(evaluateCalls, 1);
  assert.equal(proposalCalls, 1);
  assert.equal(scheduler.pendingCount, 1);

  assert.equal(await scheduler.runNext(), 25);
  assert.equal(handle.status.cyclesCompleted, 2);
  assert.equal(evaluateCalls, 2);
  assert.equal(proposalCalls, 1);
  assert.equal(scheduler.pendingCount, 1);

  handle.stop();
  await handle.done;
  assert.equal(handle.status.running, false);
  assert.equal(scheduler.pendingCount, 0);
});
