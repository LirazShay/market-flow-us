import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

function asSafeInteger(value, name, { nullable = false } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${name} is missing from persisted authority.`);
  }

  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${name} is not a safe integer.`);
  }
  return number;
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function sanitizeLastError(value) {
  if (value === null || value === undefined) return null;

  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {
        name: "Error",
        message: "A sanitized collection error was recorded."
      };
    }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      name: "Error",
      message: "A sanitized collection error was recorded."
    };
  }

  const name = typeof parsed.name === "string" && parsed.name.length > 0
    ? parsed.name.slice(0, 128)
    : "Error";
  const message = typeof parsed.message === "string"
    ? parsed.message.slice(0, 2048)
    : "A sanitized collection error was recorded.";

  return { name, message };
}

function deriveHealth({ sessionStatus, lastHeartbeatAtMs, lastError, nowMs, staleAfterMs }) {
  if (sessionStatus === null || sessionStatus === undefined) return "UNKNOWN";
  if (sessionStatus === "stopped" || sessionStatus === "interrupted") return "STOPPED";
  if (sessionStatus !== "running") return "UNKNOWN";

  const heartbeat = asSafeInteger(lastHeartbeatAtMs, "lastHeartbeatAtMs", { nullable: true });
  if (heartbeat === null) return "UNKNOWN";

  if (Math.max(0, nowMs - heartbeat) >= staleAfterMs) return "STALE";
  if (lastError !== null && lastError !== undefined) return "ERROR";
  return "RUNNING";
}

function shapeCurrentRow(row) {
  return {
    paperName: row.paperName ?? null,
    securityId: String(row.securityId),
    LastKnownRate: row.LastKnownRate ?? null,
    BaseRateChangePercentage: row.BaseRateChangePercentage ?? null,
    BuyLimit1: row.BuyLimit1 ?? null,
    BuyVolume1: row.BuyVolume1 ?? null,
    SellLimit1: row.SellLimit1 ?? null,
    SellVolume1: row.SellVolume1 ?? null,
    DailyDealsQuantity: row.DailyDealsQuantity ?? null,
    LastDealVolume: row.LastDealVolume ?? null,
    DailyTurnover: row.DailyTurnover ?? null,
    DailyNISRevenue: row.DailyNISRevenue ?? null,
    DailyLowestRate: row.DailyLowestRate ?? null,
    DailyHighestRate: row.DailyHighestRate ?? null,
    LastDealTimeOnly: row.LastDealTimeOnly ?? null,
    collectedAtMs: asSafeInteger(row.collectedAtMs, "collectedAtMs")
  };
}

