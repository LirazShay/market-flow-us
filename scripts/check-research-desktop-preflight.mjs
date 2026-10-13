import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { listBacktestEvidenceSources } from "../backtest-lab/source-catalog.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = process.env.MARKET_FLOW_US_RESEARCH_DESKTOP_PREFLIGHT_REPORT
  ?? path.join(PROJECT_ROOT, "test-results", "acceptance", "research-desktop-preflight.json");
const MCP_COMMAND = "market-flow-us-research-mcp";
const REQUEST_TIMEOUT_MS = 10_000;
const EXIT_TIMEOUT_MS = 10_000;
const REQUIRED_TOOLS = Object.freeze([
  "describe_research_environment",
  "bootstrap_research",
  "describe_research_schema",
  "submit_development_experiment",
  "submit_development_research_sql",
  "get_result_page",
  "execute_holdout_evaluation"
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

async function readJson(filePath, code) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    fail(code);
  }
}

export async function validateDesktopPluginRepositoryContract(projectRoot = PROJECT_ROOT) {
  const marketplace = await readJson(
    path.join(projectRoot, ".agents", "plugins", "marketplace.json"),
    "RESEARCH_DESKTOP_PREFLIGHT_MARKETPLACE_INVALID"
  );
  const plugin = await readJson(
    path.join(projectRoot, "plugins", "market-flow-us-researcher", "plugin.json"),
    "RESEARCH_DESKTOP_PREFLIGHT_PLUGIN_INVALID"
  );
  const mcp = await readJson(
    path.join(projectRoot, "plugins", "market-flow-us-researcher", "mcp.json"),
    "RESEARCH_DESKTOP_PREFLIGHT_MCP_INVALID"
  );
  const packageJson = await readJson(
    path.join(projectRoot, "package.json"),
    "RESEARCH_DESKTOP_PREFLIGHT_PACKAGE_INVALID"
  );

  const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = marketplacePlugins.find((candidate) => candidate?.name === "market-flow-us-researcher");
  if (!entry) fail("RESEARCH_DESKTOP_PREFLIGHT_MARKETPLACE_ENTRY_MISSING");
  if (entry.source?.source !== "local" || entry.source?.path !== "./plugins/market-flow-us-researcher") {
    fail("RESEARCH_DESKTOP_PREFLIGHT_MARKETPLACE_SOURCE_MISMATCH");
  }
  if (entry.policy?.installation !== "AVAILABLE") {
    fail("RESEARCH_DESKTOP_PREFLIGHT_MARKETPLACE_POLICY_MISMATCH");
  }
  if (plugin.name !== "market-flow-us-researcher") {
    fail("RESEARCH_DESKTOP_PREFLIGHT_PLUGIN_NAME_MISMATCH");
  }

  const server = mcp?.mcpServers?.market_flow_us_research;
  if (server?.type !== "stdio" || server?.command !== MCP_COMMAND) {
    fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_COMMAND_MISMATCH");
  }
  if (Object.hasOwn(server, "url")) {
    fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_NETWORK_ENDPOINT_UNEXPECTED");
  }
  if (packageJson?.bin?.[MCP_COMMAND] !== "research-server/mcp-stdio.js") {
    fail("RESEARCH_DESKTOP_PREFLIGHT_PACKAGE_BIN_MISMATCH");
  }

  return Object.freeze({
    marketplaceEntry: true,
    pluginManifest: true,
    mcpStdio: true,
    packageBin: true
  });
}

function timeoutPromise(ms, code) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(code), { code })), ms);
    timer.unref?.();
  });
}

function spawnPathVisibleMcp(environment) {
  const options = {
    cwd: PROJECT_ROOT,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"]
  };
  if (process.platform === "win32") {
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", MCP_COMMAND], options);
  }
  return spawn(MCP_COMMAND, [], options);
}

