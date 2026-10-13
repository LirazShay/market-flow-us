import { StatementType } from "@duckdb/node-api";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

const EXPLICIT_FORBIDDEN_FUNCTIONS = Object.freeze([
  "query",
  "query_table"
]);

function scannerError(code) {
  return new ProtocolValidationError(code);
}

function researchResultLimitError(dimension, limit) {
  const error = new Error(`Research SQL result exceeded ${dimension} ceiling`);
  error.code = "RESEARCH_BUDGET_EXCEEDED";
  error.dimension = dimension;
  error.limit = limit;
  return error;
}

function isIdentifierStart(char) {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function skipLineComment(sql, start) {
  let index = start + 2;
  while (index < sql.length && sql[index] !== "\n") index += 1;
  return index;
}

function skipBlockComment(sql, start) {
  let index = start + 2;
  let depth = 1;

  while (index < sql.length && depth > 0) {
    if (sql[index] === "/" && sql[index + 1] === "*") {
      depth += 1;
      index += 2;
      continue;
    }
    if (sql[index] === "*" && sql[index + 1] === "/") {
      depth -= 1;
      index += 2;
      continue;
    }
    index += 1;
  }

  return index;
}

function skipSingleQuotedString(sql, start) {
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] === "'") {
      if (sql[index + 1] === "'") {
        index += 2;
        continue;
      }
      return index + 1;
    }
    index += 1;
  }

  return index;
}

function readQuotedIdentifier(sql, start) {
  let index = start + 1;
  let value = "";

  while (index < sql.length) {
    if (sql[index] === '"') {
      if (sql[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      return { value, end: index + 1 };
    }
    value += sql[index];
    index += 1;
  }

  return { value, end: index };
}

function dollarQuoteDelimiter(sql, start) {
  if (sql[start] !== "$") return null;

  const tail = sql.slice(start);
  const match = tail.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
  return match ? match[0] : null;
}

function skipDollarQuotedString(sql, start, delimiter) {
  const contentStart = start + delimiter.length;
  const end = sql.indexOf(delimiter, contentStart);
  return end === -1 ? sql.length : end + delimiter.length;
}

function skipTrivia(sql, start) {
  let index = start;

  while (index < sql.length) {
    if (/\s/.test(sql[index])) {
      index += 1;
      continue;
    }
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index = skipLineComment(sql, index);
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
      continue;
    }
    break;
  }

  return index;
}

function scanScannerIdentifiers(sql, visitor) {
  if (typeof sql !== "string") {
    throw new TypeError("sql must be a string.");
  }
  if (typeof visitor !== "function") {
    throw new TypeError("identifier visitor must be a function.");
  }

  let index = 0;
  while (index < sql.length) {
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index = skipLineComment(sql, index);
      continue;
    }

    if (sql[index] === "/" && sql[index + 1] === "*") {
      index = skipBlockComment(sql, index);
      continue;
    }

    if (sql[index] === "'") {
      index = skipSingleQuotedString(sql, index);
      continue;
    }

    if (sql[index] === "$") {
      const delimiter = dollarQuoteDelimiter(sql, index);
      if (delimiter) {
        index = skipDollarQuotedString(sql, index, delimiter);
        continue;
      }
    }

    if (sql[index] === '"') {
      const quoted = readQuotedIdentifier(sql, index);
      if (quoted.value.length > 0) {
        visitor(quoted.value.toLowerCase(), quoted.end);
      }
      index = quoted.end;
      continue;
    }

    if (isIdentifierStart(sql[index])) {
      let end = index + 1;
      while (end < sql.length && isIdentifierPart(sql[end])) end += 1;
      visitor(sql.slice(index, end).toLowerCase(), end);
      index = end;
      continue;
    }

    index += 1;
  }
}

export function extractScannerIdentifiers(sql) {
  const identifiers = [];
  scanScannerIdentifiers(sql, (identifier) => identifiers.push(identifier));
  return identifiers;
}

export function extractScannerFunctionCalls(sql) {
  const calls = [];
  scanScannerIdentifiers(sql, (identifier, end) => {
    const next = skipTrivia(sql, end);
    if (sql[next] === "(") calls.push(identifier);
  });
  return calls;
}

async function loadSideEffectFunctions(connection) {
  const reader = await connection.runAndReadAll(`
    SELECT DISTINCT lower(function_name) AS functionName
    FROM duckdb_functions()
    WHERE has_side_effects = true
      AND function_name IS NOT NULL
  `);

  const rows = reader.getRowObjectsJson();
  return new Set(rows
    .map((row) => row.functionName ?? row.functionname)
    .filter((name) => typeof name === "string" && name.length > 0)
    .map((name) => name.toLowerCase()));
}

function readClock(now) {
  const value = now();
  if (!Number.isSafeInteger(value)) {
    throw new Error("Scanner clock must return a safe integer.");
  }
  return value;
}

function mapScannerFailure(error) {
  if (error instanceof ProtocolValidationError) return error;
  if (
    error?.code === "RESEARCH_BUDGET_EXCEEDED"
    && (error?.dimension === "resultRows" || error?.dimension === "resultBytes")
  ) {
    return error;
  }
  return scannerError(ERROR_CODES.SCANNER_EXECUTION_ERROR);
}

