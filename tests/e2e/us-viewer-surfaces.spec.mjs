import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let viewerBundle;

const STATUS = {
  serviceReady: true,
  recorderHealth: "RUNNING",
  lastCompletedAtMs: 1700000001000,
  lastCompletedCycleId: 12,
  lastCycleDurationMs: 321,
  latestCount: 4,
  completedCycles: 12,
  failedCycles: 1,
  historyCount: 48,
  lastError: null
};

function currentRow({
  securityId,
  paperName,
  symbol,
  price,
  changePercent,
  dailyVolume
}) {
  return {
    paperName,
    Symbol: symbol,
    ExchangeName: "NASDAQ",
    securityId,
    Price: price,
    ChangePercent: changePercent,
    BidRate: price === null ? null : price - 0.1,
    AskRate: price === null ? null : price + 0.1,
    DailyVolume: dailyVolume,
    DailyLow: price === null ? null : price - 1,
    DailyHigh: price === null ? null : price + 1,
    YesterdayRate: price === null ? null : price - 0.5,
    PaperMarketCap: price === null ? null : 1000000,
    TradeDateTime: price === null ? null : "2026-10-04T19:00:00",
    collectedAtMs: 1700000001000
  };
}

function historyRow(cycleId, collectedAtMs = 10000 - cycleId) {
  return {
    collectedAtMs,
    cycleId,
    Price: cycleId,
    ChangePercent: 1.2,
    BidRate: cycleId - 0.1,
    AskRate: cycleId + 0.1,
    DailyVolume: cycleId * 10,
    DailyLow: cycleId - 1,
    DailyHigh: cycleId + 1,
    YesterdayRate: cycleId - 0.5,
    PaperMarketCap: 1000000 + cycleId,
    TradeDateTime: `fixture-${cycleId}`
  };
}

test.beforeAll(async () => {
  const currentSurfacePath = path.join(ROOT, "browser/viewer/current-surface.js");
  const currentModelPath = path.join(ROOT, "browser/viewer/current-model.js");
  const detailSurfacePath = path.join(ROOT, "browser/viewer/detail-surface.js");
  const detailModelPath = path.join(ROOT, "browser/viewer/detail-model.js");
  const result = await build({
    stdin: {
      contents: `
        import { createCurrentSurface } from ${JSON.stringify(currentSurfacePath)};
        import { US_CURRENT_PROFILE } from ${JSON.stringify(currentModelPath)};
        import { createDetailSurface } from ${JSON.stringify(detailSurfacePath)};
        import { US_DETAIL_PROFILE } from ${JSON.stringify(detailModelPath)};
        globalThis.__createUsCurrentSurface = (options) => createCurrentSurface({ ...options, profile: US_CURRENT_PROFILE });
        globalThis.__createUsDetailSurface = (options) => createDetailSurface({ ...options, profile: US_DETAIL_PROFILE });
      `,
      resolveDir: ROOT,
      sourcefile: "us-viewer-surfaces-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  viewerBundle = result.outputFiles[0].text;
});

async function mountCurrent(page, rows) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: viewerBundle });
  await page.evaluate(({ rows, status }) => {
    globalThis.__usCurrentRows = rows;
    globalThis.__usOpened = [];
    globalThis.__usCurrent = globalThis.__createUsCurrentSurface({
      root: document.querySelector("#root"),
      client: {
        async getCurrent() {
          return {
            rows: globalThis.__usCurrentRows,
            summary: {
              rowCount: globalThis.__usCurrentRows.length,
              lastCycleId: 12,
              lastCollectedAtMs: 1700000001000
            }
          };
        },
        async getStatus() {
          return status;
        }
      },
      onOpenSecurity(securityId) {
        globalThis.__usOpened.push(securityId);
      }
    });
  }, { rows, status: STATUS });
}

async function mountDetail(page, options) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: viewerBundle });
  await page.evaluate((options) => {
    let continuationFailures = options.continuationFailures ?? 0;
    globalThis.__usDetailBack = [];
    globalThis.__usDetailCalls = [];
    globalThis.__usDetail = globalThis.__createUsDetailSurface({
      root: document.querySelector("#root"),
      client: {
        async getSecurity(securityId) {
          globalThis.__usDetailCalls.push(["security", securityId]);
          return options.security;
        },
        async getHistoryPage(securityId, cursor) {
          globalThis.__usDetailCalls.push(["history", securityId, cursor]);
          if (cursor !== null && continuationFailures > 0) {
            continuationFailures -= 1;
            throw new Error("synthetic U.S. continuation failure");
          }
          return cursor === null ? options.firstPage : options.secondPage;
        }
      },
      onBack(returnState) {
        globalThis.__usDetailBack.push(returnState);
      }
    });
  }, options);
}

