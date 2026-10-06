import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HORIZONS = [10000, 20000, 30000, 45000, 60000, 90000, 120000, 180000, 300000, 600000];
let viewerBundle;

function capture(captureId, overrides = {}) {
  return {
    captureId,
    capturedAtMs: 100000 + captureId,
    sourceQueryId: `query-${captureId}`,
    sourceQueryName: `Query ${captureId}`,
    sourceIntervalMs: 3000,
    sourceResultStartedAtMs: 99000,
    sourceResultCompletedAtMs: 99500,
    sourceResultRowCount: 60,
    selectionMode: "all",
    isAutomatic: captureId >= 10,
    topX: null,
    capturedItemCount: 3,
    scannerDurationMs: 500,
    captureLatencyMs: 500,
    timingAnomaly: null,
    ...overrides
  };
}

function horizon(horizonMs, {
  outcome = "UP",
  unavailableReason = null,
  price = 101,
  changePercent = 1,
  observed = true
} = {}) {
  return {
    horizonMs,
    targetAtMs: 100000 + horizonMs,
    observedAtMs: observed ? 100500 + horizonMs : null,
    actualElapsedMs: observed ? 10500 + horizonMs : null,
    price: observed ? price : null,
    changePercent: observed && unavailableReason === null ? changePercent : null,
    outcome: observed ? outcome : "UNAVAILABLE",
    unavailableReason: observed ? unavailableReason : "NO_FUTURE_OBSERVATION",
    timingAnomaly: null
  };
}

function observation({
  captureId,
  resultRank,
  securityId,
  symbol,
  price = 100,
  captureOverrides = {},
  horizons = HORIZONS.map((value) => horizon(value))
}) {
  return {
    capture: capture(captureId, captureOverrides),
    resultRank,
    securityId,
    buyCycleId: 77,
    baseline: {
      cycleId: 77,
      collectedAtMs: 99000,
      price,
      symbol,
      paperName: `${symbol} Incorporated`,
      exchangeName: "NASDAQ",
      ageMs: 1000
    },
    timing: {
      scannerDurationMs: 500,
      captureLatencyMs: 500,
      baselineAgeMs: 1000,
      anomaly: null
    },
    horizons
  };
}

const UP = observation({
  captureId: 10,
  resultRank: 1,
  securityId: "1001",
  symbol: "UP"
});

const DOWN = observation({
  captureId: 10,
  resultRank: 2,
  securityId: "1002",
  symbol: "DOWN",
  horizons: HORIZONS.map((value) => horizon(value, {
    outcome: "DOWN",
    price: 99,
    changePercent: -1
  }))
});

const MIXED = observation({
  captureId: 10,
  resultRank: 3,
  securityId: "1003",
  symbol: "MIXED",
  horizons: HORIZONS.map((value, index) => {
    if (index === 0) return horizon(value, { outcome: "FLAT", price: 100, changePercent: 0 });
    if (index === 1) {
      return horizon(value, {
        outcome: "UNAVAILABLE",
        unavailableReason: "FUTURE_PRICE_UNAVAILABLE",
        price: null
      });
    }
    if (index >= 4) return horizon(value, { observed: false });
    return horizon(value);
  })
});

const OLD_HEAD = observation({
  captureId: 9,
  resultRank: 1,
  securityId: "9000",
  symbol: "OLDHEAD",
  captureOverrides: { capturedItemCount: 2 },
  horizons: HORIZONS.map((value, index) => index < 1
    ? horizon(value)
    : horizon(value, { observed: false }))
});

const OLD = observation({
  captureId: 9,
  resultRank: 2,
  securityId: "9001",
  symbol: "OLD",
  captureOverrides: { capturedItemCount: 2 },
  horizons: HORIZONS.map((value, index) => index < 2
    ? horizon(value)
    : horizon(value, { observed: false }))
});

const OLD_REFRESHED = observation({
  captureId: 9,
  resultRank: 2,
  securityId: "9001",
  symbol: "OLD",
  captureOverrides: { capturedItemCount: 2 },
  horizons: HORIZONS.map((value, index) => index < 7
    ? horizon(value, { outcome: "DOWN", price: 98, changePercent: -2 })
    : horizon(value, { observed: false }))
});

