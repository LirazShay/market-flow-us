import { mkdir } from "node:fs/promises";
import path from "node:path";

import { DuckDBInstance } from "@duckdb/node-api";

export const DEFAULT_ORDER_STORE_PATH = "data/ibkr-order-service.duckdb";
export const DRY_RUN_COMPLETE = "DRY_RUN_COMPLETE";

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

const SELECT_BY_REQUEST_ID = `
SELECT request_id,
       intent_fingerprint,
       local_order_id,
       lifecycle_state,
       created_at_ms,
       updated_at_ms
FROM execution_orders
WHERE request_id = $requestId
LIMIT 1`;

const INSERT_DRY_RUN = `
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

function toSafeTimestamp(value, label) {
  const number = typeof value === "bigint" ? Number(value) : Number(value);
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

  return Object.freeze({
    async getByRequestId(requestId) {
      const boundedRequestId = assertNonEmptyBoundedString(requestId, {
        label: "requestId",
        maxChars: 128
      });
      const rows = await queryRows(connection, SELECT_BY_REQUEST_ID, {
        requestId: boundedRequestId
      });
      if (rows.length === 0) return null;
      if (rows.length !== 1) {
        throw new Error("execution_orders violated request_id uniqueness");
      }
      return normalizeRow(rows[0]);
    },

    async insertDryRun({ requestId, intentFingerprint, localOrderId }) {
      const boundedRequestId = assertNonEmptyBoundedString(requestId, {
        label: "requestId",
        maxChars: 128
      });
      const fingerprint = assertFingerprint(intentFingerprint);
      const orderId = assertLocalOrderId(localOrderId);
      const timestamp = toSafeTimestamp(now(), "now()");

      await connection.run(INSERT_DRY_RUN, {
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

    async close() {
      if (closed) return;
      closed = true;
      connection.closeSync();
      instance.closeSync();
    }
  });
}
