import assert from "node:assert/strict";
import test from "node:test";
import {
  freezeBacktestPointRequest, selectBacktestRows, buildBacktestPointResult, filterBacktestPointRows
} from "../../backtest-lab/point-result.js";

const baseline = { cycleId: 2, committedAtMs: 2000 };
const query = id => ({ id, name: `Query ${id}`, sql: "unchanged SQL text" });
const result = rows => ({ columns: [{ name: "security_id" }], rows: rows.map(id => [id]), rowCount: rows.length });
function evidence(selection, values) {
  return { baselineCycleId: 2, requestedAtMs: 2500, horizonsMs: [10000],
    items: selection.items.map((item, i) => ({ ...item, baseline: { cycleId: 2, price: 100, symbol: item.securityId },
      horizons: [{ horizonMs: 10000, price: values[i] === null ? null : 100 + values[i],
        changePercent: values[i], outcome: values[i] === null ? "UNAVAILABLE" : values[i] > 0 ? "UP" : values[i] < 0 ? "DOWN" : "FLAT",
        unavailableReason: values[i] === null ? "NO_FUTURE_OBSERVATION" : null }] })) };
}
function point(rows, values, topX = null) {
  const request = freezeBacktestPointRequest({ sourceId: "active", requestedAtMs: 2500,
    queries: rows.map((_, i) => query(String.fromCharCode(65 + i))), topX, horizonsMs: [10000] });
  const queryResults = rows.map((ids, i) => {
    const selection = selectBacktestRows(result(ids), topX);
    return { selection, evaluation: evidence(selection, values[i]) };
  });
  return buildBacktestPointResult({ request, baseline, queryResults });
}

test("Top X applies to source rows before dedupe without promoting lower rows or renumbering", () => {
  const selection = selectBacktestRows(result(["A", "A", "B", "C"]), 3);
  assert.deepEqual(selection, { sourceRowCount: 4, selectedSourceRowCount: 3, evaluatedUniqueCount: 2,
    duplicateRowCount: 1, items: [{ securityId: "A", returnedPosition: 1 }, { securityId: "B", returnedPosition: 3 }] });
  assert.deepEqual(selectBacktestRows(result(["A", "A", "B", "C"]), null).items.at(-1), { securityId: "C", returnedPosition: 4 });
  assert.equal(selectBacktestRows(result(["A"]), 10).evaluatedUniqueCount, 1);
});

test("identity errors fail explicitly and do not repair, skip or coerce chosen rows", () => {
  for (const id of [null, 123, "", " ", "A\0B"]) {
    assert.throws(() => selectBacktestRows(result([id, "B"]), 1), { code: "BACKTEST_IDENTITY_INVALID" });
  }
  for (const columns of [[], [{ name: "Symbol" }], [{ name: "securityId" }, { name: "security_id" }]]) {
    assert.throws(() => selectBacktestRows({ columns, rows: [], rowCount: 0 }, null), { code: "BACKTEST_IDENTITY_COLUMN_INVALID" });
  }
  assert.equal(selectBacktestRows(result(["A", null]), 1).evaluatedUniqueCount, 1);
  assert.deepEqual(selectBacktestRows({ columns: [{ name: "securityId" }], rows: [["0001"]], rowCount: 1 }, null).items,
    [{ securityId: "0001", returnedPosition: 1 }]);
});

test("request freezes exact Query SQL, source, decision time and shared settings independently of caller edits", () => {
  const input = { sourceId: "active", requestedAtMs: 2500, queries: [query("A"), query("B")], horizonsMs: [10000] };
  const frozen = freezeBacktestPointRequest(input);
  input.queries[0].sql = "edited afterward";
  input.horizonsMs.push(20000);
  assert.equal(frozen.queries[0].sql, "unchanged SQL text");
  assert.equal(frozen.topX, 10);
  assert.deepEqual(frozen.horizonsMs, [10000]);
  assert.throws(() => { frozen.queries[0].sql = "edit"; }, TypeError);
  for (const patch of [{ topX: 0 }, { requestedAtMs: -1 }, { horizonsMs: [10000, 10000] },
    { horizonsMs: [5000] }, { horizonsMs: [] }, { queries: [] }, { queries: [query("A"), query("A")] },
    { queries: [query("A"), query("B"), query("C"), query("D")] }]) {
    assert.throws(() => freezeBacktestPointRequest({ ...input, ...patch }), { code: "BACKTEST_POINT_INPUT_INVALID" });
  }
});

