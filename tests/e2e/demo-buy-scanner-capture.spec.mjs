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

async function waitForRunning(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => globalThis.__MARKET_FLOW_US_RUNTIME_V1__?.getState?.().state ?? null);
  }).toBe("running");
}

async function stopRuntime(page) {
  await page.evaluate(async () => {
    const runtime = globalThis.__MARKET_FLOW_US_RUNTIME_V1__;
    if (runtime?.getState?.().state === "running") {
      await runtime.stop("test_cleanup");
    }
  });
}

async function captureCount(service) {
  return Number((await service.rows("SELECT COUNT(*) AS count FROM demo_buy_captures"))[0].count);
}

async function itemCount(service) {
  return Number((await service.rows("SELECT COUNT(*) AS count FROM demo_buy_items"))[0].count);
}

test("Scanner Demo Buy manual/Auto capture stays generation-bound, keeps running behind Demo Buy, and Stop remains resumable", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;
    await waitForRunning(page);

    await expect(viewer.getByRole("button", { name: "Demo Buy", exact: true })).toBeVisible();

    await viewer.getByRole("button", { name: "Scanner" }).click();
    await viewer.getByLabel("SQL").fill(
      "SELECT security_id AS securityId FROM latest ORDER BY security_id LIMIT 2"
    );
    await viewer.getByLabel("מרווח (שניות)").fill("60");
    await viewer.getByRole("button", { name: "הפעל" }).click();

    const scannerTable = viewer.getByRole("table", { name: "תוצאות Scanner" });
    await expect(scannerTable.locator("tbody tr")).toHaveCount(2);
    await expect(scannerTable.getByRole("columnheader")).toContainText(["Demo Buy", "securityId"]);
    await expect(viewer.getByText(/Active result: .*Rows: 2/)).toBeVisible();

    const firstCheckbox = scannerTable.locator('tbody input[type="checkbox"]').first();
    await firstCheckbox.check();
    await expect(scannerTable).toBeVisible();
    await expect(viewer.getByRole("table", { name: "היסטוריית נייר" })).toHaveCount(0);
    await expect(viewer.getByRole("button", { name: "Demo Buy selected (1)" })).toBeEnabled();

    await viewer.getByRole("button", { name: "Demo Buy selected (1)" }).click();
    await expect(viewer.getByText(/Demo Buy נשמר: capture .*1 פריטים/)).toBeVisible();
    await expect.poll(() => captureCount(service)).toBe(1);
    await expect.poll(() => itemCount(service)).toBe(1);

    const preview = viewer.locator(".market-flow-us-demo-buy-capture").getByText(/All: 2 source rows → 2 unique Demo Buy items/);
    await expect(preview).toBeVisible();

    const autoSelect = viewer.getByLabel("Auto", { exact: true });
    await autoSelect.selectOption("all");
    await viewer.waitForTimeout(150);
    expect(await captureCount(service)).toBe(1, "enabling Auto must not capture the already-rendered generation");

    await viewer.getByRole("button", { name: "Current" }).click();
    await expect(viewer.getByText("Auto Demo Buy: All", { exact: true })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Turn off" })).toBeVisible();

    await viewer.getByRole("button", { name: "Scanner" }).click();
    await viewer.getByLabel("מרווח (שניות)").fill("0.2");
    await viewer.getByRole("button", { name: "הפעל" }).click();
    await expect.poll(() => captureCount(service), { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    const beforeDemoBuySurface = await captureCount(service);
    await viewer.getByRole("button", { name: "Demo Buy", exact: true }).click();
    await expect(viewer.getByRole("heading", { name: "Demo Buy" })).toBeVisible();
    await expect(viewer.getByRole("table", { name: /Demo Buy capture/ }).first()).toBeVisible();
    await expect(viewer.getByText("Auto Demo Buy: All", { exact: true })).toBeVisible();
    await expect.poll(() => captureCount(service), { timeout: 5000 }).toBeGreaterThan(beforeDemoBuySurface);

    await viewer.getByRole("button", { name: "Scanner" }).click();
    await expect(scannerTable).toBeVisible();
    await viewer.getByRole("button", { name: "עצור סריקה חוזרת" }).click();
    await expect(viewer.getByText(/הסריקה החוזרת נעצרה/)).toBeVisible();
    const stoppedCount = await captureCount(service);
    await viewer.waitForTimeout(500);
    expect(await captureCount(service)).toBe(stoppedCount);
    await expect(autoSelect).toHaveValue("all");

    await viewer.getByRole("button", { name: "הפעל" }).click();
    await expect.poll(() => captureCount(service), { timeout: 5000 }).toBeGreaterThan(stoppedCount);

    await viewer.getByRole("button", { name: "Demo Buy", exact: true }).click();
    await expect(viewer.getByText("Auto Demo Buy: All", { exact: true })).toBeVisible();
    await viewer.getByRole("button", { name: "Turn off" }).click();
    await expect(viewer.getByText("Auto Demo Buy: All", { exact: true })).toHaveCount(0);

    await viewer.getByRole("button", { name: "Scanner" }).click();
    await expect(autoSelect).toHaveValue("off");
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});
