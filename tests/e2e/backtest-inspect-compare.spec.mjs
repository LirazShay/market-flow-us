import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let surfaceBundle;

test.beforeAll(async () => {
  const surfacePath = path.join(ROOT, "browser/backtest-lab/surface.js");
  const result = await build({
    stdin: {
      contents: `
        import { createBacktestLabSurface } from ${JSON.stringify(surfacePath)};
        globalThis.__BacktestUiTest = { createBacktestLabSurface };
      `,
      resolveDir: ROOT,
      sourcefile: "backtest-inspect-compare-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  surfaceBundle = result.outputFiles[0].text;
});

function templates() {
  return [
    {
      id: "builtin:all-current-fields",
      name: "All current fields",
      sql: "SELECT security_id AS securityId FROM latest ORDER BY security_id"
    },
    {
      id: "builtin:market-ranking-example",
      name: "U.S. market ranking example",
      sql: "SELECT security_id AS securityId FROM latest ORDER BY ChangePercent DESC"
    },
    {
      id: "builtin:staged-candidate-ranking",
      name: "Staged candidate ranking",
      sql: "SELECT security_id AS securityId FROM latest ORDER BY Price DESC"
    }
  ];
}

async function mount(page) {
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ content: surfaceBundle });
  await page.evaluate((queryTemplates) => {
    const calls = [];
    let releaseRun = null;
    let scenario = "compare";

    const makeHorizon = (horizonMs, changePercent, price) => ({
      horizonMs,
      targetAtMs: 1_700_000_000_000 + horizonMs,
      futureCycleId: changePercent === null ? null : 20,
      observedAtMs: changePercent === null ? null : 1_700_000_000_000 + horizonMs + 250,
      actualElapsedMs: changePercent === null ? null : horizonMs + 250,
      price,
      changePercent,
      outcome: changePercent === null ? null : changePercent > 0 ? "UP" : changePercent < 0 ? "DOWN" : "FLAT",
      unavailableReason: changePercent === null ? "NO_FUTURE_OBSERVATION" : null,
      timingAnomaly: null
    });

    const makeItem = (securityId, returnedPosition, symbol, baselinePrice, horizonsMs, seed) => ({
      returnedPosition,
      securityId,
      baseline: {
        cycleId: 10,
        collectedAtMs: 1_699_999_999_000,
        price: baselinePrice,
        symbol,
        paperName: `${symbol} Corp`,
        exchangeName: "NASDAQ",
        ageMs: 1000,
        timingAnomaly: null
      },
      horizons: horizonsMs.map((horizonMs, index) => index === 1 && seed === 2
        ? makeHorizon(horizonMs, null, null)
        : makeHorizon(horizonMs, seed * (index + 1), baselinePrice + seed + index))
    });

    const summarize = (items, horizonsMs) => horizonsMs.map((horizonMs, index) => {
      const values = items.map((item) => item.horizons[index].changePercent).filter(Number.isFinite).sort((a, b) => a - b);
      const count = values.length;
      const positiveCount = values.filter((value) => value > 0).length;
      return {
        horizonMs,
        availableCount: count,
        unavailableCount: items.length - count,
        averagePercent: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
        medianPercent: count ? values[Math.floor((count - 1) / 2)] : null,
        positiveCount,
        positiveRate: count ? positiveCount / count : null,
        bestPercent: count ? values.at(-1) : null,
        worstPercent: count ? values[0] : null
      };
    });

    const buildPoint = (request) => {
      if (scenario === "empty") {
        const query = request.queries[0];
        return {
          available: true,
          sourceId: request.sourceId,
          requestedAtMs: request.requestedAtMs,
          baseline: { cycleId: 10, committedAtMs: request.requestedAtMs - 500 },
          topX: request.topX,
          horizonsMs: request.horizonsMs,
          queries: [{
            ...query,
            sourceRowCount: 0,
            selectedSourceRowCount: 0,
            evaluatedUniqueCount: 0,
            duplicateRowCount: 0,
            items: [],
            summary: summarize([], request.horizonsMs)
          }],
          comparison: { unionCount: 0, commonCount: 0, exclusiveCounts: [0], securities: [], pairs: [] }
        };
      }

      const queryA = request.queries[0];
      const queryB = request.queries[1];
      const aItems = [
        makeItem("sec-aaa", 1, "AAA", 100, request.horizonsMs, 1),
        makeItem("sec-bbb", 2, "BBB", 200, request.horizonsMs, -1)
      ];
      const bItems = [
        makeItem("sec-ccc", 1, "CCC", 300, request.horizonsMs, 2),
        makeItem("sec-aaa", 2, "AAA", 100, request.horizonsMs, 1)
      ];
      const shapeQuery = (query, items) => ({
        ...query,
        sourceRowCount: 3,
        selectedSourceRowCount: 2,
        evaluatedUniqueCount: 2,
        duplicateRowCount: 0,
        items,
        summary: summarize(items, request.horizonsMs)
      });
      return {
        available: true,
        sourceId: request.sourceId,
        requestedAtMs: request.requestedAtMs,
        baseline: { cycleId: 10, committedAtMs: request.requestedAtMs - 500 },
        topX: request.topX,
        horizonsMs: request.horizonsMs,
        queries: [shapeQuery(queryA, aItems), shapeQuery(queryB, bItems)],
        comparison: {
          unionCount: 3,
          commonCount: 1,
          exclusiveCounts: [1, 1],
          securities: [
            { securityId: "sec-aaa", positions: [1, 2], presentCount: 2, common: true, exclusive: false, positionChanged: true },
            { securityId: "sec-bbb", positions: [2, null], presentCount: 1, common: false, exclusive: true, positionChanged: false },
            { securityId: "sec-ccc", positions: [null, 1], presentCount: 1, common: false, exclusive: true, positionChanged: false }
          ],
          pairs: [{
            queryIds: [queryA.id, queryB.id],
            overlapCount: 1,
            unionCount: 3,
            overlapRate: 1 / 3,
            onlyCounts: [1, 1],
            positionChanges: [{ securityId: "sec-aaa", positions: [1, 2], delta: 1 }]
          }]
        }
      };
    };

    const client = {
      async listSources() {
        return { sources: [{ sourceId: "active", kind: "active", fileName: "market-flow-us.duckdb" }], count: 1 };
      },
      async listQueries() {
        return { queries: queryTemplates, count: queryTemplates.length };
      },
      async runPoint(request) {
        calls.push(structuredClone(request));
        if (scenario === "unsupported") {
          const error = new Error("Scanner accepts SELECT statements only.");
          error.code = "SCANNER_NON_SELECT";
          throw error;
        }
        if (scenario === "error") {
          const error = new Error("Backtest Lab operation failed safely.");
          error.code = "BACKTEST_RUNTIME_ERROR";
          throw error;
        }
        await new Promise((resolve) => { releaseRun = resolve; });
        return buildPoint(request);
      }
    };

    globalThis.__backtestCalls = calls;
    globalThis.__setBacktestScenario = (next) => { scenario = next; };
    globalThis.__releaseBacktestRun = () => releaseRun?.();
    globalThis.__backtest = globalThis.__BacktestUiTest.createBacktestLabSurface({ client });
  }, templates());

  const host = page.locator("#market-flow-us-backtest-lab");
  await expect(host.getByRole("button", { name: "Run Backtest" })).toBeEnabled();
  return host;
}

async function configureTime(host) {
  await host.getByLabel("Historical decision time").fill("2026-10-11T14:00");
}

test("Compare keeps one frozen point, renders full side-by-side evidence and uses filters as presentation only", async ({ page }) => {
  const host = await mount(page);
  await configureTime(host);

  await expect(host.getByText("No-lookahead", { exact: true })).toBeVisible();
  await expect(host.getByText("Summary מול evidence", { exact: true })).toBeVisible();
  await expect(host.getByText(/לא מכריז אוטומטית איזו אסטרטגיה טובה יותר/)).toBeVisible();

  await host.getByRole("button", { name: "Run Backtest" }).click();
  await expect(host.getByRole("status")).toHaveText("מריץ Backtest...");
  await expect(host.getByRole("button", { name: "Run Backtest" })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__backtestCalls.length)).toBe(1);

  await page.evaluate(() => globalThis.__releaseBacktestRun());
  await expect(host.getByRole("heading", { name: "Compare result" })).toBeVisible();
  await expect(host.getByText("Resolved cycle: 10", { exact: true })).toBeVisible();
  await expect(host.getByText("Cross-Query orientation", { exact: true })).toBeVisible();
  await expect(host.getByText(/position changes 1/)).toBeVisible();

  const aTable = host.getByRole("table", { name: "Evidence U.S. market ranking example" });
  const bTable = host.getByRole("table", { name: "Evidence Staged candidate ranking" });
  await expect(aTable.locator("tbody tr")).toHaveCount(2);
  await expect(bTable.locator("tbody tr")).toHaveCount(2);
  await expect(aTable.locator("tbody tr").nth(0)).toContainText("AAA");
  await expect(aTable.locator("tbody tr").nth(1)).toContainText("BBB");
  await expect(bTable.locator("tbody tr").nth(0)).toContainText("CCC");
  await expect(bTable.locator("tbody tr").nth(1)).toContainText("AAA");
  await expect(bTable).toContainText("Unavailable: NO_FUTURE_OBSERVATION");
  await expect(aTable).toContainText("Price 101");

  await host.getByText("SQL / provenance", { exact: true }).first().click();
  await expect(host.locator("pre").first()).toContainText("ORDER BY ChangePercent DESC");
  await expect(host.getByText(/Baseline cycle: 10/).first()).toBeVisible();

  await host.getByLabel("Common").check();
  await expect(aTable.locator("tbody tr")).toHaveCount(1);
  await expect(bTable.locator("tbody tr")).toHaveCount(1);
  await expect(aTable.locator("tbody tr").first()).toContainText("AAA");
  expect(await page.evaluate(() => globalThis.__backtestCalls.length)).toBe(1);

  await host.getByLabel("All").check();
  await expect(aTable.locator("tbody tr")).toHaveCount(2);
  await expect(bTable.locator("tbody tr")).toHaveCount(2);
  expect(await page.evaluate(() => globalThis.__backtestCalls.length)).toBe(1);
});

