import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";

export const DEFAULT_TRADING_LEDGER_PATH = "data/trading-ledger.duckdb";
export const TRADING_LEDGER_SCHEMA_VERSION = 1;
export const TRADING_LEDGER_DUCKDB_HARDENING = Object.freeze({ ...DUCKDB_HARDENING });

const REQUIRED_TABLES = Object.freeze([
  "candidate_observations",
  "decision_records",
  "episode_outcomes",
  "order_references",
  "policy_versions",
  "position_states",
  "trade_episodes",
  "trading_ledger_info",
  "trading_runs"
]);
const TRADING_MODES = new Set(["SHADOW", "SYNTHETIC", "DRY_RUN", "LIVE"]);
const RUN_STATES = new Set(["ACTIVE", "PAUSED", "COMPLETED", "FAILED"]);
const EPISODE_STATES = new Set(["ACTIVE", "COMPLETED", "FAILED"]);
const MAX_JSON_CHARS = 262_144;
const SENSITIVE_KEY = /(account|authorization|cookie|credential|password|secret|session|token|chain.?of.?thought|reasoning|raw.?authenticated|authenticated.?dump|authenticated.?provider.?dump|raw.?provider.?dump)/iu;

const CREATE_TRADING_LEDGER_INFO = `
CREATE TABLE trading_ledger_info (
  schema_version INTEGER PRIMARY KEY,
  created_at_ms BIGINT NOT NULL
)`;
const CREATE_POLICY_VERSIONS = `
CREATE TABLE policy_versions (
  policy_version_id VARCHAR PRIMARY KEY,
  policy_json VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL
)`;
const CREATE_TRADING_RUNS = `
CREATE TABLE trading_runs (
  trading_run_id VARCHAR PRIMARY KEY,
  policy_version_id VARCHAR NOT NULL,
  mode VARCHAR NOT NULL,
  lifecycle_state VARCHAR NOT NULL,
  environment_snapshot_json VARCHAR NOT NULL,
  risk_envelope_json VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
)`;
const CREATE_TRADE_EPISODES = `
CREATE TABLE trade_episodes (
  trade_episode_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  policy_version_id VARCHAR NOT NULL,
  lifecycle_state VARCHAR NOT NULL,
  candidate_key VARCHAR NOT NULL,
  candidate_provenance_json VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  completed_at_ms BIGINT
)`;
const CREATE_CANDIDATE_OBSERVATIONS = `
CREATE TABLE candidate_observations (
  candidate_observation_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  trade_episode_id VARCHAR NOT NULL,
  observed_at_ms BIGINT NOT NULL,
  observation_json VARCHAR NOT NULL
)`;
const CREATE_DECISION_RECORDS = `
CREATE TABLE decision_records (
  decision_record_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  trade_episode_id VARCHAR NOT NULL,
  decided_at_ms BIGINT NOT NULL,
  decision_type VARCHAR NOT NULL,
  reason_code VARCHAR NOT NULL,
  evidence_json VARCHAR NOT NULL
)`;
const CREATE_ORDER_REFERENCES = `
CREATE TABLE order_references (
  order_reference_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  trade_episode_id VARCHAR NOT NULL,
  recorded_at_ms BIGINT NOT NULL,
  local_order_id VARCHAR NOT NULL,
  request_id VARCHAR NOT NULL,
  lifecycle_state VARCHAR NOT NULL
)`;
const CREATE_POSITION_STATES = `
CREATE TABLE position_states (
  position_state_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  trade_episode_id VARCHAR NOT NULL,
  observed_at_ms BIGINT NOT NULL,
  state_json VARCHAR NOT NULL
)`;
const CREATE_EPISODE_OUTCOMES = `
CREATE TABLE episode_outcomes (
  episode_outcome_id VARCHAR PRIMARY KEY,
  trading_run_id VARCHAR NOT NULL,
  trade_episode_id VARCHAR UNIQUE NOT NULL,
  completed_at_ms BIGINT NOT NULL,
  reason_code VARCHAR NOT NULL,
  outcome_json VARCHAR NOT NULL,
  evidence_json VARCHAR NOT NULL
)`;

