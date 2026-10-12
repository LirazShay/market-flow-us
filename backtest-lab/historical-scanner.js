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

function assertAbortSignal(signal) {
  if (signal === undefined || signal === null) return null;
  if (
    typeof signal !== "object"
    || typeof signal.aborted !== "boolean"
    || typeof signal.addEventListener !== "function"
    || typeof signal.removeEventListener !== "function"
  ) {
    throw new TypeError("signal must be an AbortSignal.");
  }
  return signal;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (typeof signal.throwIfAborted === "function") signal.throwIfAborted();
  const error = new Error("Backtest execution was aborted.");
  error.name = "AbortError";
  throw error;
}

function bindAbortInterrupt(signal, connection) {
  if (signal === null) return () => undefined;
  throwIfAborted(signal);
  const interrupt = () => {
    try {
      connection.interrupt();
    } catch {
      // Abort remains authoritative even if interrupt races connection close.
    }
  };
  signal.addEventListener("abort", interrupt, { once: true });
  if (signal.aborted) interrupt();
  return () => signal.removeEventListener("abort", interrupt);
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

export async function resolveBacktestBaselineSeries({
  dataDir,
  sourceId,
  requestedAtMsList,
  signal
} = {}) {
  if (!Array.isArray(requestedAtMsList) || requestedAtMsList.length === 0) {
    throw new TypeError("requestedAtMsList must contain at least one point.");
  }
  const boundedSignal = assertAbortSignal(signal);

  let previous = -1;
  for (const requestedAtMs of requestedAtMsList) {
    assertRequestedAtMs(requestedAtMs);
    if (requestedAtMs <= previous) {
      throw new TypeError("requestedAtMsList must be strictly increasing.");
    }
    previous = requestedAtMs;
  }

  throwIfAborted(boundedSignal);
  const evidence = await openBacktestEvidenceSource({ dataDir, sourceId });
  const releaseAbort = bindAbortInterrupt(boundedSignal, evidence.connection);
  try {
    const resolved = [];
    for (const requestedAtMs of requestedAtMsList) {
      throwIfAborted(boundedSignal);
      resolved.push(Object.freeze({
        requestedAtMs,
        baseline: await resolveBaseline(evidence.connection, requestedAtMs)
      }));
      throwIfAborted(boundedSignal);
    }
    return Object.freeze(resolved);
  } finally {
    releaseAbort();
    await evidence.close();
  }
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

async function createHistoricalSandbox({ sourcePath, baseline, signal }) {
  let instance = null;
  let connection = null;
  let releaseAbort = () => undefined;

  try {
    throwIfAborted(signal);
    instance = await DuckDBInstance.create(":memory:");
    connection = await instance.connect();
    releaseAbort = bindAbortInterrupt(signal, connection);

    const evidencePathLiteral = sqlStringLiteral(sourcePath);
    await connection.run(
      `ATTACH ${evidencePathLiteral} AS evidence (READ_ONLY, TYPE DUCKDB)`
    );
    throwIfAborted(signal);
    await connection.run(
      `CREATE TABLE history AS
       SELECT *
       FROM evidence.main.history
       WHERE cycle_id <= $baselineCycleId`,
      { baselineCycleId: baseline.cycleId }
    );
    throwIfAborted(signal);
    await connection.run(
      `CREATE TABLE latest AS
       SELECT *
       FROM evidence.main.history
       WHERE cycle_id = $baselineCycleId`,
      { baselineCycleId: baseline.cycleId }
    );
    await connection.run("DETACH evidence");
    await applySandboxHardening(connection);
    throwIfAborted(signal);

    return { instance, connection, releaseAbort };
  } catch (error) {
    releaseAbort();
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
    interrupt() {},
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
  now = () => Date.now(),
  signal
} = {}) {
  assertRequestedAtMs(requestedAtMs);
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }
  const boundedSignal = assertAbortSignal(signal);
  throwIfAborted(boundedSignal);

  const evidence = await openBacktestEvidenceSource({ dataDir, sourceId });
  const releaseEvidenceAbort = bindAbortInterrupt(boundedSignal, evidence.connection);
  let sandbox = null;

  try {
    const baseline = await resolveBaseline(evidence.connection, requestedAtMs);
    throwIfAborted(boundedSignal);
    releaseEvidenceAbort();
    if (baseline === null) {
      await evidence.close();
      return unavailablePoint(requestedAtMs);
    }

    const sourcePath = resolveBacktestEvidenceSourcePath({ dataDir, sourceId });
    sandbox = await createHistoricalSandbox({ sourcePath, baseline, signal: boundedSignal });
    await evidence.close();

    const scanner = await createScannerAuthority({
      connection: sandbox.connection,
      now
    });
    throwIfAborted(boundedSignal);
    let closed = false;

    return Object.freeze({
      available: true,
      requestedAtMs,
      baseline,
      scanner,
      interrupt() {
        if (closed) return;
        sandbox.connection.interrupt();
      },
      async close() {
        if (closed) return;
        closed = true;
        sandbox.releaseAbort();
        sandbox.connection.closeSync();
        sandbox.instance.closeSync();
      }
    });
  } catch (error) {
    releaseEvidenceAbort();
    try {
      await evidence.close();
    } catch {
      // Preserve the original preparation failure.
    }
    sandbox?.releaseAbort?.();
    closeQuietly(sandbox?.connection);
    closeQuietly(sandbox?.instance);
    throw error;
  }
}
