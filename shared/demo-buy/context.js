import {
  DEMO_BUY_CONTEXT_MAX_BYTES,
  DEMO_BUY_CONTEXT_MAX_CELL_BYTES,
  DEMO_BUY_CONTEXT_MAX_COLUMNS,
  DEMO_BUY_CONTEXT_MAX_ROWS,
  DEMO_BUY_IDENTITY_COLUMN_NAMES,
  DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
} from "./limits.js";

const UTF8 = new TextEncoder();
const IDENTITY_NAMES = new Set(DEMO_BUY_IDENTITY_COLUMN_NAMES);

function utf8Bytes(value) {
  return UTF8.encode(value).byteLength;
}

function clipUtf8(value, maxBytes) {
  if (utf8Bytes(value) <= maxBytes) return value;

  let result = "";
  let used = 0;
  for (const char of value) {
    const size = utf8Bytes(char);
    if (used + size > maxBytes) break;
    result += char;
    used += size;
  }
  return result;
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Scanner context contains a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("Scanner context contains a non-JSON-safe value.");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, required) {
  if (!isPlainObject(value)) {
    throw new TypeError("Scanner context object is invalid.");
  }
  const expected = new Set(required);
  const keys = Object.keys(value);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new TypeError("Scanner context object keys are invalid.");
  }
}

function assertSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new TypeError("Scanner context columns must be a non-empty array.");
  }

  return columns.map((column, sourceIndex) => {
    if (!column || typeof column !== "object" || Array.isArray(column)) {
      throw new TypeError("Scanner context column metadata is invalid.");
    }
    if (typeof column.name !== "string" || column.name.length === 0) {
      throw new TypeError("Scanner context column name is invalid.");
    }
    return Object.freeze({
      sourceIndex,
      name: column.name,
      type: typeof column.type === "string" ? column.type : null
    });
  });
}

function findIdentityColumn(columns) {
  const matches = columns.filter((column) => IDENTITY_NAMES.has(column.name));
  if (matches.length !== 1) {
    throw new Error("Demo Buy Scanner context requires exactly one recognized identity column.");
  }
  return matches[0];
}

function chooseRetainedColumns(columns, identityColumn) {
  const retainedIndexes = new Set([identityColumn.sourceIndex]);

  for (const column of columns) {
    if (retainedIndexes.size >= DEMO_BUY_CONTEXT_MAX_COLUMNS) break;
    retainedIndexes.add(column.sourceIndex);
  }

  const retainedColumns = columns.filter((column) => retainedIndexes.has(column.sourceIndex));
  const omittedColumns = columns.filter((column) => !retainedIndexes.has(column.sourceIndex));
  return { retainedColumns, omittedColumns };
}

function transformCell(value, { resultRank, column, identityColumn, metadata }) {
  if (value === null || typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Scanner context contains a non-finite number.");
    }
    return value;
  }

  if (typeof value === "string") {
    const originalUtf8Bytes = utf8Bytes(value);
    if (column.sourceIndex === identityColumn.sourceIndex && originalUtf8Bytes > DEMO_BUY_CONTEXT_MAX_CELL_BYTES) {
      throw new Error("Demo Buy identity context cell exceeds 128 UTF-8 bytes and cannot be clipped safely.");
    }
    if (originalUtf8Bytes <= DEMO_BUY_CONTEXT_MAX_CELL_BYTES) return value;

    metadata.push({
      resultRank,
      sourceColumnIndex: column.sourceIndex,
      truncated: true,
      originalUtf8Bytes
    });
    return clipUtf8(value, DEMO_BUY_CONTEXT_MAX_CELL_BYTES);
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    const encoded = canonicalJson(value);
    const originalUtf8Bytes = utf8Bytes(encoded);
    const entry = {
      resultRank,
      sourceColumnIndex: column.sourceIndex,
      encoding: "canonical_json"
    };

    if (originalUtf8Bytes > DEMO_BUY_CONTEXT_MAX_CELL_BYTES) {
      if (column.sourceIndex === identityColumn.sourceIndex) {
        throw new Error("Demo Buy identity context cell exceeds 128 UTF-8 bytes and cannot be clipped safely.");
      }
      entry.truncated = true;
      entry.originalUtf8Bytes = originalUtf8Bytes;
      metadata.push(entry);
      return clipUtf8(encoded, DEMO_BUY_CONTEXT_MAX_CELL_BYTES);
    }

    metadata.push(entry);
    return encoded;
  }

  throw new TypeError("Scanner context contains a non-JSON-safe value.");
}