test.beforeAll(async () => {
  const modulePath = path.join(ROOT, "browser/viewer/demo-buy-surface.js");
  const result = await build({
    stdin: {
      contents: `import { createDemoBuySurface } from ${JSON.stringify(modulePath)}; globalThis.__createDemoBuySurface = createDemoBuySurface;`,
      resolveDir: ROOT,
      sourcefile: "demo-buy-outcome-surface-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  viewerBundle = result.outputFiles[0].text;
});

async function mount(page, { empty = false } = {}) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: viewerBundle });
  await page.evaluate(({ empty, up, down, mixed, oldHead, old, oldRefreshed }) => {
    const calls = [];
    let latestCount = 0;
    let provenanceAttempts = 0;

    const pageOne = empty
      ? { items: [], hasMore: false, nextCursor: null }
      : { items: [up, down, mixed, oldHead], hasMore: true, nextCursor: "cursor-old" };
    const pageTwo = { items: [old], hasMore: false, nextCursor: null };
    const refreshedLatest = {
      items: [{
        ...up,
        capture: { ...up.capture, captureId: 11, sourceQueryName: "Newest query" },
        securityId: "1101",
        baseline: { ...up.baseline, symbol: "NEW", paperName: "NEW Incorporated" }
      }],
      hasMore: false,
      nextCursor: null
    };

    const client = {
      async getDemoBuyPage(cursor) {
        calls.push(["page", cursor]);
        if (cursor === "cursor-old") return pageTwo;
        latestCount += 1;
        return latestCount === 1 ? pageOne : refreshedLatest;
      },
      async getDemoBuyObservation(captureId, securityId) {
        calls.push(["observation", captureId, securityId]);
        if (captureId === 9 && securityId === "9001") return oldRefreshed;
        throw new Error("unexpected observation");
      },
      async getDemoBuyCapture(captureId) {
        calls.push(["capture", captureId]);
        provenanceAttempts += 1;
        if (provenanceAttempts === 1) throw new Error("synthetic provenance failure");
        return {
          ...up.capture,
          captureId,
          sourceQuerySql: "SELECT security_id FROM latest ORDER BY security_id",
          capturedItemCount: 3
        };
      }
    };

    globalThis.__demoBuyCalls = calls;
    globalThis.__surface = globalThis.__createDemoBuySurface({
      root: document.querySelector("#root"),
      client
    });
    globalThis.__surface.start();
  }, {
    empty,
    up: UP,
    down: DOWN,
    mixed: MIXED,
    oldHead: OLD_HEAD,
    old: OLD,
    oldRefreshed: OLD_REFRESHED
  });
}

test("Demo Buy outcome surface renders grouped progressive evidence and isolates provenance failure", async ({ page }) => {
  await mount(page);

  await expect(page.getByRole("heading", { name: "Demo Buy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capture #10" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Demo Buy capture 10" })).toBeVisible();

  const headers = page.getByRole("table", { name: "Demo Buy capture 10" }).getByRole("columnheader");
  await expect(headers).toHaveCount(16);
  await expect(headers.nth(0)).toHaveText("Scanner position");
  await expect(headers.nth(4)).toHaveText("Progress");
  await expect(headers.nth(5)).toHaveText("10s");
  await expect(headers.nth(14)).toHaveText("10m");

  await expect(page.getByText("UP ▲ +1.00%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("DOWN ▼ -1.00%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("FLAT → 0.00%", { exact: true })).toBeVisible();
  await expect(page.getByText("UNAVAILABLE ⚠", { exact: true })).toBeVisible();
  await expect(page.getByText("future Price unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Pending / ממתין", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("4 / 10", { exact: true })).toBeVisible();

  const firstSticky = page.getByRole("table", { name: "Demo Buy capture 10" }).locator("tbody td").first();
  await expect(firstSticky).toHaveCSS("position", "sticky");

  await page.getByRole("button", { name: "View provenance / SQL" }).first().click();
  await expect(page.getByRole("alert")).toContainText("synthetic provenance failure");
  await expect(page.getByRole("table", { name: "Demo Buy capture 10" })).toBeVisible();

  await page.getByRole("button", { name: "Hide provenance / SQL" }).first().click();
  await page.getByRole("button", { name: "View provenance / SQL" }).first().click();
  await expect(page.getByText("Exact Scanner SQL")).toBeVisible();
  await expect(page.getByText("SELECT security_id FROM latest ORDER BY security_id", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("heading", { name: "Capture #9 · continued" })).toBeVisible();
  const oldRow = page.locator('tr[data-security-id="9001"]');
  await expect(oldRow).toContainText("2 / 10");

  await oldRow.getByText("Observation details").click();
  await oldRow.getByRole("button", { name: "Refresh observation" }).click();
  await expect(oldRow).toContainText("7 / 10");
  await expect(oldRow.getByText("DOWN ▼ -2.00%", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Refresh latest" }).click();
  await expect(page.getByRole("heading", { name: "Capture #11" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Capture #10" })).toHaveCount(0);
  await expect(page.locator('tr[data-security-id="9001"]')).toHaveCount(0);

  await expect.poll(() => page.evaluate(() => globalThis.__demoBuyCalls)).toEqual([
    ["page", null],
    ["capture", 10],
    ["capture", 10],
    ["page", "cursor-old"],
    ["observation", 9, "9001"],
    ["page", null]
  ]);
});

test("Demo Buy empty state gives actionable guidance without inventing outcomes", async ({ page }) => {
  await mount(page, { empty: true });
  const guidance = page.getByText(/אין עדיין תצפיות Demo Buy/);
  await expect(guidance).toBeVisible();
  await expect(guidance).toContainText("Scanner");
  await expect(page.getByRole("table")).toHaveCount(0);
});
