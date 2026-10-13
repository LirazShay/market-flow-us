import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP_ENTRY = path.join(PROJECT_ROOT, "research-server", "mcp-stdio.js");
const REQUEST_TIMEOUT_MS = 10_000;
const EXIT_TIMEOUT_MS = 10_000;

function evaluationProfile() {
  return {
    selectionPolicy: "TOP_N",
    topX: 1,
    horizonsMs: [10_000, 60_000],
    intervalValue: 1,
    intervalUnit: "seconds",
    metricProfile: {
      contractVersion: "research-experiment-metrics-v1",
      primaryMetric: "positiveRate"
    }
  };
}

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-mcp-stdio-restart-proof-v1",
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
        (1, 'mcp-proof', 1, 'complete', 99900, 99990, 100000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'mcp-proof', 1, 'complete', 499900, 499990, 500000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'mcp-proof', 1, 'complete', 899900, 899990, 900000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'mcp-proof', 1, '1001', 0, 99900, 99980, 100000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-1', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}'),
        (2, 'mcp-proof', 1, '1001', 0, 499900, 499980, 500000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-2', 101, 1.0, 1100,
         '{"PaperId":"1001","ExtraSignal":8}'),
        (3, 'mcp-proof', 1, '1001', 0, 899900, 899980, 900000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-3', 102, 1.5, 1200,
         '{"PaperId":"1001","ExtraSignal":9}')
    `);
  } finally {
    await database.close();
  }
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref?.();
  });
}

function startMcpProcess({ ledgerPath, marketDataDir }) {
  const child = spawn(process.execPath, [MCP_ENTRY], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MARKET_FLOW_US_RESEARCH_LEDGER_PATH: ledgerPath,
      MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR: marketDataDir
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stdin.setDefaultEncoding("utf8");
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let nextId = 1;
  let stdoutBuffer = "";
  let stderr = "";
  const pending = new Map();

  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    while (true) {
      const newline = stdoutBuffer.indexOf("\n");
      if (newline < 0) break;
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/u, "");
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line.trim().length === 0) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id === undefined) continue;
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(`MCP JSON-RPC ${message.error.code}`));
      else waiter.resolve(message.result);
    }
  });

  child.on("exit", (code, signal) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP process exited before response: code=${code} signal=${signal}`));
    }
    pending.clear();
  });

  function write(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP request ${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      write({ jsonrpc: "2.0", id, method, params });
    });
  }

  function notify(method, params = {}) {
    write({ jsonrpc: "2.0", method, params });
  }

  async function initialize() {
    const result = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-mcp-proof", version: "1.0.0" }
    });
    assert.equal(result.serverInfo.name, "market-flow-us-research");
    notify("notifications/initialized");
    return result;
  }

  async function callTool(name, args = {}) {
    const result = await request("tools/call", { name, arguments: args });
    assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result.structuredContent)}`);
    assert.equal(result.structuredContent.toolName, name);
    assert.equal(result.structuredContent.dataBoundary, "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS");
    return result.structuredContent.data;
  }

  async function close() {
    if (!child.stdin.destroyed) child.stdin.end();
    const exit = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve({ code: child.exitCode, signal: child.signalCode });
        return;
      }
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const outcome = await Promise.race([exit, timeoutAfter(EXIT_TIMEOUT_MS, "MCP process exit")]);
    assert.equal(outcome.signal, null, stderr);
    assert.equal(outcome.code, 0, stderr);
    assert.equal(stderr, "", `MCP stderr must stay public-safe and empty on the happy path: ${stderr}`);
  }

  return Object.freeze({ initialize, callTool, close });
}

async function waitForSucceededJob(client, researchRunId, jobId) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const job = await client.callTool("get_job", { researchRunId, jobId });
    if (job.status === "SUCCEEDED") return job;
    if (["FAILED", "CANCELLED"].includes(job.status)) {
      throw new Error(`Research job ${jobId} ended as ${job.status}: ${JSON.stringify(job)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Research job ${jobId} did not succeed within the bounded poll window`);
}

test("TREE 11.6 real stdio MCP process resumes durable research and loads schema/evidence/results on demand after restart", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-mcp-stdio-proof-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  let first = null;
  let second = null;

  try {
    await seedMarketData(tempDir);
    const sourceFingerprint = await fingerprintResearchEvidenceSource({
      dataDir: tempDir,
      sourceId: "active"
    });

    first = startMcpProcess({ ledgerPath, marketDataDir: tempDir });
    await first.initialize();

    const firstEnvironment = await first.callTool("describe_research_environment");
    assert.equal(firstEnvironment.kind, "RESEARCH_ENVIRONMENT");
    assert.equal(firstEnvironment.data.security.hiddenChatStateRequired, false);
    assert.equal(firstEnvironment.data.domainSchemaVersions.jobs, 2);
    assert.equal(firstEnvironment.data.domainSchemaVersions.results, 1);

    const emptyBootstrap = await first.callTool("bootstrap_research");
    assert.equal(emptyBootstrap.data.action, "NEW_OBJECTIVE_REQUIRED");

    const run = await first.callTool("create_research_run", {
      userIntent: "Prove durable MCP restart and on-demand research access.",
      environmentSnapshot: { productVersion: "0.1.0", proof: "stdio-restart" },
      budgetPolicy: {}
    });
    const researchRunId = run.researchRunId;
    assert.match(researchRunId, /^run_[0-9a-f-]{36}$/u);

    const objective = await first.callTool("create_objective_version", {
      researchRunId,
      interpretationText: "Prefer positive short-horizon outcomes while preserving independent evidence.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10, 60] }
    });

    const inventory = await first.callTool("create_evidence_inventory", {
      researchRunId,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint,
          classification: "ACTIVE",
          schemaVersion: 4,
          firstCompleteAtMs: 100_000,
          lastCompleteAtMs: 900_000
        }]
      }
    });

    const proposal = await first.callTool("propose_evidence_plan", {
      researchRunId,
      objectiveVersionId: objective.objectiveVersionId,
      evidenceInventoryId: inventory.evidenceInventoryId,
      evaluationProfile: evaluationProfile()
    });
    assert.equal(proposal.status, "PROPOSED");

    const plan = await first.callTool("commit_evidence_plan", {
      researchRunId,
      objectiveVersionId: objective.objectiveVersionId,
      evidenceInventoryId: inventory.evidenceInventoryId,
      proposal
    });
    const developmentPartition = plan.partitions.find((partition) => partition.role === "DEVELOPMENT");
    assert.ok(developmentPartition, "server-owned plan must expose one Development partition");

    const submitted = await first.callTool("submit_development_research_sql", {
      clientRequestId: "mcp-stdio-restart-sql-1",
      researchRunId,
      partitionId: developmentPartition.partitionId,
      experimentIds: [],
      sql: "SELECT source_id, security_id, Price FROM research_history ORDER BY cycle_id, security_id",
      purpose: "PROFILE",
      outputMode: "PAGED_RESULT"
    });
    assert.match(submitted.analysisId, /^analysis_[0-9a-f-]{36}$/u);
    assert.match(submitted.jobId, /^job_[0-9a-f-]{36}$/u);

    const job = await waitForSucceededJob(first, researchRunId, submitted.jobId);
    assert.equal(job.progress.resultHandles.length, 1);
    const resultHandle = job.progress.resultHandles[0].resultHandle;

    const firstPage = await first.callTool("get_result_page", {
      researchRunId,
      resultHandle,
      page: { pageSize: 10 }
    });
    assert.ok(firstPage.rows.length >= 1, "Development Research SQL must expose bounded real rows on demand");
    assert.equal(firstPage.rows[0].security_id, "1001");

    await first.close();
    first = null;

    second = startMcpProcess({ ledgerPath, marketDataDir: tempDir });
    await second.initialize();

    const secondEnvironment = await second.callTool("describe_research_environment");
    assert.deepEqual(secondEnvironment.data.domainSchemaVersions, firstEnvironment.data.domainSchemaVersions);

    const resumed = await second.callTool("bootstrap_research", { researchRunId });
    assert.equal(resumed.data.action, "RESUMED");
    assert.equal(resumed.data.selection, "EXPLICIT_RESEARCH_RUN_ID");
    assert.equal(resumed.data.researchRunId, researchRunId);
    assert.equal(resumed.data.resume.run.researchRunId, researchRunId);
    assert.equal(resumed.data.resume.objective.objectiveVersionId, objective.objectiveVersionId);

    const resumedInventory = await second.callTool("get_evidence_inventory", {
      researchRunId,
      evidenceInventoryId: inventory.evidenceInventoryId
    });
    assert.equal(resumedInventory.inventory.sources[0].sourceId, "active");
    assert.equal(resumedInventory.inventory.sources[0].sourceFingerprint, sourceFingerprint);

    const resumedAnalysis = await second.callTool("get_analysis", {
      researchRunId,
      analysisId: submitted.analysisId
    });
    assert.equal(resumedAnalysis.status, "SUCCEEDED");
    assert.equal(resumedAnalysis.resultHandle, resultHandle);

    const resumedPage = await second.callTool("get_result_page", {
      researchRunId,
      resultHandle,
      page: { pageSize: 10 }
    });
    assert.deepEqual(resumedPage, firstPage);

    await second.close();
    second = null;
  } finally {
    if (first) await first.close().catch(() => undefined);
    if (second) await second.close().catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
});
