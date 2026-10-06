import { deriveDemoBuyCaptureTiming } from "../../shared/demo-buy/capture.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

export const DEMO_BUY_HORIZONS_MS = Object.freeze([
  10000,
  20000,
  30000,
  45000,
  60000,
  90000,
  120000,
  180000,
  300000,
  600000
]);

const PAGE_SIZE = 50;
const HORIZON_VALUES_SQL = DEMO_BUY_HORIZONS_MS
  .map((value) => `(${value})`)
  .join(",\n      ");

function fail(code) {
  throw new ProtocolValidationError(code);
}

function asSafeInteger(value, name, { nullable = false, min = 0 } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${name} is missing from persisted Demo Buy authority.`);
  }

  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(`${name} is invalid in persisted Demo Buy authority.`);
  }
  return number;
}

function asNullableFiniteNumber(value, name) {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} is invalid in persisted Demo Buy authority.`);
  }
  return number;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

async function queryRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function cursorFailure() {
  return new ProtocolValidationError(ERROR_CODES.DEMO_BUY_CURSOR_INVALID);
}

function encodePageCursor({ captureId, resultRank }) {
  return Buffer.from(JSON.stringify({
    v: 1,
    captureId,
    resultRank
  }), "utf8").toString("base64url");
}

function decodePageCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw cursorFailure();
    }

    const keys = Object.keys(parsed).sort();
    const expected = ["captureId", "resultRank", "v"];
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
      throw cursorFailure();
    }
    if (parsed.v !== 1) throw cursorFailure();

    const captureId = asSafeInteger(parsed.captureId, "cursor.captureId", { min: 1 });
    const resultRank = asSafeInteger(parsed.resultRank, "cursor.resultRank", { min: 1 });
    return { captureId, resultRank };
  } catch (error) {
    if (error instanceof ProtocolValidationError) throw error;
    throw cursorFailure();
  }
}

function buildEvaluationSql(selectedItemsSql) {
  return `WITH
    selected_items AS (
      ${selectedItemsSql}
    ),
    horizons(horizon_ms) AS (
      VALUES
      ${HORIZON_VALUES_SQL}
    ),
    baseline_items AS (
      SELECT
        s.*,
        b.cycle_id AS baseline_cycle_id,
        b.collected_at_ms AS baseline_collected_at_ms,
        b.Price AS baseline_price,
        b.Symbol AS baseline_symbol,
        b.PaperNameEng AS baseline_paper_name_eng,
        b.PaperNameHeb AS baseline_paper_name_heb,
        b.ExchangeName AS baseline_exchange_name
      FROM selected_items AS s
      LEFT JOIN history AS b
        ON b.cycle_id = s.buy_cycle_id
       AND b.security_id = s.security_id
    ),
    targets AS (
      SELECT
        b.*,
        h.horizon_ms,
        b.captured_at_ms + h.horizon_ms AS target_at_ms
      FROM baseline_items AS b
      CROSS JOIN horizons AS h
    ),
    future_ranked AS (
      SELECT
        t.*,
        f.cycle_id AS future_cycle_id,
        f.collected_at_ms AS observed_at_ms,
        f.Price AS future_price,
        ROW_NUMBER() OVER (
          PARTITION BY t.capture_id, t.security_id, t.horizon_ms
          ORDER BY f.collected_at_ms ASC NULLS LAST, f.cycle_id ASC NULLS LAST
        ) AS future_rank
      FROM targets AS t
      LEFT JOIN history AS f
        ON f.security_id = t.security_id
       AND f.cycle_id > t.buy_cycle_id
       AND f.collected_at_ms >= t.target_at_ms
    )
    SELECT
      capture_id AS captureId,
      captured_at_ms AS capturedAtMs,
      source_query_id AS sourceQueryId,
      source_query_name AS sourceQueryName,
      source_interval_ms AS sourceIntervalMs,
      source_result_started_at_ms AS sourceResultStartedAtMs,
      source_result_completed_at_ms AS sourceResultCompletedAtMs,
      source_result_row_count AS sourceResultRowCount,
      selection_mode AS selectionMode,
      is_automatic AS isAutomatic,
      top_x AS topX,
      captured_item_count AS capturedItemCount,
      result_rank AS resultRank,
      security_id AS securityId,
      buy_cycle_id AS buyCycleId,
      bounded_item_count AS boundedItemCount,
      baseline_cycle_id AS baselineCycleId,
      baseline_collected_at_ms AS baselineCollectedAtMs,
      baseline_price AS baselinePrice,
      baseline_symbol AS baselineSymbol,
      baseline_paper_name_eng AS baselinePaperNameEng,
      baseline_paper_name_heb AS baselinePaperNameHeb,
      baseline_exchange_name AS baselineExchangeName,
      horizon_ms AS horizonMs,
      target_at_ms AS targetAtMs,
      future_cycle_id AS futureCycleId,
      observed_at_ms AS observedAtMs,
      future_price AS futurePrice
    FROM future_ranked
    WHERE future_rank = 1
    ORDER BY capture_id DESC, result_rank ASC, horizon_ms ASC`;
}

