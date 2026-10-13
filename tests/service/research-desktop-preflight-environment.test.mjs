import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { runBoundedCommand } from "../../scripts/acceptance-process.mjs";
import { buildMcpProbeEnvironment } from "../../scripts/check-research-desktop-preflight.mjs";

const CHILD_PROOF_TIMEOUT_MS = 5_000;

async function proveChildEnvironment(environment, { marketDataDir, ledgerPath }) {
  const expected = JSON.stringify({ marketDataDir, ledgerPath });
  const script = `
    const expected = ${expected};
    const valid =
      process.env.MARKET_FLOW_US_PREFLIGHT_SYNTHETIC_SECRET === undefined
      && process.env.NODE_OPTIONS === undefined
      && process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR === expected.marketDataDir
      && process.env.MARKET_FLOW_US_RESEARCH_LEDGER_PATH === expected.ledgerPath;
    if (!valid) process.exitCode = 1;
  `;

  return await runBoundedCommand(
    process.execPath,
    ["-e", script],
    {
      env: environment,
      timeoutMs: CHILD_PROOF_TIMEOUT_MS,
      maxOutputChars: 1024,
      stdout: null,
      stderr: null
    }
  );
}

test(
  "TREE 11.8 Desktop preflight MCP subprocess environment excludes parent secrets and NODE_OPTIONS",
  { timeout: 10_000 },
  async () => {
    const marketDataDir = path.resolve("data");
    const ledgerPath = path.resolve("test-results", "research-desktop-preflight-env-proof.duckdb");
    const environment = buildMcpProbeEnvironment(
      {
        ...process.env,
        MARKET_FLOW_US_PREFLIGHT_SYNTHETIC_SECRET: "must-not-reach-child",
        NODE_OPTIONS: "--require /definitely-not-present/market-flow-us-secret-hook.js"
      },
      { marketDataDir, ledgerPath }
    );

    const result = await proveChildEnvironment(environment, { marketDataDir, ledgerPath });
    assert.deepEqual(
      { code: result.code, signal: result.signal, error: result.error },
      { code: 0, signal: null, error: null }
    );
    assert.equal(result.output, "");
  }
);
