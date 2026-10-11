import { DuckDBInstance } from "@duckdb/node-api";
import { DUCKDB_HARDENING } from "../local-service/database/database.js";
import { createScannerAuthority } from "../local-service/scanner/scanner.js";
import { openBacktestEvidenceSource } from "./evidence-source.js";
import { resolveBacktestEvidenceSourcePath } from "./source-catalog.js";

function assertRequestedAtMs(requestedAtMs) {
  if (!Number.isSafeInteger(requestedAtMs) || requestedAtMs < 0) {
    throw new TypeError("requestedAtMs must be a non-negative safe integer.");
  }
}

function sqlStringLiteral(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError("SQL string literal source must be a non-empty string without NUL.");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

async function queryRows(connection, sql, values = undefined) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function resolveBaseline(connection, requestedAtMs) {
  const rows = await queryRows(
    connection,
    `SELECT cycle_id, committed_at_ms
     FROM cycles
     WHERE status = 'complete'
       AND committed_at_ms <= $requestedAtMs
     ORDER BY committed_at_ms DESC, cycle_id DESC
     LIMIT 1`,
    { requestedAtMs }
  );

  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new Error("Historical Scanner baseline resolution returned invalid cardinality.");
  }

  const cycleId = Number(rows[0].cycle_id);
  const committedAtMs = Number(rows[0].committed_at_ms);
  if (
    !Number.isSafeInteger(cycleId)
    || cycleId < 1
    || !Number.isSafeInteger(committedAtMs)
    || committedAtMs < 0
  ) {
    throw new Error("Historical Scanner baseline authority is invalid.");
  }

  return Object.freeze({ cycleId, committedAtMs });
}

async function applySandboxHardening(connection) {
  for (const [name, value] of Object.entries(DUCKDB_HARDENING)) {
    await connection.run(`SET ${name} = ${value}`);
  }
  await connection.run("SET allowed_configs = []");
  await connection.run("SET lock_configuration = true");
}

function closeQuietly(value) {
  try {
    value?.closeSync();
  } catch {
    // Preserve the original preparation failure.
  }
}

async function createHistoricalSandbox({ sourcePath, baseline }) {
  let instance = null;
  let connection = null;

  try {
    instance = await DuckDBInstance.create(":memory:");
    connection = await instance.connect();

    const evidencePathLiteral = sqlStringLiteral(sourcePath);
    await connection.run(
      `ATTACH ${evidencePathLiteral} AS evidence (READ_ONLY, TYPE DUCKDB)`
    );
    await connection.run(
      `CREATE TABLE history AS
       SELECT *
       FROM evidence.main.history
       WHERE cycle_id <= $baselineCycleId`,
      { baselineCycleId: baseline.cycleId }
    );
    await connection.run(
      `CREATE TABLE latest AS
       SELECT *
       FROM evidence.main.history
       WHERE cycle_id = $baselineCycleId`,
      { baselineCycleId: baseline.cycleId }
    );
    await connection.run("DETACH evidence");
    await applySandboxHardening(connection);

    return { instance, connection };
  } catch (error) {
    closeQuietly(connection);
    closeQuietly(instance);
    throw error;
  }
}

function unavailablePoint(requestedAtMs) {
  let closed = false;
  return Object.freeze({
    available: false,
    requestedAtMs,
    baseline: null,
    scanner: null,
    async close() {
      if (closed) return;
      closed = true;
    }
  });
}

export async function openBacktestHistoricalScanner({
  dataDir,
  sourceId,
  requestedAtMs,
  now = () => Date.now()
} = {}) {
  assertRequestedAtMs(requestedAtMs);
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  const evidence = await openBacktestEvidenceSource({ dataDir, sourceId });
  let sandbox = null;

  try {
    const baseline = await resolveBaseline(evidence.connection, requestedAtMs);
    if (baseline === null) {
      await evidence.close();
      return unavailablePoint(requestedAtMs);
    }

    const sourcePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId });
    sandbox = await createHistoricalSandbox({ sourcePath, baseline });
    await evidence.close();

    const scanner = await createScannerAuthority({
      connection: sandbox.connection,
      now
    });
    let closed = false;

    return Object.freeze({
      available: true,
      requestedAtMs,
      baseline,
      scanner,
      async close() {
        if (closed) return;
        closed = true;
        sandbox.connection.closeSync();
        sandbox.instance.closeSync();
      }
    });
  } catch (error) {
    try {
      await evidence.close();
    } catch {
      // Preserve the original preparation failure.
    }
    closeQuietly(sandbox?.connection);
    closeQuietly(sandbox?.instance);
    throw error;
  }
}
