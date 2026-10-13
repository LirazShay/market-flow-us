import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";

const PROJECT_ROOT = path.resolve(".");
const MCP_ENTRY = path.join(PROJECT_ROOT, "research-server", "mcp-stdio.js");
const PREFLIGHT_ENTRY = path.join(PROJECT_ROOT, "scripts", "check-research-desktop-preflight.mjs");
const MCP_COMMAND = "market-flow-us-research-mcp";

async function seedMarketEvidence(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-desktop-preflight-proof-v1",
    now: () => 1_700_000_000_000
  });
  try {
    await database.writerConnection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'desktop-preflight', 1, 'complete', 99900, 99990, 100000, 90,
         1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await database.writerConnection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'desktop-preflight', 1, '1001', 0, 99900, 99980, 100000,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-1', 100, 0.5, 1000,
         '{"PaperId":"1001"}')
    `);
  } finally {
    await database.close();
  }
}

async function createPathLauncher(binDir) {
  await mkdir(binDir, { recursive: true });
  if (process.platform === "win32") {
    const launcher = path.join(binDir, `${MCP_COMMAND}.cmd`);
    await writeFile(
      launcher,
      `@echo off\r\n"${process.execPath}" "${MCP_ENTRY}" %*\r\n`,
      "utf8"
    );
    return launcher;
  }

  const launcher = path.join(binDir, MCP_COMMAND);
  await writeFile(
    launcher,
    `#!/bin/sh\nexec "${process.execPath}" "${MCP_ENTRY}" "$@"\n`,
    "utf8"
  );
  await chmod(launcher, 0o755);
  return launcher;
}

function restoreEnvironment(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test("TREE 11.8 target-machine preflight proves PATH-visible MCP prerequisites without claiming Desktop acceptance", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-desktop-preflight-proof-"));
  const dataDir = path.join(tempDir, "data");
  const binDir = path.join(tempDir, "bin");
  const reportPath = path.join(tempDir, "research-desktop-preflight.json");
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const previousPath = process.env[pathKey];
  const previousDataDir = process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR;
  const previousReport = process.env.MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT;

  try {
    await mkdir(dataDir, { recursive: true });
    await seedMarketEvidence(dataDir);
    await createPathLauncher(binDir);

    process.env[pathKey] = `${binDir}${path.delimiter}${previousPath ?? ""}`;
    process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR = dataDir;
    process.env.MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT = reportPath;

    const moduleUrl = pathToFileURL(PREFLIGHT_ENTRY);
    moduleUrl.searchParams.set("proof", String(Date.now()));
    const { runResearchDesktopPreflight } = await import(moduleUrl.href);
    const report = await runResearchDesktopPreflight();

    assert.equal(report.result, "pass");
    assert.deepEqual(report.repositoryContract, {
      marketplaceEntry: true,
      pluginManifest: true,
      mcpStdio: true,
      packageBin: true
    });
    assert.deepEqual(report.marketEvidence, {
      configuredOverride: true,
      sourceCount: 1,
      hasActive: true,
      archiveCount: 0,
      absolutePathRedacted: true
    });
    assert.equal(report.mcp.pathVisible, true);
    assert.equal(report.mcp.serverName, "market-flow-us-research");
    assert.equal(report.mcp.toolCount, 46);
    assert.equal(report.mcp.requiredToolsPresent, true);
    assert.equal(report.mcp.dataBoundary, true);
    assert.equal(report.desktopAcceptance, "STILL_REQUIRED");
    assert.equal(report.error, null);

    const persisted = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(persisted.result, "pass");
    assert.equal(persisted.desktopAcceptance, "STILL_REQUIRED");
    assert.equal(JSON.stringify(persisted).includes(tempDir), false, "preflight report must not expose local paths");
  } finally {
    restoreEnvironment(pathKey, previousPath);
    restoreEnvironment("MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR", previousDataDir);
    restoreEnvironment("MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT", previousReport);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.8 target-machine preflight rejects catalog-shaped files that are not usable Market Flow US DuckDB evidence", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-desktop-preflight-invalid-evidence-"));
  const dataDir = path.join(tempDir, "data");
  const reportPath = path.join(tempDir, "research-desktop-preflight.json");
  const previousDataDir = process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR;
  const previousReport = process.env.MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT;
  const previousExitCode = process.exitCode;

  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, "market-flow-us.duckdb"), "not-a-duckdb-database\n", "utf8");

    process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR = dataDir;
    process.env.MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT = reportPath;

    const moduleUrl = pathToFileURL(PREFLIGHT_ENTRY);
    moduleUrl.searchParams.set("invalid-evidence-proof", String(Date.now()));
    const { runResearchDesktopPreflight } = await import(moduleUrl.href);
    const report = await runResearchDesktopPreflight();

    assert.equal(report.result, "fail");
    assert.deepEqual(report.error, {
      code: "RESEARCH_DESKTOP_PREFLIGHT_MARKET_EVIDENCE_UNUSABLE"
    });
    assert.equal(report.marketEvidence, null);
    assert.equal(report.mcp, null, "MCP must not launch after market evidence validation fails");
    assert.equal(report.desktopAcceptance, "STILL_REQUIRED");

    const persisted = JSON.parse(await readFile(reportPath, "utf8"));
    assert.deepEqual(persisted.error, {
      code: "RESEARCH_DESKTOP_PREFLIGHT_MARKET_EVIDENCE_UNUSABLE"
    });
    assert.equal(JSON.stringify(persisted).includes(tempDir), false, "failure report must not expose local paths");
  } finally {
    process.exitCode = previousExitCode;
    restoreEnvironment("MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR", previousDataDir);
    restoreEnvironment("MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT", previousReport);
    await rm(tempDir, { recursive: true, force: true });
  }
});
