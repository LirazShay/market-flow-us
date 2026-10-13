import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { CpgwAdapter } from "../../ibkr-order-service/cpgw-adapter.js";
import { createTargetedQuoteWatch } from "../../trading-server/targeted-quote-watch.js";

const REPORT_PATH = process.env.MARKET_FLOW_US_TRADING_QUOTE_WATCH_REPORT
  ?? path.resolve("test-results/workload/ci-trading-quote-watch.json");
const SHORTLIST_SIZE = 4;
const POLL_CYCLES = 8;
const PROVIDER_DELAY_MS = 10;
const MAX_QUOTE_AGE_MS = 1_000;
const EXPECTED_PROVIDER_REQUESTS_PER_INSTRUMENT = 3;
const EXPECTED_PROVIDER_REQUESTS_PER_POLL = SHORTLIST_SIZE * EXPECTED_PROVIDER_REQUESTS_PER_INSTRUMENT;

const INSTRUMENTS = Object.freeze(
  Array.from({ length: SHORTLIST_SIZE }, (_, index) => Object.freeze({
    symbol: `QW${String(index + 1).padStart(2, "0")}`,
    secType: "STK",
    currency: "USD",
    exchange: "SMART"
  }))
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function createControlledCpgwTransport({ providerDelayMs }) {
  const requestLog = [];
  const conidBySymbol = new Map(INSTRUMENTS.map((instrument, index) => [
    instrument.symbol,
    900_000 + index
  ]));

  return {
    requestLog,
    async requestJson(request) {
      requestLog.push({
        method: request.method,
        path: request.path
      });
      if (providerDelayMs > 0) await sleep(providerDelayMs);

      if (request.path === "/iserver/secdef/search") {
        const symbol = request.query?.symbol;
        const conid = conidBySymbol.get(symbol);
        return conid === undefined
          ? []
          : [{
              symbol,
              conid,
              restricted: false,
              sections: [{ secType: "STK" }]
            }];
      }

      if (request.path === "/iserver/secdef/info") {
        const conid = Number(request.query?.conid);
        return [{
          conid,
          secType: "STK",
          currency: "USD",
          validExchanges: "SMART"
        }];
      }

      if (request.path === "/iserver/marketdata/snapshot") {
        const conid = Number(request.query?.conids);
        return [{
          conid,
          "31": 100 + (conid % 1000),
          "84": 99.99 + (conid % 1000),
          "86": 100.01 + (conid % 1000),
          "6509": "RpB",
          _updated: Date.now()
        }];
      }

      throw new Error(`Unexpected controlled CPGW request path: ${request.path}`);
    }
  };
}

async function measureScenario(providerDelayMs) {
  const transport = createControlledCpgwTransport({ providerDelayMs });
  const adapter = new CpgwAdapter({
    requestJson: transport.requestJson,
    sleep: async () => {}
  });
  const watch = createTargetedQuoteWatch({
    adapter,
    maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
    maxInstruments: SHORTLIST_SIZE
  });
  const durationsMs = [];
  let freshObservations = 0;

  for (let cycle = 0; cycle < POLL_CYCLES; cycle += 1) {
    const startedAt = performance.now();
    const observations = await watch.poll(INSTRUMENTS);
    durationsMs.push(performance.now() - startedAt);

    assert.equal(observations.length, SHORTLIST_SIZE);
    for (const observation of observations) {
      assert.equal(observation.availability, "AVAILABLE");
      assert.equal(observation.staleness, "FRESH");
      assert.equal(observation.usableForNewDecision, true);
      freshObservations += 1;
    }
  }

  const expectedRequests = POLL_CYCLES * EXPECTED_PROVIDER_REQUESTS_PER_POLL;
  assert.equal(transport.requestLog.length, expectedRequests);

  return {
    providerDelayMs,
    providerRequests: transport.requestLog.length,
    freshObservations,
    meanPollMs: roundMs(durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length),
    p50PollMs: roundMs(percentile(durationsMs, 0.5)),
    p95PollMs: roundMs(percentile(durationsMs, 0.95)),
    maxPollMs: roundMs(Math.max(...durationsMs))
  };
}

test("TREE 12.3 bounded quote-watch workload measures polling cadence/cost through the real CPGW adapter seam", { timeout: 30_000 }, async () => {
  const cpuBefore = process.cpuUsage();
  const rssBeforeBytes = process.memoryUsage().rss;

  const zeroDelay = await measureScenario(0);
  const controlledLatency = await measureScenario(PROVIDER_DELAY_MS);

  const cpu = process.cpuUsage(cpuBefore);
  const rssAfterBytes = process.memoryUsage().rss;
  const theoreticalProviderFloorMs = EXPECTED_PROVIDER_REQUESTS_PER_POLL * PROVIDER_DELAY_MS;
  const measuredOverheadAboveProviderFloorMs = Math.max(
    0,
    controlledLatency.p95PollMs - theoreticalProviderFloorMs
  );
  const pollingFitsFreshnessWindow = controlledLatency.p95PollMs < MAX_QUOTE_AGE_MS;

  assert.equal(zeroDelay.providerRequests, POLL_CYCLES * EXPECTED_PROVIDER_REQUESTS_PER_POLL);
  assert.equal(controlledLatency.providerRequests, POLL_CYCLES * EXPECTED_PROVIDER_REQUESTS_PER_POLL);
  assert.equal(controlledLatency.freshObservations, POLL_CYCLES * SHORTLIST_SIZE);
  assert.ok(
    pollingFitsFreshnessWindow,
    `controlled quote-watch p95 ${controlledLatency.p95PollMs}ms exceeded ${MAX_QUOTE_AGE_MS}ms freshness window`
  );

  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    task: "12.3",
    profile: "ci-controlled-cpgw-seam",
    publicSafe: true,
    shortlistSize: SHORTLIST_SIZE,
    pollCycles: POLL_CYCLES,
    maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
    providerRequestTopology: {
      requestsPerInstrument: EXPECTED_PROVIDER_REQUESTS_PER_INSTRUMENT,
      requestsPerPoll: EXPECTED_PROVIDER_REQUESTS_PER_POLL,
      note: "secdef search + secdef info + ready marketdata snapshot"
    },
    zeroDelay,
    controlledLatency,
    theoreticalProviderFloorMs,
    measuredOverheadAboveProviderFloorMs: roundMs(measuredOverheadAboveProviderFloorMs),
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    rssBeforeBytes,
    rssAfterBytes,
    rssDeltaBytes: rssAfterBytes - rssBeforeBytes,
    evidenceScope: {
      includes: "actual quote-watch and CpgwAdapter code path with controlled public-safe transport latency",
      excludes: "real IBKR/CPGW network latency, authenticated session state, account data"
    },
    pollingDecision: pollingFitsFreshnessWindow
      ? "KEEP_BOUNDED_POLLING_IMPLEMENTATION"
      : "REOPEN_12_3_POLLING_TACTIC",
    liveProviderFollowUp: "Real provider latency remains target-machine evidence; do not infer it from this controlled CI probe."
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
});
