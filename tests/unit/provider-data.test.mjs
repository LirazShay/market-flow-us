import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMapHeatUrl,
  buildValidatedUniverse,
  loadValidatedUniverse
} from "../../browser/provider/universe.js";
import {
  buildGetSecuritiesDataUrl,
  buildValidatedChunk,
  fetchValidatedChunk
} from "../../browser/provider/securities.js";
import {
  buildCompleteCycle,
  collectCompleteCycle,
  planUniverseChunks
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

function mapRecord(id, extra = {}) {
  return { PaperId: id, PaperName: `Paper ${id}`, DateChange: 0, ...extra };
}

function securityRecord(id, extra = {}) {
  return { Key: id, LastRate: 0, Bid1: null, EmptyValue: "", ...extra };
}

test("MapHeat adapter uses the same-origin two-step dynamic-universe contract", async () => {
  const calls = [];
  const records = [
    mapRecord(1001, { MissingOptional: undefined }),
    mapRecord("1002"),
    mapRecord(1003),
    mapRecord(1004)
  ];
  const fetchImpl = async (url) => {
    calls.push(url);
    const pageCount = Number(new URL(url, "https://provider.invalid").searchParams.get("pageCount"));
    if (pageCount === 1) {
      return responseJson({ data: { MapHeat: { recordCount: records.length, records: [records[0]] } } });
    }
    return responseJson({ data: { MapHeat: { recordCount: records.length, records } } });
  };

  const universe = await loadValidatedUniverse({ fetchImpl, now: () => 1234 });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /^\/lti\/lti-app\/api\/MarketFast\/MapHeat2\?/);
  assert.equal(new URL(calls[0], "https://provider.invalid").searchParams.get("pageCount"), "1");
  assert.equal(new URL(calls[1], "https://provider.invalid").searchParams.get("pageCount"), "4");
  assert.equal(universe.loadedAtMs, 1234);
  assert.equal(universe.recordCount, 4);
  assert.deepEqual(universe.securities.map((row) => row.securityId), ["1001", "1002", "1003", "1004"]);
  assert.equal(universe.securities[0].paperName, "Paper 1001");
  assert.equal(universe.securities[0].mapHeatDateChange, 0);
  assert.equal(universe.securities[0].rawMapHeat, records[0]);
});

test("universe validation rejects count drift, missing PaperId and canonical duplicates", () => {
  assert.throws(
    () => buildValidatedUniverse({
      initialRecordCount: 2,
      fullMap: { recordCount: 3, records: [mapRecord(1), mapRecord(2), mapRecord(3)] },
      loadedAtMs: 1
    }),
    /recordCount changed/
  );

  assert.throws(
    () => buildValidatedUniverse({
      initialRecordCount: 2,
      fullMap: { recordCount: 2, records: [mapRecord(1), { PaperName: "bad" }] },
      loadedAtMs: 1
    }),
    /without PaperId/
  );

  assert.throws(
    () => buildValidatedUniverse({
      initialRecordCount: 2,
      fullMap: { recordCount: 2, records: [mapRecord(1), mapRecord("1")] },
      loadedAtMs: 1
    }),
    /duplicate PaperId/
  );
});

test("provider URL builders preserve the proven endpoint/query contracts", () => {
  const mapUrl = new URL(buildMapHeatUrl(7), "https://provider.invalid");
  assert.equal(mapUrl.pathname, "/lti/lti-app/api/MarketFast/MapHeat2");
  assert.equal(mapUrl.searchParams.get("page"), "1");
  assert.equal(mapUrl.searchParams.get("pageCount"), "7");
  assert.equal(mapUrl.searchParams.get("orderFieldName"), "DailyNumDeals");
  assert.equal(mapUrl.searchParams.get("rt"), "true");

  const securitiesUrl = new URL(buildGetSecuritiesDataUrl([1001, "1002"]), "https://provider.invalid");
  assert.equal(securitiesUrl.pathname, "/lti/lti-app/api/SecuritiesFast/GetSecuritiesData");
  assert.equal(securitiesUrl.searchParams.get("securityIds"), "1001,1002");
  assert.equal(securitiesUrl.searchParams.get("responseType"), "1");
  assert.equal(securitiesUrl.searchParams.get("is_gto"), "true");
  assert.equal(securitiesUrl.searchParams.get("force"), "false");
});

