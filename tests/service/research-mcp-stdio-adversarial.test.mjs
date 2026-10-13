import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP_ENTRY = path.join(PROJECT_ROOT, "research-server", "mcp-stdio.js");
const REQUEST_TIMEOUT_MS = 10_000;
const EXIT_TIMEOUT_MS = 10_000;
const SAFE_STDERR_LINE = /^\[market-flow-us-research-mcp\] [A-Z][A-Z0-9_]{0,127}$/u;

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
  let stdout = "";
  let stdoutBuffer = "";
  let stderr = "";
  const pending = new Map();
  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
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
      if (message.id === undefined || message.id === null) continue;
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  child.on("exit", (code, signal) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`MCP process exited before response: code=${code} signal=${signal}`));
    }
    pending.clear();
  });

  function writeRaw(line) {
    child.stdin.write(`${line}\n`);
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
      writeRaw(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  function notify(method, params = {}) {
    writeRaw(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  async function initialize() {
    const response = await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "market-flow-us-stdio-adversarial", version: "1" }
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result.serverInfo.name, "market-flow-us-research");
    notify("notifications/initialized");
    return response.result;
  }

  async function awaitExit(label) {
    return await Promise.race([exit, timeoutAfter(EXIT_TIMEOUT_MS, label)]);
  }

  return Object.freeze({
    child,
    writeRaw,
    request,
    initialize,
    closeInput() {
      child.stdin.end();
      return awaitExit("MCP EOF shutdown");
    },
    terminate() {
      child.kill("SIGTERM");
      return awaitExit("MCP SIGTERM shutdown");
    },
    diagnostics() {
      return { stdout, stderr };
    }
  });
}

function assertPublicSafeDiagnostics({ stdout, stderr }, canary) {
  assert.equal(stdout.includes(canary), false, "stdio stdout must not echo malformed private canary input");
  assert.equal(stderr.includes(canary), false, "stdio stderr must not echo malformed private canary input");
  assert.equal(stderr.includes("/home/operator/private-ledger.duckdb"), false);
  for (const line of stderr.split(/\r?\n/u).filter(Boolean)) {
    assert.match(line, SAFE_STDERR_LINE, `unexpected stdio diagnostic: ${line}`);
  }
}

test("TREE 11.7 real stdio MCP survives malformed framing without leaking payload and exits cleanly on EOF", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-mcp-stdio-adversarial-"));
  const client = startMcpProcess({
    ledgerPath: path.join(tempDir, "research-ledger.duckdb"),
    marketDataDir: tempDir
  });
  const canary = "PRIVATE_STDIO_CANARY_/home/operator/private-ledger.duckdb";

  try {
    client.writeRaw(`{"jsonrpc":"2.0","id":999,"method":"${canary}"`);

    await client.initialize();
    const tools = await client.request("tools/list", {});
    assert.equal(tools.error, undefined);
    assert.equal(Array.isArray(tools.result.tools), true);
    assert.equal(tools.result.tools.length > 0, true);

    const outcome = await client.closeInput();
    assert.equal(outcome.signal, null);
    assert.equal(outcome.code, 0);
    assertPublicSafeDiagnostics(client.diagnostics(), canary);
  } finally {
    if (client.child.exitCode === null && client.child.signalCode === null) {
      client.child.kill("SIGKILL");
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 11.7 real stdio MCP owns SIGTERM shutdown and closes without signal death or private diagnostics", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-mcp-stdio-sigterm-"));
  const client = startMcpProcess({
    ledgerPath: path.join(tempDir, "research-ledger.duckdb"),
    marketDataDir: tempDir
  });
  const canary = "PRIVATE_STDIO_SIGTERM_CANARY";

  try {
    await client.initialize();
    const outcome = await client.terminate();
    assert.equal(outcome.signal, null);
    assert.equal(outcome.code, 0);
    assertPublicSafeDiagnostics(client.diagnostics(), canary);
  } finally {
    if (client.child.exitCode === null && client.child.signalCode === null) {
      client.child.kill("SIGKILL");
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});
