#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import path from "node:path";

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createTradingDomainHttpClient } from "./domain-http-client.js";
import { createTradingMcpServer } from "./mcp-server.js";

export const TRADING_MCP_STDIO_VERSION = "market-flow-us-trading-mcp-stdio-v1";

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

export function tradingMcpErrorCode(error, fallback) {
  return typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)
    ? error.code
    : fallback;
}

function reportTradingMcpError(error, fallback) {
  process.stderr.write(`[market-flow-us-trading-mcp] ${tradingMcpErrorCode(error, fallback)}\n`);
}

function requiredEnvironmentValue(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) {
    const error = new Error(`${name} is required`);
    error.code = "TRADING_MCP_RUNTIME_NOT_CONFIGURED";
    throw error;
  }
  return value;
}

export function resolveTradingMcpRuntimeOptions(environment = process.env) {
  return Object.freeze({
    baseUrl: requiredEnvironmentValue(environment, "MARKET_FLOW_US_TRADING_DOMAIN_URL"),
    callerToken: requiredEnvironmentValue(environment, "MARKET_FLOW_US_TRADING_DOMAIN_TOKEN")
  });
}

export async function startTradingMcpStdio({
  environment = process.env,
  clientFactory = createTradingDomainHttpClient,
  serve = serveStdio
} = {}) {
  if (typeof clientFactory !== "function") throw new TypeError("clientFactory must be a function");
  if (typeof serve !== "function") throw new TypeError("serve must be a function");

  const domain = clientFactory(resolveTradingMcpRuntimeOptions(environment));
  const handle = serve(
    () => createTradingMcpServer({ domain }),
    {
      onerror(error) {
        reportTradingMcpError(error, "TRADING_MCP_TRANSPORT_ERROR");
      }
    }
  );

  let closePromise = null;
  const closeRuntime = () => {
    if (closePromise === null) {
      closePromise = Promise.resolve().then(() => handle.close());
    }
    return closePromise;
  };

  return Object.freeze({
    version: TRADING_MCP_STDIO_VERSION,
    close: closeRuntime
  });
}

async function main() {
  const runtime = await startTradingMcpStdio();
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await runtime.close();
    } catch (error) {
      reportTradingMcpError(error, "TRADING_MCP_SHUTDOWN_FAILED");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
  process.stdin.once("end", () => { void shutdown(); });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    reportTradingMcpError(error, "TRADING_MCP_STARTUP_FAILED");
    process.exitCode = 1;
  });
}
