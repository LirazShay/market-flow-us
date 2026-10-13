import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openManagedResearchDomain } from "../../research-server/managed-domain.js";
import { createResearchMcpServer } from "../../research-server/mcp-server.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const RUN_ID = "run_88888888-8888-4888-8888-888888888888";
const OBJECTIVE_ID = "obj_88888888-8888-4888-8888-888888888888";
const QUERY_ID = "qry_88888888-8888-4888-8888-888888888888";
const INVENTORY_ID = "inv_88888888-8888-4888-8888-888888888888";
const PLAN_ID = "plan_88888888-8888-4888-8888-888888888888";
const PART_DEV = "part_88888888-8888-4888-8888-888888888888";
const PART_VALIDATION = "part_99999999-9999-4999-8999-999999999999";
const JOB_ID = "job_88888888-8888-4888-8888-888888888888";
const PRIVATE_CANARY = "PRIVATE_DIAGNOSTIC_CANARY";
const PRIVATE_ERROR_CODE = `Authorization: Bearer ${PRIVATE_CANARY}`;

const RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 4,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({ workUnits: 100, t0Evaluations: 1000, resultRows: 1000, resultBytes: 1_000_000 }),
    run: Object.freeze({ workUnits: 50, t0Evaluations: 500, resultRows: 500, resultBytes: 500_000 }),
    job: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    request: Object.freeze({ workUnits: 10, t0Evaluations: 100, resultRows: 100, resultBytes: 250_000 }),
    sqlAnalysis: Object.freeze({ workUnits: 5, t0Evaluations: 100, resultRows: 50, resultBytes: 100_000 })
  })
});

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

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-job-diagnostics-hardening-v1",
    now: () => 1_700_000_000_000
  });
  try {
    const writer = database.writerConnection;
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'diagnostic-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'diagnostic-seed', 1, 'complete', 11900, 11990, 12000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'diagnostic-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001"}'),
        (2, 'diagnostic-seed', 1, '1001', 0, 11900, 11980, 12000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-future', 101, 1.5, 1200,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

async function waitForTerminal(domain) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const job = await domain.getJob(RUN_ID, JOB_ID);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job?.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Job ${JOB_ID} did not reach a terminal state`);
}

async function readJobThroughMcp(domain) {
  const server = createResearchMcpServer({ domain, version: "test" });
  const transport = new MemoryTransport();
  await server.connect(transport);
  try {
    const initialized = await transport.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "market-flow-us-job-diagnostics-hardening", version: "1" }
      }
    });
    assert.equal(initialized.error, undefined);
    transport.notify({ jsonrpc: "2.0", method: "notifications/initialized" });

    const response = await transport.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_job",
        arguments: { researchRunId: RUN_ID, jobId: JOB_ID }
      }
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result?.isError, undefined);
    return response.result.structuredContent.data;
  } finally {
    await server.close();
  }
}

test("TREE 11.7 durable Job failure diagnostics reject unstable private error codes across Domain and MCP", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-job-diagnostics-hardening-"));
  const dbPath = path.join(tempDir, "research-ledger.duckdb");
  let domain = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    domain = await openManagedResearchDomain({
      dbPath,
      marketDataDir: tempDir,
      now: () => 1_870_000_000_000,
      resourcePolicy: RESOURCE_POLICY,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      queryArtifactIdFactory: () => QUERY_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION]),
      jobIdFactory: () => JOB_ID,
      executeExperimentBatch: async () => {
        const error = new Error(`private diagnostic /home/operator/private-ledger.duckdb ${PRIVATE_CANARY}`);
        error.code = PRIVATE_ERROR_CODE;
        throw error;
      }
    });

    await domain.createResearchRun({
      userIntent: "Prove public-safe durable job failure diagnostics.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Durable failure diagnostic proof.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createQueryArtifact({
      researchRunId: RUN_ID,
      sqlText: "SELECT security_id FROM latest ORDER BY security_id LIMIT 1",
      scannerContractVersion: "scanner-authority-v1",
      label: "diagnostic-proof"
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprint,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "job-diagnostics-proof-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    const submitted = await domain.submitDevelopmentExperiment({
      clientRequestId: "managed-job-diagnostics-1",
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      partitionId: PART_DEV,
      sourceId: "active",
      queryArtifactIds: [QUERY_ID],
      fromAtMs: 2_000,
      toAtMs: 2_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      topX: 1,
      horizonsMs: [10_000]
    });
    assert.equal(submitted.jobId, JOB_ID);

    const terminal = await waitForTerminal(domain);
    assert.equal(terminal.status, "FAILED");
    assert.equal(terminal.errorCode, "RESEARCH_JOB_FAILED");
    assert.equal(terminal.progress.failure.code, "RESEARCH_JOB_FAILED");
    const domainSerialized = JSON.stringify(terminal);
    assert.equal(domainSerialized.includes(PRIVATE_CANARY), false);
    assert.equal(domainSerialized.includes("/home/operator/private-ledger.duckdb"), false);
    assert.equal(domainSerialized.includes(PRIVATE_ERROR_CODE), false);

    const mcpJob = await readJobThroughMcp(domain);
    assert.equal(mcpJob.status, "FAILED");
    assert.equal(mcpJob.errorCode, "RESEARCH_JOB_FAILED");
    assert.equal(mcpJob.progress.failure.code, "RESEARCH_JOB_FAILED");
    const mcpSerialized = JSON.stringify(mcpJob);
    assert.equal(mcpSerialized.includes(PRIVATE_CANARY), false);
    assert.equal(mcpSerialized.includes("/home/operator/private-ledger.duckdb"), false);
    assert.equal(mcpSerialized.includes(PRIVATE_ERROR_CODE), false);
  } finally {
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
