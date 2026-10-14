const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const LOOPBACK_HOST = "127.0.0.1";

function assertLoopbackBaseUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("baseUrl is required");
  }
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== LOOPBACK_HOST || url.username || url.password) {
    throw new TypeError("baseUrl must be an http://127.0.0.1 loopback URL without credentials");
  }
  url.pathname = url.pathname.replace(/\/$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/u, "");
}

function assertToken(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("callerToken is required");
  }
  return value;
}

function assertFetch(value) {
  if (typeof value !== "function") throw new TypeError("fetchFn must be a function");
  return value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function transportError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    throw transportError("TRADING_DOMAIN_TRANSPORT_INVALID_RESPONSE");
  }
}

export function createTradingDomainHttpClient({
  baseUrl,
  callerToken,
  fetchFn = fetch
} = {}) {
  const boundedBaseUrl = assertLoopbackBaseUrl(baseUrl);
  const token = assertToken(callerToken);
  const request = assertFetch(fetchFn);

  async function call(operation, input = {}) {
    if (typeof operation !== "string" || operation.length === 0) {
      throw new TypeError("operation is required");
    }
    if (!isPlainObject(input)) throw new TypeError("input must be an object");

    let response;
    try {
      response = await request(`${boundedBaseUrl}/domain`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ operation, input })
      });
    } catch {
      throw transportError("TRADING_DOMAIN_TRANSPORT_UNAVAILABLE");
    }

    const body = await parseJson(response);
    if (!response.ok) {
      const code = typeof body?.code === "string" && STABLE_ERROR_CODE.test(body.code)
        ? body.code
        : "TRADING_DOMAIN_TRANSPORT_FAILED";
      throw transportError(code);
    }
    if (!isPlainObject(body) || !Object.hasOwn(body, "data")) {
      throw transportError("TRADING_DOMAIN_TRANSPORT_INVALID_RESPONSE");
    }
    return body.data;
  }

  return Object.freeze({
    schemaVersions: Object.freeze({ transport: 1 }),
    async getTradingRun(tradingRunId) {
      return call("get_trading_run", { tradingRunId });
    },
    async listTradingRuns(options = {}) {
      return call("list_trading_runs", options);
    },
    async resumeTradingRun(tradingRunId) {
      return call("resume_trading_run", { tradingRunId });
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      return call("get_trade_episode_bundle", { tradingRunId, tradeEpisodeId });
    },
    async getTradeEpisodeAttribution(tradingRunId, tradeEpisodeId) {
      return call("get_trade_episode_attribution", { tradingRunId, tradeEpisodeId });
    },
    async comparePolicyVersions(input) {
      return call("compare_policy_versions", input);
    },
    async buildPolicyCandidate(input) {
      return call("build_policy_candidate", input);
    },
    async submitDecisionProposal(input) {
      return call("submit_decision_proposal", input);
    }
  });
}
