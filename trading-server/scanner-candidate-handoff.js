import { createHash } from "node:crypto";

import { shapeDemoBuyScannerContext } from "../shared/demo-buy/context.js";
import {
  DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS,
  DEMO_BUY_MAX_SOURCE_SQL_BYTES
} from "../shared/demo-buy/limits.js";

const UTF8 = new TextEncoder();

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function assertNullableBoundedString(value, name, maxLength) {
  if (value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} is invalid.`);
  }
}

function normalizeContext(context) {
  if (!isPlainObject(context)) {
    throw new TypeError("Scanner candidate generation context is invalid.");
  }

  assertSafeInteger(context.generation, "Scanner candidate generation", { min: 1 });
  assertNullableBoundedString(context.queryId, "Scanner candidate queryId", 128);
  assertNullableBoundedString(context.queryName, "Scanner candidate queryName", 512);
  if (typeof context.sql !== "string" || context.sql.length === 0) {
    throw new TypeError("Scanner candidate source SQL is invalid.");
  }
  if (UTF8.encode(context.sql).byteLength > DEMO_BUY_MAX_SOURCE_SQL_BYTES) {
    throw new TypeError("Scanner candidate source SQL exceeds the provenance bound.");
  }
  assertSafeInteger(context.intervalMs, "Scanner candidate intervalMs", { min: 1 });
  assertSafeInteger(context.startedAtMs, "Scanner candidate startedAtMs");
  assertSafeInteger(context.completedAtMs, "Scanner candidate completedAtMs");

  return {
    generation: context.generation,
    queryId: context.queryId,
    queryName: context.queryName,
    sql: context.sql,
    intervalMs: context.intervalMs,
    startedAtMs: context.startedAtMs,
    completedAtMs: context.completedAtMs
  };
}

function normalizeResult(result) {
  if (!isPlainObject(result) || !Array.isArray(result.columns) || !Array.isArray(result.rows)) {
    throw new TypeError("Scanner candidate result is invalid.");
  }
  assertSafeInteger(result.rowCount, "Scanner candidate rowCount");
  if (result.rows.length !== result.rowCount) {
    throw new TypeError("Scanner candidate rowCount does not match returned rows.");
  }
  return result;
}

function sqlSha256(sql) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function selectedRowEvidence(result, resultRank) {
  assertSafeInteger(resultRank, "Scanner candidate resultRank", {
    min: 1,
    max: result.rowCount
  });

  const selectedRow = result.rows[resultRank - 1];
  const shaped = shapeDemoBuyScannerContext({
    columns: result.columns,
    rows: [selectedRow]
  });
  const identityValueIndex = shaped.retainedColumns.findIndex(
    (column) => column.sourceIndex === shaped.identityColumn.sourceIndex
  );
  const securityId = shaped.rows[0].values[identityValueIndex];

  if (
    typeof securityId !== "string"
    || securityId.trim().length === 0
    || securityId.length > DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
  ) {
    throw new TypeError("Scanner candidate canonical securityId is invalid.");
  }

  return {
    securityId,
    rowEvidence: {
      resultRank,
      sourceColumnCount: shaped.sourceColumnCount,
      identityColumn: { ...shaped.identityColumn },
      retainedColumns: shaped.retainedColumns.map((column) => ({ ...column })),
      omittedColumns: shaped.omittedColumns.map((column) => ({ ...column })),
      values: [...shaped.rows[0].values],
      cellMetadata: shaped.cellMetadata.map(({ resultRank: _localRank, ...entry }) => ({ ...entry }))
    }
  };
}

export function createScannerCandidateHandoff({
  result,
  context,
  resultRank,
  admittedAtMs
}) {
  const normalizedContext = normalizeContext(context);
  const normalizedResult = normalizeResult(result);
  assertSafeInteger(admittedAtMs, "Scanner candidate admittedAtMs");

  const { securityId, rowEvidence } = selectedRowEvidence(normalizedResult, resultRank);
  const sourceQuerySha256 = sqlSha256(normalizedContext.sql);

  return deepFreeze({
    candidateKey: securityId,
    candidateProvenance: {
      version: 1,
      securityId,
      scannerGeneration: {
        generation: normalizedContext.generation,
        startedAtMs: normalizedContext.startedAtMs,
        completedAtMs: normalizedContext.completedAtMs,
        rowCount: normalizedResult.rowCount
      },
      sourceQuery: {
        queryId: normalizedContext.queryId,
        name: normalizedContext.queryName,
        sql: normalizedContext.sql,
        sqlSha256: sourceQuerySha256,
        intervalMs: normalizedContext.intervalMs
      },
      resultRank,
      rowEvidence,
      admittedAtMs
    }
  });
}
