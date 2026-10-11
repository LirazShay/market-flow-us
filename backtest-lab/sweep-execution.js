import { DEMO_BUY_DEFAULT_HORIZONS_MS } from "../shared/demo-buy/outcome-evidence.js";
import {
  openBacktestHistoricalScanner,
  resolveBacktestBaselineSeries
} from "./historical-scanner.js";
import { evaluateBacktestOutcomes } from "./outcome-evaluator.js";
import {
  BacktestPointResultError,
  buildBacktestPointResult,
  buildUnavailableBacktestPointResult,
  freezeBacktestPointRequest,
  selectBacktestRows
} from "./point-result.js";

export const BACKTEST_SWEEP_MAX_POINTS = 30000;
export const BACKTEST_SWEEP_PAGE_LIMIT = 250;

const INTERVAL_UNITS_MS = Object.freeze({
  seconds: 1000,
  minutes: 60_000
});

export class BacktestSweepError extends Error {
  constructor(message, code = "BACKTEST_SWEEP_INPUT_INVALID") {
    super(message);
    this.name = "BacktestSweepError";
    this.code = code;
  }
}

function invalid(message, code = "BACKTEST_SWEEP_INPUT_INVALID") {
  throw new BacktestSweepError(message, code);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])));
  }
  return value;
}

function generateRequestedAtMs({ fromAtMs, toAtMs, intervalMs }) {
  const pointCount = Math.floor((toAtMs - fromAtMs) / intervalMs) + 1;
  if (!Number.isSafeInteger(pointCount) || pointCount < 1 || pointCount > BACKTEST_SWEEP_MAX_POINTS) {
    invalid(`Sweep must contain between 1 and ${BACKTEST_SWEEP_MAX_POINTS} requested points.`, "BACKTEST_SWEEP_TOO_LARGE");
  }

  const requestedAtMsList = [];
  for (let index = 0; index < pointCount; index += 1) {
    const requestedAtMs = fromAtMs + index * intervalMs;
    if (!Number.isSafeInteger(requestedAtMs) || requestedAtMs > toAtMs) {
      invalid("Sweep timestamp generation exceeded the safe integer range.");
    }
    requestedAtMsList.push(requestedAtMs);
  }
  return Object.freeze(requestedAtMsList);
}

export function freezeBacktestSweepRequest({
  sourceId,
  fromAtMs,
  toAtMs,
  intervalValue,
  intervalUnit,
  queries,
  topX = 10,
  horizonsMs = DEMO_BUY_DEFAULT_HORIZONS_MS
} = {}) {
  if (!Number.isSafeInteger(fromAtMs) || fromAtMs < 0
    || !Number.isSafeInteger(toAtMs) || toAtMs < fromAtMs) {
    invalid("Sweep fromAtMs/toAtMs range is invalid.");
  }
  if (!Number.isSafeInteger(intervalValue) || intervalValue < 1
    || !Object.hasOwn(INTERVAL_UNITS_MS, intervalUnit)) {
    invalid("Sweep interval must be a positive whole number of seconds or minutes.");
  }

  const intervalMs = intervalValue * INTERVAL_UNITS_MS[intervalUnit];
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    invalid("Sweep interval exceeds the safe integer range.");
  }

  let pointRequest;
  try {
    pointRequest = freezeBacktestPointRequest({
      sourceId,
      requestedAtMs: toAtMs,
      queries,
      topX,
      horizonsMs
    });
  } catch (error) {
    if (error instanceof BacktestPointResultError) {
      invalid(error.message);
    }
    throw error;
  }

  const requestedAtMsList = generateRequestedAtMs({ fromAtMs, toAtMs, intervalMs });
  return freezeCopy({
    sourceId: pointRequest.sourceId,
    fromAtMs,
    toAtMs,
    intervalValue,
    intervalUnit,
    intervalMs,
    queries: pointRequest.queries,
    topX: pointRequest.topX,
    horizonsMs: pointRequest.horizonsMs,
    requestedAtMsList
  });
}

