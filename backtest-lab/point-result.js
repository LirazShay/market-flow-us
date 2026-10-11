import { DEMO_BUY_HORIZONS_MS } from "../shared/demo-buy/outcome-evidence.js";

export class BacktestPointResultError extends Error {
  constructor(message, code = "BACKTEST_POINT_INPUT_INVALID") {
    super(message);
    this.name = "BacktestPointResultError";
    this.code = code;
  }
}

function invalid(message) {
  throw new BacktestPointResultError(message);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])));
  }
  return value;
}

export function freezeBacktestPointRequest({ sourceId, requestedAtMs, queries, topX = 10, horizonsMs }) {
  if (typeof sourceId !== "string" || sourceId.length === 0 || sourceId.length > 256) invalid("sourceId is invalid.");
  if (!Number.isSafeInteger(requestedAtMs) || requestedAtMs < 0) invalid("requestedAtMs is invalid.");
  if (topX !== null && (!Number.isSafeInteger(topX) || topX < 1)) invalid("topX must be positive or null for All.");
  if (!Array.isArray(queries) || queries.length < 1 || queries.length > 3) invalid("Choose one to three Queries.");
  const ids = new Set();
  for (const query of queries) {
    if (!query || typeof query.id !== "string" || query.id.length === 0 || ids.has(query.id)
      || typeof query.sql !== "string" || query.sql.trim().length === 0
      || typeof query.name !== "string" || query.name.length === 0) invalid("Query identity, name or SQL is invalid.");
    ids.add(query.id);
  }
  if (!Array.isArray(horizonsMs) || horizonsMs.length === 0) invalid("Choose at least one horizon.");
  let previous = -1;
  for (const horizon of horizonsMs) {
    const index = DEMO_BUY_HORIZONS_MS.indexOf(horizon);
    if (index <= previous || !Number.isSafeInteger(requestedAtMs + horizon)) invalid("Horizons must be a canonical supported subset.");
    previous = index;
  }
  return freezeCopy({ sourceId, requestedAtMs, queries: queries.map(({ id, name, sql }) => ({ id, name, sql })), topX, horizonsMs });
}

export function buildUnavailableBacktestPointResult({ request, reason = "NO_BASELINE" }) {
  if (!request || typeof request !== "object" || !Object.isFrozen(request)
    || typeof reason !== "string" || reason.length === 0) invalid("Unavailable point input is invalid.");
  return freezeCopy({ available: false, unavailableReason: reason, sourceId: request.sourceId,
    requestedAtMs: request.requestedAtMs, baseline: null, topX: request.topX,
    horizonsMs: request.horizonsMs, queries: request.queries });
}

export function selectBacktestRows(result, topX) {
  if (topX !== null && (!Number.isSafeInteger(topX) || topX < 1)) invalid("topX must be positive or null for All.");
  if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows)
    || result.rowCount !== result.rows.length) invalid("Scanner result shape is invalid.");
  const identityIndexes = result.columns.flatMap((column, index) =>
    column?.name === "securityId" || column?.name === "security_id" ? [index] : []);
  if (identityIndexes.length !== 1) {
    throw new BacktestPointResultError("Return exactly one securityId/security_id column.", "BACKTEST_IDENTITY_COLUMN_INVALID");
  }
  const selectedRows = result.rows.slice(0, topX ?? result.rows.length);
  const seen = new Set();
  const items = [];
  for (const [index, row] of selectedRows.entries()) {
    const securityId = row?.[identityIndexes[0]];
    if (!Array.isArray(row) || row.length !== result.columns.length
      || typeof securityId !== "string" || securityId.trim().length === 0 || securityId.includes("\0")) {
      throw new BacktestPointResultError(`Invalid security identity at returned position ${index + 1}.`, "BACKTEST_IDENTITY_INVALID");
    }
    if (seen.has(securityId)) continue;
    seen.add(securityId);
    items.push({ securityId, returnedPosition: index + 1 });
  }
  return freezeCopy({ sourceRowCount: result.rowCount, selectedSourceRowCount: selectedRows.length,
    evaluatedUniqueCount: items.length, duplicateRowCount: selectedRows.length - items.length, items });
}

export function summarizeBacktestItems(items, horizonsMs) {
  return horizonsMs.map((horizonMs, index) => {
    const values = items.map(item => item.horizons[index].changePercent).filter(Number.isFinite).sort((a, b) => a - b);
    const count = values.length;
    const middle = Math.floor(count / 2);
    const positiveCount = values.filter(value => value > 0).length;
    return { horizonMs, availableCount: count, unavailableCount: items.length - count,
      averagePercent: count ? values.reduce((sum, value) => sum + value, 0) / count : null,
      medianPercent: count ? count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null,
      positiveCount, positiveRate: count ? positiveCount / count : null,
      bestPercent: count ? values.at(-1) : null, worstPercent: count ? values[0] : null };
  });
}

