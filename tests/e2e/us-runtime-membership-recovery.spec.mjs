import { expect, test } from "@playwright/test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
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

async function restartService(service, fake) {
  await service.service.close();
  return await startMarketScopeService({
    config: {
      host: "127.0.0.1",
      port: SERVICE_PORT,
      dbPath: service.dbPath,
      maxInboundMessageBytes: 16 * 1024 * 1024,
      producerHeartbeatMs: 5000,
      producerStaleAfterMs: 15000,
      historyPageSize: 500,
      allowedOrigins: [new URL(fake.baseUrl).origin]
    },
    serviceVersion: "test-version",
    openDatabase: openMarketFlowUsDatabase
  });
}

async function viewerStatus(client) {
  const response = await client.request("viewer.status.get");
  expect(response.type).toBe("response.ok");
  return response.payload.data;
}

async function viewerCurrent(client) {
  const response = await client.request("viewer.current.get");
  expect(response.type).toBe("response.ok");
  return response.payload.data;
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
    return await page.evaluate(() => globalThis.__MARKET_FLOW_US_RUNTIME_V1__?.getState?.().state ?? null);
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

async function currentUniverse(service) {
  const rows = await service.rows(
    `SELECT security_id, universe_revision
     FROM universe
     WHERE is_current = true
     ORDER BY security_id`
  );
  return {
    ids: rows.map((row) => String(row.security_id)),
    revisions: [...new Set(rows.map((row) => Number(row.universe_revision)))]
  };
}

async function latestCompleteCycleRevision(service) {
  const rows = await service.rows(
    `SELECT universe_revision
     FROM cycles
     WHERE status = 'complete'
     ORDER BY cycle_id DESC
     LIMIT 1`
  );
  return rows.length === 1 ? Number(rows[0].universe_revision) : null;
}

async function completedCycles(service) {
  const rows = await service.rows(
    "SELECT completed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
  );
  return rows.length === 1 ? Number(rows[0].completed_cycles) : 0;
}

async function stopRuntime(page) {
  await page.evaluate(async () => {
    const runtime = globalThis.__MARKET_FLOW_US_RUNTIME_V1__;
    if (runtime?.getState?.().state === "running") {
      await runtime.stop("test_cleanup");
    }
  });
}

test("normal U.S. runtime commits repeated identical complete responses without false universe revisions", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    await setScenario(fake, "US-17");
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
    const currentTable = await waitForCurrentRows(viewer, 4);
    await expect.poll(() => completedCycles(service)).toBeGreaterThanOrEqual(1);

    const firstCompleted = await completedCycles(service);
    const firstUniverse = await currentUniverse(service);
    expect(firstUniverse.ids).toEqual(["1001", "1002", "1003", "1004"]);
    expect(firstUniverse.revisions).toHaveLength(1);
    expect(firstUniverse.revisions[0]).toBeGreaterThanOrEqual(1);

    await expect.poll(() => completedCycles(service)).toBeGreaterThanOrEqual(firstCompleted + 3);

    const laterCompleted = await completedCycles(service);
    const laterUniverse = await currentUniverse(service);
    expect(laterUniverse.ids).toEqual(firstUniverse.ids);
    expect(laterUniverse.revisions).toEqual(firstUniverse.revisions);

    const staticFake = await fakeState(fake);
    expect(staticFake.logicalCycleIndex).toBe(0);
    expect(staticFake.requestLog.length).toBeGreaterThanOrEqual(laterCompleted);
    expect(staticFake.requestLog.every((entry) => entry.endpoint === "ScreenerHulPaging3")).toBe(true);
    expect(staticFake.maxActiveScreenerRequests).toBe(1);

    await currentTable.locator("tbody tr").first().click();
    const historyTable = viewer.getByRole("table", { name: "היסטוריית נייר" });
    await expect(historyTable).toBeVisible();
    await expect.poll(async () => historyTable.locator("tbody tr").count())
      .toBeGreaterThanOrEqual(firstCompleted + 3);
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});

