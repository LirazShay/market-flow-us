import { DUCKDB_HARDENING } from "../local-service/database/database.js";
import {
  extractScannerFunctionCalls,
  extractScannerIdentifiers
} from "../local-service/scanner/scanner.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../shared/protocol/index.js";

const EXPLICIT_FORBIDDEN_FUNCTIONS = new Set([
  "current_setting",
  "duckdb_databases",
  "duckdb_extensions",
  "duckdb_external_file_cache",
  "duckdb_secrets",
  "duckdb_settings",
  "duckdb_temporary_files",
  "getenv",
  "getvariable",
  "glob",
  "query",
  "query_table",
  "sniff_csv",
  "which_secret"
]);

const FORBIDDEN_IDENTIFIERS = new Set([
  "pg_settings"
]);

const FORBIDDEN_FUNCTION_PATTERNS = Object.freeze([
  /^read_(?:blob|csv|json|ndjson|parquet|text|xlsx)(?:_auto)?$/u,
  /^parquet_(?:file_metadata|kv_metadata|metadata|scan|schema)$/u,
  /^(?:arrow|delta|iceberg|mysql|odbc|postgres|sqlite)_/u,
  /^http_/u,
  /^pragma_/u,
  /(?:^|_)secret(?:s|_.*)?$/u,
  /^(?:extension_(?:install|load)|(?:install|load)_extension)$/u
]);

const EXPECTED_HARDENING = Object.freeze({
  ...DUCKDB_HARDENING,
  allowed_configs: "[]",
  lock_configuration: "true"
});

function forbiddenFunctionError() {
  return new ProtocolValidationError(ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION);
}

function normalizeSettingValue(value) {
  return String(value).trim().toLowerCase();
}

export function isResearchSqlForbiddenFunction(name) {
  if (typeof name !== "string") return false;
  const normalized = name.toLowerCase();
  return EXPLICIT_FORBIDDEN_FUNCTIONS.has(normalized)
    || FORBIDDEN_FUNCTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assertResearchSqlAdmission(sql) {
  const calls = extractScannerFunctionCalls(sql);
  if (calls.some((name) => isResearchSqlForbiddenFunction(name))) {
    throw forbiddenFunctionError();
  }
  const identifiers = extractScannerIdentifiers(sql);
  if (identifiers.some((name) => FORBIDDEN_IDENTIFIERS.has(name))) {
    throw forbiddenFunctionError();
  }
  return Object.freeze(calls);
}

export function createResearchSqlExecute({ execute } = {}) {
  if (typeof execute !== "function") {
    throw new TypeError("research SQL execute function is required");
  }
  return async function executeResearchSql(sql) {
    assertResearchSqlAdmission(sql);
    return await execute(sql);
  };
}

export async function verifyResearchSqlSandboxHardening({ execute } = {}) {
  if (typeof execute !== "function") {
    throw new TypeError("research SQL execute function is required");
  }

  const columns = Object.keys(EXPECTED_HARDENING);
  const projections = columns.map(
    (name) => `CAST(current_setting('${name}') AS VARCHAR) AS "${name}"`
  );
  const result = await execute(`SELECT ${projections.join(", ")}`);
  if (result.rowCount !== 1) {
    throw new Error("Research SQL sandbox hardening verification returned an unexpected row count");
  }

  const indexes = new Map(result.columns.map((column, index) => [column.name, index]));
  for (const [name, expected] of Object.entries(EXPECTED_HARDENING)) {
    const index = indexes.get(name);
    if (index === undefined) {
      throw new Error(`Research SQL sandbox hardening verification omitted ${name}`);
    }
    const actual = normalizeSettingValue(result.rows[0][index]);
    if (actual !== normalizeSettingValue(expected)) {
      throw new Error(`Research SQL sandbox hardening verification failed for ${name}`);
    }
  }

  return Object.freeze({
    verified: true,
    settings: Object.freeze({ ...EXPECTED_HARDENING })
  });
}
