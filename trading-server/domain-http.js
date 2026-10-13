import { createServer } from "node:http";

import {
  LocalSecurityError,
  assertAuthorizedCaller,
  assertNoBrowserOrigin,
  generateCallerToken
} from "../ibkr-order-service/security.js";

export const TRADING_DOMAIN_HOST = "127.0.0.1";
export const TRADING_DOMAIN_DEFAULT_PORT = 8771;
export const TRADING_DOMAIN_MAX_BODY_BYTES = 64 * 1024;

const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;

const OPERATIONS = Object.freeze({
  get_trading_run: async (domain, input) => domain.getTradingRun(input.tradingRunId),
  list_trading_runs: async (domain, input) => domain.listTradingRuns(input),
  resume_trading_run: async (domain, input) => domain.resumeTradingRun(input.tradingRunId),
  get_trade_episode_bundle: async (domain, input) => domain.getTradeEpisodeBundle(
    input.tradingRunId,
    input.tradeEpisodeId
  ),
  submit_decision_proposal: async (domain, input) => domain.submitDecisionProposal(input)
});

function writeJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function codedError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function assertJsonContentType(value) {
  if (
    typeof value !== "string"
    || value.split(";", 1)[0].trim().toLowerCase() !== "application/json"
  ) {
    throw codedError("UNSUPPORTED_CONTENT_TYPE", 415);
  }
}

function assertPlainObject(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw codedError(code, 400);
  }
  return value;
}

function assertExactKeys(value, expected, code) {
  const object = assertPlainObject(value, code);
  const actual = Object.keys(object).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw codedError(code, 400);
  }
  return object;
}

async function readBoundedJson(request) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > TRADING_DOMAIN_MAX_BODY_BYTES) {
    request.resume();
    throw codedError("REQUEST_TOO_LARGE", 413);
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > TRADING_DOMAIN_MAX_BODY_BYTES) {
      request.resume();
      throw codedError("REQUEST_TOO_LARGE", 413);
    }
    chunks.push(chunk);
  }
  if (totalBytes === 0) throw codedError("INVALID_JSON", 400);

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw codedError("INVALID_JSON", 400);
  }
}

function sanitizedFailure(error) {
  if (error instanceof LocalSecurityError) {
    return { statusCode: error.statusCode, code: error.code };
  }
  if (
    Number.isInteger(error?.statusCode)
    && typeof error?.code === "string"
    && STABLE_ERROR_CODE.test(error.code)
  ) {
    return { statusCode: error.statusCode, code: error.code };
  }
  if (typeof error?.code === "string" && STABLE_ERROR_CODE.test(error.code)) {
    return { statusCode: 409, code: error.code };
  }
  return { statusCode: 500, code: "TRADING_DOMAIN_TRANSPORT_ERROR" };
}

function assertDomain(domain) {
  if (domain === null || typeof domain !== "object") throw new TypeError("domain is required");
  for (const method of [
    "getTradingRun",
    "listTradingRuns",
    "resumeTradingRun",
    "getTradeEpisodeBundle",
    "submitDecisionProposal"
  ]) {
    if (typeof domain[method] !== "function") {
      throw new TypeError(`domain.${method} must be a function`);
    }
  }
  return domain;
}

export function createTradingDomainRequestHandler({ domain, callerToken } = {}) {
  const tradingDomain = assertDomain(domain);
  if (typeof callerToken !== "string" || callerToken.length === 0) {
    throw new TypeError("callerToken is required");
  }

  return async function tradingDomainRequestHandler(request, response) {
    try {
      const url = new URL(request.url ?? "/", `http://${TRADING_DOMAIN_HOST}`);
      if (request.method === "GET" && url.pathname === "/health") {
        assertNoBrowserOrigin(request.headers.origin);
        writeJson(response, 200, { service: "market-flow-us-trading-domain", status: "ok" });
        return;
      }

      assertAuthorizedCaller(request.headers.authorization, callerToken);
      assertNoBrowserOrigin(request.headers.origin);

      if (request.method !== "POST" || url.pathname !== "/domain") {
        writeJson(response, 404, { code: "NOT_FOUND" });
        return;
      }

      assertJsonContentType(request.headers["content-type"]);
      const body = assertExactKeys(
        await readBoundedJson(request),
        ["operation", "input"],
        "INVALID_REQUEST_BODY"
      );
      if (typeof body.operation !== "string" || !Object.hasOwn(OPERATIONS, body.operation)) {
        throw codedError("TRADING_DOMAIN_OPERATION_NOT_FOUND", 404);
      }
      const input = assertPlainObject(body.input, "INVALID_REQUEST_BODY");
      const data = await OPERATIONS[body.operation](tradingDomain, input);
      writeJson(response, 200, { data });
    } catch (error) {
      const failure = sanitizedFailure(error);
      writeJson(response, failure.statusCode, { code: failure.code });
    }
  };
}

export function createTradingDomainTransportRuntime({ domain, callerToken = generateCallerToken() } = {}) {
  const handler = createTradingDomainRequestHandler({ domain, callerToken });
  return Object.freeze({ callerToken, handler });
}

export async function startTradingDomainTransport({
  domain,
  host = TRADING_DOMAIN_HOST,
  port = TRADING_DOMAIN_DEFAULT_PORT,
  callerToken = generateCallerToken()
} = {}) {
  if (host !== TRADING_DOMAIN_HOST) {
    throw new TypeError(`host must be ${TRADING_DOMAIN_HOST}`);
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("port must be an integer between 0 and 65535");
  }

  const runtime = createTradingDomainTransportRuntime({ domain, callerToken });
  const server = createServer(runtime.handler);
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
    server.listen({ host, port, exclusive: true });
  });

  const address = server.address();
  if (address === null || typeof address !== "object") {
    server.close();
    throw new Error("Trading Domain transport address is unavailable");
  }

  let closed = false;
  return Object.freeze({
    server,
    callerToken: runtime.callerToken,
    baseUrl: `http://${TRADING_DOMAIN_HOST}:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
}