const POLICY_COLUMNS = `policy_version_id, policy_json, created_at_ms`;
const RUN_COLUMNS = `
trading_run_id,
policy_version_id,
mode,
lifecycle_state,
environment_snapshot_json,
risk_envelope_json,
created_at_ms,
updated_at_ms`;
const EPISODE_COLUMNS = `
trade_episode_id,
trading_run_id,
policy_version_id,
lifecycle_state,
candidate_key,
candidate_provenance_json,
created_at_ms,
updated_at_ms,
completed_at_ms`;
const OBSERVATION_COLUMNS = `
candidate_observation_id,
trading_run_id,
trade_episode_id,
observed_at_ms,
observation_json`;
const DECISION_COLUMNS = `
decision_record_id,
trading_run_id,
trade_episode_id,
decided_at_ms,
decision_type,
reason_code,
evidence_json`;
const ORDER_REFERENCE_COLUMNS = `
order_reference_id,
trading_run_id,
trade_episode_id,
recorded_at_ms,
local_order_id,
request_id,
lifecycle_state`;
const POSITION_STATE_COLUMNS = `
position_state_id,
trading_run_id,
trade_episode_id,
observed_at_ms,
state_json`;
const OUTCOME_COLUMNS = `
episode_outcome_id,
trading_run_id,
trade_episode_id,
completed_at_ms,
reason_code,
outcome_json,
evidence_json`;

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
    // Preserve the original transaction/bootstrap failure.
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
      await connection.run(CREATE_TRADING_LEDGER_INFO);
      await connection.run(CREATE_POLICY_VERSIONS);
      await connection.run(CREATE_TRADING_RUNS);
      await connection.run(CREATE_TRADE_EPISODES);
      await connection.run(CREATE_CANDIDATE_OBSERVATIONS);
      await connection.run(CREATE_DECISION_RECORDS);
      await connection.run(CREATE_ORDER_REFERENCES);
      await connection.run(CREATE_POSITION_STATES);
      await connection.run(CREATE_EPISODE_OUTCOMES);
      await connection.run(
        `INSERT INTO trading_ledger_info (schema_version, created_at_ms)
         VALUES ($schemaVersion, $createdAtMs)`,
        { schemaVersion: TRADING_LEDGER_SCHEMA_VERSION, createdAtMs }
      );
    });
    return;
  }

  const presentSet = new Set(present);
  const missing = REQUIRED_TABLES.filter((table) => !presentSet.has(table));
  if (missing.length > 0) {
    throw new Error(`Trading ledger is missing required tables: ${missing.join(", ")}`);
  }
  const rows = await queryRows(connection, "SELECT schema_version FROM trading_ledger_info");
  if (rows.length !== 1) {
    throw new Error("Trading ledger must contain exactly one schema version row");
  }
  const schemaVersion = Number(rows[0].schema_version);
  if (schemaVersion !== TRADING_LEDGER_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported trading ledger schema version ${schemaVersion}; expected ${TRADING_LEDGER_SCHEMA_VERSION}`
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

function assertLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200) {
    throw new TypeError("limit must be an integer between 1 and 200");
  }
  return value;
}

function assertBoundedString(value, { label, maxChars = 512 }) {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || value.length === 0
    || value.length > maxChars
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${label} must be a non-empty trimmed public-safe string of at most ${maxChars} characters`);
  }
  return value;
}

function assertPrefixedUuid(value, prefix, label) {
  if (typeof value !== "string" || !new RegExp(`^${prefix}_[0-9a-f-]{36}$`, "u").test(value)) {
    throw new TypeError(`${label} must be a ${prefix}_ prefixed UUID`);
  }
  return value;
}

const assertPolicyVersionId = (value) => assertPrefixedUuid(value, "pol", "policyVersionId");
const assertTradingRunId = (value) => assertPrefixedUuid(value, "trun", "tradingRunId");
const assertTradeEpisodeId = (value) => assertPrefixedUuid(value, "tep", "tradeEpisodeId");
const assertCandidateObservationId = (value) => assertPrefixedUuid(value, "obs", "candidateObservationId");
const assertDecisionRecordId = (value) => assertPrefixedUuid(value, "dec", "decisionRecordId");
const assertOrderReferenceId = (value) => assertPrefixedUuid(value, "ordref", "orderReferenceId");
const assertPositionStateId = (value) => assertPrefixedUuid(value, "pos", "positionStateId");
const assertEpisodeOutcomeId = (value) => assertPrefixedUuid(value, "out", "episodeOutcomeId");