test("Inspect sends one Query and renders an explicit zero-row result without fabricating outcomes", async ({ page }) => {
  const host = await mount(page);
  await configureTime(host);
  await page.evaluate(() => globalThis.__setBacktestScenario("empty"));
  await host.getByLabel("inspect", { exact: false }).check();

  await host.getByRole("button", { name: "Run Backtest" }).click();
  await page.evaluate(() => globalThis.__releaseBacktestRun());

  await expect(host.getByRole("heading", { name: "Inspect result" })).toBeVisible();
  await expect(host.getByText("השאילתה החזירה 0 securities בנקודה הזאת.", { exact: true })).toBeVisible();
  await expect(host.getByText("Evaluated unique", { exact: true })).toBeVisible();
  await expect(host.getByText("SQL / provenance", { exact: true })).toBeVisible();

  const request = await page.evaluate(() => globalThis.__backtestCalls[0]);
  expect(request.queries).toHaveLength(1);
  expect(request.topX).toBe(10);
  expect(request.horizonsMs).toEqual([10_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000]);
});

test("Unsupported Query and general failures stay visible, bounded and distinct", async ({ page }) => {
  const host = await mount(page);
  await configureTime(host);

  await page.evaluate(() => globalThis.__setBacktestScenario("unsupported"));
  await host.getByRole("button", { name: "Run Backtest" }).click();
  await expect(host.getByRole("alert")).toContainText("השאילתה אינה נתמכת ב־Backtest");
  await expect(host.getByRole("alert")).toContainText("SCANNER_NON_SELECT");

  await page.evaluate(() => globalThis.__setBacktestScenario("error"));
  await host.getByRole("button", { name: "Run Backtest" }).click();
  await expect(host.getByRole("alert")).toContainText("הרצת Backtest נכשלה");
  await expect(host.getByRole("alert")).toContainText("BACKTEST_RUNTIME_ERROR");
});