function buildPageSelection(decodedCursor) {
  const continuation = decodedCursor === null
    ? ""
    : `WHERE (
          c.capture_id < $cursorCaptureId
          OR (
            c.capture_id = $cursorCaptureId
            AND i.result_rank > $cursorResultRank
          )
        )`;

  return `WITH bounded_items AS (
        SELECT
          c.capture_id,
          c.captured_at_ms,
          c.source_query_id,
          c.source_query_name,
          c.source_interval_ms,
          c.source_result_started_at_ms,
          c.source_result_completed_at_ms,
          c.source_result_row_count,
          c.selection_mode,
          c.is_automatic,
          c.top_x,
          (
            SELECT COUNT(*)
            FROM demo_buy_items AS capture_items
            WHERE capture_items.capture_id = c.capture_id
          ) AS captured_item_count,
          i.result_rank,
          i.security_id,
          i.buy_cycle_id
        FROM demo_buy_items AS i
        JOIN demo_buy_captures AS c
          ON c.capture_id = i.capture_id
        ${continuation}
        ORDER BY c.capture_id DESC, i.result_rank ASC
        LIMIT ${PAGE_SIZE + 1}
      )
      SELECT
        *,
        (SELECT COUNT(*) FROM bounded_items) AS bounded_item_count
      FROM bounded_items
      ORDER BY capture_id DESC, result_rank ASC
      LIMIT ${PAGE_SIZE}`;
}

const OBSERVATION_SELECTION_SQL = `SELECT
        c.capture_id,
        c.captured_at_ms,
        c.source_query_id,
        c.source_query_name,
        c.source_interval_ms,
        c.source_result_started_at_ms,
        c.source_result_completed_at_ms,
        c.source_result_row_count,
        c.selection_mode,
        c.is_automatic,
        c.top_x,
        (
          SELECT COUNT(*)
          FROM demo_buy_items AS capture_items
          WHERE capture_items.capture_id = c.capture_id
        ) AS captured_item_count,
        i.result_rank,
        i.security_id,
        i.buy_cycle_id,
        1 AS bounded_item_count
      FROM demo_buy_items AS i
      JOIN demo_buy_captures AS c
        ON c.capture_id = i.capture_id
      WHERE i.capture_id = $captureId
        AND i.security_id = $securityId`;

function shapeCapture(row) {
  const capturedAtMs = asSafeInteger(row.capturedAtMs, "capturedAtMs");
  const sourceResultStartedAtMs = asSafeInteger(
    row.sourceResultStartedAtMs,
    "sourceResultStartedAtMs"
  );
  const sourceResultCompletedAtMs = asSafeInteger(
    row.sourceResultCompletedAtMs,
    "sourceResultCompletedAtMs"
  );
  const scannerDurationRaw = sourceResultCompletedAtMs - sourceResultStartedAtMs;
  const captureLatencyRaw = capturedAtMs - sourceResultCompletedAtMs;
  const anomalies = [];
  if (scannerDurationRaw < 0) anomalies.push("SCANNER_CLOCK_REGRESSION");
  if (captureLatencyRaw < 0) anomalies.push("CAPTURE_CLOCK_REGRESSION");

  return Object.freeze({
    captureId: asSafeInteger(row.captureId, "captureId", { min: 1 }),
    capturedAtMs,
    sourceQueryId: row.sourceQueryId ?? null,
    sourceQueryName: row.sourceQueryName ?? null,
    sourceIntervalMs: asSafeInteger(row.sourceIntervalMs, "sourceIntervalMs", { min: 1 }),
    sourceResultStartedAtMs,
    sourceResultCompletedAtMs,
    sourceResultRowCount: asSafeInteger(row.sourceResultRowCount, "sourceResultRowCount"),
    selectionMode: row.selectionMode,
    isAutomatic: row.isAutomatic === true,
    topX: asSafeInteger(row.topX, "topX", { nullable: true, min: 1 }),
    capturedItemCount: asSafeInteger(row.capturedItemCount, "capturedItemCount"),
    scannerDurationMs: scannerDurationRaw >= 0 ? scannerDurationRaw : null,
    captureLatencyMs: captureLatencyRaw >= 0 ? captureLatencyRaw : null,
    timingAnomaly: anomalies.length === 0 ? null : anomalies.join("|")
  });
}

