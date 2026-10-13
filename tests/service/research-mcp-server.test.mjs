import assert from "node:assert/strict";
import test from "node:test";

import { createResearchMcpServer } from "../../research-server/mcp-server.js";
import {
  DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY
} from "../../research-server/runtime-policy.js";
import {
  resolveResearchMcpRuntimeOptions,
  startResearchMcpStdio
} from "../../research-server/mcp-stdio.js";

function fakeDomain() {
  return {
    schemaVersions: Object.freeze({ ledger: 1, evidence: 1, experiments: 1, memory: 1, jobs: 2, results: 1 }),
    async getResearchRun() { return null; },
    async listResearchRuns() { return []; },
    async resumeResearchRun() { return null; }
  };
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

async function initializedServer() {
  const server = createResearchMcpServer({ domain: fakeDomain(), version: "test" });
  const transport = new MemoryTransport();
  await server.connect(transport);
  const initialized = await transport.request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-test", version: "1" }
    }
  });
  assert.equal(initialized.error, undefined);
  transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { server, transport };
}

test("TREE 11.6 MCP v2 server publishes the thin 45-tool registry and no unmanaged shortcuts", async () => {
  const { server, transport } = await initializedServer();
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result.tools.length, 45);
    const names = new Set(response.result.tools.map((tool) => tool.name));
    assert.ok(names.has("describe_research_environment"));
    assert.ok(names.has("submit_development_experiment"));
    assert.ok(names.has("submit_development_research_sql"));
    assert.ok(names.has("execute_holdout_evaluation"));
    assert.equal(names.has("execute_development_experiment"), false);
    assert.equal(names.has("open_development_research_sql"), false);
    assert.equal(names.has("create_evidence_plan"), false);
  } finally {
    await server.close();
  }
});

test("TREE 11.6 MCP v2 structured tool output preserves the domain-data boundary", async () => {
  const { server, transport } = await initializedServer();
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "describe_research_environment", arguments: {} }
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

test("TREE 11.6 MCP tool failures expose a bounded stable code instead of arbitrary exception text", async () => {
  const { server, transport } = await initializedServer();
  try {
    const response = await transport.request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_research_run",
        arguments: { userIntent: "test" }
      }
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, true);
    assert.equal(
      response.result.structuredContent.error.code,
      "RESEARCH_MCP_CAPABILITY_UNAVAILABLE"
    );
    assert.equal(JSON.stringify(response.result).includes("domain.createResearchRun"), false);
  } finally {
    await server.close();
  }
});

test("TREE 11.6 stdio runtime uses project-owned paths and the measured managed resource policy", async () => {
  const options = resolveResearchMcpRuntimeOptions({}, "file:///tmp/market-flow-us/research-server/mcp-stdio.js");
  assert.equal(options.dbPath, "/tmp/market-flow-us/data/research-ledger.duckdb");
  assert.equal(options.marketDataDir, "/tmp/market-flow-us/data");
  assert.equal(options.resourcePolicy, DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY);

  assert.throws(
    () => resolveResearchMcpRuntimeOptions({ MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR: "relative/data" }),
    /absolute path/u
  );
});

test("TREE 11.6 stdio launcher is lifecycle-only and closes the managed domain with the transport", async () => {
  const calls = [];
  const domain = {
    ...fakeDomain(),
    async close() { calls.push("domain.close"); }
  };
  let factory;
  const runtime = await startResearchMcpStdio({
    environment: {},
    domainFactory: async (options) => {
      calls.push(["domainFactory", options.resourcePolicy]);
      return domain;
    },
    serve: (serverFactory) => {
      factory = serverFactory;
      calls.push("serve");
      return { async close() { calls.push("transport.close"); } };
    }
  });

  const server = factory();
  assert.ok(server);
  await runtime.close();
  await runtime.close();
  assert.equal(calls[0][0], "domainFactory");
  assert.equal(calls[0][1], DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY);
  assert.deepEqual(calls.slice(1), ["serve", "transport.close", "domain.close"]);
});
