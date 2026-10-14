import assert from "node:assert/strict";
import test from "node:test";

import {
  TRADING_AI_ADAPTER_VERSION,
  TRADING_MCP_COMPATIBILITY_VERSION,
  createTradingAiAdapter
} from "../../trading-server/ai-adapter.js";

function run({
  tradingRunId,
  lifecycleState = "ACTIVE",
  mode = "SHADOW",
  policyVersionId = "pol-1",
  updatedAtMs = 1
}) {
  return Object.freeze({
    tradingRunId,
    lifecycleState,
    mode,
    policyVersionId,
    updatedAtMs
  });
}

function domainStub({ runs = [], resumes = new Map() } = {}) {
  const calls = [];
  return {
    calls,
    schemaVersions: Object.freeze({ tradingLedger: 1 }),
    async getTradingRun(tradingRunId) {
      calls.push(["getTradingRun", tradingRunId]);
      return runs.find((candidate) => candidate.tradingRunId === tradingRunId) ?? null;
    },
    async listTradingRuns(options) {
      calls.push(["listTradingRuns", options]);
      return runs;
    },
    async resumeTradingRun(tradingRunId) {
      calls.push(["resumeTradingRun", tradingRunId]);
      return resumes.get(tradingRunId) ?? Object.freeze({ tradingRunId, episodes: Object.freeze([]) });
    }
  };
}

test("Trading AI adapter advertises bounded durable learning authority rather than broker or promotion authority", () => {
  const adapter = createTradingAiAdapter({ domain: domainStub() });
  const environment = adapter.describeTradingEnvironment();

  assert.equal(TRADING_AI_ADAPTER_VERSION, "trading-ai-adapter-v1");
  assert.equal(TRADING_MCP_COMPATIBILITY_VERSION, "market-flow-us-trading-mcp-v2");
  assert.equal(environment.dataBoundary, "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS");
  assert.equal(environment.data.security.hiddenChatStateRequired, false);
  assert.equal(environment.data.security.rawBrokerAuthority, false);
  assert.equal(environment.data.security.hardRiskBypassAuthority, false);
  assert.equal(environment.data.security.liveGateBypassAuthority, false);
  assert.equal(environment.data.authority.tradingDomainOwns.includes("policy-attribution"), true);
  assert.equal(environment.data.authority.tradingDomainOwns.includes("policy-version-comparison"), true);
  assert.equal(environment.data.authority.tradingDomainOwns.includes("policy-candidate-construction"), true);
  assert.equal(environment.data.authority.policyPromotionViaMcp, false);
});

test("Trading bootstrap resumes the exact supplied durable TradingRun ID", async () => {
  const exact = run({ tradingRunId: "trun-exact", updatedAtMs: 9 });
  const other = run({ tradingRunId: "trun-other", updatedAtMs: 10 });
  const expectedResume = Object.freeze({
    tradingRunId: exact.tradingRunId,
    episodes: Object.freeze([{ tradeEpisodeId: "tep-1" }])
  });
  const domain = domainStub({
    runs: [other, exact],
    resumes: new Map([[exact.tradingRunId, expectedResume]])
  });
  const adapter = createTradingAiAdapter({ domain });

  const result = await adapter.bootstrapTrading({
    tradingRunId: exact.tradingRunId,
    continueExisting: true
  });

  assert.equal(result.data.action, "RESUMED");
  assert.equal(result.data.selection, "EXPLICIT_TRADING_RUN_ID");
  assert.equal(result.data.tradingRunId, exact.tradingRunId);
  assert.deepEqual(result.data.resume, expectedResume);
  assert.deepEqual(domain.calls, [
    ["getTradingRun", exact.tradingRunId],
    ["resumeTradingRun", exact.tradingRunId]
  ]);
});

test("Trading bootstrap never guesses among multiple resumable runs", async () => {
  const domain = domainStub({
    runs: [
      run({ tradingRunId: "trun-a", lifecycleState: "ACTIVE", updatedAtMs: 3 }),
      run({ tradingRunId: "trun-b", lifecycleState: "PAUSED", updatedAtMs: 4 }),
      run({ tradingRunId: "trun-done", lifecycleState: "COMPLETED", updatedAtMs: 5 })
    ]
  });
  const adapter = createTradingAiAdapter({ domain });

  const result = await adapter.bootstrapTrading({ continueExisting: true });

  assert.equal(result.data.action, "DISAMBIGUATION_REQUIRED");
  assert.deepEqual(
    result.data.candidates.map((candidate) => candidate.tradingRunId),
    ["trun-a", "trun-b"]
  );
  assert.equal(domain.calls.some(([name]) => name === "resumeTradingRun"), false);
});

test("Trading bootstrap auto-resumes only the sole resumable run on explicit continue intent", async () => {
  const active = run({ tradingRunId: "trun-only", lifecycleState: "ACTIVE" });
  const domain = domainStub({ runs: [active] });
  const adapter = createTradingAiAdapter({ domain });

  const result = await adapter.bootstrapTrading({ continueExisting: true });

  assert.equal(result.data.action, "RESUMED");
  assert.equal(result.data.selection, "SOLE_RESUMABLE_RUN");
  assert.equal(result.data.tradingRunId, active.tradingRunId);
  assert.deepEqual(domain.calls, [
    ["listTradingRuns", { limit: 200 }],
    ["resumeTradingRun", active.tradingRunId]
  ]);
});
