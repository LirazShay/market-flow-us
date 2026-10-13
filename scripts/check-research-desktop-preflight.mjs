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
const PROCESS_TREE_TERMINATION_TIMEOUT_MS = 5_000;
const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
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

export function researchDesktopPreflightErrorCode(
  error,
  fallback = "RESEARCH_DESKTOP_PREFLIGHT_FAILED"
) {
  return typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function setReportFailure(report, code) {
  if (report.result === "fail" && typeof report.error?.code === "string") return;
  report.result = "fail";
  report.error = { code };
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

export async function terminateProcessTree(
  child,
  {
    platform = process.platform,
    spawnProcess = spawn,
    timeoutMs = PROCESS_TREE_TERMINATION_TIMEOUT_MS
  } = {}
) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (platform !== "win32" || !Number.isInteger(child.pid)) {
    child.kill();
    return;
  }

  await new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let killer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve();
    };
    const fallbackKill = () => {
      try {
        child.kill();
      } catch {
        // Best-effort cleanup must not hide the original preflight result.
      }
    };
    const stopKiller = () => {
      try {
        if (killer && killer.exitCode === null && killer.signalCode === null) killer.kill();
      } catch {
        // The cleanup deadline is authoritative; do not replace the original failure.
      }
    };

    try {
      killer = spawnProcess(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true }
      );
    } catch {
      fallbackKill();
      finish();
      return;
    }

    killer.once("error", () => {
      fallbackKill();
      finish();
    });
    killer.once("exit", (code) => {
      if (code !== 0) fallbackKill();
      finish();
    });
    timer = setTimeout(() => {
      stopKiller();
      fallbackKill();
      finish();
    }, timeoutMs);
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

  let exitOutcome = null;
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exitOutcome = { code, signal };
      const prematureExit = Object.assign(
        new Error("RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_BEFORE_RESPONSE"),
        { code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_BEFORE_RESPONSE" }
      );
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(prematureExit);
      }
      pending.clear();
      resolve(exitOutcome);
    });
  });

  function write(message) {
    if (spawnFailure) throw spawnFailure;
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    if (spawnFailure) return Promise.reject(spawnFailure);
    if (exitOutcome) {
      return Promise.reject(Object.assign(
        new Error("RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_BEFORE_RESPONSE"),
        { code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_EXIT_BEFORE_RESPONSE" }
      ));
    }
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
    await terminateProcessTree(child);
  }
}

export async function finalizeResearchDesktopPreflightReport(
  report,
  {
    tempDir = null,
    reportPath = REPORT_PATH,
    removeDirectory = rm,
    makeDirectory = mkdir,
    writeReport = writeFile
  } = {}
) {
  if (tempDir) {
    try {
      await removeDirectory(tempDir, { recursive: true, force: true });
    } catch {
      setReportFailure(report, "RESEARCH_DESKTOP_PREFLIGHT_TEMP_CLEANUP_FAILED");
      process.exitCode = 1;
    }
  }

  try {
    await makeDirectory(path.dirname(reportPath), { recursive: true });
    await writeReport(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch {
    setReportFailure(report, "RESEARCH_DESKTOP_PREFLIGHT_REPORT_PERSIST_FAILED");
    process.exitCode = 1;
  }

  return report;
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
      code: researchDesktopPreflightErrorCode(error)
    };
    process.exitCode = 1;
  } finally {
    await finalizeResearchDesktopPreflightReport(report, { tempDir });
  }

  return report;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const report = await runResearchDesktopPreflight();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
