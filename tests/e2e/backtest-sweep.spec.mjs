import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let appBundle;

test.beforeAll(async () => {
  const indexPath = path.join(ROOT, "browser/backtest-lab/index.js");
  const result = await build({
    stdin: {
      contents: `import ${JSON.stringify(indexPath)};`,
      resolveDir: ROOT,
      sourcefile: "backtest-sweep-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  appBundle = result.outputFiles[0].text;
});

async function mount(page) {
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(() => {
    const calls = [];
    let activeSweep = null;
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
    const summary = (horizonMs, averagePercent) => ({
      horizonMs,
      availableCount: 1,
      unavailableCount: 0,
      averagePercent,
      medianPercent: averagePercent,
      positiveCount: averagePercent > 0 ? 1 : 0,
      positiveRate: averagePercent > 0 ? 1 : 0,
      bestPercent: averagePercent,
      worstPercent: averagePercent
    });
    const intervalMs = (request) => request.intervalValue * (request.intervalUnit === "minutes" ? 60_000 : 1000);
    const compactPoint = (index, request) => ({
      index,
      requestedAtMs: request.fromAtMs + index * intervalMs(request),
      available: true,
      unavailableReason: null,
      baseline: { cycleId: 7, committedAtMs: request.fromAtMs - 1000 },
      queries: request.queries.map((query, queryIndex) => ({
        id: query.id,
        sourceRowCount: 2,
        selectedSourceRowCount: 1,
        evaluatedUniqueCount: 1,
        duplicateRowCount: 0,
        summary: request.horizonsMs.map((horizonMs) => summary(horizonMs, index + queryIndex + 1))
      })),
      comparison: {
        unionCount: 1,
        commonCount: 1,
        exclusiveCounts: request.queries.map(() => 0),
        pairs: request.queries.length > 1 ? [{
          queryIds: [request.queries[0].id, request.queries[1].id],
          overlapCount: 1,
          unionCount: 1,
          overlapRate: 1,
          onlyCounts: [0, 0],
          positionChangeCount: 0
        }] : []
      }
    });
    const aggregateSummary = (points, queryIndex, horizonIndex, horizonMs) => {
      const values = points.map((point) => point.queries[queryIndex].summary[horizonIndex].averagePercent)
        .sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      const medianPercent = values.length % 2
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2;
      return {
        horizonMs,
        availableCount: values.length,
        unavailableCount: 0,
        averagePercent: values.reduce((sum, value) => sum + value, 0) / values.length,
        medianPercent,
        positiveCount: values.filter((value) => value > 0).length,
        positiveRate: values.filter((value) => value > 0).length / values.length,
        bestPercent: values.at(-1),
        worstPercent: values[0]
      };
    };
    const sweepOverview = (request, points) => ({
      availablePointCount: points.length,
      queries: request.queries.map((query, queryIndex) => ({
        id: query.id,
        name: query.name,
        pointCount: points.length,
        sourceRowCount: points.length * 2,
        selectedSourceRowCount: points.length,
        evaluatedUniqueCount: points.length,
        duplicateRowCount: 0,
        summary: request.horizonsMs.map((horizonMs, horizonIndex) =>
          aggregateSummary(points, queryIndex, horizonIndex, horizonMs))
      })),
      comparison: request.queries.length > 1 ? {
        pointCount: points.length,
        unionObservationCount: points.length,
        commonObservationCount: points.length,
        exclusiveObservationCounts: request.queries.map(() => 0),
        pairs: [{
          queryIds: [request.queries[0].id, request.queries[1].id],
          overlapObservationCount: points.length,
          unionObservationCount: points.length,
          onlyObservationCounts: [0, 0],
          positionChangeObservationCount: 0
        }]
      } : null
    });
    const fullPoint = (index) => {
      const compact = activeSweep.points[index];
      const request = activeSweep.request;
      const queries = request.queries.map((query, queryIndex) => ({
        ...query,
        sourceRowCount: 2,
        selectedSourceRowCount: 1,
        evaluatedUniqueCount: 1,
        duplicateRowCount: 0,
        items: [{
          returnedPosition: 1,
          securityId: "sec-aaa",
          baseline: {
            cycleId: 7,
            collectedAtMs: compact.requestedAtMs - 1200,
            price: 100,
            symbol: "AAA",
            paperName: "AAA Corp",
            exchangeName: "NASDAQ",
            ageMs: 1200,
            timingAnomaly: null
          },
          horizons: request.horizonsMs.map((horizonMs, horizonIndex) => ({
            horizonMs,
            targetAtMs: compact.requestedAtMs + horizonMs,
            futureCycleId: 8 + horizonIndex,
            observedAtMs: compact.requestedAtMs + horizonMs + 100,
            actualElapsedMs: horizonMs + 100,
            price: 101 + index + queryIndex + horizonIndex,
            changePercent: index + queryIndex + horizonIndex + 1,
            outcome: "UP",
            unavailableReason: null,
            timingAnomaly: null
          }))
        }],
        summary: request.horizonsMs.map((horizonMs, horizonIndex) => summary(horizonMs, index + queryIndex + horizonIndex + 1))
      }));
      return {
        available: true,
        sourceId: request.sourceId,
        requestedAtMs: compact.requestedAtMs,
        baseline: compact.baseline,
        topX: request.topX,
        horizonsMs: request.horizonsMs,
        queries,
        comparison: {
          unionCount: 1,
          commonCount: 1,
          exclusiveCounts: queries.map(() => 0),
          securities: [{
            securityId: "sec-aaa",
            positions: queries.map(() => 1),
            presentCount: queries.length,
            common: true,
            exclusive: false,
            positionChanged: false
          }],
          pairs: queries.length > 1 ? [{
            queryIds: [queries[0].id, queries[1].id],
            overlapCount: 1,
            unionCount: 1,
            overlapRate: 1,
            onlyCounts: [0, 0],
            positionChanges: []
          }] : []
        }
      };
    };

    globalThis.__backtestSweepCalls = calls;
    globalThis.fetch = async (url, options = {}) => {
      const pathname = String(url);
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ pathname, body });
      if (pathname === "/api/sources") {
        return json({ sources: [{ sourceId: "active", kind: "active", fileName: "market-flow-us.duckdb" }], count: 1 });
      }
      if (pathname === "/api/queries") {
        const queries = [
          { id: "q-a", name: "Momentum A", sql: "SELECT security_id AS securityId FROM latest ORDER BY ChangePercent DESC" },
          { id: "q-b", name: "Price B", sql: "SELECT security_id AS securityId FROM latest ORDER BY Price DESC" }
        ];
        return json({ queries, count: queries.length });
      }
      if (pathname === "/api/point/run") {
        return json({ error: { code: "POINT_RERUN_FORBIDDEN", message: "Sweep Open must not rerun the point." } }, 500);
      }
      if (pathname === "/api/sweep/run") {
        const totalCount = Math.floor((body.toAtMs - body.fromAtMs) / intervalMs(body)) + 1;
        const points = Array.from({ length: totalCount }, (_, index) => compactPoint(index, body));
        activeSweep = {
          id: String(calls.filter((call) => call.pathname === "/api/sweep/run").length),
          request: { ...body, intervalMs: intervalMs(body) },
          metrics: {
            requestedPointCount: totalCount,
            availablePointCount: totalCount,
            unavailablePointCount: 0,
            distinctBaselineCount: 1,
            queryExecutionCount: body.queries.length
          },
          overview: sweepOverview(body, points),
          points
        };
        return json({ sweep: {
          id: activeSweep.id,
          request: activeSweep.request,
          metrics: activeSweep.metrics,
          overview: activeSweep.overview,
          page: { offset: 0, limit: 50, totalCount, items: points.slice(0, 50) }
        } });
      }
      if (pathname === "/api/sweep/page") {
        return json({ sweepId: body.sweepId, page: {
          offset: body.offset,
          limit: body.limit,
          totalCount: activeSweep.points.length,
          items: activeSweep.points.slice(body.offset, body.offset + body.limit)
        } });
      }
      if (pathname === "/api/sweep/open") {
        return json({ sweepId: body.sweepId, index: body.index, point: fullPoint(body.index) });
      }
      return json({ error: { code: "UNEXPECTED_ROUTE", message: pathname } }, 404);
    };
  });
  await page.addScriptTag({ content: appBundle });
  const host = page.locator("#market-flow-us-backtest-lab");
  await expect(host.getByRole("button", { name: "Run Backtest" })).toBeEnabled();
  await expect(host.getByRole("radio", { name: "Sweep", exact: true })).toBeVisible();
  return host;
}

function endpointCalls(page, pathname) {
  return page.evaluate((value) => globalThis.__backtestSweepCalls.filter((call) => call.pathname === value), pathname);
}

test("Sweep pages 61 compact points, renders whole-run overview and Open uses the exact existing Compare renderer", async ({ page }) => {
  const host = await mount(page);
  await host.getByRole("radio", { name: "Sweep", exact: true }).check();
  await expect(host.getByRole("button", { name: "Run Backtest" })).toBeHidden();
  await host.getByLabel("Query A template").selectOption("q-a");
  await host.getByLabel("Query B template").selectOption("q-b");
  await host.getByLabel("Sweep from").fill("2026-10-11T14:00");
  await host.getByLabel("Sweep to").fill("2026-10-11T14:10");
  await host.getByLabel("Sweep interval", { exact: true }).fill("10");
  await host.getByLabel("Sweep interval unit").selectOption("seconds");
  await host.getByRole("button", { name: "Run Sweep" }).click();

  await expect(host.getByRole("heading", { name: "Sweep timeline" })).toBeVisible();
  await expect(host.getByText("Requested: 61", { exact: true })).toBeVisible();
  await expect(host.getByText("Distinct baselines: 1", { exact: true })).toBeVisible();
  await expect(host.getByText("Query executions: 2", { exact: true })).toBeVisible();
  const overview = host.getByRole("table", { name: "Sweep query overview" });
  await expect(overview.locator("tbody tr")).toHaveCount(2);
  await expect(overview).toContainText("Momentum A");
  await expect(overview).toContainText("avg +31.00%");
  await expect(overview).toContainText("Price B");
  await expect(overview).toContainText("avg +32.00%");
  await expect(host.getByText("Across point observations: union 61 · common 61 · position changes 0", { exact: true })).toBeVisible();
  await expect(host.getByRole("table", { name: "Sweep timeline points" }).locator("tbody tr")).toHaveCount(50);
  await expect(host.getByText("1-50 / 61", { exact: true })).toBeVisible();

  const runCalls = await endpointCalls(page, "/api/sweep/run");
  expect(runCalls).toHaveLength(1);
  expect(runCalls[0].body.intervalValue).toBe(10);
  expect(runCalls[0].body.intervalUnit).toBe("seconds");
  expect(runCalls[0].body.queries).toHaveLength(2);
  expect(runCalls[0].body.queries.map((query) => query.name)).toEqual(["Momentum A", "Price B"]);
  expect(runCalls[0].body.toAtMs - runCalls[0].body.fromAtMs).toBe(600_000);

  await host.getByRole("button", { name: "Next" }).click();
  const secondPage = host.getByRole("table", { name: "Sweep timeline points" });
  await expect(secondPage.locator("tbody tr")).toHaveCount(11);
  await expect(host.getByText("51-61 / 61", { exact: true })).toBeVisible();
  const pageCalls = await endpointCalls(page, "/api/sweep/page");
  expect(pageCalls).toHaveLength(1);
  expect(pageCalls[0].body).toEqual({ sweepId: "1", offset: 50, limit: 50 });

  await host.getByRole("button", { name: "Open Sweep point 61" }).click();
  await expect(host.getByRole("region", { name: "Sweep timeline" })).toBeHidden();
  await expect(host.getByRole("heading", { name: "Compare result" })).toBeVisible();
  await expect(host.getByText("Resolved cycle: 7", { exact: true })).toBeVisible();
  await expect(host.getByRole("table", { name: "Evidence Momentum A" })).toContainText("AAA");
  await expect(host.getByRole("table", { name: "Evidence Price B" })).toContainText("AAA");
  await host.getByText("SQL / provenance", { exact: true }).first().click();
  await expect(host.locator("pre").first()).toContainText("ORDER BY ChangePercent DESC");

  const openCalls = await endpointCalls(page, "/api/sweep/open");
  expect(openCalls).toHaveLength(1);
  expect(openCalls[0].body).toEqual({ sweepId: "1", index: 60 });
  expect(await endpointCalls(page, "/api/point/run")).toHaveLength(0);
});

test("Sweep can freeze Query A only with minute cadence, summarize it and Open into Inspect without rerun", async ({ page }) => {
  const host = await mount(page);
  await host.getByRole("radio", { name: "Sweep", exact: true }).check();
  await host.getByLabel("Query A template").selectOption("q-a");
  await host.getByLabel("Sweep query set").selectOption("single");
  await expect(host.getByLabel("Query B SQL")).toBeHidden();
  await host.getByLabel("Sweep from").fill("2026-10-11T14:00");
  await host.getByLabel("Sweep to").fill("2026-10-11T14:02");
  await host.getByLabel("Sweep interval", { exact: true }).fill("1");
  await host.getByLabel("Sweep interval unit").selectOption("minutes");
  await host.getByRole("button", { name: "Run Sweep" }).click();

  const runCalls = await endpointCalls(page, "/api/sweep/run");
  expect(runCalls).toHaveLength(1);
  expect(runCalls[0].body.queries).toHaveLength(1);
  expect(runCalls[0].body.queries[0].name).toBe("Momentum A");
  expect(runCalls[0].body.intervalValue).toBe(1);
  expect(runCalls[0].body.intervalUnit).toBe("minutes");
  await expect(host.getByText("Requested: 3", { exact: true })).toBeVisible();
  await expect(host.getByText("Query executions: 1", { exact: true })).toBeVisible();
  const overview = host.getByRole("table", { name: "Sweep query overview" });
  await expect(overview.locator("tbody tr")).toHaveCount(1);
  await expect(overview).toContainText("avg +2.00%");

  await host.getByRole("button", { name: "Open Sweep point 1" }).click();
  await expect(host.getByRole("region", { name: "Sweep timeline" })).toBeHidden();
  await expect(host.getByRole("heading", { name: "Inspect result" })).toBeVisible();
  await expect(host.getByRole("table", { name: "Evidence Momentum A" })).toContainText("AAA");
  const openCalls = await endpointCalls(page, "/api/sweep/open");
  expect(openCalls).toHaveLength(1);
  expect(openCalls[0].body).toEqual({ sweepId: "1", index: 0 });
  expect(await endpointCalls(page, "/api/point/run")).toHaveLength(0);
});
