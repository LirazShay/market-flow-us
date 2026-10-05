import { expect, test } from "@playwright/test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { buildBrowser } from "../../scripts/build-browser.mjs";
import { startUsFakeMarket } from "../fake-market/us-server.mjs";
import { createServiceFixture } from "../service/helpers/service-fixture.mjs";

const SERVICE_PORT = 8765;

let buildResult;

test.beforeAll(async () => {
  buildResult = await buildBrowser();
});

async function startFake() {
  return await startUsFakeMarket({
    host: "127.0.0.1",
    port: 0,
    runtimePath: buildResult.runtimePath
  });
}

async function startService(fake) {
  return await createServiceFixture({
    origin: new URL(fake.baseUrl).origin,
    config: { port: SERVICE_PORT },
    openDatabase: openMarketFlowUsDatabase
  });
}

async function setScenario(fake, scenario) {
  const response = await fetch(new URL("/_market-scope-test/scenario", fake.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario })
  });
  expect(response.ok).toBe(true);
  return await response.json();
}

async function fakeState(fake) {
  const response = await fetch(new URL("/_market-scope-test/state", fake.baseUrl));
  expect(response.ok).toBe(true);
  return await response.json();
}

async function viewerCurrent(client) {
  const response = await client.request("viewer.current.get");
  expect(response.type).toBe("response.ok");
  return response.payload.data;
}

async function viewerHistory(client, securityId) {
  const response = await client.request("viewer.history.page", {
    securityId,
    cursor: null
  });
  expect(response.type).toBe("response.ok");
  return response.payload.data;
}

async function waitForRunning(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => globalThis.__MARKET_FLOW_US_RUNTIME_V1__?.getState?.().state ?? null);
  }).toBe("running");
}

async function waitForCurrentRows(viewer, count) {
  const table = viewer.getByRole("table", { name: "שוק נוכחי" });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(count);
  return table;
}

async function stopRuntime(page) {
  await page.evaluate(async () => {
    const runtime = globalThis.__MARKET_FLOW_US_RUNTIME_V1__;
    if (runtime?.getState?.().state === "running") {
      await runtime.stop("test_cleanup");
    }
  });
}

test("normal U.S. runtime moves Current values while preserving prior values in History", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);
  let observer = null;

  try {
    await setScenario(fake, "US-12");
    await page.addInitScript(() => {
      globalThis.__MARKET_FLOW_US_CONFIG__ = {
        recorder: {
          snapshotIntervalMs: 100
        }
      };
    });

    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await waitForRunning(page);
    await waitForCurrentRows(viewer, 4);

    observer = await service.connect("viewer", "moving-values-viewer");
    await expect.poll(async () => (await viewerCurrent(observer)).rows.length).toBe(4);

    const firstCurrent = await viewerCurrent(observer);
    const firstRow = firstCurrent.rows.find((row) => row.securityId === "1001");
    expect(firstRow).toBeTruthy();
    const firstCycleId = firstCurrent.summary.lastCycleId;
    const firstPrice = firstRow.Price;
    expect(firstCycleId).toBeGreaterThanOrEqual(1);
    expect(typeof firstPrice).toBe("number");

    await expect.poll(async () => {
      const current = await viewerCurrent(observer);
      const row = current.rows.find((candidate) => candidate.securityId === "1001");
      return current.summary.lastCycleId > firstCycleId && row?.Price !== firstPrice;
    }).toBe(true);

    const laterCurrent = await viewerCurrent(observer);
    const laterRow = laterCurrent.rows.find((row) => row.securityId === "1001");
    expect(laterRow).toBeTruthy();
    expect(laterCurrent.summary.lastCycleId).toBeGreaterThan(firstCycleId);
    expect(laterRow.Price).not.toBe(firstPrice);

    const history = await viewerHistory(observer, "1001");
    expect(history.rows.length).toBeGreaterThanOrEqual(2);
    const historyPrices = history.rows.map((row) => row.Price);
    expect(historyPrices).toContain(firstPrice);
    expect(historyPrices).toContain(laterRow.Price);

    const movingFake = await fakeState(fake);
    expect(movingFake.logicalCycleIndex).toBeGreaterThanOrEqual(2);
    expect(movingFake.requestLog.length).toBeGreaterThanOrEqual(2);
    expect(movingFake.requestLog.every((entry) => entry.endpoint === "ScreenerHulPaging3")).toBe(true);
    expect(movingFake.maxActiveScreenerRequests).toBe(1);
  } finally {
    await stopRuntime(page).catch(() => {});
    await observer?.close().catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});
