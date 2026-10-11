import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  startBacktestLabRuntime
} from "../../backtest-lab/runtime.js";

async function postJson(runtime, pathname, body) {
  const response = await fetch(`http://${runtime.host}:${runtime.port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text)
  };
}

function sweepRequest(overrides = {}) {
  return {
    sourceId: "active",
    fromAtMs: 10_000,
    toAtMs: 14_000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [
      { id: "A", name: "Query A", sql: "SELECT security_id FROM latest ORDER BY security_id" },
      { id: "B", name: "Query B", sql: "SELECT security_id FROM latest ORDER BY security_id DESC" }
    ],
    topX: 10,
    horizonsMs: [10_000, 20_000],
    ...overrides
  };
}

function fakeSweepRun({ marker = "first", openPoint = null } = {}) {
  const metrics = Object.freeze({
    requestedPointCount: 5,
    availablePointCount: 4,
    unavailablePointCount: 1,
    distinctBaselineCount: 2,
    queryExecutionCount: 4
  });
  const overview = Object.freeze({
    availablePointCount: 4,
    queries: Object.freeze([]),
    comparison: null
  });
  return Object.freeze({
    metrics,
    overview,
    page({ offset, limit }) {
      return Object.freeze({
        offset,
        limit,
        totalCount: 5,
        items: Object.freeze([{ index: offset, marker }])
      });
    },
    openPoint(index) {
      return openPoint ?? Object.freeze({
        available: true,
        requestedAtMs: 10_000 + index * 1000,
        baseline: Object.freeze({ cycleId: 2, committedAtMs: 9_500 }),
        queries: Object.freeze([{ id: "A", sql: "SELECT security_id FROM latest ORDER BY security_id" }]),
        comparison: Object.freeze({ unionCount: 1 })
      });
    }
  });
}

test("Backtest Sweep HTTP freezes one exact run and exposes only a bounded first timeline page", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-sweep-http-"));
  let runtime = null;
  let captured = null;
  const exactPoint = Object.freeze({
    available: true,
    requestedAtMs: 12_000,
    baseline: Object.freeze({ cycleId: 2, committedAtMs: 9_500 }),
    queries: Object.freeze([{ id: "A", sql: "SELECT security_id FROM latest ORDER BY security_id" }]),
    comparison: Object.freeze({ unionCount: 1 })
  });

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runSweep: async (request) => {
        captured = request;
        return fakeSweepRun({ openPoint: exactPoint });
      }
    });

    const response = await postJson(runtime, "/api/sweep/run", sweepRequest());
    assert.equal(response.status, 200);
    assert.equal(response.body.sweep.id, "1");
    assert.deepEqual(response.body.sweep.request, {
      sourceId: "active",
      fromAtMs: 10_000,
      toAtMs: 14_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      intervalMs: 1000,
      queries: sweepRequest().queries,
      topX: 10,
      horizonsMs: [10_000, 20_000]
    });
    assert.equal(Object.hasOwn(response.body.sweep.request, "requestedAtMsList"), false);
    assert.deepEqual(response.body.sweep.overview, {
      availablePointCount: 4,
      queries: [],
      comparison: null
    });
    assert.deepEqual(response.body.sweep.page, {
      offset: 0,
      limit: 50,
      totalCount: 5,
      items: [{ index: 0, marker: "first" }]
    });
    assert.deepEqual(captured, {
      dataDir,
      sourceId: "active",
      fromAtMs: 10_000,
      toAtMs: 14_000,
      intervalValue: 1,
      intervalUnit: "seconds",
      queries: sweepRequest().queries,
      topX: 10,
      horizonsMs: [10_000, 20_000]
    });
    assert.equal(Object.isFrozen(captured.queries), true);
    assert.equal(Object.isFrozen(captured.queries[0]), true);
    assert.equal(Object.isFrozen(captured.horizonsMs), true);

    const page = await postJson(runtime, "/api/sweep/page", {
      sweepId: "1",
      offset: 2,
      limit: 2
    });
    assert.equal(page.status, 200);
    assert.deepEqual(page.body, {
      sweepId: "1",
      page: { offset: 2, limit: 2, totalCount: 5, items: [{ index: 2, marker: "first" }] }
    });

    const opened = await postJson(runtime, "/api/sweep/open", { sweepId: "1", index: 2 });
    assert.equal(opened.status, 200);
    assert.deepEqual(opened.body, { sweepId: "1", index: 2, point: exactPoint });
    assert.equal(opened.text.includes(dataDir), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest Sweep HTTP keeps one active in-memory run and rejects stale handles after replacement", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-sweep-stale-"));
  let runtime = null;
  let runNumber = 0;

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runSweep: async () => {
        runNumber += 1;
        return fakeSweepRun({ marker: `run-${runNumber}` });
      }
    });

    const first = await postJson(runtime, "/api/sweep/run", sweepRequest());
    const second = await postJson(runtime, "/api/sweep/run", sweepRequest({ fromAtMs: 20_000, toAtMs: 24_000 }));
    assert.equal(first.body.sweep.id, "1");
    assert.equal(second.body.sweep.id, "2");

    const stalePage = await postJson(runtime, "/api/sweep/page", {
      sweepId: "1",
      offset: 0,
      limit: 5
    });
    assert.equal(stalePage.status, 409);
    assert.deepEqual(stalePage.body, {
      error: {
        code: "BACKTEST_SWEEP_STALE_RUN",
        message: "Backtest Sweep is no longer active. Run it again."
      }
    });

    const currentPage = await postJson(runtime, "/api/sweep/page", {
      sweepId: "2",
      offset: 1,
      limit: 3
    });
    assert.equal(currentPage.status, 200);
    assert.equal(currentPage.body.page.items[0].marker, "run-2");
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("Backtest Sweep HTTP rejects shape drift and invalid paging before execution and sanitizes runtime failures", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-backtest-sweep-invalid-"));
  let runtime = null;
  let runCalls = 0;
  let failure = null;

  try {
    runtime = await startBacktestLabRuntime({
      dataDir,
      port: 0,
      runSweep: async () => {
        runCalls += 1;
        if (failure) throw failure;
        return fakeSweepRun();
      }
    });

    const extraTopLevel = await postJson(runtime, "/api/sweep/run", {
      ...sweepRequest(),
      path: path.join(dataDir, "private.duckdb")
    });
    assert.equal(extraTopLevel.status, 400);
    assert.equal(extraTopLevel.body.error.code, "BACKTEST_REQUEST_INVALID");

    const extraQueryField = await postJson(runtime, "/api/sweep/run", sweepRequest({
      queries: [{ id: "A", name: "Query A", sql: "SELECT 1", intervalMs: 1000 }]
    }));
    assert.equal(extraQueryField.status, 400);
    assert.equal(extraQueryField.body.error.code, "BACKTEST_REQUEST_INVALID");

    const invalidUnit = await postJson(runtime, "/api/sweep/run", sweepRequest({ intervalUnit: "milliseconds" }));
    assert.equal(invalidUnit.status, 400);
    assert.equal(invalidUnit.body.error.code, "BACKTEST_REQUEST_INVALID");
    assert.equal(runCalls, 0);

    const valid = await postJson(runtime, "/api/sweep/run", sweepRequest());
    assert.equal(valid.status, 200);
    assert.equal(runCalls, 1);

    const tooLargePage = await postJson(runtime, "/api/sweep/page", {
      sweepId: valid.body.sweep.id,
      offset: 0,
      limit: 251
    });
    assert.equal(tooLargePage.status, 400);
    assert.equal(tooLargePage.body.error.code, "BACKTEST_REQUEST_INVALID");

    const invalidOpen = await postJson(runtime, "/api/sweep/open", {
      sweepId: valid.body.sweep.id,
      index: -1
    });
    assert.equal(invalidOpen.status, 400);
    assert.equal(invalidOpen.body.error.code, "BACKTEST_REQUEST_INVALID");

    failure = new Error(`private Sweep failure at ${dataDir}/market-flow-us.duckdb with raw rows`);
    const privateFailure = await postJson(runtime, "/api/sweep/run", sweepRequest());
    assert.equal(privateFailure.status, 500);
    assert.deepEqual(privateFailure.body, {
      error: {
        code: "BACKTEST_RUNTIME_ERROR",
        message: "Backtest Lab operation failed safely."
      }
    });
    assert.equal(privateFailure.text.includes(dataDir), false);
    assert.equal(privateFailure.text.includes("raw rows"), false);
  } finally {
    await runtime?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
