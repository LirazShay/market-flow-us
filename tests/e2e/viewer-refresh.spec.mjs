import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let viewerBundle;

function makeCurrent(rate, deals = 100) {
  return {
    rows: [
      {
        paperName: "Fixture Alpha",
        securityId: "1001",
        LastKnownRate: rate,
        BaseRateChangePercentage: 1.2,
        BuyLimit1: rate - 1,
        BuyVolume1: 10,
        SellLimit1: rate + 1,
        SellVolume1: 12,
        DailyDealsQuantity: deals,
        LastDealVolume: 4,
        DailyTurnover: 100000,
        DailyNISRevenue: 200000,
        DailyLowestRate: 1200,
        DailyHighestRate: 1300,
        LastDealTimeOnly: "10:00:01",
        collectedAtMs: 1700000000000 + rate
      },
      {
        paperName: "Fixture Beta",
        securityId: "1002",
        LastKnownRate: 100,
        BaseRateChangePercentage: 0,
        BuyLimit1: 99,
        BuyVolume1: 1,
        SellLimit1: 101,
        SellVolume1: 1,
        DailyDealsQuantity: 50,
        LastDealVolume: 1,
        DailyTurnover: 1000,
        DailyNISRevenue: 2000,
        DailyLowestRate: 90,
        DailyHighestRate: 110,
        LastDealTimeOnly: "09:59:59",
        collectedAtMs: 1700000000000
      }
    ],
    summary: {
      rowCount: 2,
      lastCycleId: rate,
      lastCollectedAtMs: 1700000000000 + rate
    }
  };
}

function makeHistoryRow(cycleId, collectedAtMs) {
  return {
    collectedAtMs,
    cycleId,
    chunkIndex: 0,
    LastKnownRate: cycleId,
    BaseRateChangePercentage: 0,
    BuyLimit1: cycleId - 1,
    BuyVolume1: 1,
    SellLimit1: cycleId + 1,
    SellVolume1: 1,
    DailyDealsQuantity: cycleId,
    LastDealVolume: 1,
    DailyTurnover: 1,
    DailyNISRevenue: 1,
    LastDealTimeOnly: "10:00:00",
    serverAsOfDate: `fixture-${cycleId}`
  };
}

