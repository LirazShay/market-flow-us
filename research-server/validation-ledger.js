import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  RESEARCH_EVIDENCE_SCHEMA_VERSION
} from "./evidence-ledger.js";
import {
  RESEARCH_EXPERIMENT_SCHEMA_VERSION
} from "./experiment-ledger.js";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";
import {
  HOLDOUT_FINAL_CAPABILITY,
  authorizeSealedHoldout,
  freezeFinalistSet,
  freezeValidationExposure
} from "./validation-authority-core.js";

export const RESEARCH_VALIDATION_SCHEMA_VERSION = 1;

const REQUIRED_TABLES = Object.freeze([
  "research_ledger_info",
  "research_runs",
  "objective_versions",
  "query_artifacts",
  "research_evidence_info",
  "evidence_plans",
  "partitions",
  "research_experiment_info",
  "experiment_records"
]);
const VALIDATION_TABLES = Object.freeze([
  "research_validation_info",
  "validation_exposures",
  "finalist_sets"
]);

const CREATE_RESEARCH_VALIDATION_INFO = `
CREATE TABLE research_validation_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_VALIDATION_EXPOSURES = `
CREATE TABLE validation_exposures (
  validation_exposure_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  experiment_id VARCHAR NOT NULL,
  exposure_index INTEGER NOT NULL,
  exposure_json VARCHAR NOT NULL,
  exposure_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  UNIQUE (research_run_id, experiment_id),
  UNIQUE (research_run_id, exposure_index)
)`;

const CREATE_FINALIST_SETS = `
CREATE TABLE finalist_sets (
  finalist_set_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  objective_version_id VARCHAR NOT NULL,
  evidence_plan_id VARCHAR NOT NULL,
  holdout_partition_id VARCHAR NOT NULL,
  finalist_json VARCHAR NOT NULL,
  finalist_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;

const EXPOSURE_COLUMNS = `
validation_exposure_id,
research_run_id,
experiment_id,
exposure_index,
exposure_json,
exposure_hash,
created_at_ms`;

const FINALIST_COLUMNS = `
finalist_set_id,
research_run_id,
objective_version_id,
evidence_plan_id,
holdout_partition_id,
finalist_json,
finalist_hash,
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

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

function assertId(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function assertResearchRunId(value) {
  return assertId(value, /^run_[0-9a-f-]{36}$/u, "researchRunId");
}

function assertObjectiveVersionId(value) {
  return assertId(value, /^obj_[0-9a-f-]{36}$/u, "objectiveVersionId");
}

function assertExperimentId(value) {
  return assertId(value, /^exp_[0-9a-f-]{36}$/u, "experimentId");
}

function assertQueryArtifactId(value) {
  return assertId(value, /^qry_[0-9a-f-]{36}$/u, "queryArtifactId");
}

function assertFinalistSetId(value) {
  return assertId(value, /^finalist_[0-9a-f-]{36}$/u, "finalistSetId");
}

function assertValidationExposureId(value) {
  return assertId(value, /^vexp_[0-9a-f-]{36}$/u, "validationExposureId");
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validatePrerequisites(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research validation ledger requires prerequisite tables: ${missing.join(", ")}`);
  }

  const baseInfo = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (baseInfo.length !== 1 || Number(baseInfo[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research validation ledger base schema version is unsupported");
  }
  const evidenceInfo = await queryRows(connection, "SELECT schema_version FROM research_evidence_info");
  if (
    evidenceInfo.length !== 1
    || Number(evidenceInfo[0].schema_version) !== RESEARCH_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new Error("Research validation ledger evidence schema version is unsupported");
  }
  const experimentInfo = await queryRows(connection, "SELECT schema_version FROM research_experiment_info");
  if (
    experimentInfo.length !== 1
    || Number(experimentInfo[0].schema_version) !== RESEARCH_EXPERIMENT_SCHEMA_VERSION
  ) {
    throw new Error("Research validation ledger experiment schema version is unsupported");
  }
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const presentValidation = VALIDATION_TABLES.filter((table) => present.has(table));
  if (presentValidation.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_VALIDATION_INFO);
      await connection.run(CREATE_VALIDATION_EXPOSURES);
      await connection.run(CREATE_FINALIST_SETS);
      await connection.run(
        `INSERT INTO research_validation_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: RESEARCH_VALIDATION_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }

  const missing = VALIDATION_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research validation ledger is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_validation_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_VALIDATION_SCHEMA_VERSION) {
    throw new Error("Research validation ledger schema version is unsupported");
  }
}

function normalizeExposure(row) {
  const persisted = parseJsonObject(String(row.exposure_json), "validation exposure");
  const canonical = freezeValidationExposure(persisted);
  if (!sameJson(canonical, persisted)) {
    throw new Error("validation exposure persistence is not canonical");
  }
  if (
    canonical.validationExposureId !== String(row.validation_exposure_id)
    || canonical.researchRunId !== String(row.research_run_id)
    || canonical.experimentId !== String(row.experiment_id)
    || canonical.exposureIndex !== Number(row.exposure_index)
    || canonical.exposureHash !== String(row.exposure_hash)
    || canonical.createdAtMs !== Number(row.created_at_ms)
  ) {
    throw new Error("validation exposure persisted columns do not match content");
  }
  return canonical;
}

function normalizeFinalist(row) {
  const persisted = parseJsonObject(String(row.finalist_json), "finalist set");
  const canonical = freezeFinalistSet(persisted);
  if (!sameJson(canonical, persisted)) {
    throw new Error("finalist set persistence is not canonical");
  }
  if (
    canonical.finalistSetId !== String(row.finalist_set_id)
    || canonical.researchRunId !== String(row.research_run_id)
    || canonical.objectiveVersionId !== String(row.objective_version_id)
    || canonical.evidencePlanId !== String(row.evidence_plan_id)
    || canonical.holdoutPartitionId !== String(row.holdout_partition_id)
    || canonical.finalistHash !== String(row.finalist_hash)
    || canonical.createdAtMs !== Number(row.created_at_ms)
  ) {
    throw new Error("finalist set persisted columns do not match content");
  }
  return canonical;
}

export async function openResearchValidationLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  validationExposureIdFactory = () => `vexp_${randomUUID()}`,
  finalistSetIdFactory = () => `finalist_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  for (const [label, factory] of [
    ["now", now],
    ["validationExposureIdFactory", validationExposureIdFactory],
    ["finalistSetIdFactory", finalistSetIdFactory]
  ]) {
    if (typeof factory !== "function") throw new TypeError(`${label} must be a function`);
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const createdAtMs = assertSafeTimestamp(now(), "now()");
    await validatePrerequisites(connection);
    await bootstrapOrValidate(connection, createdAtMs);
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

  async function touchRun(researchRunId, timestamp) {
    await connection.run(
      `UPDATE research_runs SET updated_at_ms = $updatedAtMs
       WHERE research_run_id = $researchRunId`,
      { researchRunId, updatedAtMs: timestamp }
    );
  }

  async function findExposureForExperiment(researchRunId, experimentId) {
    const rows = await queryRows(
      connection,
      `SELECT ${EXPOSURE_COLUMNS}
       FROM validation_exposures
       WHERE research_run_id = $researchRunId AND experiment_id = $experimentId
       LIMIT 2`,
      { researchRunId, experimentId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("validation exposure scoped identity is invalid");
    return normalizeExposure(rows[0]);
  }

  async function validationExposureCount(researchRunId) {
    const rows = await queryRows(
      connection,
      `SELECT COUNT(*) AS exposure_count
       FROM validation_exposures
       WHERE research_run_id = $researchRunId`,
      { researchRunId }
    );
    const count = Number(rows[0]?.exposure_count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("validation exposure count persistence is invalid");
    }
    return count;
  }

  async function requireValidationExperiment(researchRunId, experimentId) {
    const boundedExperimentId = assertExperimentId(experimentId);
    const rows = await queryRows(
      connection,
      `SELECT e.experiment_id, e.metric_set_id, e.objective_version_id, e.partition_id,
              e.phase, e.request_fingerprint, e.request_json, p.role
       FROM experiment_records e
       INNER JOIN partitions p ON p.partition_id = e.partition_id
       WHERE e.research_run_id = $researchRunId
         AND e.experiment_id = $experimentId
         AND p.research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId, experimentId: boundedExperimentId }
    );
    if (rows.length !== 1) throw new Error("Experiment was not found in this Research Run");
    if (String(rows[0].phase) !== "VALIDATION" || String(rows[0].role) !== "VALIDATION") {
      throw new Error("Validation exposure requires a completed VALIDATION experiment");
    }
    return rows[0];
  }

  async function requireLatestEvidencePlan(researchRunId, objectiveVersionId) {
    const boundedObjectiveId = assertObjectiveVersionId(objectiveVersionId);
    const objectiveRows = await queryRows(
      connection,
      `SELECT objective_version_id FROM objective_versions
       WHERE research_run_id = $researchRunId
         AND objective_version_id = $objectiveVersionId
       LIMIT 2`,
      { researchRunId, objectiveVersionId: boundedObjectiveId }
    );
    if (objectiveRows.length !== 1) throw new Error("Objective Version was not found in this Research Run");

    const planRows = await queryRows(
      connection,
      `SELECT evidence_plan_id
       FROM evidence_plans
       WHERE research_run_id = $researchRunId
         AND objective_version_id = $objectiveVersionId
       ORDER BY version_number DESC
       LIMIT 2`,
      { researchRunId, objectiveVersionId: boundedObjectiveId }
    );
    if (planRows.length === 0) throw new Error("Evidence Plan was not found for this Objective Version");
    const evidencePlanId = String(planRows[0].evidence_plan_id);
    const partitions = await queryRows(
      connection,
      `SELECT partition_id, role
       FROM partitions
       WHERE research_run_id = $researchRunId
         AND evidence_plan_id = $evidencePlanId
         AND role IN ('VALIDATION', 'SEALED_HOLDOUT')
       ORDER BY role ASC`,
      { researchRunId, evidencePlanId }
    );
    const validation = partitions.filter((row) => String(row.role) === "VALIDATION");
    const holdout = partitions.filter((row) => String(row.role) === "SEALED_HOLDOUT");
    if (validation.length !== 1 || holdout.length !== 1) {
      throw new Error("Finalist Set requires exactly one VALIDATION and one SEALED_HOLDOUT partition");
    }
    return {
      objectiveVersionId: boundedObjectiveId,
      evidencePlanId,
      validationPartitionId: String(validation[0].partition_id),
      holdoutPartitionId: String(holdout[0].partition_id)
    };
  }

  async function resolveQueryArtifacts(researchRunId, queryArtifactIds) {
    if (!Array.isArray(queryArtifactIds) || queryArtifactIds.length < 1 || queryArtifactIds.length > 3) {
      throw new TypeError("queryArtifactIds must contain one to three immutable Query Artifact IDs");
    }
    const seen = new Set();
    const artifacts = [];
    for (const value of queryArtifactIds) {
      const queryArtifactId = assertQueryArtifactId(value);
      if (seen.has(queryArtifactId)) throw new TypeError("queryArtifactIds must be unique");
      seen.add(queryArtifactId);
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
      artifacts.push({
        queryArtifactId,
        sqlHash: String(rows[0].sql_hash),
        scannerContractVersion: String(rows[0].scanner_contract_version)
      });
    }
    return artifacts;
  }

  async function getFinalistSet(researchRunId, finalistSetId) {
    const runId = assertResearchRunId(researchRunId);
    const boundedFinalistSetId = assertFinalistSetId(finalistSetId);
    const rows = await queryRows(
      connection,
      `SELECT ${FINALIST_COLUMNS}
       FROM finalist_sets
       WHERE research_run_id = $researchRunId
         AND finalist_set_id = $finalistSetId
       LIMIT 2`,
      { researchRunId: runId, finalistSetId: boundedFinalistSetId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("finalist set scoped identity is invalid");
    return normalizeFinalist(rows[0]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_VALIDATION_SCHEMA_VERSION,

    async recordValidationExposure({ researchRunId, experimentId }) {
      const runId = await requireRun(researchRunId);
      const boundedExperimentId = assertExperimentId(experimentId);
      const existing = await findExposureForExperiment(runId, boundedExperimentId);
      if (existing) return existing;

      const experiment = await requireValidationExperiment(runId, boundedExperimentId);
      const request = parseJsonObject(String(experiment.request_json), "experiment request");
      if (
        request.researchRunId !== runId
        || request.objectiveVersionId !== String(experiment.objective_version_id)
        || request.evidencePartitionId !== String(experiment.partition_id)
        || request.phase !== "VALIDATION"
      ) {
        throw new Error("Validation Experiment durable request identity is invalid");
      }

      const timestamp = assertSafeTimestamp(now(), "now()");
      return await inTransaction(connection, async () => {
        const raced = await findExposureForExperiment(runId, boundedExperimentId);
        if (raced) return raced;
        const exposureIndex = (await validationExposureCount(runId)) + 1;
        const validationExposureId = assertValidationExposureId(validationExposureIdFactory());
        const exposure = freezeValidationExposure({
          validationExposureId,
          researchRunId: runId,
          objectiveVersionId: String(experiment.objective_version_id),
          partitionId: String(experiment.partition_id),
          experimentId: boundedExperimentId,
          metricSetId: String(experiment.metric_set_id),
          requestFingerprint: String(experiment.request_fingerprint),
          queryArtifacts: request.queryArtifacts,
          schedule: request.schedule,
          exposureIndex,
          createdAtMs: timestamp
        });
        const exposureJson = JSON.stringify(exposure);
        await connection.run(
          `INSERT INTO validation_exposures (
             validation_exposure_id, research_run_id, experiment_id, exposure_index,
             exposure_json, exposure_hash, created_at_ms
           ) VALUES (
             $validationExposureId, $researchRunId, $experimentId, $exposureIndex,
             $exposureJson, $exposureHash, $createdAtMs
           )`,
          {
            validationExposureId,
            researchRunId: runId,
            experimentId: boundedExperimentId,
            exposureIndex,
            exposureJson,
            exposureHash: exposure.exposureHash,
            createdAtMs: timestamp
          }
        );
        await touchRun(runId, timestamp);
        return exposure;
      });
    },

    async getValidationExposureCount(researchRunId) {
      const runId = await requireRun(researchRunId);
      return await validationExposureCount(runId);
    },

    async listValidationExposures(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${EXPOSURE_COLUMNS}
         FROM validation_exposures
         WHERE research_run_id = $researchRunId
         ORDER BY exposure_index ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeExposure));
    },

    async createFinalistSet({
      researchRunId,
      objectiveVersionId,
      queryArtifactIds,
      evaluationProfile,
      justification
    }) {
      const runId = await requireRun(researchRunId);
      const plan = await requireLatestEvidencePlan(runId, objectiveVersionId);
      const queryArtifacts = await resolveQueryArtifacts(runId, queryArtifactIds);
      const validationExposureCountAtLock = await validationExposureCount(runId);
      const finalistSetId = assertFinalistSetId(finalistSetIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      const finalistSet = freezeFinalistSet({
        finalistSetId,
        researchRunId: runId,
        objectiveVersionId: plan.objectiveVersionId,
        evidencePlanId: plan.evidencePlanId,
        validationPartitionId: plan.validationPartitionId,
        holdoutPartitionId: plan.holdoutPartitionId,
        queryArtifacts,
        evaluationProfile,
        validationExposureCountAtLock,
        justification,
        createdAtMs: timestamp
      });
      const finalistJson = JSON.stringify(finalistSet);
      await inTransaction(connection, async () => {
        await connection.run(
          `INSERT INTO finalist_sets (
             finalist_set_id, research_run_id, objective_version_id, evidence_plan_id,
             holdout_partition_id, finalist_json, finalist_hash, created_at_ms
           ) VALUES (
             $finalistSetId, $researchRunId, $objectiveVersionId, $evidencePlanId,
             $holdoutPartitionId, $finalistJson, $finalistHash, $createdAtMs
           )`,
          {
            finalistSetId,
            researchRunId: runId,
            objectiveVersionId: plan.objectiveVersionId,
            evidencePlanId: plan.evidencePlanId,
            holdoutPartitionId: plan.holdoutPartitionId,
            finalistJson,
            finalistHash: finalistSet.finalistHash,
            createdAtMs: timestamp
          }
        );
        await touchRun(runId, timestamp);
      });
      return finalistSet;
    },

    async getFinalistSet(researchRunId, finalistSetId) {
      return await getFinalistSet(researchRunId, finalistSetId);
    },

    async listFinalistSets(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${FINALIST_COLUMNS}
         FROM finalist_sets
         WHERE research_run_id = $researchRunId
         ORDER BY created_at_ms ASC, finalist_set_id ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeFinalist));
    },

    async authorizeHoldoutEvaluation({ researchRunId, finalistSetId }) {
      const runId = await requireRun(researchRunId);
      const finalistSet = await getFinalistSet(runId, finalistSetId);
      if (!finalistSet) throw new Error("Finalist Set was not found in this Research Run");
      return authorizeSealedHoldout({
        capability: HOLDOUT_FINAL_CAPABILITY,
        researchRunId: runId,
        holdoutPartitionId: finalistSet.holdoutPartitionId,
        finalistSet
      });
    },

    async authorizePartitionUse({ researchRunId, partitionId, capability, finalistSetId = null }) {
      const runId = await requireRun(researchRunId);
      const boundedPartitionId = assertId(partitionId, /^part_[0-9a-f-]{36}$/u, "partitionId");
      const rows = await queryRows(
        connection,
        `SELECT role FROM partitions
         WHERE research_run_id = $researchRunId AND partition_id = $partitionId
         LIMIT 2`,
        { researchRunId: runId, partitionId: boundedPartitionId }
      );
      if (rows.length !== 1) throw new Error("Partition was not found in this Research Run");
      const role = String(rows[0].role);
      if (role !== "SEALED_HOLDOUT") {
        return Object.freeze({ allowed: true, researchRunId: runId, partitionId: boundedPartitionId, role });
      }
      if (capability !== HOLDOUT_FINAL_CAPABILITY) {
        return authorizeSealedHoldout({
          capability,
          researchRunId: runId,
          holdoutPartitionId: boundedPartitionId,
          finalistSet: null
        });
      }
      if (finalistSetId === null) {
        return authorizeSealedHoldout({
          capability,
          researchRunId: runId,
          holdoutPartitionId: boundedPartitionId,
          finalistSet: null
        });
      }
      const finalistSet = await getFinalistSet(runId, finalistSetId);
      if (!finalistSet) throw new Error("Finalist Set was not found in this Research Run");
      return authorizeSealedHoldout({
        capability,
        researchRunId: runId,
        holdoutPartitionId: boundedPartitionId,
        finalistSet
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
