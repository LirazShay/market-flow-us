import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  finalizeResearchDesktopPreflightReport,
  parseMcpStdoutMessage,
  researchDesktopPreflightErrorCode,
  splitMcpStdoutFrames,
  terminateProcessTree,
  validateDesktopPluginRepositoryContract,
  validateMcpInitializeResult,
  validateMcpResponseEnvelope,
  validateMcpToolList,
  waitForMcpProcessClose
} from "../../scripts/check-research-desktop-preflight.mjs";

test("TREE 11.8 Desktop preflight validates repo marketplace, plugin and PATH executable contract", async () => {
  assert.deepEqual(
    await validateDesktopPluginRepositoryContract(),
    {
      marketplaceEntry: true,
      pluginManifest: true,
      mcpStdio: true,
      packageBin: true
    }
  );
});

test("TREE 11.8 Desktop preflight exports only owned stable public error codes", () => {
  assert.equal(
    researchDesktopPreflightErrorCode({ code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT" }),
    "RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT"
  );
  assert.equal(
    researchDesktopPreflightErrorCode({ code: "EACCES" }),
    "RESEARCH_DESKTOP_PREFLIGHT_FAILED"
  );
  assert.equal(
    researchDesktopPreflightErrorCode({ code: "C:\\Users\\Private\\market-data.duckdb" }),
    "RESEARCH_DESKTOP_PREFLIGHT_FAILED"
  );
});

test("TREE 11.8 Desktop preflight requires the exact MCP protocol version", () => {
  assert.equal(
    validateMcpInitializeResult({
      protocolVersion: "2025-06-18",
      serverInfo: { name: "market-flow-us-research" }
    }).protocolVersion,
    "2025-06-18"
  );

  assert.throws(
    () => validateMcpInitializeResult({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "market-flow-us-research" }
    }),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_PROTOCOL_MISMATCH"
  );
});

test("TREE 11.8 Desktop preflight rejects duplicate or malformed MCP tool entries", () => {
  const required = [
    "describe_research_environment",
    "bootstrap_research",
    "describe_research_schema",
    "submit_development_experiment",
    "submit_development_research_sql",
    "get_result_page",
    "execute_holdout_evaluation"
  ];
  const validNames = [
    ...required,
    ...Array.from({ length: 39 }, (_, index) => `tool_${index + 1}`)
  ];
  assert.equal(validateMcpToolList({ tools: validNames.map((name) => ({ name })) }).size, 46);

  const duplicateDisguisedAsFortySixUnique = [
    ...validNames,
    { name: validNames[0] }
  ];
  assert.throws(
    () => validateMcpToolList({
      tools: duplicateDisguisedAsFortySixUnique.map((entry) => (
        typeof entry === "string" ? { name: entry } : entry
      ))
    }),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_TOOLSET_MISMATCH"
  );

  assert.throws(
    () => validateMcpToolList({
      tools: validNames.map((name, index) => index === 45 ? { name: "" } : { name })
    }),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_TOOLSET_MISMATCH"
  );
});

test("TREE 11.8 Desktop preflight bounds MCP stdout frames and incomplete buffers", () => {
  const framed = splitMcpStdoutFrames(
    "",
    '{"jsonrpc":"2.0","id":1,"result":{}}\r\npartial',
    128
  );
  assert.deepEqual(framed.lines, ['{"jsonrpc":"2.0","id":1,"result":{}}']);
  assert.equal(framed.remainder, "partial");

  assert.throws(
    () => splitMcpStdoutFrames("", "x".repeat(9), 8),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_STDOUT_FRAME_TOO_LARGE"
  );
  assert.throws(
    () => splitMcpStdoutFrames("", `${"x".repeat(9)}\n`, 8),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_STDOUT_FRAME_TOO_LARGE"
  );
});

test("TREE 11.8 Desktop preflight rejects malformed JSON-RPC response envelopes", () => {
  assert.deepEqual(
    validateMcpResponseEnvelope(parseMcpStdoutMessage('{"jsonrpc":"2.0","id":1,"result":{}}')),
    { jsonrpc: "2.0", id: 1, result: {} }
  );

  assert.throws(
    () => parseMcpStdoutMessage("not-json"),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_PROTOCOL_MALFORMED"
  );
  assert.throws(
    () => validateMcpResponseEnvelope({ jsonrpc: "1.0", id: 1, result: {} }),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_PROTOCOL_MALFORMED"
  );
  assert.throws(
    () => validateMcpResponseEnvelope({ jsonrpc: "2.0", id: 1, result: {}, error: {} }),
    (error) => error?.code === "RESEARCH_DESKTOP_PREFLIGHT_MCP_PROTOCOL_MALFORMED"
  );
});

test("TREE 11.8 Desktop preflight waits for process close after exit before accepting shutdown", async () => {
  const child = new EventEmitter();
  const closed = waitForMcpProcessClose(child);
  let settled = false;
  void closed.then(() => {
    settled = true;
  });

  child.emit("exit", 0, null);
  await Promise.resolve();
  assert.equal(settled, false, "exit alone must not certify that stdout/stderr have closed");

  child.emit("close", 0, null);
  assert.deepEqual(await closed, { code: 0, signal: null });
  assert.equal(settled, true);
});

test("TREE 11.8 Desktop preflight terminates the full Windows launcher process tree", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };
  const killer = new EventEmitter();
  let invocation = null;

  const cleanup = terminateProcessTree(child, {
    platform: "win32",
    spawnProcess(command, args, options) {
      invocation = { command, args, options };
      queueMicrotask(() => killer.emit("exit", 0, null));
      return killer;
    }
  });

  await cleanup;

  assert.deepEqual(invocation, {
    command: "taskkill",
    args: ["/PID", "4321", "/T", "/F"],
    options: { stdio: "ignore", windowsHide: true }
  });
  assert.equal(child.killCalls, 0, "successful taskkill tree cleanup must not fall back to shell-only kill");
});

