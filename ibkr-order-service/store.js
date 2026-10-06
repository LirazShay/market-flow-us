import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";

export const DEFAULT_ORDER_STORE_PATH = "data/ibkr-order-service.duckdb";
export const DRY_RUN_COMPLETE = "DRY_RUN_COMPLETE";
export const READY_TO_SUBMIT = "READY_TO_SUBMIT";
export const REPLY_REQUIRED = "REPLY_REQUIRED";
export const SUBMITTED = "SUBMITTED";
export const PROVIDER_REJECTED = "PROVIDER_REJECTED";
export const SUBMIT_FAILED = "SUBMIT_FAILED";
export const ACKNOWLEDGEMENT_UNKNOWN = "ACKNOWLEDGEMENT_UNKNOWN";
export const CANCELLED = "CANCELLED";
export const PARTIALLY_FILLED = "PARTIALLY_FILLED";
export const FILLED = "FILLED";

const LIVE_LIFECYCLE_STATES = new Set([
  READY_TO_SUBMIT,
  REPLY_REQUIRED,
  SUBMITTED,
  PROVIDER_REJECTED,
  SUBMIT_FAILED,
  ACKNOWLEDGEMENT_UNKNOWN,
  CANCELLED,
  PARTIALLY_FILLED,
  FILLED
]);

export const ORDER_STORE_DUCKDB_HARDENING = Object.freeze({
  enable_external_access: "false",
  allow_community_extensions: "false",
  autoinstall_known_extensions: "false",
  autoload_known_extensions: "false",
  allow_persistent_secrets: "false",
  allow_unsigned_extensions: "false",
  allow_unredacted_secrets: "false"
});

const CREATE_EXECUTION_ORDERS_TABLE = `
CREATE TABLE IF NOT EXISTS execution_orders (
  request_id VARCHAR PRIMARY KEY,
  intent_fingerprint VARCHAR NOT NULL,
  local_order_id VARCHAR NOT NULL UNIQUE,
  lifecycle_state VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
)`;

const CREATE_EXECUTION_PROVIDER_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS execution_provider_state (
  local_order_id VARCHAR PRIMARY KEY,
  provider_conid BIGINT NOT NULL,
  requested_quantity DOUBLE NOT NULL,
  provider_order_id VARCHAR,
  reply_id VARCHAR,
  reply_message_ids_json VARCHAR,
  filled_quantity DOUBLE NOT NULL,
  updated_at_ms BIGINT NOT NULL
)`;

const EXECUTION_COLUMNS = `
request_id,
intent_fingerprint,
local_order_id,
lifecycle_state,
created_at_ms,
updated_at_ms`;

const SELECT_BY_REQUEST_ID = `
SELECT ${EXECUTION_COLUMNS}
FROM execution_orders
WHERE request_id = $requestId
LIMIT 1`;

const SELECT_BY_LOCAL_ORDER_ID = `
SELECT ${EXECUTION_COLUMNS}
FROM execution_orders
WHERE local_order_id = $localOrderId
LIMIT 1`;

const SELECT_PROVIDER_STATE = `
SELECT local_order_id,
       provider_conid,
       requested_quantity,
       provider_order_id,
       reply_id,
       reply_message_ids_json,
       filled_quantity,
       updated_at_ms
FROM execution_provider_state
WHERE local_order_id = $localOrderId
LIMIT 1`;

const INSERT_EXECUTION_ORDER = `
INSERT INTO execution_orders (
  request_id,
  intent_fingerprint,
  local_order_id,
  lifecycle_state,
  created_at_ms,
  updated_at_ms
)
VALUES (
  $requestId,
  $intentFingerprint,
  $localOrderId,
  $lifecycleState,
  $createdAtMs,
  $updatedAtMs
)`;

const INSERT_PROVIDER_STATE = `
INSERT INTO execution_provider_state (
  local_order_id,
  provider_conid,
  requested_quantity,
  provider_order_id,
  reply_id,
  reply_message_ids_json,
  filled_quantity,
  updated_at_ms
)
VALUES (
  $localOrderId,
  $providerConid,
  $requestedQuantity,
  NULL,
  NULL,
  NULL,
  0,
  $updatedAtMs
)`;

const UPDATE_EXECUTION_STATE = `
UPDATE execution_orders
SET lifecycle_state = $lifecycleState,
    updated_at_ms = $updatedAtMs