function validateColumnDescriptor(column, sourceColumnCount) {
  assertExactKeys(column, ["sourceIndex", "name", "type"]);
  assertSafeInteger(column.sourceIndex, "Scanner context source column index", {
    max: Math.max(0, sourceColumnCount - 1)
  });
  if (typeof column.name !== "string" || column.name.length === 0) {
    throw new TypeError("Scanner context column name is invalid.");
  }
  if (column.type !== null && typeof column.type !== "string") {
    throw new TypeError("Scanner context column type is invalid.");
  }
}

function validateCellMetadata(entry, retainedIndexes, retainedRowCount) {
  if (!isPlainObject(entry)) {
    throw new TypeError("Scanner context cell metadata is invalid.");
  }
  const allowed = new Set([
    "resultRank",
    "sourceColumnIndex",
    "encoding",
    "truncated",
    "originalUtf8Bytes"
  ]);
  const keys = Object.keys(entry);
  if (keys.some((key) => !allowed.has(key))) {
    throw new TypeError("Scanner context cell metadata keys are invalid.");
  }
  if (!Object.hasOwn(entry, "resultRank") || !Object.hasOwn(entry, "sourceColumnIndex")) {
    throw new TypeError("Scanner context cell metadata is incomplete.");
  }
  assertSafeInteger(entry.resultRank, "Scanner context metadata resultRank", {
    min: 1,
    max: retainedRowCount
  });
  assertSafeInteger(entry.sourceColumnIndex, "Scanner context metadata column index");
  if (!retainedIndexes.has(entry.sourceColumnIndex)) {
    throw new TypeError("Scanner context metadata references an omitted column.");
  }
  if (Object.hasOwn(entry, "encoding") && entry.encoding !== "canonical_json") {
    throw new TypeError("Scanner context metadata encoding is invalid.");
  }
  if (Object.hasOwn(entry, "truncated") && entry.truncated !== true) {
    throw new TypeError("Scanner context truncation metadata is invalid.");
  }
  if (Object.hasOwn(entry, "originalUtf8Bytes")) {
    assertSafeInteger(entry.originalUtf8Bytes, "Scanner context original UTF-8 size", {
      min: DEMO_BUY_CONTEXT_MAX_CELL_BYTES + 1
    });
  }
  if (entry.truncated === true && !Object.hasOwn(entry, "originalUtf8Bytes")) {
    throw new TypeError("Scanner context truncated cell is missing its original size.");
  }
  if (entry.encoding === "canonical_json" && !Object.hasOwn(entry, "truncated") && Object.hasOwn(entry, "originalUtf8Bytes")) {
    throw new TypeError("Scanner context encoded-cell metadata is inconsistent.");
  }
}

function validateRetainedCell(value) {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Scanner context contains a non-finite number.");
    return;
  }
  if (typeof value === "string") {
    if (utf8Bytes(value) > DEMO_BUY_CONTEXT_MAX_CELL_BYTES) {
      throw new TypeError("Scanner context retained cell exceeds the UTF-8 bound.");
    }
    return;
  }
  throw new TypeError("Scanner context retained values must already be deterministically shaped.");
}

export function assertDemoBuyContextJsonWithinLimit(serializedContextJson) {
  if (typeof serializedContextJson !== "string") {
    throw new TypeError("serializedContextJson must be a string.");
  }
  const size = utf8Bytes(serializedContextJson);
  if (size > DEMO_BUY_CONTEXT_MAX_BYTES) {
    throw new Error("Demo Buy Scanner context exceeds the 256 KiB serialized JSON limit.");
  }
  return size;
}

