import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  DatabaseSchemaUnsupportedError,
  DUCKDB_HARDENING,
  openMarketFlowUsDatabase
} from "../local-service/database/database.js";
import {
  MARKET_FLOW_US_REQUIRED_TABLES,
  MARKET_FLOW_US_SCHEMA_VERSION
} from "../local-service/database/schema.js";

const DEFAULT_DB_PATH = "data/market-flow-us.duckdb";

export class NewDayActiveSessionError extends Error {
  constructor(message = "Market Flow US still has a running producer session; stop the service before starting a new trading day.") {
    super(message);
    this.name = "NewDayActiveSessionError";
    this.code = "NEW_DAY_ACTIVE_SESSION";
  }
}

async function fileExists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function safeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid saved-query ${label}.`);
  }
  return number;
}

function archiveStamp(nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new TypeError("now must return a non-negative safe integer");
  }
  return new Date(nowMs).toISOString().replace(/[-:.]/g, "");
}

async function inspectActiveDay(dbPath) {
  const instance = await DuckDBInstance.create(dbPath, DUCKDB_HARDENING);
  const connection = await instance.connect();

  try {
    const tables = await queryRows(
      connection,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    );
    const present = new Set(tables.map((row) => String(row.table_name)));

    if (!present.has("schema_info")) {
      throw new DatabaseSchemaUnsupportedError(
        "Active database has no Market Flow US schema_info table"
      );
    }

    const schemaRows = await queryRows(
      connection,
      "SELECT schema_version FROM schema_info"
    );
    if (
      schemaRows.length !== 1
      || Number(schemaRows[0].schema_version) !== MARKET_FLOW_US_SCHEMA_VERSION
    ) {
      throw new DatabaseSchemaUnsupportedError(
        `New-day rollover requires Market Flow US schema v${MARKET_FLOW_US_SCHEMA_VERSION}`
      );
    }

    const missing = MARKET_FLOW_US_REQUIRED_TABLES.filter((table) => !present.has(table));
    if (missing.length > 0) {
      throw new DatabaseSchemaUnsupportedError(
        `Market Flow US schema v${MARKET_FLOW_US_SCHEMA_VERSION} is missing required tables: ${missing.join(", ")}`
      );
    }

    const running = await queryRows(
      connection,
      "SELECT session_id FROM sessions WHERE status = 'running' LIMIT 1"
    );
    if (running.length > 0) {
      throw new NewDayActiveSessionError();
    }

    const savedQueries = await queryRows(
      connection,
      `SELECT query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
       FROM scanner_saved_queries
       ORDER BY query_id`
    );

    return savedQueries.map((row) => Object.freeze({
      queryId: String(row.query_id),
      name: String(row.name),
      nameKey: String(row.name_key),
      sql: String(row.sql_text),
      intervalMs: safeInteger(row.interval_ms, "interval_ms"),
      createdAtMs: safeInteger(row.created_at_ms, "created_at_ms"),
      updatedAtMs: safeInteger(row.updated_at_ms, "updated_at_ms")
    }));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

async function seedSavedQueries(database, savedQueries) {
  if (savedQueries.length === 0) return;

  await database.writerConnection.run("BEGIN TRANSACTION");
  try {
    for (const query of savedQueries) {
      await database.writerConnection.run(
        `INSERT INTO scanner_saved_queries (
          query_id, name, name_key, sql_text, interval_ms, created_at_ms, updated_at_ms
        ) VALUES (
          $queryId, $name, $nameKey, $sql, $intervalMs, $createdAtMs, $updatedAtMs
        )`,
        query
      );
    }
    await database.writerConnection.run("COMMIT");
  } catch (error) {
    try {
      await database.writerConnection.run("ROLLBACK");
    } catch {
      // Preserve the import error.
    }
    throw error;
  }
}

async function createFreshDayDatabase({
  dbPath,
  productVersion,
  now,
  savedQueries
}) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion,
    now
  });
  try {
    await seedSavedQueries(database, savedQueries);
  } finally {
    await database.close();
  }
}

function temporaryNewDayPath(dbPath, stamp) {
  return `${dbPath}.new-day-${stamp}-${process.pid}.duckdb`;
}

function temporaryPreviousPath(dbPath, stamp) {
  return `${dbPath}.previous-${stamp}-${process.pid}.duckdb`;
}

export async function rolloverTradingDay({
  dbPath = DEFAULT_DB_PATH,
  archive = true,
  archiveDir = null,
  productVersion = "0.1.0",
  now = () => Date.now(),
  fault = null
} = {}) {
  if (typeof dbPath !== "string" || dbPath.length === 0) {
    throw new TypeError("dbPath must be a non-empty string");
  }
  if (archiveDir !== null && (typeof archiveDir !== "string" || archiveDir.length === 0)) {
    throw new TypeError("archiveDir must be null or a non-empty string");
  }
  if (typeof productVersion !== "string" || productVersion.length === 0) {
    throw new TypeError("productVersion must be a non-empty string");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }

  const resolvedDbPath = path.resolve(dbPath);
  const nowMs = now();
  const stamp = archiveStamp(nowMs);
  const hasActive = await fileExists(resolvedDbPath);

  if (!hasActive) {
    await createFreshDayDatabase({
      dbPath: resolvedDbPath,
      productVersion,
      now: () => nowMs,
      savedQueries: []
    });
    return Object.freeze({
      dbPath: resolvedDbPath,
      createdFresh: true,
      archived: false,
      archivePath: null,
      savedQueriesPreserved: 0
    });
  }

  const savedQueries = await inspectActiveDay(resolvedDbPath);
  const tempNewPath = temporaryNewDayPath(resolvedDbPath, stamp);
  await rm(tempNewPath, { force: true });

  await createFreshDayDatabase({
    dbPath: tempNewPath,
    productVersion,
    now: () => nowMs,
    savedQueries
  });

  const resolvedArchiveDir = path.resolve(
    archiveDir ?? path.join(path.dirname(resolvedDbPath), "archive")
  );
  const archivePath = path.join(
    resolvedArchiveDir,
    `market-flow-us-${stamp}.duckdb`
  );
  const priorPath = archive
    ? archivePath
    : temporaryPreviousPath(resolvedDbPath, stamp);

  let priorMoved = false;
  let freshInstalled = false;

  try {
    if (archive) {
      await mkdir(resolvedArchiveDir, { recursive: true });
      if (await fileExists(archivePath)) {
        throw new Error(`Archive already exists: ${archivePath}`);
      }
    } else if (await fileExists(priorPath)) {
      throw new Error(`Temporary prior-day path already exists: ${priorPath}`);
    }

    await rename(resolvedDbPath, priorPath);
    priorMoved = true;
    fault?.hit?.("after-prior-move");

    await rename(tempNewPath, resolvedDbPath);
    freshInstalled = true;
    fault?.hit?.("after-fresh-install");

    if (!archive) {
      await rm(priorPath, { force: true });
      priorMoved = false;
    }

    return Object.freeze({
      dbPath: resolvedDbPath,
      createdFresh: false,
      archived: archive,
      archivePath: archive ? archivePath : null,
      savedQueriesPreserved: savedQueries.length
    });
  } catch (error) {
    if (priorMoved && freshInstalled && !archive) {
      try {
        await rename(resolvedDbPath, tempNewPath);
        freshInstalled = false;
        await rename(priorPath, resolvedDbPath);
        priorMoved = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `New-day rollover failed after fresh install; prior authority remains at ${priorPath}`
        );
      }
    } else if (priorMoved && !freshInstalled) {
      try {
        await rename(priorPath, resolvedDbPath);
        priorMoved = false;
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `New-day rollover failed; prior authority remains recoverable at ${priorPath}`
        );
      }
    }
    throw error;
  } finally {
    await rm(tempNewPath, { force: true });
  }
}

function readCliValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

export function parseNewTradingDayCliArgs(args) {
  let dbPath = DEFAULT_DB_PATH;
  let archive = true;
  let archiveDir = null;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--no-archive") {
      archive = false;
      continue;
    }
    if (value === "--db") {
      dbPath = readCliValue(args, index, value);
      index += 1;
      continue;
    }
    if (value === "--archive-dir") {
      archiveDir = readCliValue(args, index, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return { dbPath, archive, archiveDir };
}

async function readPackageVersion() {
  const packageJson = JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("../package.json", import.meta.url),
      "utf8"
    )
  );
  return String(packageJson.version);
}

async function main() {
  const options = parseNewTradingDayCliArgs(process.argv.slice(2));
  const result = await rolloverTradingDay({
    ...options,
    productVersion: await readPackageVersion()
  });
  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = error?.code ? ` [${error.code}]` : "";
    console.error(`Market Flow US new-day rollover failed${code}: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
}
