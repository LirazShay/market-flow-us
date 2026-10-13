import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { RESEARCH_EVIDENCE_SCHEMA_VERSION } from "./evidence-ledger.js";
import { RESEARCH_EXPERIMENT_SCHEMA_VERSION } from "./experiment-ledger.js";
import { RESEARCH_HOLDOUT_SCHEMA_VERSION } from "./holdout-ledger.js";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";
import { verifyResearchEvidenceSourceFingerprint } from "./source-fingerprint.js";
import { RESEARCH_VALIDATION_SCHEMA_VERSION } from "./validation-ledger.js";

export const RESEARCH_RECOMMENDATION_SCHEMA_VERSION = 1;
export const RESEARCH_RECOMMENDATION_ARTIFACT_VERSION = "research-final-recommendation-v1";

const ANALYSIS_OPERATION = "execute_development_research_sql";
const OUTCOMES = new Set(["SELECTED_QUERY", "NO_RECOMMENDATION"]);
const ROLE_ORDER = Object.freeze(["DEVELOPMENT", "VALIDATION", "SEALED_HOLDOUT"]);
const REQUIRED_TABLES = Object.freeze([
  "research_ledger_info",
  "research_runs",
  "objective_versions",
  "query_artifacts",
  "research_evidence_info",
  "evidence_inventories",
  "evidence_plans",
  "partitions",
  "research_experiment_info",
  "experiment_records",
  "research_validation_info",
  "validation_exposures",
  "finalist_sets",
  "research_holdout_info",
  "holdout_evaluations"
]);
const RECOMMENDATION_TABLES = Object.freeze([
  "research_recommendation_info",
  "recommendation_artifacts"
]);
const REQUEST_KEYS = new Set([
  "researchRunId",
  "finalistSetId",
  "holdoutEvaluationId",
  "outcome",
  "queryArtifactId",
  "stoppingReason",
  "interpretation",
  "limitations"
]);

const CREATE_RESEARCH_RECOMMENDATION_INFO = `
CREATE TABLE research_recommendation_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RECOMMENDATION_ARTIFACTS = `
CREATE TABLE recommendation_artifacts (
  artifact_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR UNIQUE NOT NULL,
  finalist_set_id VARCHAR NOT NULL,
  holdout_evaluation_id VARCHAR NOT NULL,
  terminal_intent_json VARCHAR NOT NULL,
  artifact_json VARCHAR NOT NULL,
  artifact_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;

const ARTIFACT_COLUMNS = `
artifact_id,
research_run_id,
finalist_set_id,
holdout_evaluation_id,
terminal_intent_json,
artifact_json,
artifact_hash,
created_at_ms`;

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

function assertArtifactId(value) {
  return assertId(value, /^artifact_[0-9a-f-]{36}$/u, "artifactId");
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 value`);
  }
  return value;
}

function assertSafeTimestamp(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function boundedText(value, label, maxChars, { optional = false } = {}) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxChars) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function normalizeLimitations(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16) {
    throw new TypeError("limitations must contain at most sixteen bounded strings");
  }
  return Object.freeze(value.map((item) => boundedText(item, "limitation", 2_048)));
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

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])
    ));
  }
  return value;
}

function canonicalize(value, label, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be JSON serializable`);
    return value;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError(`${label} must be JSON serializable`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalize(item, label, ancestors));
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError(`${label} must be JSON serializable`);
      }
      result[key] = canonicalize(item, label, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value, label, maxChars = 524_288) {
  const serialized = JSON.stringify(canonicalize(value, label));
  if (serialized.length > maxChars) throw new TypeError(`${label} exceeds the bounded durable payload size`);
  return serialized;
}

function sameJson(left, right) {
  return canonicalJson(left, "comparison") === canonicalJson(right, "comparison");
}

