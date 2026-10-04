import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

const FAILED_PHASES = new Set([
  "universe",
  "chunk-fetch",
  "provider-fetch",
  "cycle-validation"
]);

const LEGACY_TYPED_NUMERIC_FIELDS = Object.freeze([
  "LastKnownRate",
  "BaseRateChangePercentage",
  "BuyLimit1",
  "BuyVolume1",
  "SellLimit1",
  "SellVolume1",
  "DailyDealsQuantity",
  "LastDealVolume",
  "DailyTurnover",
  "DailyNISRevenue",
  "DailyLowestRate",
  "DailyHighestRate"
]);

const US_TYPED_STRING_FIELDS = Object.freeze([
  "Symbol",
  "PaperNameEng",
  "PaperNameHeb",
  "ExchangeName",
  "TradeDateTime",
  "CountryName",
  "CountryNameEng"
]);

const US_TYPED_NUMERIC_FIELDS = Object.freeze([
  "Price",
  "ChangePercent",
  "DailyHigh",
  "DailyLow",
  "YearHigh",
  "YearLow",
  "DailyVolume",
  "BeginYearChangePercent",
  "Month12ChangePercent",
  "Month36ChangePercent",
  "AskRate",
  "BidRate",
  "YesterdayRate",
  "PaperMarketCap",
  "PaperIdYatab",
  "CountryId",
  "PaperType",
  "ESGRatingId",
  "ESGScope"
]);

function fail(code) {
  throw new ProtocolValidationError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertSafeInteger(value, { min = 0, code = ERROR_CODES.CYCLE_INVALID } = {}) {
  if (!Number.isSafeInteger(value) || value < min) fail(code);
}

function assertNullableCounter(value) {
  if (value === null) return;
  assertSafeInteger(value);
}

function jsonValue(value, code = ERROR_CODES.CYCLE_INVALID) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail(code);
  return encoded;
}

function nullableJsonValue(value, code = ERROR_CODES.CYCLE_INVALID) {
  if (value === null || value === undefined) return null;
  return jsonValue(value, code);
}

