export class BacktestLabClientError extends Error {
  constructor(message, code = "BACKTEST_CLIENT_ERROR", status = null) {
    super(message);
    this.name = "BacktestLabClientError";
    this.code = code;
    this.status = status;
  }
}

function safeErrorMessage(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed.slice(0, 256);
}

async function requestJson(fetchImpl, path, options = undefined) {
  let response;
  try {
    response = await fetchImpl(path, options);
  } catch {
    throw new BacktestLabClientError(
      "Backtest Lab is not reachable.",
      "BACKTEST_CLIENT_UNAVAILABLE"
    );
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new BacktestLabClientError(
      "Backtest Lab returned an unreadable response.",
      "BACKTEST_CLIENT_RESPONSE_INVALID",
      response.status
    );
  }

  if (!response.ok) {
    throw new BacktestLabClientError(
      safeErrorMessage(body?.error?.message, "Backtest Lab request failed."),
      typeof body?.error?.code === "string" ? body.error.code : "BACKTEST_CLIENT_REQUEST_FAILED",
      response.status
    );
  }

  return body;
}

function postJson(fetchImpl, path, body) {
  return requestJson(fetchImpl, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function createBacktestLabClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }

  return Object.freeze({
    async listSources() {
      return await requestJson(fetchImpl, "/api/sources");
    },

    async listQueries() {
      return await requestJson(fetchImpl, "/api/queries");
    },

    async runPoint(request) {
      const body = await postJson(fetchImpl, "/api/point/run", request);
      return body.point;
    },

    async runSweep(request) {
      const body = await postJson(fetchImpl, "/api/sweep/run", request);
      return body.sweep;
    },

    async pageSweep(sweepId, offset, limit) {
      const body = await postJson(fetchImpl, "/api/sweep/page", { sweepId, offset, limit });
      return body.page;
    },

    async openSweepPoint(sweepId, index) {
      const body = await postJson(fetchImpl, "/api/sweep/open", { sweepId, index });
      return body.point;
    }
  });
}
