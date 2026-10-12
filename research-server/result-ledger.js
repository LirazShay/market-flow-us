import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { RESEARCH_JOB_SCHEMA_VERSION } from "./job-ledger.js";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";

export const RESEARCH_RESULT_SCHEMA_VERSION = 1;
export const DEFAULT_RESEARCH_RESULT_LIMITS = Object.freeze({
  maxPageRows: 100,
  maxPageBytes: 256 * 1024,
  maxRowBytes: 64 * 1024,
  maxResultRows: 100_000,
  maxResultBytes: 64 * 1024 * 1024
});

const BASE_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
  "research_ledger_info",
  "research_runs"
]);
const JOB_TABLES = Object.freeze([
  "research_job_info",
  "research_jobs"
]);
const RESULT_TABLES = Object.freeze([
  "research_result_info",
  "research_result_rows",
  "research_results"
]);
const MAX_COLUMNS = 128;
const MAX_METADATA_CHARS = 65_536;
const CURSOR_PREFIX = "cur_";
const CURSOR_VERSION = 1;

const CREATE_RESEARCH_RESULT_INFO = `
CREATE TABLE research_result_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RESEARCH_RESULTS = `
CREATE TABLE research_results (
  result_handle VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  source_job_id VARCHAR NOT NULL,
  result_kind VARCHAR NOT NULL,
  result_schema_version INTEGER NOT NULL,
  columns_json VARCHAR NOT NULL,
  row_count BIGINT NOT NULL,
  serialized_bytes BIGINT NOT NULL,
  provenance_json VARCHAR NOT NULL,
  retention_json VARCHAR NOT NULL,
  metadata_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RESEARCH_RESULT_ROWS = `
CREATE TABLE research_result_rows (
  result_handle VARCHAR NOT NULL,
  row_index BIGINT NOT NULL,
  row_json VARCHAR NOT NULL,
  row_bytes BIGINT NOT NULL,
  row_hash VARCHAR NOT NULL,
  PRIMARY KEY (result_handle, row_index)
)`;

const RESULT_COLUMNS = `
result_handle,
research_run_id,
source_job_id,
result_kind,
result_schema_version,
columns_json,
row_count,
serialized_bytes,
provenance_json,
retention_json,
metadata_hash,
created_at_ms`;

async function ensureParentDirectory(dbPath) {
  if (dbPath === ":memory:") return;
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

async function tableNames(connection) {
  const rows = await queryRows(
    connection,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
  );
  return rows.map((row) => String(row.table_name));
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original transaction/bootstrap error.
  }
}

async function inTransaction(connection, operation) {
  await connection.run("BEGIN TRANSACTION");
  try {
    const result = await operation();
    await connection.run("COMMIT");
    return result;
  } catch (error) {
    await rollbackPreservingOriginal(connection);
    throw error;
  }
}

async function lockConfiguration(connection) {
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original startup error.
  }
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSafeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertJobId(value) {
  if (typeof value !== "string" || !/^job_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("sourceJobId must be a job_ prefixed UUID");
  }
  return value;
}

function assertResultHandle(value) {
  if (typeof value !== "string" || !/^res_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("resultHandle must be a res_ prefixed UUID");
  }
  return value;
}

function assertResultKind(value) {
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value)) {
    throw new TypeError("resultKind must be a bounded uppercase result identifier");
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return value;
}

function normalizeJsonValue(value, label, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be JSON serializable`);
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} must be JSON serializable`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} must be JSON serializable`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonValue(item, label, ancestors));
    }
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError(`${label} must be JSON serializable`);
      }
      normalized[key] = normalizeJsonValue(item, label, ancestors);
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function serializeCanonicalJson(value, label, maxChars = MAX_METADATA_CHARS) {
  const normalized = normalizeJsonValue(value, label, new Set());
  const serialized = JSON.stringify(normalized);
  if (serialized.length > maxChars) {
    throw new TypeError(`${label} must serialize to at most ${maxChars} characters`);
  }
  return serialized;
}

function serializeCanonicalObject(value, label, maxChars = MAX_METADATA_CHARS) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return serializeCanonicalJson(value, label, maxChars);
}

function parseJson(value, label) {
  if (typeof value !== "string") throw new Error(`${label} persistence is invalid`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} persistence is invalid`);
  }
}

