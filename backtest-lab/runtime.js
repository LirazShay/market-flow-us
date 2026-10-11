import http from "node:http";
import { readFile } from "node:fs/promises";
import {
  ProtocolValidationError
} from "../shared/protocol/index.js";
import {
  MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES
} from "../shared/scanner/builtins.js";
import {
  BacktestSourceCatalogError,
  listBacktestEvidenceSources
} from "./source-catalog.js";
import {
  BacktestEvidenceSourceError,
  openBacktestEvidenceSource
} from "./evidence-source.js";
import {
  BACKTEST_OUTCOME_ERROR_CODES,
  BacktestOutcomeEvaluationError
} from "./outcome-evaluator.js";
import { executeBacktestPoint } from "./point-execution.js";
import {
  BacktestPointResultError,
  freezeBacktestPointRequest
} from "./point-result.js";

export const BACKTEST_LAB_HOST = "127.0.0.1";
export const BACKTEST_LAB_PORT = 8767;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ERROR_MESSAGE = 256;
const BACKTEST_BROWSER_ASSETS = Object.freeze({
  "/app/index.js": new URL("../browser/backtest-lab/index.js", import.meta.url),
  "/app/client.js": new URL("../browser/backtest-lab/client.js", import.meta.url),
  "/app/surface.js": new URL("../browser/backtest-lab/surface.js", import.meta.url)
});
const BACKTEST_PAGE = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Market Flow US — Backtest Lab</title>
</head>
<body>
  <script type="module" src="/app/index.js"></script>
</body>
</html>`;

function baseHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY"
  };
}

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...baseHeaders("application/json; charset=utf-8"),
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(body);
}

function writeText(response, statusCode, contentType, body, { html = false } = {}) {
  response.writeHead(statusCode, {
    ...baseHeaders(contentType),
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": html
      ? "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      : "default-src 'none'; frame-ancestors 'none'"
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

  if (error instanceof ProtocolValidationError) {
    return {
      statusCode: 422,
      code: error.code,
      message: boundedMessage(error.message, "Scanner Query is not supported for this Backtest point.")
    };
  }

  if (error instanceof BacktestPointResultError) {
    return {
      statusCode: 422,
      code: error.code,
      message: boundedMessage(error.message, "Backtest point result is invalid.")
    };
  }

  if (error instanceof BacktestOutcomeEvaluationError) {
    return {
      statusCode: error.code === BACKTEST_OUTCOME_ERROR_CODES.BASELINE_INTEGRITY ? 409 : 500,
      code: error.code,
      message: boundedMessage(error.message, "Backtest outcome evaluation failed safely.")
    };
  }

  return {
    statusCode: 500,
    code: "BACKTEST_RUNTIME_ERROR",
    message: "Backtest Lab operation failed safely."
  };
}

function requestFailure(message, code = "BACKTEST_REQUEST_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

async function readJsonObject(request) {
  const contentType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    requestFailure("Backtest request must use application/json.");
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) {
      requestFailure("Backtest request body is too large.", "BACKTEST_REQUEST_TOO_LARGE");
    }
    chunks.push(chunk);
  }

  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    requestFailure("Backtest request body must be valid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    requestFailure("Backtest request body must be an object.");
  }
  return value;
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validateSourceRequest(value) {
  if (
    !hasExactKeys(value, ["sourceId"])
    || typeof value.sourceId !== "string"
    || value.sourceId.length === 0
    || value.sourceId.length > 256
  ) {
    requestFailure("Backtest source request must contain only one bounded sourceId.");
  }
  return value.sourceId;
}

function validatePointRunRequest(value) {
  if (!hasExactKeys(value, ["sourceId", "requestedAtMs", "queries", "topX", "horizonsMs"])) {
    requestFailure("Backtest point request has an invalid shape.");
  }
  if (!Array.isArray(value.queries) || value.queries.some((query) => !hasExactKeys(query, ["id", "name", "sql"]))) {
    requestFailure("Backtest point Queries must contain only id, name and sql.");
  }

  try {
    return freezeBacktestPointRequest(value);
  } catch (error) {
    if (error instanceof BacktestPointResultError) {
      requestFailure(error.message);
    }
    throw error;
  }
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

function browserQueryTemplates() {
  return MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.map((query) => ({
    id: query.queryId,
    name: query.name,
    sql: query.sql,
    source: query.source
  }));
}

export async function startBacktestLabRuntime({
  dataDir,
  host = BACKTEST_LAB_HOST,
  port = BACKTEST_LAB_PORT,
  listSources = listBacktestEvidenceSources,
  openSource = openBacktestEvidenceSource,
  runPoint = executeBacktestPoint
} = {}) {
  assertRuntimeOptions({ dataDir, host, port });
  if (typeof runPoint !== "function") {
    throw new TypeError("runPoint must be a function");
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${BACKTEST_LAB_HOST}`);

      if (request.method === "GET" && url.pathname === "/" && url.search === "") {
        writeText(response, 200, "text/html; charset=utf-8", BACKTEST_PAGE, { html: true });
        return;
      }

      if (request.method === "GET" && Object.hasOwn(BACKTEST_BROWSER_ASSETS, url.pathname) && url.search === "") {
        const body = await readFile(BACKTEST_BROWSER_ASSETS[url.pathname], "utf8");
        writeText(response, 200, "text/javascript; charset=utf-8", body);
        return;
      }

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

      if (request.method === "GET" && url.pathname === "/api/queries" && url.search === "") {
        const queries = browserQueryTemplates();
        writeJson(response, 200, {
          queries,
          count: queries.length
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

      if (request.method === "POST" && url.pathname === "/api/point/run" && url.search === "") {
        const body = await readJsonObject(request);
        const pointRequest = validatePointRunRequest(body);
        const point = await runPoint({
          dataDir,
          sourceId: pointRequest.sourceId,
          requestedAtMs: pointRequest.requestedAtMs,
          queries: pointRequest.queries,
          topX: pointRequest.topX,
          horizonsMs: pointRequest.horizonsMs
        });
        writeJson(response, 200, { point });
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
