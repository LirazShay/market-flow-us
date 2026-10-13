import assert from "node:assert/strict";
import { test } from "node:test";

import { createTargetedQuoteWatch } from "../../trading-server/targeted-quote-watch.js";

const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});

const MSFT = Object.freeze({
  symbol: "MSFT",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});

function exact(conid) {
  return {
    status: "EXACT",
    conid,
    instrument: conid === 265598 ? AAPL : MSFT
  };
}

function ready({
  conid,
  last,
  bid,
  ask,
  updatedAtMs,
  marketDataAvailability = "RpB"
}) {
  return {
    status: "READY",
    conid,
    last,
    bid,
    ask,
    updatedAtMs,
    marketDataAvailability
  };
}

function scriptedAdapter({ resolutions, snapshots = new Map() }) {
  const calls = [];
  return {
    calls,
    async resolveInstrument(instrument) {
      calls.push({ method: "resolveInstrument", instrument });
      return resolutions.get(instrument.symbol) ?? { status: "UNRESOLVED" };
    },
    async getSnapshot({ resolution }) {
      calls.push({ method: "getSnapshot", conid: resolution.conid });
      return snapshots.get(resolution.conid) ?? { status: "UNAVAILABLE" };
    }
  };
}

function assertFailClosed(observation, { availability, resolutionStatus }) {
  assert.equal(observation.availability, availability);
  assert.equal(observation.resolutionStatus, resolutionStatus);
  assert.equal(observation.staleness, "UNKNOWN");
  assert.equal(observation.usableForNewDecision, false);
  assert.equal(observation.last, null);
  assert.equal(observation.bid, null);
  assert.equal(observation.ask, null);
  assert.equal(observation.providerUpdatedAtMs, null);
}

test("TREE 12.3 exact fresh quote records provider and local timestamps without duplicating provider resolution", async () => {
  const nowMs = 10_000;
  const adapter = scriptedAdapter({
    resolutions: new Map([["AAPL", exact(265598)]]),
    snapshots: new Map([[
      265598,
      ready({
        conid: 265598,
        last: 221.5,
        bid: 221.49,
        ask: 221.51,
        updatedAtMs: 9_900
      })
    ]])
  });
  const watch = createTargetedQuoteWatch({
    adapter,
    now: () => nowMs,
    maxQuoteAgeMs: 500,
    maxInstruments: 4
  });

  const observations = await watch.poll([AAPL]);

  assert.deepEqual(observations, [{
    instrument: AAPL,
    resolutionStatus: "EXACT",
    conid: 265598,
    availability: "AVAILABLE",
    staleness: "FRESH",
    usableForNewDecision: true,
    marketDataAvailability: "RpB",
    last: 221.5,
    bid: 221.49,
    ask: 221.51,
    providerUpdatedAtMs: 9_900,
    receivedAtMs: nowMs
  }]);
  assert.deepEqual(adapter.calls, [
    { method: "resolveInstrument", instrument: AAPL },
    { method: "getSnapshot", conid: 265598 }
  ]);
});

test("TREE 12.3 stale or unprovable provider time remains available but fails closed for new decisions", async () => {
  for (const [updatedAtMs, expectedStaleness] of [
    [9_000, "STALE"],
    [null, "UNKNOWN"],
    [10_001, "UNKNOWN"]
  ]) {
    const adapter = scriptedAdapter({
      resolutions: new Map([["AAPL", exact(265598)]]),
      snapshots: new Map([[
        265598,
        ready({
          conid: 265598,
          last: 221.5,
          bid: 221.49,
          ask: 221.51,
          updatedAtMs
        })
      ]])
    });
    const watch = createTargetedQuoteWatch({
      adapter,
      now: () => 10_000,
      maxQuoteAgeMs: 500,
      maxInstruments: 4
    });

    const [observation] = await watch.poll([AAPL]);

    assert.equal(observation.availability, "AVAILABLE");
    assert.equal(observation.staleness, expectedStaleness);
    assert.equal(observation.usableForNewDecision, false);
    assert.equal(observation.providerUpdatedAtMs, updatedAtMs);
    assert.equal(observation.receivedAtMs, 10_000);
  }
});

