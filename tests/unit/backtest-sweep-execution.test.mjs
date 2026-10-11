import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKTEST_SWEEP_MAX_POINTS,
  executeBacktestSweep,
  freezeBacktestSweepRequest
} from "../../backtest-lab/sweep-execution.js";

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
    items: Object.freeze(selectedItems.map((item) => Object.freeze({
      ...item,
      baseline: Object.freeze({
        cycleId: baselineCycleId,
        collectedAtMs: requestedAtMs - 500,
        price: 100,
        symbol: item.securityId
      }),
      horizons: Object.freeze(horizonsMs.map((horizonMs) => Object.freeze({
        horizonMs,
        targetAtMs: requestedAtMs + horizonMs,
        futureCycleId: baselineCycleId + 10,
        observedAtMs: requestedAtMs + horizonMs,
        actualElapsedMs: horizonMs,
        price: 100 + requestedAtMs / 1000,
        changePercent: requestedAtMs / 1000,
        outcome: "UP",
        unavailableReason: null,
        timingAnomaly: null
      })))
    })))
  });
}

test("Sweep request generates deterministic inclusive seconds/minutes timestamps without synthesizing an endpoint", () => {
  const seconds = freezeBacktestSweepRequest({
    sourceId: "active",
    fromAtMs: 1000,
    toAtMs: 4000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [query("A")],
    horizonsMs: [10000]
  });
  assert.deepEqual(seconds.requestedAtMsList, [1000, 2000, 3000, 4000]);
  assert.equal(seconds.intervalMs, 1000);

  const minutes = freezeBacktestSweepRequest({
    sourceId: "active",
    fromAtMs: 0,
    toAtMs: 150000,
    intervalValue: 1,
    intervalUnit: "minutes",
    queries: [query("A")],
    horizonsMs: [10000]
  });
  assert.deepEqual(minutes.requestedAtMsList, [0, 60000, 120000]);
  assert.equal(minutes.intervalMs, 60000);

  assert.throws(() => freezeBacktestSweepRequest({
    sourceId: "active",
    fromAtMs: 0,
    toAtMs: BACKTEST_SWEEP_MAX_POINTS * 1000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [query("A")],
    horizonsMs: [10000]
  }), (error) => error.code === "BACKTEST_SWEEP_TOO_LARGE");
});

