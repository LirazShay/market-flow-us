import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTradingMcpRuntimeOptions,
  startTradingMcpStdio,
  tradingMcpErrorCode
} from "../../trading-server/mcp-stdio.js";

const BASE_URL = "http://127.0.0.1:8771";
const TOKEN = "ephemeral-test-token";

function configuredEnvironment() {
  return {
    MARKET_FLOW_US_TRADING_DOMAIN_URL: BASE_URL,
    MARKET_FLOW_US_TRADING_DOMAIN_TOKEN: TOKEN
  };
}

test("TREE 12.7 Trading MCP stdio requires explicit runtime URL and ephemeral caller token", () => {
  assert.deepEqual(resolveTradingMcpRuntimeOptions(configuredEnvironment()), {
    baseUrl: BASE_URL,
    callerToken: TOKEN
  });

  for (const environment of [
    {},
    { MARKET_FLOW_US_TRADING_DOMAIN_URL: BASE_URL },
    { MARKET_FLOW_US_TRADING_DOMAIN_TOKEN: TOKEN }
  ]) {
    assert.throws(
      () => resolveTradingMcpRuntimeOptions(environment),
      (error) => error?.code === "TRADING_MCP_RUNTIME_NOT_CONFIGURED"
    );
  }
});

test("TREE 12.7 stdio lifecycle creates only a Trading Domain client and closes only the transport", async () => {
  const calls = [];
  const domain = {
    schemaVersions: Object.freeze({ transport: 1 }),
    async getTradingRun() { return null; },
    async listTradingRuns() { return []; },
    async resumeTradingRun() { return null; },
    async getTradeEpisodeBundle() { return null; },
    async submitDecisionProposal() { return null; },
    async close() { calls.push("domain.close"); }
  };
  let serverFactory;

  const runtime = await startTradingMcpStdio({
    environment: configuredEnvironment(),
    clientFactory(options) {
      calls.push(["clientFactory", options]);
      return domain;
    },
    serve(factory) {
      serverFactory = factory;
      calls.push("serve");
      return {
        async close() { calls.push("transport.close"); }
      };
    }
  });

  assert.ok(serverFactory());
  const firstClose = runtime.close();
  const secondClose = runtime.close();
  assert.equal(firstClose, secondClose);
  await firstClose;

  assert.deepEqual(calls, [
    ["clientFactory", { baseUrl: BASE_URL, callerToken: TOKEN }],
    "serve",
    "transport.close"
  ]);
  assert.equal(calls.includes("domain.close"), false, "MCP shutdown must not own Trading runtime lifecycle");
});

test("TREE 12.7 stdio failure diagnostics preserve only stable codes and never secret text", () => {
  assert.equal(
    tradingMcpErrorCode({ code: "TRADING_DOMAIN_TRANSPORT_UNAVAILABLE" }, "TRADING_MCP_STARTUP_FAILED"),
    "TRADING_DOMAIN_TRANSPORT_UNAVAILABLE"
  );
  assert.equal(
    tradingMcpErrorCode({ code: `Bearer ${TOKEN}` }, "TRADING_MCP_STARTUP_FAILED"),
    "TRADING_MCP_STARTUP_FAILED"
  );
  assert.equal(
    tradingMcpErrorCode({ code: "private/path" }, "TRADING_MCP_TRANSPORT_ERROR"),
    "TRADING_MCP_TRANSPORT_ERROR"
  );
});

test("TREE 12.7 stdio client construction failures do not start MCP transport", async () => {
  const calls = [];
  await assert.rejects(
    startTradingMcpStdio({
      environment: configuredEnvironment(),
      clientFactory() {
        calls.push("clientFactory");
        const error = new Error("synthetic invalid runtime");
        error.code = "TRADING_DOMAIN_TRANSPORT_UNAVAILABLE";
        throw error;
      },
      serve() {
        calls.push("serve");
        throw new Error("must not start");
      }
    }),
    (error) => error?.code === "TRADING_DOMAIN_TRANSPORT_UNAVAILABLE"
  );
  assert.deepEqual(calls, ["clientFactory"]);
});