test("TREE 12.3 unresolved, ambiguous and unavailable quote authority fail closed without raw provider data", async () => {
  for (const [resolution, expectedAvailability] of [
    [{ status: "UNRESOLVED" }, "UNRESOLVED"],
    [{ status: "AMBIGUOUS" }, "AMBIGUOUS"]
  ]) {
    const adapter = scriptedAdapter({
      resolutions: new Map([["AAPL", resolution]])
    });
    const watch = createTargetedQuoteWatch({
      adapter,
      now: () => 10_000,
      maxQuoteAgeMs: 500,
      maxInstruments: 4
    });

    const [observation] = await watch.poll([AAPL]);

    assertFailClosed(observation, {
      availability: expectedAvailability,
      resolutionStatus: resolution.status
    });
    assert.equal(observation.receivedAtMs, 10_000);
    assert.equal(adapter.calls.filter((call) => call.method === "getSnapshot").length, 0);
  }

  const unavailableAdapter = scriptedAdapter({
    resolutions: new Map([["AAPL", exact(265598)]])
  });
  const unavailableWatch = createTargetedQuoteWatch({
    adapter: unavailableAdapter,
    now: () => 10_000,
    maxQuoteAgeMs: 500,
    maxInstruments: 4
  });

  const [unavailable] = await unavailableWatch.poll([AAPL]);

  assertFailClosed(unavailable, {
    availability: "UNAVAILABLE",
    resolutionStatus: "EXACT"
  });
  assert.equal(unavailable.conid, 265598);
  assert.equal(unavailable.receivedAtMs, 10_000);
});

test("TREE 12.3 one-shot polling is shortlist-bounded and rejects duplicate provider work before dispatch", async () => {
  const adapter = scriptedAdapter({
    resolutions: new Map([
      ["AAPL", exact(265598)],
      ["MSFT", exact(272093)]
    ]),
    snapshots: new Map([
      [265598, ready({ conid: 265598, last: 221.5, bid: 221.49, ask: 221.51, updatedAtMs: 9_950 })],
      [272093, ready({ conid: 272093, last: 420.2, bid: 420.19, ask: 420.21, updatedAtMs: 9_950 })]
    ])
  });
  const watch = createTargetedQuoteWatch({
    adapter,
    now: () => 10_000,
    maxQuoteAgeMs: 500,
    maxInstruments: 2
  });

  const observations = await watch.poll([AAPL, MSFT]);
  assert.equal(observations.length, 2);
  assert.equal(adapter.calls.filter((call) => call.method === "resolveInstrument").length, 2);
  assert.equal(adapter.calls.filter((call) => call.method === "getSnapshot").length, 2);

  const beforeRejectedPoll = adapter.calls.length;
  await assert.rejects(
    watch.poll([AAPL, MSFT, { ...AAPL, symbol: "NVDA" }]),
    /maxInstruments|shortlist|bound/iu
  );
  assert.equal(adapter.calls.length, beforeRejectedPoll);

  await assert.rejects(
    watch.poll([AAPL, AAPL]),
    /duplicate/iu
  );
  assert.equal(adapter.calls.length, beforeRejectedPoll);
});

test("TREE 12.3 watch configuration and instrument contract fail before provider dispatch", async () => {
  const adapter = scriptedAdapter({ resolutions: new Map() });

  assert.throws(
    () => createTargetedQuoteWatch({ adapter, maxQuoteAgeMs: 0, maxInstruments: 2 }),
    /maxQuoteAgeMs/iu
  );
  assert.throws(
    () => createTargetedQuoteWatch({ adapter, maxQuoteAgeMs: 500, maxInstruments: 0 }),
    /maxInstruments/iu
  );

  const watch = createTargetedQuoteWatch({
    adapter,
    now: () => 10_000,
    maxQuoteAgeMs: 500,
    maxInstruments: 2
  });

  for (const invalidInstrument of [
    { ...AAPL, symbol: "" },
    { ...AAPL, secType: "OPT" },
    { ...AAPL, currency: "EUR" },
    { ...AAPL, exchange: "NASDAQ" }
  ]) {
    await assert.rejects(watch.poll([invalidInstrument]), /instrument|STK|USD|SMART/iu);
  }
  assert.equal(adapter.calls.length, 0);
});
