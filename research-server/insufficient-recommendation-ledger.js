import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";
import { RESEARCH_RECOMMENDATION_SCHEMA_VERSION } from "./recommendation-ledger.js";

export const RESEARCH_INSUFFICIENT_RECOMMENDATION_SCHEMA_VERSION = 1;
export const RESEARCH_INSUFFICIENT_RECOMMENDATION_ARTIFACT_VERSION =
  "research-insufficient-evidence-recommendation-v1";

const REQUIRED_TABLES = Object.freeze([
  "research_ledger_info",
  "research_runs",
  "objective_versions",
  "query_artifacts",
  "evidence_inventories",
  "evidence_plans",
  "experiment_records",
  "validation_exposures",
  "finalist_sets",
  "holdout_evaluations",
  "research_recommendation_info",
  "recommendation_artifacts"
]);
const OWN_TABLES = Object.freeze([
  "research_insufficient_recommendation_info",
  "insufficient_recommendation_artifacts"
]);
const REQUEST_KEYS = new Set([
  "researchRunId",
  "objectiveVersionId",
  "evidenceInventoryId",
  "evaluationProfile",
  "timingToleranceMs",
  "outcome",
  "stoppingReason",
  "interpretation",
  "limitations"
]);

const CREATE_INFO = `
CREATE TABLE research_insufficient_recommendation_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_ARTIFACTS = `
CREATE TABLE insufficient_recommendation_artifacts (
  artifact_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR UNIQUE NOT NULL,
  terminal_intent_json VARCHAR NOT NULL,
  artifact_json VARCHAR NOT NULL,
  artifact_hash VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;

const ARTIFACT_COLUMNS = `
artifact_id,
research_run_id,
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
    // Preserve the original transaction error.
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

function assertObjectiveVersionId(value) {
  return assertId(value, /^obj_[0-9a-f-]{36}$/u, "objectiveVersionId");
}

function assertEvidenceInventoryId(value) {
  return assertId(value, /^inv_[0-9a-f-]{36}$/u, "evidenceInventoryId");
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
  if (serialized.length > maxChars) throw new TypeError(`${label} exceeds bounded durable payload size`);
  return serialized;
}

function sameJson(left, right) {
  return canonicalJson(left, "comparison") === canonicalJson(right, "comparison");
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

function countValue(row, key, label) {
  const value = Number(row?.[key]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} count is invalid`);
  return value;
}

export function normalizeInsufficientRecommendationRequest(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("insufficient-evidence recommendation request must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!REQUEST_KEYS.has(key)) {
      throw new TypeError(`${key} is not client-owned insufficient-evidence finalization authority`);
    }
  }
  if (input.outcome !== "NO_RECOMMENDATION") {
    throw new TypeError("insufficient-evidence finalization requires outcome NO_RECOMMENDATION");
  }
  if (input.evaluationProfile === null || typeof input.evaluationProfile !== "object" || Array.isArray(input.evaluationProfile)) {
    throw new TypeError("evaluationProfile must be an object");
  }
  const timingToleranceMs = input.timingToleranceMs ?? 0;
  if (!Number.isSafeInteger(timingToleranceMs) || timingToleranceMs < 0) {
    throw new TypeError("timingToleranceMs must be a non-negative safe integer");
  }
  return freezeCopy({
    researchRunId: assertResearchRunId(input.researchRunId),
    objectiveVersionId: assertObjectiveVersionId(input.objectiveVersionId),
    evidenceInventoryId: assertEvidenceInventoryId(input.evidenceInventoryId),
    evaluationProfile: input.evaluationProfile,
    timingToleranceMs,
    outcome: "NO_RECOMMENDATION",
    stoppingReason: boundedText(input.stoppingReason, "stoppingReason", 4_096),
    interpretation: boundedText(input.interpretation, "interpretation", 4_096, { optional: true }),
    limitations: normalizeLimitations(input.limitations)
  });
}

