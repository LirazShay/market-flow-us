import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAP_HEAT_PATH = "/lti/lti-app/api/MarketFast/MapHeat2";
export const SECURITIES_PATH = "/lti/lti-app/api/SecuritiesFast/GetSecuritiesData";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RUNTIME_PATH = path.join(ROOT, "dist", "browser", "market-scope.runtime.js");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SCENARIOS = new Set(Array.from({ length: 16 }, (_, index) => `FM-${String(index + 1).padStart(2, "0")}`));
const ADVANCING_SCENARIOS = new Set(["FM-01", "FM-02", "FM-13", "FM-14", "FM-15", "FM-16"]);

const FULL_UNIVERSE = Object.freeze(["1001", "1002", "1003", "1004"]);

const MAP_RECORDS = Object.freeze({
  "1001": Object.freeze({ PaperId: 1001, PaperName: "Fixture Alpha", DateChange: 1.2 }),
  "1002": Object.freeze({ PaperId: 1002, PaperName: "Fixture Beta", DateChange: -0.4 }),
  "1003": Object.freeze({ PaperId: 1003, PaperName: "Fixture Gamma" }),
  "1004": Object.freeze({ PaperId: 1004, PaperName: "Fixture Delta", DateChange: null })
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function securityFor(id, cycle) {
  if (id === "1001") {
    return {
      Key: 1001,
      LastKnownRate: 1234 + cycle * 2,
      BaseRateChangePercentage: 1.2 + cycle * 0.1,
      BuyLimit1: 1230 + cycle * 2,
      BuyVolume1: 10 + cycle,
      SellLimit1: 1240 + cycle * 2,
      SellVolume1: 12 + cycle,
      DailyDealsQuantity: 100 + cycle * 3,
      LastDealVolume: 4 + cycle,
      DailyTurnover: 100000 + cycle * 1000,
      DailyNISRevenue: 200000 + cycle * 1500,
      DailyLowestRate: 1200,
      DailyHighestRate: 1260 + cycle * 2,
      LastDealTimeOnly: `10:00:${String(cycle % 60).padStart(2, "0")}`
    };
  }

  if (id === "1002") {
    return {
      Key: 1002,
      LastKnownRate: 0,
      BaseRateChangePercentage: -0.4 - cycle * 0.1,
      BuyLimit1: null,
      BuyVolume1: 0,
      SellLimit1: 10 + cycle,
      SellVolume1: 0,
      DailyDealsQuantity: 50 + cycle,
      LastDealVolume: 0,
      DailyTurnover: 0,
      DailyNISRevenue: null,
      DailyLowestRate: 0,
      DailyHighestRate: 10 + cycle,
      LastDealTimeOnly: null
    };
  }

  if (id === "1003") {
    return {
      Key: 1003,
      LastKnownRate: null,
      BaseRateChangePercentage: 0,
      BuyLimit1: 990 + cycle,
      BuyVolume1: 3 + cycle,
      SellLimit1: null,
      DailyDealsQuantity: 20 + cycle * 2,
      LastDealVolume: null,
      DailyTurnover: 15000 + cycle * 100,
      DailyNISRevenue: 22000 + cycle * 100,
      DailyLowestRate: 980,
      DailyHighestRate: 1010 + cycle
    };
  }

  if (id === "1004") {
    return {
      Key: 1004,
      LastKnownRate: 4567 + cycle * 5,
      BaseRateChangePercentage: 0.8 + cycle * 0.05,
      BuyLimit1: 4550 + cycle * 5,
      BuyVolume1: 5 + cycle,
      SellLimit1: 4580 + cycle * 5,
      SellVolume1: 7 + cycle,
      DailyDealsQuantity: 75 + cycle * 4,
      LastDealVolume: 2 + cycle,
      DailyTurnover: 80000 + cycle * 700,
      DailyNISRevenue: 95000 + cycle * 900,
      DailyLowestRate: 4500,
      DailyHighestRate: 4600 + cycle * 5,
      LastDealTimeOnly: `10:01:${String(cycle % 60).padStart(2, "0")}`
    };
  }

  return {
    Key: Number(id),
    LastKnownRate: 1,
    BaseRateChangePercentage: 0,
    BuyLimit1: 1,
    BuyVolume1: 1,
    SellLimit1: 1,
    SellVolume1: 1,
    DailyDealsQuantity: 1
  };
}

function json(response, statusCode, body) {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text)
  });
  response.end(text);
}

