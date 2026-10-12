import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";

export const RESEARCH_EVIDENCE_SCHEMA_VERSION = 1;

const PARTITION_ROLES = new Set(["DEVELOPMENT", "VALIDATION", "SEALED_HOLDOUT"]);
const BASE_TABLES = Object.freeze([
  "objective_versions",
  "query_artifacts",
  "research_ledger_info",
  "research_runs"
]);
const EVIDENCE_TABLES = Object.freeze([
  "evidence_inventories",
  "evidence_plans",
  "partitions",
  "research_evidence_info"
]);

const CREATE_RESEARCH_EVIDENCE_INFO = `
CREATE TABLE research_evidence_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;

const CREATE_EVIDENCE_INVENTORIES = `
CREATE TABLE evidence_inventories (
  evidence_inventory_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  inventory_json VARCHAR NOT NULL,
  inventory_hash VARCHAR NOT NULL
)`;

const CREATE_EVIDENCE_PLANS = `
CREATE TABLE evidence_plans (
  evidence_plan_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  objective_version_id VARCHAR NOT NULL,
  evidence_inventory_id VARCHAR NOT NULL,
  version_number INTEGER NOT NULL,
  created_at_ms BIGINT NOT NULL,
  plan_json VARCHAR NOT NULL,
  plan_hash VARCHAR NOT NULL,
  UNIQUE (research_run_id, version_number)
)`;

const CREATE_PARTITIONS = `
CREATE TABLE partitions (
  partition_id VARCHAR PRIMARY KEY,
  research_run_id VARCHAR NOT NULL,
  evidence_plan_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  partition_json VARCHAR NOT NULL,
  partition_hash VARCHAR NOT NULL,
  UNIQUE (evidence_plan_id, role)
)`;

const INVENTORY_COLUMNS = `
evidence_inventory_id,
research_run_id,
created_at_ms,
inventory_json,
inventory_hash`;

const PLAN_COLUMNS = `
evidence_plan_id,
research_run_id,
objective_version_id,
evidence_inventory_id,
version_number,
created_at_ms,
plan_json,
plan_hash`;

const PARTITION_COLUMNS = `
partition_id,
research_run_id,
evidence_plan_id,
role,
partition_json,
partition_hash`;

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

function assertPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return number;
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

function assertEvidenceInventoryId(value) {
  if (typeof value !== "string" || !/^inv_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("evidenceInventoryId must be an inv_ prefixed UUID");
  }
  return value;
}

function assertEvidencePlanId(value) {
  if (typeof value !== "string" || !/^plan_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("evidencePlanId must be a plan_ prefixed UUID");
  }
  return value;
}

function assertPartitionId(value) {
  if (typeof value !== "string" || !/^part_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("partitionId must be a part_ prefixed UUID");
  }
  return value;
}

function assertPartitionRole(value) {
  if (!PARTITION_ROLES.has(value)) {
    throw new TypeError("partition role is not supported");
  }
  return value;
}

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

function serializeJsonObject(value, label, maxChars = 65_536) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  assertNoClientPaths(value, label);
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
  assertNoClientPaths(parsed, label);
  return parsed;
}

function assertNoClientPaths(value, label) {
  const seen = new Set();

  function visit(current) {
    if (current === null || current === undefined) return;
    if (typeof current === "string") {
      if (
        /^[A-Za-z]:[\\/]/u.test(current)
        || current.startsWith("/")
        || current.startsWith("\\\\")
        || current.startsWith("file:")
      ) {
        throw new TypeError(`${label} must use logical IDs/fingerprints, not client filesystem paths`);
      }
      return;
    }
    if (typeof current !== "object") return;
    if (seen.has(current)) {
      throw new TypeError(`${label} must be JSON serializable`);
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
    } else {
      for (const [key, item] of Object.entries(current)) {
        if (/(?:^|_)(?:path|filepath|filename|directory|folder)(?:$|_)/iu.test(key)) {
          throw new TypeError(`${label} must use logical IDs/fingerprints, not client filesystem paths`);
        }
        visit(item);
      }
    }
    seen.delete(current);
  }

  visit(value);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return value;
}

function planFingerprint(objectiveVersionId, evidenceInventoryId, planJson) {
  return sha256(JSON.stringify({ objectiveVersionId, evidenceInventoryId, planJson }));
}

function partitionFingerprint(role, partitionJson) {
  return sha256(JSON.stringify({ role, partitionJson }));
}

async function validateBaseLedger(connection) {
  const present = new Set(await tableNames(connection));
  const missing = BASE_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research evidence ledger requires base ledger tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research evidence ledger base schema version is unsupported");
  }
}

async function bootstrapOrValidateEvidence(connection, createdAtMs) {
  const present = new Set(await tableNames(connection));
  const presentEvidence = EVIDENCE_TABLES.filter((table) => present.has(table));

  if (presentEvidence.length === 0) {
    await inTransaction(connection, async () => {
      await connection.run(CREATE_RESEARCH_EVIDENCE_INFO);
      await connection.run(CREATE_EVIDENCE_INVENTORIES);
      await connection.run(CREATE_EVIDENCE_PLANS);
      await connection.run(CREATE_PARTITIONS);
      await connection.run(
        `INSERT INTO research_evidence_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        {
          schemaVersion: RESEARCH_EVIDENCE_SCHEMA_VERSION,
          createdAtMs
        }
      );
    });
    return;
  }

  const missing = EVIDENCE_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research evidence ledger is missing required tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_evidence_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_EVIDENCE_SCHEMA_VERSION) {
    throw new Error("Research evidence ledger schema version is unsupported");
  }
}