function numericProjection(data, field) {
  const value = data[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringProjection(data, field) {
  const value = data[field];
  return typeof value === "string" ? value : null;
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

async function rollbackPreservingOriginal(connection) {
  try {
    await connection.run("ROLLBACK");
  } catch {
    // Preserve the original transaction error.
  }
}

async function assertRunningSession(connection, sessionId) {
  const rows = await queryRows(
    connection,
    "SELECT status FROM sessions WHERE session_id = $sessionId",
    { sessionId }
  );
  if (rows.length !== 1 || rows[0].status !== "running") {
    fail(ERROR_CODES.SESSION_NOT_STARTED);
  }
}

async function currentUniverse(connection) {
  const rows = await queryRows(
    connection,
    `SELECT security_id, universe_revision
     FROM universe
     WHERE is_current = true
     ORDER BY security_id`
  );

  if (rows.length === 0) {
    fail(ERROR_CODES.UNIVERSE_REVISION_MISMATCH);
  }

  const revisions = new Set(rows.map((row) => String(row.universe_revision)));
  if (revisions.size !== 1) {
    throw new Error("Persisted current universe has multiple revisions.");
  }

  const revision = Number(rows[0].universe_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Persisted current universe revision is invalid.");
  }

  return {
    revision,
    securityIds: rows.map((row) => String(row.security_id))
  };
}

const LEGACY_INSERT_MARKET_ROW_SQL = `(
  cycle_id,
  session_id,
  universe_revision,
  security_id,
  chunk_index,
  cycle_started_at_ms,
  chunk_received_at_ms,
  collected_at_ms,
  server_as_of_date_json,
  LastKnownRate,
  BaseRateChangePercentage,
  BuyLimit1,
  BuyVolume1,
  SellLimit1,
  SellVolume1,
  DailyDealsQuantity,
  LastDealVolume,
  DailyTurnover,
  DailyNISRevenue,
  DailyLowestRate,
  DailyHighestRate,
  LastDealTimeOnly,
  raw_data
) VALUES (
  $cycleId,
  $sessionId,
  $universeRevision,
  $securityId,
  $chunkIndex,
  $cycleStartedAtMs,
  $chunkReceivedAtMs,
  $collectedAtMs,
  $serverAsOfDateJson,
  $LastKnownRate,
  $BaseRateChangePercentage,
  $BuyLimit1,
  $BuyVolume1,
  $SellLimit1,
  $SellVolume1,
  $DailyDealsQuantity,
  $LastDealVolume,
  $DailyTurnover,
  $DailyNISRevenue,
  $DailyLowestRate,
  $DailyHighestRate,
  $LastDealTimeOnly,
  $rawDataJson
)`;

const US_INSERT_MARKET_ROW_SQL = `(
  cycle_id,
  session_id,
  universe_revision,
  security_id,
  chunk_index,
  cycle_started_at_ms,
  chunk_received_at_ms,
  collected_at_ms,
  source_metadata_json,
  Symbol,
  PaperNameEng,
  PaperNameHeb,
  ExchangeName,
  TradeDateTime,
  CountryName,
  CountryNameEng,
  Price,
  ChangePercent,
  DailyHigh,
  DailyLow,
  YearHigh,
  YearLow,
  DailyVolume,
  BeginYearChangePercent,
  Month12ChangePercent,
  Month36ChangePercent,
  AskRate,
  BidRate,
  YesterdayRate,
  PaperMarketCap,
  PaperIdYatab,
  CountryId,
  PaperType,
  ESGRatingId,
  ESGScope,
  raw_data
) VALUES (
  $cycleId,
  $sessionId,
  $universeRevision,
  $securityId,
  $chunkIndex,
  $cycleStartedAtMs,
  $chunkReceivedAtMs,
  $collectedAtMs,
  $sourceMetadataJson,
  $Symbol,
  $PaperNameEng,
  $PaperNameHeb,
  $ExchangeName,
  $TradeDateTime,
  $CountryName,
  $CountryNameEng,
  $Price,
  $ChangePercent,
  $DailyHigh,
  $DailyLow,
  $YearHigh,
  $YearLow,
  $DailyVolume,
  $BeginYearChangePercent,
  $Month12ChangePercent,
  $Month36ChangePercent,
  $AskRate,
  $BidRate,
  $YesterdayRate,
  $PaperMarketCap,
  $PaperIdYatab,
  $CountryId,
  $PaperType,
  $ESGRatingId,
  $ESGScope,
  $rawDataJson
)`;

function createLegacyProjectionParams({
  cycleId,
  sessionId,
  universeRevision,
  cycleStartedAtMs,
  item
}) {
  const params = {
    cycleId,
    sessionId,
    universeRevision,
    securityId: item.securityId,
    chunkIndex: item.chunkIndex,
    cycleStartedAtMs,
    chunkReceivedAtMs: item.chunkReceivedAtMs,
    collectedAtMs: item.collectedAtMs,
    serverAsOfDateJson: item.metadataJson,
    LastDealTimeOnly: stringProjection(item.data, "LastDealTimeOnly"),
    rawDataJson: item.rawDataJson
  };

  for (const field of LEGACY_TYPED_NUMERIC_FIELDS) {
    params[field] = numericProjection(item.data, field);
  }

  return params;
}

function createUsProjectionParams({
  cycleId,
  sessionId,
  universeRevision,
  cycleStartedAtMs,
  item
}) {
  const params = {
    cycleId,
    sessionId,
    universeRevision,
    securityId: item.securityId,
    chunkIndex: item.chunkIndex,
    cycleStartedAtMs,
    chunkReceivedAtMs: item.chunkReceivedAtMs,
    collectedAtMs: item.collectedAtMs,
    sourceMetadataJson: item.metadataJson,
    rawDataJson: item.rawDataJson
  };

  for (const field of US_TYPED_STRING_FIELDS) {
    params[field] = stringProjection(item.data, field);
  }
  for (const field of US_TYPED_NUMERIC_FIELDS) {
    params[field] = numericProjection(item.data, field);
  }

  return params;
}

const LEGACY_CYCLE_ADAPTER = Object.freeze({
  validateCycleShape() {},
  validateChunkMetadata(chunk) {
    jsonValue(chunk.serverAsOfDate);
  },
  validateSecurityIdentity(item, securityId) {
    const key = item.data.Key;
    if (key === null || key === undefined || key === "") {
      fail(ERROR_CODES.CYCLE_INVALID);
    }
    if (String(key) !== securityId) fail(ERROR_CODES.CYCLE_INVALID);
  },
  metadataJson(item) {
    return jsonValue(item.serverAsOfDate);
  },
  projectionParams: createLegacyProjectionParams,
  insertMarketRowSql: LEGACY_INSERT_MARKET_ROW_SQL
});

export const MARKET_FLOW_US_CYCLE_ADAPTER = Object.freeze({
  validateCycleShape(cycle) {
    if (cycle.chunks.length !== 1) fail(ERROR_CODES.CYCLE_INVALID);
  },
  validateChunkMetadata(chunk) {
    if (chunk.chunkIndex !== 0) fail(ERROR_CODES.CYCLE_INVALID);
    nullableJsonValue(chunk.sourceMetadata);
  },
  validateSecurityIdentity(item, securityId) {
    if (item.chunkIndex !== 0) fail(ERROR_CODES.CYCLE_INVALID);
    const paperId = item.data.PaperId;
    if (paperId === null || paperId === undefined || paperId === "") {
      fail(ERROR_CODES.CYCLE_INVALID);
    }
    if (String(paperId) !== securityId) fail(ERROR_CODES.CYCLE_INVALID);
  },
  metadataJson(item) {
    return nullableJsonValue(item.sourceMetadata);
  },
  projectionParams: createUsProjectionParams,
  insertMarketRowSql: US_INSERT_MARKET_ROW_SQL
});

function validateChunk(chunk, expectedIndex, adapter) {
  if (!isPlainObject(chunk)) fail(ERROR_CODES.CYCLE_INVALID);

  assertSafeInteger(chunk.chunkIndex);
  if (chunk.chunkIndex !== expectedIndex) fail(ERROR_CODES.CYCLE_INVALID);

  for (const name of ["requested", "received", "unique"]) {
    assertSafeInteger(chunk[name], { min: 1 });
  }
  if (
    chunk.requested !== chunk.received ||
    chunk.requested !== chunk.unique
  ) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  for (const name of [
    "requestStartedAtMs",
    "receivedAtMs",
    "completedAtMs",
    "durationMs"
  ]) {
    assertSafeInteger(chunk[name]);
  }

  if (
    chunk.requestStartedAtMs > chunk.receivedAtMs ||
    chunk.receivedAtMs > chunk.completedAtMs ||
    chunk.durationMs !== chunk.completedAtMs - chunk.requestStartedAtMs
  ) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  assertSafeInteger(chunk.httpStatus, { min: 200 });
  if (chunk.httpStatus > 299) fail(ERROR_CODES.CYCLE_INVALID);

  adapter.validateChunkMetadata(chunk);

  return Object.freeze({
    ...chunk
  });
}

function validateCompleteCycle(cycle, adapter) {
  if (!isPlainObject(cycle) || cycle.status !== "complete") {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  for (const name of [
    "startedAtMs",
    "completedAtMs",
    "durationMs"
  ]) {
    assertSafeInteger(cycle[name]);
  }

  if (
    cycle.completedAtMs < cycle.startedAtMs ||
    cycle.durationMs !== cycle.completedAtMs - cycle.startedAtMs
  ) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  for (const name of ["requested", "received", "unique"]) {
    assertSafeInteger(cycle[name], { min: 1 });
  }
  for (const name of ["missing", "duplicates", "unexpected"]) {
    assertSafeInteger(cycle[name]);
  }

  if (
    cycle.requested !== cycle.received ||
    cycle.requested !== cycle.unique ||
    cycle.missing !== 0 ||
    cycle.duplicates !== 0 ||
    cycle.unexpected !== 0
  ) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  if (!Array.isArray(cycle.chunks) || cycle.chunks.length === 0) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }
  if (!Array.isArray(cycle.securities) || cycle.securities.length !== cycle.requested) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  adapter.validateCycleShape(cycle);

  const chunks = cycle.chunks.map((chunk, index) => validateChunk(chunk, index, adapter));
  const chunkRequested = chunks.reduce((sum, chunk) => sum + chunk.requested, 0);
  if (chunkRequested !== cycle.requested) fail(ERROR_CODES.CYCLE_INVALID);

  const seen = new Set();
  const perChunkCounts = new Map();
  const securities = cycle.securities.map((item) => {
    if (!isPlainObject(item)) fail(ERROR_CODES.CYCLE_INVALID);

    const securityId = item.securityId;
    if (typeof securityId !== "string" || securityId.length === 0 || securityId.length > 128) {
      fail(ERROR_CODES.CYCLE_INVALID);
    }
    if (seen.has(securityId)) fail(ERROR_CODES.CYCLE_INVALID);
    seen.add(securityId);

    assertSafeInteger(item.chunkIndex);
    const chunk = chunks[item.chunkIndex];
    if (!chunk) fail(ERROR_CODES.CYCLE_INVALID);

    assertSafeInteger(item.chunkReceivedAtMs);
    assertSafeInteger(item.collectedAtMs);
    if (
      item.chunkReceivedAtMs !== chunk.receivedAtMs ||
      item.collectedAtMs !== chunk.completedAtMs
    ) {
      fail(ERROR_CODES.CYCLE_INVALID);
    }

    if (!isPlainObject(item.data)) fail(ERROR_CODES.CYCLE_INVALID);
    adapter.validateSecurityIdentity(item, securityId);

    const rawDataJson = jsonValue(item.data);
    const metadataJson = adapter.metadataJson(item);

    perChunkCounts.set(item.chunkIndex, (perChunkCounts.get(item.chunkIndex) ?? 0) + 1);

    return Object.freeze({
      securityId,
      chunkIndex: item.chunkIndex,
      chunkReceivedAtMs: item.chunkReceivedAtMs,
      collectedAtMs: item.collectedAtMs,
      metadataJson,
      rawDataJson,
      data: item.data
    });
  });

  for (const chunk of chunks) {
    if ((perChunkCounts.get(chunk.chunkIndex) ?? 0) !== chunk.requested) {
      fail(ERROR_CODES.CYCLE_INVALID);
    }
  }

  return Object.freeze({
    cycle,
    chunks: Object.freeze(chunks),
    securities: Object.freeze(securities),
    securityIds: Object.freeze(securities.map((item) => item.securityId))
  });
}

async function allocateCycleId(connection) {
  const rows = await queryRows(
    connection,
    "SELECT COALESCE(MAX(cycle_id), 0) AS cycle_id FROM cycles"
  );
  const previous = Number(rows[0]?.cycle_id ?? 0);
  if (!Number.isSafeInteger(previous) || previous < 0) {
    throw new Error("Persisted cycle ID is invalid.");
  }
  return previous + 1;
}

function exactMembership(actualIds, expectedIds) {
  if (actualIds.length !== expectedIds.length) return false;
  const actual = new Set(actualIds);
  if (actual.size !== actualIds.length) return false;
  return expectedIds.every((id) => actual.has(id));
}

function validateFailedReport(report) {
  if (!isPlainObject(report) || !FAILED_PHASES.has(report.phase)) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  assertSafeInteger(report.startedAtMs);
  assertSafeInteger(report.failedAtMs);
  if (report.failedAtMs < report.startedAtMs) fail(ERROR_CODES.CYCLE_INVALID);

  for (const name of [
    "requested",
    "received",
    "unique",
    "missing",
    "duplicates",
    "unexpected"
  ]) {
    if (!Object.hasOwn(report, name)) fail(ERROR_CODES.CYCLE_INVALID);
    assertNullableCounter(report[name]);
  }

  if (!isPlainObject(report.error)) fail(ERROR_CODES.CYCLE_INVALID);
  if (
    typeof report.error.name !== "string" ||
    report.error.name.length === 0 ||
    typeof report.error.message !== "string"
  ) {
    fail(ERROR_CODES.CYCLE_INVALID);
  }

  return Object.freeze({
    phase: report.phase,
    startedAtMs: report.startedAtMs,
    failedAtMs: report.failedAtMs,
    requested: report.requested,
    received: report.received,
    unique: report.unique,
    missing: report.missing,
    duplicates: report.duplicates,
    unexpected: report.unexpected,
    error: Object.freeze({
      name: report.error.name,
      message: report.error.message
    })
  });
}

export function createCycleAuthorityPersistence({
  writer,
  now = () => Date.now(),
  persistenceFault = null,
  cycleAdapter = LEGACY_CYCLE_ADAPTER
}) {
  if (!writer || typeof writer.enqueue !== "function") {
    throw new TypeError("serialized writer is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (
    !cycleAdapter ||
    typeof cycleAdapter.validateCycleShape !== "function" ||
    typeof cycleAdapter.validateChunkMetadata !== "function" ||
    typeof cycleAdapter.validateSecurityIdentity !== "function" ||
    typeof cycleAdapter.metadataJson !== "function" ||
    typeof cycleAdapter.projectionParams !== "function" ||
    typeof cycleAdapter.insertMarketRowSql !== "string"
  ) {
    throw new TypeError("cycleAdapter is invalid");
  }

  async function commitCycle({ sessionId, universeRevision, cycle }) {
    assertSafeInteger(universeRevision, {
      min: 1,
      code: ERROR_CODES.UNIVERSE_REVISION_MISMATCH
    });
    const validated = validateCompleteCycle(cycle, cycleAdapter);

    return await writer.enqueue(async (connection) => {
      await assertRunningSession(connection, sessionId);
      const current = await currentUniverse(connection);

      if (current.revision !== universeRevision) {
        fail(ERROR_CODES.UNIVERSE_REVISION_MISMATCH);
      }
      if (!exactMembership(validated.securityIds, current.securityIds)) {
        fail(ERROR_CODES.CYCLE_INVALID);
      }

      const committedAtMs = now();
      assertSafeInteger(committedAtMs);

      await connection.run("BEGIN TRANSACTION");
      try {
        const cycleId = await allocateCycleId(connection);

        await connection.run(
          `INSERT INTO cycles (
            cycle_id,
            session_id,
            universe_revision,
            status,
            started_at_ms,
            completed_at_ms,
            committed_at_ms,
            duration_ms,
            requested,
            received,
            unique_count,
            missing,
            duplicates,
            unexpected,
            chunk_count,
            chunks_json,
            failure_phase,
            error_json
          ) VALUES (
            $cycleId,
            $sessionId,
            $universeRevision,
            'complete',
            $startedAtMs,
            $completedAtMs,
            $committedAtMs,
            $durationMs,
            $requested,
            $received,
            $unique,
            $missing,
            $duplicates,
            $unexpected,
            $chunkCount,
            $chunksJson,
            NULL,
            NULL
          )`,
          {
            cycleId,
            sessionId,
            universeRevision,
            startedAtMs: cycle.startedAtMs,
            completedAtMs: cycle.completedAtMs,
            committedAtMs,
            durationMs: cycle.durationMs,
            requested: cycle.requested,
            received: cycle.received,
            unique: cycle.unique,
            missing: cycle.missing,
            duplicates: cycle.duplicates,
            unexpected: cycle.unexpected,
            chunkCount: validated.chunks.length,
            chunksJson: JSON.stringify(cycle.chunks)
          }
        );

        persistenceFault?.hit?.("F1");

        for (let index = 0; index < validated.securities.length; index++) {
          const params = cycleAdapter.projectionParams({
            cycleId,
            sessionId,
            universeRevision,
            cycleStartedAtMs: cycle.startedAtMs,
            item: validated.securities[index]
          });
          await connection.run(
            `INSERT INTO history ${cycleAdapter.insertMarketRowSql}`,
            params
          );
          if (index === 0) persistenceFault?.hit?.("F2");
        }

        await connection.run("DELETE FROM latest");
        persistenceFault?.hit?.("F3");

        for (let index = 0; index < validated.securities.length; index++) {
          const params = cycleAdapter.projectionParams({
            cycleId,
            sessionId,
            universeRevision,
            cycleStartedAtMs: cycle.startedAtMs,
            item: validated.securities[index]
          });
          await connection.run(
            `INSERT INTO latest ${cycleAdapter.insertMarketRowSql}`,
            params
          );
          if (index === 0) persistenceFault?.hit?.("F4");
        }

        await connection.run(
          `UPDATE sessions
           SET completed_cycles = completed_cycles + 1,
               last_completed_cycle_id = $cycleId,
               last_completed_at_ms = $completedAtMs,
               last_error_json = NULL
           WHERE session_id = $sessionId AND status = 'running'`,
          {
            cycleId,
            completedAtMs: cycle.completedAtMs,
            sessionId
          }
        );

        persistenceFault?.hit?.("F5");
        await connection.run("COMMIT");

        return Object.freeze({
          cycleId,
          committedAtMs
        });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  async function persistFailedCycle({ sessionId, report }) {
    const validated = validateFailedReport(report);

    return await writer.enqueue(async (connection) => {
      await assertRunningSession(connection, sessionId);
      const committedAtMs = now();
      assertSafeInteger(committedAtMs);

      await connection.run("BEGIN TRANSACTION");
      try {
        const cycleId = await allocateCycleId(connection);
        const errorJson = JSON.stringify(validated.error);

        await connection.run(
          `INSERT INTO cycles (
            cycle_id,
            session_id,
            universe_revision,
            status,
            started_at_ms,
            completed_at_ms,
            committed_at_ms,
            duration_ms,
            requested,
            received,
            unique_count,
            missing,
            duplicates,
            unexpected,
            chunk_count,
            chunks_json,
            failure_phase,
            error_json
          ) VALUES (
            $cycleId,
            $sessionId,
            NULL,
            'failed',
            $startedAtMs,
            $failedAtMs,
            $committedAtMs,
            $durationMs,
            $requested,
            $received,
            $unique,
            $missing,
            $duplicates,
            $unexpected,
            NULL,
            NULL,
            $phase,
            $errorJson
          )`,
          {
            cycleId,
            sessionId,
            startedAtMs: validated.startedAtMs,
            failedAtMs: validated.failedAtMs,
            committedAtMs,
            durationMs: validated.failedAtMs - validated.startedAtMs,
            requested: validated.requested,
            received: validated.received,
            unique: validated.unique,
            missing: validated.missing,
            duplicates: validated.duplicates,
            unexpected: validated.unexpected,
            phase: validated.phase,
            errorJson
          }
        );

        await connection.run(
          `UPDATE sessions
           SET failed_cycles = failed_cycles + 1,
               last_error_json = $errorJson
           WHERE session_id = $sessionId AND status = 'running'`,
          { errorJson, sessionId }
        );

        await connection.run("COMMIT");
        return Object.freeze({ cycleId });
      } catch (error) {
        await rollbackPreservingOriginal(connection);
        throw error;
      }
    });
  }

  return Object.freeze({
    commitCycle,
    persistFailedCycle
  });
}
