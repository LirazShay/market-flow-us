import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(relativePath), "utf8"));
}

test("TREE 11.8 repo marketplace resolves the portable local Research plugin and its executable", async () => {
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const plugin = await readJson("plugins/market-flow-us-researcher/plugin.json");
  const mcp = await readJson("plugins/market-flow-us-researcher/mcp.json");
  const packageJson = await readJson("package.json");

  assert.equal(marketplace.name, "market-flow-us-local");
  const matchingEntries = marketplace.plugins.filter((candidate) => candidate.name === plugin.name);
  assert.equal(matchingEntries.length, 1);

  const entry = matchingEntries[0];
  assert.deepEqual(entry.source, {
    source: "local",
    path: "./plugins/market-flow-us-researcher"
  });
  assert.equal(entry.policy.installation, "AVAILABLE");
  assert.equal(entry.policy.authentication, "ON_INSTALL");

  assert.equal(plugin.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");

  const server = mcp.mcpServers.market_flow_us_research;
  assert.deepEqual(server, {
    type: "stdio",
    command: "market-flow-us-research-mcp"
  });
  assert.equal(packageJson.bin[server.command], "research-server/mcp-stdio.js");
  assert.equal(Object.hasOwn(server, "url"), false, "Desktop-local plugin must not require a network MCP endpoint");
});
