import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";

export const DEFAULT_RESEARCH_LEDGER_PATH = "data/research-ledger.duckdb";
export const RESEARCH_LEDGER_SCHEMA_VERSION = 1;
export const RESEARCH_LEDGER_DUCKDB_HARDENING = Object.freeze({
  ...DUCKDB_HARDENING
});

const RESEARCH_RUN_STATUSES = new Set(["ACTIVE", "PAUSED", "COMPLETED", "FAILED"]);
const RESEARCH_PHASES = new Set(["DEVELOPMENT", "VALIDATION", "HOLDOUT", "FINALIZATION"]);
const REQUIRED_TABLES = Object.freeze([
  "research_ledger_info",
  "research_runs"
]);

const CREATE_RESEARCH_LEDGER_INFO = `
CREATE TABLE research_ledger_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RESEARCH_RUNS = `
CREATE TABLE research_runs (
  research_run_id VARCHAR PRIMARY KEY,
  user_intent VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  current_phase VARCHAR NOT NULL,
  budget_policy_json VARCHAR NOT NULL,
  environment_snapshot_json VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
)`;

const INSERT_RESEARCH_RUN = `
INSERT INTO research_runs (
  research_run_id,
  user_intent,
  status,
  current_phase,
  budget_policy_json,
  environment_snapshot_json,
  created_at_ms,
  updated_at_ms
)
VALUES (
  $researchRunId,
  $userIntent,
  $status,
  $currentPhase,
  $budgetPolicyJson,
  $environmentSnapshotJson,
  $createdAtMs,
  $updatedAtMs
)`;

const RUN_COLUMNS = `
research_run_id,
user_intent,
status,
current_phase,
budget_policy_json,
environment_snapshot_json,
created_at_ms,
updated_at_ms`;

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

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = await tableNames(connection);

  if (present.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_LEDGER_INFO);
      await connection.run(CREATE_RESEARCH_RUNS);
      await connection.run(
        `INSERT INTO research_ledger_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        {
          schemaVersion: RESEARCH_LEDGER_SCHEMA_VERSION,
          createdAtMs
        }
      );
    });
    return;
  }

  const presentSet = new Set(present);
  const missing = REQUIRED_TABLES.filter((table) => !presentSet.has(table));
  if (missing.length > 0) {
    throw new Error(`Research ledger is missing required tables: ${missing.join(", ")}`);
  }

  const info = await queryRows(
    connection,
    "SELECT schema_version FROM research_ledger_info"
  );
  if (info.length !== 1) {
    throw new Error("Research ledger must contain exactly one schema version row");
  }

  const schemaVersion = Number(info[0].schema_version);
  if (schemaVersion !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported research ledger schema version ${schemaVersion}; expected ${RESEARCH_LEDGER_SCHEMA_VERSION}`
    );
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

function assertSafeTimestamp(value, label) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return timestamp;
}

function assertBoundedString(value, { label, maxChars }) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > maxChars
  ) {
    throw new TypeError(`${label} must be a non-empty trimmed string of at most ${maxChars} characters`);
  }
  return value;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertStatus(value) {
  if (!RESEARCH_RUN_STATUSES.has(value)) {
    throw new TypeError("status is not a supported Research Run status");
  }
  return value;
}

function assertPhase(value) {
  if (!RESEARCH_PHASES.has(value)) {
    throw new TypeError("currentPhase is not a supported research phase");
  }
  return value;
}

function serializeJsonObject(value, label, maxChars = 16_384) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must be JSON serializable`);
  }

  if (serialized === undefined || serialized.length > maxChars) {
    throw new TypeError(`${label} must serialize to at most ${maxChars} characters`);
  }
  return serialized;
}

function parseJsonObject(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} persistence is invalid`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} persistence is invalid`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return parsed;
}

function normalizeRun(row) {
  return Object.freeze({
    researchRunId: assertResearchRunId(String(row.research_run_id)),
    userIntent: assertBoundedString(String(row.user_intent), {
      label: "userIntent",
      maxChars: 8_192
    }),
    status: assertStatus(String(row.status)),
    currentPhase: assertPhase(String(row.current_phase)),
    budgetPolicy: parseJsonObject(row.budget_policy_json, "budgetPolicy"),
    environmentSnapshot: parseJsonObject(row.environment_snapshot_json, "environmentSnapshot"),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs"),
    updatedAtMs: assertSafeTimestamp(row.updated_at_ms, "updatedAtMs")
  });
}

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

export async function openResearchLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  idFactory = () => `run_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof idFactory !== "function") {
    throw new TypeError("idFactory must be a function");
  }

  await ensureParentDirectory(dbPath);

  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const createdAtMs = assertSafeTimestamp(now(), "now()");
    await bootstrapOrValidate(connection, createdAtMs);
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  async function getOne(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    const rows = await queryRows(
      connection,
      `SELECT ${RUN_COLUMNS}
       FROM research_runs
       WHERE research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("research_runs violated research_run_id uniqueness");
    }
    return normalizeRun(rows[0]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_LEDGER_SCHEMA_VERSION,

    async createResearchRun({
      userIntent,
      currentPhase = "DEVELOPMENT",
      budgetPolicy = {},
      environmentSnapshot = {}
    }) {
      const intent = assertBoundedString(userIntent, {
        label: "userIntent",
        maxChars: 8_192
      });
      const phase = assertPhase(currentPhase);
      const budgetPolicyJson = serializeJsonObject(budgetPolicy, "budgetPolicy");
      const environmentSnapshotJson = serializeJsonObject(
        environmentSnapshot,
        "environmentSnapshot"
      );
      const researchRunId = assertResearchRunId(idFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");

      await connection.run(INSERT_RESEARCH_RUN, {
        researchRunId,
        userIntent: intent,
        status: "ACTIVE",
        currentPhase: phase,
        budgetPolicyJson,
        environmentSnapshotJson,
        createdAtMs: timestamp,
        updatedAtMs: timestamp
      });

      return Object.freeze({
        researchRunId,
        userIntent: intent,
        status: "ACTIVE",
        currentPhase: phase,
        budgetPolicy: parseJsonObject(budgetPolicyJson, "budgetPolicy"),
        environmentSnapshot: parseJsonObject(environmentSnapshotJson, "environmentSnapshot"),
        createdAtMs: timestamp,
        updatedAtMs: timestamp
      });
    },

    async getResearchRun(researchRunId) {
      return getOne(researchRunId);
    },

    async listResearchRuns({ limit = 50 } = {}) {
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${RUN_COLUMNS}
         FROM research_runs
         ORDER BY updated_at_ms DESC, research_run_id ASC
         LIMIT ${boundedLimit}`
      );
      return Object.freeze(rows.map(normalizeRun));
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
