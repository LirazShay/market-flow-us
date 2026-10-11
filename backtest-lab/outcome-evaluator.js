import {
  DEMO_BUY_DEFAULT_HORIZONS_MS,
  DEMO_BUY_HORIZONS_MS,
  deriveDemoBuyHorizonOutcome
} from "../shared/demo-buy/outcome-evidence.js";
import {
  BacktestEvidenceSourceError,
  openBacktestEvidenceSource
} from "./evidence-source.js";

export const BACKTEST_OUTCOME_ERROR_CODES = Object.freeze({
  INPUT_INVALID: "BACKTEST_EVALUATION_INPUT_INVALID",
  BASELINE_INTEGRITY: "BACKTEST_BASELINE_INTEGRITY",
  READ_ERROR: "BACKTEST_OUTCOME_READ_ERROR"
});

const SUPPORTED_HORIZON_INDEX = new Map(
  DEMO_BUY_HORIZONS_MS.map((horizonMs, index) => [horizonMs, index])
);

export class BacktestOutcomeEvaluationError extends Error {
  constructor(message, code, options = undefined) {
    super(message, options);
    this.name = "BacktestOutcomeEvaluationError";
    this.code = code;
  }
}

function invalid(message) {
  return new BacktestOutcomeEvaluationError(
    message,
    BACKTEST_OUTCOME_ERROR_CODES.INPUT_INVALID
  );
}

function baselineIntegrity(message) {
  return new BacktestOutcomeEvaluationError(
    message,
    BACKTEST_OUTCOME_ERROR_CODES.BASELINE_INTEGRITY
  );
}

function assertSafeInteger(value, name, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw invalid(`${name} is invalid.`);
  }
  return value;
}

function asPersistedSafeInteger(value, name, { nullable = false, min = 0 } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${name} is missing from Backtest evidence.`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(`${name} is invalid in Backtest evidence.`);
  }
  return number;
}

function asPersistedNullableFiniteNumber(value, name) {
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} is invalid in Backtest evidence.`);
  }
  return number;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function validateSelectedItems(selectedItems) {
  if (!Array.isArray(selectedItems)) {
    throw invalid("selectedItems must be an array.");
  }

  const positions = new Set();
  const securityIds = new Set();
  let previousPosition = 0;

  return Object.freeze(selectedItems.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw invalid("Backtest selected item is invalid.");
    }
    const keys = Object.keys(item).sort();
    if (
      keys.length !== 2
      || keys[0] !== "returnedPosition"
      || keys[1] !== "securityId"
    ) {
      throw invalid("Backtest selected item keys are invalid.");
    }

    const returnedPosition = assertSafeInteger(
      item.returnedPosition,
      "returnedPosition",
      { min: 1 }
    );
    if (returnedPosition <= previousPosition || positions.has(returnedPosition)) {
      throw invalid("returnedPosition values must be unique and strictly increasing.");
    }

    if (
      typeof item.securityId !== "string"
      || item.securityId.trim().length === 0
      || item.securityId.includes("\0")
    ) {
      throw invalid("securityId is invalid.");
    }
    if (securityIds.has(item.securityId)) {
      throw invalid("securityId values must be unique within one evaluation.");
    }

    previousPosition = returnedPosition;
    positions.add(returnedPosition);
    securityIds.add(item.securityId);
    return Object.freeze({
      returnedPosition,
      securityId: item.securityId
    });
  }));
}

function validateHorizons(horizonsMs) {
  if (!Array.isArray(horizonsMs) || horizonsMs.length === 0) {
    throw invalid("horizonsMs must contain at least one supported horizon.");
  }

  let previousSupportedIndex = -1;
  const normalized = horizonsMs.map((horizonMs) => {
    assertSafeInteger(horizonMs, "horizonMs", { min: 1 });
    const supportedIndex = SUPPORTED_HORIZON_INDEX.get(horizonMs);
    if (supportedIndex === undefined || supportedIndex <= previousSupportedIndex) {
      throw invalid("horizonsMs must be a unique canonical-order subset of supported horizons.");
    }
    previousSupportedIndex = supportedIndex;
    return horizonMs;
  });

  return Object.freeze(normalized);
}

