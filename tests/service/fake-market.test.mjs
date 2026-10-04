import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAP_HEAT_PATH,
  SECURITIES_PATH,
  startFakeMarket
} from "../fake-market/server.mjs";

const MAP_HEAT_REQUIRED = {
  indexIdArray: "0",
  sectorIdAndTatSectorArray: "0;0",
  showOnlyDual: "0",
  page: "1",
  orderFieldName: "DailyNumDeals",
  order: "DESC",
  rt: "true"
};

function mapHeatUrl(baseUrl, pageCount) {
  const url = new URL(MAP_HEAT_PATH, baseUrl);
  for (const [key, value] of Object.entries(MAP_HEAT_REQUIRED)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("pageCount", String(pageCount));
  return url;
}

function securitiesUrl(baseUrl, ids) {
  const url = new URL(SECURITIES_PATH, baseUrl);
  url.searchParams.set("securityIds", ids.join(","));
  url.searchParams.set("responseType", "1");
  url.searchParams.set("is_gto", "true");
  url.searchParams.set("force", "false");
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
  const response = await fetch(new URL("/_market-scope-test/reset", baseUrl), {
    method: "POST"
  });
  assert.equal(response.status, 200);
  return await json(response);
}

async function state(baseUrl) {
  const response = await fetch(new URL("/_market-scope-test/state", baseUrl));
  assert.equal(response.status, 200);
  return await json(response);
}

async function withFakeMarket(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-scope-fake-"));
  const runtimePath = path.join(tempDir, "market-scope.runtime.js");
  await writeFile(runtimePath, "globalThis.__FAKE_RUNTIME_LOADED__ = true;\n", "utf8");
  const fake = await startFakeMarket({ port: 0, runtimePath });

  try {
    await fn(fake);
  } finally {
    await fake.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("Fake Market serves provider page/runtime and real MapHeat two-step shape", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /\/assets\/market-scope\.runtime\.js/);

    const runtime = await fetch(new URL("/assets/market-scope.runtime.js", baseUrl));
    assert.equal(runtime.status, 200);
    assert.match(await runtime.text(), /__FAKE_RUNTIME_LOADED__/);

    const countResponse = await fetch(mapHeatUrl(baseUrl, 1));
    assert.equal(countResponse.status, 200);
    const countPayload = await json(countResponse);
    assert.equal(countPayload.data.MapHeat.recordCount, 4);
    assert.equal(countPayload.data.MapHeat.records.length, 1);

    const fullResponse = await fetch(mapHeatUrl(baseUrl, 4));
    assert.equal(fullResponse.status, 200);
    const fullPayload = await json(fullResponse);
    assert.equal(fullPayload.data.MapHeat.recordCount, 4);
    assert.deepEqual(
      fullPayload.data.MapHeat.records.map((row) => String(row.PaperId)),
      ["1001", "1002", "1003", "1004"]
    );
  });
});

test("all chunks in one complete universe use one logical cycle, reorder safely, then advance exactly once", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    const first = await json(await fetch(securitiesUrl(baseUrl, ["1001", "1002"])));
    const midState = await state(baseUrl);

    assert.equal(first.data.SecuritiesData.Table.AsOfDate, "fixture-cycle-0");
    assert.deepEqual(
      first.data.SecuritiesData.Table.Security.map((row) => String(row.Key)),
      ["1002", "1001"]
    );
    assert.equal(midState.logicalCycleIndex, 0);
    assert.deepEqual(midState.servedSecurityIdsForCurrentCycle, ["1001", "1002"]);

    const second = await json(await fetch(securitiesUrl(baseUrl, ["1003", "1004"])));
    assert.equal(second.data.SecuritiesData.Table.AsOfDate, "fixture-cycle-0");

    const afterComplete = await state(baseUrl);
    assert.equal(afterComplete.logicalCycleIndex, 1);
    assert.deepEqual(afterComplete.servedSecurityIdsForCurrentCycle, []);

    const next = await json(await fetch(securitiesUrl(baseUrl, ["1001"])));
    const alpha0 = first.data.SecuritiesData.Table.Security.find((row) => String(row.Key) === "1001");
    const alpha1 = next.data.SecuritiesData.Table.Security[0];
    assert.notEqual(alpha1.LastKnownRate, alpha0.LastKnownRate);
    assert.equal(next.data.SecuritiesData.Table.AsOfDate, "fixture-cycle-1");
  });
});

