import assert from "node:assert/strict";
import { test } from "node:test";

import { createTargetedQuoteWatch } from "../../trading-server/targeted-quote-watch.js";

const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});

function createRestartAdapter(snapshot) {
  const calls = [];
  return {
    calls,
    async resolveInstrument(instrument) {
      calls.push({ method: "resolveInstrument", instrument });
      return {
        status: "EXACT",
        conid: 265598,
        instrument: AAPL
      };
    },
    async getSnapshot({ resolution }) {
      calls.push({ method: "getSnapshot", conid: resolution.conid });
      return snapshot;
    }
  };
}

function createWatch(adapter, nowMs) {
  return createTargetedQuoteWatch({
    adapter,
    now: () => nowMs,
    maxQuoteAgeMs: 500,
    maxInstruments: 1
  });
}

function readyQuote({ last, updatedAtMs }) {
  return {
    status: "READY",
    conid: 265598,
    marketDataAvailability: "RpB",
    last,
    bid: last - 0.01,
    ask: last + 0.01,
    updatedAtMs
  };
}

const EXPECTED_PROVIDER_CALLS = Object.freeze([
  { method: "resolveInstrument", instrument: AAPL },
  { method: "getSnapshot", conid: 265598 }
]);

test("TREE 12.3 restart preserves explicit instrument identity while requiring fresh provider evidence", async () => {
  const firstAdapter = createRestartAdapter(readyQuote({
    last: 221.5,
    updatedAtMs: 9_950
  }));
  const firstWatch = createWatch(firstAdapter, 10_000);

  const [beforeRestart] = await firstWatch.poll([AAPL]);

  assert.equal(beforeRestart.availability, "AVAILABLE");
  assert.equal(beforeRestart.staleness, "FRESH");
  assert.equal(beforeRestart.usableForNewDecision, true);
  assert.equal(beforeRestart.last, 221.5);
  assert.equal(beforeRestart.providerUpdatedAtMs, 9_950);
  assert.equal(beforeRestart.receivedAtMs, 10_000);
  assert.deepEqual(beforeRestart.instrument, AAPL);
  assert.deepEqual(firstAdapter.calls, EXPECTED_PROVIDER_CALLS);

  const restartedAdapter = createRestartAdapter(readyQuote({
    last: 222.25,
    updatedAtMs: 19_950
  }));
  const restartedWatch = createWatch(restartedAdapter, 20_000);

  const [afterRestart] = await restartedWatch.poll([AAPL]);

  assert.deepEqual(afterRestart.instrument, AAPL);
  assert.equal(afterRestart.conid, 265598);
  assert.equal(afterRestart.availability, "AVAILABLE");
  assert.equal(afterRestart.staleness, "FRESH");
  assert.equal(afterRestart.usableForNewDecision, true);
  assert.equal(afterRestart.last, 222.25);
  assert.equal(afterRestart.providerUpdatedAtMs, 19_950);
  assert.equal(afterRestart.receivedAtMs, 20_000);
  assert.deepEqual(restartedAdapter.calls, EXPECTED_PROVIDER_CALLS);

  assert.equal(beforeRestart.last, 221.5);
  assert.equal(beforeRestart.receivedAtMs, 10_000);
});

test("TREE 12.3 restart never fabricates quote continuity when the provider is unavailable", async () => {
  const priorAdapter = createRestartAdapter(readyQuote({
    last: 221.5,
    updatedAtMs: 9_950
  }));
  const [priorObservation] = await createWatch(priorAdapter, 10_000).poll([AAPL]);
  assert.equal(priorObservation.usableForNewDecision, true);

  const unavailableAdapter = createRestartAdapter({ status: "UNAVAILABLE" });
  const restartedWatch = createWatch(unavailableAdapter, 30_000);

  const [afterRestart] = await restartedWatch.poll([AAPL]);

  assert.deepEqual(afterRestart.instrument, AAPL);
  assert.equal(afterRestart.resolutionStatus, "EXACT");
  assert.equal(afterRestart.conid, 265598);
  assert.equal(afterRestart.availability, "UNAVAILABLE");
  assert.equal(afterRestart.staleness, "UNKNOWN");
  assert.equal(afterRestart.usableForNewDecision, false);
  assert.equal(afterRestart.marketDataAvailability, null);
  assert.equal(afterRestart.last, null);
  assert.equal(afterRestart.bid, null);
  assert.equal(afterRestart.ask, null);
  assert.equal(afterRestart.providerUpdatedAtMs, null);
  assert.equal(afterRestart.receivedAtMs, 30_000);
  assert.deepEqual(unavailableAdapter.calls, EXPECTED_PROVIDER_CALLS);
});