function validateRequest({ baselineCycleId, requestedAtMs, selectedItems, horizonsMs }) {
  const normalizedBaselineCycleId = assertSafeInteger(
    baselineCycleId,
    "baselineCycleId",
    { min: 1 }
  );
  const normalizedRequestedAtMs = assertSafeInteger(requestedAtMs, "requestedAtMs");
  const normalizedSelectedItems = validateSelectedItems(selectedItems);
  const normalizedHorizons = validateHorizons(horizonsMs);

  for (const horizonMs of normalizedHorizons) {
    if (!Number.isSafeInteger(normalizedRequestedAtMs + horizonMs)) {
      throw invalid("requestedAtMs plus horizonMs exceeds safe integer range.");
    }
  }

  return Object.freeze({
    baselineCycleId: normalizedBaselineCycleId,
    requestedAtMs: normalizedRequestedAtMs,
    selectedItems: normalizedSelectedItems,
    horizonsMs: normalizedHorizons
  });
}

function buildEvaluationStatement(selectedItems, horizonsMs) {
  const values = {};
  const selectedValues = selectedItems.map((item, index) => {
    values[`returnedPosition${index}`] = item.returnedPosition;
    values[`securityId${index}`] = item.securityId;
    return `($returnedPosition${index}, $securityId${index})`;
  }).join(",\n      ");
  const horizonValues = horizonsMs.map((horizonMs, index) => {
    values[`horizonMs${index}`] = horizonMs;
    return `($horizonMs${index})`;
  }).join(",\n      ");

  const sql = `WITH
    selected_items(returned_position, security_id) AS (
      VALUES
      ${selectedValues}
    ),
    horizons(horizon_ms) AS (
      VALUES
      ${horizonValues}
    ),
    baseline_items AS (
      SELECT
        s.returned_position,
        s.security_id,
        b.cycle_id AS baseline_cycle_id,
        b.collected_at_ms AS baseline_collected_at_ms,
        b.Price AS baseline_price,
        b.Symbol AS baseline_symbol,
        b.PaperNameEng AS baseline_paper_name_eng,
        b.PaperNameHeb AS baseline_paper_name_heb,
        b.ExchangeName AS baseline_exchange_name
      FROM selected_items AS s
      LEFT JOIN history AS b
        ON b.cycle_id = $baselineCycleId
       AND b.security_id = s.security_id
    ),
    targets AS (
      SELECT
        b.*,
        h.horizon_ms,
        $requestedAtMs + h.horizon_ms AS target_at_ms
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
          PARTITION BY t.returned_position, t.security_id, t.horizon_ms
          ORDER BY f.collected_at_ms ASC NULLS LAST, f.cycle_id ASC NULLS LAST
        ) AS future_rank
      FROM targets AS t
      LEFT JOIN history AS f
        ON f.security_id = t.security_id
       AND f.cycle_id > $baselineCycleId
       AND f.collected_at_ms >= t.target_at_ms
    )
    SELECT
      returned_position AS returnedPosition,
      security_id AS securityId,
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
    ORDER BY returned_position ASC, horizon_ms ASC`;

  values.baselineCycleId = null;
  values.requestedAtMs = null;
  return { sql, values };
}

