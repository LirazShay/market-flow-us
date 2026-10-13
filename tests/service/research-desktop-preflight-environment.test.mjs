import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { buildMcpProbeEnvironment } from "../../scripts/check-research-desktop-preflight.mjs";

function captureChildEnvironment(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        `process.stdout.write(JSON.stringify({
          secret: process.env.MARKET_FLOW_US_PREFLIGHT_SYNTHETIC_SECRET ?? null,
          nodeOptions: process.env.NODE_OPTIONS ?? null,
          marketDataDir: process.env.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR ?? null,
          ledgerPath: process.env.MARKET_FLOW_US_RESEARCH_LEDGER_PATH ?? null
        }))`
      ],
      {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code !== 0 || signal !== null) {
        reject(new Error(`child environment proof failed: code=${code} signal=${signal} stderr=${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

test("TREE 11.8 Desktop preflight MCP subprocess environment excludes parent secrets and NODE_OPTIONS", async () => {
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

  const observed = await captureChildEnvironment(environment);
  assert.deepEqual(observed, {
    secret: null,
    nodeOptions: null,
    marketDataDir,
    ledgerPath
  });
});
