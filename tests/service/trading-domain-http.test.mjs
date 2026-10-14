import assert from "node:assert/strict";
import test from "node:test";

import {
  TRADING_DOMAIN_HOST,
  TRADING_DOMAIN_MAX_BODY_BYTES,
  startTradingDomainTransport
} from "../../trading-server/domain-http.js";
import { createTradingDomainHttpClient } from "../../trading-server/domain-http-client.js";

const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";

function fakeDomain() {
  const calls = [];
  return {
    calls,
    async getTradingRun(tradingRunId) {
      calls.push(["getTradingRun", tradingRunId]);
      return { tradingRunId, policyVersionId: POLICY_ID, lifecycleState: "ACTIVE" };
    },
    async listTradingRuns(options) {
      calls.push(["listTradingRuns", options]);
      return [{ tradingRunId: RUN_ID }];
    },
    async resumeTradingRun(tradingRunId) {
      calls.push(["resumeTradingRun", tradingRunId]);
      return { tradingRun: { tradingRunId }, episodes: [] };
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeBundle", tradingRunId, tradeEpisodeId]);
      return { episode: { tradingRunId, tradeEpisodeId } };
    },
    async getTradeEpisodeAttribution(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeAttribution", tradingRunId, tradeEpisodeId]);
      return { tradeEpisodeId, policyVersionId: POLICY_ID, layers: {} };
    },
    async comparePolicyVersions(input) {
      calls.push(["comparePolicyVersions", input]);
      return { evidenceRef: "policy-attribution-comparison:sha256:test" };
    },
    async buildPolicyCandidate(input) {
      calls.push(["buildPolicyCandidate", input]);
      return { candidate: { policyCandidateId: input.policyCandidateId } };
    },
    async submitDecisionProposal(input) {
      calls.push(["submitDecisionProposal", input]);
      return {
        submissionStatus: "QUEUED_FOR_SUPERVISOR_VALIDATION",
        tradingRunId: input.tradingRunId,
        tradeEpisodeId: input.tradeEpisodeId
      };
    }
  };
}

function proposal() {
  return {
    decisionType: "HOLD",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: 4
  };
}

function comparison() {
  return {
    baseline: { tradingRunId: "trun-a", tradeEpisodeIds: ["tep-a"] },
    candidate: { tradingRunId: "trun-b", tradeEpisodeIds: ["tep-b"] },
    minimumConclusiveEpisodes: 1
  };
}

async function withRuntime(fn) {
  const domain = fakeDomain();
  const runtime = await startTradingDomainTransport({ domain, port: 0 });
  try {
    assert.match(runtime.baseUrl, new RegExp(`^http://${TRADING_DOMAIN_HOST}:\\d+$`, "u"));
    await fn({ domain, runtime });
  } finally {
    await runtime.close();
  }
}

test("TREE 12.8 loopback client exposes bounded Trading Domain and policy-learning methods", async () => {
  await withRuntime(async ({ domain, runtime }) => {
    const client = createTradingDomainHttpClient({
      baseUrl: runtime.baseUrl,
      callerToken: runtime.callerToken
    });
    const comparisonInput = comparison();
    const candidateInput = {
      ...comparisonInput,
      policyCandidateId: "pcand-1",
      claimScope: "EXECUTION_ONLY",
      policy: {
        kind: "DETERMINISTIC_TRADING_POLICY_V1",
        entry: { enterOnUsableQuote: true, maxWatchMs: 30_000 },
        exit: { takeProfitBps: 100, stopLossBps: 50, maxHoldMs: 120_000 }
      }
    };

    assert.deepEqual(await client.listTradingRuns({ limit: 20 }), [{ tradingRunId: RUN_ID }]);
    assert.equal((await client.getTradingRun(RUN_ID)).tradingRunId, RUN_ID);
    assert.equal((await client.resumeTradingRun(RUN_ID)).tradingRun.tradingRunId, RUN_ID);
    assert.equal(
      (await client.getTradeEpisodeBundle(RUN_ID, EPISODE_ID)).episode.tradeEpisodeId,
      EPISODE_ID
    );
    assert.equal(
      (await client.getTradeEpisodeAttribution(RUN_ID, EPISODE_ID)).tradeEpisodeId,
      EPISODE_ID
    );
    assert.match(
      (await client.comparePolicyVersions(comparisonInput)).evidenceRef,
      /^policy-attribution-comparison:/u
    );
    assert.equal(
      (await client.buildPolicyCandidate(candidateInput)).candidate.policyCandidateId,
      "pcand-1"
    );
    assert.equal(
      (await client.submitDecisionProposal(proposal())).submissionStatus,
      "QUEUED_FOR_SUPERVISOR_VALIDATION"
    );

    assert.deepEqual(domain.calls, [
      ["listTradingRuns", { limit: 20 }],
      ["getTradingRun", RUN_ID],
      ["resumeTradingRun", RUN_ID],
      ["getTradeEpisodeBundle", RUN_ID, EPISODE_ID],
      ["getTradeEpisodeAttribution", RUN_ID, EPISODE_ID],
      ["comparePolicyVersions", comparisonInput],
      ["buildPolicyCandidate", candidateInput],
      ["submitDecisionProposal", proposal()]
    ]);
  });
});