test("scenario controls are deterministic and reset restores the canonical initial state", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "FM-15");
    await fetch(securitiesUrl(baseUrl, ["1001", "1002", "1003", "1004"]));
    assert.equal((await state(baseUrl)).logicalCycleIndex, 1);

    const resetState = await reset(baseUrl);
    assert.equal(resetState.scenario, "FM-01");
    assert.equal(resetState.logicalCycleIndex, 0);
    assert.deepEqual(resetState.currentUniverse, ["1001", "1002", "1003", "1004"]);
    assert.deepEqual(resetState.requestLog, []);

    await setScenario(baseUrl, "FM-14");
    await fetch(securitiesUrl(baseUrl, ["1001", "1002", "1003", "1004"]));
    await fetch(securitiesUrl(baseUrl, ["1001", "1002", "1003", "1004"]));

    const changedUniverse = await json(await fetch(mapHeatUrl(baseUrl, 3)));
    assert.equal(changedUniverse.data.MapHeat.recordCount, 3);
    assert.deepEqual(
      changedUniverse.data.MapHeat.records.map((row) => String(row.PaperId)),
      ["1001", "1002", "1003"]
    );
  });
});

test("FM-02..FM-12 cover null/zero/missing and explicit provider failure shapes without accidental cycle advancement", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "FM-02");
    const diverse = await json(await fetch(securitiesUrl(baseUrl, ["1002", "1003"])));
    const byId = Object.fromEntries(
      diverse.data.SecuritiesData.Table.Security.map((row) => [String(row.Key), row])
    );
    assert.equal(byId["1002"].LastKnownRate, 0);
    assert.equal(byId["1002"].BuyLimit1, null);
    assert.equal(byId["1003"].LastKnownRate, null);
    assert.equal(Object.hasOwn(byId["1003"], "SellVolume1"), false);

    for (const scenario of ["FM-03", "FM-04", "FM-05"]) {
      await setScenario(baseUrl, scenario);
      const response = await fetch(mapHeatUrl(baseUrl, 4));
      assert.equal(response.status, 200);
      const payload = await json(response);
      const records = payload?.data?.MapHeat?.records ?? [];
      if (scenario === "FM-03") {
        const ids = records.map((row) => String(row.PaperId));
        assert.ok(new Set(ids).size < ids.length);
      } else if (scenario === "FM-04") {
        assert.ok(records.some((row) => !Object.hasOwn(row, "PaperId")));
      } else {
        assert.notEqual(payload.data.MapHeat.recordCount, records.length);
      }
    }

    await setScenario(baseUrl, "FM-06");
    assert.equal((await fetch(mapHeatUrl(baseUrl, 1))).status, 503);

    await setScenario(baseUrl, "FM-07");
    assert.deepEqual(await json(await fetch(mapHeatUrl(baseUrl, 1))), { data: {} });

    await setScenario(baseUrl, "FM-08");
    assert.equal((await fetch(securitiesUrl(baseUrl, ["1001"]))).status, 500);
    assert.equal((await state(baseUrl)).logicalCycleIndex, 0);

    await setScenario(baseUrl, "FM-09");
    assert.deepEqual(
      await json(await fetch(securitiesUrl(baseUrl, ["1001"]))),
      { data: { SecuritiesData: {} } }
    );

    await setScenario(baseUrl, "FM-10");
    const missing = await json(await fetch(securitiesUrl(baseUrl, ["1001", "1002"])));
    assert.equal(missing.data.SecuritiesData.Table.Security.length, 1);

    await setScenario(baseUrl, "FM-11");
    const duplicate = await json(await fetch(securitiesUrl(baseUrl, ["1001", "1002"])));
    const duplicateIds = duplicate.data.SecuritiesData.Table.Security.map((row) => String(row.Key));
    assert.ok(new Set(duplicateIds).size < duplicateIds.length);

    await setScenario(baseUrl, "FM-12");
    const unexpected = await json(await fetch(securitiesUrl(baseUrl, ["1001"])));
    assert.ok(
      unexpected.data.SecuritiesData.Table.Security.some((row) => String(row.Key) === "9999")
    );

    assert.equal((await state(baseUrl)).logicalCycleIndex, 0);
  });
});

test("FM-13 delay metrics and FM-16 request log expose provider-call contract deterministically", async () => {
  await withFakeMarket(async ({ baseUrl }) => {
    await setScenario(baseUrl, "FM-13");
    await fetch(securitiesUrl(baseUrl, ["1001"]));
    const delayedState = await state(baseUrl);
    assert.equal(delayedState.maxActiveSecuritiesRequests, 1);
    assert.equal(delayedState.logicalCycleIndex, 0);

    await setScenario(baseUrl, "FM-16");
    await fetch(mapHeatUrl(baseUrl, 1));
    await fetch(mapHeatUrl(baseUrl, 4));
    await fetch(securitiesUrl(baseUrl, ["1001", "1002"]));

    const contractState = await state(baseUrl);
    const mapCalls = contractState.requestLog.filter((entry) => entry.endpoint === "MapHeat2");
    const securityCalls = contractState.requestLog.filter((entry) => entry.endpoint === "GetSecuritiesData");

    assert.deepEqual(mapCalls.map((entry) => entry.pageCount), ["1", "4"]);
    assert.equal(securityCalls.length, 1);
    assert.deepEqual(securityCalls[0], {
      endpoint: "GetSecuritiesData",
      method: "GET",
      securityIds: "1001,1002",
      responseType: "1",
      isGto: "true",
      force: "false"
    });
  });
});