test("validated chunk accepts response reordering and preserves raw zero/null/empty/missing values", () => {
  const first = securityRecord("1002", { OptionalMissing: undefined });
  delete first.OptionalMissing;
  const second = securityRecord(1001, { LastRate: 42 });
  const chunk = buildValidatedChunk({
    securityIds: [1001, "1002"],
    responseJson: {
      data: {
        SecuritiesData: {
          Table: {
            AsOfDate: "",
            Security: [first, second]
          }
        }
      }
    },
    timing: {
      startedAtMs: 10,
      responseReceivedAtMs: 12,
      completedAtMs: 15
    },
    httpStatus: 200
  });

  assert.deepEqual(chunk.requestedIds, ["1001", "1002"]);
  assert.deepEqual(chunk.responseIds, ["1002", "1001"]);
  assert.equal(chunk.requestedCount, 2);
  assert.equal(chunk.receivedCount, 2);
  assert.equal(chunk.uniqueCount, 2);
  assert.equal(chunk.serverAsOfDate, "");
  assert.equal(chunk.records[0], first);
  assert.equal(chunk.records[0].LastRate, 0);
  assert.equal(chunk.records[0].Bid1, null);
  assert.equal(chunk.records[0].EmptyValue, "");
  assert.equal(Object.hasOwn(chunk.records[0], "OptionalMissing"), false);
  assert.deepEqual(chunk.timing, {
    startedAtMs: 10,
    responseReceivedAtMs: 12,
    completedAtMs: 15,
    requestDurationMs: 2,
    parseDurationMs: 3,
    durationMs: 5
  });
});

test("chunk validation reports missing, duplicate and unexpected membership", () => {
  const base = {
    timing: { startedAtMs: 1, responseReceivedAtMs: 2, completedAtMs: 3 },
    httpStatus: 200
  };

  assert.throws(
    () => buildValidatedChunk({
      ...base,
      securityIds: ["1", "2"],
      responseJson: { data: { SecuritiesData: { Table: { Security: [securityRecord("1")] } } } }
    }),
    /missing=\[2\]/
  );

  assert.throws(
    () => buildValidatedChunk({
      ...base,
      securityIds: ["1", "2"],
      responseJson: { data: { SecuritiesData: { Table: { Security: [securityRecord("1"), securityRecord(1)] } } } }
    }),
    /duplicate Key/
  );

  assert.throws(
    () => buildValidatedChunk({
      ...base,
      securityIds: ["1", "2"],
      responseJson: { data: { SecuritiesData: { Table: { Security: [securityRecord("1"), securityRecord("3")] } } } }
    }),
    /unexpected=\[3\]/
  );
});

test("thin securities adapter records exact local timing and rejects HTTP failure", async () => {
  const times = [10, 15, 18];
  const chunk = await fetchValidatedChunk({
    securityIds: ["1001"],
    fetchImpl: async () => responseJson({
      data: { SecuritiesData: { Table: { AsOfDate: null, Security: [securityRecord("1001")] } } }
    }),
    now: () => times.shift()
  });

  assert.equal(chunk.timing.startedAtMs, 10);
  assert.equal(chunk.timing.responseReceivedAtMs, 15);
  assert.equal(chunk.timing.completedAtMs, 18);

  await assert.rejects(
    fetchValidatedChunk({
      securityIds: ["1001"],
      fetchImpl: async () => responseJson({}, { status: 503, ok: false }),
      now: () => 1
    }),
    /HTTP 503/
  );
});

