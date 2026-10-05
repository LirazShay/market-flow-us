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

async function fakeState(fake) {
  const response = await fetch(new URL("/_market-scope-test/state", fake.baseUrl));
  expect(response.ok).toBe(true);
  return await response.json();
}

async function waitForRunning(page) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const state = globalThis.__MARKET_SCOPE_RUNTIME_V1__?.getState?.() ?? null;
      return JSON.stringify(state);
    });
  }).toContain('"state":"running"');
}

async function waitForCurrentRows(viewer, count = 4) {
  const table = viewer.getByRole("table", { name: "שוק נוכחי" });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(count);
}

async function stopRuntime(page) {
  await page.evaluate(async () => {
    const runtime = globalThis.__MARKET_SCOPE_RUNTIME_V1__;
    if (runtime?.getState?.().state === "running") {
      await runtime.stop("test_cleanup");
    }
  });
}

test("normal built runtime starts one producer, reuses one Viewer and composes Current, Detail and Scanner", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await waitForRunning(page);
    await waitForCurrentRows(viewer);

    const firstRuntime = await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__.getState());
    expect(firstRuntime.producerState).toBe("ready");

    const pageCountBefore = context.pages().length;
    await page.evaluate(async () => {
      await globalThis.__MARKET_SCOPE_RUNTIME_V1__.launch();
    });
    expect(context.pages().length).toBe(pageCountBefore);

    const sessions = await service.rows(
      "SELECT status, COUNT(*) AS count FROM sessions GROUP BY status ORDER BY status"
    );
    expect(sessions).toEqual([{ status: "running", count: "1" }]);

    const currentTable = viewer.getByRole("table", { name: "שוק נוכחי" });
    await expect(currentTable.getByRole("columnheader", { name: /DailyVolume/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    await currentTable.locator("tbody tr").first().click();
    await expect(viewer.getByRole("table", { name: "היסטוריית נייר" })).toBeVisible();

    await viewer.getByRole("button", { name: "← חזרה לטבלה" }).click();
    await expect(currentTable).toBeVisible();

    await viewer.getByRole("button", { name: "Scanner" }).click();
    await viewer.getByLabel("SQL").fill(
      "SELECT security_id AS securityId FROM latest ORDER BY security_id LIMIT 1"
    );
    await viewer.getByLabel("מרווח (שניות)").fill("60");
    await viewer.getByRole("button", { name: "הפעל" }).click();

    const scannerTable = viewer.getByRole("table", { name: "תוצאות Scanner" });
    await expect(scannerTable.locator("tbody tr")).toHaveCount(1);
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

test("closing/reopening Viewer is producer-independent and clean stop/relaunch never overlaps producer ownership", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
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
    await waitForCurrentRows(viewer);

    const beforeRows = Number((await service.rows("SELECT COUNT(*) AS count FROM history"))[0].count);
    await viewer.close();

    await expect.poll(async () => {
      return Number((await service.rows("SELECT COUNT(*) AS count FROM history"))[0].count);
    }, { timeout: 10_000 }).toBeGreaterThan(beforeRows);

    await page.evaluate(async () => {
      await globalThis.__MARKET_SCOPE_RUNTIME_V1__.stop("test_manual_stop");
    });
    await expect.poll(async () => {
      return await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__.getState().state);
    }).toBe("stopped");

    const reopenPromise = page.waitForEvent("popup");
    await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__.openViewer());
    const reopened = await reopenPromise;
    await waitForCurrentRows(reopened);

    await page.evaluate(async () => {
      await globalThis.__MARKET_SCOPE_RUNTIME_V1__.launch();
    });
    await waitForRunning(page);

    const sessions = await service.rows(
      "SELECT status, COUNT(*) AS count FROM sessions GROUP BY status ORDER BY status"
    );
    expect(sessions).toEqual([
      { status: "running", count: "1" },
      { status: "stopped", count: "1" }
    ]);

    const running = await service.rows("SELECT COUNT(*) AS count FROM sessions WHERE status = 'running'");
    expect(running).toEqual([{ count: "1" }]);
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});

