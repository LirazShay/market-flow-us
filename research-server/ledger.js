import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";

export const DEFAULT_RESEARCH_LEDGER_PATH = "data/research-ledger.duckdb";
export const RESEARCH_LEDGER_SCHEMA_VERSION = 1;
export const RESEARCH_LEDGER_DUCKDB_HARDENING = Object.freeze({
  ...DUCKDB_HARDENING
});

const MAX_QUERY_SQL_BYTES = 1024 * 1024;
const RESEARCH_RUN_STATUSES = new Set(["ACTIVE", "PAUSED", "COMPLETED", "FAILED"]);
const RESEARCH_PHASES = new Set(["DEVELOPMENT", "VALIDATION", "HOLDOUT", "FINALIZATION"]);
const REQUIRED_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
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

const CREATE_OBJECTIVE_VERSIONS = `
CREATE TABLE objective_versions (
  objective_version_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  version_number INTEGER NOT NULL,
  created_at_ms BIGINT NOT NULL,
  interpretation_text VARCHAR NOT NULL,
  objective_json VARCHAR NOT NULL,
  objective_hash VARCHAR NOT NULL,
  UNIQUE (research_run_id, version_number)
)`;

const CREATE_QUERY_ARTIFACTS = `
CREATE TABLE query_artifacts (
  query_artifact_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  parent_query_artifact_id VARCHAR,
  created_at_ms BIGINT NOT NULL,
  sql_text VARCHAR NOT NULL,
  sql_hash VARCHAR NOT NULL,
  scanner_contract_version VARCHAR NOT NULL,
  label VARCHAR,
  hypothesis_text VARCHAR
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

const INSERT_OBJECTIVE_VERSION = `
INSERT INTO objective_versions (
  objective_version_id,
  research_run_id,
  version_number,
  created_at_ms,
  interpretation_text,
  objective_json,
  objective_hash
)
VALUES (
  $objectiveVersionId,
  $researchRunId,
  $versionNumber,
  $createdAtMs,
  $interpretationText,
  $objectiveJson,
  $objectiveHash
)`;

const INSERT_QUERY_ARTIFACT = `
INSERT INTO query_artifacts (
  query_artifact_id,
  research_run_id,
  parent_query_artifact_id,
  created_at_ms,
  sql_text,
  sql_hash,
  scanner_contract_version,
  label,
  hypothesis_text
)
VALUES (
  $queryArtifactId,
  $researchRunId,
  $parentQueryArtifactId,
  $createdAtMs,
  $sqlText,
  $sqlHash,
  $scannerContractVersion,
  $label,
  $hypothesisText
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

const OBJECTIVE_COLUMNS = `
objective_version_id,
research_run_id,
version_number,
created_at_ms,
interpretation_text,
objective_json,
objective_hash`;

const QUERY_ARTIFACT_COLUMNS = `
query_artifact_id,
research_run_id,
parent_query_artifact_id,
created_at_ms,
sql_text,
sql_hash,
scanner_contract_version,
label,
hypothesis_text`;

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
      await connection.run(CREATE_OBJECTIVE_VERSIONS);
      await connection.run(CREATE_QUERY_ARTIFACTS);
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

function assertPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
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

function optionalBoundedString(value, { label, maxChars }) {
  if (value === null || value === undefined) return null;
  return assertBoundedString(value, { label, maxChars });
}

function assertExactSqlText(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || Buffer.byteLength(value, "utf8") > MAX_QUERY_SQL_BYTES
  ) {
    throw new TypeError(`sqlText must be non-empty UTF-8 text of at most ${MAX_QUERY_SQL_BYTES} bytes`);
  }
  return value;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertObjectiveVersionId(value) {
  if (typeof value !== "string" || !/^obj_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("objectiveVersionId must be an obj_ prefixed UUID");
  }
  return value;
}

function assertQueryArtifactId(value) {
  if (typeof value !== "string" || !/^qry_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("queryArtifactId must be a qry_ prefixed UUID");
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function objectiveFingerprint(interpretationText, objectiveJson) {
  return sha256(JSON.stringify({ interpretationText, objectiveJson }));
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

function normalizeObjectiveVersion(row) {
  const objectiveVersionId = assertObjectiveVersionId(String(row.objective_version_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const versionNumber = assertPositiveInteger(row.version_number, "versionNumber");
  const interpretationText = assertBoundedString(String(row.interpretation_text), {
    label: "interpretationText",
    maxChars: 8_192
  });
  const objectiveJson = String(row.objective_json);
  const objective = parseJsonObject(objectiveJson, "objective");
  const objectiveHash = assertSha256(String(row.objective_hash), "objectiveHash");
  if (objectiveHash !== objectiveFingerprint(interpretationText, objectiveJson)) {
    throw new Error("objective version hash does not match persisted content");
  }

  return Object.freeze({
    objectiveVersionId,
    researchRunId,
    versionNumber,
    interpretationText,
    objective,
    objectiveHash,
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

function normalizeQueryArtifact(row) {
  const queryArtifactId = assertQueryArtifactId(String(row.query_artifact_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const parentQueryArtifactId = row.parent_query_artifact_id === null
    ? null
    : assertQueryArtifactId(String(row.parent_query_artifact_id));
  const sqlText = assertExactSqlText(String(row.sql_text));
  const sqlHash = assertSha256(String(row.sql_hash), "sqlHash");
  if (sqlHash !== sha256(sqlText)) {
    throw new Error("query artifact hash does not match persisted SQL");
  }

  return Object.freeze({
    queryArtifactId,
    researchRunId,
    parentQueryArtifactId,
    sqlText,
    sqlHash,
    scannerContractVersion: assertBoundedString(String(row.scanner_contract_version), {
      label: "scannerContractVersion",
      maxChars: 128
    }),
    label: optionalBoundedString(row.label, { label: "label", maxChars: 256 }),
    hypothesisText: optionalBoundedString(row.hypothesis_text, {
      label: "hypothesisText",
      maxChars: 4_096
    }),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
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
  idFactory = () => `run_${randomUUID()}`,
  objectiveVersionIdFactory = () => `obj_${randomUUID()}`,
  queryArtifactIdFactory = () => `qry_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  for (const [label, factory] of [
    ["idFactory", idFactory],
    ["objectiveVersionIdFactory", objectiveVersionIdFactory],
    ["queryArtifactIdFactory", queryArtifactIdFactory]
  ]) {
    if (typeof factory !== "function") {
      throw new TypeError(`${label} must be a function`);
    }
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

  async function getRun(researchRunId) {
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

  async function requireRun(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    if (!(await getRun(runId))) {
      throw new Error("Research Run was not found");
    }
    return runId;
  }

  async function getObjectiveVersion(researchRunId, objectiveVersionId) {
    const runId = assertResearchRunId(researchRunId);
    const versionId = assertObjectiveVersionId(objectiveVersionId);
    const rows = await queryRows(
      connection,
      `SELECT ${OBJECTIVE_COLUMNS}
       FROM objective_versions
       WHERE research_run_id = $researchRunId
         AND objective_version_id = $objectiveVersionId
       LIMIT 2`,
      {
        researchRunId: runId,
        objectiveVersionId: versionId
      }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("objective_versions violated scoped identity uniqueness");
    }
    return normalizeObjectiveVersion(rows[0]);
  }

  async function getQueryArtifact(researchRunId, queryArtifactId) {
    const runId = assertResearchRunId(researchRunId);
    const artifactId = assertQueryArtifactId(queryArtifactId);
    const rows = await queryRows(
      connection,
      `SELECT ${QUERY_ARTIFACT_COLUMNS}
       FROM query_artifacts
       WHERE research_run_id = $researchRunId
         AND query_artifact_id = $queryArtifactId
       LIMIT 2`,
      {
        researchRunId: runId,
        queryArtifactId: artifactId
      }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error("query_artifacts violated scoped identity uniqueness");
    }
    return normalizeQueryArtifact(rows[0]);
  }

  async function touchRun(researchRunId, timestamp) {
    await connection.run(
      `UPDATE research_runs
       SET updated_at_ms = $updatedAtMs
       WHERE research_run_id = $researchRunId`,
      {
        researchRunId,
        updatedAtMs: timestamp
      }
    );
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
      return getRun(researchRunId);
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

    async createObjectiveVersion({
      researchRunId,
      interpretationText,
      objective
    }) {
      const runId = assertResearchRunId(researchRunId);
      const interpretation = assertBoundedString(interpretationText, {
        label: "interpretationText",
        maxChars: 8_192
      });
      const objectiveJson = serializeJsonObject(objective, "objective", 32_768);
      const objectiveVersionId = assertObjectiveVersionId(objectiveVersionIdFactory());
      const objectiveHash = objectiveFingerprint(interpretation, objectiveJson);
      const timestamp = assertSafeTimestamp(now(), "now()");
      let versionNumber;

      await inTransaction(connection, async () => {
        await requireRun(runId);
        const rows = await queryRows(
          connection,
          `SELECT COALESCE(MAX(version_number), 0) AS max_version
           FROM objective_versions
           WHERE research_run_id = $researchRunId`,
          { researchRunId: runId }
        );
        if (rows.length !== 1) {
          throw new Error("objective version sequence query returned invalid cardinality");
        }
        versionNumber = assertSafeTimestamp(rows[0].max_version, "max objective version") + 1;
        await connection.run(INSERT_OBJECTIVE_VERSION, {
          objectiveVersionId,
          researchRunId: runId,
          versionNumber,
          createdAtMs: timestamp,
          interpretationText: interpretation,
          objectiveJson,
          objectiveHash
        });
        await touchRun(runId, timestamp);
      });

      return Object.freeze({
        objectiveVersionId,
        researchRunId: runId,
        versionNumber,
        interpretationText: interpretation,
        objective: parseJsonObject(objectiveJson, "objective"),
        objectiveHash,
        createdAtMs: timestamp
      });
    },

    async getObjectiveVersion(researchRunId, objectiveVersionId) {
      return getObjectiveVersion(researchRunId, objectiveVersionId);
    },

    async getCurrentObjectiveVersion(researchRunId) {
      const runId = await requireRun(researchRunId);
      const rows = await queryRows(
        connection,
        `SELECT ${OBJECTIVE_COLUMNS}
         FROM objective_versions
         WHERE research_run_id = $researchRunId
         ORDER BY version_number DESC
         LIMIT 1`,
        { researchRunId: runId }
      );
      return rows.length === 0 ? null : normalizeObjectiveVersion(rows[0]);
    },

    async listObjectiveVersions(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${OBJECTIVE_COLUMNS}
         FROM objective_versions
         WHERE research_run_id = $researchRunId
         ORDER BY version_number ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeObjectiveVersion));
    },

    async createQueryArtifact({
      researchRunId,
      sqlText,
      scannerContractVersion,
      parentQueryArtifactId = null,
      label = null,
      hypothesisText = null
    }) {
      const runId = assertResearchRunId(researchRunId);
      const sql = assertExactSqlText(sqlText);
      const contractVersion = assertBoundedString(scannerContractVersion, {
        label: "scannerContractVersion",
        maxChars: 128
      });
      const parentId = parentQueryArtifactId === null
        ? null
        : assertQueryArtifactId(parentQueryArtifactId);
      const boundedLabel = optionalBoundedString(label, { label: "label", maxChars: 256 });
      const boundedHypothesis = optionalBoundedString(hypothesisText, {
        label: "hypothesisText",
        maxChars: 4_096
      });
      const queryArtifactId = assertQueryArtifactId(queryArtifactIdFactory());
      const sqlHash = sha256(sql);
      const timestamp = assertSafeTimestamp(now(), "now()");

      await inTransaction(connection, async () => {
        await requireRun(runId);
        if (parentId !== null && !(await getQueryArtifact(runId, parentId))) {
          throw new Error("Parent query artifact was not found in this Research Run");
        }
        await connection.run(INSERT_QUERY_ARTIFACT, {
          queryArtifactId,
          researchRunId: runId,
          parentQueryArtifactId: parentId,
          createdAtMs: timestamp,
          sqlText: sql,
          sqlHash,
          scannerContractVersion: contractVersion,
          label: boundedLabel,
          hypothesisText: boundedHypothesis
        });
        await touchRun(runId, timestamp);
      });

      return Object.freeze({
        queryArtifactId,
        researchRunId: runId,
        parentQueryArtifactId: parentId,
        sqlText: sql,
        sqlHash,
        scannerContractVersion: contractVersion,
        label: boundedLabel,
        hypothesisText: boundedHypothesis,
        createdAtMs: timestamp
      });
    },

    async getQueryArtifact(researchRunId, queryArtifactId) {
      return getQueryArtifact(researchRunId, queryArtifactId);
    },

    async listQueryArtifacts(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${QUERY_ARTIFACT_COLUMNS}
         FROM query_artifacts
         WHERE research_run_id = $researchRunId
         ORDER BY created_at_ms ASC, query_artifact_id ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeQueryArtifact));
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