function assertBaselineSeries(request, series) {
  if (!Array.isArray(series) || series.length !== request.requestedAtMsList.length) {
    throw new TypeError("Backtest baseline series is invalid.");
  }

  let previousCommittedAtMs = -1;
  return series.map((entry, index) => {
    const requestedAtMs = request.requestedAtMsList[index];
    if (!entry || entry.requestedAtMs !== requestedAtMs) {
      throw new TypeError("Backtest baseline series does not match requested timestamps.");
    }
    if (entry.baseline === null) {
      if (previousCommittedAtMs >= 0) {
        throw new TypeError("Backtest baseline series regressed to unavailable evidence.");
      }
      return Object.freeze({ requestedAtMs, baseline: null });
    }

    const { cycleId, committedAtMs } = entry.baseline;
    if (!Number.isSafeInteger(cycleId) || cycleId < 1
      || !Number.isSafeInteger(committedAtMs) || committedAtMs < 0
      || committedAtMs > requestedAtMs || committedAtMs < previousCommittedAtMs) {
      throw new TypeError("Backtest baseline series contains invalid authority.");
    }
    previousCommittedAtMs = committedAtMs;
    return Object.freeze({ requestedAtMs, baseline: Object.freeze({ cycleId, committedAtMs }) });
  });
}

function baselineKey(baseline) {
  return `${baseline.cycleId}:${baseline.committedAtMs}`;
}

function assertHistoricalMatches(entry, historical) {
  if (!historical || historical.available !== true
    || !historical.baseline || !historical.scanner || typeof historical.scanner.execute !== "function"
    || typeof historical.close !== "function"
    || historical.baseline.cycleId !== entry.baseline.cycleId
    || historical.baseline.committedAtMs !== entry.baseline.committedAtMs) {
    throw new TypeError("Historical Scanner does not match the resolved Sweep baseline.");
  }
}

function pointRequestFor(request, requestedAtMs) {
  return freezeBacktestPointRequest({
    sourceId: request.sourceId,
    requestedAtMs,
    queries: request.queries,
    topX: request.topX,
    horizonsMs: request.horizonsMs
  });
}

async function loadBaselineSelections({
  dataDir,
  request,
  entry,
  now,
  openHistoricalScanner
}) {
  const historical = await openHistoricalScanner({
    dataDir,
    sourceId: request.sourceId,
    requestedAtMs: entry.requestedAtMs,
    now
  });
  assertHistoricalMatches(entry, historical);

  try {
    const selections = [];
    for (const query of request.queries) {
      const scannerResult = await historical.scanner.execute(query.sql);
      selections.push(selectBacktestRows(scannerResult, request.topX));
    }
    return Object.freeze(selections);
  } finally {
    await historical.close();
  }
}

function compactTimelinePoint(index, point) {
  if (!point.available) {
    return freezeCopy({
      index,
      requestedAtMs: point.requestedAtMs,
      available: false,
      unavailableReason: point.unavailableReason,
      baseline: null,
      queries: [],
      comparison: null
    });
  }

  return freezeCopy({
    index,
    requestedAtMs: point.requestedAtMs,
    available: true,
    unavailableReason: null,
    baseline: point.baseline,
    queries: point.queries.map((query) => ({
      id: query.id,
      sourceRowCount: query.sourceRowCount,
      selectedSourceRowCount: query.selectedSourceRowCount,
      evaluatedUniqueCount: query.evaluatedUniqueCount,
      duplicateRowCount: query.duplicateRowCount,
      summary: query.summary
    })),
    comparison: {
      unionCount: point.comparison.unionCount,
      commonCount: point.comparison.commonCount,
      exclusiveCounts: point.comparison.exclusiveCounts,
      pairs: point.comparison.pairs.map((pair) => ({
        queryIds: pair.queryIds,
        overlapCount: pair.overlapCount,
        unionCount: pair.unionCount,
        overlapRate: pair.overlapRate,
        onlyCounts: pair.onlyCounts,
        positionChangeCount: pair.positionChanges.length
      }))
    }
  });
}

