import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let detailBundle;

function historyRow(cycleId, collectedAtMs = 10000 - cycleId) {
  return {
    collectedAtMs,
    cycleId,
    chunkIndex: 0,
    LastKnownRate: cycleId,
    BaseRateChangePercentage: 0,
    BuyLimit1: cycleId - 1,
    BuyVolume1: 0,
    SellLimit1: cycleId + 1,
    SellVolume1: 2,
    DailyDealsQuantity: cycleId,
    LastDealVolume: 0,
    DailyTurnover: 0,
    DailyNISRevenue: null,
    LastDealTimeOnly: null,
    serverAsOfDate: `fixture-${cycleId}`
  };
}

test.beforeAll(async () => {
  const modulePath = path.join(ROOT, "browser/viewer/detail-surface.js");
  const result = await build({
    stdin: {
      contents: `import { createDetailSurface } from ${JSON.stringify(modulePath)}; globalThis.__createDetailSurface = createDetailSurface;`,
      resolveDir: ROOT,
      sourcefile: "detail-surface-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  detailBundle = result.outputFiles[0].text;
});

async function mount(page, options) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: detailBundle });
  await page.evaluate((options) => {
    const calls = [];
    const back = [];
    let continuationFailures = options.continuationFailures ?? 0;
    let releaseSecurity = null;
    const securityGate = options.holdSecurity
      ? new Promise((resolve) => {
          releaseSecurity = resolve;
        })
      : null;

    globalThis.__releaseDetailSecurity = () => {
      releaseSecurity?.();
      releaseSecurity = null;
    };

    const client = {
      async getSecurity(securityId) {
        calls.push(["security", securityId]);
        if (securityGate) await securityGate;
        return options.security;
      },
      async getHistoryPage(securityId, cursor) {
        calls.push(["history", securityId, cursor]);
        if (cursor !== null && continuationFailures > 0) {
          continuationFailures -= 1;
          throw new Error("synthetic continuation failure");
        }
        return cursor === null ? options.firstPage : options.secondPage;
      }
    };

    globalThis.__detailCalls = calls;
    globalThis.__detailBack = back;
    globalThis.__detail = globalThis.__createDetailSurface({
      root: document.querySelector("#root"),
      client,
      onBack(returnState) {
        back.push(returnState);
      }
    });
  }, options);
}

