import assert from "node:assert/strict";
import test from "node:test";

import {
  SCREENER_HUL_ENDPOINT,
  buildScreenerHulUrl,
  buildValidatedSnapshot,
  fetchValidatedSnapshot
} from "../../browser/provider/securities.js";
import {
  buildUniverseFromSnapshot,
  sameCanonicalMembership
} from "../../browser/provider/universe.js";
import {
  buildCompleteCycle,
  collectCompleteCycle
} from "../../browser/collector/cycle.js";

function responseJson(payload, { status = 200, ok = status >= 200 && status < 300 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}

function usRecord(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    PaperNameEng: `Paper ${id}`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    Price: 0,
    DailyVolume: null,
    PaperMarketCap: "source-shaped-cap",
    TradeDateTime: "2026-10-04T19:00:00",
    ...extra
  };
}

function screenerEnvelope(records, extra = {}) {
  return {
    data: {
      ScreenerHulPaging: {
        recordCount: records.length,
        maxDateChange: "2026-10-04",
        records,
        ...(extra.screener ?? {})
      }
    },
    resultCode: 0,
    rsCount: records.length,
    rtIsr: false,
    rtUsa: true,
    logtm: 11,
    reqtm: 12,
    responsetm: 13,
    serverId: "srv",
    version: "v1",
    ...extra.envelope
  };
}

function timing(startedAtMs = 10, responseReceivedAtMs = 12, completedAtMs = 15) {
  return { startedAtMs, responseReceivedAtMs, completedAtMs };
}

test("ScreenerHulPaging3 request uses the exact same-origin U.S. full-result parameters", () => {
  const url = new URL(buildScreenerHulUrl(), "https://provider.invalid");

  assert.equal(url.pathname, SCREENER_HUL_ENDPOINT);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
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
});

