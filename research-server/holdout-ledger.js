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
import { freezeFinalistSet } from "./validation-authority-core.js";
import { RESEARCH_VALIDATION_SCHEMA_VERSION } from "./validation-ledger.js";

export const RESEARCH_HOLDOUT_SCHEMA_VERSION = 1;
export const RESEARCH_HOLDOUT_AUTHORITY_VERSION = "research-holdout-authority-v1";

const REQUIRED_TABLES = Object.freeze([
  "research_ledger_info",
  "research_runs",
  "query_artifacts",
  "research_evidence_info",
  "evidence_inventories",
  "evidence_plans",
  "partitions",
  "research_validation_info",
  "finalist_sets"
]);
const HOLDOUT_TABLES = Object.freeze([
  "research_holdout_info",
  "holdout_evaluations",
  "holdout_contaminations"
]);

const CREATE_RESEARCH_HOLDOUT_INFO = `
CREATE TABLE research_holdout_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_HOLDOUT_EVALUATIONS = `
CREATE TABLE holdout_evaluations (
  holdout_evaluation_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  finalist_set_id VARCHAR NOT NULL,
  partition_id VARCHAR NOT NULL,
  evaluation_json VARCHAR NOT NULL,
  evaluation_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  exposed_at_ms BIGINT,
  contamination_state VARCHAR NOT NULL,
  UNIQUE (research_run_id, finalist_set_id)
)`;

const CREATE_HOLDOUT_CONTAMINATIONS = `
CREATE TABLE holdout_contaminations (
  holdout_evaluation_id VARCHAR NOT NULL,
  research_run_id VARCHAR NOT NULL,
  query_artifact_id VARCHAR NOT NULL,
  parent_query_artifact_id VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  PRIMARY KEY (holdout_evaluation_id, query_artifact_id)
)`;

const EVALUATION_COLUMNS = `
holdout_evaluation_id,
research_run_id,
finalist_set_id,
partition_id,
evaluation_json,
evaluation_hash,
created_at_ms,
exposed_at_ms,
contamination_state`;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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

function assertId(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function assertResearchRunId(value) {
  return assertId(value, /^run_[0-9a-f-]{36}$/u, "researchRunId");
}

function assertFinalistSetId(value) {
  return assertId(value, /^finalist_[0-9a-f-]{36}$/u, "finalistSetId");
}

function assertHoldoutEvaluationId(value) {
  return assertId(value, /^holdout_[0-9a-f-]{36}$/u, "holdoutEvaluationId");
}

function assertQueryArtifactId(value) {
  return assertId(value, /^qry_[0-9a-f-]{36}$/u, "queryArtifactId");
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 value`);
  }
  return value;
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