export function serializeDemoBuyScannerContext(context) {
  const serialized = JSON.stringify(context);
  assertDemoBuyContextJsonWithinLimit(serialized);
  return serialized;
}

export function validateDemoBuyScannerContext(context) {
  assertExactKeys(context, [
    "version",
    "sourceRowCount",
    "retainedRowCount",
    "omittedRowCount",
    "sourceColumnCount",
    "identityColumn",
    "retainedColumns",
    "omittedColumns",
    "rows",
    "cellMetadata"
  ]);
  if (context.version !== 1) {
    throw new TypeError("Scanner context version is invalid.");
  }

  assertSafeInteger(context.sourceRowCount, "Scanner context sourceRowCount");
  assertSafeInteger(context.retainedRowCount, "Scanner context retainedRowCount", {
    max: DEMO_BUY_CONTEXT_MAX_ROWS
  });
  assertSafeInteger(context.omittedRowCount, "Scanner context omittedRowCount");
  assertSafeInteger(context.sourceColumnCount, "Scanner context sourceColumnCount", { min: 1 });

  if (
    context.retainedRowCount !== Math.min(context.sourceRowCount, DEMO_BUY_CONTEXT_MAX_ROWS)
    || context.omittedRowCount !== context.sourceRowCount - context.retainedRowCount
  ) {
    throw new TypeError("Scanner context row counts are inconsistent.");
  }

  assertExactKeys(context.identityColumn, ["sourceIndex", "name"]);
  assertSafeInteger(context.identityColumn.sourceIndex, "Scanner context identity sourceIndex", {
    max: context.sourceColumnCount - 1
  });
  if (!IDENTITY_NAMES.has(context.identityColumn.name)) {
    throw new TypeError("Scanner context identity column name is invalid.");
  }

  if (!Array.isArray(context.retainedColumns) || context.retainedColumns.length === 0) {
    throw new TypeError("Scanner context retained columns are invalid.");
  }
  if (context.retainedColumns.length > DEMO_BUY_CONTEXT_MAX_COLUMNS) {
    throw new TypeError("Scanner context retained column count exceeds the bound.");
  }
  if (!Array.isArray(context.omittedColumns)) {
    throw new TypeError("Scanner context omitted columns are invalid.");
  }
  if (context.retainedColumns.length + context.omittedColumns.length !== context.sourceColumnCount) {
    throw new TypeError("Scanner context column counts are inconsistent.");
  }

  const allColumns = [...context.retainedColumns, ...context.omittedColumns];
  for (const column of allColumns) validateColumnDescriptor(column, context.sourceColumnCount);

  const byIndex = new Map();
  for (const column of allColumns) {
    if (byIndex.has(column.sourceIndex)) {
      throw new TypeError("Scanner context contains duplicate source column indexes.");
    }
    byIndex.set(column.sourceIndex, column);
  }
  for (let index = 0; index < context.sourceColumnCount; index += 1) {
    if (!byIndex.has(index)) {
      throw new TypeError("Scanner context source column coverage is incomplete.");
    }
  }

  const recognized = allColumns.filter((column) => IDENTITY_NAMES.has(column.name));
  if (recognized.length !== 1) {
    throw new TypeError("Scanner context requires exactly one recognized identity column.");
  }
  const identity = recognized[0];
  if (
    identity.sourceIndex !== context.identityColumn.sourceIndex
    || identity.name !== context.identityColumn.name
  ) {
    throw new TypeError("Scanner context identity metadata is inconsistent.");
  }

  const retainedIndexes = new Set(context.retainedColumns.map((column) => column.sourceIndex));
  if (!retainedIndexes.has(identity.sourceIndex)) {
    throw new TypeError("Scanner context omitted its canonical identity column.");
  }

  const sourceColumns = [...byIndex.values()].sort((left, right) => left.sourceIndex - right.sourceIndex);
  const expectedRetained = chooseRetainedColumns(sourceColumns, identity).retainedColumns;
  if (
    expectedRetained.length !== context.retainedColumns.length
    || expectedRetained.some((column, index) => {
      const actual = context.retainedColumns[index];
      return column.sourceIndex !== actual.sourceIndex || column.name !== actual.name || column.type !== actual.type;
    })
  ) {
    throw new TypeError("Scanner context retained columns do not match deterministic shaping rules.");
  }

  if (!Array.isArray(context.rows) || context.rows.length !== context.retainedRowCount) {
    throw new TypeError("Scanner context rows are inconsistent with retainedRowCount.");
  }
  const identityValueIndex = context.retainedColumns.findIndex(
    (column) => column.sourceIndex === identity.sourceIndex
  );
  for (let index = 0; index < context.rows.length; index += 1) {
    const row = context.rows[index];
    assertExactKeys(row, ["resultRank", "values"]);
    if (row.resultRank !== index + 1 || !Array.isArray(row.values) || row.values.length !== context.retainedColumns.length) {
      throw new TypeError("Scanner context row shape/rank is invalid.");
    }
    for (const value of row.values) validateRetainedCell(value);

    const identityValue = row.values[identityValueIndex];
    if (
      typeof identityValue !== "string"
      || identityValue.trim().length === 0
      || identityValue.length > DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
    ) {
      throw new TypeError("Scanner context identity value is unusable.");
    }
  }

  if (!Array.isArray(context.cellMetadata)) {
    throw new TypeError("Scanner context cell metadata must be an array.");
  }
  const seenMetadata = new Set();
  for (const entry of context.cellMetadata) {
    validateCellMetadata(entry, retainedIndexes, context.retainedRowCount);
    const key = `${entry.resultRank}:${entry.sourceColumnIndex}`;
    if (seenMetadata.has(key)) {
      throw new TypeError("Scanner context contains duplicate cell metadata.");
    }
    seenMetadata.add(key);
  }

  serializeDemoBuyScannerContext(context);
  return Object.freeze({
    context,
    identityValueIndex
  });
}

