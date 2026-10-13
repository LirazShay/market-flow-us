import assert from "node:assert/strict";
import test from "node:test";

import { createTradingMcpServer } from "../../trading-server/mcp-server.js";

function fakeDomain({ includeProposal = true } = {}) {
  const domain = {
    schemaVersions: Object.freeze({ tradingLedger: 1 }),
    async getTradingRun() { return null; },
    async listTradingRuns() { return []; },
    async resumeTradingRun() { return null; },
    async getTradeEpisodeBundle() { return null; }
  };
  if (includeProposal) {
    domain.submitDecisionProposal = async (input) => Object.freeze({ accepted: true, proposal: input });
  }
  return domain;
}

class MemoryTransport {
  onclose;
  onerror;
  onmessage;
  #responses = new Map();

  async start() {}

  async send(message) {
    if (message?.id !== undefined) {
      const waiter = this.#responses.get(message.id);
      if (waiter) {
        this.#responses.delete(message.id);
        waiter(message);
      }
    }
  }

  async close() {
    this.onclose?.();
  }

  async request(message) {
    const response = new Promise((resolve) => this.#responses.set(message.id, resolve));
    this.onmessage?.(message);
    return await response;
  }

  notify(message) {
    this.onmessage?.(message);
  }
}

async function initializedServer(domain = fakeDomain()) {
  const server = createTradingMcpServer({ domain, version: "test" });
  const transport = new MemoryTransport();
  await server.connect(transport);
  const initialized = await transport.request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-trading-test", version: "1" }
    }
  });
  assert.equal(initialized.error, undefined);
  transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { server, transport };
}

test("TREE 12.7 Trading MCP server publishes only the six bounded Trading Domain tools", async () => {
  const { server, transport } = await initializedServer();
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });

    assert.equal(response.error, undefined);
    assert.deepEqual(
      response.result.tools.map((tool) => tool.name),
      [
        "describe_trading_environment",
        "bootstrap_trading",
        "get_trading_run",
        "resume_trading_run",
        "get_trade_episode_bundle",
        "submit_decision_proposal"
      ]
    );
    const names = response.result.tools.map((tool) => tool.name).join("\n");
    assert.equal(/broker|credential|session|submit_order|hard_risk|live_gate/u.test(names), false);
  } finally {
    await server.close();
  }
});

test("TREE 12.7 Trading MCP structured output preserves the domain-data boundary", async () => {
  const { server, transport } = await initializedServer();
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "describe_trading_environment", arguments: {} }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, undefined);
    assert.equal(
      response.result.structuredContent.dataBoundary,
      "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS"
    );
    assert.equal(
      response.result.structuredContent.data.dataBoundary,
      "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS"
    );
  } finally {
    await server.close();
  }
});

test("TREE 12.7 Trading MCP failures expose only a stable bounded code", async () => {
  const { server, transport } = await initializedServer(fakeDomain({ includeProposal: false }));
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "submit_decision_proposal",
        arguments: {
          decisionType: "HOLD",
          tradingRunId: "trun-1",
          tradeEpisodeId: "tep-1",
          policyVersionId: "pol-1",
          observedStateVersion: 1
        }
      }
    });

    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.structuredContent.error.code,
      "TRADING_MCP_CAPABILITY_UNAVAILABLE"
    );
    assert.equal(JSON.stringify(response.result).includes("domain.submitDecisionProposal"), false);
  } finally {
    await server.close();
  }
});
