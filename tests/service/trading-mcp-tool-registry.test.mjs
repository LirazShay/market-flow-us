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
    async submitDecisionProposal(input) {
      calls.push(["submitDecisionProposal", input]);
      return Object.freeze({ accepted: true, proposal: Object.freeze({ ...input }) });
    }
  };
}

function byName(registry, name) {
  return registry.listTools().find((definition) => definition.name === name);
}

test("Trading MCP exposes only the minimal durable Trading Domain surface", () => {
  const registry = createTradingMcpToolRegistry({ domain: domainStub() });
  const names = registry.listTools().map((definition) => definition.name);

  assert.equal(TRADING_MCP_TOOL_REGISTRY_VERSION, "trading-mcp-tool-registry-v1");
  assert.equal(TRADING_MCP_DATA_BOUNDARY, "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS");
  assert.deepEqual(names, [
    "describe_trading_environment",
    "bootstrap_trading",
    "get_trading_run",
    "resume_trading_run",
    "get_trade_episode_bundle",
    "submit_decision_proposal"
  ]);

  for (const definition of registry.listTools()) {
    assert.equal(definition.inputSchema.type, "object", definition.name);
    assert.equal(definition.inputSchema.additionalProperties, false, definition.name);
  }

  const forbiddenAuthority = /(broker|credential|session|submit_order|reply_order|cancel_order|hard_risk|operator_controls|live_gate)/u;
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
  assert.equal(proposal.inputSchema.additionalProperties, false);
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