function normalizeInventory(row) {
  const evidenceInventoryId = assertEvidenceInventoryId(String(row.evidence_inventory_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const inventoryJson = String(row.inventory_json);
  const inventoryHash = assertSha256(String(row.inventory_hash), "inventoryHash");
  if (inventoryHash !== sha256(inventoryJson)) {
    throw new Error("evidence inventory hash does not match persisted content");
  }
  return Object.freeze({
    evidenceInventoryId,
    researchRunId,
    inventory: parseJsonObject(inventoryJson, "inventory"),
    inventoryHash,
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

function normalizePartition(row) {
  const partitionId = assertPartitionId(String(row.partition_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const evidencePlanId = assertEvidencePlanId(String(row.evidence_plan_id));
  const role = assertPartitionRole(String(row.role));
  const partitionJson = String(row.partition_json);
  const partitionHash = assertSha256(String(row.partition_hash), "partitionHash");
  if (partitionHash !== partitionFingerprint(role, partitionJson)) {
    throw new Error("partition hash does not match persisted content");
  }
  return Object.freeze({
    partitionId,
    researchRunId,
    evidencePlanId,
    role,
    partition: parseJsonObject(partitionJson, "partition"),
    partitionHash
  });
}

function normalizePlan(row, partitions) {
  const evidencePlanId = assertEvidencePlanId(String(row.evidence_plan_id));
  const researchRunId = assertResearchRunId(String(row.research_run_id));
  const objectiveVersionId = assertObjectiveVersionId(String(row.objective_version_id));
  const evidenceInventoryId = assertEvidenceInventoryId(String(row.evidence_inventory_id));
  const versionNumber = assertPositiveInteger(row.version_number, "versionNumber");
  const planJson = String(row.plan_json);
  const planHash = assertSha256(String(row.plan_hash), "planHash");
  if (planHash !== planFingerprint(objectiveVersionId, evidenceInventoryId, planJson)) {
    throw new Error("evidence plan hash does not match persisted content");
  }
  return Object.freeze({
    evidencePlanId,
    researchRunId,
    objectiveVersionId,
    evidenceInventoryId,
    versionNumber,
    plan: parseJsonObject(planJson, "plan"),
    planHash,
    partitions: Object.freeze([...partitions]),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

export async function openResearchEvidenceLedger({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now,
  evidenceInventoryIdFactory = () => `inv_${randomUUID()}`,
  evidencePlanIdFactory = () => `plan_${randomUUID()}`,
  partitionIdFactory = () => `part_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  for (const [label, factory] of [
    ["now", now],
    ["evidenceInventoryIdFactory", evidenceInventoryIdFactory],
    ["evidencePlanIdFactory", evidencePlanIdFactory],
    ["partitionIdFactory", partitionIdFactory]
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
    await bootstrapOrValidateEvidence(connection, createdAtMs);
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

  async function touchRun(researchRunId, timestamp) {
    await connection.run(
      `UPDATE research_runs
       SET updated_at_ms = $updatedAtMs
       WHERE research_run_id = $researchRunId`,
      { researchRunId, updatedAtMs: timestamp }
    );
  }

  async function getInventory(researchRunId, evidenceInventoryId) {
    const runId = assertResearchRunId(researchRunId);
    const inventoryId = assertEvidenceInventoryId(evidenceInventoryId);
    const rows = await queryRows(
      connection,
      `SELECT ${INVENTORY_COLUMNS}
       FROM evidence_inventories
       WHERE research_run_id = $researchRunId
         AND evidence_inventory_id = $evidenceInventoryId
       LIMIT 2`,
      { researchRunId: runId, evidenceInventoryId: inventoryId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("evidence inventory scoped identity is invalid");
    return normalizeInventory(rows[0]);
  }

  async function listPlanPartitions(researchRunId, evidencePlanId) {
    const rows = await queryRows(
      connection,
      `SELECT ${PARTITION_COLUMNS}
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
    return Object.freeze(rows.map(normalizePartition));
  }

  async function getPlan(researchRunId, evidencePlanId) {
    const runId = assertResearchRunId(researchRunId);
    const planId = assertEvidencePlanId(evidencePlanId);
    const rows = await queryRows(
      connection,
      `SELECT ${PLAN_COLUMNS}
       FROM evidence_plans
       WHERE research_run_id = $researchRunId
         AND evidence_plan_id = $evidencePlanId
       LIMIT 2`,
      { researchRunId: runId, evidencePlanId: planId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("evidence plan scoped identity is invalid");
    return normalizePlan(rows[0], await listPlanPartitions(runId, planId));
  }

  return Object.freeze({
    schemaVersion: RESEARCH_EVIDENCE_SCHEMA_VERSION,

    async createEvidenceInventory({ researchRunId, inventory }) {
      const runId = await requireRun(researchRunId);
      const inventoryJson = serializeJsonObject(inventory, "inventory");
      const evidenceInventoryId = assertEvidenceInventoryId(evidenceInventoryIdFactory());
      const inventoryHash = sha256(inventoryJson);
      const timestamp = assertSafeTimestamp(now(), "now()");

      await inTransaction(connection, async () => {
        await connection.run(
          `INSERT INTO evidence_inventories (
             evidence_inventory_id, research_run_id, created_at_ms, inventory_json, inventory_hash
           ) VALUES (
             $evidenceInventoryId, $researchRunId, $createdAtMs, $inventoryJson, $inventoryHash
           )`,
          {
            evidenceInventoryId,
            researchRunId: runId,
            createdAtMs: timestamp,
            inventoryJson,
            inventoryHash
          }
        );
        await touchRun(runId, timestamp);
      });

      return Object.freeze({
        evidenceInventoryId,
        researchRunId: runId,
        inventory: parseJsonObject(inventoryJson, "inventory"),
        inventoryHash,
        createdAtMs: timestamp
      });
    },

    async getEvidenceInventory(researchRunId, evidenceInventoryId) {
      return await getInventory(researchRunId, evidenceInventoryId);
    },

    async listEvidenceInventories(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${INVENTORY_COLUMNS}
         FROM evidence_inventories
         WHERE research_run_id = $researchRunId
         ORDER BY created_at_ms ASC, evidence_inventory_id ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      return Object.freeze(rows.map(normalizeInventory));
    },

    async createEvidencePlan({
      researchRunId,
      objectiveVersionId,
      evidenceInventoryId,
      plan,
      partitions
    }) {
      const runId = await requireRun(researchRunId);
      const objectiveId = await requireObjective(runId, objectiveVersionId);
      const inventoryId = assertEvidenceInventoryId(evidenceInventoryId);
      if (!(await getInventory(runId, inventoryId))) {
        throw new Error("Evidence Inventory was not found in this Research Run");
      }
      const planJson = serializeJsonObject(plan, "plan");
      if (!Array.isArray(partitions) || partitions.length < 1 || partitions.length > 3) {
        throw new TypeError("partitions must contain between 1 and 3 partition definitions");
      }

      const seenRoles = new Set();
      const preparedPartitions = partitions.map((entry) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          throw new TypeError("partition definition must be an object");
        }
        const role = assertPartitionRole(entry.role);
        if (seenRoles.has(role)) throw new TypeError(`duplicate partition role ${role}`);
        seenRoles.add(role);
        const partitionJson = serializeJsonObject(entry.partition, "partition");
        return {
          partitionId: assertPartitionId(partitionIdFactory()),
          role,
          partitionJson,
          partitionHash: partitionFingerprint(role, partitionJson)
        };
      });

      const evidencePlanId = assertEvidencePlanId(evidencePlanIdFactory());
      const planHash = planFingerprint(objectiveId, inventoryId, planJson);
      const timestamp = assertSafeTimestamp(now(), "now()");
      let versionNumber;

      await inTransaction(connection, async () => {
        const versionRows = await queryRows(
          connection,
          `SELECT COALESCE(MAX(version_number), 0) AS max_version
           FROM evidence_plans
           WHERE research_run_id = $researchRunId`,
          { researchRunId: runId }
        );
        if (versionRows.length !== 1) throw new Error("evidence plan sequence is invalid");
        versionNumber = assertSafeTimestamp(versionRows[0].max_version, "max evidence plan version") + 1;

        await connection.run(
          `INSERT INTO evidence_plans (
             evidence_plan_id, research_run_id, objective_version_id, evidence_inventory_id,
             version_number, created_at_ms, plan_json, plan_hash
           ) VALUES (
             $evidencePlanId, $researchRunId, $objectiveVersionId, $evidenceInventoryId,
             $versionNumber, $createdAtMs, $planJson, $planHash
           )`,
          {
            evidencePlanId,
            researchRunId: runId,
            objectiveVersionId: objectiveId,
            evidenceInventoryId: inventoryId,
            versionNumber,
            createdAtMs: timestamp,
            planJson,
            planHash
          }
        );

        for (const partition of preparedPartitions) {
          await connection.run(
            `INSERT INTO partitions (
               partition_id, research_run_id, evidence_plan_id, role, partition_json, partition_hash
             ) VALUES (
               $partitionId, $researchRunId, $evidencePlanId, $role, $partitionJson, $partitionHash
             )`,
            {
              partitionId: partition.partitionId,
              researchRunId: runId,
              evidencePlanId,
              role: partition.role,
              partitionJson: partition.partitionJson,
              partitionHash: partition.partitionHash
            }
          );
        }
        await touchRun(runId, timestamp);
      });

      return await getPlan(runId, evidencePlanId);
    },

    async getEvidencePlan(researchRunId, evidencePlanId) {
      return await getPlan(researchRunId, evidencePlanId);
    },

    async getCurrentEvidencePlan(researchRunId) {
      const runId = await requireRun(researchRunId);
      const rows = await queryRows(
        connection,
        `SELECT evidence_plan_id
         FROM evidence_plans
         WHERE research_run_id = $researchRunId
         ORDER BY version_number DESC
         LIMIT 1`,
        { researchRunId: runId }
      );
      if (rows.length === 0) return null;
      return await getPlan(runId, String(rows[0].evidence_plan_id));
    },

    async listEvidencePlans(researchRunId, { limit = 50 } = {}) {
      const runId = await requireRun(researchRunId);
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT evidence_plan_id
         FROM evidence_plans
         WHERE research_run_id = $researchRunId
         ORDER BY version_number ASC
         LIMIT ${boundedLimit}`,
        { researchRunId: runId }
      );
      const plans = [];
      for (const row of rows) plans.push(await getPlan(runId, String(row.evidence_plan_id)));
      return Object.freeze(plans);
    },

    async getPartition(researchRunId, partitionId) {
      const runId = assertResearchRunId(researchRunId);
      const scopedPartitionId = assertPartitionId(partitionId);
      const rows = await queryRows(
        connection,
        `SELECT ${PARTITION_COLUMNS}
         FROM partitions
         WHERE research_run_id = $researchRunId
           AND partition_id = $partitionId
         LIMIT 2`,
        { researchRunId: runId, partitionId: scopedPartitionId }
      );
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw new Error("partition scoped identity is invalid");
      return normalizePartition(rows[0]);
    },

    async listPartitions(researchRunId, evidencePlanId) {
      const runId = await requireRun(researchRunId);
      if (!(await getPlan(runId, evidencePlanId))) return Object.freeze([]);
      return await listPlanPartitions(runId, evidencePlanId);
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
