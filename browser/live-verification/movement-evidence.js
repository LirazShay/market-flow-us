import { createViewerClient } from "../viewer/client.js";

const DEFAULT_SERVICE_URL = "ws://127.0.0.1:8765";
const DEFAULT_PRODUCT_VERSION = "0.1.0";

export const MOVEMENT_FIELDS = Object.freeze([
  "Price",
  "ChangePercent",
  "BidRate",
  "AskRate",
  "DailyVolume",
  "TradeDateTime"
]);

function assertCycleId(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
}

function nullableComparable(value) {
  if (value === null || value === undefined) return "<NULL>";
  if (typeof value === "number" && Number.isFinite(value)) return `n:${value}`;
  if (typeof value === "string") return `s:${value}`;
  return `other:${String(value)}`;
}

function pendingEvidence() {
  return Object.freeze({
    status: "PENDING",
    observed: false,
    securityId: null,
    field: null,
    currentReflected: false,
    historyReflected: false,
    code: "NO_MARKET_MOVEMENT_OBSERVED"
  });
}

function failedEvidence({ observed = null, securityId = null, field = null } = {}) {
  return Object.freeze({
    status: "FAIL",
    observed,
    securityId,
    field,
    currentReflected: false,
    historyReflected: false,
    code: "MOVEMENT_EVIDENCE_NOT_PROVEN"
  });
}

export function buildMovementWitnessSql({ firstCycleId, lastCycleId }) {
  assertCycleId(firstCycleId, "firstCycleId");
  assertCycleId(lastCycleId, "lastCycleId");
  if (lastCycleId < firstCycleId) {
    throw new RangeError("lastCycleId cannot be earlier than firstCycleId.");
  }

  const changedCases = MOVEMENT_FIELDS.map((field) =>
    `WHEN COUNT(DISTINCT COALESCE(CAST(${field} AS VARCHAR), '<NULL>')) > 1 THEN '${field}'`
  ).join("\n        ");

  return `WITH live_history AS (
    SELECT
      security_id,
      Price,
      ChangePercent,
      BidRate,
      AskRate,
      DailyVolume,
      TradeDateTime
    FROM history
    WHERE cycle_id BETWEEN ${firstCycleId} AND ${lastCycleId}
  ), movement AS (
    SELECT
      security_id,
      CASE
        ${changedCases}
        ELSE NULL
      END AS changed_field
    FROM live_history
    GROUP BY security_id
  )
  SELECT
    m.security_id AS securityId,
    m.changed_field AS changedField,
    l.cycle_id AS latestCycleId
  FROM movement m
  JOIN latest l ON l.security_id = m.security_id
  WHERE m.changed_field IS NOT NULL
    AND l.cycle_id = ${lastCycleId}
  ORDER BY m.security_id ASC
  LIMIT 1`;
}

function scannerRowsAsObjects(result) {
  if (!result || !Array.isArray(result.columns) || !Array.isArray(result.rows)) {
    throw new TypeError("Scanner movement result is invalid.");
  }
  const names = result.columns.map((column) => column?.name);
  return result.rows.map((row) => Object.fromEntries(
    names.map((name, index) => [name, row[index]])
  ));
}

function findFinalHistoryRow(rows, lastCycleId) {
  return rows.find((row) => String(row?.cycleId) === String(lastCycleId)) ?? null;
}

export async function evaluateMovementEvidence({
  baseReport,
  serviceUrl = DEFAULT_SERVICE_URL,
  productVersion = DEFAULT_PRODUCT_VERSION,
  viewerClientFactory = createViewerClient
} = {}) {
  if (baseReport?.overall !== "PASS") {
    return failedEvidence();
  }
  if (typeof viewerClientFactory !== "function") {
    return failedEvidence();
  }

  const firstCycleId = baseReport?.sustainedRun?.firstCycleId;
  const lastCycleId = baseReport?.sustainedRun?.lastCycleId;
  try {
    assertCycleId(firstCycleId, "firstCycleId");
    assertCycleId(lastCycleId, "lastCycleId");
  } catch {
    return failedEvidence();
  }

  let viewer = null;
  try {
    viewer = viewerClientFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-flow-us-movement-${lastCycleId}`
    });

    const scanner = await viewer.executeScanner(
      buildMovementWitnessSql({ firstCycleId, lastCycleId })
    );
    const witnesses = scannerRowsAsObjects(scanner);
    if (witnesses.length === 0) {
      return pendingEvidence();
    }
    if (witnesses.length !== 1) {
      return failedEvidence();
    }

    const witness = witnesses[0];
    const securityId = typeof witness.securityId === "string"
      ? witness.securityId
      : String(witness.securityId ?? "");
    const field = witness.changedField;
    const latestCycleId = Number(witness.latestCycleId);

    if (
      securityId.length === 0
      || !MOVEMENT_FIELDS.includes(field)
      || latestCycleId !== lastCycleId
    ) {
      return failedEvidence({ observed: true, securityId: securityId || null, field: field ?? null });
    }

    const [current, history] = await Promise.all([
      viewer.getCurrent(),
      viewer.getHistoryPage(securityId, null)
    ]);

    const currentRow = Array.isArray(current?.rows)
      ? current.rows.find((row) => String(row?.securityId) === securityId) ?? null
      : null;
    const liveRows = Array.isArray(history?.rows)
      ? history.rows.filter((row) => {
          const cycleId = Number(row?.cycleId);
          return Number.isSafeInteger(cycleId)
            && cycleId >= firstCycleId
            && cycleId <= lastCycleId;
        })
      : [];
    const finalHistoryRow = findFinalHistoryRow(liveRows, lastCycleId);
    const distinctValues = new Set(liveRows.map((row) => nullableComparable(row?.[field])));

    const currentReflected =
      String(current?.summary?.lastCycleId) === String(lastCycleId)
      && currentRow !== null
      && finalHistoryRow !== null
      && nullableComparable(currentRow[field]) === nullableComparable(finalHistoryRow[field]);
    const historyReflected = finalHistoryRow !== null && distinctValues.size > 1;

    return Object.freeze({
      status: currentReflected && historyReflected ? "PASS" : "FAIL",
      observed: true,
      securityId,
      field,
      currentReflected,
      historyReflected,
      code: currentReflected && historyReflected
        ? "MARKET_MOVEMENT_COMMITTED"
        : "MOVEMENT_EVIDENCE_NOT_PROVEN"
    });
  } catch {
    return failedEvidence();
  } finally {
    try {
      viewer?.close?.();
    } catch {
      // Evidence cleanup is best-effort and never changes the recorded evidence classification.
    }
  }
}

export function attachMovementEvidence(baseReport, movement) {
  if (!baseReport || typeof baseReport !== "object" || Array.isArray(baseReport)) {
    throw new TypeError("baseReport must be an object.");
  }
  if (!movement || typeof movement !== "object" || Array.isArray(movement)) {
    throw new TypeError("movement must be an object.");
  }
  return Object.freeze({
    ...baseReport,
    movement: Object.freeze({ ...movement })
  });
}
