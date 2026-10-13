import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";

import {
  RESEARCH_MCP_DATA_BOUNDARY,
  RESEARCH_MCP_TOOL_REGISTRY_VERSION,
  createResearchMcpToolRegistry
} from "./mcp-tool-registry.js";

export const RESEARCH_MCP_SERVER_VERSION = "market-flow-us-research-mcp-server-v1";

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

function safeFailure(error) {
  const code = typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)
    ? error.code
    : "RESEARCH_MCP_TOOL_FAILED";
  return Object.freeze({
    serverVersion: RESEARCH_MCP_SERVER_VERSION,
    toolRegistryVersion: RESEARCH_MCP_TOOL_REGISTRY_VERSION,
    dataBoundary: RESEARCH_MCP_DATA_BOUNDARY,
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

export function createResearchMcpServer({
  domain,
  name = "market-flow-us-research",
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

  const registry = createResearchMcpToolRegistry({ domain });
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