function text(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw new Error("Control request body is too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function requiredMapHeatQuery(searchParams) {
  return searchParams.get("indexIdArray") === "0"
    && searchParams.get("sectorIdAndTatSectorArray") === "0;0"
    && searchParams.get("showOnlyDual") === "0"
    && searchParams.get("page") === "1"
    && searchParams.get("orderFieldName") === "DailyNumDeals"
    && searchParams.get("order") === "DESC"
    && searchParams.get("rt") === "true";
}

function validSecuritiesQuery(searchParams) {
  return searchParams.get("responseType") === "1"
    && searchParams.get("is_gto") === "true"
    && searchParams.get("force") === "false";
}

function mapRecordsFor(state) {
  if (state.scenario === "FM-03") {
    return [
      clone(MAP_RECORDS["1001"]),
      clone(MAP_RECORDS["1002"]),
      { PaperId: 1001, PaperName: "Fixture Duplicate" },
      clone(MAP_RECORDS["1004"])
    ];
  }

  if (state.scenario === "FM-04") {
    return [
      clone(MAP_RECORDS["1001"]),
      { PaperName: "Fixture Missing Id" },
      clone(MAP_RECORDS["1003"]),
      clone(MAP_RECORDS["1004"])
    ];
  }

  return state.currentUniverse.map((id) => clone(MAP_RECORDS[id]));
}

function createInitialState() {
  return {
    scenario: "FM-01",
    logicalCycleIndex: 0,
    servedSecurityIdsForCurrentCycle: new Set(),
    currentUniverse: [...FULL_UNIVERSE],
    requestLog: [],
    activeSecuritiesRequests: 0,
    maxActiveSecuritiesRequests: 0
  };
}

function snapshot(state) {
  return {
    scenario: state.scenario,
    logicalCycleIndex: state.logicalCycleIndex,
    servedSecurityIdsForCurrentCycle: [...state.servedSecurityIdsForCurrentCycle].sort(),
    currentUniverse: [...state.currentUniverse],
    requestLog: clone(state.requestLog),
    activeSecuritiesRequests: state.activeSecuritiesRequests,
    maxActiveSecuritiesRequests: state.maxActiveSecuritiesRequests
  };
}

function resetState(state, scenario = "FM-01") {
  state.scenario = scenario;
  state.logicalCycleIndex = 0;
  state.servedSecurityIdsForCurrentCycle.clear();
  state.currentUniverse = [...FULL_UNIVERSE];
  state.requestLog = [];
  state.activeSecuritiesRequests = 0;
  state.maxActiveSecuritiesRequests = 0;
}

function advanceIfComplete(state, requestedIds) {
  if (!ADVANCING_SCENARIOS.has(state.scenario)) return;

  for (const id of requestedIds) {
    state.servedSecurityIdsForCurrentCycle.add(id);
  }

  if (state.servedSecurityIdsForCurrentCycle.size !== state.currentUniverse.length) {
    return;
  }

  const served = new Set(state.servedSecurityIdsForCurrentCycle);
  if (!state.currentUniverse.every((id) => served.has(id))) {
    return;
  }

  state.servedSecurityIdsForCurrentCycle.clear();
  state.logicalCycleIndex += 1;

  if (state.scenario === "FM-14" && state.logicalCycleIndex >= 2) {
    state.currentUniverse = ["1001", "1002", "1003"];
  }
}

function securitiesPayload(records, cycle) {
  return {
    data: {
      SecuritiesData: {
        Table: {
          AsOfDate: `fixture-cycle-${cycle}`,
          Security: clone(records)
        }
      }
    }
  };
}

async function handleMapHeat(request, response, url, state) {
  state.requestLog.push({
    endpoint: "MapHeat2",
    method: request.method,
    pageCount: url.searchParams.get("pageCount"),
    page: url.searchParams.get("page"),
    orderFieldName: url.searchParams.get("orderFieldName"),
    order: url.searchParams.get("order"),
    rt: url.searchParams.get("rt")
  });

  if (state.scenario === "FM-06") {
    json(response, 503, { error: "synthetic-mapheat-error" });
    return;
  }

  if (state.scenario === "FM-07") {
    json(response, 200, { data: {} });
    return;
  }

  if (!requiredMapHeatQuery(url.searchParams)) {
    json(response, 400, { error: "invalid-mapheat-query" });
    return;
  }

  const pageCount = Number(url.searchParams.get("pageCount"));
  const expectedCount = state.currentUniverse.length;
  if (!Number.isInteger(pageCount) || pageCount <= 0 || (pageCount !== 1 && pageCount !== expectedCount)) {
    json(response, 400, { error: "invalid-mapheat-page-count" });
    return;
  }

  const allRecords = mapRecordsFor(state);
  const records = pageCount === 1 ? allRecords.slice(0, 1) : allRecords;
  const recordCount = state.scenario === "FM-05" && pageCount !== 1
    ? expectedCount + 1
    : expectedCount;

  json(response, 200, {
    data: {
      MapHeat: {
        recordCount,
        maxDateChange: null,
        records
      }
    }
  });
}

async function handleSecurities(request, response, url, state) {
  const securityIdsValue = url.searchParams.get("securityIds") ?? "";
  const requestedIds = securityIdsValue.split(",").filter(Boolean);

  state.requestLog.push({
    endpoint: "GetSecuritiesData",
    method: request.method,
    securityIds: securityIdsValue,
    responseType: url.searchParams.get("responseType"),
    isGto: url.searchParams.get("is_gto"),
    force: url.searchParams.get("force")
  });

  if (!validSecuritiesQuery(url.searchParams)
      || requestedIds.length === 0
      || new Set(requestedIds).size !== requestedIds.length
      || requestedIds.some((id) => !state.currentUniverse.includes(id))) {
    json(response, 400, { error: "invalid-securities-query" });
    return;
  }

  state.activeSecuritiesRequests += 1;
  state.maxActiveSecuritiesRequests = Math.max(
    state.maxActiveSecuritiesRequests,
    state.activeSecuritiesRequests
  );

  try {
    if (state.scenario === "FM-13") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (state.scenario === "FM-08") {
      json(response, 500, { error: "synthetic-securities-error" });
      return;
    }

    if (state.scenario === "FM-09") {
      json(response, 200, { data: { SecuritiesData: {} } });
      return;
    }

    const cycle = state.logicalCycleIndex;
    let records = requestedIds.map((id) => securityFor(id, cycle)).reverse();

    if (state.scenario === "FM-10") {
      records = records.slice(1);
    } else if (state.scenario === "FM-11" && records.length > 0) {
      records = [...records, clone(records[0])];
    } else if (state.scenario === "FM-12") {
      records = [...records, securityFor("9999", cycle)];
    }

    json(response, 200, securitiesPayload(records, cycle));

    if (!["FM-10", "FM-11", "FM-12"].includes(state.scenario)) {
      advanceIfComplete(state, requestedIds);
    }
  } finally {
    state.activeSecuritiesRequests -= 1;
  }
}

export async function startFakeMarket({
  host = "127.0.0.1",
  port = 0,
  runtimePath = DEFAULT_RUNTIME_PATH
} = {}) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Fake Market host must be loopback");
  }

  const state = createInitialState();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (request.method === "GET" && url.pathname === "/") {
        text(
          response,
          200,
          '<!doctype html><html><head><meta charset="utf-8"><title>MarketScope Fake Market</title></head><body><main id="market-scope-fake-market">MarketScope Fake Market</main><script src="/assets/market-scope.runtime.js"></script></body></html>',
          "text/html; charset=utf-8"
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/assets/market-scope.runtime.js") {
        try {
          const runtime = await readFile(runtimePath, "utf8");
          text(response, 200, runtime, "application/javascript; charset=utf-8");
        } catch {
          json(response, 404, { error: "runtime-not-built" });
        }
        return;
      }

      if (request.method === "GET" && url.pathname === MAP_HEAT_PATH) {
        await handleMapHeat(request, response, url, state);
        return;
      }

      if (request.method === "GET" && url.pathname === SECURITIES_PATH) {
        await handleSecurities(request, response, url, state);
        return;
      }

      if (request.method === "POST" && url.pathname === "/_market-scope-test/reset") {
        resetState(state);
        json(response, 200, snapshot(state));
        return;
      }

      if (request.method === "POST" && url.pathname === "/_market-scope-test/scenario") {
        const body = await readJsonBody(request);
        if (!SCENARIOS.has(body.scenario)) {
          json(response, 400, { error: "unknown-scenario" });
          return;
        }
        resetState(state, body.scenario);
        json(response, 200, snapshot(state));
        return;
      }

      if (request.method === "GET" && url.pathname === "/_market-scope-test/state") {
        json(response, 200, snapshot(state));
        return;
      }

      json(response, 404, { error: "not-found" });
    } catch (error) {
      json(response, 500, {
        error: "fake-market-internal-error",
        message: error instanceof SyntaxError ? "Invalid JSON body" : "Request failed"
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
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  const hostForUrl = host.includes(":") ? `[${host}]` : host;
  const baseUrl = `http://${hostForUrl}:${actualPort}/`;
  let closed = false;

  return {
    host,
    port: actualPort,
    baseUrl,
    runtimePath,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}
