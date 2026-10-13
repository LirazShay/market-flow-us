import { DuckDBInstance } from "@duckdb/node-api";
import {
  DEFAULT_RESEARCH_LEDGER_PATH,
  RESEARCH_LEDGER_DUCKDB_HARDENING,
  RESEARCH_LEDGER_SCHEMA_VERSION
} from "./ledger.js";

export const MANAGED_RUN_BUDGET_POLICY_VERSION = "research-managed-budget-policy-v1";

const REQUIRED_TABLES = Object.freeze([
  "experiment_records",
  "research_budget_usage",
  "research_job_info",
  "research_jobs",
  "research_ledger_info",
  "research_runs"
]);
const POLICY_SCOPES = Object.freeze(["run", "job", "request", "sqlAnalysis"]);
const ANALYSIS_OPERATION = "execute_development_research_sql";

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

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("researchRunId must be a run_ prefixed UUID");
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

function assertCount(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} persistence is invalid`);
  }
  return number;
}

function normalizeBudgetScope(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-empty budget object`);
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) throw new TypeError(`${label} must be a non-empty budget object`);
  const normalized = {};
  for (const [dimension, limit] of entries) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(dimension)) {
      throw new TypeError(`${label} contains an invalid budget dimension`);
    }
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new TypeError(`${label}.${dimension} must be a positive safe integer`);
    }
    normalized[dimension] = limit;
  }
  return Object.freeze(normalized);
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

function canonicalJsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  return JSON.stringify(canonicalize(value, label));
}

function parseJsonObject(value, label) {
  if (typeof value !== "string") throw new Error(`${label} persistence is invalid`);
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} persistence is invalid`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return parsed;
}

function budgetPolicyMismatch() {
  const error = new Error("Research Run budget policy does not match the active managed resource policy");
  error.code = "RESEARCH_BUDGET_POLICY_MISMATCH";
  return error;
}

async function validateSchema(connection) {
  const present = new Set(await tableNames(connection));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new Error(`Research run accounting requires tables: ${missing.join(", ")}`);
  }
  const info = await queryRows(connection, "SELECT schema_version FROM research_ledger_info");
  if (info.length !== 1 || Number(info[0].schema_version) !== RESEARCH_LEDGER_SCHEMA_VERSION) {
    throw new Error("Research run accounting requires the supported base research ledger schema");
  }
}

async function readRunPolicyRow(connection, researchRunId) {
  const rows = await queryRows(
    connection,
    `SELECT budget_policy_json
     FROM research_runs
     WHERE research_run_id = $researchRunId
     LIMIT 2`,
    { researchRunId }
  );
  if (rows.length === 0) throw new Error("Research Run was not found");
  if (rows.length !== 1) throw new Error("research_runs violated research_run_id uniqueness");
  return rows[0];
}

async function reconcileBudgetPolicyInTransaction(connection, researchRunId, expectedPolicy, timestamp) {
  const row = await readRunPolicyRow(connection, researchRunId);
  const persisted = parseJsonObject(String(row.budget_policy_json), "budgetPolicy");
  const persistedJson = canonicalJsonObject(persisted, "budgetPolicy");
  const expectedJson = canonicalJsonObject(expectedPolicy, "managed budget policy");

  if (persistedJson === expectedJson) return expectedPolicy;
  if (persistedJson !== "{}") throw budgetPolicyMismatch();

  await connection.run(
    `UPDATE research_runs
     SET budget_policy_json = $budgetPolicyJson,
         updated_at_ms = $updatedAtMs
     WHERE research_run_id = $researchRunId`,
    {
      researchRunId,
      budgetPolicyJson: expectedJson,
      updatedAtMs: timestamp
    }
  );
  return expectedPolicy;
}

function budgetState(runLimits, usageRows) {
  const used = {};
  for (const dimension of Object.keys(runLimits)) used[dimension] = 0;
  for (const row of usageRows) {
    const dimension = String(row.dimension);
    if (!Object.hasOwn(runLimits, dimension)) {
      throw new Error(`Research Run budget usage contains unconfigured dimension ${dimension}`);
    }
    used[dimension] = assertCount(row.consumed, `budget usage ${dimension}`);
  }
  const remaining = Object.fromEntries(
    Object.entries(runLimits).map(([dimension, limit]) => {
      const consumed = used[dimension];
      if (consumed > limit) throw new Error(`Research Run budget usage exceeds ${dimension} policy`);
      return [dimension, limit - consumed];
    })
  );
  return {
    used: Object.freeze(used),
    remaining: Object.freeze(remaining)
  };
}

export function createManagedRunBudgetPolicy(resourcePolicy) {
  if (!resourcePolicy?.budgets || typeof resourcePolicy.budgets !== "object") {
    throw new TypeError("resourcePolicy.budgets is required");
  }
  const budgets = {};
  for (const scope of POLICY_SCOPES) {
    budgets[scope] = normalizeBudgetScope(resourcePolicy.budgets[scope], `resourcePolicy.budgets.${scope}`);
  }
  return Object.freeze({
    contractVersion: MANAGED_RUN_BUDGET_POLICY_VERSION,
    budgets: Object.freeze(budgets)
  });
}

export async function openResearchRunObservability({
  dbPath = DEFAULT_RESEARCH_LEDGER_PATH,
  now = Date.now
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const instance = await DuckDBInstance.create(dbPath, RESEARCH_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    await validateSchema(connection);
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  return Object.freeze({
    async reconcileBudgetPolicy(researchRunId, expectedPolicy) {
      const runId = assertResearchRunId(researchRunId);
      const timestamp = assertSafeTimestamp(now(), "now()");
      return await inTransaction(
        connection,
        () => reconcileBudgetPolicyInTransaction(connection, runId, expectedPolicy, timestamp)
      );
    },

    async getRunAccounting(researchRunId, expectedPolicy) {
      const runId = assertResearchRunId(researchRunId);
      const timestamp = assertSafeTimestamp(now(), "now()");
      return await inTransaction(connection, async () => {
        const policy = await reconcileBudgetPolicyInTransaction(
          connection,
          runId,
          expectedPolicy,
          timestamp
        );
        const usageRows = await queryRows(
          connection,
          `SELECT dimension, consumed
           FROM research_budget_usage
           WHERE scope_kind = 'RUN'
             AND scope_id = $researchRunId
           ORDER BY dimension ASC`,
          { researchRunId: runId }
        );
        const jobs = await queryRows(
          connection,
          `SELECT
             COUNT(*) AS job_count,
             SUM(CASE WHEN operation = $analysisOperation THEN 1 ELSE 0 END) AS analysis_count
           FROM research_jobs
           WHERE research_run_id = $researchRunId`,
          { researchRunId: runId, analysisOperation: ANALYSIS_OPERATION }
        );
        const experiments = await queryRows(
          connection,
          `SELECT COUNT(*) AS experiment_count
           FROM experiment_records
           WHERE research_run_id = $researchRunId`,
          { researchRunId: runId }
        );
        if (jobs.length !== 1 || experiments.length !== 1) {
          throw new Error("Research Run accounting count query returned invalid cardinality");
        }
        const state = budgetState(policy.budgets.run, usageRows);
        return Object.freeze({
          budget: Object.freeze({
            policy,
            accountingAvailable: true,
            used: state.used,
            remaining: state.remaining
          }),
          counts: Object.freeze({
            experiments: assertCount(experiments[0].experiment_count, "experiment count"),
            analyses: assertCount(jobs[0].analysis_count ?? 0, "analysis count"),
            jobs: assertCount(jobs[0].job_count, "job count")
          })
        });
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