function assertColumns(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_COLUMNS) {
    throw new TypeError(`columns must contain between 1 and ${MAX_COLUMNS} column descriptors`);
  }
  const names = new Set();
  for (const column of value) {
    if (column === null || typeof column !== "object" || Array.isArray(column)) {
      throw new TypeError("columns must contain JSON object descriptors");
    }
    if (typeof column.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(column.name)) {
      throw new TypeError("column name is invalid");
    }
    if (names.has(column.name)) throw new TypeError("column names must be unique");
    names.add(column.name);
    if (typeof column.type !== "string" || column.type.length < 1 || column.type.length > 128) {
      throw new TypeError("column type must be a bounded string");
    }
    if (typeof column.nullable !== "boolean") {
      throw new TypeError("column nullable must be boolean");
    }
  }
  return value;
}

function assertRow(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("result rows must be JSON objects");
  }
  return value;
}

function metadataFingerprint({
  researchRunId,
  sourceJobId,
  resultKind,
  resultSchemaVersion,
  columnsJson,
  rowCount,
  serializedBytes,
  provenanceJson,
  retentionJson
}) {
  return sha256(JSON.stringify({
    researchRunId,
    sourceJobId,
    resultKind,
    resultSchemaVersion,
    columnsJson,
    rowCount,
    serializedBytes,
    provenanceJson,
    retentionJson
  }));
}

function normalizeResult(row) {
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const sourceJobId = assertJobId(String(row.source_job_id));
  const resultKind = assertResultKind(String(row.result_kind));
  const resultSchemaVersion = assertSafeInteger(row.result_schema_version, "resultSchemaVersion", { min: 1 });
  const columnsJson = String(row.columns_json);
  const columns = parseJson(columnsJson, "columns");
  assertColumns(columns);
  if (serializeCanonicalJson(columns, "columns") !== columnsJson) {
    throw new Error("result columns persistence is invalid");
  }
  const rowCount = assertSafeInteger(row.row_count, "rowCount");
  const serializedBytes = assertSafeInteger(row.serialized_bytes, "serializedBytes", { min: 2 });
  const provenanceJson = String(row.provenance_json);
  const provenance = parseJson(provenanceJson, "provenance");
  if (serializeCanonicalObject(provenance, "provenance") !== provenanceJson) {
    throw new Error("result provenance persistence is invalid");
  }
  const retentionJson = String(row.retention_json);
  const retention = parseJson(retentionJson, "retention");
  if (serializeCanonicalObject(retention, "retention") !== retentionJson) {
    throw new Error("result retention persistence is invalid");
  }
  const metadataHash = assertSha256(String(row.metadata_hash), "result metadata hash");
  const expectedHash = metadataFingerprint({
    researchRunId,
    sourceJobId,
    resultKind,
    resultSchemaVersion,
    columnsJson,
    rowCount,
    serializedBytes,
    provenanceJson,
    retentionJson
  });
  if (metadataHash !== expectedHash) {
    throw new Error("result metadata hash does not match persisted content");
  }

  return Object.freeze({
    resultHandle: assertResultHandle(String(row.result_handle)),
    researchRunId,
    sourceJobId,
    resultKind,
    resultSchemaVersion,
    columns,
    rowCount,
    serializedBytes,
    provenance,
    retention,
    createdAtMs: assertSafeInteger(row.created_at_ms, "createdAtMs")
  });
}

function normalizeStoredRow(row) {
  const rowIndex = assertSafeInteger(row.row_index, "rowIndex");
  const rowJson = String(row.row_json);
  const rowBytes = assertSafeInteger(row.row_bytes, "rowBytes", { min: 2 });
  if (Buffer.byteLength(rowJson, "utf8") !== rowBytes) {
    throw new Error("result row byte count does not match persisted content");
  }
  const rowHash = assertSha256(String(row.row_hash), "result row hash");
  if (sha256(rowJson) !== rowHash) {
    throw new Error("result row hash does not match persisted content");
  }
  const value = parseJson(rowJson, "result row");
  assertRow(value);
  if (serializeCanonicalObject(value, "result row", Number.MAX_SAFE_INTEGER) !== rowJson) {
    throw new Error("result row persistence is not canonical");
  }
  return { rowIndex, rowJson, rowBytes, value };
}

