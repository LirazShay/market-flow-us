import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let bundle;

test.beforeAll(async () => {
  const scannerPath = path.join(ROOT, "browser/viewer/scanner-surface.js");
  const detailPath = path.join(ROOT, "browser/viewer/detail-surface.js");
  const detailModelPath = path.join(ROOT, "browser/viewer/detail-model.js");
  const builtinsPath = path.join(ROOT, "shared/scanner/builtins.js");

  const result = await build({
    stdin: {
      contents: `
        import { createScannerSurface } from ${JSON.stringify(scannerPath)};
        import { createDetailSurface } from ${JSON.stringify(detailPath)};
        import { US_DETAIL_PROFILE } from ${JSON.stringify(detailModelPath)};
        import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from ${JSON.stringify(builtinsPath)};
        globalThis.__createScannerSurface = createScannerSurface;
        globalThis.__createDetailSurface = createDetailSurface;
        globalThis.__US_DETAIL_PROFILE = US_DETAIL_PROFILE;
        globalThis.__US_SCANNER_BUILTINS = MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES;
      `,
      resolveDir: ROOT,
      sourcefile: "us-scanner-surface-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });

  bundle = result.outputFiles[0].text;
});

async function mount(page) {
  await page.setContent('<main><section id="scanner"></section><section id="detail"></section></main>');
  await page.addScriptTag({ content: bundle });

  await page.evaluate(() => {
    const calls = [];
    const opened = [];

    const historyRows = {
      "9001": {
        collectedAtMs: 1000,
        cycleId: 77,
        Price: 12.25,
        ChangePercent: 1.1,
        BidRate: 12.2,
        AskRate: 12.3,
        DailyVolume: 1500,
        DailyLow: 11.8,
        DailyHigh: 12.5,
        YesterdayRate: 12.1,
        PaperMarketCap: 100000,
        TradeDateTime: "2026-10-05T01:00:00"
      },
      "1001": {
        collectedAtMs: 2000,
        cycleId: 88,
        Price: 20,
        ChangePercent: 2.5,
        BidRate: 19.9,
        AskRate: 20.1,
        DailyVolume: 2500,
        DailyLow: 19,
        DailyHigh: 21,
        YesterdayRate: 19.5,
        PaperMarketCap: 200000,
        TradeDateTime: "2026-10-05T01:01:00"
      }
    };

    const client = {
      async listScannerQueries() {
        return { queries: globalThis.__US_SCANNER_BUILTINS };
      },
      async createScannerQuery(draft) {
        return {
          query: {
            queryId: "user:copy",
            source: "user",
            ...draft,
            editable: true,
            deletable: true,
            createdAtMs: 1,
            updatedAtMs: 1
          }
        };
      },
      async updateScannerQuery(draft) {
        return {
          query: {
            source: "user",
            ...draft,
            editable: true,
            deletable: true,
            createdAtMs: 1,
            updatedAtMs: 2
          }
        };
      },
      async deleteScannerQuery(queryId) {
        return { queryId };
      },
      async executeScanner(sql) {
        calls.push(sql);
        return {
          columns: [
            { name: "securityId", type: "VARCHAR" },
            { name: "Symbol", type: "VARCHAR" },
            { name: "Price", type: "DOUBLE" },
            { name: "stage_reached", type: "INTEGER" }
          ],
          rows: [
            ["9001", "HIST", 12.25, 7],
            ["1001", "CURR", 20, 6]
          ],
          rowCount: 2,
          startedAtMs: 1,
          completedAtMs: 2,
          durationMs: 1
        };
      },
      async getSecurity(securityId) {
        if (securityId === "9001") {
          return {
            found: true,
            securityId,
            paperName: "Historical US Alpha",
            isCurrent: false,
            currentRow: null
          };
        }

        return {
          found: true,
          securityId,
          paperName: "Current US Beta",
          isCurrent: true,
          currentRow: {
            securityId,
            paperName: "Current US Beta",
            Symbol: "CURR",
            ExchangeName: "NASDAQ",
            Price: 20,
            ChangePercent: 2.5,
            BidRate: 19.9,
            AskRate: 20.1,
            DailyVolume: 2500,
            TradeDateTime: "2026-10-05T01:01:00"
          }
        };
      },
      async getHistoryPage(securityId) {
        return {
          rows: [historyRows[securityId]],
          hasMore: false,
          nextCursor: null
        };
      }
    };

    const detail = globalThis.__createDetailSurface({
      root: document.querySelector("#detail"),
      client,
      profile: globalThis.__US_DETAIL_PROFILE
    });

    globalThis.__scannerCalls = calls;
    globalThis.__scannerOpened = opened;
    globalThis.__scanner = globalThis.__createScannerSurface({
      root: document.querySelector("#scanner"),
      client,
      onOpenSecurity(securityId) {
        opened.push(securityId);
        void detail.open(securityId);
      }
    });
  });
}

test("U.S. staged built-in loads as Draft only and securityId results navigate to the U.S. Detail profile", async ({ page }) => {
  await mount(page);

  const savedQuery = page.getByLabel("שאילתה שמורה");
  await expect(savedQuery).toBeEnabled();
  await savedQuery.selectOption("builtin:staged-candidate-ranking");

  await expect(page.getByLabel("SQL")).toHaveValue(/stage_reached/);
  await expect(page.getByText("שאילתה מובנית לקריאה בלבד; אפשר לערוך טיוטה ולשמור בשם חדש.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__scannerCalls.length)).toBe(0);

  await page.getByRole("button", { name: "הפעל" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__scannerCalls.length)).toBe(1);
  await expect(page.getByRole("table", { name: "תוצאות Scanner" }).getByRole("columnheader")).toHaveText([
    "securityId",
    "Symbol",
    "Price",
    "stage_reached"
  ]);

  const scannerTable = page.getByRole("table", { name: "תוצאות Scanner" });
  await scannerTable.getByRole("row", { name: /פתח היסטוריה עבור 9001/ }).click();
  await expect(page.getByText("Historical US Alpha", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-price")).toHaveText("—");
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).getByRole("columnheader")).toHaveText([
    "זמן איסוף",
    "Cycle",
    "Price",
    "ChangePercent",
    "BidRate",
    "AskRate",
    "DailyVolume",
    "DailyLow",
    "DailyHigh",
    "YesterdayRate",
    "PaperMarketCap",
    "TradeDateTime"
  ]);

  const currentRow = scannerTable.getByRole("row", { name: /פתח היסטוריה עבור 1001/ });
  await currentRow.focus();
  await currentRow.press("Enter");
  await expect(page.getByText("Current US Beta", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-price")).toHaveText("20");
  await expect.poll(() => page.evaluate(() => globalThis.__scannerOpened)).toEqual(["9001", "1001"]);

  await page.evaluate(() => globalThis.__scanner.destroy());
});
