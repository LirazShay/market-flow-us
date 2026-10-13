import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";

import {
  RESEARCH_MCP_DATA_BOUNDARY,
  RESEARCH_MCP_TOOL_REGISTRY_VERSION,
  createResearchMcpToolRegistry
} from "./mcp-tool-registry.js";

export const RESEARCH_MCP_SERVER_VERSION = "market-flow-us-research-mcp-server-v1";

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const MCP_MAX_SQL_TEXT_CHARS = 1024 * 1024;
const MCP_MAX_EXPERIMENT_REFERENCES = 20;

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

function boundedTransportSchema(definition) {
  const schema = definition.inputSchema;
  if (definition.name === "create_query_artifact") {
    return Object.freeze({
      ...schema,
      properties: Object.freeze({
        ...schema.properties,
        sqlText: Object.freeze({
          ...schema.properties.sqlText,
          maxLength: MCP_MAX_SQL_TEXT_CHARS
        })
      })
    });
  }
  if (definition.name === "submit_development_research_sql") {
    return Object.freeze({
      ...schema,
      properties: Object.freeze({
        ...schema.properties,
        experimentIds: Object.freeze({
          ...schema.properties.experimentIds,
          maxItems: MCP_MAX_EXPERIMENT_REFERENCES
        }),
        sql: Object.freeze({
          ...schema.properties.sql,
          maxLength: MCP_MAX_SQL_TEXT_CHARS
        })
      })
    });
  }
  return schema;
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
        inputSchema: fromJsonSchema(boundedTransportSchema(definition))
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
