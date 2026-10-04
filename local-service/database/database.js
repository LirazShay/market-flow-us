import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  CREATE_SAVED_QUERIES_TABLE,
  CREATE_SCHEMA_STATEMENTS,
  LEGACY_SCHEMA_VERSION,
  LEGACY_V1_REQUIRED_TABLES,
  REQUIRED_TABLES,
  SCHEMA_VERSION
} from "./schema.js";

export const DUCKDB_HARDENING = Object.freeze({
  enable_external_access: "false",
  allow_community_extensions: "false",
  autoinstall_known_extensions: "false",
  autoload_known_extensions: "false",
  allow_persistent_secrets: "false",
  allow_unsigned_extensions: "false",
  allow_unredacted_secrets: "false"
});

export class DatabaseSchemaUnsupportedError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseSchemaUnsupportedError";
    this.code = "DB_SCHEMA_UNSUPPORTED";
  }
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

function assertRequiredTables(presentNames, requiredTables, version) {
  const present = new Set(presentNames);
  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new DatabaseSchemaUnsupportedError(
      `Schema v${version} is missing required tables: ${missing.join(", ")}`
    );
  }
}

async function readSchemaInfo(connection) {
  const rows = await queryRows(
    connection,
    "SELECT schema_version, created_at_ms, product_version FROM schema_info"
  );
  if (rows.length !== 1) {
    throw new DatabaseSchemaUnsupportedError(
      "Expected exactly one schema_info row"
    );
  }

  const schemaVersion = Number(rows[0].schema_version);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new DatabaseSchemaUnsupportedError("Persisted schema version is invalid");
  }

  return {
    schemaVersion,
    createdAtMs: rows[0].created_at_ms,
    productVersion: rows[0].product_version
  };
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original migration/bootstrap error.
  }
}

async function migrateV1ToV2(
  connection,
  { productVersion, migrationFault = null }
) {
  await connection.run("BEGIN TRANSACTION");
  try {
    await connection.run(CREATE_SAVED_QUERIES_TABLE);
    migrationFault?.hit?.("M1");

    await connection.run(
      `UPDATE schema_info
       SET schema_version = $schemaVersion,
           product_version = $productVersion`,
      {
        schemaVersion: SCHEMA_VERSION,
        productVersion
      }
    );
    migrationFault?.hit?.("M2");

    await connection.run("COMMIT");
  } catch (error) {
    await rollbackPreservingOriginal(connection);
    throw error;
  }
}

async function validateOrMigrateExistingSchema(
  connection,
  { productVersion, migrationFault = null }
) {
  const present = await tableNames(connection);
  const info = await readSchemaInfo(connection);

  if (info.schemaVersion === SCHEMA_VERSION) {
    assertRequiredTables(present, REQUIRED_TABLES, SCHEMA_VERSION);
    return;
  }

  if (info.schemaVersion === LEGACY_SCHEMA_VERSION) {
    assertRequiredTables(present, LEGACY_V1_REQUIRED_TABLES, LEGACY_SCHEMA_VERSION);
    if (present.includes("scanner_saved_queries")) {
      throw new DatabaseSchemaUnsupportedError(
        "Schema v1 unexpectedly contains scanner_saved_queries"
      );
    }

    await migrateV1ToV2(connection, { productVersion, migrationFault });
    const migratedInfo = await readSchemaInfo(connection);
    if (migratedInfo.schemaVersion !== SCHEMA_VERSION) {
      throw new DatabaseSchemaUnsupportedError(
        `Migration did not produce schema v${SCHEMA_VERSION}`
      );
    }
    assertRequiredTables(
      await tableNames(connection),
      REQUIRED_TABLES,
      SCHEMA_VERSION
    );
    return;
  }

  throw new DatabaseSchemaUnsupportedError(
    `Unsupported schema version ${info.schemaVersion}; expected ${LEGACY_SCHEMA_VERSION} or ${SCHEMA_VERSION}`
  );
}

async function bootstrapSchema(
  connection,
  { createdAtMs, productVersion, migrationFault = null }
) {
  const existingTables = new Set(await tableNames(connection));

  if (existingTables.has("schema_info")) {
    await validateOrMigrateExistingSchema(connection, {
      productVersion,
      migrationFault
    });
    return;
  }

  if (existingTables.size > 0) {
    throw new DatabaseSchemaUnsupportedError(
      "Database is non-empty but has no MarketScope schema_info table"
    );
  }

  await connection.run("BEGIN TRANSACTION");
  try {
    for (const statement of CREATE_SCHEMA_STATEMENTS) {
      await connection.run(statement);
    }
    await connection.run(
      "INSERT INTO schema_info VALUES ($schemaVersion, $createdAtMs, $productVersion)",
      {
        schemaVersion: SCHEMA_VERSION,
        createdAtMs,
        productVersion
      }
    );
    await connection.run("COMMIT");
  } catch (error) {
    await rollbackPreservingOriginal(connection);
    throw error;
  }
}

async function recoverStaleSessions(connection, nowMs) {
  await connection.run(
    `UPDATE sessions
     SET status = 'interrupted',
         stopped_at_ms = COALESCE(stopped_at_ms, $nowMs),
         stop_reason = COALESCE(stop_reason, 'service_restart')
     WHERE status = 'running'`,
    { nowMs }
  );
}

async function lockConfiguration(connection) {
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

async function ensureParentDirectory(dbPath) {
  if (dbPath === ":memory:") return;
  await mkdir(path.dirname(path.resolve(dbPath)), { recursive: true });
}

export async function openMarketScopeDatabase({
  dbPath,
  productVersion = "0.1.0",
  now = () => Date.now(),
  migrationFault = null
}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath is required");
  }

  await ensureParentDirectory(dbPath);

  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const writerConnection = await instance.connect();
  let viewerReadConnection = null;
  let scannerConnection = null;
  let closed = false;

  try {
    await bootstrapSchema(writerConnection, {
      createdAtMs: now(),
      productVersion,
      migrationFault
    });
    await recoverStaleSessions(writerConnection, now());
    await lockConfiguration(writerConnection);

    viewerReadConnection = await instance.connect();
    scannerConnection = await instance.connect();
  } catch (error) {
    try {
      scannerConnection?.closeSync();
    } catch {
      // Preserve the original database startup error.
    }
    try {
      viewerReadConnection?.closeSync();
    } catch {
      // Preserve the original database startup error.
    }
    try {
      writerConnection.closeSync();
    } catch {
      // Preserve the original database startup error.
    }
    try {
      instance.closeSync();
    } catch {
      // Preserve the original database startup error.
    }
    throw error;
  }

  return {
    instance,
    writerConnection,
    viewerReadConnection,
    scannerConnection,
    ready: true,
    schemaVersion: SCHEMA_VERSION,
    async close() {
      if (closed) return;
      closed = true;
      scannerConnection?.closeSync();
      viewerReadConnection?.closeSync();
      writerConnection.closeSync();
      instance.closeSync();
    }
  };
}