test("TREE 12.7 Trading Domain transport rejects missing token, wrong token, and browser Origin", async () => {
  await withRuntime(async ({ domain, runtime }) => {
    const body = JSON.stringify({
      operation: "get_trading_run",
      input: { tradingRunId: RUN_ID }
    });

    for (const headers of [
      { "content-type": "application/json" },
      { Authorization: "Bearer wrong", "content-type": "application/json" },
      {
        Authorization: `Bearer ${runtime.callerToken}`,
        Origin: "https://attacker.example",
        "content-type": "application/json"
      }
    ]) {
      const response = await fetch(`${runtime.baseUrl}/domain`, {
        method: "POST",
        headers,
        body
      });
      assert.ok(response.status === 401 || response.status === 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.match((await response.json()).code, /LOCAL_CALLER_UNAUTHORIZED|BROWSER_ORIGIN_REJECTED/u);
    }

    assert.deepEqual(domain.calls, []);
  });
});

test("TREE 12.7 transport allow-list rejects arbitrary operations before Domain invocation", async () => {
  await withRuntime(async ({ domain, runtime }) => {
    const response = await fetch(`${runtime.baseUrl}/domain`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.callerToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ operation: "submit_order", input: {} })
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { code: "TRADING_DOMAIN_OPERATION_NOT_FOUND" });
    assert.deepEqual(domain.calls, []);
  });
});

test("TREE 12.7 transport bounds request size and exposes no CORS grant", async () => {
  await withRuntime(async ({ domain, runtime }) => {
    const oversized = JSON.stringify({
      operation: "submit_decision_proposal",
      input: { padding: "x".repeat(TRADING_DOMAIN_MAX_BODY_BYTES) }
    });
    assert.ok(Buffer.byteLength(oversized) > TRADING_DOMAIN_MAX_BODY_BYTES);

    const response = await fetch(`${runtime.baseUrl}/domain`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.callerToken}`,
        "content-type": "application/json"
      },
      body: oversized
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { code: "REQUEST_TOO_LARGE" });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(domain.calls, []);
  });
});

test("TREE 12.7 client refuses non-loopback endpoints before sending its caller token", () => {
  for (const baseUrl of [
    "https://127.0.0.1:8771",
    "http://localhost:8771",
    "http://example.com:8771",
    "http://user:password@127.0.0.1:8771"
  ]) {
    assert.throws(
      () => createTradingDomainHttpClient({ baseUrl, callerToken: "secret" }),
      /127\.0\.0\.1 loopback URL/u
    );
  }
});

test("TREE 12.7 closing MCP-facing transport does not close or mutate Trading Domain ownership", async () => {
  const domain = fakeDomain();
  let domainCloseCalls = 0;
  domain.close = async () => { domainCloseCalls += 1; };
  const runtime = await startTradingDomainTransport({ domain, port: 0 });

  await runtime.close();
  await runtime.close();

  assert.equal(domainCloseCalls, 0);
  assert.deepEqual(domain.calls, []);
});