function assertLimitConfiguration(value, label, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function encodeCursor(resultHandle, offset) {
  const payload = JSON.stringify({ v: CURSOR_VERSION, h: resultHandle, o: offset });
  return `${CURSOR_PREFIX}${Buffer.from(payload, "utf8").toString("base64url")}`;
}

function decodeCursor(cursor, resultHandle) {
  if (cursor === null || cursor === undefined) return 0;
  if (typeof cursor !== "string" || !cursor.startsWith(CURSOR_PREFIX) || cursor.length > 512) {
    throw codedError("RESEARCH_RESULT_CURSOR_INVALID", "result cursor is invalid");
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor.slice(CURSOR_PREFIX.length), "base64url").toString("utf8"));
  } catch {
    throw codedError("RESEARCH_RESULT_CURSOR_INVALID", "result cursor is invalid");
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || parsed.v !== CURSOR_VERSION
    || typeof parsed.h !== "string"
    || !Number.isSafeInteger(parsed.o)
    || parsed.o < 0
  ) {
    throw codedError("RESEARCH_RESULT_CURSOR_INVALID", "result cursor is invalid");
  }
  if (parsed.h !== resultHandle) {
    throw codedError(
      "RESEARCH_RESULT_CURSOR_MISMATCH",
      "result cursor belongs to a different Result Handle"
    );
  }
  return parsed.o;
}