test("Detail renders exact History shape, initial 500, retryable Load More and Back", async ({ page }) => {
  const firstRows = Array.from({ length: 500 }, (_, index) => historyRow(700 - index, 5000 - Math.floor(index / 2)));
  const boundaryTimestamp = firstRows.at(-1).collectedAtMs;
  const secondRows = [historyRow(200, boundaryTimestamp), historyRow(199, boundaryTimestamp - 1)];

  await mount(page, {
    security: {
      found: true,
      securityId: "1001",
      paperName: "Fixture Alpha",
      isCurrent: true,
      currentRow: {
        securityId: "1001",
        paperName: "Fixture Alpha",
        LastKnownRate: 1234,
        BaseRateChangePercentage: 1.2,
        BuyLimit1: 1230,
        SellLimit1: 1240,
        LastDealTimeOnly: "10:00:01"
      }
    },
    firstPage: { rows: firstRows, hasMore: true, nextCursor: "cursor-500" },
    secondPage: { rows: secondRows, hasMore: false, nextCursor: null },
    continuationFailures: 1,
    holdSecurity: true
  });

  await page.evaluate(() => {
    void globalThis.__detail.open("1001", {
      returnState: { scrollLeft: 44, scrollTop: 88 }
    });
  });
  await expect(page.getByRole("status")).toContainText("טוען היסטוריה");
  await page.evaluate(() => globalThis.__releaseDetailSecurity());

  const table = page.getByRole("table", { name: "היסטוריית נייר" });
  await expect(table.getByRole("columnheader")).toHaveCount(15);
  await expect(table.locator("tbody tr")).toHaveCount(500);
  await expect(page.getByText("Fixture Alpha", { exact: true })).toBeVisible();
  await expect(page.getByText("1.2%", { exact: true })).toBeVisible();

  const more = page.getByRole("button", { name: "טען ישנים יותר" });
  await more.click();
  await expect(table.locator("tbody tr")).toHaveCount(500);
  await expect(page.getByRole("button", { name: "נסה שוב לטעון ישנים יותר" })).toBeVisible();

  await page.getByRole("button", { name: "נסה שוב לטעון ישנים יותר" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(502);
  await expect(page.getByRole("button", { name: /טען ישנים יותר|נסה שוב/ })).toHaveCount(0);

  await page.getByRole("button", { name: "← חזרה לטבלה" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__detailBack)).toEqual([
    { scrollLeft: 44, scrollTop: 88 }
  ]);

  await expect.poll(() => page.evaluate(() => globalThis.__detailCalls)).toEqual([
    ["security", "1001"],
    ["history", "1001", null],
    ["history", "1001", "cursor-500"],
    ["history", "1001", "cursor-500"]
  ]);
});

test("Detail distinguishes known-empty, unknown, initial error and historical-only without fabricating current summary", async ({ page }) => {
  await mount(page, {
    security: {
      found: true,
      securityId: "9001",
      paperName: "Historical Alpha",
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

  await page.evaluate(() => globalThis.__detail.open("9001"));
  await expect(page.getByText("Historical Alpha", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-last-rate")).toHaveText("—");
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(1);

  await mount(page, {
    security: {
      found: true,
      securityId: "9002",
      paperName: "Known Empty",
      isCurrent: false,
      currentRow: null
    },
    firstPage: { rows: [], hasMore: false, nextCursor: null },
    secondPage: null
  });
  await page.evaluate(() => globalThis.__detail.open("9002"));
  await expect(page.getByText("אין היסטוריה שמורה לנייר זה.")).toBeVisible();

  await mount(page, {
    security: {
      found: false,
      securityId: "9999",
      paperName: null,
      isCurrent: false,
      currentRow: null
    },
    firstPage: { rows: [], hasMore: false, nextCursor: null },
    secondPage: null
  });
  await page.evaluate(() => globalThis.__detail.open("9999"));
  await expect(page.getByRole("alert")).toContainText("הנייר לא נמצא");
  await expect.poll(() => page.evaluate(() => globalThis.__detailCalls)).toEqual([
    ["security", "9999"]
  ]);

  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: detailBundle });
  await page.evaluate(() => {
    globalThis.__detail = globalThis.__createDetailSurface({
      root: document.querySelector("#root"),
      client: {
        async getSecurity() {
          return {
            found: true,
            securityId: "1001",
            paperName: "Fixture Alpha",
            isCurrent: true,
            currentRow: { securityId: "1001", paperName: "Fixture Alpha" }
          };
        },
        async getHistoryPage() {
          throw new Error("synthetic initial history failure");
        }
      }
    });
  });
  await page.evaluate(() => globalThis.__detail.open("1001"));
  await expect(page.getByRole("alert")).toContainText("שגיאה בטעינת ההיסטוריה");
  await expect(page.getByText("אין היסטוריה שמורה לנייר זה.")).toHaveCount(0);
});

test("Detail ignores stale open responses after a newer security is selected", async ({ page }) => {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: detailBundle });

  await page.evaluate(() => {
    let resolveFirst;
    const firstSecurity = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    globalThis.__resolveFirstSecurity = resolveFirst;
    globalThis.__staleCalls = [];
    globalThis.__detail = globalThis.__createDetailSurface({
      root: document.querySelector("#root"),
      client: {
        async getSecurity(securityId) {
          globalThis.__staleCalls.push(["security", securityId]);
          if (securityId === "1001") return await firstSecurity;
          return {
            found: true,
            securityId: "1002",
            paperName: "Fixture Beta",
            isCurrent: false,
            currentRow: null
          };
        },
        async getHistoryPage(securityId, cursor) {
          globalThis.__staleCalls.push(["history", securityId, cursor]);
          return { rows: [], hasMore: false, nextCursor: null };
        }
      }
    });

    void globalThis.__detail.open("1001");
  });

  await page.evaluate(() => globalThis.__detail.open("1002"));
  await expect(page.getByText("Fixture Beta", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    globalThis.__resolveFirstSecurity({
      found: true,
      securityId: "1001",
      paperName: "Fixture Alpha",
      isCurrent: false,
      currentRow: null
    });
  });
  await page.waitForTimeout(0);

  await expect(page.getByText("Fixture Beta", { exact: true })).toBeVisible();
  await expect(page.getByText("Fixture Alpha", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__detail.getState())).toMatchObject({
    state: "DETAIL",
    selectedSecurityId: "1002"
  });
  await expect.poll(() => page.evaluate(() => globalThis.__staleCalls)).toEqual([
    ["security", "1001"],
    ["security", "1002"],
    ["history", "1002", null]
  ]);
});