test("TREE 11.8 Desktop preflight bounds a hung Windows taskkill and falls back without hanging", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };
  const killer = Object.assign(new EventEmitter(), {
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  });

  await terminateProcessTree(child, {
    platform: "win32",
    timeoutMs: 5,
    spawnProcess() {
      return killer;
    }
  });

  assert.equal(killer.killCalls, 1, "hung taskkill helper must be terminated at the cleanup deadline");
  assert.equal(child.killCalls, 1, "cleanup timeout must fall back to best-effort direct child termination");
});

test("TREE 11.8 Desktop preflight keeps direct child cleanup on non-Windows platforms", async () => {
  const child = {
    pid: 4321,
    exitCode: null,
    signalCode: null,
    killCalls: 0,
    kill() {
      this.killCalls += 1;
    }
  };

  await terminateProcessTree(child, {
    platform: "linux",
    spawnProcess() {
      assert.fail("non-Windows cleanup must not invoke taskkill");
    }
  });

  assert.equal(child.killCalls, 1);
});

test("TREE 11.8 Desktop preflight converts temp cleanup failure to a public-safe persisted code", async () => {
  const previousExitCode = process.exitCode;
  const privatePath = "C:\\Users\\Private\\market-flow-us-desktop-preflight-secret";
  const report = { result: "pass", error: null };
  let persisted = null;

  try {
    await finalizeResearchDesktopPreflightReport(report, {
      tempDir: privatePath,
      reportPath: "/public-safe/report.json",
      async removeDirectory() {
        const error = new Error(`cannot remove ${privatePath}`);
        error.code = "EACCES";
        throw error;
      },
      async makeDirectory() {},
      async writeReport(_filePath, content) {
        persisted = content;
      }
    });

    assert.equal(report.result, "fail");
    assert.deepEqual(report.error, { code: "RESEARCH_DESKTOP_PREFLIGHT_TEMP_CLEANUP_FAILED" });
    assert.equal(persisted.includes(privatePath), false, "persisted failure must not expose temp paths");
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("TREE 11.8 Desktop preflight preserves the primary failure when cleanup also fails", async () => {
  const previousExitCode = process.exitCode;
  const privatePath = "C:\\Users\\Private\\secondary-cleanup-secret";
  const report = {
    result: "fail",
    error: { code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT" }
  };
  let persisted = null;

  try {
    await finalizeResearchDesktopPreflightReport(report, {
      tempDir: privatePath,
      reportPath: "/public-safe/report.json",
      async removeDirectory() {
        throw new Error(`secondary cleanup failure at ${privatePath}`);
      },
      async makeDirectory() {},
      async writeReport(_filePath, content) {
        persisted = content;
      }
    });

    assert.deepEqual(report.error, { code: "RESEARCH_DESKTOP_PREFLIGHT_MCP_REQUEST_TIMEOUT" });
    assert.equal(persisted.includes(privatePath), false, "secondary cleanup detail must stay out of the report");
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("TREE 11.8 Desktop preflight converts report persistence failure to a stable public-safe result", async () => {
  const previousExitCode = process.exitCode;
  const privatePath = "C:\\Users\\Private\\acceptance\\report.json";
  const report = { result: "pass", error: null };

  try {
    await finalizeResearchDesktopPreflightReport(report, {
      reportPath: privatePath,
      async makeDirectory() {
        const error = new Error(`access denied: ${privatePath}`);
        error.code = "EACCES";
        throw error;
      },
      async writeReport() {
        assert.fail("writeReport must not run after directory creation fails");
      }
    });

    assert.equal(report.result, "fail");
    assert.deepEqual(report.error, { code: "RESEARCH_DESKTOP_PREFLIGHT_REPORT_PERSIST_FAILED" });
    assert.equal(JSON.stringify(report).includes(privatePath), false, "returned report must not expose persistence paths");
  } finally {
    process.exitCode = previousExitCode;
  }
});
