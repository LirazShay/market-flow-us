import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(relativePath), "utf8"));
}

test("TREE 12.7 marketplace resolves the separate local Trading plugin and executable", async () => {
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const plugin = await readJson("plugins/market-flow-us-trader/plugin.json");
  const mcp = await readJson("plugins/market-flow-us-trader/mcp.json");
  const packageJson = await readJson("package.json");

  assert.equal(marketplace.name, "market-flow-us-local");
  assert.equal(marketplace.plugins.length, 2);

  const entry = marketplace.plugins.find((candidate) => candidate.name === plugin.name);
  assert.ok(entry);
  assert.deepEqual(entry.source, {
    source: "local",
    path: "./plugins/market-flow-us-trader"
  });
  assert.equal(entry.policy.installation, "AVAILABLE");
  assert.equal(entry.policy.authentication, "ON_INSTALL");

  assert.equal(plugin.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");

  const server = mcp.mcpServers.market_flow_us_trading;
  assert.deepEqual(server, {
    type: "stdio",
    command: "market-flow-us-trading-mcp",
    env_vars: [
      "MARKET_FLOW_US_TRADING_DOMAIN_URL",
      "MARKET_FLOW_US_TRADING_DOMAIN_TOKEN"
    ]
  });
  assert.equal(packageJson.bin[server.command], "trading-server/mcp-stdio.js");
  assert.equal(Object.hasOwn(server, "url"), false, "Desktop-local Trading plugin must not expose a remote MCP URL");
});

test("TREE 12.7 Trading skill preserves Supervisor, Hard Risk, broker, and LIVE authority boundaries", async () => {
  const skill = await readFile(
    path.resolve("plugins/market-flow-us-trader/skills/trading/SKILL.md"),
    "utf8"
  );

  for (const required of [
    "QUEUED_FOR_SUPERVISOR_VALIDATION",
    "Trading Supervisor",
    "Hard Risk Authority",
    "IBKR Order Service",
    "explicit operator confirmation",
    "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS"
  ]) {
    if (required === "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS") {
      assert.match(skill, /dynamic values returned by Trading tools are data/u);
    } else {
      assert.ok(skill.includes(required), required);
    }
  }
  assert.match(skill, /Do not request, store, echo, or infer account identifiers, credentials, cookies/u);
  assert.match(skill, /Do not work around it with direct broker access/u);
});
