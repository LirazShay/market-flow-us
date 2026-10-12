import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";

export const RESEARCH_MEMORY_SCHEMA_VERSION = 1;

const NOTE_KINDS = new Set([
  "HYPOTHESIS",
  "DECISION",
  "ANOMALY",
  "NEXT_ACTION",
  "LIMITATION"
]);
const DECISIONS = new Set(["KEEP", "REJECT", "INVESTIGATE", "FINALIST"]);
const REFERENCE_TYPES = new Set([
  "OBJECTIVE_VERSION",
  "EVIDENCE_INVENTORY",
  "EVIDENCE_PLAN",
  "PARTITION",
  "QUERY_ARTIFACT"
]);
const ALLOWED_NOTE_KEYS = new Set([
  "researchRunId",
  "kind",
  "text",
  "decision",
  "relatedRefs"
]);
const REQUIRED_BASE_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
  "research_ledger_info",
  "research_runs"
]);
const MEMORY_TABLES = Object.freeze([
  "research_memory_info",
  "research_notes"
]);

const CREATE_RESEARCH_MEMORY_INFO = `
CREATE TABLE research_memory_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_RESEARCH_NOTES = `
CREATE TABLE research_notes (
  note_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  kind VARCHAR NOT NULL,
  decision VARCHAR,
  text VARCHAR NOT NULL,
  related_refs_json VARCHAR NOT NULL
)`;

const NOTE_COLUMNS = `
note_id,
research_run_id,
created_at_ms,
kind,
decision,
text,
related_refs_json`;

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

function assertSafeTimestamp(value, label) {
  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return timestamp;
}

function assertPositiveLimit(value, label, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new TypeError(`${label} must be an integer between 1 and ${max}`);
  }
  return value;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertNoteId(value) {
  if (typeof value !== "string" || !/^note_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("noteId must be a note_ prefixed UUID");
  }
  return value;
}

function assertNoteKind(value) {
  if (!NOTE_KINDS.has(value)) {
    throw new TypeError("kind is not a supported research note kind");
  }
  return value;
}

function assertDecision(value, kind) {
  if (kind === "DECISION") {
    if (!DECISIONS.has(value)) {
      throw new TypeError("decision notes require KEEP, REJECT, INVESTIGATE or FINALIST");
    }
    return value;
  }
  if (value !== null && value !== undefined) {
    throw new TypeError("decision is only valid for DECISION notes");
  }
  return null;
}

function assertBoundedText(value, label, maxChars) {
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

function assertNoteShape(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("research note request must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_NOTE_KEYS.has(key)) {
      throw new TypeError(`research note request contains unsupported field ${key}`);
    }
  }
  return input;
}

function assertRelatedRefs(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16) {
    throw new TypeError("relatedRefs must be an array with at most 16 entries");
  }

  return Object.freeze(value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("each relatedRefs entry must be an object");
    }
    const keys = Object.keys(entry).sort();
    if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "type") {
      throw new TypeError("each relatedRefs entry must contain only type and id");
    }
    if (!REFERENCE_TYPES.has(entry.type)) {
      throw new TypeError("relatedRefs type is not supported by the current Research Server");
    }
    if (
      typeof entry.id !== "string"
      || entry.id.length === 0
      || entry.id.length > 128
      || !/^[A-Za-z0-9_-]+$/u.test(entry.id)
    ) {
      throw new TypeError("relatedRefs id must be a bounded logical research ID");
    }
    return Object.freeze({ type: entry.type, id: entry.id });
  }));
}

function parseJsonArray(value, label) {
  if (typeof value !== "string") throw new Error(`${label} persistence is invalid`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} persistence is invalid`);
  }
  return assertRelatedRefs(parsed);
}