test("complete cycle validates exact whole-universe membership and contains no Node durable IDs", () => {
  const records = [mapRecord(1001), mapRecord(1002), mapRecord(1003)];
  const universe = buildValidatedUniverse({
    initialRecordCount: 3,
    fullMap: { recordCount: 3, records },
    loadedAtMs: 1
  });
  const plannedChunks = planUniverseChunks(universe, 2);
  const chunkResults = [
    buildValidatedChunk({
      securityIds: plannedChunks[0],
      responseJson: { data: { SecuritiesData: { Table: { AsOfDate: "A", Security: [securityRecord("1002"), securityRecord("1001")] } } } },
      timing: { startedAtMs: 10, responseReceivedAtMs: 11, completedAtMs: 12 }
    }),
    buildValidatedChunk({
      securityIds: plannedChunks[1],
      responseJson: { data: { SecuritiesData: { Table: { AsOfDate: "B", Security: [securityRecord("1003")] } } } },
      timing: { startedAtMs: 13, responseReceivedAtMs: 14, completedAtMs: 15 }
    })
  ];

  const cycle = buildCompleteCycle({
    universe,
    plannedChunks,
    chunkResults,
    startedAtMs: 10,
    completedAtMs: 15
  });

  assert.equal(cycle.status, "complete");
  assert.deepEqual(
    { requested: cycle.requested, received: cycle.received, unique: cycle.unique, missing: cycle.missing, duplicates: cycle.duplicates, unexpected: cycle.unexpected },
    { requested: 3, received: 3, unique: 3, missing: 0, duplicates: 0, unexpected: 0 }
  );
  assert.deepEqual(cycle.securities.map((row) => row.securityId), ["1002", "1001", "1003"]);
  assert.equal(cycle.securities[0].data.Key, "1002");
  assert.equal(Object.hasOwn(cycle, "cycleId"), false);
  assert.equal(Object.hasOwn(cycle, "sessionId"), false);
});

test("complete-cycle validation rejects wrong chunk binding and cross-chunk duplicates", () => {
  const records = [mapRecord(1), mapRecord(2)];
  const universe = buildValidatedUniverse({
    initialRecordCount: 2,
    fullMap: { recordCount: 2, records },
    loadedAtMs: 1
  });
  const plannedChunks = [["1"], ["2"]];

  const one = buildValidatedChunk({
    securityIds: ["1"],
    responseJson: { data: { SecuritiesData: { Table: { Security: [securityRecord("1")] } } } },
    timing: { startedAtMs: 1, responseReceivedAtMs: 2, completedAtMs: 3 }
  });

  assert.throws(
    () => buildCompleteCycle({
      universe,
      plannedChunks,
      chunkResults: [one, one],
      startedAtMs: 1,
      completedAtMs: 3
    }),
    /chunk 1 requested IDs/
  );
});

test("collector runs chunks strictly sequentially, delays only between chunks, and stops on provider failure", async () => {
  const universe = buildValidatedUniverse({
    initialRecordCount: 5,
    fullMap: { recordCount: 5, records: [1, 2, 3, 4, 5].map(mapRecord) },
    loadedAtMs: 1
  });

  let active = 0;
  let maxActive = 0;
  const calls = [];
  const delays = [];
  let nowValue = 100;

  const cycle = await collectCompleteCycle({
    universe,
    chunkSize: 2,
    chunkDelayMs: 7,
    now: () => nowValue++,
    sleep: async (ms) => {
      delays.push(ms);
    },
    fetchChunk: async (ids) => {
      calls.push([...ids]);
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return buildValidatedChunk({
        securityIds: ids,
        responseJson: { data: { SecuritiesData: { Table: { Security: ids.map(securityRecord) } } } },
        timing: { startedAtMs: nowValue, responseReceivedAtMs: nowValue + 1, completedAtMs: nowValue + 2 }
      });
    }
  });

  assert.deepEqual(calls, [["1", "2"], ["3", "4"], ["5"]]);
  assert.deepEqual(delays, [7, 7]);
  assert.equal(maxActive, 1);
  assert.equal(cycle.requested, 5);

  const failedCalls = [];
  await assert.rejects(
    collectCompleteCycle({
      universe,
      chunkSize: 2,
      chunkDelayMs: 0,
      now: () => 200,
      sleep: async () => {},
      fetchChunk: async (ids) => {
        failedCalls.push([...ids]);
        if (failedCalls.length === 2) throw new Error("provider exploded");
        return buildValidatedChunk({
          securityIds: ids,
          responseJson: { data: { SecuritiesData: { Table: { Security: ids.map(securityRecord) } } } },
          timing: { startedAtMs: 1, responseReceivedAtMs: 2, completedAtMs: 3 }
        });
      }
    }),
    /provider exploded/
  );
  assert.deepEqual(failedCalls, [["1", "2"], ["3", "4"]]);
});