test("normal U.S. runtime preserves committed authority across service restart and resumes collection", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);
  let restartedService = null;
  let observer = null;
  let restartedObserver = null;

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

    observer = await service.connect("viewer", "restart-before-viewer");
    await expect.poll(async () => (await viewerStatus(observer)).completedCycles)
      .toBeGreaterThanOrEqual(2);

    const beforeRestart = await viewerStatus(observer);
    expect(beforeRestart.latestCount).toBe(4);
    expect(beforeRestart.historyCount).toBeGreaterThanOrEqual(8);

    restartedService = await restartService(service, fake);

    await expect.poll(async () => {
      return await page.evaluate(() => globalThis.__MARKET_FLOW_US_RUNTIME_V1__?.getState?.().state ?? null);
    }).toBe("error");

    restartedObserver = await service.connect("viewer", "restart-after-viewer");
    const persisted = await viewerStatus(restartedObserver);
    expect(persisted.recorderHealth).toBe("STOPPED");
    expect(persisted.latestCount).toBe(4);
    expect(persisted.completedCycles).toBeGreaterThanOrEqual(beforeRestart.completedCycles);
    expect(persisted.historyCount).toBeGreaterThanOrEqual(beforeRestart.historyCount);

    const persistedCurrent = await viewerCurrent(restartedObserver);
    expect(persistedCurrent.rows).toHaveLength(4);
    expect(persistedCurrent.summary.lastCycleId).toBe(persisted.lastCompletedCycleId);

    await page.evaluate(async () => {
      await globalThis.__MARKET_FLOW_US_RUNTIME_V1__.relaunch();
    });
    await waitForRunning(page);
    await waitForCurrentRows(viewer, 4);

    await expect.poll(async () => (await viewerStatus(restartedObserver)).completedCycles)
      .toBeGreaterThan(persisted.completedCycles);
    await expect.poll(async () => (await viewerStatus(restartedObserver)).historyCount)
      .toBeGreaterThan(persisted.historyCount);
  } finally {
    await stopRuntime(page).catch(() => {});
    await observer?.close().catch(() => {});
    await restartedObserver?.close().catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await restartedService?.close().catch(() => {});
    await service.cleanup();
    await fake.close();
  }
});

test("normal U.S. runtime applies add/remove membership under acknowledged universe revisions", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    await setScenario(fake, "US-03");
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
    const currentTable = await waitForCurrentRows(viewer, 5);
    await expect(currentTable).toContainText("Fixture Epsilon US");
    await expect.poll(() => currentIds(service)).toEqual([
      "1001",
      "1002",
      "1003",
      "1004",
      "1005"
    ]);

    const addedUniverse = await currentUniverse(service);
    expect(addedUniverse.revisions).toHaveLength(1);
    const addedRevision = addedUniverse.revisions[0];
    expect(addedRevision).toBeGreaterThanOrEqual(2);
    await expect.poll(() => latestCompleteCycleRevision(service)).toBe(addedRevision);

    await setScenario(fake, "US-04");
    await waitForCurrentRows(viewer, 3);
    await expect(currentTable).not.toContainText("Fixture Epsilon US");
    await expect.poll(() => currentIds(service)).toEqual(["1001", "1002", "1003"]);

    const removedUniverse = await currentUniverse(service);
    expect(removedUniverse.revisions).toHaveLength(1);
    const removedRevision = removedUniverse.revisions[0];
    expect(removedRevision).toBeGreaterThan(addedRevision);
    await expect.poll(() => latestCompleteCycleRevision(service)).toBe(removedRevision);
  } finally {
    await stopRuntime(page).catch(() => {});
    for (const candidate of context.pages()) {
      if (candidate !== page) await candidate.close().catch(() => {});
    }
    await service.cleanup();
    await fake.close();
  }
});

test("normal U.S. runtime records provider failure, recovers, and executes staged Scanner", async ({ page, context }) => {
  const fake = await startFake();
  const service = await startService(fake);

  try {
    await setScenario(fake, "US-13");
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

    await expect.poll(async () => {
      const rows = await service.rows(
        "SELECT failed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
      );
      return rows.length === 1 ? Number(rows[0].failed_cycles) : 0;
    }).toBeGreaterThanOrEqual(1);

    await waitForCurrentRows(viewer, 4);
    await expect.poll(async () => {
      const rows = await service.rows(
        "SELECT completed_cycles FROM sessions WHERE status = 'running' LIMIT 1"
      );
      return rows.length === 1 ? Number(rows[0].completed_cycles) : 0;
    }).toBeGreaterThanOrEqual(1);
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