WHERE local_order_id = $localOrderId`;

const UPDATE_PROVIDER_STATE = `
UPDATE execution_provider_state
SET provider_order_id = $providerOrderId,
    reply_id = $replyId,
    reply_message_ids_json = $replyMessageIdsJson,
    filled_quantity = $filledQuantity,
    updated_at_ms = $updatedAtMs
WHERE local_order_id = $localOrderId`;

function assertNonEmptyBoundedString(value, { label, maxChars }) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > maxChars
    || value.trim() !== value
  ) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maxChars} characters`);
  }
  return value;
}

function optionalBoundedString(value, { label, maxChars }) {
  if (value === null || value === undefined) return null;
  return assertNonEmptyBoundedString(value, { label, maxChars });
}

function assertFingerprint(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError("intentFingerprint must be a lowercase SHA-256 hex string");
  }
  return value;
}

function assertLocalOrderId(value) {
  if (typeof value !== "string" || !/^ord_[0-9a-f-]{36}$/u.test(value)) {
    throw new TypeError("localOrderId must be an ord_ prefixed UUID");
  }
  return value;
}

function assertProviderConid(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("providerConid must be a positive safe integer");
  }
  return value;
}

function assertPositiveFinite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`);
  }
  return value;
}

function assertLiveLifecycleState(value) {
  if (!LIVE_LIFECYCLE_STATES.has(value)) {
    throw new TypeError("lifecycleState is not a supported LIVE state");
  }
  return value;
}

function assertReplyMessageIds(value) {
  if (!Array.isArray(value) || value.length > 16) {
    throw new TypeError("replyMessageIds must be an array of at most 16 IDs");
  }
  const ids = value.map((id) => assertNonEmptyBoundedString(id, {
    label: "replyMessageId",
    maxChars: 64
  }));
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("replyMessageIds must be unique");
  }
  return Object.freeze(ids);
}

function assertFilledQuantity(value, requestedQuantity) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
    || value > requestedQuantity
  ) {
    throw new TypeError("filledQuantity must be finite and within requested quantity");
  }
  return value;
}

function toSafeTimestamp(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function normalizeRow(row) {
  return Object.freeze({
    requestId: String(row.request_id),
    intentFingerprint: String(row.intent_fingerprint),
    localOrderId: String(row.local_order_id),
    lifecycleState: String(row.lifecycle_state),
    createdAtMs: toSafeTimestamp(row.created_at_ms, "createdAtMs"),
    updatedAtMs: toSafeTimestamp(row.updated_at_ms, "updatedAtMs")
  });
}

function parseReplyMessageIds(value) {
  if (value === null || value === undefined) return Object.freeze([]);
  if (typeof value !== "string") {
    throw new Error("execution_provider_state reply_message_ids_json is invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("execution_provider_state reply_message_ids_json is invalid");
  }
  return assertReplyMessageIds(parsed);
}

function normalizeProviderRow(row) {
  const requestedQuantity = assertPositiveFinite(Number(row.requested_quantity), "requestedQuantity");
  return Object.freeze({
    localOrderId: String(row.local_order_id),
    providerConid: assertProviderConid(Number(row.provider_conid)),
    requestedQuantity,
    providerOrderId: row.provider_order_id === null ? null : String(row.provider_order_id),
    replyId: row.reply_id === null ? null : String(row.reply_id),
    replyMessageIds: parseReplyMessageIds(row.reply_message_ids_json),
    filledQuantity: assertFilledQuantity(Number(row.filled_quantity), requestedQuantity),
    updatedAtMs: toSafeTimestamp(row.updated_at_ms, "updatedAtMs")
  });
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjects();
}

async function ensureParentDirectory(dbPath) {
  if (dbPath === ":memory:") return;
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}

async function lockConfiguration(connection) {
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

async function inTransaction(connection, operation) {
  await connection.run("BEGIN TRANSACTION");
  try {
    const result = await operation();
    await connection.run("COMMIT");
    return result;
  } catch (error) {
    try {
      await connection.run("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  }
}

export async function openOrderExecutionStore({
  dbPath = DEFAULT_ORDER_STORE_PATH,
  now = Date.now
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  await ensureParentDirectory(dbPath);

  const instance = await DuckDBInstance.create(dbPath, ORDER_STORE_DUCKDB_HARDENING);
  const connection = await instance.connect();
  let closed = false;

  try {
    await connection.run(CREATE_EXECUTION_ORDERS_TABLE);
    await connection.run(CREATE_EXECUTION_PROVIDER_STATE_TABLE);
    await lockConfiguration(connection);
  } catch (error) {
    try {
      connection.closeSync();
    } catch {
      // Preserve the original startup error.
    }
    try {
      instance.closeSync();
    } catch {
      // Preserve the original startup error.
    }
    throw error;
  }

  async function getOne(sql, values, uniquenessMessage, normalizer) {
    const rows = await queryRows(connection, sql, values);
    if (rows.length === 0) return null;
    if (rows.length !== 1) {
      throw new Error(uniquenessMessage);
    }
    return normalizer(rows[0]);
  }

  return Object.freeze({
    async getByRequestId(requestId) {
      const boundedRequestId = assertNonEmptyBoundedString(requestId, {
        label: "requestId",
        maxChars: 128
      });
      return getOne(
        SELECT_BY_REQUEST_ID,
        { requestId: boundedRequestId },
        "execution_orders violated request_id uniqueness",
        normalizeRow
      );
    },

    async getByLocalOrderId(localOrderId) {
      const orderId = assertLocalOrderId(localOrderId);
      return getOne(
        SELECT_BY_LOCAL_ORDER_ID,
        { localOrderId: orderId },
        "execution_orders violated local_order_id uniqueness",
        normalizeRow
      );
    },

    async getProviderState(localOrderId) {
      const orderId = assertLocalOrderId(localOrderId);
      return getOne(
        SELECT_PROVIDER_STATE,
        { localOrderId: orderId },
        "execution_provider_state violated local_order_id uniqueness",
        normalizeProviderRow
      );
    },

    async insertDryRun({ requestId, intentFingerprint, localOrderId }) {
      const boundedRequestId = assertNonEmptyBoundedString(requestId, {
        label: "requestId",
        maxChars: 128
      });
      const fingerprint = assertFingerprint(intentFingerprint);
      const orderId = assertLocalOrderId(localOrderId);
      const timestamp = toSafeTimestamp(now(), "now()");

      await connection.run(INSERT_EXECUTION_ORDER, {
        requestId: boundedRequestId,
        intentFingerprint: fingerprint,
        localOrderId: orderId,
        lifecycleState: DRY_RUN_COMPLETE,
        createdAtMs: timestamp,
        updatedAtMs: timestamp
      });

      return Object.freeze({
        requestId: boundedRequestId,
        intentFingerprint: fingerprint,
        localOrderId: orderId,
        lifecycleState: DRY_RUN_COMPLETE,
        createdAtMs: timestamp,
        updatedAtMs: timestamp
      });
    },

    async insertLive({
      requestId,
      intentFingerprint,
      localOrderId,
      providerConid,
      requestedQuantity,
      lifecycleState = READY_TO_SUBMIT
    }) {
      const boundedRequestId = assertNonEmptyBoundedString(requestId, {
        label: "requestId",
        maxChars: 128
      });
      const fingerprint = assertFingerprint(intentFingerprint);
      const orderId = assertLocalOrderId(localOrderId);
      const conid = assertProviderConid(providerConid);
      const quantity = assertPositiveFinite(requestedQuantity, "requestedQuantity");
      const state = assertLiveLifecycleState(lifecycleState);
      const timestamp = toSafeTimestamp(now(), "now()");

      await inTransaction(connection, async () => {
        await connection.run(INSERT_EXECUTION_ORDER, {
          requestId: boundedRequestId,
          intentFingerprint: fingerprint,
          localOrderId: orderId,
          lifecycleState: state,
          createdAtMs: timestamp,
          updatedAtMs: timestamp
        });
        await connection.run(INSERT_PROVIDER_STATE, {
          localOrderId: orderId,
          providerConid: conid,
          requestedQuantity: quantity,
          updatedAtMs: timestamp
        });
      });

      return Object.freeze({
        execution: Object.freeze({
          requestId: boundedRequestId,
          intentFingerprint: fingerprint,
          localOrderId: orderId,
          lifecycleState: state,
          createdAtMs: timestamp,
          updatedAtMs: timestamp
        }),
        provider: Object.freeze({
          localOrderId: orderId,
          providerConid: conid,
          requestedQuantity: quantity,
          providerOrderId: null,
          replyId: null,
          replyMessageIds: Object.freeze([]),
          filledQuantity: 0,
          updatedAtMs: timestamp
        })
      });
    },

    async updateLiveState({
      localOrderId,
      lifecycleState,
      providerOrderId,
      replyId,
      replyMessageIds,
      filledQuantity
    }) {
      const orderId = assertLocalOrderId(localOrderId);
      const state = assertLiveLifecycleState(lifecycleState);
      const currentProvider = await getOne(
        SELECT_PROVIDER_STATE,
        { localOrderId: orderId },
        "execution_provider_state violated local_order_id uniqueness",
        normalizeProviderRow
      );
      if (!currentProvider) {
        throw new Error("LIVE provider state was not found");
      }

      const nextProviderOrderId = providerOrderId === undefined
        ? currentProvider.providerOrderId
        : optionalBoundedString(providerOrderId, { label: "providerOrderId", maxChars: 256 });
      const nextReplyId = replyId === undefined
        ? currentProvider.replyId
        : optionalBoundedString(replyId, { label: "replyId", maxChars: 256 });
      const nextReplyMessageIds = replyMessageIds === undefined
        ? currentProvider.replyMessageIds
        : assertReplyMessageIds(replyMessageIds);
      const nextFilledQuantity = filledQuantity === undefined
        ? currentProvider.filledQuantity
        : assertFilledQuantity(filledQuantity, currentProvider.requestedQuantity);
      const timestamp = toSafeTimestamp(now(), "now()");
      const replyMessageIdsJson = nextReplyMessageIds.length === 0
        ? null
        : JSON.stringify(nextReplyMessageIds);

      await inTransaction(connection, async () => {
        await connection.run(UPDATE_EXECUTION_STATE, {
          lifecycleState: state,
          updatedAtMs: timestamp,
          localOrderId: orderId
        });
        await connection.run(UPDATE_PROVIDER_STATE, {
          providerOrderId: nextProviderOrderId,
          replyId: nextReplyId,
          replyMessageIdsJson,
          filledQuantity: nextFilledQuantity,
          updatedAtMs: timestamp,
          localOrderId: orderId
        });
      });

      const execution = await getOne(
        SELECT_BY_LOCAL_ORDER_ID,
        { localOrderId: orderId },
        "execution_orders violated local_order_id uniqueness",
        normalizeRow
      );
      const provider = await getOne(
        SELECT_PROVIDER_STATE,
        { localOrderId: orderId },
        "execution_provider_state violated local_order_id uniqueness",
        normalizeProviderRow
      );
      return Object.freeze({ execution, provider });
    },

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