function createSweepRun({ request, points, queryExecutionCount, distinctBaselineCount }) {
  const timeline = Object.freeze(points.map((point, index) => compactTimelinePoint(index, point)));
  const metrics = Object.freeze({
    requestedPointCount: points.length,
    availablePointCount: points.filter((point) => point.available).length,
    unavailablePointCount: points.filter((point) => !point.available).length,
    distinctBaselineCount,
    queryExecutionCount
  });

  return Object.freeze({
    request,
    metrics,
    page({ offset = 0, limit = 50 } = {}) {
      if (!Number.isSafeInteger(offset) || offset < 0
        || !Number.isSafeInteger(limit) || limit < 1 || limit > BACKTEST_SWEEP_PAGE_LIMIT) {
        invalid(`Sweep page offset/limit is invalid; limit must be 1-${BACKTEST_SWEEP_PAGE_LIMIT}.`);
      }
      return Object.freeze({
        offset,
        limit,
        totalCount: timeline.length,
        items: Object.freeze(timeline.slice(offset, offset + limit))
      });
    },
    openPoint(index) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= points.length) {
        invalid("Sweep point index is out of range.");
      }
      return points[index];
    }
  });
}

export async function executeBacktestSweep({
  dataDir,
  sourceId,
  fromAtMs,
  toAtMs,
  intervalValue,
  intervalUnit,
  queries,
  topX = 10,
  horizonsMs = DEMO_BUY_DEFAULT_HORIZONS_MS,
  now,
  resolveBaselines = resolveBacktestBaselineSeries,
  openHistoricalScanner = openBacktestHistoricalScanner,
  evaluateOutcomes = evaluateBacktestOutcomes
} = {}) {
  if (typeof resolveBaselines !== "function"
    || typeof openHistoricalScanner !== "function"
    || typeof evaluateOutcomes !== "function") {
    throw new TypeError("Backtest Sweep dependencies must be functions.");
  }

  const request = freezeBacktestSweepRequest({
    sourceId,
    fromAtMs,
    toAtMs,
    intervalValue,
    intervalUnit,
    queries,
    topX,
    horizonsMs
  });
  const baselineSeries = assertBaselineSeries(request, await resolveBaselines({
    dataDir,
    sourceId: request.sourceId,
    requestedAtMsList: request.requestedAtMsList
  }));

  const selectionCache = new Map();
  const points = [];
  let queryExecutionCount = 0;

  for (const entry of baselineSeries) {
    const pointRequest = pointRequestFor(request, entry.requestedAtMs);
    if (entry.baseline === null) {
      points.push(buildUnavailableBacktestPointResult({ request: pointRequest }));
      continue;
    }

    const key = baselineKey(entry.baseline);
    let selections = selectionCache.get(key);
    if (!selections) {
      selections = await loadBaselineSelections({
        dataDir,
        request,
        entry,
        now,
        openHistoricalScanner
      });
      selectionCache.set(key, selections);
      queryExecutionCount += request.queries.length;
    }

    const queryResults = [];
    for (const selection of selections) {
      const evaluation = await evaluateOutcomes({
        dataDir,
        sourceId: request.sourceId,
        baselineCycleId: entry.baseline.cycleId,
        requestedAtMs: entry.requestedAtMs,
        selectedItems: selection.items,
        horizonsMs: request.horizonsMs
      });
      queryResults.push({ selection, evaluation });
    }
    points.push(buildBacktestPointResult({
      request: pointRequest,
      baseline: entry.baseline,
      queryResults
    }));
  }

  return createSweepRun({
    request,
    points: Object.freeze(points),
    queryExecutionCount,
    distinctBaselineCount: selectionCache.size
  });
}