async function queryRows(connection, sql, values) {
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function shapeHorizon(row, baselinePrice, requestedAtMs) {
  const horizonMs = asPersistedSafeInteger(row.horizonMs, "horizonMs", { min: 1 });
  const targetAtMs = asPersistedSafeInteger(row.targetAtMs, "targetAtMs");
  const futureCycleId = asPersistedSafeInteger(
    row.futureCycleId,
    "futureCycleId",
    { nullable: true, min: 1 }
  );
  const observedAtMs = asPersistedSafeInteger(
    row.observedAtMs,
    "observedAtMs",
    { nullable: true }
  );
  const futurePrice = asPersistedNullableFiniteNumber(row.futurePrice, "futurePrice");
  const outcome = deriveDemoBuyHorizonOutcome({
    baselinePrice,
    futureCycleId,
    futurePrice
  });
  const elapsedRaw = observedAtMs === null ? null : observedAtMs - requestedAtMs;

  return Object.freeze({
    horizonMs,
    targetAtMs,
    futureCycleId,
    observedAtMs,
    actualElapsedMs: elapsedRaw === null || elapsedRaw < 0 ? null : elapsedRaw,
    price: futurePrice,
    changePercent: outcome.changePercent,
    outcome: outcome.outcome,
    unavailableReason: outcome.unavailableReason,
    timingAnomaly: elapsedRaw !== null && elapsedRaw < 0
      ? "OBSERVATION_CLOCK_REGRESSION"
      : null
  });
}

function shapeItems(rows, request) {
  const items = [];
  let current = null;

  for (const row of rows) {
    const returnedPosition = asPersistedSafeInteger(
      row.returnedPosition,
      "returnedPosition",
      { min: 1 }
    );
    const securityId = String(row.securityId ?? "");
    if (securityId.length === 0) {
      throw new Error("securityId is invalid in Backtest evidence.");
    }

    const key = `${returnedPosition}\u0000${securityId}`;
    if (current === null || current.key !== key) {
      if (current !== null) items.push(Object.freeze(current.value));

      if (row.baselineCycleId === null || row.baselineCycleId === undefined) {
        throw baselineIntegrity("Exact Backtest baseline history row is missing.");
      }
      const baselineCycleId = asPersistedSafeInteger(
        row.baselineCycleId,
        "baselineCycleId",
        { min: 1 }
      );
      if (baselineCycleId !== request.baselineCycleId) {
        throw baselineIntegrity("Backtest baseline history row does not match the resolved cycle.");
      }

      const baselineCollectedAtMs = asPersistedSafeInteger(
        row.baselineCollectedAtMs,
        "baselineCollectedAtMs"
      );
      const baselinePrice = asPersistedNullableFiniteNumber(row.baselinePrice, "baselinePrice");
      const baselineAgeRaw = request.requestedAtMs - baselineCollectedAtMs;

      current = {
        key,
        baselinePrice,
        value: {
          returnedPosition,
          securityId,
          baseline: Object.freeze({
            cycleId: baselineCycleId,
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
            ageMs: baselineAgeRaw >= 0 ? baselineAgeRaw : null,
            timingAnomaly: baselineAgeRaw < 0 ? "BASELINE_CLOCK_REGRESSION" : null
          }),
          horizons: []
        }
      };
    }

    current.value.horizons.push(
      shapeHorizon(row, current.baselinePrice, request.requestedAtMs)
    );
  }

  if (current !== null) items.push(Object.freeze(current.value));

  if (items.length !== request.selectedItems.length) {
    throw new Error("Backtest outcome evaluator returned an invalid item count.");
  }

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex];
    const selected = request.selectedItems[itemIndex];
    if (
      item.returnedPosition !== selected.returnedPosition
      || item.securityId !== selected.securityId
    ) {
      throw new Error("Backtest outcome evaluator returned invalid item ordering.");
    }
    if (item.horizons.length !== request.horizonsMs.length) {
      throw new Error("Backtest outcome evaluator returned an incomplete horizon set.");
    }
    for (let horizonIndex = 0; horizonIndex < request.horizonsMs.length; horizonIndex += 1) {
      if (item.horizons[horizonIndex].horizonMs !== request.horizonsMs[horizonIndex]) {
        throw new Error("Backtest outcome evaluator returned invalid horizon ordering.");
      }
    }
    Object.freeze(item.horizons);
  }

  return Object.freeze(items);
}

function emptyResult(request) {
  return Object.freeze({
    baselineCycleId: request.baselineCycleId,
    requestedAtMs: request.requestedAtMs,
    horizonsMs: request.horizonsMs,
    items: Object.freeze([])
  });
}

export async function evaluateBacktestOutcomes({
  dataDir,
  sourceId,
  baselineCycleId,
  requestedAtMs,
  selectedItems,
  horizonsMs = DEMO_BUY_DEFAULT_HORIZONS_MS
} = {}) {
  const request = validateRequest({
    baselineCycleId,
    requestedAtMs,
    selectedItems,
    horizonsMs
  });

  if (request.selectedItems.length === 0) {
    return emptyResult(request);
  }

  const statement = buildEvaluationStatement(request.selectedItems, request.horizonsMs);
  statement.values.baselineCycleId = request.baselineCycleId;
  statement.values.requestedAtMs = request.requestedAtMs;

  const evidence = await openBacktestEvidenceSource({ dataDir, sourceId });
  try {
    const rows = await queryRows(evidence.connection, statement.sql, statement.values);
    return Object.freeze({
      baselineCycleId: request.baselineCycleId,
      requestedAtMs: request.requestedAtMs,
      horizonsMs: request.horizonsMs,
      items: shapeItems(rows, request)
    });
  } catch (error) {
    if (
      error instanceof BacktestOutcomeEvaluationError
      || error instanceof BacktestEvidenceSourceError
    ) {
      throw error;
    }
    throw new BacktestOutcomeEvaluationError(
      "Backtest outcome evidence could not be evaluated safely.",
      BACKTEST_OUTCOME_ERROR_CODES.READ_ERROR,
      { cause: error }
    );
  } finally {
    await evidence.close();
  }
}
