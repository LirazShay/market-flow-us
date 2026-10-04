import { formatCurrentCell } from "./current-model.js";

const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 6
});

const timeFormatter = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export const HISTORY_COLUMNS = Object.freeze([
  Object.freeze({ key: "collectedAtMs", label: "זמן איסוף", kind: "timestamp" }),
  Object.freeze({ key: "cycleId", label: "Cycle", kind: "number" }),
  Object.freeze({ key: "chunkIndex", label: "Chunk", kind: "number" }),
  Object.freeze({ key: "LastKnownRate", label: "שער אחרון", kind: "number" }),
  Object.freeze({ key: "BaseRateChangePercentage", label: "שינוי יומי %", kind: "percentage" }),
  Object.freeze({ key: "BuyLimit1", label: "BID1", kind: "number" }),
  Object.freeze({ key: "BuyVolume1", label: "כמות BID1", kind: "number" }),
  Object.freeze({ key: "SellLimit1", label: "ASK1", kind: "number" }),
  Object.freeze({ key: "SellVolume1", label: "כמות ASK1", kind: "number" }),
  Object.freeze({ key: "DailyDealsQuantity", label: "מס' עסקאות", kind: "number" }),
  Object.freeze({ key: "LastDealVolume", label: "כמות עסקה אחרונה", kind: "number" }),
  Object.freeze({ key: "DailyTurnover", label: "כמות יומית", kind: "number" }),
  Object.freeze({ key: "DailyNISRevenue", label: "מחזור כספי", kind: "number" }),
  Object.freeze({ key: "LastDealTimeOnly", label: "עסקה אחרונה", kind: "time" }),
  Object.freeze({ key: "serverAsOfDate", label: "זמן שרת", kind: "source" })
]);

const historyByKey = new Map(HISTORY_COLUMNS.map((column) => [column.key, column]));

const CURRENT_SUMMARY_KEYS = new Set([
  "LastKnownRate",
  "BaseRateChangePercentage",
  "BuyLimit1",
  "SellLimit1",
  "LastDealTimeOnly"
]);

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function freezeHistoryRow(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("History row must be an object.");
  }
  if (!Number.isSafeInteger(source.collectedAtMs)) {
    throw new TypeError("History collectedAtMs must be a safe integer.");
  }
  if (!Number.isSafeInteger(source.cycleId)) {
    throw new TypeError("History cycleId must be a safe integer.");
  }
  if (!Number.isSafeInteger(source.chunkIndex)) {
    throw new TypeError("History chunkIndex must be a safe integer.");
  }
  return Object.freeze({ ...source });
}

function validateHistoryPage(page) {
  if (!page || !Array.isArray(page.rows) || typeof page.hasMore !== "boolean") {
    throw new TypeError("History page has an invalid shape.");
  }

  if (page.hasMore) {
    assertNonEmptyString(page.nextCursor, "History nextCursor");
  } else if (page.nextCursor !== null) {
    throw new TypeError("History nextCursor must be null when hasMore is false.");
  }

  return Object.freeze({
    rows: Object.freeze(page.rows.map(freezeHistoryRow)),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor
  });
}

function validateSecurity(security) {
  if (!security || typeof security !== "object" || Array.isArray(security)) {
    throw new TypeError("Security response must be an object.");
  }
  if (security.found !== true) {
    throw new TypeError("Detail model requires a found security.");
  }
  assertNonEmptyString(security.securityId, "securityId");

  if (security.paperName !== null && security.paperName !== undefined
      && typeof security.paperName !== "string") {
    throw new TypeError("paperName must be a string or null.");
  }
  if (typeof security.isCurrent !== "boolean") {
    throw new TypeError("isCurrent must be boolean.");
  }

  if (security.isCurrent) {
    if (!security.currentRow || typeof security.currentRow !== "object" || Array.isArray(security.currentRow)) {
      throw new TypeError("Current security requires currentRow.");
    }
    if (security.currentRow.securityId !== security.securityId) {
      throw new TypeError("currentRow securityId must match Detail identity.");
    }
  } else if (security.currentRow !== null) {
    throw new TypeError("Historical-only security must not expose currentRow.");
  }

  return Object.freeze({
    found: true,
    securityId: security.securityId,
    paperName: security.paperName ?? null,
    isCurrent: security.isCurrent,
    currentRow: security.currentRow === null
      ? null
      : Object.freeze({ ...security.currentRow })
  });
}

export function createDetailModel(securityResponse, historyPage) {
  const security = validateSecurity(securityResponse);
  const history = validateHistoryPage(historyPage);

  return Object.freeze({
    securityId: security.securityId,
    title: isMissing(security.paperName) ? security.securityId : security.paperName,
    paperName: security.paperName,
    isCurrent: security.isCurrent,
    currentRow: security.currentRow,
    rows: history.rows,
    hasMore: history.hasMore,
    nextCursor: history.nextCursor
  });
}

export function appendDetailHistory(model, historyPage) {
  if (!model || !Array.isArray(model.rows)) {
    throw new TypeError("Detail model is required.");
  }
  const page = validateHistoryPage(historyPage);

  return Object.freeze({
    ...model,
    rows: Object.freeze([...model.rows, ...page.rows]),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor
  });
}

export function formatDetailSummaryValue(model, key) {
  if (!model || !CURRENT_SUMMARY_KEYS.has(key)) {
    throw new TypeError("Unknown Detail summary key.");
  }
  if (!model.isCurrent || model.currentRow === null) {
    return "—";
  }
  return formatCurrentCell(key, model.currentRow[key]);
}

export function formatHistoryCell(key, value) {
  const column = historyByKey.get(key);
  if (!column) {
    throw new TypeError(`Unknown History column: ${key}`);
  }
  if (isMissing(value)) return "—";

  if (column.kind === "timestamp") {
    if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
    return timeFormatter.format(new Date(value));
  }

  if (column.kind === "percentage") {
    return typeof value === "number" && Number.isFinite(value)
      ? `${numberFormatter.format(value)}%`
      : `${String(value)}%`;
  }

  if (column.kind === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? numberFormatter.format(value)
      : String(value);
  }

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