test("service-unavailable launch makes no provider calls and an explicit relaunch recovers without offline queueing", async ({ page, context }) => {
  const fake = await startFake();
  let service = null;

  try {
    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await expect.poll(async () => {
      return await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__?.getState?.().state ?? null);
    }).toBe("error");
    await expect(viewer.getByText("שירות MarketScope אינו זמין. הפעלה מחדש נדרשת לאחר שהשירות זמין.", { exact: true })).toBeVisible();

    const beforeService = await fakeState(fake);
    expect(beforeService.requestLog).toEqual([]);

    const supportButton = viewer.getByRole("button", { name: "העתק אבחון / Copy Support Snapshot" });
    await supportButton.click();
    const supportFallback = viewer.getByLabel("Support Snapshot JSON");
    await expect(supportFallback).toBeVisible();
    const unavailableSnapshot = JSON.parse(await supportFallback.textContent());
    expect(unavailableSnapshot.node.unavailable).toBe(true);
    expect(unavailableSnapshot.node.diagnostic.checkpoint).toBe("browser.service.hello");
    expect(unavailableSnapshot.node.diagnostic.code).toBe("SERVICE_UNAVAILABLE");
    expect(unavailableSnapshot.browser.diagnostics.lastError.checkpoint).toBe("browser.service.hello");
    expect(unavailableSnapshot.browser.diagnostics.lastError.lastSuccessfulCheckpoint)
      .toBe("browser.runtime.loaded");

    service = await startService(fake);

    await page.evaluate(async () => {
      await globalThis.__MARKET_SCOPE_RUNTIME_V1__.launch();
    });
    await waitForRunning(page);

    const activeViewer = context.pages().find((candidate) => candidate !== page && !candidate.isClosed());
    expect(activeViewer).toBeTruthy();
    await waitForCurrentRows(activeViewer);

    const afterRecovery = await fakeState(fake);
    expect(afterRecovery.requestLog.length).toBeGreaterThan(0);
    expect(afterRecovery.requestLog.every((entry) => entry.endpoint === "ScreenerHulPaging3")).toBe(true);
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    if (service) await service.cleanup();
    await fake.close();
  }
});


test("Scanner Query Library supports built-ins, CRUD, reopen persistence and active-generation isolation", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await waitForRunning(page);
    await waitForCurrentRows(viewer);
    await viewer.getByRole("button", { name: "Scanner" }).click();

    const querySelect = viewer.getByLabel("שאילתה שמורה");
    const nameInput = viewer.getByLabel("שם שאילתה");
    const sqlInput = viewer.getByLabel("SQL");
    const intervalInput = viewer.getByLabel("מרווח (שניות)");

    await expect(querySelect).toBeEnabled();
    await expect(querySelect.locator("option")).toContainText([
      "טיוטה חדשה",
      "מובנה — All current fields",
      "מובנה — U.S. market ranking example",
      "מובנה — Staged candidate ranking"
    ]);

    await querySelect.selectOption("builtin:all-current-fields");
    await expect(sqlInput).toHaveValue(/SELECT \*/);
    await expect(viewer.getByRole("button", { name: "שמור", exact: true })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "שנה שם" })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "מחק" })).toBeDisabled();
    await expect(viewer.getByRole("button", { name: "שמור בשם חדש" })).toBeEnabled();

    await intervalInput.fill("60");
    await viewer.getByRole("button", { name: "הפעל" }).click();

    const scannerTable = viewer.getByRole("table", { name: "תוצאות Scanner" });
    await expect(scannerTable).toBeVisible();
    const activeHeaders = await scannerTable.getByRole("columnheader").allTextContents();
    expect(activeHeaders).toContain("security_id");
    expect(activeHeaders.length).toBeGreaterThan(6);

    await querySelect.selectOption("builtin:market-ranking-example");
    await expect(sqlInput).toHaveValue(/ChangePercent/);
    await expect(scannerTable.getByRole("columnheader")).toHaveText(activeHeaders);

    await nameInput.fill("Ranking Copy");
    await viewer.getByRole("button", { name: "שמור בשם חדש" }).click();
    await expect(viewer.getByText("השאילתה נשמרה בשם חדש.", { exact: true })).toBeVisible();
    const firstUserId = await querySelect.inputValue();
    expect(firstUserId).toMatch(/^user:/);
    await expect(viewer.getByRole("button", { name: "שמור", exact: true })).toBeEnabled();
    await expect(viewer.getByRole("button", { name: "מחק" })).toBeEnabled();

    await viewer.getByRole("button", { name: "חדש", exact: true }).click();
    await nameInput.fill("Second Query");
    await sqlInput.fill("SELECT security_id AS securityId FROM latest ORDER BY security_id LIMIT 2");
    await intervalInput.fill("7");
    await viewer.getByRole("button", { name: "שמור בשם חדש" }).click();
    await expect(viewer.getByText("השאילתה נשמרה בשם חדש.", { exact: true })).toBeVisible();
    const secondUserId = await querySelect.inputValue();
    expect(secondUserId).toMatch(/^user:/);
    expect(secondUserId).not.toBe(firstUserId);

    await querySelect.selectOption(firstUserId);
    await sqlInput.fill("SELECT security_id AS securityId FROM latest LIMIT 3");
    await intervalInput.fill("8");
    await viewer.getByRole("button", { name: "שמור", exact: true }).click();
    await expect(viewer.getByText("השאילתה נשמרה.", { exact: true })).toBeVisible();

    await nameInput.fill("Ranking Renamed");
    await viewer.getByRole("button", { name: "שנה שם" }).click();
    await expect(viewer.getByText("שם השאילתה עודכן.", { exact: true })).toBeVisible();
    await expect(querySelect.locator(`option[value="${firstUserId}"]`)).toHaveText("שלי — Ranking Renamed");

    await viewer.getByRole("button", { name: "חדש", exact: true }).click();
    await nameInput.fill("  RANKING   RENAMED  ");
    await sqlInput.fill("SELECT 1");
    await intervalInput.fill("5");
    await viewer.getByRole("button", { name: "שמור בשם חדש" }).click();
    await expect(viewer.getByRole("alert")).toContainText("שם השאילתה כבר קיים.");

    await expect(scannerTable.getByRole("columnheader")).toHaveText(activeHeaders);

    await viewer.close();

    const reopenPromise = page.waitForEvent("popup");
    await page.evaluate(() => globalThis.__MARKET_SCOPE_RUNTIME_V1__.openViewer());
    const reopened = await reopenPromise;
    await waitForCurrentRows(reopened);
    await reopened.getByRole("button", { name: "Scanner" }).click();

    const reopenedSelect = reopened.getByLabel("שאילתה שמורה");
    await expect(reopenedSelect.locator(`option[value="${firstUserId}"]`)).toHaveText("שלי — Ranking Renamed");
    await expect(reopenedSelect.locator(`option[value="${secondUserId}"]`)).toHaveText("שלי — Second Query");

    await reopenedSelect.selectOption(secondUserId);
    await expect(reopened.getByLabel("SQL")).toHaveValue(
      "SELECT security_id AS securityId FROM latest ORDER BY security_id LIMIT 2"
    );
    await reopened.getByRole("button", { name: "מחק" }).click();
    await expect(reopened.getByText("השאילתה נמחקה.", { exact: true })).toBeVisible();
    await expect(reopenedSelect.locator(`option[value="${secondUserId}"]`)).toHaveCount(0);

    await reopenedSelect.selectOption(firstUserId);
    await expect(reopened.getByLabel("SQL")).toHaveValue(
      "SELECT security_id AS securityId FROM latest LIMIT 3"
    );
    await reopened.getByRole("button", { name: "מחק" }).click();
    await expect(reopenedSelect.locator(`option[value="${firstUserId}"]`)).toHaveCount(0);

    await expect(reopenedSelect.locator('option[value="builtin:all-current-fields"]')).toHaveText(
      "מובנה — All current fields"
    );
    await expect(reopenedSelect.locator('option[value="builtin:market-ranking-example"]')).toHaveText(
      "מובנה — U.S. market ranking example"
    );
    await expect(reopenedSelect.locator('option[value="builtin:staged-candidate-ranking"]')).toHaveText(
      "מובנה — Staged candidate ranking"
    );
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});