async function validatePrerequisites(connection) {
  const present = new Set(await tableNames(connection));
  const missingBase = BASE_TABLES.filter((table) => !present.has(table));
  if (missingBase.length > 0) {
    throw new Error(`Research result ledger requires base research tables: ${missingBase.join(", ")}`);
  }
  const missingJobs = JOB_TABLES.filter((table) => !present.has(table));
  if (missingJobs.length > 0) {
    throw new Error(`Research result ledger requires durable job tables: ${missingJobs.join(", ")}`);
  }

  const baseInfo = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (baseInfo.length !== 1 || Number(baseInfo[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research result ledger requires the supported base research ledger schema");
  }
  const jobInfo = await queryRows(connection, "SELECT schema_version FROM research_job_info");
  if (jobInfo.length !== 1 || Number(jobInfo[0].schema_version) !== RESEARCH_JOB_SCHEMA_VERSION) {
    throw new Error("Research result ledger requires the supported research job schema");
  }
  return present;
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = await validatePrerequisites(connection);
  const presentResultTables = RESULT_TABLES.filter((table) => present.has(table));

  if (presentResultTables.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_RESULT_INFO);
      await connection.run(CREATE_RESEARCH_RESULTS);
      await connection.run(CREATE_RESEARCH_RESULT_ROWS);
      await connection.run(
        `INSERT INTO research_result_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        {
          schemaVersion: RESEARCH_RESULT_SCHEMA_VERSION,
          createdAtMs
        }
      );
    });
    return;
  }

  const missing = RESULT_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research result ledger is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_result_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_RESULT_SCHEMA_VERSION) {
    throw new Error("Research result ledger schema version is unsupported");
  }
}

export async function openResearchResultLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  resultHandleFactory = () => `res_${randomUUID()}`,
  maxPageRows = DEFAULT_RESEARCH_RESULT_LIMITS.maxPageRows,
  maxPageBytes = DEFAULT_RESEARCH_RESULT_LIMITS.maxPageBytes,
  maxRowBytes = DEFAULT_RESEARCH_RESULT_LIMITS.maxRowBytes,
  maxResultRows = DEFAULT_RESEARCH_RESULT_LIMITS.maxResultRows,
  maxResultBytes = DEFAULT_RESEARCH_RESULT_LIMITS.maxResultBytes
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof resultHandleFactory !== "function") {
    throw new TypeError("resultHandleFactory must be a function");
  }

  const pageRowsLimit = assertLimitConfiguration(maxPageRows, "maxPageRows");
  const pageBytesLimit = assertLimitConfiguration(maxPageBytes, "maxPageBytes", 3);
  const rowBytesLimit = assertLimitConfiguration(maxRowBytes, "maxRowBytes", 2);
  const resultRowsLimit = assertLimitConfiguration(maxResultRows, "maxResultRows");
  const resultBytesLimit = assertLimitConfiguration(maxResultBytes, "maxResultBytes", 2);
  if (rowBytesLimit + 2 > pageBytesLimit) {
    throw new TypeError("maxRowBytes must leave room for JSON page framing within maxPageBytes");
  }
  if (pageRowsLimit > resultRowsLimit) {
    throw new TypeError("maxPageRows cannot exceed maxResultRows");
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    await bootstrapOrValidate(connection, assertSafeInteger(now(), "now()"));
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  async function requireRun(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    const rows = await queryRows(
      connection,
      `SELECT research_run_id
       FROM research_runs
       WHERE research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length === 0) throw new Error("Research Run was not found");
    if (rows.length !== 1) throw new Error("research_runs violated research_run_id uniqueness");
    return runId;
  }

  async function requireSourceJob(researchRunId, sourceJobId) {
    const durableJobId = assertJobId(sourceJobId);
    const rows = await queryRows(
      connection,
      `SELECT job_id
       FROM research_jobs
       WHERE research_run_id = $researchRunId
         AND job_id = $jobId
       LIMIT 2`,
      { researchRunId, jobId: durableJobId }
    );
    if (rows.length === 0) {
      throw new Error("Source Research Job was not found in this Research Run");
    }
    if (rows.length !== 1) throw new Error("research_jobs violated scoped job identity uniqueness");
    return durableJobId;
  }

  async function getResult(researchRunId, resultHandle) {
    const runId = assertResearchRunId(researchRunId);
    const handle = assertResultHandle(resultHandle);
    const rows = await queryRows(
      connection,
      `SELECT ${RESULT_COLUMNS}
       FROM research_results
       WHERE research_run_id = $researchRunId
         AND result_handle = $resultHandle
       LIMIT 2`,
      { researchRunId: runId, resultHandle: handle }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("research_results violated scoped result identity uniqueness");
    return normalizeResult(rows[0]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_RESULT_SCHEMA_VERSION,
    limits: Object.freeze({
      maxPageRows: pageRowsLimit,
      maxPageBytes: pageBytesLimit,
      maxRowBytes: rowBytesLimit,
      maxResultRows: resultRowsLimit,
      maxResultBytes: resultBytesLimit
    }),

    async createResult({
      researchRunId,
      sourceJobId,
      resultKind,
      resultSchemaVersion = 1,
      columns,
      rows,
      provenance = {},
      retention = { mode: "DURABLE" }
    }) {
      const runId = assertResearchRunId(researchRunId);
      const kind = assertResultKind(resultKind);
      const schemaVersion = assertSafeInteger(resultSchemaVersion, "resultSchemaVersion", { min: 1 });
      assertColumns(columns);
      if (!Array.isArray(rows)) throw new TypeError("rows must be an array");
      if (rows.length > resultRowsLimit) {
        throw codedError(
          "RESEARCH_RESULT_ROW_LIMIT",
          `result exceeds configured maximum of ${resultRowsLimit} rows`
        );
      }

      const columnsJson = serializeCanonicalJson(columns, "columns");
      const provenanceJson = serializeCanonicalObject(provenance, "provenance");
      const retentionJson = serializeCanonicalObject(retention, "retention");
      const persistedRows = [];
      let serializedBytes = 2;
      for (let index = 0; index < rows.length; index += 1) {
        const rowJson = serializeCanonicalObject(assertRow(rows[index]), "result row", Number.MAX_SAFE_INTEGER);
        const rowBytes = Buffer.byteLength(rowJson, "utf8");
        if (rowBytes > rowBytesLimit) {
          throw codedError(
            "RESEARCH_RESULT_ROW_BYTES_LIMIT",
            `result row exceeds configured maximum of ${rowBytesLimit} bytes`
          );
        }
        serializedBytes += rowBytes + (index === 0 ? 0 : 1);
        if (serializedBytes > resultBytesLimit) {
          throw codedError(
            "RESEARCH_RESULT_BYTES_LIMIT",
            `result exceeds configured maximum of ${resultBytesLimit} serialized bytes`
          );
        }
        persistedRows.push({
          rowIndex: index,
          rowJson,
          rowBytes,
          rowHash: sha256(rowJson)
        });
      }

      const handle = assertResultHandle(resultHandleFactory());
      const createdAtMs = assertSafeInteger(now(), "now()");
      let result;

      await inTransaction(connection, async () => {
        await requireRun(runId);
        const durableJobId = await requireSourceJob(runId, sourceJobId);
        const metadataHash = metadataFingerprint({
          researchRunId: runId,
          sourceJobId: durableJobId,
          resultKind: kind,
          resultSchemaVersion: schemaVersion,
          columnsJson,
          rowCount: persistedRows.length,
          serializedBytes,
          provenanceJson,
          retentionJson
        });

        await connection.run(
          `INSERT INTO research_results (
             result_handle,
             research_run_id,
             source_job_id,
             result_kind,
             result_schema_version,
             columns_json,
             row_count,
             serialized_bytes,
             provenance_json,
             retention_json,
             metadata_hash,
             created_at_ms
           )
           VALUES (
             $resultHandle,
             $researchRunId,
             $sourceJobId,
             $resultKind,
             $resultSchemaVersion,
             $columnsJson,
             $rowCount,
             $serializedBytes,
             $provenanceJson,
             $retentionJson,
             $metadataHash,
             $createdAtMs
           )`,
          {
            resultHandle: handle,
            researchRunId: runId,
            sourceJobId: durableJobId,
            resultKind: kind,
            resultSchemaVersion: schemaVersion,
            columnsJson,
            rowCount: persistedRows.length,
            serializedBytes,
            provenanceJson,
            retentionJson,
            metadataHash,
            createdAtMs
          }
        );

        for (const persistedRow of persistedRows) {
          await connection.run(
            `INSERT INTO research_result_rows (
               result_handle,
               row_index,
               row_json,
               row_bytes,
               row_hash
             )
             VALUES ($resultHandle, $rowIndex, $rowJson, $rowBytes, $rowHash)`,
            {
              resultHandle: handle,
              ...persistedRow
            }
          );
        }

        result = await getResult(runId, handle);
      });
      return result;
    },

    async getResult(researchRunId, resultHandle) {
      return getResult(researchRunId, resultHandle);
    },

    async getResultPage(researchRunId, resultHandle, { cursor = null, pageSize = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const handle = assertResultHandle(resultHandle);
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > pageRowsLimit) {
        throw new TypeError(`pageSize must be an integer between 1 and ${pageRowsLimit}`);
      }
      const result = await getResult(runId, handle);
      if (!result) throw new Error("Result Handle was not found in this Research Run");
      const offset = decodeCursor(cursor, handle);
      if (offset > result.rowCount) {
        throw codedError("RESEARCH_RESULT_CURSOR_INVALID", "result cursor offset is beyond the result");
      }

      const persisted = await queryRows(
        connection,
        `SELECT row_index, row_json, row_bytes, row_hash
         FROM research_result_rows
         WHERE result_handle = $resultHandle
           AND row_index >= $offset
         ORDER BY row_index ASC
         LIMIT ${pageSize}`,
        { resultHandle: handle, offset }
      );

      const values = [];
      let pageBytes = 2;
      let expectedIndex = offset;
      for (const stored of persisted) {
        const normalized = normalizeStoredRow(stored);
        if (normalized.rowIndex !== expectedIndex) {
          throw new Error("result row ordering persistence is incomplete or non-contiguous");
        }
        const candidateBytes = pageBytes + normalized.rowBytes + (values.length === 0 ? 0 : 1);
        if (candidateBytes > pageBytesLimit) break;
        values.push(normalized.value);
        pageBytes = candidateBytes;
        expectedIndex += 1;
      }

      if (offset < result.rowCount && values.length === 0) {
        throw codedError(
          "RESEARCH_RESULT_ROW_BYTES_LIMIT",
          "next persisted result row cannot fit within configured page byte limit"
        );
      }

      const nextOffset = offset + values.length;
      const truncated = nextOffset < result.rowCount;
      return Object.freeze({
        resultHandle: handle,
        rows: Object.freeze(values),
        totalRows: result.rowCount,
        offset,
        returnedRows: values.length,
        serializedPageBytes: pageBytes,
        truncated,
        nextCursor: truncated ? encodeCursor(handle, nextOffset) : null
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