test.beforeAll(async () => {
  const currentPath = path.join(ROOT, "browser/viewer/current-surface.js");
  const detailPath = path.join(ROOT, "browser/viewer/detail-surface.js");
  const refreshPath = path.join(ROOT, "browser/viewer/refresh-controller.js");
  const result = await build({
    stdin: {
      contents: `
        import { createCurrentSurface } from ${JSON.stringify(currentPath)};
        import { createDetailSurface } from ${JSON.stringify(detailPath)};
        import { createViewerRefreshController } from ${JSON.stringify(refreshPath)};
        globalThis.__viewerFactories = { createCurrentSurface, createDetailSurface, createViewerRefreshController };
      `,
      resolveDir: ROOT,
      sourcefile: "viewer-refresh-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  viewerBundle = result.outputFiles[0].text;
});

test("authoritative refresh preserves Current sort/viewport and Detail loaded depth, while manual refresh recovers a lost hint", async ({ page }) => {
  await page.setContent(`
    <div id="controls"></div>
    <section id="diagnostics"></section>
    <section id="current"></section>
    <section id="detail"></section>
  `);
  await page.addStyleTag({ content: `
    .market-scope-current-content { width: 320px; height: 180px; overflow: auto; }
    .market-scope-current table { min-width: 2200px; min-height: 900px; }
  ` });
  await page.addScriptTag({ content: viewerBundle });

  await page.evaluate(() => {
    class FakeBroadcastChannel {
      constructor() {
        this.listeners = [];
      }
      addEventListener(type, listener) {
        if (type === "message") this.listeners.push(listener);
      }
      removeEventListener(type, listener) {
        if (type === "message") this.listeners = this.listeners.filter((item) => item !== listener);
      }
      emit(data) {
        for (const listener of this.listeners) listener({ data });
      }
      close() {}
    }

    const channel = new FakeBroadcastChannel();
    const calls = [];
    let authorityVersion = 1;

    const historyV1 = Array.from(
      { length: 502 },
      (_, index) => makeHistoryRowForBrowser(1000 - index, 20000 - Math.floor(index / 2))
    );
    const historyV2 = [
      makeHistoryRowForBrowser(1001, 21000),
      ...historyV1
    ];

    function current() {
      return authorityVersion === 1 ? makeCurrentForBrowser(1200, 100) : makeCurrentForBrowser(1300, 140);
    }

    function security() {
      const row = current().rows[0];
      return {
        found: true,
        securityId: "1001",
        paperName: "Fixture Alpha",
        isCurrent: true,
        currentRow: row
      };
    }

    function pageOf(rows, cursor) {
      if (cursor === null) {
        return {
          rows: rows.slice(0, 500),
          hasMore: rows.length > 500,
          nextCursor: rows.length > 500 ? "older" : null
        };
      }
      return {
        rows: rows.slice(500),
        hasMore: false,
        nextCursor: null
      };
    }

    const client = {
      async getCurrent() {
        calls.push(["current", authorityVersion]);
        return current();
      },
      async getStatus() {
        calls.push(["status", authorityVersion]);
        return {
          serviceReady: true,
          recorderHealth: "RUNNING",
          lastCompletedAtMs: 1700000000000 + authorityVersion,
          lastCompletedCycleId: authorityVersion,
          lastCycleDurationMs: 25,
          latestCount: 2,
          completedCycles: authorityVersion,
          failedCycles: 0,
          historyCount: authorityVersion === 1 ? 502 : 503,
          lastError: null
        };
      },
      async getSecurity(securityId) {
        calls.push(["security", securityId, authorityVersion]);
        return security();
      },
      async getHistoryPage(securityId, cursor) {
        calls.push(["history", securityId, cursor, authorityVersion]);
        return pageOf(authorityVersion === 1 ? historyV1 : historyV2, cursor);
      }
    };

    let controller;
    const currentSurface = globalThis.__viewerFactories.createCurrentSurface({
      root: document.querySelector("#current"),
      client,
      onOpenSecurity(securityId) {
        void controller.openDetail(securityId);
      }
    });
    const detailSurface = globalThis.__viewerFactories.createDetailSurface({
      root: document.querySelector("#detail"),
      client,
      onBack(returnState) {
        controller.backToCurrent(returnState);
      }
    });

    controller = globalThis.__viewerFactories.createViewerRefreshController({
      currentSurface,
      detailSurface,
      currentRoot: document.querySelector("#current"),
      detailRoot: document.querySelector("#detail"),
      controlsRoot: document.querySelector("#controls"),
      diagnosticsRoot: document.querySelector("#diagnostics"),
      createBroadcastChannel: () => channel
    });

    globalThis.__viewerController = controller;
    globalThis.__viewerChannel = channel;
    globalThis.__viewerCalls = calls;
    globalThis.__setAuthorityVersion = (version) => {
      authorityVersion = version;
    };
    globalThis.__networkFetchCount = 0;
    globalThis.fetch = async () => {
      globalThis.__networkFetchCount += 1;
      throw new Error("Viewer refresh must not call provider/network fetch");
    };

    controller.start();

    function makeCurrentForBrowser(rate, deals) {
      return {
        rows: [
          {
            paperName: "Fixture Alpha",
            securityId: "1001",
            LastKnownRate: rate,
            BaseRateChangePercentage: 1.2,
            BuyLimit1: rate - 1,
            BuyVolume1: 10,
            SellLimit1: rate + 1,
            SellVolume1: 12,
            DailyDealsQuantity: deals,
            LastDealVolume: 4,
            DailyTurnover: 100000,
            DailyNISRevenue: 200000,
            DailyLowestRate: 1200,
            DailyHighestRate: 1300,
            LastDealTimeOnly: "10:00:01",
            collectedAtMs: 1700000000000 + rate
          },
          {
            paperName: "Fixture Beta",
            securityId: "1002",
            LastKnownRate: 100,
            BaseRateChangePercentage: 0,
            BuyLimit1: 99,
            BuyVolume1: 1,
            SellLimit1: 101,
            SellVolume1: 1,
            DailyDealsQuantity: 50,
            LastDealVolume: 1,
            DailyTurnover: 1000,
            DailyNISRevenue: 2000,
            DailyLowestRate: 90,
            DailyHighestRate: 110,
            LastDealTimeOnly: "09:59:59",
            collectedAtMs: 1700000000000
          }
        ],
        summary: {
          rowCount: 2,
          lastCycleId: rate,
          lastCollectedAtMs: 1700000000000 + rate
        }
      };
    }

    function makeHistoryRowForBrowser(cycleId, collectedAtMs) {
      return {
        collectedAtMs,
        cycleId,
        chunkIndex: 0,
        LastKnownRate: cycleId,
        BaseRateChangePercentage: 0,
        BuyLimit1: cycleId - 1,
        BuyVolume1: 1,
        SellLimit1: cycleId + 1,
        SellVolume1: 1,
        DailyDealsQuantity: cycleId,
        LastDealVolume: 1,
        DailyTurnover: 1,
        DailyNISRevenue: 1,
        LastDealTimeOnly: "10:00:00",
        serverAsOfDate: `fixture-${cycleId}`
      };
    }
  });

  await page.getByRole("button", { name: "רענן תצוגה" }).click();
  const currentTable = page.getByRole("table", { name: "שוק נוכחי" });
  await expect(currentTable).toBeVisible();

  const rateHeader = currentTable.getByRole("columnheader", { name: /שער אחרון/ });
  await rateHeader.getByRole("button").click();
  await expect(rateHeader).toHaveAttribute("aria-sort", "descending");

  await page.evaluate(() => {
    const viewport = document.querySelector(".market-scope-current-content");
    viewport.scrollLeft = -240;
    viewport.scrollTop = 130;
  });

  await page.evaluate(() => globalThis.__viewerController.openDetail("1001"));
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(500);
  await page.getByRole("button", { name: "טען ישנים יותר" }).click();
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(502);
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toBeVisible();

  await page.evaluate(() => {
    globalThis.__setAuthorityVersion(2);
    globalThis.__viewerChannel.emit({
      type: "CYCLE_COMMITTED",
      cycleId: 2,
      completedAtMs: 1700000000002
    });
  });

  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(503);
  await expect(page.getByTestId("detail-last-rate")).toHaveText("1,300");
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toContainText("503");
  await expect.poll(() => page.evaluate(() => globalThis.__viewerController.getState().activeSurface)).toBe("DETAIL");

  await page.getByRole("button", { name: "← חזרה לטבלה" }).click();
  await expect(currentTable).toBeVisible();

  const restored = await page.evaluate(() => {
    const viewport = document.querySelector(".market-scope-current-content");
    return {
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };
  });
  expect(restored).toEqual({ scrollLeft: -240, scrollTop: 130 });
  await expect(currentTable.getByRole("columnheader", { name: /שער אחרון/ })).toHaveAttribute("aria-sort", "descending");
  await expect(currentTable.getByRole("row").nth(1)).toContainText("Fixture Alpha");

  await page.evaluate(() => {
    globalThis.__setAuthorityVersion(1);
  });
  await page.getByRole("button", { name: "רענן תצוגה" }).click();
  await expect(currentTable.getByRole("row").nth(1)).toContainText("1,200");

  await expect.poll(() => page.evaluate(() => globalThis.__networkFetchCount)).toBe(0);
  await expect(page.getByText("רענון חי פעיל", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__viewerCalls.filter(([kind]) => kind === "current").length)).toBeGreaterThanOrEqual(3);
});
