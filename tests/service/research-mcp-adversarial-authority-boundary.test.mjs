import assert from "node:assert/strict";
import test from "node:test";

import { createResearchMcpServer } from "../../research-server/mcp-server.js";

const RUN_A = "run_11111111-1111-4111-8111-111111111111";
const RUN_B = "run_22222222-2222-4222-8222-222222222222";
const PARTITION_A = "part_11111111-1111-4111-8111-111111111111";
const FINALIST_A = "finalist_11111111-1111-4111-8111-111111111111";
const OBJECTIVE_A = "obj_11111111-1111-4111-8111-111111111111";
const QUERY_A = "qry_11111111-1111-4111-8111-111111111111";

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
    schemaVersions: Object.freeze({ ledger: 1, evidence: 1, experiments: 1, memory: 1, jobs: 1, results: 1 }),
    async getResearchRun(researchRunId) {
      calls.push(["getResearchRun", researchRunId]);
      return { researchRunId, status: "ACTIVE", currentPhase: "DEVELOPMENT", userIntent: "research", updatedAtMs: 1 };
    },
    async listResearchRuns() { return []; },
    async resumeResearchRun() { return null; },
    async getPartition(researchRunId, partitionId) {
      calls.push(["getPartition", researchRunId, partitionId]);
      return null;
    },
    async getResultPage(researchRunId, resultHandle, page) {
      calls.push(["getResultPage", researchRunId, resultHandle, page]);
      return null;
    },
    async executeValidationExperiment(input) {
      calls.push(["executeValidationExperiment", input]);
      return { researchRunId: input.researchRunId };
    },
    async executeHoldoutEvaluation(input) {
      calls.push(["executeHoldoutEvaluation", input]);
      return { researchRunId: input.researchRunId, finalistSetId: input.finalistSetId };
    }
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
      clientInfo: { name: "market-flow-us-adversarial-test", version: "1" }
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

function assertRejectedBeforeDomain(response, calls, callCountBefore, secretCanary) {
  assert.equal(calls.length, callCountBefore, "invalid MCP input must fail before Domain authority");
  assert.ok(
    response.error !== undefined || response.result?.isError === true,
    "invalid MCP input must produce a protocol/tool failure"
  );
  assert.equal(JSON.stringify(response).includes(secretCanary), false, "schema failure must not echo attacker value");
}

test("TREE 11.7 MCP schema rejects authority-shaping fields before Domain and preserves exact run-scoped IDs", async () => {
  const domain = instrumentedDomain();
  const { server, transport } = await initializedServer(domain);
  const canary = "private-authority-canary-value";

  try {
    let before = domain.calls.length;
    let response = await callTool(transport, 2, "get_research_run", {
      researchRunId: RUN_A,
      filesystemPath: canary
    });
    assertRejectedBeforeDomain(response, domain.calls, before, canary);

    before = domain.calls.length;
    response = await callTool(transport, 3, "get_partition", {
      researchRunId: RUN_A
    });
    assertRejectedBeforeDomain(response, domain.calls, before, canary);

    before = domain.calls.length;
    response = await callTool(transport, 4, "execute_holdout_evaluation", {
      researchRunId: RUN_A,
      finalistSetId: FINALIST_A,
      partitionId: PARTITION_A,
      phase: canary
    });
    assertRejectedBeforeDomain(response, domain.calls, before, canary);

    before = domain.calls.length;
    response = await callTool(transport, 5, "execute_validation_experiment", {
      researchRunId: RUN_A,
      objectiveVersionId: OBJECTIVE_A,
      partitionId: PARTITION_A,
      sourceId: "source-day-1",
      queryArtifactIds: [QUERY_A],
      fromAtMs: 1000,
      toAtMs: 2000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [60_000],
      phase: canary
    });
    assertRejectedBeforeDomain(response, domain.calls, before, canary);

    before = domain.calls.length;
    response = await callTool(transport, 6, "get_result_page", {
      researchRunId: RUN_A,
      resultHandle: "res_11111111-1111-4111-8111-111111111111",
      page: { pageSize: "100" }
    });
    assertRejectedBeforeDomain(response, domain.calls, before, canary);

    response = await callTool(transport, 7, "get_partition", {
      researchRunId: RUN_B,
      partitionId: PARTITION_A
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, undefined);
    assert.deepEqual(domain.calls.at(-1), ["getPartition", RUN_B, PARTITION_A]);

    response = await callTool(transport, 8, "execute_holdout_evaluation", {
      researchRunId: RUN_B,
      finalistSetId: FINALIST_A
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, undefined);
    assert.deepEqual(domain.calls.at(-1), [
      "executeHoldoutEvaluation",
      { researchRunId: RUN_B, finalistSetId: FINALIST_A }
    ]);
  } finally {
    await server.close();
  }
});