function shapeHorizon(row, baselinePrice, capturedAtMs) {
  const horizonMs = asSafeInteger(row.horizonMs, "horizonMs", { min: 1 });
  const targetAtMs = asSafeInteger(row.targetAtMs, "targetAtMs");
  const futureCycleId = asSafeInteger(
    row.futureCycleId,
    "futureCycleId",
    { nullable: true, min: 1 }
  );
  const observedAtMs = asSafeInteger(
    row.observedAtMs,
    "observedAtMs",
    { nullable: true }
  );
  const futurePrice = asNullableFiniteNumber(row.futurePrice, "futurePrice");

  let unavailableReason = null;
  if (futureCycleId === null) {
    unavailableReason = "NO_FUTURE_OBSERVATION";
  } else if (baselinePrice === null) {
    unavailableReason = "BASELINE_PRICE_UNAVAILABLE";
  } else if (baselinePrice === 0) {
    unavailableReason = "BASELINE_PRICE_ZERO";
  } else if (futurePrice === null) {
    unavailableReason = "FUTURE_PRICE_UNAVAILABLE";
  }

  let changePercent = null;
  let outcome = "UNAVAILABLE";
  if (unavailableReason === null) {
    changePercent = ((futurePrice / baselinePrice) - 1) * 100;
    outcome = changePercent > 0
      ? "UP"
      : changePercent < 0
        ? "DOWN"
        : "FLAT";
  }

  const elapsedRaw = observedAtMs === null ? null : observedAtMs - capturedAtMs;
  const timingAnomaly = elapsedRaw !== null && elapsedRaw < 0
    ? "OBSERVATION_CLOCK_REGRESSION"
    : null;

  return Object.freeze({
    horizonMs,
    targetAtMs,
    observedAtMs,
    actualElapsedMs: elapsedRaw === null || elapsedRaw < 0 ? null : elapsedRaw,
    price: futurePrice,
    changePercent,
    outcome,
    unavailableReason,
    timingAnomaly
  });
}

function shapeObservations(rows) {
  const observations = [];
  let current = null;

  for (const row of rows) {
    const captureId = asSafeInteger(row.captureId, "captureId", { min: 1 });
    const resultRank = asSafeInteger(row.resultRank, "resultRank", { min: 1 });
    const securityId = String(row.securityId ?? "");
    if (securityId.length === 0) {
      throw new Error("securityId is invalid in persisted Demo Buy authority.");
    }

    const key = `${captureId}\u0000${securityId}`;
    if (current === null || current.key !== key) {
      if (current !== null) observations.push(Object.freeze(current.value));

      if (row.baselineCycleId === null || row.baselineCycleId === undefined) {
        fail(ERROR_CODES.DEMO_BUY_BASELINE_INTEGRITY);
      }

      const capturedAtMs = asSafeInteger(row.capturedAtMs, "capturedAtMs");
      const baselineCollectedAtMs = asSafeInteger(
        row.baselineCollectedAtMs,
        "baselineCollectedAtMs"
      );
      const baselinePrice = asNullableFiniteNumber(row.baselinePrice, "baselinePrice");
      const timing = deriveDemoBuyCaptureTiming({
        sourceResultStartedAtMs: asSafeInteger(
          row.sourceResultStartedAtMs,
          "sourceResultStartedAtMs"
        ),
        sourceResultCompletedAtMs: asSafeInteger(
          row.sourceResultCompletedAtMs,
          "sourceResultCompletedAtMs"
        ),
        capturedAtMs,
        baselineCollectedAtMs
      });

      current = {
        key,
        baselinePrice,
        value: {
          capture: shapeCapture(row),
          resultRank,
          securityId,
          buyCycleId: asSafeInteger(row.buyCycleId, "buyCycleId", { min: 1 }),
          baseline: Object.freeze({
            cycleId: asSafeInteger(row.baselineCycleId, "baselineCycleId", { min: 1 }),
            collectedAtMs: baselineCollectedAtMs,
            price: baselinePrice,
            symbol: row.baselineSymbol ?? null,
            paperName: firstNonEmptyString(
              row.baselinePaperNameEng,
              row.baselinePaperNameHeb,
              row.baselineSymbol,
              securityId
            ),
            exchangeName: row.baselineExchangeName ?? null,
            ageMs: timing.baselineAgeMs
          }),
          timing: Object.freeze({
            scannerDurationMs: timing.scannerDurationMs,
            captureLatencyMs: timing.captureLatencyMs,
            baselineAgeMs: timing.baselineAgeMs,
            anomaly: timing.timingAnomaly
          }),
          horizons: []
        }
      };
    }

    current.value.horizons.push(
      shapeHorizon(row, current.baselinePrice, current.value.capture.capturedAtMs)
    );
  }

  if (current !== null) observations.push(Object.freeze(current.value));

  for (const observation of observations) {
    if (observation.horizons.length !== DEMO_BUY_HORIZONS_MS.length) {
      throw new Error("Demo Buy evaluator returned an incomplete horizon set.");
    }
    for (let index = 0; index < DEMO_BUY_HORIZONS_MS.length; index += 1) {
      if (observation.horizons[index].horizonMs !== DEMO_BUY_HORIZONS_MS[index]) {
        throw new Error("Demo Buy evaluator horizon ordering is invalid.");
      }
    }
    Object.freeze(observation.horizons);
  }

  return observations;
}

