import http from "node:http";
import {
  BacktestSourceCatalogError,
  listBacktestEvidenceSources
} from "./source-catalog.js";
import {
  BacktestEvidenceSourceError,
  openBacktestEvidenceSource
} from "./evidence-source.js";

export const BACKTEST_LAB_HOST = "127.0.0.1";
export const BACKTEST_LAB_PORT = 8767;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ERROR_MESSAGE = 256;

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(body);
}

function boundedMessage(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed.slice(0, MAX_ERROR_MESSAGE);
}

function publicRuntimeError(error) {
  if (error instanceof BacktestEvidenceSourceError || error instanceof BacktestSourceCatalogError) {
    const statusCode = error.code === "BACKTEST_SOURCE_INVALID_SELECTION"
      ? 400
      : error.code === "BACKTEST_SOURCE_MISSING"
        ? 404
        : error.code === "BACKTEST_SOURCE_UNAVAILABLE"
          || error.code === "BACKTEST_SOURCE_IN_USE"
          ? 409
          : error.code === "BACKTEST_SOURCE_INCOMPATIBLE"
            || error.code === "BACKTEST_SOURCE_INVALID_TYPE"
            ? 422
            : 503;
    return {
      statusCode,
      code: error.code,
      message: boundedMessage(error.message, "Backtest evidence operation failed safely.")
    };
  }

  return {
    statusCode: 500,
    code: "BACKTEST_RUNTIME_ERROR",
    message: "Backtest Lab operation failed safely."
  };
}

async function readJsonObject(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    const error = new Error("Backtest request must use application/json.");
    error.code = "BACKTEST_REQUEST_INVALID";
    throw error;
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      const error = new Error("Backtest request body is too large.");
      error.code = "BACKTEST_REQUEST_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Backtest request body must be valid JSON.");
    error.code = "BACKTEST_REQUEST_INVALID";
    throw error;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const error = new Error("Backtest request body must be an object.");
    error.code = "BACKTEST_REQUEST_INVALID";
    throw error;
  }
  return value;
}

function validateSourceRequest(value) {
  if (
    Object.keys(value).length !== 1
    || !Object.hasOwn(value, "sourceId")
    || typeof value.sourceId !== "string"
    || value.sourceId.length === 0
    || value.sourceId.length > 256
  ) {
    const error = new Error("Backtest source request must contain only one bounded sourceId.");
    error.code = "BACKTEST_REQUEST_INVALID";
    throw error;
  }
  return value.sourceId;
}

function requestError(error) {
  if (error?.code === "BACKTEST_REQUEST_TOO_LARGE") {
    return { statusCode: 413, code: error.code, message: error.message };
  }
  if (error?.code === "BACKTEST_REQUEST_INVALID") {
    return { statusCode: 400, code: error.code, message: error.message };
  }
  return publicRuntimeError(error);
}

function assertRuntimeOptions({ dataDir, host, port }) {
  if (typeof dataDir !== "string" || dataDir.length === 0) {
    throw new TypeError("dataDir must be a non-empty string");
  }
  if (host !== BACKTEST_LAB_HOST) {
    throw new Error(`Backtest Lab must bind only ${BACKTEST_LAB_HOST}`);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("Backtest Lab port must be an integer between 0 and 65535");
  }
}

export async function startBacktestLabRuntime({
  dataDir,
  host = BACKTEST_LAB_HOST,
  port = BACKTEST_LAB_PORT,
  listSources = listBacktestEvidenceSources,
  openSource = openBacktestEvidenceSource
} = {}) {
  assertRuntimeOptions({ dataDir, host, port });

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${BACKTEST_LAB_HOST}`);

      if (request.method === "GET" && url.pathname === "/health" && url.search === "") {
        writeJson(response, 200, {
          ready: true,
          service: "market-flow-us-backtest-lab"
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sources" && url.search === "") {
        const sources = await listSources({ dataDir });
        writeJson(response, 200, {
          sources,
          count: sources.length
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/source/validate" && url.search === "") {
        const body = await readJsonObject(request);
        const sourceId = validateSourceRequest(body);
        const evidence = await openSource({ dataDir, sourceId });
        try {
          writeJson(response, 200, {
            source: evidence.source,
            schemaVersion: evidence.schemaVersion
          });
        } finally {
          await evidence.close();
        }
        return;
      }

      writeJson(response, 404, {
        error: {
          code: "BACKTEST_ROUTE_NOT_FOUND",
          message: "Backtest Lab route was not found."
        }
      });
    } catch (error) {
      const safe = requestError(error);
      writeJson(response, safe.statusCode, {
        error: {
          code: safe.code,
          message: safe.message
        }
      });
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Backtest Lab did not acquire a TCP address.");
  }

  let closed = false;
  return Object.freeze({
    host,
    port: address.port,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
}