function assertMode(value) {
  if (!TRADING_MODES.has(value)) throw new TypeError("mode is not a supported TradingRun mode");
  return value;
}

function assertRunState(value) {
  if (!RUN_STATES.has(value)) throw new TypeError("lifecycleState is not a supported TradingRun state");
  return value;
}

function assertEpisodeState(value) {
  if (!EPISODE_STATES.has(value)) throw new TypeError("episode lifecycle state is unsupported");
  return value;
}

function assertPublicSafeValue(value, label, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must contain only finite JSON numbers`);
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} must be public-safe JSON data`);
  }
  if (seen.has(value)) throw new TypeError(`${label} must be JSON serializable`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertPublicSafeValue(item, label, seen);
    seen.delete(value);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      throw new TypeError(`${label} must be public-safe; sensitive key ${key} is not allowed`);
    }
    assertPublicSafeValue(item, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function serializePublicSafeObject(value, label, maxChars = MAX_JSON_CHARS) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON object`);
  }
  assertPublicSafeValue(value, label);
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
  assertPublicSafeValue(parsed, label);
  return parsed;
}

function normalizePolicy(row) {
  return Object.freeze({
    policyVersionId: assertPolicyVersionId(String(row.policy_version_id)),
    policy: parseJsonObject(row.policy_json, "policy"),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs")
  });
}

function normalizeRun(row) {
  return Object.freeze({
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    policyVersionId: assertPolicyVersionId(String(row.policy_version_id)),
    mode: assertMode(String(row.mode)),
    lifecycleState: assertRunState(String(row.lifecycle_state)),
    environmentSnapshot: parseJsonObject(row.environment_snapshot_json, "environmentSnapshot"),
    riskEnvelope: parseJsonObject(row.risk_envelope_json, "riskEnvelope"),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs"),
    updatedAtMs: assertSafeTimestamp(row.updated_at_ms, "updatedAtMs")
  });
}

function normalizeEpisode(row) {
  return Object.freeze({
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    policyVersionId: assertPolicyVersionId(String(row.policy_version_id)),
    lifecycleState: assertEpisodeState(String(row.lifecycle_state)),
    candidateKey: assertBoundedString(String(row.candidate_key), { label: "candidateKey", maxChars: 256 }),
    candidateProvenance: parseJsonObject(row.candidate_provenance_json, "candidateProvenance"),
    createdAtMs: assertSafeTimestamp(row.created_at_ms, "createdAtMs"),
    updatedAtMs: assertSafeTimestamp(row.updated_at_ms, "updatedAtMs"),
    completedAtMs: row.completed_at_ms === null ? null : assertSafeTimestamp(row.completed_at_ms, "completedAtMs")
  });
}

function normalizeObservation(row) {
  return Object.freeze({
    candidateObservationId: assertCandidateObservationId(String(row.candidate_observation_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    observedAtMs: assertSafeTimestamp(row.observed_at_ms, "observedAtMs"),
    observation: parseJsonObject(row.observation_json, "observation")
  });
}

function normalizeDecision(row) {
  return Object.freeze({
    decisionRecordId: assertDecisionRecordId(String(row.decision_record_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    decidedAtMs: assertSafeTimestamp(row.decided_at_ms, "decidedAtMs"),
    decisionType: assertBoundedString(String(row.decision_type), { label: "decisionType", maxChars: 128 }),
    reasonCode: assertBoundedString(String(row.reason_code), { label: "reasonCode", maxChars: 128 }),
    evidence: parseJsonObject(row.evidence_json, "evidence")
  });
}

function normalizeOrderReference(row) {
  return Object.freeze({
    orderReferenceId: assertOrderReferenceId(String(row.order_reference_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    recordedAtMs: assertSafeTimestamp(row.recorded_at_ms, "recordedAtMs"),
    localOrderId: assertBoundedString(String(row.local_order_id), { label: "localOrderId", maxChars: 256 }),
    requestId: assertBoundedString(String(row.request_id), { label: "requestId", maxChars: 256 }),
    lifecycleState: assertBoundedString(String(row.lifecycle_state), { label: "lifecycleState", maxChars: 128 })
  });
}

function normalizePositionState(row) {
  return Object.freeze({
    positionStateId: assertPositionStateId(String(row.position_state_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    observedAtMs: assertSafeTimestamp(row.observed_at_ms, "observedAtMs"),
    state: parseJsonObject(row.state_json, "state")
  });
}

function normalizeOutcome(row) {
  return Object.freeze({
    episodeOutcomeId: assertEpisodeOutcomeId(String(row.episode_outcome_id)),
    tradingRunId: assertTradingRunId(String(row.trading_run_id)),
    tradeEpisodeId: assertTradeEpisodeId(String(row.trade_episode_id)),
    completedAtMs: assertSafeTimestamp(row.completed_at_ms, "completedAtMs"),
    reasonCode: assertBoundedString(String(row.reason_code), { label: "reasonCode", maxChars: 128 }),
    outcome: parseJsonObject(row.outcome_json, "outcome"),
    evidence: parseJsonObject(row.evidence_json, "evidence")
  });
}

export async function openTradingLedger({
  dbPath = DEFAULT_TRADING_LEDGER_PATH,
  now = Date.now,
  policyVersionIdFactory = () => `pol_${randomUUID()}`,
  tradingRunIdFactory = () => `trun_${randomUUID()}`,
  tradeEpisodeIdFactory = () => `tep_${randomUUID()}`,
  candidateObservationIdFactory = () => `obs_${randomUUID()}`,
  decisionRecordIdFactory = () => `dec_${randomUUID()}`,
  orderReferenceIdFactory = () => `ordref_${randomUUID()}`,
  positionStateIdFactory = () => `pos_${randomUUID()}`,
  episodeOutcomeIdFactory = () => `out_${randomUUID()}`
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) throw new TypeError("dbPath is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  for (const [label, factory] of [
    ["policyVersionIdFactory", policyVersionIdFactory],
    ["tradingRunIdFactory", tradingRunIdFactory],
    ["tradeEpisodeIdFactory", tradeEpisodeIdFactory],
    ["candidateObservationIdFactory", candidateObservationIdFactory],
    ["decisionRecordIdFactory", decisionRecordIdFactory],
    ["orderReferenceIdFactory", orderReferenceIdFactory],
    ["positionStateIdFactory", positionStateIdFactory],
    ["episodeOutcomeIdFactory", episodeOutcomeIdFactory]
  ]) {
    if (typeof factory !== "function") throw new TypeError(`${label} must be a function`);
  }

  await ensureParentDirectory(dbPath);
  const instance = await DuckDBInstance.create(dbPath, TRADING_LEDGER_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    await bootstrapOrValidate(connection, assertSafeTimestamp(now(), "now()"));
    await lockConfiguration(connection);
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }

  async function getPolicy(policyVersionId) {
    const id = assertPolicyVersionId(policyVersionId);
    const rows = await queryRows(
      connection,
      `SELECT ${POLICY_COLUMNS} FROM policy_versions WHERE policy_version_id = $policyVersionId LIMIT 2`,
      { policyVersionId: id }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("policy_versions violated policy_version_id uniqueness");
    return normalizePolicy(rows[0]);
  }

  async function getRun(tradingRunId) {
    const id = assertTradingRunId(tradingRunId);
    const rows = await queryRows(
      connection,
      `SELECT ${RUN_COLUMNS} FROM trading_runs WHERE trading_run_id = $tradingRunId LIMIT 2`,
      { tradingRunId: id }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("trading_runs violated trading_run_id uniqueness");
    return normalizeRun(rows[0]);
  }

  async function getEpisode(tradingRunId, tradeEpisodeId) {
    const runId = assertTradingRunId(tradingRunId);
    const episodeId = assertTradeEpisodeId(tradeEpisodeId);
    const rows = await queryRows(
      connection,
      `SELECT ${EPISODE_COLUMNS}
       FROM trade_episodes
       WHERE trading_run_id = $tradingRunId AND trade_episode_id = $tradeEpisodeId
       LIMIT 2`,
      { tradingRunId: runId, tradeEpisodeId: episodeId }
    );
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new Error("trade_episodes violated scoped identity uniqueness");
    return normalizeEpisode(rows[0]);
  }

  async function requireRun(tradingRunId) {
    const runId = assertTradingRunId(tradingRunId);
    const run = await getRun(runId);
    if (!run) throw new Error("Trading Run was not found");
    return run;
  }

  async function requireEpisode(tradingRunId, tradeEpisodeId) {
    const runId = assertTradingRunId(tradingRunId);
    const episodeId = assertTradeEpisodeId(tradeEpisodeId);
    const episode = await getEpisode(runId, episodeId);
    if (!episode) throw new Error("Trade Episode does not belong to the supplied Trading Run");
    return episode;
  }

  async function selectScopedRows(table, columns, tradingRunId, tradeEpisodeId, orderBy) {
    return queryRows(
      connection,
      `SELECT ${columns}
       FROM ${table}
       WHERE trading_run_id = $tradingRunId AND trade_episode_id = $tradeEpisodeId
       ORDER BY ${orderBy}`,
      { tradingRunId, tradeEpisodeId }
    );
  }

  return Object.freeze({
    schemaVersion: TRADING_LEDGER_SCHEMA_VERSION,

    async createPolicyVersion({ policy }) {
      const policyJson = serializePublicSafeObject(policy, "policy");
      const policyVersionId = assertPolicyVersionId(policyVersionIdFactory());
      const createdAtMs = assertSafeTimestamp(now(), "now()");
      await connection.run(
        `INSERT INTO policy_versions (policy_version_id, policy_json, created_at_ms)
         VALUES ($policyVersionId, $policyJson, $createdAtMs)`,
        { policyVersionId, policyJson, createdAtMs }
      );
      return Object.freeze({
        policyVersionId,
        policy: parseJsonObject(policyJson, "policy"),
        createdAtMs
      });
    },

    async getPolicyVersion(policyVersionId) {
      return getPolicy(policyVersionId);
    },

    async replacePolicyVersion(policyVersionId, policy) {
      const id = assertPolicyVersionId(policyVersionId);
      const policyJson = serializePublicSafeObject(policy, "policy");
      if (!(await getPolicy(id))) throw new Error("PolicyVersion was not found");
      const used = await queryRows(
        connection,
        "SELECT COUNT(*) AS count FROM trading_runs WHERE policy_version_id = $policyVersionId",
        { policyVersionId: id }
      );
      if (Number(used[0]?.count ?? 0) > 0) {
        throw new Error("PolicyVersion is immutable once in use by a Trading Run");
      }
      await connection.run(
        "UPDATE policy_versions SET policy_json = $policyJson WHERE policy_version_id = $policyVersionId",
        { policyVersionId: id, policyJson }
      );
      return getPolicy(id);
    },

    async createTradingRun({
      policyVersionId,
      mode,
      lifecycleState = "ACTIVE",
      environmentSnapshot = {},
      riskEnvelope = {}
    }) {
      const policyId = assertPolicyVersionId(policyVersionId);
      if (!(await getPolicy(policyId))) throw new Error("PolicyVersion was not found");
      const runMode = assertMode(mode);
      const state = assertRunState(lifecycleState);
      const environmentSnapshotJson = serializePublicSafeObject(environmentSnapshot, "environmentSnapshot");
      const riskEnvelopeJson = serializePublicSafeObject(riskEnvelope, "riskEnvelope");
      const tradingRunId = assertTradingRunId(tradingRunIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      await connection.run(
        `INSERT INTO trading_runs (
           trading_run_id, policy_version_id, mode, lifecycle_state,
           environment_snapshot_json, risk_envelope_json, created_at_ms, updated_at_ms
         ) VALUES (
           $tradingRunId, $policyVersionId, $mode, $lifecycleState,
           $environmentSnapshotJson, $riskEnvelopeJson, $createdAtMs, $updatedAtMs
         )`,
        {
          tradingRunId,
          policyVersionId: policyId,
          mode: runMode,
          lifecycleState: state,
          environmentSnapshotJson,
          riskEnvelopeJson,
          createdAtMs: timestamp,
          updatedAtMs: timestamp
        }
      );
      return Object.freeze({
        tradingRunId,
        policyVersionId: policyId,
        mode: runMode,
        lifecycleState: state,
        environmentSnapshot: parseJsonObject(environmentSnapshotJson, "environmentSnapshot"),
        riskEnvelope: parseJsonObject(riskEnvelopeJson, "riskEnvelope"),
        createdAtMs: timestamp,
        updatedAtMs: timestamp
      });
    },

    async getTradingRun(tradingRunId) {
      return getRun(tradingRunId);
    },

    async listTradingRuns({ limit = 50 } = {}) {
      const boundedLimit = assertLimit(limit);
      const rows = await queryRows(
        connection,
        `SELECT ${RUN_COLUMNS}
         FROM trading_runs
         ORDER BY updated_at_ms DESC, trading_run_id ASC
         LIMIT ${boundedLimit}`
      );
      return Object.freeze(rows.map(normalizeRun));
    },

    async createTradeEpisode({ tradingRunId, policyVersionId, candidateKey, candidateProvenance }) {
      const run = await requireRun(tradingRunId);
      const policyId = assertPolicyVersionId(policyVersionId);
      if (run.policyVersionId !== policyId) {
        throw new Error("Trade Episode PolicyVersion must match its Trading Run");
      }
      const boundedCandidateKey = assertBoundedString(candidateKey, { label: "candidateKey", maxChars: 256 });
      const candidateProvenanceJson = serializePublicSafeObject(candidateProvenance, "candidateProvenance");
      const tradeEpisodeId = assertTradeEpisodeId(tradeEpisodeIdFactory());
      const timestamp = assertSafeTimestamp(now(), "now()");
      await connection.run(
        `INSERT INTO trade_episodes (
           trade_episode_id, trading_run_id, policy_version_id, lifecycle_state,
           candidate_key, candidate_provenance_json, created_at_ms, updated_at_ms, completed_at_ms
         ) VALUES (
           $tradeEpisodeId, $tradingRunId, $policyVersionId, 'ACTIVE',
           $candidateKey, $candidateProvenanceJson, $createdAtMs, $updatedAtMs, NULL
         )`,
        {
          tradeEpisodeId,
          tradingRunId: run.tradingRunId,
          policyVersionId: policyId,
          candidateKey: boundedCandidateKey,
          candidateProvenanceJson,
          createdAtMs: timestamp,
          updatedAtMs: timestamp
        }
      );
      return getEpisode(run.tradingRunId, tradeEpisodeId);
    },

    async listTradeEpisodes(tradingRunId) {
      const run = await requireRun(tradingRunId);
      const rows = await queryRows(
        connection,
        `SELECT ${EPISODE_COLUMNS}
         FROM trade_episodes
         WHERE trading_run_id = $tradingRunId
         ORDER BY created_at_ms ASC, trade_episode_id ASC`,
        { tradingRunId: run.tradingRunId }
      );
      return Object.freeze(rows.map(normalizeEpisode));
    },

    async appendCandidateObservation({ tradingRunId, tradeEpisodeId, observedAtMs, observation }) {
      const episode = await requireEpisode(tradingRunId, tradeEpisodeId);
      const timestamp = assertSafeTimestamp(observedAtMs, "observedAtMs");
      const observationJson = serializePublicSafeObject(observation, "observation");
      const candidateObservationId = assertCandidateObservationId(candidateObservationIdFactory());
      await connection.run(
        `INSERT INTO candidate_observations (
           candidate_observation_id, trading_run_id, trade_episode_id, observed_at_ms, observation_json
         ) VALUES ($candidateObservationId, $tradingRunId, $tradeEpisodeId, $observedAtMs, $observationJson)`,
        {
          candidateObservationId,
          tradingRunId: episode.tradingRunId,
          tradeEpisodeId: episode.tradeEpisodeId,
          observedAtMs: timestamp,
          observationJson
        }
      );
      return Object.freeze({
        candidateObservationId,
        tradingRunId: episode.tradingRunId,
        tradeEpisodeId: episode.tradeEpisodeId,
        observedAtMs: timestamp,
        observation: parseJsonObject(observationJson, "observation")
      });
    },

    async appendDecisionRecord({
      tradingRunId,
      tradeEpisodeId,
      decidedAtMs,
      decisionType,
      reasonCode,
      evidence
    }) {
      const episode = await requireEpisode(tradingRunId, tradeEpisodeId);
      const timestamp = assertSafeTimestamp(decidedAtMs, "decidedAtMs");
      const type = assertBoundedString(decisionType, { label: "decisionType", maxChars: 128 });
      const reason = assertBoundedString(reasonCode, { label: "reasonCode", maxChars: 128 });
      const evidenceJson = serializePublicSafeObject(evidence, "evidence");
      const decisionRecordId = assertDecisionRecordId(decisionRecordIdFactory());
      await connection.run(
        `INSERT INTO decision_records (
           decision_record_id, trading_run_id, trade_episode_id, decided_at_ms,
           decision_type, reason_code, evidence_json
         ) VALUES (
           $decisionRecordId, $tradingRunId, $tradeEpisodeId, $decidedAtMs,
           $decisionType, $reasonCode, $evidenceJson
         )`,
        {
          decisionRecordId,
          tradingRunId: episode.tradingRunId,
          tradeEpisodeId: episode.tradeEpisodeId,
          decidedAtMs: timestamp,
          decisionType: type,
          reasonCode: reason,
          evidenceJson
        }
      );
      return Object.freeze({
        decisionRecordId,
        tradingRunId: episode.tradingRunId,
        tradeEpisodeId: episode.tradeEpisodeId,
        decidedAtMs: timestamp,
        decisionType: type,
        reasonCode: reason,
        evidence: parseJsonObject(evidenceJson, "evidence")
      });
    },

    async appendOrderReference({
      tradingRunId,
      tradeEpisodeId,
      recordedAtMs,
      localOrderId,
      requestId,
      lifecycleState
    }) {
      const episode = await requireEpisode(tradingRunId, tradeEpisodeId);
      const timestamp = assertSafeTimestamp(recordedAtMs, "recordedAtMs");
      const localId = assertBoundedString(localOrderId, { label: "localOrderId", maxChars: 256 });
      const request = assertBoundedString(requestId, { label: "requestId", maxChars: 256 });
      const state = assertBoundedString(lifecycleState, { label: "lifecycleState", maxChars: 128 });
      const orderReferenceId = assertOrderReferenceId(orderReferenceIdFactory());
      await connection.run(
        `INSERT INTO order_references (
           order_reference_id, trading_run_id, trade_episode_id, recorded_at_ms,
           local_order_id, request_id, lifecycle_state
         ) VALUES (
           $orderReferenceId, $tradingRunId, $tradeEpisodeId, $recordedAtMs,
           $localOrderId, $requestId, $lifecycleState
         )`,
        {
          orderReferenceId,
          tradingRunId: episode.tradingRunId,
          tradeEpisodeId: episode.tradeEpisodeId,
          recordedAtMs: timestamp,
          localOrderId: localId,
          requestId: request,
          lifecycleState: state
        }
      );
      return Object.freeze({
        orderReferenceId,
        tradingRunId: episode.tradingRunId,
        tradeEpisodeId: episode.tradeEpisodeId,
        recordedAtMs: timestamp,
        localOrderId: localId,
        requestId: request,
        lifecycleState: state
      });
    },

    async appendPositionState({ tradingRunId, tradeEpisodeId, observedAtMs, state }) {
      const episode = await requireEpisode(tradingRunId, tradeEpisodeId);
      const timestamp = assertSafeTimestamp(observedAtMs, "observedAtMs");
      const stateJson = serializePublicSafeObject(state, "state");
      const positionStateId = assertPositionStateId(positionStateIdFactory());
      await connection.run(
        `INSERT INTO position_states (
           position_state_id, trading_run_id, trade_episode_id, observed_at_ms, state_json
         ) VALUES ($positionStateId, $tradingRunId, $tradeEpisodeId, $observedAtMs, $stateJson)`,
        {
          positionStateId,
          tradingRunId: episode.tradingRunId,
          tradeEpisodeId: episode.tradeEpisodeId,
          observedAtMs: timestamp,
          stateJson
        }
      );
      return Object.freeze({
        positionStateId,
        tradingRunId: episode.tradingRunId,
        tradeEpisodeId: episode.tradeEpisodeId,
        observedAtMs: timestamp,
        state: parseJsonObject(stateJson, "state")
      });
    },

    async completeTradeEpisode({
      tradingRunId,
      tradeEpisodeId,
      completedAtMs,
      reasonCode,
      outcome,
      evidence
    }) {
      const episode = await requireEpisode(tradingRunId, tradeEpisodeId);
      if (episode.lifecycleState !== "ACTIVE" || episode.completedAtMs !== null) {
        throw new Error("Trade Episode is not active and cannot be completed again");
      }
      const timestamp = assertSafeTimestamp(completedAtMs, "completedAtMs");
      if (timestamp < episode.createdAtMs) {
        throw new TypeError("completedAtMs cannot precede Trade Episode creation");
      }
      const reason = assertBoundedString(reasonCode, { label: "reasonCode", maxChars: 128 });
      const outcomeJson = serializePublicSafeObject(outcome, "outcome");
      const evidenceJson = serializePublicSafeObject(evidence, "evidence");
      const episodeOutcomeId = assertEpisodeOutcomeId(episodeOutcomeIdFactory());

      await inTransaction(connection, async () => {
        await connection.run(
          `INSERT INTO episode_outcomes (
             episode_outcome_id, trading_run_id, trade_episode_id, completed_at_ms,
             reason_code, outcome_json, evidence_json
           ) VALUES (
             $episodeOutcomeId, $tradingRunId, $tradeEpisodeId, $completedAtMs,
             $reasonCode, $outcomeJson, $evidenceJson
           )`,
          {
            episodeOutcomeId,
            tradingRunId: episode.tradingRunId,
            tradeEpisodeId: episode.tradeEpisodeId,
            completedAtMs: timestamp,
            reasonCode: reason,
            outcomeJson,
            evidenceJson
          }
        );
        await connection.run(
          `UPDATE trade_episodes
           SET lifecycle_state = 'COMPLETED', updated_at_ms = $updatedAtMs, completed_at_ms = $completedAtMs
           WHERE trading_run_id = $tradingRunId
             AND trade_episode_id = $tradeEpisodeId
             AND lifecycle_state = 'ACTIVE'
             AND completed_at_ms IS NULL`,
          {
            tradingRunId: episode.tradingRunId,
            tradeEpisodeId: episode.tradeEpisodeId,
            updatedAtMs: timestamp,
            completedAtMs: timestamp
          }
        );
        const updated = await getEpisode(episode.tradingRunId, episode.tradeEpisodeId);
        if (!updated || updated.lifecycleState !== "COMPLETED" || updated.completedAtMs !== timestamp) {
          throw new Error("Trade Episode completion did not commit atomically");
        }
      });
      return getEpisode(episode.tradingRunId, episode.tradeEpisodeId);
    },

    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      const runId = assertTradingRunId(tradingRunId);
      const episodeId = assertTradeEpisodeId(tradeEpisodeId);
      const episode = await getEpisode(runId, episodeId);
      if (!episode) return null;

      const observations = await selectScopedRows(
        "candidate_observations",
        OBSERVATION_COLUMNS,
        runId,
        episodeId,
        "observed_at_ms ASC, candidate_observation_id ASC"
      );
      const decisions = await selectScopedRows(
        "decision_records",
        DECISION_COLUMNS,
        runId,
        episodeId,
        "decided_at_ms ASC, decision_record_id ASC"
      );
      const orderReferences = await selectScopedRows(
        "order_references",
        ORDER_REFERENCE_COLUMNS,
        runId,
        episodeId,
        "recorded_at_ms ASC, order_reference_id ASC"
      );
      const positionStates = await selectScopedRows(
        "position_states",
        POSITION_STATE_COLUMNS,
        runId,
        episodeId,
        "observed_at_ms ASC, position_state_id ASC"
      );
      const outcomes = await selectScopedRows(
        "episode_outcomes",
        OUTCOME_COLUMNS,
        runId,
        episodeId,
        "completed_at_ms ASC, episode_outcome_id ASC"
      );
      if (outcomes.length > 1) throw new Error("Trade Episode has more than one durable outcome");

      return Object.freeze({
        episode,
        observations: Object.freeze(observations.map(normalizeObservation)),
        decisions: Object.freeze(decisions.map(normalizeDecision)),
        orderReferences: Object.freeze(orderReferences.map(normalizeOrderReference)),
        positionStates: Object.freeze(positionStates.map(normalizePositionState)),
        outcome: outcomes.length === 0 ? null : normalizeOutcome(outcomes[0])
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
