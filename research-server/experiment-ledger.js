import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";
import { RESEARCH_EVIDENCE_SCHEMA_VERSION } from "./evidence-ledger.js";

export const RESEARCH_EXPERIMENT_SCHEMA_VERSION = 1;

const EXPERIMENT_PHASES = new Set(["DEVELOPMENT", "VALIDATION"]);
const BASE_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
  "research_ledger_info",
  "research_runs",
  "evidence_plans",
  "partitions",
  "research_evidence_info"
]);
const EXPERIMENT_TABLES = Object.freeze([
  "experiment_records",
  "research_experiment_info"
]);

const CREATE_RESEARCH_EXPERIMENT_INFO = `
CREATE TABLE research_experiment_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_EXPERIMENT_RECORDS = `
CREATE TABLE experiment_records (
  experiment_id VARCHAR PRIMARY KEY,
  metric_set_id VARCHAR UNIQUE NOT NULL,
  research_run_id VARCHAR NOT NULL,
  objective_version_id VARCHAR NOT NULL,
  partition_id VARCHAR NOT NULL,
  phase VARCHAR NOT NULL,
  request_fingerprint VARCHAR NOT NULL,
  request_json VARCHAR NOT NULL,
  metrics_json VARCHAR NOT NULL,
  metrics_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;

const EXPERIMENT_COLUMNS = `
experiment_id,
metric_set_id,
research_run_id,
objective_version_id,
partition_id,
phase,
request_fingerprint,
request_json,
metrics_json,
metrics_hash,
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

function assertSafeTimestamp(value, label) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return timestamp;
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

function assertPartitionId(value) {
  if (typeof value !== "string" || !/^part_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("partitionId must be a part_ prefixed UUID");
  }
  return value;
}

function assertQueryArtifactId(value) {
  if (typeof value !== "string" || !/^qry_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("queryArtifactId must be a qry_ prefixed UUID");
  }
  return value;
}

function assertExperimentId(value) {
  if (typeof value !== "string" || !/^exp_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("experimentId must be an exp_ prefixed UUID");
  }
  return value;
}

function assertMetricSetId(value) {
  if (typeof value !== "string" || !/^metrics_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("metricSetId must be a metrics_ prefixed UUID");
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 value`);
  }
  return value;
}

function assertPhase(value) {
  if (!EXPERIMENT_PHASES.has(value)) {
    throw new TypeError("experiment phase must be DEVELOPMENT or VALIDATION");
  }
  return value;
}

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

function serializeJsonObject(value, label, maxChars = 262_144) {
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
  if (typeof value !== "string") throw new Error(`${label} persistence is invalid`);
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

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestFingerprint(request) {
  const {
    requestFingerprint: ignored,
    ...payload
  } = request;
  return sha256(JSON.stringify(payload));
}

function partitionRoleForPhase(phase) {
  return phase === "DEVELOPMENT" ? "DEVELOPMENT" : "VALIDATION";
}

async function validateBaseLedger(connection) {
  const present = new Set(await tableNames(connection));
  const missing = BASE_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research experiment ledger requires prerequisite tables: ${missing.join(", ")}`);
  }

  const baseInfo = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (baseInfo.length !== 1 || Number(baseInfo[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research experiment ledger base schema version is unsupported");
  }
  const evidenceInfo = await queryRows(connection, "SELECT schema_version FROM research_evidence_info");
  if (
    evidenceInfo.length !== 1
    || Number(evidenceInfo[0].schema_version) !== RESEARCH_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new Error("Research experiment ledger evidence schema version is unsupported");
  }
}

async function bootstrapOrValidateExperiments(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const presentExperiment = EXPERIMENT_TABLES.filter((table) => present.has(table));

  if (presentExperiment.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_EXPERIMENT_INFO);
      await connection.run(CREATE_EXPERIMENT_RECORDS);
      await connection.run(
        `INSERT INTO research_experiment_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        {
          schemaVersion: RESEARCH_EXPERIMENT_SCHEMA_VERSION,
          createdAtMs
        }
      );
    });
    return;
  }

  const missing = EXPERIMENT_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research experiment ledger is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_experiment_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_EXPERIMENT_SCHEMA_VERSION) {
    throw new Error("Research experiment ledger schema version is unsupported");
  }
}

