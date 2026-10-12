import { lstat } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";
import {
  DEMO_BUY_TABLES,
  MARKET_FLOW_US_REQUIRED_TABLES,
  MARKET_FLOW_US_SCHEMA_VERSION,
  MARKET_FLOW_US_V3_REQUIRED_TABLES,
  MARKET_FLOW_US_V3_SCHEMA_VERSION
} from "../local-service/database/schema.js";
import {
  researchDuckDbConfig,
  resolveResearchDuckDbResourceLimits
} from "./duckdb-resource-limits.js";
import {
  BacktestSourceCatalogError,
  describeBacktestEvidenceSource,
  resolveBacktestEvidenceSourcePath
} from "./source-catalog.js";

export const BACKTEST_DUCKDB_CONFIG = Object.freeze({
  ...DUCKDB_HARDENING,
  access_mode: "READ_ONLY"
});

export class BacktestEvidenceSourceError extends Error {
  constructor(message, code, options = undefined) {
    super(message, options);
    this.name = "BacktestEvidenceSourceError";
    this.code = code;
  }
}

async function queryRows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

function incompatible(message) {
  return new BacktestEvidenceSourceError(
    message,
    "BACKTEST_SOURCE_INCOMPATIBLE"
  );
}

async function assertRegularEvidenceFile(sourcePath) {
  try {
    const stats = await lstat(sourcePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new BacktestEvidenceSourceError(
        "Backtest evidence source is not a regular product data file.",
        "BACKTEST_SOURCE_INVALID_TYPE"
      );
    }
  } catch (error) {
    if (error instanceof BacktestEvidenceSourceError) throw error;
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      throw new BacktestEvidenceSourceError(
        "Backtest evidence source is no longer available.",
        "BACKTEST_SOURCE_MISSING",
        { cause: error }
      );
    }
    throw new BacktestEvidenceSourceError(
      "Backtest evidence source could not be inspected.",
      "BACKTEST_SOURCE_UNAVAILABLE",
      { cause: error }
    );
  }
}

async function validateMarketFlowUsEvidence(connection) {
  const tableRows = await queryRows(
    connection,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
  );
  const present = new Set(tableRows.map((row) => String(row.table_name)));

  if (!present.has("schema_info")) {
    throw incompatible("Backtest evidence does not contain a Market Flow US schema.");
  }

  const schemaRows = await queryRows(
    connection,
    "SELECT schema_version FROM schema_info"
  );
  if (schemaRows.length !== 1) {
    throw incompatible("Backtest evidence must contain exactly one schema_info row.");
  }

  const schemaVersion = Number(schemaRows[0].schema_version);
  let requiredTables;
  if (schemaVersion === MARKET_FLOW_US_V3_SCHEMA_VERSION) {
    requiredTables = MARKET_FLOW_US_V3_REQUIRED_TABLES;
  } else if (schemaVersion === MARKET_FLOW_US_SCHEMA_VERSION) {
    requiredTables = MARKET_FLOW_US_REQUIRED_TABLES;
  } else {
    throw incompatible(
      `Backtest evidence schema v${Number.isFinite(schemaVersion) ? schemaVersion : "unknown"} is not supported.`
    );
  }

  const missing = requiredTables.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw incompatible(
      `Backtest evidence schema v${schemaVersion} is missing required tables: ${missing.join(", ")}.`
    );
  }

  if (schemaVersion === MARKET_FLOW_US_V3_SCHEMA_VERSION) {
    const unexpectedDemoTables = DEMO_BUY_TABLES.filter((table) => present.has(table));
    if (unexpectedDemoTables.length > 0) {
      throw incompatible(
        `Backtest evidence schema v${schemaVersion} contains incompatible Demo Buy structures.`
      );
    }
  }

  return schemaVersion;
}

async function assertEvidenceSourceNotInUse(connection) {
  const rows = await queryRows(
    connection,
    "SELECT 1 AS in_use FROM sessions WHERE status = 'running' LIMIT 1"
  );
  if (rows.length > 0) {
    throw new BacktestEvidenceSourceError(
      "Backtest evidence source is currently in use.",
      "BACKTEST_SOURCE_IN_USE"
    );
  }
}

async function lockConnectionConfiguration(connection) {
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original evidence-open error.
  }
}

export async function openBacktestEvidenceSource({ dataDir, sourceId, duckdbResourceLimits } = {}) {
  let source;
  let sourcePath;
  try {
    source = describeBacktestEvidenceSource(sourceId);
    sourcePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId });
  } catch (error) {
    if (error instanceof BacktestSourceCatalogError) {
      throw new BacktestEvidenceSourceError(
        error.message,
        error.code,
        { cause: error }
      );
    }
    throw error;
  }

  await assertRegularEvidenceFile(sourcePath);

  const resourceLimits = duckdbResourceLimits === undefined
    ? null
    : resolveResearchDuckDbResourceLimits(duckdbResourceLimits);
  const config = resourceLimits === null
    ? BACKTEST_DUCKDB_CONFIG
    : Object.freeze({
      ...BACKTEST_DUCKDB_CONFIG,
      ...researchDuckDbConfig(resourceLimits)
    });

  let instance = null;
  let connection = null;
  try {
    instance = await DuckDBInstance.create(sourcePath, config);
    connection = await instance.connect();
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw new BacktestEvidenceSourceError(
      "Backtest evidence source is unavailable for read-only access.",
      "BACKTEST_SOURCE_UNAVAILABLE",
      { cause: error }
    );
  }

  try {
    await lockConnectionConfiguration(connection);
    const schemaVersion = await validateMarketFlowUsEvidence(connection);
    await assertEvidenceSourceNotInUse(connection);
    let closed = false;

    return Object.freeze({
      source,
      schemaVersion,
      connection,
      resourceLimits,
      async close() {
        if (closed) return;
        closed = true;
        connection.closeSync();
        instance.closeSync();
      }
    });
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    if (error instanceof BacktestEvidenceSourceError) throw error;
    throw new BacktestEvidenceSourceError(
      "Backtest evidence source could not be validated safely.",
      "BACKTEST_SOURCE_UNAVAILABLE",
      { cause: error }
    );
  }
}