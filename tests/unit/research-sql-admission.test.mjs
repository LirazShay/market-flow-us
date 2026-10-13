import assert from "node:assert/strict";
import test from "node:test";

import {
  assertResearchSqlAdmission,
  isResearchSqlForbiddenFunction
} from "../../research-server/research-sql-admission.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";

function assertForbidden(sql) {
  assert.throws(
    () => assertResearchSqlAdmission(sql),
    (error) => error?.code === ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION
  );
}

test("research SQL admission keeps analytical functions and inert text available", () => {
  assert.doesNotThrow(() => assertResearchSqlAdmission(`
    SELECT
      security_id,
      avg(Price) OVER (),
      row_number() OVER (ORDER BY cycle_committed_at_ms),
      json_extract_string(raw_data, '$.ExtraSignal')
    FROM research_history
  `));
  assert.doesNotThrow(() => assertResearchSqlAdmission(`
    SELECT
      'read_csv(../../etc/passwd)' AS inert_path,
      $$query_table('research_history')$$ AS inert_dynamic_sql,
      'pg_settings' AS inert_relation_name
    FROM research_history
    /* duckdb_settings() and pg_settings in a comment are inert */
    -- pg_settings
    LIMIT 1
  `));
  assert.equal(isResearchSqlForbiddenFunction("duckdb_tables"), false);
});

test("research SQL admission rejects external, environment, catalog, connector and secret helpers", () => {
  const calls = [
    "read_csv",
    "read_csv_auto",
    "read_json",
    "read_ndjson_auto",
    "read_parquet",
    "read_text",
    "read_blob",
    "glob",
    "sniff_csv",
    "parquet_scan",
    "parquet_metadata",
    "sqlite_scan",
    "postgres_scan",
    "mysql_scan",
    "iceberg_scan",
    "delta_scan",
    "http_get",
    "getenv",
    "getvariable",
    "current_setting",
    "duckdb_databases",
    "duckdb_settings",
    "duckdb_extensions",
    "duckdb_secrets",
    "duckdb_temporary_files",
    "duckdb_external_file_cache",
    "which_secret",
    "query",
    "query_table",
    "pragma_database_size"
  ];

  for (const name of calls) {
    assert.equal(isResearchSqlForbiddenFunction(name), true, `${name} must be forbidden`);
    assertForbidden(`SELECT * FROM ${name}('blocked')`);
  }
});

test("research SQL admission recognizes quoted and comment-separated forbidden calls without matching comments/strings", () => {
  assertForbidden(`SELECT * FROM "read_csv" /* split trivia */ ('../../etc/passwd')`);
  assertForbidden(`SELECT * FROM query_table /* split trivia */ ('research_history')`);

  assert.doesNotThrow(() => assertResearchSqlAdmission(`
    SELECT 'query_table(' AS text_value
    -- read_csv('../../etc/passwd')
    /* duckdb_databases() */
  `));
});

test("research SQL admission rejects PostgreSQL-compatible settings relations in plain, qualified and quoted forms", () => {
  assertForbidden("SELECT name, setting FROM pg_settings");
  assertForbidden("SELECT name, setting FROM pg_catalog.pg_settings");
  assertForbidden('SELECT name, setting FROM "pg_catalog"."pg_settings"');
  assertForbidden(`
    SELECT name, setting
    FROM pg_catalog /* trivia */ . /* more trivia */ pg_settings
  `);

  assert.doesNotThrow(() => assertResearchSqlAdmission(`
    SELECT
      'pg_catalog.pg_settings' AS inert_text,
      $$pg_settings$$ AS inert_dollar_text
    FROM research_history
    /* FROM pg_settings */
    -- JOIN pg_catalog.pg_settings
  `));
});
