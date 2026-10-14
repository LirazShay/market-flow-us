import assert from "node:assert/strict";
import test from "node:test";

import {
  TRADING_MCP_DATA_BOUNDARY,
  TRADING_MCP_TOOL_REGISTRY_VERSION,
  createTradingMcpToolRegistry
} from "../../trading-server/mcp-tool-registry.js";

function domainStub() {
  const calls = [];
  return {
    calls,
    schemaVersions: Object.freeze({ tradingLedger: 1 }),
    async getTradingRun(tradingRunId) {
      calls.push(["getTradingRun", tradingRunId]);
      return Object.freeze({ tradingRunId, lifecycleState: "ACTIVE" });
    },
    async listTradingRuns(options) {
      calls.push(["listTradingRuns", options]);
      return Object.freeze([]);
    },
    async resumeTradingRun(tradingRunId) {
      calls.push(["resumeTradingRun", tradingRunId]);
      return Object.freeze({ tradingRunId, episodes: Object.freeze([]) });
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeBundle", tradingRunId, tradeEpisodeId]);
      return Object.freeze({
        episode: Object.freeze({ tradingRunId, tradeEpisodeId }),
        decisions: Object.freeze([]),
        orderReferences: Object.freeze([]),
        positionStates: Object.freeze([]),
        outcome: null
      });
    },
    async getTradeEpisodeAttribution(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeAttribution", tradingRunId, tradeEpisodeId]);
      return Object.freeze({ tradeEpisodeId, layers: Object.freeze({}) });
    },
    async comparePolicyVersions(input) {
      calls.push(["comparePolicyVersions", input]);
      return Object.freeze({ evidenceRef: "policy-attribution-comparison:sha256:test" });
    },
    async buildPolicyCandidate(input) {
      calls.push(["buildPolicyCandidate", input]);
      return Object.freeze({ candidate: Object.freeze({ policyCandidateId: input.policyCandidateId }) });
    },
    async submitDecisionProposal(input) {
      calls.push(["submitDecisionProposal", input]);
      return Object.freeze({ accepted: true, proposal: Object.freeze({ ...input }) });
    }
  };
}

function byName(registry, name) {
  return registry.listTools().find((definition) => definition.name === name);
}

function comparisonInput() {
  return Object.freeze({
    baseline: Object.freeze({ tradingRunId: "trun-a", tradeEpisodeIds: Object.freeze(["tep-a"]) }),
    candidate: Object.freeze({ tradingRunId: "trun-b", tradeEpisodeIds: Object.freeze(["tep-b"]) }),
    minimumConclusiveEpisodes: 1
  });
}

test("Trading MCP exposes the bounded durable Trading Domain and policy-learning surface", () => {
  const registry = createTradingMcpToolRegistry({ domain: domainStub() });
  const names = registry.listTools().map((definition) => definition.name);

  assert.equal(TRADING_MCP_TOOL_REGISTRY_VERSION, "trading-mcp-tool-registry-v2");
  assert.equal(TRADING_MCP_DATA_BOUNDARY, "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS");
  assert.deepEqual(names, [
    "describe_trading_environment",
    "bootstrap_trading",
    "get_trading_run",
    "resume_trading_run",
    "get_trade_episode_bundle",
    "get_trade_episode_attribution",
    "compare_policy_versions",
    "build_policy_candidate",
    "submit_decision_proposal"
  ]);

  for (const definition of registry.listTools()) {
    assert.equal(definition.inputSchema.type, "object", definition.name);
    assert.equal(definition.inputSchema.additionalProperties, false, definition.name);
  }

  const forbiddenAuthority = /(broker|credential|session|submit_order|reply_order|cancel_order|hard_risk|operator_controls|live_gate|promote_policy)/u;
  assert.equal(names.some((name) => forbiddenAuthority.test(name)), false);
});

test("DecisionProposal tool is strictly state/policy bound and enum limited", () => {
  const registry = createTradingMcpToolRegistry({ domain: domainStub() });
  const proposal = byName(registry, "submit_decision_proposal");

  assert.ok(proposal);
  assert.deepEqual([...proposal.inputSchema.required].sort(), [
    "decisionType",
    "observedStateVersion",
    "policyVersionId",
    "tradeEpisodeId",
    "tradingRunId"
  ]);
  assert.deepEqual(
    proposal.inputSchema.properties.decisionType.enum,
    ["ENTER", "SKIP", "SWITCH", "HOLD", "EXIT"]
  );
  assert.equal(proposal.inputSchema.properties.observedStateVersion.minimum, 0);
  assert.equal(proposal.inputSchema.properties.targetCandidateKey.maxLength, 512);
  assert.equal(proposal.inputSchema.required.includes("targetCandidateKey"), false);
  assert.equal(proposal.inputSchema.additionalProperties, false);
});

