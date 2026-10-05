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

async function waitForRunning(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__?.getState?.().state ?? null);
  }).toBe("running");
}

async function waitForCurrentRows(viewer, count) {
  const table = viewer.getByRole("table", { name: "שוק נוכחי" });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(count);
  return table;
}

async function currentIds(service) {
  const rows = await service.rows(
    "SELECT security_id FROM universe WHERE is_current = true ORDER BY security_id"
  );
  return rows.map((row) => String(row.security_id));
}

async function stopRuntime(page) {
  await page.evaluate(async () => {
    const runtime = globalThis.__MARKET_SCOPE_RUNTIME_V1__;
    if (runtime?.getState?.().state === "running") {
      await runtime.stop("test_cleanup");
    }
  });
}

test("normal U.S. runtime applies add/remove membership, recovers from provider failure, and executes staged Scanner", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    await setScenario(fake, "US-03");
    await page.addInitScript(() => {
      globalThis.__MARKET_SCOPE_CONFIG__ = {
        recorder: {
          snapshotIntervalMs: 100
        }
      };
    });

    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await waitForRunning(page);

    const currentTable = await waitForCurrentRows(viewer, 5);
    await expect(currentTable).toContainText("Fixture Epsilon US");
    await expect.poll(() => currentIds(service)).toEqual([
      "1001",
      "1002",
      "1003",
      "1004",
      "1005"
    ]);

    await setScenario(fake, "US-04");
    await waitForCurrentRows(viewer, 3);
    await expect(currentTable).not.toContainText("Fixture Epsilon US");
    await expect.poll(() => currentIds(service)).toEqual(["1001", "1002", "1003"]);

    const beforeFailure = await service.rows(
      "SELECT failed_cycles, completed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
    );
    const failedBefore = Number(beforeFailure[0].failed_cycles);
    const completedBefore = Number(beforeFailure[0].completed_cycles);

    await setScenario(fake, "US-13");

    await expect.poll(async () => {
      const rows = await service.rows(
        "SELECT failed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
      );
      return Number(rows[0].failed_cycles);
    }).toBeGreaterThan(failedBefore);

    await waitForCurrentRows(viewer, 4);
    await expect.poll(async () => {
      const rows = await service.rows(
        "SELECT completed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
      );
      return Number(rows[0].completed_cycles);
    }).toBeGreaterThan(completedBefore);
    await expect.poll(() => currentIds(service)).toEqual(["1001", "1002", "1003", "1004"]);

    const recoveredFake = await fakeState(fake);
    expect(recoveredFake.requestLog.length).toBeGreaterThanOrEqual(2);
    expect(recoveredFake.requestLog.every((entry) => entry.endpoint === "ScreenerHulPaging3")).toBe(true);
    expect(recoveredFake.maxActiveScreenerRequests).toBe(1);

    await viewer.getByRole("button", { name: "Scanner" }).click();
    const querySelect = viewer.getByLabel("שאילתה שמורה");
    await querySelect.selectOption("builtin:staged-candidate-ranking");
    await expect(viewer.getByLabel("SQL")).toHaveValue(/stage_reached/);
    await viewer.getByLabel("מרווח (שניות)").fill("60");
    await viewer.getByRole("button", { name: "הפעל" }).click();

    const scannerTable = viewer.getByRole("table", { name: "תוצאות Scanner" });
    await expect(scannerTable).toBeVisible();
    await expect(scannerTable.getByRole("columnheader", { name: "stage_reached" })).toBeVisible();
    await expect(scannerTable.locator("tbody tr")).toHaveCount(4);

    await scannerTable.locator("tbody tr").first().click();
    await expect(viewer.getByRole("table", { name: "היסטוריית נייר" })).toBeVisible();
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});
