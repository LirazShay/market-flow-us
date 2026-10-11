import { DEMO_BUY_DEFAULT_HORIZONS_MS } from "../shared/demo-buy/outcome-evidence.js";
import { openBacktestHistoricalScanner } from "./historical-scanner.js";
import { evaluateBacktestOutcomes } from "./outcome-evaluator.js";
import {
  buildBacktestPointResult,
  buildUnavailableBacktestPointResult,
  freezeBacktestPointRequest,
  selectBacktestRows
} from "./point-result.js";

export async function executeBacktestPoint({
  dataDir,
  sourceId,
  requestedAtMs,
  queries,
  topX = 10,
  horizonsMs = DEMO_BUY_DEFAULT_HORIZONS_MS,
  now,
  openHistoricalScanner = openBacktestHistoricalScanner,
  evaluateOutcomes = evaluateBacktestOutcomes
} = {}) {
  if (typeof openHistoricalScanner !== "function" || typeof evaluateOutcomes !== "function") {
    throw new TypeError("Backtest point dependencies must be functions.");
  }

  const request = freezeBacktestPointRequest({
    sourceId,
    requestedAtMs,
    queries,
    topX,
    horizonsMs
  });

  const historical = await openHistoricalScanner({
    dataDir,
    sourceId: request.sourceId,
    requestedAtMs: request.requestedAtMs,
    now
  });

  if (!historical || typeof historical.available !== "boolean" || typeof historical.close !== "function") {
    throw new TypeError("Historical Scanner point is invalid.");
  }

  try {
    if (!historical.available) {
      return buildUnavailableBacktestPointResult({ request });
    }
    if (!historical.baseline || !historical.scanner || typeof historical.scanner.execute !== "function") {
      throw new TypeError("Available historical Scanner point is invalid.");
    }

    const queryResults = [];
    for (const query of request.queries) {
      const scannerResult = await historical.scanner.execute(query.sql);
      const selection = selectBacktestRows(scannerResult, request.topX);
      const evaluation = await evaluateOutcomes({
        dataDir,
        sourceId: request.sourceId,
        baselineCycleId: historical.baseline.cycleId,
        requestedAtMs: request.requestedAtMs,
        selectedItems: selection.items,
        horizonsMs: request.horizonsMs
      });
      queryResults.push({ selection, evaluation });
    }

    return buildBacktestPointResult({
      request,
      baseline: historical.baseline,
      queryResults
    });
  } finally {
    await historical.close();
  }
}