function asBoundedItemCount(rows) {
  if (rows.length === 0) return 0;
  return asSafeInteger(rows[0].boundedItemCount, "boundedItemCount");
}

export function createDemoBuyReads({ connection }) {
  if (!connection || typeof connection.runAndReadAll !== "function") {
    throw new TypeError("Demo Buy read connection is required");
  }

  async function page(cursor) {
    const decoded = cursor === null ? null : decodePageCursor(cursor);
    const values = decoded === null
      ? undefined
      : {
          cursorCaptureId: decoded.captureId,
          cursorResultRank: decoded.resultRank
        };
    const rows = await queryRows(
      connection,
      buildEvaluationSql(buildPageSelection(decoded)),
      values
    );
    const items = shapeObservations(rows);
    const hasMore = asBoundedItemCount(rows) > PAGE_SIZE;
    const last = items.at(-1);

    return Object.freeze({
      items: Object.freeze(items),
      hasMore,
      nextCursor: hasMore && last
        ? encodePageCursor({
            captureId: last.capture.captureId,
            resultRank: last.resultRank
          })
        : null
    });
  }

  async function observationGet(captureId, securityId) {
    const rows = await queryRows(
      connection,
      buildEvaluationSql(OBSERVATION_SELECTION_SQL),
      { captureId, securityId }
    );
    if (rows.length === 0) fail(ERROR_CODES.NOT_FOUND);

    const items = shapeObservations(rows);
    if (items.length !== 1) {
      throw new Error("Demo Buy targeted observation returned an invalid item count.");
    }
    return items[0];
  }

  async function captureGet(captureId) {
    const rows = await queryRows(
      connection,
      `SELECT
         c.capture_id AS captureId,
         c.captured_at_ms AS capturedAtMs,
         c.source_query_id AS sourceQueryId,
         c.source_query_name AS sourceQueryName,
         c.source_query_sql AS sourceQuerySql,
         c.source_interval_ms AS sourceIntervalMs,
         c.source_result_started_at_ms AS sourceResultStartedAtMs,
         c.source_result_completed_at_ms AS sourceResultCompletedAtMs,
         c.source_result_row_count AS sourceResultRowCount,
         c.selection_mode AS selectionMode,
         c.is_automatic AS isAutomatic,
         c.top_x AS topX,
         (
           SELECT COUNT(*)
           FROM demo_buy_items AS i
           WHERE i.capture_id = c.capture_id
         ) AS capturedItemCount
       FROM demo_buy_captures AS c
       WHERE c.capture_id = $captureId`,
      { captureId }
    );

    if (rows.length === 0) fail(ERROR_CODES.NOT_FOUND);
    if (rows.length !== 1) {
      throw new Error("Demo Buy capture provenance read returned an invalid row count.");
    }

    const row = rows[0];
    const capture = shapeCapture(row);
    return Object.freeze({
      ...capture,
      sourceQuerySql: row.sourceQuerySql
    });
  }

  return Object.freeze({
    page,
    observationGet,
    captureGet
  });
}
