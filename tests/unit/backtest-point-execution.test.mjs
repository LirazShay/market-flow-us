import assert from "node:assert/strict";
import test from "node:test";
import { executeBacktestPoint } from "../../backtest-lab/point-execution.js";

const query = (id, sql = `SELECT '${id}' AS security_id`) => ({ id, name: `Query ${id}`, sql });
const scannerResult = (ids) => ({
  columns: [{ name: "security_id", type: "VARCHAR" }],
  rows: ids.map((id) => [id]),
  rowCount: ids.length,
  startedAtMs: 1,
  completedAtMs: 2,
  durationMs: 1
});

function evaluationFor({ baselineCycleId, requestedAtMs, selectedItems, horizonsMs }) {
  return Object.freeze({
    baselineCycleId,
    requestedAtMs,
    horizonsMs,
    items: Object.freeze(selectedItems.map((item, itemIndex) => Object.freeze({
      ...item,
      baseline: Object.freeze({ cycleId: baselineCycleId, price: 100, symbol: item.securityId }),
      horizons: Object.freeze(horizonsMs.map((horizonMs, horizonIndex) => Object.freeze({
        horizonMs,
        price: 101 + itemIndex + horizonIndex,
        changePercent: 1 + itemIndex + horizonIndex,
        outcome: "UP",
        unavailableReason: null
      })))
    })))
  });
}

function availableHistorical({ execute, close }) {
  return Object.freeze({
    available: true,
    requestedAtMs: 2500,
    baseline: Object.freeze({ cycleId: 2, committedAtMs: 2000 }),
    scanner: Object.freeze({ execute }),
    close
  });
}

test("shared-point execution freezes the run and composes Scanner selection with one authority point", async () => {
  const executedSql = [];
  const evaluationCalls = [];
  let closeCount = 0;
  const sourceRows = new Map([
    ["sql-a", ["A", "A", "B", "C"]],
    ["sql-b", ["B", "A", "D"]]
  ]);
  const input = {
    dataDir: "/product/data",
    sourceId: "active",
    requestedAtMs: 2500,
    queries: [query("A", "sql-a"), query("B", "sql-b")],
    topX: 3,
    horizonsMs: [10000, 20000]
  };

  const run = executeBacktestPoint({
    ...input,
    openHistoricalScanner: async (request) => {
      assert.deepEqual(request, {
        dataDir: "/product/data",
        sourceId: "active",
        requestedAtMs: 2500,
        now: undefined
      });
      return availableHistorical({
        execute: async (sql) => {
          executedSql.push(sql);
          return scannerResult(sourceRows.get(sql));
        },
        close: async () => { closeCount += 1; }
      });
    },
    evaluateOutcomes: async (request) => {
      evaluationCalls.push(request);
      return evaluationFor(request);
    }
  });

  input.sourceId = "archive:changed.duckdb";
  input.requestedAtMs = 9999;
  input.topX = 1;
  input.horizonsMs.push(30000);
  input.queries[0].sql = "changed after Run";

  const result = await run;
  assert.equal(closeCount, 1);
  assert.deepEqual(executedSql, ["sql-a", "sql-b"]);
  assert.deepEqual(evaluationCalls.map((call) => ({
    sourceId: call.sourceId,
    baselineCycleId: call.baselineCycleId,
    requestedAtMs: call.requestedAtMs,
    selectedItems: call.selectedItems,
    horizonsMs: call.horizonsMs
  })), [
    { sourceId: "active", baselineCycleId: 2, requestedAtMs: 2500,
      selectedItems: [{ securityId: "A", returnedPosition: 1 }, { securityId: "B", returnedPosition: 3 }],
      horizonsMs: [10000, 20000] },
    { sourceId: "active", baselineCycleId: 2, requestedAtMs: 2500,
      selectedItems: [{ securityId: "B", returnedPosition: 1 }, { securityId: "A", returnedPosition: 2 },
        { securityId: "D", returnedPosition: 3 }], horizonsMs: [10000, 20000] }
  ]);
  assert.equal(result.available, true);
  assert.equal(result.sourceId, "active");
  assert.equal(result.requestedAtMs, 2500);
  assert.equal(result.topX, 3);
  assert.deepEqual(result.horizonsMs, [10000, 20000]);
  assert.equal(result.queries[0].sql, "sql-a");
  assert.deepEqual(result.queries[0].items.map((item) => item.returnedPosition), [1, 3]);
  assert.deepEqual(result.comparison.pairs[0].onlyCounts, [0, 1]);
});