async function probePathVisibleMcp({ marketDataDir, ledgerPath }) {
  const started = performance.now();
  const child = spawnPathVisibleMcp({
    ...process.env,
    MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR: marketDataDir,
    MARKET_FLOW_US_RESEARCH_LEDGER_PATH: ledgerPath
  });

  child.stdin.setDefaultEncoding("utf8");
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";
  let stderrSeen = false;
  let spawnFailure = null;
  let nextId = 1;
  const pending = new Map();

  child.stdin.on("error", () => {});
  child.stderr.on("data", (chunk) => {
    if (String(chunk).trim().length > 0) stderrSeen = true;
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
      if (message.error) {
        waiter.reject(Object.assign(new Error("RESEARCH_DESKTOP_PREFLIGHT_MCP_RPC_ERROR"), {
          code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_RPC_ERROR"
        }));
      } else {
        waiter.resolve(message.result);
      }
    }
  });

  child.on("error", () => {
    spawnFailure = Object.assign(new Error("RESEARCH_DESKTOP_PREFLIGHT_MCP_NOT_ON_PATH"), {
      code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_NOT_ON_PATH"
    });
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(spawnFailure);
    }
    pending.clear();
  });

  function write(message) {
    if (spawnFailure) throw spawnFailure;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    if (spawnFailure) return Promise.reject(spawnFailure);
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error("RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT"), {
          code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT"
        }));
      }, REQUEST_TIMEOUT_MS);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer });
      try {
        write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  let exitOutcome = null;
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exitOutcome = { code, signal };
      resolve(exitOutcome);
    });
  });

  try {
    const initialized = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-desktop-preflight", version: "1.0.0" }
    });
    if (initialized?.serverInfo?.name !== "market-flow-us-research") {
      fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_SERVER_MISMATCH");
    }
    write({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

    const tools = await request("tools/list", {});
    const names = new Set((tools?.tools ?? []).map((tool) => tool.name));
    if (names.size !== 46 || REQUIRED_TOOLS.some((name) => !names.has(name))) {
      fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_TOOLSET_MISMATCH");
    }

    const environment = await request("tools/call", {
      name: "describe_research_environment",
      arguments: {}
    });
    if (environment?.isError === true) fail("RESEARCH_DESKTOP_PREFLIGHT_ENVIRONMENT_CALL_FAILED");
    if (environment?.structuredContent?.dataBoundary !== "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS") {
      fail("RESEARCH_DESKTOP_PREFLIGHT_DATA_BOUNDARY_MISSING");
    }

    child.stdin.end();
    const outcome = exitOutcome ?? await Promise.race([
      exitPromise,
      timeoutPromise(EXIT_TIMEOUT_MS, "RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_TIMEOUT")
    ]);
    if (outcome.code !== 0 || outcome.signal !== null) {
      fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_FAILED");
    }
    if (stderrSeen) fail("RESEARCH_DESKTOP_PREFLIGHT_MCP_STDERR_NOT_EMPTY");

    return Object.freeze({
      pathVisible: true,
      serverName: initialized.serverInfo.name,
      toolCount: names.size,
      requiredToolsPresent: true,
      dataBoundary: true,
      durationMs: Math.round((performance.now() - started) * 1000) / 1000
    });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

export async function runResearchDesktopPreflight() {
  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    gate: "TREE_11_8_W3_PREFLIGHT",
    result: "running",
    repositoryContract: null,
    marketEvidence: null,
    mcp: null,
    desktopAcceptance: "STILL_REQUIRED",
    error: null
  };

  let tempDir = null;
  try {
    report.repositoryContract = await validateDesktopPluginRepositoryContract();

    const configuredDataDir = process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR;
    const marketDataDir = configuredDataDir ?? path.join(PROJECT_ROOT, "data");
    if (!path.isAbsolute(marketDataDir)) {
      fail("RESEARCH_DESKTOP_PREFLIGHT_MARKET_DATA_DIR_NOT_ABSOLUTE");
    }
    const evidenceSources = await listBacktestEvidenceSources({ dataDir: marketDataDir });
    if (evidenceSources.length < 1) fail("RESEARCH_DESKTOP_PREFLIGHT_NO_MARKET_EVIDENCE");
    report.marketEvidence = {
      configuredOverride: Boolean(configuredDataDir),
      sourceCount: evidenceSources.length,
      hasActive: evidenceSources.some((source) => source.kind === "active"),
      archiveCount: evidenceSources.filter((source) => source.kind === "archive").length,
      absolutePathRedacted: true
    };

    tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-desktop-preflight-"));
    report.mcp = await probePathVisibleMcp({
      marketDataDir,
      ledgerPath: path.join(tempDir, "research-ledger.duckdb")
    });
    report.result = "pass";
  } catch (error) {
    report.result = "fail";
    report.error = {
      code: typeof error?.code === "string"
        ? error.code
        : "RESEARCH_DESKTOP_PREFLIGHT_FAILED"
    };
    process.exitCode = 1;
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const report = await runResearchDesktopPreflight();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