test("validated U.S. snapshot preserves raw rows, source-shaped values and safe envelope metadata", () => {
  const first = usRecord(1002, {
    Symbol: undefined,
    Price: 0,
    DailyVolume: null,
    PaperMarketCap: "raw-cap",
    TradeDateTime: "provider-time"
  });
  delete first.Symbol;
  const second = usRecord("1001", { Price: 42.5 });
  const response = screenerEnvelope([first, second]);

  const snapshot = buildValidatedSnapshot({
    responseJson: response,
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
  assert.equal(snapshot.sourceMetadata.maxDateChange, "2026-10-04");
  assert.equal(snapshot.sourceMetadata.rtUsa, true);
  assert.equal(snapshot.sourceMetadata.serverId, "srv");
  assert.equal(snapshot.warnings.length, 1);
  assert.match(snapshot.warnings[0], /Symbol/);
  assert.deepEqual(snapshot.timing, {
    startedAtMs: 10,
    responseReceivedAtMs: 12,
    completedAtMs: 15,
    requestDurationMs: 2,
    parseDurationMs: 3,
    durationMs: 5
  });
});

test("complete U.S. response maps to one coherent one-segment cycle", () => {
  const records = [usRecord(2), usRecord(1)];
  const snapshot = buildValidatedSnapshot({
    responseJson: screenerEnvelope(records),
    timing: timing(100, 105, 108)
  });
  const cycle = buildCompleteCycle({ snapshot });

  assert.equal(cycle.status, "complete");
  assert.deepEqual(
    {
      requested: cycle.requested,
      received: cycle.received,
      unique: cycle.unique,
      missing: cycle.missing,
      duplicates: cycle.duplicates,
      unexpected: cycle.unexpected
    },
    { requested: 2, received: 2, unique: 2, missing: 0, duplicates: 0, unexpected: 0 }
  );
  assert.equal(cycle.chunks.length, 1);
  assert.equal(cycle.chunks[0].chunkIndex, 0);
  assert.equal(cycle.securities.length, 2);
  assert.deepEqual(cycle.securities.map((row) => row.securityId), ["2", "1"]);
  assert.ok(cycle.securities.every((row) => row.chunkIndex === 0));
  assert.ok(cycle.securities.every((row) => row.data === records[Number(row.securityId) === 2 ? 0 : 1]));
  assert.equal(cycle.securities[0].sourceMetadata, snapshot.sourceMetadata);
  assert.equal(Object.hasOwn(cycle, "cycleId"), false);
  assert.equal(Object.hasOwn(cycle, "sessionId"), false);
});

test("canonical membership is row-order independent while response order remains intact", () => {
  const a = buildValidatedSnapshot({
    responseJson: screenerEnvelope([usRecord(10), usRecord(2), usRecord(7)]),
    timing: timing()
  });
  const b = buildValidatedSnapshot({
    responseJson: screenerEnvelope([usRecord(7), usRecord(10), usRecord(2)]),
    timing: timing()
  });

  assert.deepEqual(a.membership, ["10", "2", "7"]);
  assert.deepEqual(b.membership, ["10", "2", "7"]);
  assert.deepEqual(a.responseIds, ["10", "2", "7"]);
  assert.deepEqual(b.responseIds, ["7", "10", "2"]);
  assert.equal(sameCanonicalMembership(a.membership, b.membership), true);

  const universeA = buildUniverseFromSnapshot(a);
  const universeB = buildUniverseFromSnapshot(b);
  assert.equal(universeA.recordCount, 3);
  assert.equal(universeB.recordCount, 3);
  assert.equal(sameCanonicalMembership(universeA.membership, universeB.membership), true);
});

test("provider validation rejects count mismatch, malformed shape, missing/duplicate PaperId and failed resultCode", () => {
  const base = { timing: timing(), httpStatus: 200 };

  assert.throws(
    () => buildValidatedSnapshot({
      ...base,
      responseJson: screenerEnvelope([usRecord(1)], { screener: { recordCount: 2 } })
    }),
    /recordCount.*records.length/i
  );

  assert.throws(
    () => buildValidatedSnapshot({ ...base, responseJson: { data: {} } }),
    /ScreenerHulPaging/
  );

  assert.throws(
    () => buildValidatedSnapshot({
      ...base,
      responseJson: screenerEnvelope([{ Symbol: "BAD" }])
    }),
    /PaperId/
  );

  assert.throws(
    () => buildValidatedSnapshot({
      ...base,
      responseJson: screenerEnvelope([usRecord(1), usRecord("1")])
    }),
    /duplicate PaperId/i
  );

  assert.throws(
    () => buildValidatedSnapshot({
      ...base,
      responseJson: screenerEnvelope([usRecord(1)], { envelope: { resultCode: 7 } })
    }),
    /resultCode/
  );
});

test("provider validation rejects non-2xx and non-positive/unsafe recordCount", () => {
  assert.throws(
    () => buildValidatedSnapshot({
      responseJson: screenerEnvelope([usRecord(1)]),
      timing: timing(),
      httpStatus: 503
    }),
    /HTTP 503/
  );

  for (const recordCount of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
    assert.throws(
      () => buildValidatedSnapshot({
        responseJson: screenerEnvelope([usRecord(1)], { screener: { recordCount } }),
        timing: timing()
      }),
      /recordCount/
    );
  }
});

test("fetch adapter records exact local timing and fails closed on HTTP or malformed JSON", async () => {
  const times = [20, 25, 29];
  const calls = [];
  const snapshot = await fetchValidatedSnapshot({
    fetchImpl: async (url) => {
      calls.push(url);
      return responseJson(screenerEnvelope([usRecord(1)]));
    },
    now: () => times.shift()
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0], buildScreenerHulUrl());
  assert.equal(snapshot.timing.startedAtMs, 20);
  assert.equal(snapshot.timing.responseReceivedAtMs, 25);
  assert.equal(snapshot.timing.completedAtMs, 29);

  await assert.rejects(
    fetchValidatedSnapshot({
      fetchImpl: async () => responseJson({}, { status: 503, ok: false }),
      now: () => 1
    }),
    /HTTP 503/
  );

  await assert.rejects(
    fetchValidatedSnapshot({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new SyntaxError("bad json");
        }
      }),
      now: () => 1
    }),
    /bad json/
  );
});

test("collectCompleteCycle uses exactly one validated provider response", async () => {
  let calls = 0;
  const snapshot = buildValidatedSnapshot({
    responseJson: screenerEnvelope([usRecord(1), usRecord(2)]),
    timing: timing(30, 31, 32)
  });

  const cycle = await collectCompleteCycle({
    fetchSnapshot: async () => {
      calls++;
      return snapshot;
    }
  });

  assert.equal(calls, 1);
  assert.equal(cycle.chunks.length, 1);
  assert.equal(cycle.chunks[0].chunkIndex, 0);
  assert.equal(cycle.requested, 2);
});
