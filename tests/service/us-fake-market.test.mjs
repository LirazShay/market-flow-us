import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SCREENER_HUL_PATH,
  startUsFakeMarket
} from "../fake-market/us-server.mjs";

const SCREENER_REQUIRED = {
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
};

function screenerUrl(baseUrl) {
  const url = new URL(SCREENER_HUL_PATH, baseUrl);
  for (const [key, value] of Object.entries(SCREENER_REQUIRED)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function json(response) {
  return await response.json();
}

async function setScenario(baseUrl, scenario) {
  const response = await fetch(new URL("/_market-scope-test/scenario", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario })
  });
  assert.equal(response.status, 200);
  return await json(response);
}

async function reset(baseUrl) {
  const response = await fetch(new URL("/_market-scope-test/reset", baseUrl), { method: "POST" });
  assert.equal(response.status, 200);
  return await json(response);
}

async function state(baseUrl) {
  const response = await fetch(new URL("/_market-scope-test/state", baseUrl));
  assert.equal(response.status, 200);
  return await json(response);
}

async function withFakeMarket(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-fake-"));
  const runtimePath = path.join(tempDir, "market-scope.runtime.js");
  await writeFile(runtimePath, "globalThis.__FAKE_RUNTIME_LOADED__ = true;\n", "utf8");
  const fake = await startUsFakeMarket({ port: 0, runtimePath });

  try {
    await fn(fake);
  } finally {
    await fake.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function records(payload) {
  return payload.data.ScreenerHulPaging.records;
}

test("U.S. Fake Market serves runtime plus the production ScreenerHulPaging3 full-response shape", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Market Flow US Fake Market/);

    const runtime = await fetch(new URL("/assets/market-scope.runtime.js", baseUrl));
    assert.equal(runtime.status, 200);
    assert.match(await runtime.text(), /__FAKE_RUNTIME_LOADED__/);

    const response = await fetch(screenerUrl(baseUrl));
    assert.equal(response.status, 200);
    const payload = await json(response);
    assert.equal(payload.resultCode, 0);
    assert.equal(payload.rtUsa, true);
    assert.equal(payload.data.ScreenerHulPaging.recordCount, 4);
    assert.deepEqual(records(payload).map((row) => String(row.PaperId)), ["1001", "1002", "1003", "1004"]);
    assert.equal(records(payload)[0].ExtraSyntheticField, "alpha-0");
  });
});

test("U.S. Fake Market rejects query drift from the production ScreenerHulPaging3 request", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    const url = screenerUrl(baseUrl);
    url.searchParams.set("pageCount", "4");
    const response = await fetch(url);
    assert.equal(response.status, 400);
    assert.deepEqual(await json(response), { error: "invalid-screener-query" });
  });
});

test("US-02 preserves membership while reordering rows and values advance across full responses", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-02");
    const first = await json(await fetch(screenerUrl(baseUrl)));
    const second = await json(await fetch(screenerUrl(baseUrl)));

    assert.deepEqual(records(first).map((row) => String(row.PaperId)), ["1004", "1003", "1002", "1001"]);
    assert.deepEqual(records(second).map((row) => String(row.PaperId)), ["1004", "1003", "1002", "1001"]);
    assert.notEqual(records(first).find((row) => row.PaperId === 1001).Price, records(second).find((row) => row.PaperId === 1001).Price);
    assert.equal((await state(baseUrl)).logicalCycleIndex, 2);
  });
});

test("US-03 and US-04 change membership only after the first complete response", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-03");
    const beforeAdd = await json(await fetch(screenerUrl(baseUrl)));
    const afterAdd = await json(await fetch(screenerUrl(baseUrl)));
    assert.deepEqual(records(beforeAdd).map((row) => String(row.PaperId)), ["1001", "1002", "1003", "1004"]);
    assert.deepEqual(records(afterAdd).map((row) => String(row.PaperId)), ["1001", "1002", "1003", "1004", "1005"]);

    await setScenario(baseUrl, "US-04");
    const beforeRemove = await json(await fetch(screenerUrl(baseUrl)));
    const afterRemove = await json(await fetch(screenerUrl(baseUrl)));
    assert.deepEqual(records(beforeRemove).map((row) => String(row.PaperId)), ["1001", "1002", "1003", "1004"]);
    assert.deepEqual(records(afterRemove).map((row) => String(row.PaperId)), ["1001", "1002", "1003"]);
  });
});

test("US-05..US-10 expose duplicate, missing id, count mismatch, null-zero-missing, malformed and HTTP failure shapes", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-05");
    const duplicate = records(await json(await fetch(screenerUrl(baseUrl))));
    const duplicateIds = duplicate.map((row) => String(row.PaperId));
    assert.ok(new Set(duplicateIds).size < duplicateIds.length);

    await setScenario(baseUrl, "US-06");
    const missingId = records(await json(await fetch(screenerUrl(baseUrl))));
    assert.ok(missingId.some((row) => !Object.hasOwn(row, "PaperId")));

    await setScenario(baseUrl, "US-07");
    const mismatch = await json(await fetch(screenerUrl(baseUrl)));
    assert.notEqual(mismatch.data.ScreenerHulPaging.recordCount, records(mismatch).length);

    await setScenario(baseUrl, "US-08");
    const diverse = records(await json(await fetch(screenerUrl(baseUrl))));
    const byId = Object.fromEntries(diverse.map((row) => [String(row.PaperId), row]));
    assert.equal(byId["1002"].Price, 0);
    assert.equal(byId["1002"].AskRate, null);
    assert.equal(byId["1003"].Price, null);
    assert.equal(Object.hasOwn(byId["1003"], "BidRate"), false);

    await setScenario(baseUrl, "US-09");
    assert.deepEqual(await json(await fetch(screenerUrl(baseUrl))), { data: {} });

    await setScenario(baseUrl, "US-10");
    assert.equal((await fetch(screenerUrl(baseUrl))).status, 503);
  });
});

test("US-11 delay is observable without overlap and US-12 advances values once per full response", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-11");
    const started = Date.now();
    await fetch(screenerUrl(baseUrl));
    assert.ok(Date.now() - started >= 20);
    assert.equal((await state(baseUrl)).maxActiveScreenerRequests, 1);

    await setScenario(baseUrl, "US-12");
    const first = await json(await fetch(screenerUrl(baseUrl)));
    const second = await json(await fetch(screenerUrl(baseUrl)));
    assert.notEqual(records(first)[0].Price, records(second)[0].Price);
    assert.equal((await state(baseUrl)).logicalCycleIndex, 2);
  });
});

test("US-13 recovers after one provider failure and reset restores deterministic initial state", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-13");
    assert.equal((await fetch(screenerUrl(baseUrl))).status, 503);
    const recovered = await fetch(screenerUrl(baseUrl));
    assert.equal(recovered.status, 200);
    assert.equal((await json(recovered)).data.ScreenerHulPaging.recordCount, 4);

    const resetState = await reset(baseUrl);
    assert.equal(resetState.scenario, "US-01");
    assert.equal(resetState.logicalCycleIndex, 0);
    assert.deepEqual(resetState.currentUniverse, ["1001", "1002", "1003", "1004"]);
    assert.deepEqual(resetState.requestLog, []);
  });
});

test("US-16 request log records one full ScreenerHulPaging3 call with the exact query", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "US-16");
    await fetch(screenerUrl(baseUrl));
    const contractState = await state(baseUrl);
    assert.equal(contractState.requestLog.length, 1);
    assert.deepEqual(contractState.requestLog[0], {
      endpoint: "ScreenerHulPaging3",
      method: "GET",
      query: SCREENER_REQUIRED
    });
  });
});
