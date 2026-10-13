#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { openManagedResearchDomain } from "./managed-domain.js";
import { createResearchMcpServer } from "./mcp-server.js";
import { DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY } from "./runtime-policy.js";

export const RESEARCH_MCP_STDIO_VERSION = "market-flow-us-research-mcp-stdio-v1";

function optionalAbsolutePath(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError(`${label} must be an absolute path when provided`);
  }
  return path.normalize(value);
}

export function resolveResearchMcpRuntimeOptions(
  environment = process.env,
  moduleUrl = import.meta.url
) {
  const researchServerDir = path.dirname(fileURLToPath(moduleUrl));
  const projectRoot = path.resolve(researchServerDir, "..");
  const defaultDataDir = path.join(projectRoot, "data");

  return Object.freeze({
    dbPath: optionalAbsolutePath(
      environment.MARKET_FLOW_US_RESEARCH_LEDGER_PATH,
      path.join(defaultDataDir, "research-ledger.duckdb"),
      "MARKET_FLOW_US_RESEARCH_LEDGER_PATH"
    ),
    marketDataDir: optionalAbsolutePath(
      environment.MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR,
      defaultDataDir,
      "MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR"
    ),
    resourcePolicy: DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY
  });
}

export async function startResearchMcpStdio({
  environment = process.env,
  domainFactory = openManagedResearchDomain,
  serve = serveStdio
} = {}) {
  if (typeof domainFactory !== "function") throw new TypeError("domainFactory must be a function");
  if (typeof serve !== "function") throw new TypeError("serve must be a function");

  const domain = await domainFactory(resolveResearchMcpRuntimeOptions(environment));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await domain.close();
  };

  try {
    const handle = serve(
      () => createResearchMcpServer({ domain }),
      {
        onerror(error) {
          const code = typeof error?.code === "string" ? error.code : "RESEARCH_MCP_TRANSPORT_ERROR";
          process.stderr.write(`[market-flow-us-research-mcp] ${code}\n`);
        }
      }
    );

    return Object.freeze({
      version: RESEARCH_MCP_STDIO_VERSION,
      close: async () => {
        await handle.close();
        await close();
      }
    });
  } catch (error) {
    await close();
    throw error;
  }
}

async function main() {
  const runtime = await startResearchMcpStdio();
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await runtime.close();
    } finally {
      process.exitCode = 0;
    }
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const code = typeof error?.code === "string" ? error.code : "RESEARCH_MCP_STARTUP_FAILED";
    process.stderr.write(`[market-flow-us-research-mcp] ${code}\n`);
    process.exitCode = 1;
  });
}
