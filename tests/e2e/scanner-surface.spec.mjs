import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let scannerBundle;

test.beforeAll(async () => {
  const modulePath = path.join(ROOT, "browser/viewer/scanner-surface.js");
  const result = await build({
    stdin: {
      contents: `import { createScannerSurface } from ${JSON.stringify(modulePath)}; import { createDetailSurface } from ${JSON.stringify(path.join(ROOT, "browser/viewer/detail-surface.js"))}; globalThis.__createScannerSurface = createScannerSurface; globalThis.__createDetailSurface = createDetailSurface;`,
      resolveDir: ROOT,
      sourcefile: "scanner-surface-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  scannerBundle = result.outputFiles[0].text;
});

async function mount(page) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: scannerBundle });
  await page.evaluate(() => {
    const calls = [];
    let active = 0;
    let maxActive = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const client = {
      async listScannerQueries() {
        return { queries: [] };
      },
      async createScannerQuery(draft) {
        return {
          query: {
            queryId: "user:fixture",
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
        const call = { sql, startedAt: performance.now(), completedAt: null };
        calls.push(call);
        active += 1;
        maxActive = Math.max(maxActive, active);

        try {
          if (sql.includes("DELAY")) {
            await sleep(90);
          }

          if (sql.includes("ERROR")) {
            throw new Error("synthetic scanner failure");
          }

          if (sql.includes("ZERO")) {
            return {
              columns: [{ name: "securityId", type: "VARCHAR" }],
              rows: [],
              rowCount: 0,
              startedAtMs: 1,
              completedAtMs: 2,
              durationMs: 1
            };
          }

          return {
            columns: [
              { name: "second", type: "VARCHAR" },
              { name: "duplicate", type: "INTEGER" },
              { name: "duplicate", type: "INTEGER" }
            ],
            rows: [
              ["row-two", 2, 20],
              ["row-one", 1, 10]
            ],
            rowCount: 2,
            startedAtMs: 1,
            completedAtMs: 2,
            durationMs: 1
          };
        } finally {
          active -= 1;
          call.completedAt = performance.now();
        }
      }
    };

    globalThis.__scannerCalls = calls;
    globalThis.__scannerMaxActive = () => maxActive;
    globalThis.__scanner = globalThis.__createScannerSurface({
      root: document.querySelector("#root"),
      client
    });
  });
}

async function activate(page, sql, intervalSeconds) {
  await page.getByLabel("SQL").fill(sql);
  await page.getByLabel("מרווח (שניות)").fill(String(intervalSeconds));
  await page.getByRole("button", { name: "הפעל" }).click();
}

test("Scanner activates immediately, repeats after completion, preserves exact results and keeps drafts inactive", async ({ page }) => {
  await mount(page);
  await activate(page, "SELECT DELAY ordered", 0.05);

  await expect.poll(() => page.evaluate(() => globalThis.__scannerCalls.length)).toBeGreaterThanOrEqual(1);
  await expect(page.getByText("שאילתה פעילה", { exact: true })).toBeVisible();

  const table = page.getByRole("table", { name: "תוצאות Scanner" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveText([
    "second",
    "duplicate",
    "duplicate"
  ]);
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.locator("tbody tr").nth(0).getByRole("cell")).toHaveText([
    "row-two",
    "2",
    "20"
  ]);
  await expect(table.locator("tbody tr").nth(1).getByRole("cell")).toHaveText([
    "row-one",
    "1",
    "10"
  ]);

  await page.getByLabel("SQL").fill("SELECT ZERO draft-only");
  await page.waitForTimeout(220);

  const beforeReactivate = await page.evaluate(() => globalThis.__scannerCalls.map((call) => call.sql));
  expect(beforeReactivate.length).toBeGreaterThanOrEqual(2);
  expect(beforeReactivate.every((sql) => sql === "SELECT DELAY ordered")).toBe(true);

  const timing = await page.evaluate(() => ({
    maxActive: globalThis.__scannerMaxActive(),
    calls: globalThis.__scannerCalls.map((call) => ({
      startedAt: call.startedAt,
      completedAt: call.completedAt
    }))
  }));
  expect(timing.maxActive).toBe(1);
  for (let index = 1; index < timing.calls.length; index += 1) {
    expect(timing.calls[index].startedAt - timing.calls[index - 1].completedAt).toBeGreaterThanOrEqual(35);
  }

  await page.getByRole("button", { name: "הפעל" }).click();
  await expect(page.getByText("השאילתה הושלמה ללא שורות.")).toBeVisible();
  await expect(page.getByRole("table", { name: "תוצאות Scanner" }).getByRole("columnheader")).toHaveText([
    "securityId"
  ]);

  await activate(page, "SELECT ERROR", 1);
  await expect(page.getByRole("alert")).toContainText("שגיאה בהרצת השאילתה");

  await page.evaluate(() => globalThis.__scanner.destroy());
});

test("Scanner rejects a non-positive interval in the UI without executing SQL", async ({ page }) => {
  await mount(page);
  await page.getByLabel("SQL").fill("SELECT 1");
  await page.getByLabel("מרווח (שניות)").fill("0");
  await page.getByRole("button", { name: "הפעל" }).click();

  await expect(page.getByRole("alert")).toContainText("מרווח חיובי");
  await expect.poll(() => page.evaluate(() => globalThis.__scannerCalls.length)).toBe(0);
  await page.evaluate(() => globalThis.__scanner.destroy());
});


test("Scanner recognized SecurityId rows open the shared Detail surface while ordinary results stay non-navigable", async ({ page }) => {
  await page.setContent('<main><section id="scanner"></section><section id="detail"></section></main>');
  await page.addScriptTag({ content: scannerBundle });

  await page.evaluate(() => {
    const opened = [];
    let scannerResult = {
      columns: [
        { name: "security_id", type: "VARCHAR" },
        { name: "score", type: "DOUBLE" }
      ],
      rows: [
        ["9001", 9.1],
        ["1001", 8.2]
      ],
      rowCount: 2,
      startedAtMs: 1,
      completedAtMs: 2,
      durationMs: 1
    };

    const historyRow = {
      collectedAtMs: 1000,
      cycleId: 77,
      chunkIndex: 0,
      LastKnownRate: 321,
      BaseRateChangePercentage: 0,
      BuyLimit1: 320,
      BuyVolume1: 1,
      SellLimit1: 322,
      SellVolume1: 2,
      DailyDealsQuantity: 10,
      LastDealVolume: 1,
      DailyTurnover: 100,
      DailyNISRevenue: 1000,
      LastDealTimeOnly: "10:00:00",
      serverAsOfDate: "fixture"
    };

    const client = {
      async listScannerQueries() {
        return { queries: [] };
      },
      async createScannerQuery(draft) {
        return {
          query: {
            queryId: "user:fixture",
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
      async executeScanner() {
        return scannerResult;
      },
      async getSecurity(securityId) {
        if (securityId === "9001") {
          return {
            found: true,
            securityId,
            paperName: "Historical Scanner Alpha",
            isCurrent: false,
            currentRow: null
          };
        }
        return {
          found: true,
          securityId,
          paperName: "Current Scanner Beta",
          isCurrent: true,
          currentRow: {
            securityId,
            paperName: "Current Scanner Beta",
            LastKnownRate: 456,
            BaseRateChangePercentage: 1.5,
            BuyLimit1: 455,
            SellLimit1: 457,
            LastDealTimeOnly: "10:01:00"
          }
        };
      },
      async getHistoryPage(securityId) {
        return {
          rows: [{ ...historyRow, cycleId: securityId === "9001" ? 77 : 88 }],
          hasMore: false,
          nextCursor: null
        };
      }
    };

    const detail = globalThis.__createDetailSurface({
      root: document.querySelector("#detail"),
      client
    });

    globalThis.__scannerOpened = opened;
    globalThis.__setScannerResult = (next) => {
      scannerResult = next;
    };
    globalThis.__scanner = globalThis.__createScannerSurface({
      root: document.querySelector("#scanner"),
      client,
      onOpenSecurity(securityId) {
        opened.push(securityId);
        void detail.open(securityId);
      }
    });
  });

  await activate(page, "SELECT security_id, score FROM candidates", 1);
  const scannerTable = page.getByRole("table", { name: "תוצאות Scanner" });
  const historicalRow = scannerTable.getByRole("row", { name: /פתח היסטוריה עבור 9001/ });
  await historicalRow.click();

  await expect(page.getByText("Historical Scanner Alpha", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-last-rate")).toHaveText("—");
  await expect(page.getByRole("table", { name: "היסטוריית נייר" }).locator("tbody tr")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => globalThis.__scannerOpened)).toEqual(["9001"]);

  const currentRow = scannerTable.getByRole("row", { name: /פתח היסטוריה עבור 1001/ });
  await currentRow.focus();
  await currentRow.press("Enter");
  await expect(page.getByText("Current Scanner Beta", { exact: true })).toBeVisible();
  await expect(page.getByTestId("detail-last-rate")).toHaveText("456");
  await expect.poll(() => page.evaluate(() => globalThis.__scannerOpened)).toEqual(["9001", "1001"]);

  await page.evaluate(() => {
    globalThis.__scanner.destroy();
    document.querySelector("#scanner").replaceChildren();
    globalThis.__scanner = globalThis.__createScannerSurface({
      root: document.querySelector("#scanner"),
      client: {
      async listScannerQueries() {
        return { queries: [] };
      },
      async createScannerQuery(draft) {
        return {
          query: {
            queryId: "user:fixture",
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
        async executeScanner() {
          return {
            columns: [
              { name: "candidate", type: "VARCHAR" },
              { name: "score", type: "DOUBLE" }
            ],
            rows: [["9001", 9.1]],
            rowCount: 1,
            startedAtMs: 1,
            completedAtMs: 2,
            durationMs: 1
          };
        }
      },
      onOpenSecurity(securityId) {
        globalThis.__scannerOpened.push(securityId);
      }
    });
  });

  await activate(page, "SELECT candidate, score FROM candidates", 1);
  const ordinaryRow = page.getByRole("table", { name: "תוצאות Scanner" }).locator("tbody tr").first();
  await ordinaryRow.click();
  await expect(ordinaryRow).not.toHaveAttribute("tabindex");
  await expect.poll(() => page.evaluate(() => globalThis.__scannerOpened)).toEqual(["9001", "1001"]);

  await page.evaluate(() => globalThis.__scanner.destroy());
});
