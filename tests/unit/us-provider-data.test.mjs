import assert from "node:assert/strict";
import test from "node:test";

import {
  SCREENER_HUL_ENDPOINT,
  buildScreenerHulUrl,
  buildValidatedSnapshot,
  fetchValidatedSnapshot
} from "../../browser/provider/us-screener.js";
import {
  buildUniverseFromSnapshot,
  sameCanonicalMembership
} from "../../browser/provider/us-universe.js";
import {
  buildUsCompleteCycle,
  collectUsCompleteCycle
} from "../../browser/collector/us-cycle.js";

function responseJson(payload, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return { ok, status, async json() { return payload; } };
}

function row(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    PaperNameEng: `Paper ${id}`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    Price: 0,
    DailyVolume: null,
    PaperMarketCap: "source-shaped-cap",
    TradeDateTime: "provider-time",
    ...extra
  };
}

function envelope(records, { screener = {}, envelope: outer = {} } = {}) {
  return {
    data: { ScreenerHulPaging: {
      recordCount: records.length,
      maxDateChange: "2026-10-04",
      records,
      ...screener
    } },
    resultCode: 0,
    rsCount: records.length,
    rtIsr: false,
    rtUsa: true,
    logtm: 11,
    reqtm: 12,
    responsetm: 13,
    serverId: "srv",
    version: "v1",
    ...outer
  };
}

const timing = (startedAtMs = 10, responseReceivedAtMs = 12, completedAtMs = 15) => ({
  startedAtMs,
  responseReceivedAtMs,
  completedAtMs
});

test("U.S. screener request uses the exact full-result contract", () => {
  const url = new URL(buildScreenerHulUrl(), "https://provider.invalid");
  assert.equal(url.pathname, SCREENER_HUL_ENDPOINT);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    region: "1", Country: "2", indexIdArray: "0", paperType: "1",
    sectorIdArray: "0", subSectorIdArray: "0",
    changePercentFrom: "-999999999", changePercentTo: "999999999",
    volumeFrom: "-999999999", volumeTo: "999999999",
    marketCapFrom: "-999999999999999", marketCapTo: "999999999999999",
    beginYearChangePercentFrom: "-999999999", beginYearChangePercentTo: "999999999",
    month12ChangePercentFrom: "-999999999", month12ChangePercentTo: "999999999",
    month36ChangePercentFrom: "-999999999", month36ChangePercentTo: "999999999",
    EsdRatingModeSelected: "0", EsdRatingModeValueSelected: "0",
    page: "1", pageCount: "5000", orderFieldName: "DailyVolume", orderDir: "DESC", rt: "true"
  });
});

test("validated snapshot preserves raw source-shaped values and safe metadata", () => {
  const first = row(1002, { Symbol: undefined, Price: 0, DailyVolume: null, PaperMarketCap: "raw-cap" });
  delete first.Symbol;
  const snapshot = buildValidatedSnapshot({
    responseJson: envelope([first, row("1001", { Price: 42.5 })]),
    timing: timing(),
    httpStatus: 200
  });

  assert.equal(snapshot.recordCount, 2);
  assert.deepEqual(snapshot.membership, ["1001", "1002"]);
  assert.deepEqual(snapshot.responseIds, ["1002", "1001"]);
  assert.equal(snapshot.records[0], first);
  assert.equal(snapshot.records[0].Price, 0);
  assert.equal(snapshot.records[0].DailyVolume, null);
  assert.equal(snapshot.records[0].PaperMarketCap, "raw-cap");
  assert.equal(snapshot.records[0].TradeDateTime, "provider-time");
  assert.equal(Object.hasOwn(snapshot.records[0], "Symbol"), false);
  assert.equal(snapshot.sourceMetadata.rtUsa, true);
  assert.equal(snapshot.sourceMetadata.serverId, "srv");
  assert.match(snapshot.warnings[0], /Symbol/);
});

test("PaperId is canonical identity and membership ignores row order", () => {
  const a = buildValidatedSnapshot({ responseJson: envelope([row(10), row(2), row(7)]), timing: timing() });
  const b = buildValidatedSnapshot({ responseJson: envelope([row(7), row(10), row(2)]), timing: timing() });
  assert.deepEqual(a.membership, ["10", "2", "7"]);
  assert.deepEqual(b.membership, a.membership);
  assert.deepEqual(a.responseIds, ["10", "2", "7"]);
  assert.deepEqual(b.responseIds, ["7", "10", "2"]);
  assert.equal(sameCanonicalMembership(a.membership, b.membership), true);
  assert.equal(buildUniverseFromSnapshot(a).recordCount, 3);
});