export function shapeDemoBuyScannerContext({ columns, rows }) {
  const normalizedColumns = normalizeColumns(columns);
  const identityColumn = findIdentityColumn(normalizedColumns);
  if (!Array.isArray(rows)) {
    throw new TypeError("Scanner context rows must be an array.");
  }

  const { retainedColumns, omittedColumns } = chooseRetainedColumns(
    normalizedColumns,
    identityColumn
  );
  const retainedSourceRows = rows.slice(0, DEMO_BUY_CONTEXT_MAX_ROWS);
  const cellMetadata = [];

  const retainedRows = retainedSourceRows.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== normalizedColumns.length) {
      throw new TypeError("Scanner context row width does not match columns.");
    }

    const resultRank = rowIndex + 1;
    const values = retainedColumns.map((column) => transformCell(
      row[column.sourceIndex],
      {
        resultRank,
        column,
        identityColumn,
        metadata: cellMetadata
      }
    ));
    return { resultRank, values };
  });

  const context = {
    version: 1,
    sourceRowCount: rows.length,
    retainedRowCount: retainedRows.length,
    omittedRowCount: Math.max(0, rows.length - retainedRows.length),
    sourceColumnCount: normalizedColumns.length,
    identityColumn: {
      sourceIndex: identityColumn.sourceIndex,
      name: identityColumn.name
    },
    retainedColumns: retainedColumns.map((column) => ({
      sourceIndex: column.sourceIndex,
      name: column.name,
      type: column.type
    })),
    omittedColumns: omittedColumns.map((column) => ({
      sourceIndex: column.sourceIndex,
      name: column.name,
      type: column.type
    })),
    rows: retainedRows,
    cellMetadata
  };

  validateDemoBuyScannerContext(context);
  return context;
}