test("Sweep reuses selection once per distinct baseline while preserving every T0 and exact Open evidence", async () => {
  const executed = [];
  const opened = [];
  const closed = [];
  const evaluations = [];
  const baselineByRequestedAt = new Map([
    [2000, { cycleId: 2, committedAtMs: 1500 }],
    [4000, { cycleId: 4, committedAtMs: 3500 }]
  ]);
  const rowsByBaselineAndSql = new Map([
    ["2:sql-a", ["A", "A", "B"]],
    ["2:sql-b", ["B", "C"]],
    ["4:sql-a", ["D", "E"]],
    ["4:sql-b", ["E", "F"]]
  ]);
  const input = {
    dataDir: "/product/data",
    sourceId: "active",
    fromAtMs: 1000,
    toAtMs: 4000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [query("A", "sql-a"), query("B", "sql-b")],
    topX: 3,
    horizonsMs: [10000]
  };

  const runPromise = executeBacktestSweep({
    ...input,
    resolveBaselines: async (request) => {
      assert.equal(request.sourceId, "active");
      assert.deepEqual(request.requestedAtMsList, [1000, 2000, 3000, 4000]);
      return [
        { requestedAtMs: 1000, baseline: null },
        { requestedAtMs: 2000, baseline: { cycleId: 2, committedAtMs: 1500 } },
        { requestedAtMs: 3000, baseline: { cycleId: 2, committedAtMs: 1500 } },
        { requestedAtMs: 4000, baseline: { cycleId: 4, committedAtMs: 3500 } }
      ];
    },
    openHistoricalScanner: async ({ requestedAtMs }) => {
      opened.push(requestedAtMs);
      const baseline = baselineByRequestedAt.get(requestedAtMs);
      return Object.freeze({
        available: true,
        requestedAtMs,
        baseline: Object.freeze(baseline),
        scanner: Object.freeze({
          execute: async (sql) => {
            executed.push(`${baseline.cycleId}:${sql}`);
            return scannerResult(rowsByBaselineAndSql.get(`${baseline.cycleId}:${sql}`));
          }
        }),
        close: async () => { closed.push(requestedAtMs); }
      });
    },
    evaluateOutcomes: async (request) => {
      evaluations.push(request);
      return evaluationFor(request);
    }
  });

  input.sourceId = "archive:changed.duckdb";
  input.queries[0].sql = "changed after Run";
  input.horizonsMs.push(20000);

  const run = await runPromise;
  assert.deepEqual(opened, [2000, 4000]);
  assert.deepEqual(closed, [2000, 4000]);
  assert.deepEqual(executed, ["2:sql-a", "2:sql-b", "4:sql-a", "4:sql-b"]);
  assert.deepEqual(run.metrics, {
    requestedPointCount: 4,
    availablePointCount: 3,
    unavailablePointCount: 1,
    distinctBaselineCount: 2,
    queryExecutionCount: 4
  });
  assert.equal(evaluations.length, 6);
  assert.deepEqual(evaluations.map((call) => [call.baselineCycleId, call.requestedAtMs]), [
    [2, 2000], [2, 2000], [2, 3000], [2, 3000], [4, 4000], [4, 4000]
  ]);

  const unavailable = run.openPoint(0);
  const firstSharedBaselinePoint = run.openPoint(1);
  const secondSharedBaselinePoint = run.openPoint(2);
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.unavailableReason, "NO_BASELINE");
  assert.equal(firstSharedBaselinePoint.baseline.cycleId, 2);
  assert.equal(secondSharedBaselinePoint.baseline.cycleId, 2);
  assert.equal(firstSharedBaselinePoint.requestedAtMs, 2000);
  assert.equal(secondSharedBaselinePoint.requestedAtMs, 3000);
  assert.notEqual(firstSharedBaselinePoint.queries[0].summary[0].averagePercent,
    secondSharedBaselinePoint.queries[0].summary[0].averagePercent);
  assert.equal(firstSharedBaselinePoint.queries[0].sql, "sql-a");
  assert.deepEqual(firstSharedBaselinePoint.horizonsMs, [10000]);

  const page = run.page({ offset: 1, limit: 2 });
  assert.equal(page.totalCount, 4);
  assert.deepEqual(page.items.map((item) => item.index), [1, 2]);
  assert.deepEqual(page.items.map((item) => item.requestedAtMs), [2000, 3000]);
  assert.strictEqual(run.openPoint(2), secondSharedBaselinePoint);
  assert.deepEqual(page.items[1].queries[0].summary, secondSharedBaselinePoint.queries[0].summary);
  assert.deepEqual(page.items[1].comparison.pairs[0].queryIds, ["A", "B"]);
  assert.equal(page.items[1].comparison.pairs[0].overlapCount,
    secondSharedBaselinePoint.comparison.pairs[0].overlapCount);
});

test("Sweep rejects baseline authority that does not preserve requested ordering", async () => {
  await assert.rejects(executeBacktestSweep({
    dataDir: "/product/data",
    sourceId: "active",
    fromAtMs: 1000,
    toAtMs: 2000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [query("A")],
    horizonsMs: [10000],
    resolveBaselines: async () => [
      { requestedAtMs: 1000, baseline: { cycleId: 2, committedAtMs: 900 } },
      { requestedAtMs: 2000, baseline: null }
    ],
    openHistoricalScanner: async () => { throw new Error("must not open"); },
    evaluateOutcomes: async () => { throw new Error("must not evaluate"); }
  }), /regressed to unavailable/);
});

test("Sweep closes an opened historical sandbox when its baseline authority mismatches the resolved series", async () => {
  let closeCount = 0;
  await assert.rejects(executeBacktestSweep({
    dataDir: "/product/data",
    sourceId: "active",
    fromAtMs: 2000,
    toAtMs: 2000,
    intervalValue: 1,
    intervalUnit: "seconds",
    queries: [query("A")],
    horizonsMs: [10000],
    resolveBaselines: async () => [
      { requestedAtMs: 2000, baseline: { cycleId: 2, committedAtMs: 1500 } }
    ],
    openHistoricalScanner: async () => Object.freeze({
      available: true,
      requestedAtMs: 2000,
      baseline: Object.freeze({ cycleId: 3, committedAtMs: 1500 }),
      scanner: Object.freeze({ execute: async () => scannerResult(["A"]) }),
      close: async () => { closeCount += 1; }
    }),
    evaluateOutcomes: async () => { throw new Error("must not evaluate"); }
  }), /does not match the resolved Sweep baseline/);
  assert.equal(closeCount, 1);
});
