import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUsSyntheticGenerator } from "./us-synthetic.mjs";

export const SCREENER_HUL_PATH = "/lti/lti-app/api/Market/ScreenerHulPaging3";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_RUNTIME_PATH = path.join(ROOT, "dist", "browser", "market-flow-us.runtime.js");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SCENARIOS = new Set(Array.from({ length: 17 }, (_, index) => `US-${String(index + 1).padStart(2, "0")}`));
const ADVANCING_SCENARIOS = new Set([
  "US-01", "US-02", "US-03", "US-04", "US-08", "US-11", "US-12", "US-13", "US-14", "US-15", "US-16"
]);

const REQUIRED_QUERY = Object.freeze({
  region: "1",
  Country: "2",
  indexIdArray: "0",
  paperType: "1",
  sectorIdArray: "0",
  subSectorIdArray: "0",
  changePercentFrom: "-999999999",
  changePercentTo: "999999999",
  volumeFrom: "-999999999",
  volumeTo: "999999999",
  marketCapFrom: "-999999999999999",
  marketCapTo: "999999999999999",
  beginYearChangePercentFrom: "-999999999",
  beginYearChangePercentTo: "999999999",
  month12ChangePercentFrom: "-999999999",
  month12ChangePercentTo: "999999999",
  month36ChangePercentFrom: "-999999999",
  month36ChangePercentTo: "999999999",
  EsdRatingModeSelected: "0",
  EsdRatingModeValueSelected: "0",
  page: "1",
  pageCount: "5000",
  orderFieldName: "DailyVolume",
  orderDir: "DESC",
  rt: "true"
});

const BASE_UNIVERSE = Object.freeze(["1001", "1002", "1003", "1004"]);
const FIXTURE_GENERATOR = createUsSyntheticGenerator({
  universeSize: 5,
  cycleCount: 10000,
  cadenceMs: 3000,
  firstPaperId: 1001,
  preset: "fake-market",
  dataPattern: "moving"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function hasRequiredQuery(searchParams) {
  return Object.entries(REQUIRED_QUERY).every(([key, value]) => searchParams.get(key) === value);
}

function createInitialState() {
  return {
    scenario: "US-01",
    logicalCycleIndex: 0,
    requestLog: [],
    activeScreenerRequests: 0,
    maxActiveScreenerRequests: 0
  };
}

function universeFor(state) {
  if (state.scenario === "US-03" && state.logicalCycleIndex >= 1) {
    return [...BASE_UNIVERSE, "1005"];
  }
  if (state.scenario === "US-04" && state.logicalCycleIndex >= 1) {
    return BASE_UNIVERSE.slice(0, 3);
  }
  if (state.scenario === "US-14" && state.logicalCycleIndex >= 2) {
    return BASE_UNIVERSE.slice(0, 3);
  }
  return [...BASE_UNIVERSE];
}

function snapshot(state) {
  return {
    scenario: state.scenario,
    logicalCycleIndex: state.logicalCycleIndex,
    currentUniverse: universeFor(state),
    requestLog: clone(state.requestLog),
    activeScreenerRequests: state.activeScreenerRequests,
    maxActiveScreenerRequests: state.maxActiveScreenerRequests
  };
}

function resetState(state, scenario = "US-01") {
  state.scenario = scenario;
  state.logicalCycleIndex = 0;
  state.requestLog = [];
  state.activeScreenerRequests = 0;
  state.maxActiveScreenerRequests = 0;
}

function screenerPayload(records, recordCount, cycle) {
  return {
    data: {
      ScreenerHulPaging: {
        recordCount,
        maxDateChange: `fixture-cycle-${cycle}`,
        records: clone(records)
      }
    },
    resultCode: 0,
    rsCount: recordCount,
    rtIsr: false,
    rtUsa: true,
    logtm: `fixture-log-${cycle}`,
    reqtm: `fixture-req-${cycle}`,
    responsetm: `fixture-response-${cycle}`,
    serverId: "fixture-server",
    version: "fixture-v1"
  };
}

function rowsFor(state) {
  const cycle = state.logicalCycleIndex;
  let records = universeFor(state).map((id) =>
    FIXTURE_GENERATOR.rowForPaperId(Number(id), cycle));

  if (state.scenario === "US-02") {
    records = records.reverse();
  } else if (state.scenario === "US-05") {
    records = [
      records[0],
      records[1],
      { ...clone(records[0]), PaperNameEng: "Fixture Duplicate US" },
      records[3]
    ];
  } else if (state.scenario === "US-06") {
    const missing = clone(records[1]);
    delete missing.PaperId;
    records = [records[0], missing, records[2], records[3]];
  }

  return records;
}

async function handleScreener(request, response, url, state) {
  state.requestLog.push({
    endpoint: "ScreenerHulPaging3",
    method: request.method,
    query: Object.fromEntries(url.searchParams.entries())
  });

  if (!hasRequiredQuery(url.searchParams)) {
    json(response, 400, { error: "invalid-screener-query" });
    return;
  }

  state.activeScreenerRequests += 1;
  state.maxActiveScreenerRequests = Math.max(
    state.maxActiveScreenerRequests,
    state.activeScreenerRequests
  );

  try {
    if (state.scenario === "US-11") {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    if (state.scenario === "US-10") {
      json(response, 503, { error: "synthetic-screener-error" });
      return;
    }

    if (state.scenario === "US-13" && state.logicalCycleIndex === 0) {
      state.logicalCycleIndex = 1;
      json(response, 503, { error: "synthetic-recoverable-screener-error" });
      return;
    }

    if (state.scenario === "US-09") {
      json(response, 200, { data: {} });
      return;
    }

    const cycle = state.logicalCycleIndex;
    const records = rowsFor(state);
    const recordCount = state.scenario === "US-07"
      ? records.length + 1
      : records.length;
    json(response, 200, screenerPayload(records, recordCount, cycle));

    if (ADVANCING_SCENARIOS.has(state.scenario)) {
      state.logicalCycleIndex += 1;
    }
  } finally {
    state.activeScreenerRequests -= 1;
  }
}

export async function startUsFakeMarket({
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
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "127.0.0.1"}`
      );

      if (request.method === "GET" && url.pathname === "/") {
        text(
          response,
          200,
          '<!doctype html><html><head><meta charset="utf-8"><title>Market Flow US Fake Market</title></head><body><main id="market-flow-us-fake-market">Market Flow US Fake Market</main><script src="/assets/market-flow-us.runtime.js"></script></body></html>',
          "text/html; charset=utf-8"
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/assets/market-flow-us.runtime.js") {
        try {
          const runtime = await readFile(runtimePath, "utf8");
          text(response, 200, runtime, "application/javascript; charset=utf-8");
        } catch {
          json(response, 404, { error: "runtime-not-built" });
        }
        return;
      }

      if (request.method === "GET" && url.pathname === SCREENER_HUL_PATH) {
        await handleScreener(request, response, url, state);
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