test("Support Snapshot is copyable, bounded and falls back to selectable JSON without exposing authority rows", async ({ page, context }, testInfo) => {
  const fake = await startFake();
  const service = await startService(fake);
  const origin = new URL(fake.baseUrl).origin;

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });

    const popupPromise = page.waitForEvent("popup");
    await page.goto(fake.baseUrl);
    const viewer = await popupPromise;

    await waitForRunning(page);
    await waitForCurrentRows(viewer);

    const button = viewer.getByRole("button", { name: "העתק אבחון / Copy Support Snapshot" });
    await expect(button).toBeVisible();
    await button.click();
    await expect(viewer.getByText("האבחון הועתק.", { exact: true })).toBeVisible();

    const copied = await viewer.evaluate(async () => await navigator.clipboard.readText());
    const snapshot = JSON.parse(copied);
    await testInfo.attach("support-snapshot.json", {
      body: Buffer.from(copied, "utf8"),
      contentType: "application/json"
    });
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.browser.productVersion).toBeTruthy();
    expect(snapshot.node.service.ready).toBe(true);
    expect(snapshot.node.authority.latestCount).toBe(4);
    expect(snapshot.visibleState.runtimeState).toBe("running");
    expect(snapshot.visibleState.selectedSecurityIdPresent).toBe(false);
    expect(copied.length).toBeLessThan(64 * 1024);

    const browserCheckpoints = snapshot.browser.diagnostics.recent.map((record) => record.checkpoint);
    expect(browserCheckpoints).toContain("provider.cycle.collected");
    expect(browserCheckpoints).toContain("producer.cycle.committed");

    for (const forbidden of [
      "rawMapHeat",
      "raw_data",
      "scanner_saved_queries",
      "cookie",
      "authorization",
      "accountId",
      "SELECT security_id"
    ]) {
      expect(copied.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    await viewer.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: async () => {
          throw new Error("clipboard denied");
        }
      });
    });

    await button.click();
    await expect(
      viewer.getByText("העתקה אוטומטית לא זמינה; אפשר להעתיק מהטקסט.", { exact: true })
    ).toBeVisible();

    const fallback = viewer.getByLabel("Support Snapshot JSON");
    await expect(fallback).toBeVisible();
    expect(JSON.parse(await fallback.textContent()).schemaVersion).toBe(1);
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});