async function validatePrerequisites(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Insufficient-evidence recommendation ledger requires prerequisite tables: ${missing.join(", ")}`);
  }
  const base = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (base.length !== 1 || Number(base[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Insufficient-evidence recommendation base schema version is unsupported");
  }
  const recommendation = await queryRows(connection, "SELECT schema_version FROM research_recommendation_info");
  if (
    recommendation.length !== 1
    || Number(recommendation[0].schema_version) !== RESEARCH_RECOMMENDATION_SCHEMA_VERSION
  ) {
    throw new Error("Insufficient-evidence recommendation parent schema version is unsupported");
  }
}

async function bootstrapOrValidate(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const own = OWN_TABLES.filter((table) => present.has(table));
  if (own.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_INFO);
      await connection.run(CREATE_ARTIFACTS);
      await connection.run(
        `INSERT INTO research_insufficient_recommendation_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: RESEARCH_INSUFFICIENT_RECOMMENDATION_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }
  const missing = OWN_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Insufficient-evidence recommendation ledger is missing tables: ${missing.join(", ")}`);
  }
  const rows = await queryRows(connection, "SELECT schema_version FROM research_insufficient_recommendation_info");
  if (
    rows.length !== 1
    || Number(rows[0].schema_version) !== RESEARCH_INSUFFICIENT_RECOMMENDATION_SCHEMA_VERSION
  ) {
    throw new Error("Insufficient-evidence recommendation schema version is unsupported");
  }
}

export async function openResearchInsufficientRecommendationLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  recommendationArtifactIdFactory = () => `artifact_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof recommendationArtifactIdFactory !== "function") {
    throw new TypeError("recommendationArtifactIdFactory must be a function");
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

  async function getExisting(researchRunId) {
    const runId = assertResearchRunId(researchRunId);
    const rows = await queryRows(
      connection,
      `SELECT ${ARTIFACT_COLUMNS}
       FROM insufficient_recommendation_artifacts
       WHERE research_run_id = $researchRunId LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("Research Run has multiple insufficient-evidence artifacts");
    const row = rows[0];
    const terminalIntent = parseJsonObject(String(row.terminal_intent_json), "terminal intent");
    const payload = parseJsonObject(String(row.artifact_json), "insufficient-evidence artifact");
    const artifactHash = assertSha256(String(row.artifact_hash), "artifactHash");
    if (sha256(canonicalJson(payload, "insufficient-evidence artifact")) !== artifactHash) {
      throw new Error("Insufficient-evidence artifact hash does not match persisted content");
    }
    if (!sameJson(payload.terminalIntent, terminalIntent)) {
      throw new Error("Insufficient-evidence artifact terminal intent does not match persistence");
    }
    if (
      payload.artifactId !== String(row.artifact_id)
      || payload.researchRunId !== runId
      || payload.createdAtMs !== Number(row.created_at_ms)
    ) {
      throw new Error("Insufficient-evidence artifact persisted columns do not match content");
    }
    return freezeCopy({ ...payload, artifactHash });
  }

  async function searchBreadth(runId) {
    const [candidates, experiments, exposures] = await Promise.all([
      queryRows(connection, "SELECT COUNT(*) AS count FROM query_artifacts WHERE research_run_id = $researchRunId", { researchRunId: runId }),
      queryRows(connection, "SELECT COUNT(*) AS count FROM experiment_records WHERE research_run_id = $researchRunId", { researchRunId: runId }),
      queryRows(connection, "SELECT COUNT(*) AS count FROM validation_exposures WHERE research_run_id = $researchRunId", { researchRunId: runId })
    ]);
    return freezeCopy({
      candidateArtifactCount: countValue(candidates[0], "count", "candidate artifact"),
      experimentCount: countValue(experiments[0], "count", "experiment"),
      analysisCount: 0,
      validationExposureCount: countValue(exposures[0], "count", "validation exposure")
    });
  }

  async function assertNoIndependentFinalizationAuthority(runId, objectiveVersionId) {
    const [plans, finalists, holdouts, regularArtifacts] = await Promise.all([
      queryRows(
        connection,
        `SELECT COUNT(*) AS count FROM evidence_plans
         WHERE research_run_id = $researchRunId AND objective_version_id = $objectiveVersionId`,
        { researchRunId: runId, objectiveVersionId }
      ),
      queryRows(connection, "SELECT COUNT(*) AS count FROM finalist_sets WHERE research_run_id = $researchRunId", { researchRunId: runId }),
      queryRows(connection, "SELECT COUNT(*) AS count FROM holdout_evaluations WHERE research_run_id = $researchRunId", { researchRunId: runId }),
      queryRows(connection, "SELECT COUNT(*) AS count FROM recommendation_artifacts WHERE research_run_id = $researchRunId", { researchRunId: runId })
    ]);
    if (countValue(plans[0], "count", "evidence plan") > 0) {
      throw new Error("Insufficient-evidence finalization is unavailable after an Evidence Plan was committed for this Objective");
    }
    if (countValue(finalists[0], "count", "finalist") > 0 || countValue(holdouts[0], "count", "holdout") > 0) {
      throw new Error("Insufficient-evidence finalization cannot bypass existing Finalist/Holdout authority");
    }
    if (countValue(regularArtifacts[0], "count", "regular recommendation") > 0) {
      throw new Error("Research Run is already finalized by regular recommendation authority");
    }
  }

  return Object.freeze({
    schemaVersion: RESEARCH_INSUFFICIENT_RECOMMENDATION_SCHEMA_VERSION,

    async getRecommendationArtifact(researchRunId) {
      return await getExisting(researchRunId);
    },

    async buildRecommendationArtifact({ request, objective, evidenceInventory, planningDecision }) {
      const terminalIntent = normalizeInsufficientRecommendationRequest(request);
      const existing = await getExisting(terminalIntent.researchRunId);
      if (existing) {
        if (sameJson(existing.terminalIntent, terminalIntent)) return existing;
        throw new Error("Research Run is already finalized with different terminal intent");
      }
      if (
        !objective
        || objective.researchRunId !== terminalIntent.researchRunId
        || objective.objectiveVersionId !== terminalIntent.objectiveVersionId
      ) {
        throw new Error("Insufficient-evidence Objective Version does not match durable authority");
      }
      if (
        !evidenceInventory
        || evidenceInventory.researchRunId !== terminalIntent.researchRunId
        || evidenceInventory.evidenceInventoryId !== terminalIntent.evidenceInventoryId
      ) {
        throw new Error("Insufficient-evidence Inventory does not match durable authority");
      }
      if (
        !planningDecision
        || planningDecision.status !== "INSUFFICIENT_INDEPENDENT_EVIDENCE"
        || typeof planningDecision.reasonCode !== "string"
      ) {
        throw new Error("Insufficient-evidence finalization requires a server-derived insufficient planning decision");
      }

      await assertNoIndependentFinalizationAuthority(
        terminalIntent.researchRunId,
        terminalIntent.objectiveVersionId
      );
      const breadth = await searchBreadth(terminalIntent.researchRunId);
      const artifactId = assertArtifactId(recommendationArtifactIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      const objectiveSnapshot = freezeCopy({
        userIntent: objective.userIntent ?? null,
        objectiveVersionId: objective.objectiveVersionId,
        versionNumber: objective.versionNumber,
        interpretationText: objective.interpretationText,
        objective: objective.objective,
        objectiveHash: objective.objectiveHash
      });
      const evidence = freezeCopy({
        evidenceInventoryId: evidenceInventory.evidenceInventoryId,
        inventory: evidenceInventory.inventory,
        inventoryHash: evidenceInventory.inventoryHash,
        evidencePlanId: null,
        evidencePlanVersion: null,
        plan: null,
        planHash: null,
        partitions: []
      });
      const payload = freezeCopy({
        contractVersion: RESEARCH_INSUFFICIENT_RECOMMENDATION_ARTIFACT_VERSION,
        artifactId,
        researchRunId: terminalIntent.researchRunId,
        finalistSetId: null,
        terminalIntent,
        outcome: "NO_RECOMMENDATION",
        confidenceClassification: "INSUFFICIENT_FOR_RECOMMENDATION",
        selectedQuery: null,
        strongestCandidates: [],
        comparisonContext: {
          baselineReference: null,
          alternativeQueryArtifactIds: []
        },
        objective: objectiveSnapshot,
        evidence,
        evidencePlanning: freezeCopy({
          ...planningDecision,
          evaluationProfile: terminalIntent.evaluationProfile,
          timingToleranceMs: terminalIntent.timingToleranceMs
        }),
        searchBreadth: breadth,
        validation: {
          validationExposureCountAtLock: null,
          supportingEvidence: []
        },
        holdout: {
          status: "NOT_AVAILABLE",
          reasonCode: planningDecision.reasonCode,
          holdoutEvaluationId: null,
          finalistSetId: null,
          partitionId: null,
          exposedAtMs: null,
          contaminationState: "NOT_APPLICABLE",
          contaminatedQueryArtifactIds: [],
          independentProofForSelectedQuery: false,
          sourceResults: [],
          evaluationHash: null
        },
        robustness: {
          validationMetrics: [],
          holdoutMetrics: []
        },
        knownFailures: ["INSUFFICIENT_INDEPENDENT_EVIDENCE", planningDecision.reasonCode],
        cadenceEvidence: {
          validationSchedules: [],
          holdoutSchedules: []
        },
        stoppingReason: terminalIntent.stoppingReason,
        interpretation: terminalIntent.interpretation,
        limitations: terminalIntent.limitations,
        reproductionReferences: {
          objectiveVersionId: objectiveSnapshot.objectiveVersionId,
          objectiveHash: objectiveSnapshot.objectiveHash,
          evidenceInventoryId: evidence.evidenceInventoryId,
          inventoryHash: evidence.inventoryHash,
          evidencePlanId: null,
          planHash: null,
          partitionHashes: [],
          queryArtifacts: [],
          validationExposures: [],
          finalistSetId: null,
          finalistHash: null,
          holdoutEvaluationId: null,
          holdoutEvaluationHash: null,
          insufficientEvidenceDecision: planningDecision
        },
        createdAtMs: timestamp
      });
      const artifactJson = canonicalJson(payload, "insufficient-evidence artifact");
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
        const collision = await queryRows(
          connection,
          "SELECT artifact_id FROM recommendation_artifacts WHERE artifact_id = $artifactId LIMIT 1",
          { artifactId }
        );
        if (collision.length > 0) throw new Error("Recommendation artifact identity collision");
        await connection.run(
          `INSERT INTO insufficient_recommendation_artifacts (
             artifact_id, research_run_id, terminal_intent_json,
             artifact_json, artifact_hash, created_at_ms
           ) VALUES (
             $artifactId, $researchRunId, $terminalIntentJson,
             $artifactJson, $artifactHash, $createdAtMs
           )`,
          {
            artifactId,
            researchRunId: terminalIntent.researchRunId,
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
      if (!stored) throw new Error("Insufficient-evidence artifact disappeared after durable commit");
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
