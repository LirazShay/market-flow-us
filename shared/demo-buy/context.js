import {
  DEMO_BUY_CONTEXT_MAX_BYTES,
  DEMO_BUY_CONTEXT_MAX_CELL_BYTES,
  DEMO_BUY_CONTEXT_MAX_COLUMNS,
  DEMO_BUY_CONTEXT_MAX_ROWS,
  DEMO_BUY_IDENTITY_COLUMN_NAMES
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

  serializeDemoBuyScannerContext(context);
  return context;
}
