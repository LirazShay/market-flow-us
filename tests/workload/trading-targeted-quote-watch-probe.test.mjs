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
const READY_POLL_CYCLES = 8;
const RETRY_POLL_CYCLES = 4;
const PROVIDER_DELAY_MS = 10;
const SNAPSHOT_RETRY_DELAY_MS = 200;
const MAX_QUOTE_AGE_MS = 1_000;
const READY_REQUESTS_PER_INSTRUMENT = 3;
const RETRY_REQUESTS_PER_INSTRUMENT = 4;

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

function createControlledCpgwTransport({ providerDelayMs, retryFirstSnapshot }) {
  const requestLog = [];
  const snapshotCallsByConid = new Map();
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
        const snapshotCall = (snapshotCallsByConid.get(conid) ?? 0) + 1;
        snapshotCallsByConid.set(conid, snapshotCall);
        const firstAttemptOfPoll = snapshotCall % 2 === 1;
        if (retryFirstSnapshot && firstAttemptOfPoll) {
          return [{
            conid,
            "6509": "RpB",
            _updated: Date.now()
          }];
        }
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

async function measureScenario({ providerDelayMs, retryFirstSnapshot, pollCycles }) {
  const transport = createControlledCpgwTransport({ providerDelayMs, retryFirstSnapshot });
  let retryWaitCalls = 0;
  const adapter = new CpgwAdapter({
    requestJson: transport.requestJson,
    sleep: async (ms) => {
      retryWaitCalls += 1;
      assert.equal(ms, SNAPSHOT_RETRY_DELAY_MS);
      await sleep(ms);
    }
  });
  const watch = createTargetedQuoteWatch({
    adapter,
    maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
    maxInstruments: SHORTLIST_SIZE
  });
  const durationsMs = [];
  const providerAgesAtPollReturnMs = [];
  let freshObservations = 0;
  let freshAtPollReturnObservations = 0;

  for (let cycle = 0; cycle < pollCycles; cycle += 1) {
    const startedAt = performance.now();
    const observations = await watch.poll(INSTRUMENTS);
    durationsMs.push(performance.now() - startedAt);
    const completedAtMs = Date.now();

    assert.equal(observations.length, SHORTLIST_SIZE);
    for (const observation of observations) {
      assert.equal(observation.availability, "AVAILABLE");
      assert.equal(observation.staleness, "FRESH");
      assert.equal(observation.usableForNewDecision, true);
      assert.ok(Number.isSafeInteger(observation.providerUpdatedAtMs));
      freshObservations += 1;

      const providerAgeAtPollReturnMs = completedAtMs - observation.providerUpdatedAtMs;
      assert.ok(providerAgeAtPollReturnMs >= 0);
      providerAgesAtPollReturnMs.push(providerAgeAtPollReturnMs);
      if (providerAgeAtPollReturnMs <= MAX_QUOTE_AGE_MS) {
        freshAtPollReturnObservations += 1;
      }
    }
  }

  const requestsPerInstrument = retryFirstSnapshot
    ? RETRY_REQUESTS_PER_INSTRUMENT
    : READY_REQUESTS_PER_INSTRUMENT;
  const requestsPerPoll = SHORTLIST_SIZE * requestsPerInstrument;
  const expectedRequests = pollCycles * requestsPerPoll;
  const expectedRetryWaits = retryFirstSnapshot ? pollCycles * SHORTLIST_SIZE : 0;
  assert.equal(transport.requestLog.length, expectedRequests);
  assert.equal(retryWaitCalls, expectedRetryWaits);

  return {
    providerDelayMs,
    retryFirstSnapshot,
    pollCycles,
    requestsPerInstrument,
    requestsPerPoll,
    providerRequests: transport.requestLog.length,
    retryWaitCalls,
    freshObservations,
    freshAtPollReturnObservations,
    maxProviderAgeAtPollReturnMs: Math.max(...providerAgesAtPollReturnMs),
    meanPollMs: roundMs(durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length),
    p50PollMs: roundMs(percentile(durationsMs, 0.5)),
    p95PollMs: roundMs(percentile(durationsMs, 0.95)),
    maxPollMs: roundMs(Math.max(...durationsMs))
  };
}

test("TREE 12.3 bounded quote-watch workload measures ready and retry polling cadence/cost through the real CPGW adapter seam", { timeout: 30_000 }, async () => {
  const cpuBefore = process.cpuUsage();
  const rssBeforeBytes = process.memoryUsage().rss;

  const zeroDelayReady = await measureScenario({
    providerDelayMs: 0,
    retryFirstSnapshot: false,
    pollCycles: READY_POLL_CYCLES
  });
  const controlledReady = await measureScenario({
    providerDelayMs: PROVIDER_DELAY_MS,
    retryFirstSnapshot: false,
    pollCycles: READY_POLL_CYCLES
  });
  const controlledRetry = await measureScenario({
    providerDelayMs: PROVIDER_DELAY_MS,
    retryFirstSnapshot: true,
    pollCycles: RETRY_POLL_CYCLES
  });

  const cpu = process.cpuUsage(cpuBefore);
  const rssAfterBytes = process.memoryUsage().rss;
  const readyProviderFloorMs = controlledReady.requestsPerPoll * PROVIDER_DELAY_MS;
  const retryProviderFloorMs = (
    controlledRetry.requestsPerPoll * PROVIDER_DELAY_MS
    + SHORTLIST_SIZE * SNAPSHOT_RETRY_DELAY_MS
  );
  const readyOverheadAboveFloorMs = Math.max(0, controlledReady.p95PollMs - readyProviderFloorMs);
  const retryOverheadAboveFloorMs = Math.max(0, controlledRetry.p95PollMs - retryProviderFloorMs);
  const expectedRetryObservations = RETRY_POLL_CYCLES * SHORTLIST_SIZE;
  const controlledRetryFreshAtPollReturn = (
    controlledRetry.freshAtPollReturnObservations === expectedRetryObservations
  );

  const report = {
    schemaVersion: 2,
    product: "Market Flow US",
    task: "12.3",
    profile: "ci-controlled-cpgw-seam",
    publicSafe: true,
    shortlistSize: SHORTLIST_SIZE,
    maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
    snapshotRetryDelayMs: SNAPSHOT_RETRY_DELAY_MS,
    providerRequestTopology: {
      readySnapshot: {
        requestsPerInstrument: READY_REQUESTS_PER_INSTRUMENT,
        requestsPerPoll: SHORTLIST_SIZE * READY_REQUESTS_PER_INSTRUMENT,
        note: "secdef search + secdef info + ready marketdata snapshot"
      },
      firstSnapshotUnready: {
        requestsPerInstrument: RETRY_REQUESTS_PER_INSTRUMENT,
        requestsPerPoll: SHORTLIST_SIZE * RETRY_REQUESTS_PER_INSTRUMENT,
        retryWaitsPerPoll: SHORTLIST_SIZE,
        note: "secdef search + secdef info + unready snapshot + 200ms adapter wait + ready snapshot"
      }
    },
    zeroDelayReady,
    controlledReady,
    controlledRetry,
    readyProviderFloorMs,
    retryProviderFloorMs,
    readyOverheadAboveFloorMs: roundMs(readyOverheadAboveFloorMs),
    retryOverheadAboveFloorMs: roundMs(retryOverheadAboveFloorMs),
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    rssBeforeBytes,
    rssAfterBytes,
    rssDeltaBytes: rssAfterBytes - rssBeforeBytes,
    evidenceScope: {
      includes: "actual quote-watch and CpgwAdapter ready/retry code paths with controlled public-safe transport latency and the adapter's real 200ms retry wait",
      excludes: "real IBKR/CPGW network latency, authenticated session state, account data"
    },
    pollingDecision: controlledRetryFreshAtPollReturn
      ? "KEEP_BOUNDED_POLLING_UNTIL_REAL_PROVIDER_EVIDENCE_INVALIDATES"
      : "REOPEN_12_3_POLLING_TACTIC",
    decisionBasis: {
      controlledRetryFreshAtPollReturn,
      expectedRetryObservations,
      actualFreshAtPollReturnObservations: controlledRetry.freshAtPollReturnObservations,
      maxProviderAgeAtPollReturnMs: controlledRetry.maxProviderAgeAtPollReturnMs
    },
    liveProviderFollowUp: "Real provider latency remains target-machine evidence; do not infer it from this controlled CI probe."
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  assert.equal(zeroDelayReady.providerRequests, READY_POLL_CYCLES * SHORTLIST_SIZE * READY_REQUESTS_PER_INSTRUMENT);
  assert.equal(controlledReady.providerRequests, READY_POLL_CYCLES * SHORTLIST_SIZE * READY_REQUESTS_PER_INSTRUMENT);
  assert.equal(controlledRetry.providerRequests, RETRY_POLL_CYCLES * SHORTLIST_SIZE * RETRY_REQUESTS_PER_INSTRUMENT);
  assert.equal(controlledRetry.retryWaitCalls, RETRY_POLL_CYCLES * SHORTLIST_SIZE);
  assert.equal(controlledRetry.freshObservations, expectedRetryObservations);
  assert.ok(
    controlledRetryFreshAtPollReturn,
    `controlled retry path returned evidence older than ${MAX_QUOTE_AGE_MS}ms at poll completion; reopen TREE 12.3 polling tactic`
  );
});