test("TREE 12.8 policy-learning tools keep exact bounded episode selectors and typed policy schema", () => {
  const registry = createTradingMcpToolRegistry({ domain: domainStub() });
  const compare = byName(registry, "compare_policy_versions");
  const build = byName(registry, "build_policy_candidate");

  assert.equal(compare.inputSchema.properties.baseline.properties.tradeEpisodeIds.maxItems, 25);
  assert.equal(compare.inputSchema.properties.baseline.properties.tradeEpisodeIds.uniqueItems, true);
  assert.equal(compare.inputSchema.properties.minimumConclusiveEpisodes.maximum, 10_000);
  assert.deepEqual(build.inputSchema.properties.claimScope.enum, ["EXECUTION_ONLY", "STRATEGY_LEVEL"]);
  assert.deepEqual(
    build.inputSchema.properties.policy.properties.kind.enum,
    ["DETERMINISTIC_TRADING_POLICY_V1"]
  );
  assert.equal(Object.hasOwn(build.inputSchema.properties, "learningEvidenceRefs"), false);
  assert.equal(Object.hasOwn(build.inputSchema.properties, "explicitPromotion"), false);
});

test("DecisionProposal MCP call delegates once to Trading Domain without broker mutation shortcut", async () => {
  const domain = domainStub();
  const registry = createTradingMcpToolRegistry({ domain });
  const input = Object.freeze({
    decisionType: "ENTER",
    tradingRunId: "trun-1",
    tradeEpisodeId: "tep-1",
    policyVersionId: "pol-1",
    observedStateVersion: 7
  });

  const result = await registry.callTool("submit_decision_proposal", input);

  assert.deepEqual(domain.calls, [["submitDecisionProposal", input]]);
  assert.equal(result.toolRegistryVersion, TRADING_MCP_TOOL_REGISTRY_VERSION);
  assert.equal(result.toolName, "submit_decision_proposal");
  assert.equal(result.dataBoundary, TRADING_MCP_DATA_BOUNDARY);
  assert.equal(result.data.accepted, true);
});

test("TREE 12.8 policy-learning MCP calls delegate only to Trading Domain", async () => {
  const domain = domainStub();
  const registry = createTradingMcpToolRegistry({ domain });
  const compareInput = comparisonInput();
  const candidateInput = Object.freeze({
    ...compareInput,
    policyCandidateId: "pcand-1",
    claimScope: "EXECUTION_ONLY",
    policy: Object.freeze({
      kind: "DETERMINISTIC_TRADING_POLICY_V1",
      entry: Object.freeze({ enterOnUsableQuote: true, maxWatchMs: 30_000 }),
      exit: Object.freeze({ takeProfitBps: 100, stopLossBps: 50, maxHoldMs: 120_000 })
    })
  });

  await registry.callTool("get_trade_episode_attribution", {
    tradingRunId: "trun-a",
    tradeEpisodeId: "tep-a"
  });
  await registry.callTool("compare_policy_versions", compareInput);
  await registry.callTool("build_policy_candidate", candidateInput);

  assert.deepEqual(domain.calls, [
    ["getTradeEpisodeAttribution", "trun-a", "tep-a"],
    ["comparePolicyVersions", compareInput],
    ["buildPolicyCandidate", candidateInput]
  ]);
});

test("SWITCH DecisionProposal preserves the bounded target candidate for Domain validation", async () => {
  const domain = domainStub();
  const registry = createTradingMcpToolRegistry({ domain });
  const input = Object.freeze({
    decisionType: "SWITCH",
    tradingRunId: "trun-1",
    tradeEpisodeId: "tep-1",
    policyVersionId: "pol-1",
    observedStateVersion: 7,
    targetCandidateKey: "NASDAQ:MSFT"
  });

  await registry.callTool("submit_decision_proposal", input);
  assert.deepEqual(domain.calls, [["submitDecisionProposal", input]]);
});

test("Episode inspection stays behind durable run/episode IDs", async () => {
  const domain = domainStub();
  const registry = createTradingMcpToolRegistry({ domain });

  const result = await registry.callTool("get_trade_episode_bundle", {
    tradingRunId: "trun-1",
    tradeEpisodeId: "tep-1"
  });

  assert.deepEqual(domain.calls, [["getTradeEpisodeBundle", "trun-1", "tep-1"]]);
  assert.equal(result.data.episode.tradingRunId, "trun-1");
  assert.equal(result.data.episode.tradeEpisodeId, "tep-1");
});