export function buildBacktestPointResult({ request, baseline, queryResults }) {
  if (!baseline || !Number.isSafeInteger(baseline.cycleId) || baseline.cycleId < 1
    || !Number.isSafeInteger(baseline.committedAtMs) || baseline.committedAtMs < 0
    || baseline.committedAtMs > request.requestedAtMs) invalid("Resolved baseline is invalid.");
  if (!Array.isArray(queryResults) || queryResults.length !== request.queries.length) invalid("Incomplete Query results.");
  const queries = request.queries.map((query, index) => {
    const { selection, evaluation } = queryResults[index];
    if (!evaluation || evaluation.baselineCycleId !== baseline.cycleId
      || evaluation.requestedAtMs !== request.requestedAtMs
      || JSON.stringify(evaluation.horizonsMs) !== JSON.stringify(request.horizonsMs)
      || evaluation.items.length !== selection.items.length) invalid("Query outcome authority does not match the shared point.");
    for (let i = 0; i < selection.items.length; i += 1) {
      const item = evaluation.items[i];
      const selected = selection.items[i];
      if (item.securityId !== selected.securityId || item.returnedPosition !== selected.returnedPosition
        || item.baseline.cycleId !== baseline.cycleId || item.horizons.length !== request.horizonsMs.length
        || item.horizons.some((horizon, j) => horizon.horizonMs !== request.horizonsMs[j])) invalid("Query outcome rows do not match selection.");
    }
    return { ...query, sourceRowCount: selection.sourceRowCount,
      selectedSourceRowCount: selection.selectedSourceRowCount, evaluatedUniqueCount: selection.evaluatedUniqueCount,
      duplicateRowCount: selection.duplicateRowCount, items: evaluation.items,
      summary: summarizeBacktestItems(evaluation.items, request.horizonsMs) };
  });
  const indexes = queries.map(query => new Map(query.items.map(item => [item.securityId, item])));
  const union = [...new Set(queries.flatMap(query => query.items.map(item => item.securityId)))];
  const securities = union.map(securityId => {
    const positions = indexes.map(index => index.get(securityId)?.returnedPosition ?? null);
    const presentCount = positions.filter(position => position !== null).length;
    return { securityId, positions, presentCount, common: presentCount === queries.length,
      exclusive: presentCount === 1, positionChanged: new Set(positions.filter(position => position !== null)).size > 1 };
  });
  const pairs = [];
  for (let a = 0; a < queries.length; a += 1) {
    for (let b = a + 1; b < queries.length; b += 1) {
      const common = queries[a].items.filter(item => indexes[b].has(item.securityId));
      const unionCount = indexes[a].size + indexes[b].size - common.length;
      pairs.push({ queryIds: [queries[a].id, queries[b].id], overlapCount: common.length,
        unionCount, overlapRate: unionCount ? common.length / unionCount : null,
        onlyCounts: [indexes[a].size - common.length, indexes[b].size - common.length],
        positionChanges: common.filter(item => item.returnedPosition !== indexes[b].get(item.securityId).returnedPosition)
          .map(item => ({ securityId: item.securityId, positions: [item.returnedPosition, indexes[b].get(item.securityId).returnedPosition],
            delta: indexes[b].get(item.securityId).returnedPosition - item.returnedPosition })) });
    }
  }
  return freezeCopy({ available: true, sourceId: request.sourceId, requestedAtMs: request.requestedAtMs,
    baseline, topX: request.topX, horizonsMs: request.horizonsMs, queries, comparison: {
      unionCount: union.length, commonCount: securities.filter(item => item.common).length,
      exclusiveCounts: queries.map((_, index) => securities.filter(item => item.exclusive && item.positions[index] !== null).length),
      securities, pairs } });
}

export function filterBacktestPointRows(result, filter = "all") {
  if (!["all", "common", "differences"].includes(filter)) invalid("Unknown presentation filter.");
  const ids = new Set(result.comparison.securities.filter(item => filter === "all"
    || (filter === "common" ? item.common : !item.common || item.positionChanged)).map(item => item.securityId));
  return Object.freeze(result.queries.map(query => Object.freeze({ id: query.id,
    items: Object.freeze(query.items.filter(item => ids.has(item.securityId))) })));
}