test("point before the first committed cycle is explicit unavailable evidence and executes no Query", async () => {
  let scannerCalls = 0;
  let evaluationCalls = 0;
  let closeCount = 0;
  const result = await executeBacktestPoint({
    dataDir: "/product/data",
    sourceId: "active",
    requestedAtMs: 100,
    queries: [query("A", "sql-a"), query("B", "sql-b")],
    horizonsMs: [10000],
    openHistoricalScanner: async () => Object.freeze({
      available: false,
      requestedAtMs: 100,
      baseline: null,
      scanner: Object.freeze({ execute: async () => { scannerCalls += 1; } }),
      close: async () => { closeCount += 1; }
    }),
    evaluateOutcomes: async () => { evaluationCalls += 1; }
  });

  assert.equal(closeCount, 1);
  assert.equal(scannerCalls, 0);
  assert.equal(evaluationCalls, 0);
  assert.deepEqual(result, {
    available: false,
    unavailableReason: "NO_BASELINE",
    sourceId: "active",
    requestedAtMs: 100,
    baseline: null,
    topX: 10,
    horizonsMs: [10000],
    queries: [query("A", "sql-a"), query("B", "sql-b")]
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.queries), true);
});

test("empty Scanner selection remains a valid evaluated point rather than an unavailable point", async () => {
  let evaluationRequest = null;
  const result = await executeBacktestPoint({
    dataDir: "/product/data",
    sourceId: "active",
    requestedAtMs: 2500,
    queries: [query("A", "sql-a")],
    horizonsMs: [10000],
    openHistoricalScanner: async () => availableHistorical({
      execute: async () => scannerResult([]),
      close: async () => {}
    }),
    evaluateOutcomes: async (request) => {
      evaluationRequest = request;
      return evaluationFor(request);
    }
  });

  assert.deepEqual(evaluationRequest.selectedItems, []);
  assert.equal(result.available, true);
  assert.equal(result.queries[0].sourceRowCount, 0);
  assert.equal(result.queries[0].evaluatedUniqueCount, 0);
  assert.equal(result.queries[0].summary[0].averagePercent, null);
});

test("Scanner failure closes the historical sandbox and prevents outcome evaluation", async () => {
  const failure = new Error("scanner failed");
  let closeCount = 0;
  let evaluationCalls = 0;
  await assert.rejects(executeBacktestPoint({
    dataDir: "/product/data",
    sourceId: "active",
    requestedAtMs: 2500,
    queries: [query("A", "sql-a")],
    horizonsMs: [10000],
    openHistoricalScanner: async () => availableHistorical({
      execute: async () => { throw failure; },
      close: async () => { closeCount += 1; }
    }),
    evaluateOutcomes: async () => { evaluationCalls += 1; }
  }), (error) => error === failure);
  assert.equal(closeCount, 1);
  assert.equal(evaluationCalls, 0);
});

test("outcome failure closes the sandbox and stops later Queries", async () => {
  const failure = new Error("outcome failed");
  const executedSql = [];
  let closeCount = 0;
  await assert.rejects(executeBacktestPoint({
    dataDir: "/product/data",
    sourceId: "active",
    requestedAtMs: 2500,
    queries: [query("A", "sql-a"), query("B", "sql-b")],
    horizonsMs: [10000],
    openHistoricalScanner: async () => availableHistorical({
      execute: async (sql) => {
        executedSql.push(sql);
        return scannerResult(["A"]);
      },
      close: async () => { closeCount += 1; }
    }),
    evaluateOutcomes: async () => { throw failure; }
  }), (error) => error === failure);
  assert.deepEqual(executedSql, ["sql-a"]);
  assert.equal(closeCount, 1);
});
