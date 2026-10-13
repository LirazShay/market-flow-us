import assert from "node:assert/strict";
import test from "node:test";

import {
  TRADING_RUNTIME_HOST_VERSION,
  startTradingRuntimeHost
} from "../../trading-server/runtime-host.js";

const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";

function ledgerStub() {
  const run = Object.freeze({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    lifecycleState: "ACTIVE",
    updatedAtMs: 10
  });
  const episode = Object.freeze({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    lifecycleState: "ACTIVE",
    candidateKey: "NASDAQ:AAPL",
    updatedAtMs: 11
  });
  return {
    schemaVersion: 1,
    async getTradingRun(tradingRunId) {
      return tradingRunId === RUN_ID ? run : null;
    },
    async listTradingRuns() {
      return Object.freeze([run]);
    },
    async listTradeEpisodes(tradingRunId) {
      return tradingRunId === RUN_ID ? Object.freeze([episode]) : Object.freeze([]);
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      if (tradingRunId !== RUN_ID || tradeEpisodeId !== EPISODE_ID) return null;
      return Object.freeze({
        episode,
        observations: Object.freeze([]),
        decisions: Object.freeze([]),
        orderReferences: Object.freeze([]),
        positionStates: Object.freeze([]),
        outcome: null
      });
    },
    async appendOrderReference() {
      throw new Error("runtime-host proof must not enter reconciliation mutation");
    },
    async appendPositionState() {
      throw new Error("runtime-host proof must not enter reconciliation mutation");
    }
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
      throw new Error("no scheduled task");
    },
    get pendingCount() {
      return tasks.filter((task) => !task.cancelled).length;
    }
  };
}

function supervisorRuntimeStub(calls) {
  const state = Object.freeze({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    candidateKey: "NASDAQ:AAPL",
    lifecycleState: "WATCHING",
    stateVersion: 4
  });
  return {
    async restoreEpisode({ tradingRunId, tradeEpisodeId }) {
      calls.push(["restoreEpisode", tradingRunId, tradeEpisodeId]);
      return Object.freeze({
        policyVersion: Object.freeze({ policyVersionId: POLICY_ID, policy: {} }),
        snapshot: Object.freeze({
          runtimeState: "ACTIVE",
          supervisorState: state
        })
      });
    },
    async startWatching() {
      throw new Error("WATCHING state must not be restarted");
    },
    async evaluateCycle(input) {
      calls.push(["evaluateCycle", input.proposal]);
      return Object.freeze({ status: "DECIDED" });
    }
  };
}

function proposal() {
  return Object.freeze({
    decisionType: "HOLD",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: 4
  });
}

test("TREE 12.7 runtime host delivers one MCP proposal to Supervisor and keeps fallback alive after MCP transport loss", async () => {
  const calls = [];
  const scheduler = manualScheduler();
  let transportCloseCalls = 0;
  let transportedDomain = null;
  const host = await startTradingRuntimeHost({
    ledger: ledgerStub(),
    supervisorRuntime: supervisorRuntimeStub(calls),
    proposalTimeoutMs: 100,
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    transportFactory: async ({ domain }) => {
      transportedDomain = domain;
      return Object.freeze({
        baseUrl: "http://127.0.0.1:8771",
        callerToken: "ephemeral-test-token",
        async close() { transportCloseCalls += 1; }
      });
    }
  });

  assert.equal(host.version, TRADING_RUNTIME_HOST_VERSION);
  assert.equal(transportedDomain, host.domain);
  assert.deepEqual(host.mcpEnvironment(), {
    MARKET_FLOW_US_TRADING_DOMAIN_URL: "http://127.0.0.1:8771",
    MARKET_FLOW_US_TRADING_DOMAIN_TOKEN: "ephemeral-test-token"
  });

  const handle = await host.startEpisode({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    instrument: Object.freeze({ symbol: "AAPL" }),
    intervalMs: 25
  });
  await host.domain.submitDecisionProposal(proposal());

  assert.equal(await scheduler.runNext(), 0);
  const firstEvaluation = calls.find((entry) => entry[0] === "evaluateCycle");
  assert.deepEqual(firstEvaluation, ["evaluateCycle", proposal()]);
  assert.equal(handle.status.cyclesCompleted, 1);
  assert.equal(handle.status.running, true);

  await host.closeMcpTransport();
  assert.equal(transportCloseCalls, 1);
  assert.equal(handle.status.running, true, "MCP transport loss must not stop Supervisor ownership");

  assert.equal(await scheduler.runNext(), 25);
  const evaluations = calls.filter((entry) => entry[0] === "evaluateCycle");
  assert.equal(evaluations.length, 2);
  assert.deepEqual(evaluations[1], ["evaluateCycle", null]);
  assert.equal(handle.status.cyclesCompleted, 2);
  assert.equal(handle.status.running, true);

  await host.close();
  assert.equal(handle.status.running, false);
  assert.equal(transportCloseCalls, 1, "host close must memoize already-closed MCP transport");
  assert.equal(scheduler.pendingCount, 0);
});

test("TREE 12.7 runtime host owns only its loop and MCP transport, not the injected ledger lifecycle", async () => {
  const scheduler = manualScheduler();
  let ledgerCloseCalls = 0;
  const ledger = ledgerStub();
  ledger.close = async () => { ledgerCloseCalls += 1; };
  let transportCloseCalls = 0;

  const host = await startTradingRuntimeHost({
    ledger,
    supervisorRuntime: supervisorRuntimeStub([]),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    transportFactory: async () => Object.freeze({
      baseUrl: "http://127.0.0.1:8771",
      callerToken: "ephemeral-test-token",
      async close() { transportCloseCalls += 1; }
    })
  });

  await host.close();
  await host.close();

  assert.equal(transportCloseCalls, 1);
  assert.equal(ledgerCloseCalls, 0, "composition host must not close injected durable authority");
});
