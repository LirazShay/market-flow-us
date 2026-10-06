import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDemoBuyContextJsonWithinLimit,
  serializeDemoBuyScannerContext,
  shapeDemoBuyScannerContext
} from "../../shared/demo-buy/context.js";
import {
  DEMO_BUY_CONTEXT_MAX_BYTES,
  DEMO_BUY_CONTEXT_MAX_CELL_BYTES,
  DEMO_BUY_CONTEXT_MAX_COLUMNS,
  DEMO_BUY_CONTEXT_MAX_ROWS
} from "../../shared/demo-buy/limits.js";

function columns(names) {
  return names.map((name) => ({ name, type: "VARCHAR" }));
}

test("Demo Buy Scanner context keeps first 50 rows and mandatory identity while bounding columns deterministically", () => {
  const sourceColumns = columns([
    ...Array.from({ length: 64 }, (_, index) => `c${index + 1}`),
    "securityId"
  ]);
  const sourceRows = Array.from({ length: 51 }, (_, rowIndex) => (
    sourceColumns.map((column, columnIndex) => (
      column.name === "securityId"
        ? `SEC-${rowIndex + 1}`
        : `r${rowIndex + 1}-c${columnIndex + 1}`
    ))
  ));

  const context = shapeDemoBuyScannerContext({
    columns: sourceColumns,
    rows: sourceRows
  });

  assert.equal(context.sourceRowCount, 51);
  assert.equal(context.retainedRowCount, DEMO_BUY_CONTEXT_MAX_ROWS);
  assert.equal(context.omittedRowCount, 1);
  assert.equal(context.sourceColumnCount, 65);
  assert.equal(context.retainedColumns.length, DEMO_BUY_CONTEXT_MAX_COLUMNS);
  assert.equal(context.identityColumn.sourceIndex, 64);
  assert.equal(context.identityColumn.name, "securityId");
  assert.equal(context.retainedColumns.at(-1).name, "securityId");
  assert.deepEqual(
    context.retainedColumns.slice(0, 63).map((column) => column.sourceIndex),
    Array.from({ length: 63 }, (_, index) => index)
  );
  assert.deepEqual(context.omittedColumns.map((column) => column.sourceIndex), [63]);
  assert.equal(context.rows.length, 50);
  assert.equal(context.rows[0].resultRank, 1);
  assert.equal(context.rows.at(-1).resultRank, 50);
  assert.equal(context.rows[0].values.at(-1), "SEC-1");
});

test("Demo Buy Scanner context preserves JSON-safe primitives and canonicalizes structured cells", () => {
  const context = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "n", type: "DOUBLE" },
      { name: "b", type: "BOOLEAN" },
      { name: "nil", type: "VARCHAR" },
      { name: "arr", type: "JSON" },
      { name: "obj", type: "JSON" }
    ],
    rows: [["SEC-1", 12.5, true, null, [3, { z: 2, a: 1 }], { z: 2, a: 1 }]]
  });

  assert.deepEqual(context.rows[0].values.slice(0, 4), ["SEC-1", 12.5, true, null]);
  assert.equal(context.rows[0].values[4], '[3,{"a":1,"z":2}]');
  assert.equal(context.rows[0].values[5], '{"a":1,"z":2}');
  assert.deepEqual(context.cellMetadata, [
    { resultRank: 1, sourceColumnIndex: 4, encoding: "canonical_json" },
    { resultRank: 1, sourceColumnIndex: 5, encoding: "canonical_json" }
  ]);
});

