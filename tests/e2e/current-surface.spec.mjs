import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let viewerBundle;

const ROWS = [
  {
    paperName: "Fixture Alpha",
    securityId: "1001",
    LastKnownRate: 1234,
    BaseRateChangePercentage: 1.2,
    BuyLimit1: 1230,
    BuyVolume1: 10,
    SellLimit1: 1240,
    SellVolume1: 12,
    DailyDealsQuantity: 100,
    LastDealVolume: 4,
    DailyTurnover: 100000,
    DailyNISRevenue: 200000,
    DailyLowestRate: 1200,
    DailyHighestRate: 1260,
    LastDealTimeOnly: "10:00:01",
    collectedAtMs: 1700000000000
  },
  {
    paperName: "Fixture Beta",
    securityId: "1002",
    LastKnownRate: 0,
    BaseRateChangePercentage: 0,
    BuyLimit1: null,
    BuyVolume1: 0,
    SellLimit1: 10,
    SellVolume1: 0,
    DailyDealsQuantity: 50,
    LastDealVolume: 0,
    DailyTurnover: 0,
    DailyNISRevenue: null,
    DailyLowestRate: 0,
    DailyHighestRate: 10,
    LastDealTimeOnly: null,
    collectedAtMs: 1700000001000
  }
];

const STATUS = {
  serviceReady: true,
  recorderHealth: "RUNNING",
  lastCompletedAtMs: 1700000001000,
  lastCompletedCycleId: 12,
  lastCycleDurationMs: 321,
  latestCount: 2,
  completedCycles: 12,
  failedCycles: 1,
  historyCount: 24,
  lastError: null
};

test.beforeAll(async () => {
  const modulePath = path.join(ROOT, "browser/viewer/current-surface.js");
  const result = await build({
    stdin: {
      contents: `import { createCurrentSurface } from ${JSON.stringify(modulePath)}; globalThis.__createCurrentSurface = createCurrentSurface;`,
      resolveDir: ROOT,
      sourcefile: "current-surface-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  viewerBundle = result.outputFiles[0].text;
});

async function mount(page, { current, status = STATUS, currentError = null } = {}) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: viewerBundle });
  await page.evaluate(({ current, status, currentError }) => {
    const calls = [];
    const opened = [];
    const client = {
      async getCurrent() {
        calls.push("current");
        if (currentError) throw new Error(currentError);
        return current;
      },
      async getStatus() {
        calls.push("status");
        return status;
      }
    };

    globalThis.__viewerCalls = calls;
    globalThis.__openedSecurities = opened;
    globalThis.__surface = globalThis.__createCurrentSurface({
      root: document.querySelector("#root"),
      client,
      onOpenSecurity(securityId) {
        opened.push(securityId);
      }
    });
  }, { current, status, currentError });
}

test("Current renders loading/populated diagnostics, deterministic sort, and accessible row activation", async ({ page }) => {
  await mount(page, {
    current: {
      rows: ROWS,
      summary: { rowCount: 2, lastCycleId: 12, lastCollectedAtMs: 1700000001000 }
    }
  });

  await expect(page.getByRole("status")).toContainText("טוען");
  await page.evaluate(() => globalThis.__surface.refresh());

  const table = page.getByRole("table", { name: "שוק נוכחי" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveCount(16);
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toContainText("רץ");
  await expect(page.getByRole("region", { name: "אבחון תפעולי" })).toContainText("24");

  const dealsHeader = table.getByRole("columnheader", { name: /מס' עסקאות/ });
  await expect(dealsHeader).toHaveAttribute("aria-sort", "descending");
  await expect(table.getByRole("row").nth(1)).toContainText("Fixture Alpha");

  await dealsHeader.getByRole("button").click();
  await expect(dealsHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(table.getByRole("row").nth(1)).toContainText("Fixture Beta");

  const row = table.getByRole("row", { name: /פתח היסטוריה עבור Fixture Beta/ });
  await row.click();
  await row.focus();
  await row.press("Enter");
  await row.press("Space");

  await expect.poll(() => page.evaluate(() => globalThis.__openedSecurities)).toEqual([
    "1002",
    "1002",
    "1002"
  ]);
  await expect.poll(() => page.evaluate(() => globalThis.__viewerCalls)).toEqual([
    "current",
    "status"
  ]);

  await expect(row.getByRole("cell").nth(2)).toHaveText("0");
  await expect(row.getByRole("cell").nth(4)).toHaveText("—");
});

test("Current distinguishes explicit empty state from authoritative read failure", async ({ page }) => {
  await mount(page, {
    current: {
      rows: [],
      summary: { rowCount: 0, lastCycleId: null, lastCollectedAtMs: null }
    }
  });

  await page.evaluate(() => globalThis.__surface.refresh());
  await expect(page.getByText("אין עדיין snapshot מלא.")).toBeVisible();
  await expect(page.getByText("0 ניירות")).toBeVisible();

  await mount(page, {
    current: null,
    currentError: "synthetic viewer read failure"
  });

  await page.evaluate(() => globalThis.__surface.refresh());
  await expect(page.getByRole("alert")).toContainText("שגיאה בטעינת נתוני השוק");
  await expect(page.getByText("אין עדיין snapshot מלא.")).toHaveCount(0);
});