function normalizeResultLimits(resultLimits) {
  if (resultLimits === undefined || resultLimits === null) return null;
  if (typeof resultLimits !== "object" || Array.isArray(resultLimits)) {
    throw new TypeError("resultLimits must be an object.");
  }
  const keys = Object.keys(resultLimits).sort();
  if (keys.length !== 2 || keys[0] !== "maxBytes" || keys[1] !== "maxRows") {
    throw new TypeError("resultLimits must contain exactly maxRows and maxBytes.");
  }
  const maxRows = Number(resultLimits.maxRows);
  const maxBytes = Number(resultLimits.maxBytes);
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new TypeError("resultLimits.maxRows must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2) {
    throw new TypeError("resultLimits.maxBytes must be a safe integer of at least 2.");
  }
  return Object.freeze({ maxRows, maxBytes });
}

function resultColumns(reader) {
  return Array.from({ length: reader.columnCount }, (_, columnIndex) => ({
    name: reader.columnName(columnIndex),
    type: reader.columnType(columnIndex).toString()
  }));
}

function rowObject(columns, row) {
  return Object.fromEntries(columns.map((column, index) => [column.name, row[index]]));
}

async function readBoundedResult(prepared, limits) {
  if (typeof prepared.streamAndRead !== "function") {
    throw new Error("Scanner bounded execution requires DuckDB streaming support");
  }

  const reader = await prepared.streamAndRead();
  const columns = resultColumns(reader);
  const rows = [];
  let processed = 0;
  let serializedBytes = 2;

  while (true) {
    if (reader.done && processed >= reader.currentRowCount) break;
    if (processed >= reader.currentRowCount) {
      await reader.readUntil(reader.currentRowCount + 1);
    }

    const available = reader.getRowsJson();
    while (processed < available.length) {
      const row = available[processed];
      processed += 1;

      if (rows.length >= limits.maxRows) {
        throw researchResultLimitError("resultRows", limits.maxRows);
      }

      const objectBytes = Buffer.byteLength(JSON.stringify(rowObject(columns, row)), "utf8");
      const nextSerializedBytes = serializedBytes + objectBytes + (rows.length === 0 ? 0 : 1);
      if (nextSerializedBytes > limits.maxBytes) {
        throw researchResultLimitError("resultBytes", limits.maxBytes);
      }

      rows.push(row);
      serializedBytes = nextSerializedBytes;
    }

    if (reader.done) break;
  }

  return { columns, rows };
}

export async function createScannerAuthority({
  connection,
  now = () => Date.now(),
  resultLimits
} = {}) {
  if (
    !connection
    || typeof connection.extractStatements !== "function"
    || typeof connection.runAndReadAll !== "function"
  ) {
    throw new TypeError("scanner connection is required.");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }
  const boundedResultLimits = normalizeResultLimits(resultLimits);

  const sideEffectFunctions = await loadSideEffectFunctions(connection);
  const forbiddenFunctions = new Set([
    ...EXPLICIT_FORBIDDEN_FUNCTIONS,
    ...sideEffectFunctions
  ]);

  async function executeOne(sql) {
    const startedAtMs = readClock(now);
    let prepared = null;

    try {
      if (typeof sql !== "string" || sql.trim().length === 0) {
        throw scannerError(ERROR_CODES.SCANNER_EMPTY_SQL);
      }

      const extracted = await connection.extractStatements(sql);
      if (extracted.count === 0) {
        throw scannerError(ERROR_CODES.SCANNER_EMPTY_SQL);
      }
      if (extracted.count !== 1) {
        throw scannerError(ERROR_CODES.SCANNER_MULTIPLE_STATEMENTS);
      }

      prepared = await extracted.prepare(0);

      if (prepared.statementType !== StatementType.SELECT) {
        throw scannerError(ERROR_CODES.SCANNER_NON_SELECT);
      }
      if (prepared.parameterCount !== 0) {
        throw scannerError(ERROR_CODES.SCANNER_PARAMETERS_UNSUPPORTED);
      }

      const invokedFunctions = extractScannerFunctionCalls(sql);
      if (invokedFunctions.some((name) => forbiddenFunctions.has(name))) {
        throw scannerError(ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION);
      }

      let columns;
      let rows;
      if (boundedResultLimits) {
        ({ columns, rows } = await readBoundedResult(prepared, boundedResultLimits));
      } else {
        const reader = await prepared.runAndReadAll();
        columns = resultColumns(reader);
        rows = reader.getRowsJson();
      }
      const completedAtMs = readClock(now);

      return {
        columns,
        rows,
        rowCount: rows.length,
        startedAtMs,
        completedAtMs,
        durationMs: Math.max(0, completedAtMs - startedAtMs)
      };
    } catch (error) {
      throw mapScannerFailure(error);
    } finally {
      prepared?.destroySync();
    }
  }

  let executionTail = Promise.resolve();

  async function execute(sql) {
    const task = executionTail.then(() => executeOne(sql));
    executionTail = task.catch(() => {});
    return await task;
  }

  return Object.freeze({
    execute
  });
}
