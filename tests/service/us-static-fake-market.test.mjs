import assert from "node:assert/strict";
import test from "node:test";
import {
  SCREENER_HUL_PATH,
  startUsFakeMarket
} from "../fake-market/us-server.mjs";

const SCREENER_REQUIRED = Object.freeze({
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

function screenerUrl(baseUrl) {
  const url = new URL(SCREENER_HUL_PATH, baseUrl);
  for (const [key, value] of Object.entries(SCREENER_REQUIRED)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function setScenario(baseUrl, scenario) {
  const response = await fetch(new URL("/_market-scope-test/scenario", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario })
  });
  assert.equal(response.status, 200);
  return await response.json();
}

test("US-17 repeats one valid complete static ScreenerHulPaging3 response without advancing values", async () => {
  const fake = await startUsFakeMarket({ port: 0 });

  try {
    const selected = await setScenario(fake.baseUrl, "US-17");
    assert.equal(selected.scenario, "US-17");
    assert.equal(selected.logicalCycleIndex, 0);

    const firstResponse = await fetch(screenerUrl(fake.baseUrl));
    const secondResponse = await fetch(screenerUrl(fake.baseUrl));
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);

    const first = await firstResponse.json();
    const second = await secondResponse.json();
    assert.deepEqual(second, first);
    assert.equal(first.data.ScreenerHulPaging.recordCount, 4);
    assert.deepEqual(
      first.data.ScreenerHulPaging.records.map((row) => String(row.PaperId)),
      ["1001", "1002", "1003", "1004"]
    );

    const stateResponse = await fetch(new URL("/_market-scope-test/state", fake.baseUrl));
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.logicalCycleIndex, 0);
    assert.equal(state.requestLog.length, 2);
    assert.equal(state.maxActiveScreenerRequests, 1);
  } finally {
    await fake.close();
  }
});