test("provider rejects incomplete, malformed, missing/duplicate identity and failed resultCode", () => {
  const base = { timing: timing(), httpStatus: 200 };
  assert.throws(() => buildValidatedSnapshot({
    ...base,
    responseJson: envelope([row(1)], { screener: { recordCount: 2 } })
  }), /recordCount.*records.length/i);
  assert.throws(() => buildValidatedSnapshot({ ...base, responseJson: { data: {} } }), /ScreenerHulPaging/);
  assert.throws(() => buildValidatedSnapshot({ ...base, responseJson: envelope([{ Symbol: "BAD" }]) }), /PaperId/);
  assert.throws(() => buildValidatedSnapshot({ ...base, responseJson: envelope([row(1), row("1")]) }), /duplicate PaperId/i);
  assert.throws(() => buildValidatedSnapshot({
    ...base,
    responseJson: envelope([row(1)], { envelope: { resultCode: 7 } })
  }), /resultCode/);
});

test("provider rejects HTTP failures and invalid recordCount", () => {
  assert.throws(() => buildValidatedSnapshot({
    responseJson: envelope([row(1)]), timing: timing(), httpStatus: 503
  }), /HTTP 503/);
  for (const recordCount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildValidatedSnapshot({
      responseJson: envelope([row(1)], { screener: { recordCount } }), timing: timing()
    }), /recordCount/);
  }
});

test("fetch is one same-origin request with exact timing and fails closed on HTTP/JSON", async () => {
  const times = [20, 25, 29];
  const calls = [];
  const snapshot = await fetchValidatedSnapshot({
    fetchImpl: async (url) => { calls.push(url); return responseJson(envelope([row(1)])); },
    now: () => times.shift()
  });
  assert.deepEqual(calls, [buildScreenerHulUrl()]);
  assert.deepEqual(snapshot.timing, {
    startedAtMs: 20, responseReceivedAtMs: 25, completedAtMs: 29,
    requestDurationMs: 5, parseDurationMs: 4, durationMs: 9
  });
  await assert.rejects(fetchValidatedSnapshot({
    fetchImpl: async () => responseJson({}, { status: 503, ok: false }), now: () => 1
  }), /HTTP 503/);
  await assert.rejects(fetchValidatedSnapshot({
    fetchImpl: async () => ({ ok: true, status: 200, async json() { throw new SyntaxError("bad json"); } }),
    now: () => 1
  }), /bad json/);
});

test("one full U.S. response becomes exactly one segment with raw rows", async () => {
  const records = [row(2), row(1)];
  const snapshot = buildValidatedSnapshot({ responseJson: envelope(records), timing: timing(100, 105, 108) });
  const cycle = buildUsCompleteCycle({ snapshot });
  assert.equal(cycle.status, "complete");
  assert.deepEqual(
    { requested: cycle.requested, received: cycle.received, unique: cycle.unique, missing: cycle.missing, duplicates: cycle.duplicates, unexpected: cycle.unexpected },
    { requested: 2, received: 2, unique: 2, missing: 0, duplicates: 0, unexpected: 0 }
  );
  assert.equal(cycle.chunks.length, 1);
  assert.equal(cycle.chunks[0].chunkIndex, 0);
  assert.ok(cycle.securities.every((item) => item.chunkIndex === 0));
  assert.equal(cycle.securities[0].data, records[0]);

  let calls = 0;
  const collected = await collectUsCompleteCycle({ fetchSnapshot: async () => { calls++; return snapshot; } });
  assert.equal(calls, 1);
  assert.equal(collected.chunks.length, 1);
});

test("U.S. collection failures expose stable fail-closed phases", async () => {
  await assert.rejects(
    collectUsCompleteCycle({ fetchSnapshot: async () => { throw new Error("provider failed"); } }),
    (error) => error.message === "provider failed" && error.marketFlowUsPhase === "provider-fetch"
  );
  await assert.rejects(
    collectUsCompleteCycle({ fetchSnapshot: async () => ({ recordCount: 1 }) }),
    (error) => error.marketFlowUsPhase === "cycle-validation"
  );
});
