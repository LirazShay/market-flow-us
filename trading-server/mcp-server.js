import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";

import {
  TRADING_MCP_DATA_BOUNDARY,
  TRADING_MCP_TOOL_REGISTRY_VERSION,
  createTradingMcpToolRegistry
} from "./mcp-tool-registry.js";

export const TRADING_MCP_SERVER_VERSION = "market-flow-us-trading-mcp-server-v1";

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

function safeFailure(error) {
  const code = typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)
    ? error.code
    : "TRADING_MCP_TOOL_FAILED";
  return Object.freeze({
    serverVersion: TRADING_MCP_SERVER_VERSION,
    toolRegistryVersion: TRADING_MCP_TOOL_REGISTRY_VERSION,
    dataBoundary: TRADING_MCP_DATA_BOUNDARY,
    error: Object.freeze({ code })
  });
}

function toolResult(value) {
  return Object.freeze({
    content: Object.freeze([
      Object.freeze({ type: "text", text: JSON.stringify(value) })
    ]),
    structuredContent: value
  });
}

function toolFailure(error) {
  const value = safeFailure(error);
  return Object.freeze({
    ...toolResult(value),
    isError: true
  });
}

export function createTradingMcpServer({
  domain,
  name = "market-flow-us-trading",
  version = "0.1.0"
} = {}) {
  if (domain === null || typeof domain !== "object") {
    throw new TypeError("domain is required");
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("name must be a non-empty string");
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new TypeError("version must be a non-empty string");
  }

  const registry = createTradingMcpToolRegistry({ domain });
  const server = new McpServer({ name, version });

  for (const definition of registry.listTools()) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: fromJsonSchema(definition.inputSchema)
      },
      async (input) => {
        try {
          return toolResult(await registry.callTool(definition.name, input ?? {}));
        } catch (error) {
          return toolFailure(error);
        }
      }
    );
  }

  return server;
}