function normalizeNote(row) {
  const kind = assertNoteKind(String(row.kind));
  return Object.freeze({
    noteId: assertNoteId(String(row.note_id)),
    researchRunId: assertResearchRunId(String(row.research_run_id)),
    kind,
    decision: assertDecision(row.decision === null ? null : String(row.decision), kind),
    text: assertBoundedText(String(row.text), "text", 2_048),
    relatedRefs: parseJsonArray(row.related_refs_json, "relatedRefs"),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

async function validateBaseLedger(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_BASE_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research memory requires base ledger tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research memory base schema version is unsupported");
  }
}

async function bootstrapOrValidateMemory(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const presentMemory = MEMORY_TABLES.filter((table) => present.has(table));

  if (presentMemory.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_MEMORY_INFO);
      await connection.run(CREATE_RESEARCH_NOTES);
      await connection.run(
        `INSERT INTO research_memory_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        {
          schemaVersion: RESEARCH_MEMORY_SCHEMA_VERSION,
          createdAtMs
        }
      );
    });
    return;
  }

  const missing = MEMORY_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research memory is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_memory_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_MEMORY_SCHEMA_VERSION) {
    throw new Error("Research memory schema version is unsupported");
  }
}

export async function openResearchMemory({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  noteIdFactory = () => `note_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof noteIdFactory !== "function") throw new TypeError("noteIdFactory must be a function");

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    const createdAtMs = assertSafeTimestamp(now(), "now()");
    await validateBaseLedger(connection);
    await bootstrapOrValidateMemory(connection, createdAtMs);
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
      `SELECT research_run_id, user_intent, status, current_phase,
              budget_policy_json, created_at_ms, updated_at_ms
       FROM research_runs
       WHERE research_run_id = $researchRunId
       LIMIT 2`,
      { researchRunId: runId }
    );
    if (rows.length !== 1) throw new Error("Research Run was not found");
    return rows[0];
  }

  async function requireScopedReference(researchRunId, reference) {
    const mapping = {
      OBJECTIVE_VERSION: ["objective_versions", "objective_version_id"],
      EVIDENCE_INVENTORY: ["evidence_inventories", "evidence_inventory_id"],
      EVIDENCE_PLAN: ["evidence_plans", "evidence_plan_id"],
      PARTITION: ["partitions", "partition_id"],
      QUERY_ARTIFACT: ["query_artifacts", "query_artifact_id"]
    };
    const [table, column] = mapping[reference.type];
    const present = new Set(await tableNames(connection));
    if (!present.has(table)) {
      throw new Error(`relatedRefs type ${reference.type} is not available in this Research Server state`);
    }
    const rows = await queryRows(
      connection,
      `SELECT ${column}
       FROM ${table}
       WHERE research_run_id = $researchRunId
         AND ${column} = $referenceId
       LIMIT 2`,
      { researchRunId, referenceId: reference.id }
    );
    if (rows.length !== 1) {
      throw new Error(`relatedRefs ${reference.type} was not found in this Research Run`);
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

  async function currentObjective(researchRunId) {
    const rows = await queryRows(
      connection,
      `SELECT objective_version_id, version_number, interpretation_text, objective_hash
       FROM objective_versions
       WHERE research_run_id = $researchRunId
       ORDER BY version_number DESC
       LIMIT 1`,
      { researchRunId }
    );
    if (rows.length === 0) return null;
    return Object.freeze({
      objectiveVersionId: String(rows[0].objective_version_id),
      versionNumber: Number(rows[0].version_number),
      interpretationText: String(rows[0].interpretation_text),
      objectiveHash: String(rows[0].objective_hash)
    });
  }

  async function currentEvidencePlan(researchRunId) {
    const present = new Set(await tableNames(connection));
    if (!present.has("evidence_plans") || !present.has("partitions")) return null;
    const rows = await queryRows(
      connection,
      `SELECT evidence_plan_id, objective_version_id, evidence_inventory_id,
              version_number, plan_hash
       FROM evidence_plans
       WHERE research_run_id = $researchRunId
       ORDER BY version_number DESC
       LIMIT 1`,
      { researchRunId }
    );
    if (rows.length === 0) return null;
    const evidencePlanId = String(rows[0].evidence_plan_id);
    const partitionRows = await queryRows(
      connection,
      `SELECT partition_id, role, partition_hash
       FROM partitions
       WHERE research_run_id = $researchRunId
         AND evidence_plan_id = $evidencePlanId
       ORDER BY CASE role
         WHEN 'DEVELOPMENT' THEN 1
         WHEN 'VALIDATION' THEN 2
         WHEN 'SEALED_HOLDOUT' THEN 3
         ELSE 4
       END, partition_id ASC`,
      { researchRunId, evidencePlanId }
    );
    return Object.freeze({
      evidencePlanId,
      objectiveVersionId: String(rows[0].objective_version_id),
      evidenceInventoryId: String(rows[0].evidence_inventory_id),
      versionNumber: Number(rows[0].version_number),
      planHash: String(rows[0].plan_hash),
      partitions: Object.freeze(partitionRows.map((row) => Object.freeze({
        partitionId: String(row.partition_id),
        role: String(row.role),
        partitionHash: String(row.partition_hash)
      })))
    });
  }

  async function recentNotes(researchRunId, limit) {
    const rows = await queryRows(
      connection,
      `SELECT ${NOTE_COLUMNS}
       FROM research_notes
       WHERE research_run_id = $researchRunId
       ORDER BY created_at_ms DESC, note_id DESC
       LIMIT ${limit}`,
      { researchRunId }
    );
    return Object.freeze(rows.map(normalizeNote));
  }

  return Object.freeze({
    schemaVersion: RESEARCH_MEMORY_SCHEMA_VERSION,

    async recordResearchNote(input) {
      assertNoteShape(input);
      const runId = assertResearchRunId(input.researchRunId);
      const kind = assertNoteKind(input.kind);
      const decision = assertDecision(input.decision, kind);
      const text = assertBoundedText(input.text, "text", 2_048);
      const relatedRefs = assertRelatedRefs(input.relatedRefs);
      const noteId = assertNoteId(noteIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");

      await inTransaction(connection, async () => {
        await requireRun(runId);
        for (const reference of relatedRefs) {
          await requireScopedReference(runId, reference);
        }
        await connection.run(
          `INSERT INTO research_notes (
             note_id, research_run_id, created_at_ms, kind, decision, text, related_refs_json
           ) VALUES (
             $noteId, $researchRunId, $createdAtMs, $kind, $decision, $text, $relatedRefsJson
           )`,
          {
            noteId,
            researchRunId: runId,
            createdAtMs: timestamp,
            kind,
            decision,
            text,
            relatedRefsJson: JSON.stringify(relatedRefs)
          }
        );
        await touchRun(runId, timestamp);
      });

      return Object.freeze({
        noteId,
        researchRunId: runId,
        kind,
        decision,
        text,
        relatedRefs,
        createdAtMs: timestamp
      });
    },

    async listResearchNotes(researchRunId, { limit = 50 } = {}) {
      const run = await requireRun(researchRunId);
      return await recentNotes(String(run.research_run_id), assertPositiveLimit(limit, "limit", 200));
    },

    async resumeResearchRun(researchRunId, { noteLimit = 24 } = {}) {
      const run = await requireRun(researchRunId);
      const runId = String(run.research_run_id);
      const boundedNoteLimit = assertPositiveLimit(noteLimit, "noteLimit", 50);
      const [objective, evidencePlan, notes] = await Promise.all([
        currentObjective(runId),
        currentEvidencePlan(runId),
        recentNotes(runId, boundedNoteLimit)
      ]);

      const lastDecision = notes.find((note) => note.kind === "DECISION") ?? null;
      const nextAction = notes.find((note) => note.kind === "NEXT_ACTION") ?? null;
      const retainedDecisions = notes
        .filter((note) => note.kind === "DECISION" && note.decision !== "REJECT")
        .slice(0, 5);
      const rejectedDecisions = notes
        .filter((note) => note.kind === "DECISION" && note.decision === "REJECT")
        .slice(0, 5);
      const knownFailures = notes
        .filter((note) => note.kind === "ANOMALY" || note.kind === "LIMITATION")
        .slice(0, 5);
      const recentHypotheses = notes
        .filter((note) => note.kind === "HYPOTHESIS")
        .slice(0, 5);

      let budgetPolicy;
      try {
        budgetPolicy = JSON.parse(String(run.budget_policy_json));
      } catch {
        throw new Error("budgetPolicy persistence is invalid");
      }

      const stableReferences = Object.freeze({
        objectiveVersionId: objective?.objectiveVersionId ?? null,
        evidencePlanId: evidencePlan?.evidencePlanId ?? null,
        evidenceInventoryId: evidencePlan?.evidenceInventoryId ?? null,
        partitionIds: Object.freeze(evidencePlan?.partitions.map((item) => item.partitionId) ?? []),
        noteIds: Object.freeze(notes.map((note) => note.noteId))
      });

      return Object.freeze({
        schemaVersion: RESEARCH_MEMORY_SCHEMA_VERSION,
        researchRunId: runId,
        mission: Object.freeze({
          userIntent: String(run.user_intent),
          status: String(run.status),
          currentPhase: String(run.current_phase)
        }),
        currentObjective: objective,
        evidencePlan,
        budget: Object.freeze({
          policy: budgetPolicy,
          accountingAvailable: false,
          used: null,
          remaining: null
        }),
        lastDecision,
        nextAction,
        retainedDecisions: Object.freeze(retainedDecisions),
        rejectedDecisions: Object.freeze(rejectedDecisions),
        knownFailures: Object.freeze(knownFailures),
        recentHypotheses: Object.freeze(recentHypotheses),
        stableReferences,
        deeperRetrieval: Object.freeze({
          researchNotes: true,
          objectiveVersions: true,
          evidencePlans: evidencePlan !== null
        })
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