test("Inspect preserves every row/horizon and summarizes only available observations, with zero included", () => {
  const actual = point([["A", "B", "C", "D"]], [[10, -5, 0, null]]);
  assert.equal(actual.queries[0].items.length, 4);
  assert.deepEqual(actual.queries[0].summary[0], { horizonMs: 10000, availableCount: 3, unavailableCount: 1,
    averagePercent: 5 / 3, medianPercent: 0, positiveCount: 1, positiveRate: 1 / 3, bestPercent: 10, worstPercent: -5 });
  assert.equal(actual.queries[0].items[3].horizons[0].unavailableReason, "NO_FUTURE_OBSERVATION");
  assert.equal(point([["A", "B"]], [[-2, 4]]).queries[0].summary[0].medianPercent, 1);
  assert.equal(point([["A"]], [[null]]).queries[0].summary[0].positiveRate, null);
  assert.equal(point([[]], [[]]).queries[0].summary[0].averagePercent, null);
});

test("Compare retains independent returned orders and exact pair overlap/exclusive/position changes", () => {
  const actual = point([["A", "B", "C"], ["B", "A", "D"]], [[1, 2, -3], [2, 1, null]]);
  assert.deepEqual(actual.queries.map(q => q.items.map(item => item.securityId)), [["A", "B", "C"], ["B", "A", "D"]]);
  assert.deepEqual(actual.comparison.pairs[0], { queryIds: ["A", "B"], overlapCount: 2, unionCount: 4,
    overlapRate: 0.5, onlyCounts: [1, 1], positionChanges: [
      { securityId: "A", positions: [1, 2], delta: 1 }, { securityId: "B", positions: [2, 1], delta: -1 }] });
  assert.equal(actual.comparison.commonCount, 2);
  assert.deepEqual(actual.comparison.exclusiveCounts, [1, 1]);
});

test("optional C distinguishes all-common, pair-common and truly exclusive securities", () => {
  const actual = point([["A", "B", "C"], ["A", "B", "D"], ["A", "E"]], [[1, 2, 3], [1, 2, 4], [1, 5]]);
  assert.equal(actual.comparison.unionCount, 5);
  assert.equal(actual.comparison.commonCount, 1);
  assert.deepEqual(actual.comparison.exclusiveCounts, [1, 1, 1]);
  assert.equal(actual.comparison.pairs.length, 3);
  const before = JSON.stringify(actual);
  assert.deepEqual(filterBacktestPointRows(actual, "common").map(q => q.items.map(item => item.securityId)), [["A"], ["A"], ["A"]]);
  assert.deepEqual(filterBacktestPointRows(actual, "differences").map(q => q.items.map(item => item.securityId)), [["B", "C"], ["B", "D"], ["E"]]);
  assert.equal(JSON.stringify(actual), before);
  assert.equal(filterBacktestPointRows(actual)[0].items[0], actual.queries[0].items[0]);
  assert.throws(() => { actual.queries[0].items[0].horizons[0].price = 999; }, TypeError);
});

test("empty comparisons have explicit null overlap rate and changed positions stay in differences", () => {
  assert.equal(point([[], []], [[], []]).comparison.pairs[0].overlapRate, null);
  const actual = point([["A", "B"], ["B", "A"]], [[1, 2], [2, 1]]);
  assert.equal(filterBacktestPointRows(actual, "differences")[0].items.length, 2);
});

test("mismatched B/T0/horizons/positions and incomplete outcome evidence cannot enter a point", () => {
  const request = freezeBacktestPointRequest({ sourceId: "active", requestedAtMs: 2500, queries: [query("A")], horizonsMs: [10000] });
  const selection = selectBacktestRows(result(["A"]), 10);
  for (const change of [value => { value.baselineCycleId = 3; }, value => { value.requestedAtMs = 2600; },
    value => { value.horizonsMs = [20000]; }, value => { value.items[0].returnedPosition = 2; },
    value => { value.items[0].securityId = "B"; }, value => { value.items[0].horizons = []; }]) {
    const evaluation = evidence(selection, [1]);
    change(evaluation);
    assert.throws(() => buildBacktestPointResult({ request, baseline, queryResults: [{ selection, evaluation }] }),
      { code: "BACKTEST_POINT_INPUT_INVALID" });
  }
});