test("Demo Buy textual and serialized cells clip at valid UTF-8 boundaries with explicit metadata", () => {
  const exactAscii = "a".repeat(DEMO_BUY_CONTEXT_MAX_CELL_BYTES);
  const overAscii = "b".repeat(DEMO_BUY_CONTEXT_MAX_CELL_BYTES + 1);
  const overMultibyte = "€".repeat(43);

  const context = shapeDemoBuyScannerContext({
    columns: columns(["securityId", "exact", "over", "multi", "object"]),
    rows: [[
      "SEC-1",
      exactAscii,
      overAscii,
      overMultibyte,
      { payload: "x".repeat(200) }
    ]]
  });

  assert.equal(new TextEncoder().encode(context.rows[0].values[1]).byteLength, 128);
  assert.equal(context.rows[0].values[1], exactAscii);
  assert.equal(new TextEncoder().encode(context.rows[0].values[2]).byteLength, 128);
  assert.equal(new TextEncoder().encode(context.rows[0].values[3]).byteLength, 126);
  assert.equal(new TextEncoder().encode(context.rows[0].values[4]).byteLength <= 128, true);
  assert.deepEqual(context.cellMetadata, [
    {
      resultRank: 1,
      sourceColumnIndex: 2,
      truncated: true,
      originalUtf8Bytes: 129
    },
    {
      resultRank: 1,
      sourceColumnIndex: 3,
      truncated: true,
      originalUtf8Bytes: 129
    },
    {
      resultRank: 1,
      sourceColumnIndex: 4,
      encoding: "canonical_json",
      truncated: true,
      originalUtf8Bytes: 214
    }
  ]);
});

test("Demo Buy context rejects ambiguous identity columns and identity clipping", () => {
  assert.throws(
    () => shapeDemoBuyScannerContext({
      columns: columns(["securityId", "security_id"]),
      rows: [["A", "A"]]
    }),
    /exactly one recognized identity column/i
  );

  assert.throws(
    () => shapeDemoBuyScannerContext({
      columns: columns(["securityId"]),
      rows: [["א".repeat(65)]]
    }),
    /identity.*128 UTF-8 bytes/i
  );
});

test("Demo Buy context serialized-size guard accepts exact limit and rejects limit+1", () => {
  const exact = `"${"x".repeat(DEMO_BUY_CONTEXT_MAX_BYTES - 2)}"`;
  const over = `"${"x".repeat(DEMO_BUY_CONTEXT_MAX_BYTES - 1)}"`;

  assert.equal(new TextEncoder().encode(exact).byteLength, DEMO_BUY_CONTEXT_MAX_BYTES);
  assert.equal(assertDemoBuyContextJsonWithinLimit(exact), DEMO_BUY_CONTEXT_MAX_BYTES);
  assert.throws(
    () => assertDemoBuyContextJsonWithinLimit(over),
    /256 KiB/i
  );
});

test("Demo Buy context serialization is deterministic and enforces the complete 256 KiB bound", () => {
  const input = {
    columns: columns(["securityId", "payload"]),
    rows: [["SEC-1", { z: 2, a: [3, 1] }]]
  };

  const first = shapeDemoBuyScannerContext(input);
  const second = shapeDemoBuyScannerContext(input);
  const firstJson = serializeDemoBuyScannerContext(first);
  const secondJson = serializeDemoBuyScannerContext(second);

  assert.equal(firstJson, secondJson);
  assert.equal(new TextEncoder().encode(firstJson).byteLength <= DEMO_BUY_CONTEXT_MAX_BYTES, true);
});

test("Demo Buy shaping fails closed when the mandated 50x64 retained evidence cannot fit 256 KiB", () => {
  const sourceColumns = columns([
    "securityId",
    ...Array.from({ length: DEMO_BUY_CONTEXT_MAX_COLUMNS - 1 }, (_, index) => `c${index + 1}`)
  ]);
  const payload = "x".repeat(DEMO_BUY_CONTEXT_MAX_CELL_BYTES);
  const sourceRows = Array.from({ length: DEMO_BUY_CONTEXT_MAX_ROWS }, (_, rowIndex) => [
    `SEC-${rowIndex + 1}`,
    ...Array.from({ length: DEMO_BUY_CONTEXT_MAX_COLUMNS - 1 }, () => payload)
  ]);

  assert.throws(
    () => shapeDemoBuyScannerContext({ columns: sourceColumns, rows: sourceRows }),
    /256 KiB/i
  );
});