function boundedJson(value, label, maxChars = 524_288) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must be JSON serializable`);
  }
  if (serialized === undefined || serialized.length > maxChars) {
    throw new TypeError(`${label} exceeds the bounded durable payload size`);
  }
  return serialized;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])
    ));
  }
  return value;
}

function normalizeSchedule(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Sealed Holdout partition requires a committed holdoutSchedule");
  }
  const fromAtMs = assertSafeTimestamp(value.fromAtMs, "holdout schedule fromAtMs");
  const toAtMs = assertSafeTimestamp(value.toAtMs, "holdout schedule toAtMs");
  if (toAtMs < fromAtMs) throw new Error("Holdout schedule toAtMs must not precede fromAtMs");
  const intervalValue = Number(value.intervalValue);
  if (!Number.isSafeInteger(intervalValue) || intervalValue < 1) {
    throw new Error("Holdout schedule intervalValue must be a positive safe integer");
  }
  if (!new Set(["milliseconds", "seconds", "minutes"]).has(value.intervalUnit)) {
    throw new Error("Holdout schedule intervalUnit is unsupported");
  }
  return Object.freeze({
    fromAtMs,
    toAtMs,
    intervalValue,
    intervalUnit: value.intervalUnit
  });
}

function normalizeSourceSchedules(partition, inventory) {
  const sourceIds = partition?.sourceIds;
  const schedules = partition?.holdoutSchedule?.sources;
  if (!Array.isArray(sourceIds) || sourceIds.length < 1) {
    throw new Error("Sealed Holdout partition requires one or more sourceIds");
  }
  if (!Array.isArray(schedules) || schedules.length !== sourceIds.length) {
    throw new Error("Sealed Holdout partition requires one frozen source schedule per sourceId");
  }
  const sourceSet = new Set(sourceIds);
  if (sourceSet.size !== sourceIds.length) throw new Error("Sealed Holdout sourceIds must be unique");
  const seen = new Set();
  return Object.freeze(schedules.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Holdout source schedule is invalid");
    }
    const sourceId = String(entry.sourceId ?? "");
    if (!sourceSet.has(sourceId) || seen.has(sourceId)) {
      throw new Error("Holdout source schedule must match each partition source exactly once");
    }
    seen.add(sourceId);
    const matches = inventory.sources?.filter((source) => source?.sourceId === sourceId) ?? [];
    if (matches.length !== 1) {
      throw new Error("Holdout source is not present exactly once in the bound evidence inventory");
    }
    const sourceFingerprint = assertSha256(
      matches[0].sourceFingerprint,
      "holdout source fingerprint"
    );
    return Object.freeze({
      sourceId,
      sourceFingerprint,
      schedule: normalizeSchedule(entry)
    });
  }));
}

async function validatePrerequisites(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research Holdout ledger requires prerequisite tables: ${missing.join(", ")}`);
  }
  const base = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (base.length !== 1 || Number(base[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research Holdout base schema version is unsupported");
  }
  const evidence = await queryRows(connection, "SELECT schema_version FROM research_evidence_info");
  if (evidence.length !== 1 || Number(evidence[0].schema_version) !== RESEARCH_EVIDENCE_SCHEMA_VERSION) {
    throw new Error("Research Holdout evidence schema version is unsupported");
  }
  const validation = await queryRows(connection, "SELECT schema_version FROM research_validation_info");
  if (validation.length !== 1 || Number(validation[0].schema_version) !== RESEARCH_VALIDATION_SCHEMA_VERSION) {
    throw new Error("Research Holdout validation schema version is unsupported");
  }
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const presentHoldout = HOLDOUT_TABLES.filter((table) => present.has(table));
  if (presentHoldout.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_HOLDOUT_INFO);
      await connection.run(CREATE_HOLDOUT_EVALUATIONS);
      await connection.run(CREATE_HOLDOUT_CONTAMINATIONS);
      await connection.run(
        `INSERT INTO research_holdout_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: RESEARCH_HOLDOUT_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }
  const missing = HOLDOUT_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research Holdout ledger is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_holdout_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_HOLDOUT_SCHEMA_VERSION) {
    throw new Error("Research Holdout ledger schema version is unsupported");
  }
}

export async function openResearchHoldoutLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  holdoutEvaluationIdFactory = () => `holdout_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof holdoutEvaluationIdFactory !== "function") {
    throw new TypeError("holdoutEvaluationIdFactory must be a function");
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
      "UPDATE research_runs SET updated_at_ms = $updatedAtMs WHERE research_run_id = $researchRunId",
      { researchRunId, updatedAtMs: timestamp }
    );
  }

  async function finalistForRun(researchRunId, finalistSetId) {
    const boundedFinalistSetId = assertFinalistSetId(finalistSetId);
    const rows = await queryRows(
      connection,
      `SELECT finalist_json FROM finalist_sets
       WHERE research_run_id = $researchRunId AND finalist_set_id = $finalistSetId
       LIMIT 2`,
      { researchRunId, finalistSetId: boundedFinalistSetId }
    );
    if (rows.length !== 1) throw new Error("Finalist Set was not found in this Research Run");
    const persisted = parseJsonObject(String(rows[0].finalist_json), "finalist set");
    const canonical = freezeFinalistSet(persisted);
    if (!sameJson(canonical, persisted)) throw new Error("Finalist Set persistence is not canonical");
    return canonical;
  }

  async function currentPlanId(researchRunId) {
    const rows = await queryRows(
      connection,
      `SELECT evidence_plan_id FROM evidence_plans
       WHERE research_run_id = $researchRunId
       ORDER BY version_number DESC LIMIT 1`,
      { researchRunId }
    );
    return rows.length === 0 ? null : String(rows[0].evidence_plan_id);
  }

  async function resolveAuthority(researchRunId, finalistSetId) {
    const runId = await requireRun(researchRunId);
    const finalist = await finalistForRun(runId, finalistSetId);
    if ((await currentPlanId(runId)) !== finalist.evidencePlanId) {
      throw new Error("Sealed Holdout requires the Finalist Set Evidence Plan to remain current");
    }

    const partitionRows = await queryRows(
      connection,
      `SELECT evidence_plan_id, role, partition_json FROM partitions
       WHERE research_run_id = $researchRunId AND partition_id = $partitionId
       LIMIT 2`,
      { researchRunId: runId, partitionId: finalist.holdoutPartitionId }
    );
    if (partitionRows.length !== 1 || String(partitionRows[0].role) !== "SEALED_HOLDOUT") {
      throw new Error("Finalist Set Holdout partition is not a sealed Holdout authority");
    }
    if (String(partitionRows[0].evidence_plan_id) !== finalist.evidencePlanId) {
      throw new Error("Finalist Set Holdout partition no longer matches its Evidence Plan");
    }

    const planRows = await queryRows(
      connection,
      `SELECT objective_version_id, evidence_inventory_id FROM evidence_plans
       WHERE research_run_id = $researchRunId AND evidence_plan_id = $evidencePlanId
       LIMIT 2`,
      { researchRunId: runId, evidencePlanId: finalist.evidencePlanId }
    );
    if (planRows.length !== 1 || String(planRows[0].objective_version_id) !== finalist.objectiveVersionId) {
      throw new Error("Finalist Set Objective Version no longer matches its Evidence Plan");
    }
    const inventoryRows = await queryRows(
      connection,
      `SELECT inventory_json FROM evidence_inventories
       WHERE research_run_id = $researchRunId AND evidence_inventory_id = $inventoryId
       LIMIT 2`,
      { researchRunId: runId, inventoryId: String(planRows[0].evidence_inventory_id) }
    );
    if (inventoryRows.length !== 1) throw new Error("Holdout evidence inventory was not found");
    const inventory = parseJsonObject(String(inventoryRows[0].inventory_json), "evidence inventory");
    const partition = parseJsonObject(String(partitionRows[0].partition_json), "Holdout partition");
    const sourceSchedules = normalizeSourceSchedules(partition, inventory);

    const queryArtifacts = [];
    for (const reference of finalist.queryArtifacts) {
      const rows = await queryRows(
        connection,
        `SELECT sql_hash, scanner_contract_version FROM query_artifacts
         WHERE research_run_id = $researchRunId AND query_artifact_id = $queryArtifactId
         LIMIT 2`,
        { researchRunId: runId, queryArtifactId: reference.queryArtifactId }
      );
      if (rows.length !== 1) throw new Error("Finalist Query Artifact was not found in this Research Run");
      if (
        String(rows[0].sql_hash) !== reference.sqlHash
        || String(rows[0].scanner_contract_version) !== reference.scannerContractVersion
      ) {
        throw new Error("Finalist Query Artifact provenance no longer matches the immutable Finalist Set");
      }
      queryArtifacts.push(reference);
    }

    return freezeCopy({
      contractVersion: RESEARCH_HOLDOUT_AUTHORITY_VERSION,
      researchRunId: runId,
      finalistSetId: finalist.finalistSetId,
      finalistHash: finalist.finalistHash,
      objectiveVersionId: finalist.objectiveVersionId,
      evidencePlanId: finalist.evidencePlanId,
      partitionId: finalist.holdoutPartitionId,
      queryArtifacts,
      evaluationProfile: finalist.evaluationProfile,
      sourceSchedules
    });
  }

  async function contaminationIds(holdoutEvaluationId) {
    const rows = await queryRows(
      connection,
      `SELECT query_artifact_id FROM holdout_contaminations
       WHERE holdout_evaluation_id = $holdoutEvaluationId
       ORDER BY created_at_ms ASC, query_artifact_id ASC`,
      { holdoutEvaluationId }
    );
    return Object.freeze(rows.map((row) => String(row.query_artifact_id)));
  }

  async function normalizeEvaluation(row) {
    const payload = parseJsonObject(String(row.evaluation_json), "Holdout evaluation");
    if (sha256(JSON.stringify(payload)) !== String(row.evaluation_hash)) {
      throw new Error("Holdout evaluation hash does not match persisted content");
    }
    if (
      payload.holdoutEvaluationId !== String(row.holdout_evaluation_id)
      || payload.researchRunId !== String(row.research_run_id)
      || payload.finalistSetId !== String(row.finalist_set_id)
      || payload.partitionId !== String(row.partition_id)
      || payload.createdAtMs !== Number(row.created_at_ms)
    ) {
      throw new Error("Holdout evaluation persisted columns do not match content");
    }
    const contaminationState = String(row.contamination_state);
    if (!new Set(["CLEAN", "CONTAMINATED"]).has(contaminationState)) {
      throw new Error("Holdout contamination state is invalid");
    }
    return freezeCopy({
      ...payload,
      exposedAtMs: row.exposed_at_ms === null ? null : assertSafeTimestamp(row.exposed_at_ms, "exposedAtMs"),
      contaminationState,
      contaminatedQueryArtifactIds: await contaminationIds(payload.holdoutEvaluationId)
    });
  }

  async function getEvaluationById(researchRunId, holdoutEvaluationId) {
    const runId = assertResearchRunId(researchRunId);
    const boundedId = assertHoldoutEvaluationId(holdoutEvaluationId);
    const rows = await queryRows(
      connection,
      `SELECT ${EVALUATION_COLUMNS} FROM holdout_evaluations
       WHERE research_run_id = $researchRunId AND holdout_evaluation_id = $holdoutEvaluationId
       LIMIT 2`,
      { researchRunId: runId, holdoutEvaluationId: boundedId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("Holdout evaluation scoped identity is invalid");
    return await normalizeEvaluation(rows[0]);
  }

  async function getEvaluationByFinalist(researchRunId, finalistSetId) {
    const runId = assertResearchRunId(researchRunId);
    const boundedFinalist = assertFinalistSetId(finalistSetId);
    const rows = await queryRows(
      connection,
      `SELECT ${EVALUATION_COLUMNS} FROM holdout_evaluations
       WHERE research_run_id = $researchRunId AND finalist_set_id = $finalistSetId
       LIMIT 2`,
      { researchRunId: runId, finalistSetId: boundedFinalist }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("Finalist Set has multiple Holdout evaluations");
    return await normalizeEvaluation(rows[0]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_HOLDOUT_SCHEMA_VERSION,

    async prepareHoldoutEvaluation({ researchRunId, finalistSetId }) {
      return await resolveAuthority(researchRunId, finalistSetId);
    },

    async getHoldoutEvaluation(researchRunId, holdoutEvaluationId) {
      await requireRun(researchRunId);
      return await getEvaluationById(researchRunId, holdoutEvaluationId);
    },

    async getHoldoutEvaluationByFinalist(researchRunId, finalistSetId) {
      await requireRun(researchRunId);
      return await getEvaluationByFinalist(researchRunId, finalistSetId);
    },

    async recordCompletedHoldoutEvaluation({ authority, sourceResults }) {
      const canonicalAuthority = await resolveAuthority(authority?.researchRunId, authority?.finalistSetId);
      if (!sameJson(canonicalAuthority, authority)) {
        throw new Error("Holdout evaluation authority no longer matches durable Finalist/Evidence truth");
      }
      const existing = await getEvaluationByFinalist(authority.researchRunId, authority.finalistSetId);
      if (existing) return existing;
      if (!Array.isArray(sourceResults) || sourceResults.length !== authority.sourceSchedules.length) {
        throw new Error("Holdout result must contain exactly one completed result per frozen source schedule");
      }
      const normalizedResults = authority.sourceSchedules.map((source) => {
        const matches = sourceResults.filter((result) => result?.sourceId === source.sourceId);
        if (matches.length !== 1) throw new Error("Holdout result source identity does not match frozen authority");
        const result = matches[0];
        if (
          result.sourceFingerprint !== source.sourceFingerprint
          || !sameJson(result.schedule, source.schedule)
        ) {
          throw new Error("Holdout result source provenance/schedule does not match frozen authority");
        }
        const engineRequestFingerprint = assertSha256(
          result.engineRequestFingerprint,
          "Holdout engine request fingerprint"
        );
        const metricsJson = boundedJson(result.metrics, "Holdout metrics");
        return Object.freeze({
          sourceId: source.sourceId,
          sourceFingerprint: source.sourceFingerprint,
          schedule: source.schedule,
          engineRequestFingerprint,
          metrics: JSON.parse(metricsJson)
        });
      });

      const holdoutEvaluationId = assertHoldoutEvaluationId(holdoutEvaluationIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      const payload = freezeCopy({
        contractVersion: RESEARCH_HOLDOUT_AUTHORITY_VERSION,
        holdoutEvaluationId,
        researchRunId: authority.researchRunId,
        finalistSetId: authority.finalistSetId,
        finalistHash: authority.finalistHash,
        objectiveVersionId: authority.objectiveVersionId,
        evidencePlanId: authority.evidencePlanId,
        partitionId: authority.partitionId,
        queryArtifacts: authority.queryArtifacts,
        evaluationProfile: authority.evaluationProfile,
        sourceResults: normalizedResults,
        createdAtMs: timestamp
      });
      const evaluationJson = boundedJson(payload, "Holdout evaluation");
      const evaluationHash = sha256(evaluationJson);
      await inTransaction(connection, async () => {
        const raced = await getEvaluationByFinalist(authority.researchRunId, authority.finalistSetId);
        if (raced) return;
        await connection.run(
          `INSERT INTO holdout_evaluations (
             holdout_evaluation_id, research_run_id, finalist_set_id, partition_id,
             evaluation_json, evaluation_hash, created_at_ms, exposed_at_ms, contamination_state
           ) VALUES (
             $holdoutEvaluationId, $researchRunId, $finalistSetId, $partitionId,
             $evaluationJson, $evaluationHash, $createdAtMs, NULL, 'CLEAN'
           )`,
          {
            holdoutEvaluationId,
            researchRunId: authority.researchRunId,
            finalistSetId: authority.finalistSetId,
            partitionId: authority.partitionId,
            evaluationJson,
            evaluationHash,
            createdAtMs: timestamp
          }
        );
        await touchRun(authority.researchRunId, timestamp);
      });
      return await getEvaluationByFinalist(authority.researchRunId, authority.finalistSetId);
    },

    async exposeHoldoutEvaluation({ researchRunId, holdoutEvaluationId }) {
      const runId = await requireRun(researchRunId);
      const existing = await getEvaluationById(runId, holdoutEvaluationId);
      if (!existing) throw new Error("Holdout Evaluation was not found in this Research Run");
      if (existing.exposedAtMs !== null) return existing;
      const timestamp = assertSafeTimestamp(now(), "now()");
      await inTransaction(connection, async () => {
        await connection.run(
          `UPDATE holdout_evaluations SET exposed_at_ms = $exposedAtMs
           WHERE research_run_id = $researchRunId
             AND holdout_evaluation_id = $holdoutEvaluationId
             AND exposed_at_ms IS NULL`,
          { researchRunId: runId, holdoutEvaluationId, exposedAtMs: timestamp }
        );
        await touchRun(runId, timestamp);
      });
      return await getEvaluationById(runId, holdoutEvaluationId);
    },

    async recordPostHoldoutQueryArtifact({ researchRunId, queryArtifactId }) {
      const runId = await requireRun(researchRunId);
      const artifactId = assertQueryArtifactId(queryArtifactId);
      const artifactRows = await queryRows(
        connection,
        `SELECT parent_query_artifact_id, created_at_ms FROM query_artifacts
         WHERE research_run_id = $researchRunId AND query_artifact_id = $queryArtifactId
         LIMIT 2`,
        { researchRunId: runId, queryArtifactId: artifactId }
      );
      if (artifactRows.length !== 1) throw new Error("Query Artifact was not found in this Research Run");
      if (artifactRows[0].parent_query_artifact_id === null) return Object.freeze([]);
      const parentId = assertQueryArtifactId(String(artifactRows[0].parent_query_artifact_id));
      const createdAtMs = assertSafeTimestamp(artifactRows[0].created_at_ms, "query createdAtMs");

      const evaluations = await queryRows(
        connection,
        `SELECT ${EVALUATION_COLUMNS} FROM holdout_evaluations
         WHERE research_run_id = $researchRunId AND exposed_at_ms IS NOT NULL
         ORDER BY created_at_ms ASC, holdout_evaluation_id ASC`,
        { researchRunId: runId }
      );
      const contaminated = [];
      for (const row of evaluations) {
        const exposedAtMs = assertSafeTimestamp(row.exposed_at_ms, "exposedAtMs");
        if (createdAtMs < exposedAtMs) continue;
        const evaluation = await normalizeEvaluation(row);
        const finalistRows = await queryRows(
          connection,
          "SELECT finalist_json FROM finalist_sets WHERE finalist_set_id = $finalistSetId LIMIT 2",
          { finalistSetId: evaluation.finalistSetId }
        );
        if (finalistRows.length !== 1) throw new Error("Holdout Finalist Set persistence is missing");
        const finalist = freezeFinalistSet(parseJsonObject(String(finalistRows[0].finalist_json), "finalist set"));
        const directlyDescends = finalist.queryArtifacts.some((artifact) => artifact.queryArtifactId === parentId);
        const descendantRows = await queryRows(
          connection,
          `SELECT query_artifact_id FROM holdout_contaminations
           WHERE holdout_evaluation_id = $holdoutEvaluationId
             AND query_artifact_id = $parentQueryArtifactId
           LIMIT 2`,
          { holdoutEvaluationId: evaluation.holdoutEvaluationId, parentQueryArtifactId: parentId }
        );
        if (!directlyDescends && descendantRows.length === 0) continue;

        await inTransaction(connection, async () => {
          await connection.run(
            `INSERT OR IGNORE INTO holdout_contaminations (
               holdout_evaluation_id, research_run_id, query_artifact_id,
               parent_query_artifact_id, created_at_ms
             ) VALUES (
               $holdoutEvaluationId, $researchRunId, $queryArtifactId,
               $parentQueryArtifactId, $createdAtMs
             )`,
            {
              holdoutEvaluationId: evaluation.holdoutEvaluationId,
              researchRunId: runId,
              queryArtifactId: artifactId,
              parentQueryArtifactId: parentId,
              createdAtMs
            }
          );
          await connection.run(
            `UPDATE holdout_evaluations SET contamination_state = 'CONTAMINATED'
             WHERE holdout_evaluation_id = $holdoutEvaluationId`,
            { holdoutEvaluationId: evaluation.holdoutEvaluationId }
          );
          await touchRun(runId, createdAtMs);
        });
        contaminated.push(evaluation.holdoutEvaluationId);
      }
      return Object.freeze(contaminated);
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