function parseStoredJson(value, name) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${name} contains invalid persisted JSON.`);
  }
}

function cursorFailure() {
  return new ProtocolValidationError(ERROR_CODES.CURSOR_INVALID);
}

function encodeCursor({ securityId, collectedAtMs, cycleId }) {
  return Buffer.from(JSON.stringify({
    v: 1,
    securityId,
    collectedAtMs,
    cycleId
  }), "utf8").toString("base64url");
}

function decodeCursor(cursor, securityId) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw cursorFailure();
    }

    const keys = Object.keys(parsed).sort();
    const expected = ["collectedAtMs", "cycleId", "securityId", "v"];
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw cursorFailure();
    }

    if (parsed.v !== 1 || parsed.securityId !== securityId) {
      throw cursorFailure();
    }

    const collectedAtMs = asSafeInteger(parsed.collectedAtMs, "cursor.collectedAtMs");
    const cycleId = asSafeInteger(parsed.cycleId, "cursor.cycleId");
    if (cycleId < 1) throw cursorFailure();

    return { collectedAtMs, cycleId };
  } catch (error) {
    if (error instanceof ProtocolValidationError) throw error;
    throw cursorFailure();
  }
}

function shapeHistoryRow(row) {
  return {
    collectedAtMs: asSafeInteger(row.collectedAtMs, "collectedAtMs"),
    cycleId: asSafeInteger(row.cycleId, "cycleId"),
    chunkIndex: asSafeInteger(row.chunkIndex, "chunkIndex"),
    LastKnownRate: row.LastKnownRate ?? null,
    BaseRateChangePercentage: row.BaseRateChangePercentage ?? null,
    BuyLimit1: row.BuyLimit1 ?? null,
    BuyVolume1: row.BuyVolume1 ?? null,
    SellLimit1: row.SellLimit1 ?? null,
    SellVolume1: row.SellVolume1 ?? null,
    DailyDealsQuantity: row.DailyDealsQuantity ?? null,
    LastDealVolume: row.LastDealVolume ?? null,
    DailyTurnover: row.DailyTurnover ?? null,
    DailyNISRevenue: row.DailyNISRevenue ?? null,
    LastDealTimeOnly: row.LastDealTimeOnly ?? null,
    serverAsOfDate: parseStoredJson(row.serverAsOfDateJson, "serverAsOfDate")
  };
}

export function createViewerReads({
  connection,
  now = () => Date.now(),
  staleAfterMs = 15000,
  historyPageSize = 500
}) {
  if (!connection || typeof connection.runAndReadAll !== "function") {
    throw new TypeError("viewer read connection is required");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) {
    throw new TypeError("staleAfterMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(historyPageSize) || historyPageSize <= 0) {
    throw new TypeError("historyPageSize must be a positive safe integer");
  }

  async function current() {
    const rows = await queryRows(
      connection,
      `SELECT
         u.paper_name AS paperName,
         l.security_id AS securityId,
         l.LastKnownRate,
         l.BaseRateChangePercentage,
         l.BuyLimit1,
         l.BuyVolume1,
         l.SellLimit1,
         l.SellVolume1,
         l.DailyDealsQuantity,
         l.LastDealVolume,
         l.DailyTurnover,
         l.DailyNISRevenue,
         l.DailyLowestRate,
         l.DailyHighestRate,
         l.LastDealTimeOnly,
         l.collected_at_ms AS collectedAtMs,
         l.cycle_id AS _cycleId
       FROM latest AS l
       LEFT JOIN universe AS u
         ON u.security_id = l.security_id
       ORDER BY l.security_id`
    );

    let lastCycleId = null;
    let lastCollectedAtMs = null;

    const shaped = rows.map((row) => {
      const cycleId = asSafeInteger(row._cycleId, "cycleId");
      const collectedAtMs = asSafeInteger(row.collectedAtMs, "collectedAtMs");

      lastCycleId = lastCycleId === null ? cycleId : Math.max(lastCycleId, cycleId);
      lastCollectedAtMs = lastCollectedAtMs === null
        ? collectedAtMs
        : Math.max(lastCollectedAtMs, collectedAtMs);

      return shapeCurrentRow(row);
    });

    return {
      rows: shaped,
      summary: {
        rowCount: shaped.length,
        lastCycleId,
        lastCollectedAtMs
      }
    };
  }

  async function status() {
    const rows = await queryRows(
      connection,
      `SELECT
         (
           SELECT status
           FROM sessions
           ORDER BY started_at_ms DESC, session_id DESC
           LIMIT 1
         ) AS sessionStatus,
         (
           SELECT last_heartbeat_at_ms
           FROM sessions
           ORDER BY started_at_ms DESC, session_id DESC
           LIMIT 1
         ) AS lastHeartbeatAtMs,
         (
           SELECT last_error_json
           FROM sessions
           ORDER BY started_at_ms DESC, session_id DESC
           LIMIT 1
         ) AS lastErrorJson,
         (
           SELECT completed_at_ms
           FROM cycles
           WHERE status = 'complete'
           ORDER BY cycle_id DESC
           LIMIT 1
         ) AS lastCompletedAtMs,
         (
           SELECT cycle_id
           FROM cycles
           WHERE status = 'complete'
           ORDER BY cycle_id DESC
           LIMIT 1
         ) AS lastCompletedCycleId,
         (
           SELECT duration_ms
           FROM cycles
           WHERE status = 'complete'
           ORDER BY cycle_id DESC
           LIMIT 1
         ) AS lastCycleDurationMs,
         (SELECT COUNT(*) FROM latest) AS latestCount,
         (SELECT COUNT(*) FROM cycles WHERE status = 'complete') AS completedCycles,
         (SELECT COUNT(*) FROM cycles WHERE status = 'failed') AS failedCycles,
         (SELECT COUNT(*) FROM history) AS historyCount`
    );

    if (rows.length !== 1) {
      throw new Error("Status authority query did not return exactly one row.");
    }

    const row = rows[0];
    const lastError = sanitizeLastError(row.lastErrorJson);
    const nowMs = now();
    if (!Number.isSafeInteger(nowMs)) {
      throw new Error("Current time is not a safe integer.");
    }

    return {
      serviceReady: true,
      recorderHealth: deriveHealth({
        sessionStatus: row.sessionStatus ?? null,
        lastHeartbeatAtMs: row.lastHeartbeatAtMs ?? null,
        lastError: row.lastErrorJson ?? null,
        nowMs,
        staleAfterMs
      }),
      lastCompletedAtMs: asSafeInteger(
        row.lastCompletedAtMs,
        "lastCompletedAtMs",
        { nullable: true }
      ),
      lastCompletedCycleId: asSafeInteger(
        row.lastCompletedCycleId,
        "lastCompletedCycleId",
        { nullable: true }
      ),
      lastCycleDurationMs: asSafeInteger(
        row.lastCycleDurationMs,
        "lastCycleDurationMs",
        { nullable: true }
      ),
      latestCount: asSafeInteger(row.latestCount, "latestCount"),
      completedCycles: asSafeInteger(row.completedCycles, "completedCycles"),
      failedCycles: asSafeInteger(row.failedCycles, "failedCycles"),
      historyCount: asSafeInteger(row.historyCount, "historyCount"),
      lastError
    };
  }

  async function security(securityId) {
    const rows = await queryRows(
      connection,
      `SELECT
         EXISTS(SELECT 1 FROM latest WHERE security_id = $securityId) AS hasLatest,
         EXISTS(SELECT 1 FROM universe WHERE security_id = $securityId) AS hasUniverse,
         EXISTS(SELECT 1 FROM history WHERE security_id = $securityId) AS hasHistory,
         u.paper_name AS paperName,
         l.security_id AS securityId,
         l.LastKnownRate,
         l.BaseRateChangePercentage,
         l.BuyLimit1,
         l.BuyVolume1,
         l.SellLimit1,
         l.SellVolume1,
         l.DailyDealsQuantity,
         l.LastDealVolume,
         l.DailyTurnover,
         l.DailyNISRevenue,
         l.DailyLowestRate,
         l.DailyHighestRate,
         l.LastDealTimeOnly,
         l.collected_at_ms AS collectedAtMs
       FROM (SELECT 1) AS seed
       LEFT JOIN latest AS l
         ON l.security_id = $securityId
       LEFT JOIN universe AS u
         ON u.security_id = $securityId`,
      { securityId }
    );

    if (rows.length !== 1) {
      throw new Error("Security authority query did not return exactly one row.");
    }

    const row = rows[0];
    const hasLatest = row.hasLatest === true;
    const found = hasLatest || row.hasUniverse === true || row.hasHistory === true;

    return {
      found,
      securityId,
      paperName: row.paperName ?? null,
      isCurrent: hasLatest,
      currentRow: hasLatest ? shapeCurrentRow(row) : null
    };
  }

  async function historyPage(securityId, cursor) {
    const decoded = cursor === null ? null : decodeCursor(cursor, securityId);
    const continuation = decoded === null
      ? ""
      : `AND (
           collected_at_ms < $cursorCollectedAtMs
           OR (
             collected_at_ms = $cursorCollectedAtMs
             AND cycle_id < $cursorCycleId
           )
         )`;

    const values = decoded === null
      ? { securityId }
      : {
          securityId,
          cursorCollectedAtMs: decoded.collectedAtMs,
          cursorCycleId: decoded.cycleId
        };

    const rows = await queryRows(
      connection,
      `SELECT
         collected_at_ms AS collectedAtMs,
         cycle_id AS cycleId,
         chunk_index AS chunkIndex,
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
         LastDealTimeOnly,
         server_as_of_date_json AS serverAsOfDateJson
       FROM history
       WHERE security_id = $securityId
       ${continuation}
       ORDER BY collected_at_ms DESC, cycle_id DESC
       LIMIT ${historyPageSize + 1}`,
      values
    );

    const hasMore = rows.length > historyPageSize;
    const pageRows = rows.slice(0, historyPageSize).map(shapeHistoryRow);
    const last = pageRows.at(-1);

    return {
      rows: pageRows,
      hasMore,
      nextCursor: hasMore && last
        ? encodeCursor({
            securityId,
            collectedAtMs: last.collectedAtMs,
            cycleId: last.cycleId
          })
        : null
    };
  }

  return Object.freeze({
    current,
    status,
    security,
    historyPage
  });
}