function normalizeExperiment(row) {
  const experimentId = assertExperimentId(String(row.experiment_id));
  const metricSetId = assertMetricSetId(String(row.metric_set_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const objectiveVersionId = assertObjectiveVersionId(String(row.objective_version_id));
  const partitionId = assertPartitionId(String(row.partition_id));
  const phase = assertPhase(String(row.phase));
  const persistedFingerprint = assertSha256(String(row.request_fingerprint), "requestFingerprint");
  const request = parseJsonObject(String(row.request_json), "experiment request");
  if (requestFingerprint(request) !== persistedFingerprint || request.requestFingerprint !== persistedFingerprint) {
    throw new Error("experiment request fingerprint does not match persisted content");
  }
  if (
    request.researchRunId !== researchRunId
    || request.objectiveVersionId !== objectiveVersionId
    || request.evidencePartitionId !== partitionId
    || request.phase !== phase
  ) {
    throw new Error("experiment request identity does not match persisted columns");
  }

  const metricsJson = String(row.metrics_json);
  const metricsHash = assertSha256(String(row.metrics_hash), "metricsHash");
  if (sha256(metricsJson) !== metricsHash) {
    throw new Error("experiment metrics hash does not match persisted content");
  }
  const metrics = parseJsonObject(metricsJson, "experiment metrics");
  if (metrics.requestFingerprint !== persistedFingerprint) {
    throw new Error("experiment metrics do not match the request fingerprint");
  }

  return Object.freeze({
    experimentId,
    metricSetId,
    researchRunId,
    objectiveVersionId,
    partitionId,
    phase,
    requestFingerprint: persistedFingerprint,
    request: Object.freeze(request),
    metrics: Object.freeze(metrics),
    metricsHash,
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

export async function openResearchExperimentLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  experimentIdFactory = () => `exp_${randomUUID()}`,
  metricSetIdFactory = () => `metrics_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  for (const [label, factory] of [
    ["now", now],
    ["experimentIdFactory", experimentIdFactory],
    ["metricSetIdFactory", metricSetIdFactory]
  ]) {
    if (typeof factory !== "function") throw new TypeError(`${label} must be a function`);
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const createdAtMs = assertSafeTimestamp(now(), "now()");
    await validateBaseLedger(connection);
    await bootstrapOrValidateExperiments(connection, createdAtMs);
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
      "SELECT research_run_id FROM research_runs WHERE research_run_id = $researchRunId LIMIT 2",
      { researchRunId: runId }
    );
    if (rows.length !== 1) throw new Error("Research Run was not found");
    return runId;
  }

  async function requireObjective(researchRunId, objectiveVersionId) {
    const objectiveId = assertObjectiveVersionId(objectiveVersionId);
    const rows = await queryRows(
      connection,
      `SELECT objective_version_id
       FROM objective_versions
       WHERE research_run_id = $researchRunId
         AND objective_version_id = $objectiveVersionId
       LIMIT 2`,
      { researchRunId, objectiveVersionId: objectiveId }
    );
    if (rows.length !== 1) throw new Error("Objective Version was not found in this Research Run");
    return objectiveId;
  }

  async function requirePartition(researchRunId, partitionId, objectiveVersionId, phase) {
    const boundedPartitionId = assertPartitionId(partitionId);
    const rows = await queryRows(
      connection,
      `SELECT p.partition_id, p.role, ep.objective_version_id
       FROM partitions p
       INNER JOIN evidence_plans ep ON ep.evidence_plan_id = p.evidence_plan_id
       WHERE p.research_run_id = $researchRunId
         AND p.partition_id = $partitionId
         AND ep.research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId, partitionId: boundedPartitionId }
    );
    if (rows.length !== 1) throw new Error("Partition was not found in this Research Run");
    if (String(rows[0].objective_version_id) !== objectiveVersionId) {
      throw new Error("Partition Evidence Plan does not match the Experiment Objective Version");
    }
    if (String(rows[0].role) !== partitionRoleForPhase(phase)) {
      throw new Error("Experiment phase does not match the evidence partition role");
    }
    return boundedPartitionId;
  }

  async function requireQueryProvenance(researchRunId, queryArtifacts) {
    if (!Array.isArray(queryArtifacts) || queryArtifacts.length < 1 || queryArtifacts.length > 3) {
      throw new TypeError("experiment request must reference one to three Query Artifacts");
    }
    const seen = new Set();
    for (const reference of queryArtifacts) {
      if (reference === null || typeof reference !== "object" || Array.isArray(reference)) {
        throw new TypeError("experiment Query Artifact reference is invalid");
      }
      const queryArtifactId = assertQueryArtifactId(reference.queryArtifactId);
      if (seen.has(queryArtifactId)) throw new TypeError("experiment Query Artifact references must be unique");
      seen.add(queryArtifactId);
      const sqlHash = assertSha256(reference.sqlHash, "query artifact sqlHash");
      const rows = await queryRows(
        connection,
        `SELECT sql_hash, scanner_contract_version
         FROM query_artifacts
         WHERE research_run_id = $researchRunId
           AND query_artifact_id = $queryArtifactId
         LIMIT 2`,
        { researchRunId, queryArtifactId }
      );
      if (rows.length !== 1) throw new Error("Query Artifact was not found in this Research Run");
      if (
        String(rows[0].sql_hash) !== sqlHash
        || String(rows[0].scanner_contract_version) !== reference.scannerContractVersion
      ) {
        throw new Error("Experiment Query Artifact provenance does not match the durable artifact");
      }
    }
  }

  async function touchRun(researchRunId, timestamp) {
    await connection.run(
      `UPDATE research_runs
       SET updated_at_ms = $updatedAtMs
       WHERE research_run_id = $researchRunId`,
      { researchRunId, updatedAtMs: timestamp }
    );
  }

  async function getExperiment(researchRunId, experimentId) {
    const runId = assertResearchRunId(researchRunId);
    const boundedExperimentId = assertExperimentId(experimentId);
    const rows = await queryRows(
      connection,
      `SELECT ${EXPERIMENT_COLUMNS}
       FROM experiment_records
       WHERE research_run_id = $researchRunId
         AND experiment_id = $experimentId
       LIMIT 2`,
      { researchRunId: runId, experimentId: boundedExperimentId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("experiment scoped identity is invalid");
    return normalizeExperiment(rows[0]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_EXPERIMENT_SCHEMA_VERSION,

    async recordCompletedExperiment({ researchRunId, request, metrics }) {
      const runId = await requireRun(researchRunId);
      const requestJson = serializeJsonObject(request, "experiment request");
      const parsedRequest = parseJsonObject(requestJson, "experiment request");
      if (parsedRequest.researchRunId !== runId) {
        throw new Error("Experiment request Research Run does not match the target Research Run");
      }
      const objectiveVersionId = await requireObjective(runId, parsedRequest.objectiveVersionId);
      const phase = assertPhase(parsedRequest.phase);
      const partitionId = await requirePartition(
        runId,
        parsedRequest.evidencePartitionId,
        objectiveVersionId,
        phase
      );
      const fingerprint = assertSha256(parsedRequest.requestFingerprint, "requestFingerprint");
      if (requestFingerprint(parsedRequest) !== fingerprint) {
        throw new Error("Experiment request fingerprint does not match request content");
      }
      await requireQueryProvenance(runId, parsedRequest.queryArtifacts);

      const metricsJson = serializeJsonObject(metrics, "experiment metrics");
      const parsedMetrics = parseJsonObject(metricsJson, "experiment metrics");
      if (parsedMetrics.requestFingerprint !== fingerprint) {
        throw new Error("Experiment metrics do not match the request fingerprint");
      }

      const experimentId = assertExperimentId(experimentIdFactory());
      const metricSetId = assertMetricSetId(metricSetIdFactory());
      const metricsHash = sha256(metricsJson);
      const timestamp = assertSafeTimestamp(now(), "now()");

      await inTransaction(connection, async () => {
        await connection.run(
          `INSERT INTO experiment_records (
             experiment_id, metric_set_id, research_run_id, objective_version_id,
             partition_id, phase, request_fingerprint, request_json,
             metrics_json, metrics_hash, created_at_ms
           ) VALUES (
             $experimentId, $metricSetId, $researchRunId, $objectiveVersionId,
             $partitionId, $phase, $requestFingerprint, $requestJson,
             $metricsJson, $metricsHash, $createdAtMs
           )`,
          {
            experimentId,
            metricSetId,
            researchRunId: runId,
            objectiveVersionId,
            partitionId,
            phase,
            requestFingerprint: fingerprint,
            requestJson,
            metricsJson,
            metricsHash,
            createdAtMs: timestamp
          }
        );
        await touchRun(runId, timestamp);
      });

      return await getExperiment(runId, experimentId);
    },

    async getExperiment(researchRunId, experimentId) {
      return await getExperiment(researchRunId, experimentId);
    },

    async listExperiments(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${EXPERIMENT_COLUMNS}
         FROM experiment_records
         WHERE research_run_id = $researchRunId
         ORDER BY created_at_ms ASC, experiment_id ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeExperiment));
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