function countValue(row, key, label) {
  const value = Number(row?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} count is invalid`);
  return value;
}

function roleRank(role) {
  const index = ROLE_ORDER.indexOf(role);
  if (index < 0) throw new Error(`Unsupported final artifact partition role ${role}`);
  return index;
}

function confidenceClassification(outcome, independentProofForSelectedQuery) {
  if (outcome === "SELECTED_QUERY" && independentProofForSelectedQuery) {
    return "INDEPENDENT_HOLDOUT_SUPPORTED";
  }
  return "INSUFFICIENT_FOR_RECOMMENDATION";
}

export function normalizeRecommendationRequest(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("final recommendation request must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!REQUEST_KEYS.has(key)) throw new TypeError(`${key} is not client-owned final recommendation authority`);
  }
  const outcome = input.outcome;
  if (!OUTCOMES.has(outcome)) {
    throw new TypeError("outcome must be SELECTED_QUERY or NO_RECOMMENDATION");
  }
  const queryArtifactId = input.queryArtifactId === undefined || input.queryArtifactId === null
    ? null
    : assertQueryArtifactId(input.queryArtifactId);
  if (outcome === "SELECTED_QUERY" && queryArtifactId === null) {
    throw new TypeError("SELECTED_QUERY requires queryArtifactId");
  }
  if (outcome === "NO_RECOMMENDATION" && queryArtifactId !== null) {
    throw new TypeError("NO_RECOMMENDATION must not carry queryArtifactId");
  }
  return freezeCopy({
    researchRunId: assertResearchRunId(input.researchRunId),
    finalistSetId: assertFinalistSetId(input.finalistSetId),
    holdoutEvaluationId: assertHoldoutEvaluationId(input.holdoutEvaluationId),
    outcome,
    queryArtifactId,
    stoppingReason: boundedText(input.stoppingReason, "stoppingReason", 4_096),
    interpretation: boundedText(input.interpretation, "interpretation", 4_096, { optional: true }),
    limitations: normalizeLimitations(input.limitations)
  });
}

async function validatePrerequisites(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research recommendation ledger requires prerequisite tables: ${missing.join(", ")}`);
  }
  const versionChecks = [
    ["research_ledger_info", RESEARCH_LEDGER_SCHEMA_VERSION, "base"],
    ["research_evidence_info", RESEARCH_EVIDENCE_SCHEMA_VERSION, "evidence"],
    ["research_experiment_info", RESEARCH_EXPERIMENT_SCHEMA_VERSION, "experiment"],
    ["research_validation_info", RESEARCH_VALIDATION_SCHEMA_VERSION, "validation"],
    ["research_holdout_info", RESEARCH_HOLDOUT_SCHEMA_VERSION, "holdout"]
  ];
  for (const [table, expected, label] of versionChecks) {
    const rows = await queryRows(connection, `SELECT schema_version FROM ${table}`);
    if (rows.length !== 1 || Number(rows[0].schema_version) !== expected) {
      throw new Error(`Research recommendation ${label} schema version is unsupported`);
    }
  }
  return present;
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const own = RECOMMENDATION_TABLES.filter((table) => present.has(table));
  if (own.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_RECOMMENDATION_INFO);
      await connection.run(CREATE_RECOMMENDATION_ARTIFACTS);
      await connection.run(
        `INSERT INTO research_recommendation_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: RESEARCH_RECOMMENDATION_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }
  const missing = RECOMMENDATION_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research recommendation ledger is missing required tables: ${missing.join(", ")}`);
  }
  const rows = await queryRows(connection, "SELECT schema_version FROM research_recommendation_info");
  if (rows.length !== 1 || Number(rows[0].schema_version) !== RESEARCH_RECOMMENDATION_SCHEMA_VERSION) {
    throw new Error("Research recommendation schema version is unsupported");
  }
}