test("U.S. Current renders exact profile, DailyVolume default sort, zero/missing, diagnostics and refresh state", async ({ page }) => {
  const rows = [
    currentRow({ securityId: "20", paperName: "Zulu", symbol: "ZZZ", price: 0, changePercent: 0, dailyVolume: 100 }),
    currentRow({ securityId: "10", paperName: "Alpha", symbol: "AAA", price: 5, changePercent: 1, dailyVolume: 100 }),
    currentRow({ securityId: "30", paperName: "High", symbol: "HIGH", price: 10, changePercent: 2, dailyVolume: 200 }),
    currentRow({ securityId: "40", paperName: "Missing", symbol: "MISS", price: null, changePercent: null, dailyVolume: null })
  ];
  await mountCurrent(page, rows);
  await page.evaluate(() => globalThis.__usCurrent.refresh());

  const table = page.getByRole("table", { name: "שוק נוכחי" });
  await expect(table.getByRole("columnheader")).toHaveCount(15);
  const volumeHeader = table.getByRole("columnheader", { name: /DailyVolume/ });
  await expect(volumeHeader).toHaveAttribute("aria-sort", "descending");

  const bodyRows = table.locator("tbody tr");
  await expect(bodyRows.nth(0)).toContainText("High");
  await expect(bodyRows.nth(1)).toContainText("Alpha");
  await expect(bodyRows.nth(2)).toContainText("Zulu");
  await expect(bodyRows.nth(3)).toContainText("Missing");

  const zeroRow = table.getByRole("row", { name: /פתח היסטוריה עבור Zulu/ });
  const missingRow = table.getByRole("row", { name: /פתח היסטוריה עבור Missing/ });
  await expect(zeroRow.getByRole("cell").nth(4)).toHaveText("0");
  await expect(zeroRow.getByRole("cell").nth(5)).toHaveText("0%");
  await expect(missingRow.getByRole("cell").nth(4)).toHaveText("—");
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toContainText("רץ");
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toContainText("48");

  const restoredViewState = await page.evaluate(() => {
    const content = document.querySelector(".market-scope-current-content");
    content.style.width = "180px";
    content.style.height = "60px";
    content.style.overflow = "auto";
    globalThis.__usCurrent.restoreViewState({
      sort: { key: "Price", direction: "asc" },
      scrollLeft: 40,
      scrollTop: 10
    });
    return globalThis.__usCurrent.captureViewState();
  });
  await expect(table.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "ascending");

  await page.evaluate(() => {
    globalThis.__usCurrentRows = globalThis.__usCurrentRows.map((row) => ({
      ...row,
      DailyVolume: row.DailyVolume === null ? null : row.DailyVolume + 1
    }));
    return globalThis.__usCurrent.refresh();
  });

  await expect(table.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "ascending");
  const refreshedViewState = await page.evaluate(() => globalThis.__usCurrent.captureViewState());
  expect(refreshedViewState).toMatchObject({
    sort: { key: "Price", direction: "asc" },
    scrollLeft: restoredViewState.scrollLeft,
    scrollTop: restoredViewState.scrollTop
  });

  await zeroRow.click();
  await expect.poll(() => page.evaluate(() => globalThis.__usOpened)).toEqual(["20"]);
});

test("U.S. Detail renders summary/history, preserves 500 rows across retry, supports historical-only and returns state", async ({ page }) => {
  const firstRows = Array.from(
    { length: 500 },
    (_, index) => historyRow(700 - index, 5000 - Math.floor(index / 2))
  );
  const boundaryTimestamp = firstRows.at(-1).collectedAtMs;
  const secondRows = [historyRow(200, boundaryTimestamp), historyRow(199, boundaryTimestamp - 1)];

  await mountDetail(page, {
    security: {
      found: true,
      securityId: "101",
      paperName: "Alpha Inc",
      isCurrent: true,
      currentRow: currentRow({
        securityId: "101",
        paperName: "Alpha Inc",
        symbol: "AAA",
        price: 0,
        changePercent: 1.2,
        dailyVolume: 5000
      })
    },
    firstPage: { rows: firstRows, hasMore: true, nextCursor: "cursor-500" },
    secondPage: { rows: secondRows, hasMore: false, nextCursor: null },
    continuationFailures: 1
  });

  await page.evaluate(() => globalThis.__usDetail.open("101", {
    returnState: { sort: { key: "DailyVolume", direction: "desc" }, scrollLeft: 44, scrollTop: 88 }
  }));

  const table = page.getByRole("table", { name: "היסטוריית נייר" });
  await expect(table.getByRole("columnheader")).toHaveCount(12);
  await expect(table.locator("tbody tr")).toHaveCount(500);
  await expect(page.getByText("Alpha Inc", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-price")).toHaveText("0");
  await expect(page.locator(".market-scope-detail-summary").getByText("1.2%", { exact: true })).toBeVisible();
  await expect(page.locator(".market-scope-detail-summary").getByText("2026-10-04T19:00:00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "טען ישנים יותר" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(500);
  await expect(page.getByRole("button", { name: "נסה שוב לטעון ישנים יותר" })).toBeVisible();

  await page.getByRole("button", { name: "נסה שוב לטעון ישנים יותר" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(502);
  await expect(page.getByRole("button", { name: /טען ישנים יותר|נסה שוב/ })).toHaveCount(0);

  await page.getByRole("button", { name: "← חזרה לטבלה" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__usDetailBack)).toEqual([{
    sort: { key: "DailyVolume", direction: "desc" },
    scrollLeft: 44,
    scrollTop: 88
  }]);

  await mountDetail(page, {
    security: {
      found: true,
      securityId: "9001",
      paperName: "History Only",
      isCurrent: false,
      currentRow: null
    },
    firstPage: {
      rows: [historyRow(77, 1000)],
      hasMore: false,
      nextCursor: null
    },
    secondPage: null
  });
  await page.evaluate(() => globalThis.__usDetail.open("9001"));
  await expect(page.getByText("History Only", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-price")).toHaveText("—");
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(1);
});
