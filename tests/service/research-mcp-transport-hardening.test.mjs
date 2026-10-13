import assert from "node:assert/strict";
import test from "node:test";

import { createResearchMcpServer } from "../../research-server/mcp-server.js";

const RUN_ID = "run_11111111-1111-4111-8111-111111111111";
const PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const MAX_SQL_CHARS = 1024 * 1024;

class MemoryTransport {
  onclose;
  onerror;
  onmessage;
  #responses = new Map();

  async start() {}

  async send(message) {
    if (message?.id === undefined) return;
    const waiter = this.#responses.get(message.id);
    if (!waiter) return;
    this.#responses.delete(message.id);
    waiter(message);
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

function instrumentedDomain() {
  const calls = [];
  return {
    calls,
    schemaVersions: Object.freeze({ ledger: 1, evidence: 1, experiments: 1, memory: 1, jobs: 2, results: 1 }),
    async createResearchRun(input) {
      calls.push(["createResearchRun", input]);
      return { researchRunId: RUN_ID };
    },
    async createQueryArtifact(input) {
      calls.push(["createQueryArtifact", input]);
      return { researchRunId: input.researchRunId, queryArtifactId: "qry_11111111-1111-4111-8111-111111111111" };
    },
    async submitDevelopmentResearchSql(input) {
      calls.push(["submitDevelopmentResearchSql", input]);
      return {
        researchRunId: input.researchRunId,
        analysisId: "analysis_11111111-1111-4111-8111-111111111111",
        jobId: "job_11111111-1111-4111-8111-111111111111"
      };
    },
    async getResearchRun() {
      const error = Object.assign(
        new Error("private diagnostic canary /home/operator/private-ledger.duckdb"),
        { code: "private/path" }
      );
      throw error;
    },
    async listResearchRuns() { return []; },
    async resumeResearchRun() { return null; }
  };
}

async function initializedServer(domain) {
  const server = createResearchMcpServer({ domain, version: "test" });
  const transport = new MemoryTransport();
  await server.connect(transport);
  const initialized = await transport.request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-transport-hardening", version: "1" }
    }
  });
  assert.equal(initialized.error, undefined);
  transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
  return { server, transport };
}

async function callTool(transport, id, name, args) {
  return await transport.request({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args }
  });
}

function assertRejectedBeforeDomain(response, domain, before, canary = null) {
  assert.equal(domain.calls.length, before, "oversized MCP input must fail before Domain authority");
  assert.ok(
    response.error !== undefined || response.result?.isError === true,
    "oversized MCP input must produce a protocol/tool failure"
  );
  if (canary !== null) {
    assert.equal(JSON.stringify(response).includes(canary), false, "MCP validation failure must not echo attacker content");
  }
}

function experimentIds(count) {
  return Array.from({ length: count }, (_, index) => {
    const prefix = index.toString(16).padStart(8, "0");
    return `exp_${prefix}-1111-4111-8111-111111111111`;
  });
}

test("TREE 11.7 MCP rejects oversized bounded research inputs before Domain execution", async () => {
  const domain = instrumentedDomain();
  const { server, transport } = await initializedServer(domain);
  const canary = "PRIVATE_OVERSIZE_CANARY";

  try {
    let before = domain.calls.length;
    let response = await callTool(transport, 2, "create_research_run", {
      userIntent: `${"x".repeat(8192)}${canary}`
    });
    assertRejectedBeforeDomain(response, domain, before, canary);

    before = domain.calls.length;
    response = await callTool(transport, 3, "create_query_artifact", {
      researchRunId: RUN_ID,
      sqlText: `${"S".repeat(MAX_SQL_CHARS)}X`,
      scannerContractVersion: "scanner-v1"
    });
    assertRejectedBeforeDomain(response, domain, before);

    before = domain.calls.length;
    response = await callTool(transport, 4, "submit_development_research_sql", {
      clientRequestId: "mcp-oversized-sql",
      researchRunId: RUN_ID,
      partitionId: PARTITION_ID,
      experimentIds: [],
      sql: `${"S".repeat(MAX_SQL_CHARS)}X`,
      purpose: "PROFILE",
      outputMode: "PAGED_RESULT"
    });
    assertRejectedBeforeDomain(response, domain, before);

    before = domain.calls.length;
    response = await callTool(transport, 5, "submit_development_research_sql", {
      clientRequestId: "mcp-too-many-experiments",
      researchRunId: RUN_ID,
      partitionId: PARTITION_ID,
      experimentIds: experimentIds(21),
      sql: "SELECT 1",
      purpose: "PROFILE",
      outputMode: "PAGED_RESULT"
    });
    assertRejectedBeforeDomain(response, domain, before);
  } finally {
    await server.close();
  }
});

test("TREE 11.7 MCP tool failure surface never exposes arbitrary exception text or invalid error codes", async () => {
  const domain = instrumentedDomain();
  const { server, transport } = await initializedServer(domain);
  const privateCanary = "private diagnostic canary";

  try {
    const response = await callTool(transport, 6, "get_research_run", {
      researchRunId: RUN_ID
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, true);
    assert.equal(
      response.result.structuredContent.error.code,
      "RESEARCH_MCP_TOOL_FAILED"
    );
    const serialized = JSON.stringify(response.result);
    assert.equal(serialized.includes(privateCanary), false);
    assert.equal(serialized.includes("/home/operator/private-ledger.duckdb"), false);
    assert.equal(serialized.includes("private/path"), false);
  } finally {
    await server.close();
  }
});