export async function openResearchRecommendationLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  recommendationArtifactIdFactory = () => `artifact_${randomUUID()}`,
  marketDataDir = "data",
  verifySourceFingerprint = verifyResearchEvidenceSourceFingerprint
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof recommendationArtifactIdFactory !== "function") {
    throw new TypeError("recommendationArtifactIdFactory must be a function");
  }
  if (typeof marketDataDir !== "string" || marketDataDir.length === 0) {
    throw new TypeError("marketDataDir must be a non-empty server-owned path");
  }
  if (typeof verifySourceFingerprint !== "function") {
    throw new TypeError("verifySourceFingerprint must be a function");
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;
  let availableTables;

  try {
    const createdAtMs = assertSafeTimestamp(now(), "now()");
    availableTables = await validatePrerequisites(connection);
    await bootstrapOrValidate(connection, createdAtMs);
    availableTables = new Set(await tableNames(connection));
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  async function getExisting(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    const rows = await queryRows(
      connection,
      `SELECT ${ARTIFACT_COLUMNS}
       FROM recommendation_artifacts
       WHERE research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("Research Run has multiple final recommendation artifacts");
    const row = rows[0];
    const terminalIntent = parseJsonObject(String(row.terminal_intent_json), "terminal intent");
    const payload = parseJsonObject(String(row.artifact_json), "recommendation artifact");
    const artifactHash = assertSha256(String(row.artifact_hash), "artifactHash");
    if (sha256(canonicalJson(payload, "recommendation artifact")) !== artifactHash) {
      throw new Error("Recommendation artifact hash does not match persisted content");
    }
    if (!sameJson(payload.terminalIntent, terminalIntent)) {
      throw new Error("Recommendation artifact terminal intent does not match durable terminal intent");
    }
    if (
      payload.artifactId !== String(row.artifact_id)
      || payload.researchRunId !== runId
      || payload.finalistSetId !== String(row.finalist_set_id)
      || payload.holdout?.holdoutEvaluationId !== String(row.holdout_evaluation_id)
      || payload.createdAtMs !== Number(row.created_at_ms)
    ) {
      throw new Error("Recommendation artifact persisted columns do not match content");
    }
    return freezeCopy({ ...payload, artifactHash });
  }

  async function requireRun(runId) {
    const rows = await queryRows(
      connection,
      `SELECT user_intent, status, current_phase FROM research_runs
       WHERE research_run_id = $researchRunId LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length !== 1) throw new Error("Research Run was not found");
    return {
      userIntent: String(rows[0].user_intent),
      status: String(rows[0].status),
      currentPhase: String(rows[0].current_phase)
    };
  }

  async function loadFinalist(runId, finalistSetId) {
    const rows = await queryRows(
      connection,
      `SELECT objective_version_id, evidence_plan_id, holdout_partition_id, finalist_json, finalist_hash
       FROM finalist_sets
       WHERE research_run_id = $researchRunId AND finalist_set_id = $finalistSetId
       LIMIT 2`,
      { researchRunId: runId, finalistSetId }
    );
    if (rows.length !== 1) throw new Error("Finalist Set was not found in this Research Run");
    const finalist = parseJsonObject(String(rows[0].finalist_json), "finalist set");
    const finalistHash = assertSha256(String(rows[0].finalist_hash), "finalistHash");
    if (finalist.finalistHash !== finalistHash || finalist.finalistSetId !== finalistSetId) {
      throw new Error("Finalist Set persistence does not match immutable identity/hash");
    }
    return { finalist, finalistHash };
  }

  async function loadQuery(runId, reference) {
    const rows = await queryRows(
      connection,
      `SELECT query_artifact_id, parent_query_artifact_id, sql_text, sql_hash,
              scanner_contract_version, label, hypothesis_text
       FROM query_artifacts
       WHERE research_run_id = $researchRunId AND query_artifact_id = $queryArtifactId
       LIMIT 2`,
      { researchRunId: runId, queryArtifactId: reference.queryArtifactId }
    );
    if (rows.length !== 1) throw new Error("Final recommendation Query Artifact was not found");
    const row = rows[0];
    const sqlHash = assertSha256(String(row.sql_hash), "query sqlHash");
    if (
      sqlHash !== reference.sqlHash
      || String(row.scanner_contract_version) !== reference.scannerContractVersion
      || sha256(String(row.sql_text)) !== sqlHash
    ) {
      throw new Error("Final recommendation Query Artifact no longer matches frozen provenance");
    }
    return freezeCopy({
      queryArtifactId: String(row.query_artifact_id),
      parentQueryArtifactId: row.parent_query_artifact_id === null ? null : String(row.parent_query_artifact_id),
      sqlText: String(row.sql_text),
      sqlHash,
      scannerContractVersion: String(row.scanner_contract_version),
      label: row.label === null ? null : String(row.label),
      hypothesisText: row.hypothesis_text === null ? null : String(row.hypothesis_text)
    });
  }

  async function loadObjective(runId, objectiveVersionId, userIntent) {
    const rows = await queryRows(
      connection,
      `SELECT version_number, interpretation_text, objective_json, objective_hash
       FROM objective_versions
       WHERE research_run_id = $researchRunId AND objective_version_id = $objectiveVersionId
       LIMIT 2`,
      { researchRunId: runId, objectiveVersionId }
    );
    if (rows.length !== 1) throw new Error("Final Objective Version was not found");
    return freezeCopy({
      userIntent,
      objectiveVersionId,
      versionNumber: Number(rows[0].version_number),
      interpretationText: String(rows[0].interpretation_text),
      objective: parseJsonObject(String(rows[0].objective_json), "objective"),
      objectiveHash: assertSha256(String(rows[0].objective_hash), "objectiveHash")
    });
  }

  async function loadEvidence(runId, finalist) {
    const planRows = await queryRows(
      connection,
      `SELECT evidence_inventory_id, plan_json, plan_hash, version_number
       FROM evidence_plans
       WHERE research_run_id = $researchRunId AND evidence_plan_id = $evidencePlanId
       LIMIT 2`,
      { researchRunId: runId, evidencePlanId: finalist.evidencePlanId }
    );
    if (planRows.length !== 1) throw new Error("Final Evidence Plan was not found");
    const inventoryId = String(planRows[0].evidence_inventory_id);
    const inventoryRows = await queryRows(
      connection,
      `SELECT inventory_json, inventory_hash FROM evidence_inventories
       WHERE research_run_id = $researchRunId AND evidence_inventory_id = $inventoryId
       LIMIT 2`,
      { researchRunId: runId, inventoryId }
    );
    if (inventoryRows.length !== 1) throw new Error("Final Evidence Inventory was not found");
    const partitionRows = await queryRows(
      connection,
      `SELECT partition_id, role, partition_json, partition_hash
       FROM partitions
       WHERE research_run_id = $researchRunId AND evidence_plan_id = $evidencePlanId`,
      { researchRunId: runId, evidencePlanId: finalist.evidencePlanId }
    );
    const partitions = partitionRows.map((row) => freezeCopy({
      partitionId: String(row.partition_id),
      role: String(row.role),
      partition: parseJsonObject(String(row.partition_json), "partition"),
      partitionHash: assertSha256(String(row.partition_hash), "partitionHash")
    })).sort((left, right) => roleRank(left.role) - roleRank(right.role));
    if (partitions.length !== 3 || !ROLE_ORDER.every((role, index) => partitions[index].role === role)) {
      throw new Error("Final artifact requires exact Development/Validation/Sealed Holdout partitions");
    }
    return freezeCopy({
      evidenceInventoryId: inventoryId,
      inventory: parseJsonObject(String(inventoryRows[0].inventory_json), "evidence inventory"),
      inventoryHash: assertSha256(String(inventoryRows[0].inventory_hash), "inventoryHash"),
      evidencePlanId: finalist.evidencePlanId,
      evidencePlanVersion: Number(planRows[0].version_number),
      plan: parseJsonObject(String(planRows[0].plan_json), "evidence plan"),
      planHash: assertSha256(String(planRows[0].plan_hash), "planHash"),
      partitions
    });
  }

  async function verifyEvidenceSources(evidence) {
    if (!Array.isArray(evidence.inventory?.sources) || evidence.inventory.sources.length < 1) {
      throw new Error("Final Evidence Inventory requires one or more fingerprinted sources");
    }
    for (const source of evidence.inventory.sources) {
      if (
        typeof source?.sourceId !== "string"
        || typeof source?.sourceFingerprint !== "string"
        || !/^[0-9a-f]{64}$/u.test(source.sourceFingerprint)
      ) {
        throw new Error("Final Evidence Inventory contains invalid source provenance");
      }
      await verifySourceFingerprint({
        dataDir: marketDataDir,
        sourceId: source.sourceId,
        expectedFingerprint: source.sourceFingerprint
      });
    }
  }

  async function loadValidationSupport(runId, finalist) {
    const rows = await queryRows(
      connection,
      `SELECT validation_exposure_id, experiment_id, exposure_index, exposure_json, exposure_hash
       FROM validation_exposures
       WHERE research_run_id = $researchRunId
         AND exposure_index <= $exposureCountAtLock
       ORDER BY exposure_index ASC`,
      {
        researchRunId: runId,
        exposureCountAtLock: finalist.validationExposureCountAtLock
      }
    );
    const exposures = rows.map((row) => ({
      validationExposureId: String(row.validation_exposure_id),
      experimentId: String(row.experiment_id),
      exposureIndex: Number(row.exposure_index),
      exposure: parseJsonObject(String(row.exposure_json), "validation exposure"),
      exposureHash: assertSha256(String(row.exposure_hash), "validation exposure hash")
    }));
    const support = [];
    for (const reference of finalist.queryArtifacts) {
      const exposure = exposures.find((candidate) => (
        candidate.exposure?.queryArtifacts?.some((artifact) => (
          artifact.queryArtifactId === reference.queryArtifactId
          && artifact.sqlHash === reference.sqlHash
          && artifact.scannerContractVersion === reference.scannerContractVersion
        ))
      ));
      if (!exposure) throw new Error("Finalist Query Artifact has no frozen Validation support");
      const experimentRows = await queryRows(
        connection,
        `SELECT metric_set_id, request_fingerprint, metrics_json, metrics_hash
         FROM experiment_records
         WHERE research_run_id = $researchRunId AND experiment_id = $experimentId
         LIMIT 2`,
        { researchRunId: runId, experimentId: exposure.experimentId }
      );
      if (experimentRows.length !== 1) throw new Error("Validation support Experiment was not found");
      const experiment = experimentRows[0];
      const metricsJson = String(experiment.metrics_json);
      const metricsHash = assertSha256(String(experiment.metrics_hash), "metricsHash");
      if (sha256(metricsJson) !== metricsHash) throw new Error("Validation metrics hash is invalid");
      support.push(freezeCopy({
        queryArtifactId: reference.queryArtifactId,
        validationExposureId: exposure.validationExposureId,
        exposureIndex: exposure.exposureIndex,
        exposureHash: exposure.exposureHash,
        experimentId: exposure.experimentId,
        metricSetId: String(experiment.metric_set_id),
        requestFingerprint: assertSha256(String(experiment.request_fingerprint), "requestFingerprint"),
        schedule: exposure.exposure.schedule,
        metrics: parseJsonObject(metricsJson, "validation metrics"),
        metricsHash
      }));
    }
    return Object.freeze(support);
  }

  async function searchBreadth(runId) {
    const candidates = await queryRows(
      connection,
      "SELECT COUNT(*) AS count FROM query_artifacts WHERE research_run_id = $researchRunId",
      { researchRunId: runId }
    );
    const experiments = await queryRows(
      connection,
      "SELECT COUNT(*) AS count FROM experiment_records WHERE research_run_id = $researchRunId",
      { researchRunId: runId }
    );
    const exposures = await queryRows(
      connection,
      "SELECT COUNT(*) AS count FROM validation_exposures WHERE research_run_id = $researchRunId",
      { researchRunId: runId }
    );
    let analysisCount = 0;
    if (availableTables.has("research_jobs")) {
      const analyses = await queryRows(
        connection,
        `SELECT COUNT(*) AS count FROM research_jobs
         WHERE research_run_id = $researchRunId AND operation = $operation`,
        { researchRunId: runId, operation: ANALYSIS_OPERATION }
      );
      analysisCount = countValue(analyses[0], "count", "analysis");
    }
    return freezeCopy({
      candidateArtifactCount: countValue(candidates[0], "count", "candidate artifact"),
      experimentCount: countValue(experiments[0], "count", "experiment"),
      analysisCount,
      validationExposureCount: countValue(exposures[0], "count", "validation exposure")
    });
  }

  function knownFailures(validationSupport, holdoutEvaluation) {
    const failures = new Set();
    if (holdoutEvaluation.contaminationState === "CONTAMINATED") {
      failures.add("POST_HOLDOUT_SQL_CONTAMINATION");
    }
    for (const item of validationSupport) {
      if ((item.metrics?.denominators?.unavailablePointCount ?? 0) > 0) {
        failures.add("VALIDATION_UNAVAILABLE_POINTS");
      }
      if (item.metrics?.queries?.some((query) => (query.zeroResultPointCount ?? 0) > 0)) {
        failures.add("VALIDATION_ZERO_RESULT_POINTS");
      }
    }
    for (const source of holdoutEvaluation.sourceResults ?? []) {
      if ((source.metrics?.denominators?.unavailablePointCount ?? 0) > 0) {
        failures.add("HOLDOUT_UNAVAILABLE_POINTS");
      }
      if (source.metrics?.queries?.some((query) => (query.zeroResultPointCount ?? 0) > 0)) {
        failures.add("HOLDOUT_ZERO_RESULT_POINTS");
      }
    }
    return Object.freeze([...failures]);
  }

  return Object.freeze({
    schemaVersion: RESEARCH_RECOMMENDATION_SCHEMA_VERSION,

    async getRecommendationArtifact(researchRunId) {
      return await getExisting(researchRunId);
    },

    async buildRecommendationArtifact({ request, holdoutEvaluation }) {
      const terminalIntent = normalizeRecommendationRequest(request);
      const existing = await getExisting(terminalIntent.researchRunId);
      if (existing) {
        if (sameJson(existing.terminalIntent, terminalIntent)) return existing;
        throw new Error("Research Run is already finalized with different terminal intent");
      }
      if (!holdoutEvaluation || typeof holdoutEvaluation !== "object" || Array.isArray(holdoutEvaluation)) {
        throw new TypeError("derived Holdout Evaluation is required for finalization");
      }
      if (
        holdoutEvaluation.researchRunId !== terminalIntent.researchRunId
        || holdoutEvaluation.finalistSetId !== terminalIntent.finalistSetId
        || holdoutEvaluation.holdoutEvaluationId !== terminalIntent.holdoutEvaluationId
        || holdoutEvaluation.exposedAtMs === null
      ) {
        throw new Error("Final recommendation Holdout reference does not match exposed durable authority");
      }

      const run = await requireRun(terminalIntent.researchRunId);
      const { finalist, finalistHash } = await loadFinalist(
        terminalIntent.researchRunId,
        terminalIntent.finalistSetId
      );
      if (
        finalist.researchRunId !== terminalIntent.researchRunId
        || finalist.holdoutPartitionId !== holdoutEvaluation.partitionId
        || finalist.finalistSetId !== terminalIntent.finalistSetId
      ) {
        throw new Error("Final recommendation Finalist/Holdout authority is inconsistent");
      }

      const loadedCandidates = [];
      for (const reference of finalist.queryArtifacts) {
        loadedCandidates.push(await loadQuery(terminalIntent.researchRunId, reference));
      }
      const strongestCandidates = Object.freeze(loadedCandidates);
      let selectedQuery = null;
      if (terminalIntent.outcome === "SELECTED_QUERY") {
        selectedQuery = strongestCandidates.find(
          (candidate) => candidate.queryArtifactId === terminalIntent.queryArtifactId
        ) ?? null;
        if (!selectedQuery) {
          throw new Error("Selected Query must belong to the exact frozen Finalist Set for independent Holdout proof");
        }
        if ((holdoutEvaluation.contaminatedQueryArtifactIds ?? []).includes(selectedQuery.queryArtifactId)) {
          throw new Error("Selected Query lineage is contaminated and cannot claim independent Holdout proof");
        }
      }

      const objective = await loadObjective(
        terminalIntent.researchRunId,
        finalist.objectiveVersionId,
        run.userIntent
      );
      const evidence = await loadEvidence(terminalIntent.researchRunId, finalist);
      await verifyEvidenceSources(evidence);
      const validationSupport = await loadValidationSupport(terminalIntent.researchRunId, finalist);
      const breadth = await searchBreadth(terminalIntent.researchRunId);

      const holdoutRows = await queryRows(
        connection,
        `SELECT evaluation_json, evaluation_hash, exposed_at_ms
         FROM holdout_evaluations
         WHERE research_run_id = $researchRunId
           AND holdout_evaluation_id = $holdoutEvaluationId
           AND finalist_set_id = $finalistSetId
         LIMIT 2`,
        {
          researchRunId: terminalIntent.researchRunId,
          holdoutEvaluationId: terminalIntent.holdoutEvaluationId,
          finalistSetId: terminalIntent.finalistSetId
        }
      );
      if (holdoutRows.length !== 1 || holdoutRows[0].exposed_at_ms === null) {
        throw new Error("Final recommendation requires one exposed Holdout Evaluation");
      }
      const holdoutPayloadJson = String(holdoutRows[0].evaluation_json);
      const holdoutEvaluationHash = assertSha256(String(holdoutRows[0].evaluation_hash), "holdout evaluation hash");
      if (sha256(holdoutPayloadJson) !== holdoutEvaluationHash) {
        throw new Error("Holdout evaluation hash is invalid");
      }
      const persistedHoldout = parseJsonObject(holdoutPayloadJson, "holdout evaluation");
      if (!sameJson(persistedHoldout.sourceResults, holdoutEvaluation.sourceResults)) {
        throw new Error("Derived Holdout Evaluation metrics do not match durable persisted content");
      }

      const independentProofForSelectedQuery = terminalIntent.outcome === "SELECTED_QUERY"
        && !(holdoutEvaluation.contaminatedQueryArtifactIds ?? []).includes(terminalIntent.queryArtifactId);
      const classification = confidenceClassification(
        terminalIntent.outcome,
        independentProofForSelectedQuery
      );
      const artifactId = assertArtifactId(recommendationArtifactIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      const failures = knownFailures(validationSupport, holdoutEvaluation);
      const payload = freezeCopy({
        contractVersion: RESEARCH_RECOMMENDATION_ARTIFACT_VERSION,
        artifactId,
        researchRunId: terminalIntent.researchRunId,
        finalistSetId: terminalIntent.finalistSetId,
        terminalIntent,
        outcome: terminalIntent.outcome,
        confidenceClassification: classification,
        selectedQuery,
        strongestCandidates,
        comparisonContext: {
          baselineReference: null,
          alternativeQueryArtifactIds: strongestCandidates
            .filter((candidate) => candidate.queryArtifactId !== selectedQuery?.queryArtifactId)
            .map((candidate) => candidate.queryArtifactId)
        },
        objective,
        evidence,
        searchBreadth: breadth,
        validation: {
          validationExposureCountAtLock: finalist.validationExposureCountAtLock,
          supportingEvidence: validationSupport
        },
        holdout: {
          holdoutEvaluationId: terminalIntent.holdoutEvaluationId,
          finalistSetId: terminalIntent.finalistSetId,
          partitionId: holdoutEvaluation.partitionId,
          exposedAtMs: holdoutEvaluation.exposedAtMs,
          contaminationState: holdoutEvaluation.contaminationState,
          contaminatedQueryArtifactIds: holdoutEvaluation.contaminatedQueryArtifactIds ?? [],
          independentProofForSelectedQuery,
          sourceResults: holdoutEvaluation.sourceResults,
          evaluationHash: holdoutEvaluationHash
        },
        robustness: {
          validationMetrics: validationSupport.map((item) => ({
            queryArtifactId: item.queryArtifactId,
            metrics: item.metrics,
            metricsHash: item.metricsHash
          })),
          holdoutMetrics: (holdoutEvaluation.sourceResults ?? []).map((source) => ({
            sourceId: source.sourceId,
            sourceFingerprint: source.sourceFingerprint,
            metrics: source.metrics
          }))
        },
        knownFailures: failures,
        cadenceEvidence: {
          validationSchedules: validationSupport.map((item) => item.schedule),
          holdoutSchedules: (holdoutEvaluation.sourceResults ?? []).map((source) => source.schedule)
        },
        stoppingReason: terminalIntent.stoppingReason,
        interpretation: terminalIntent.interpretation,
        limitations: terminalIntent.limitations,
        reproductionReferences: {
          objectiveVersionId: objective.objectiveVersionId,
          objectiveHash: objective.objectiveHash,
          evidenceInventoryId: evidence.evidenceInventoryId,
          inventoryHash: evidence.inventoryHash,
          evidencePlanId: evidence.evidencePlanId,
          planHash: evidence.planHash,
          partitionHashes: evidence.partitions.map((partition) => ({
            partitionId: partition.partitionId,
            role: partition.role,
            partitionHash: partition.partitionHash
          })),
          queryArtifacts: strongestCandidates.map((candidate) => ({
            queryArtifactId: candidate.queryArtifactId,
            sqlHash: candidate.sqlHash,
            scannerContractVersion: candidate.scannerContractVersion
          })),
          validationExposures: validationSupport.map((item) => ({
            validationExposureId: item.validationExposureId,
            exposureHash: item.exposureHash,
            experimentId: item.experimentId,
            requestFingerprint: item.requestFingerprint,
            metricSetId: item.metricSetId,
            metricsHash: item.metricsHash
          })),
          finalistSetId: finalist.finalistSetId,
          finalistHash,
          holdoutEvaluationId: terminalIntent.holdoutEvaluationId,
          holdoutEvaluationHash
        },
        createdAtMs: timestamp
      });
      const artifactJson = canonicalJson(payload, "recommendation artifact");
      const artifactHash = sha256(artifactJson);
      const terminalIntentJson = canonicalJson(terminalIntent, "terminal intent", 32_768);

      await inTransaction(connection, async () => {
        const raced = await getExisting(terminalIntent.researchRunId);
        if (raced) {
          if (!sameJson(raced.terminalIntent, terminalIntent)) {
            throw new Error("Research Run is already finalized with different terminal intent");
          }
          return;
        }
        await connection.run(
          `INSERT INTO recommendation_artifacts (
             artifact_id, research_run_id, finalist_set_id, holdout_evaluation_id,
             terminal_intent_json, artifact_json, artifact_hash, created_at_ms
           ) VALUES (
             $artifactId, $researchRunId, $finalistSetId, $holdoutEvaluationId,
             $terminalIntentJson, $artifactJson, $artifactHash, $createdAtMs
           )`,
          {
            artifactId,
            researchRunId: terminalIntent.researchRunId,
            finalistSetId: terminalIntent.finalistSetId,
            holdoutEvaluationId: terminalIntent.holdoutEvaluationId,
            terminalIntentJson,
            artifactJson,
            artifactHash,
            createdAtMs: timestamp
          }
        );
        await connection.run(
          `UPDATE research_runs
           SET status = 'COMPLETED', current_phase = 'FINALIZATION', updated_at_ms = $updatedAtMs
           WHERE research_run_id = $researchRunId`,
          { researchRunId: terminalIntent.researchRunId, updatedAtMs: timestamp }
        );
      });

      const stored = await getExisting(terminalIntent.researchRunId);
      if (!stored) throw new Error("Final recommendation artifact disappeared after durable commit");
      return stored;
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
