import {
  LEGACY_CURRENT_PROFILE,
  US_CURRENT_PROFILE,
  formatCurrentCell
} from "./current-model.js";

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

export const US_HISTORY_COLUMNS = Object.freeze([
  Object.freeze({ key: "collectedAtMs", label: "זמן איסוף", kind: "timestamp" }),
  Object.freeze({ key: "cycleId", label: "Cycle", kind: "number" }),
  Object.freeze({ key: "Price", label: "Price", kind: "number" }),
  Object.freeze({ key: "ChangePercent", label: "ChangePercent", kind: "percentage" }),
  Object.freeze({ key: "BidRate", label: "BidRate", kind: "number" }),
  Object.freeze({ key: "AskRate", label: "AskRate", kind: "number" }),
  Object.freeze({ key: "DailyVolume", label: "DailyVolume", kind: "number" }),
  Object.freeze({ key: "DailyLow", label: "DailyLow", kind: "number" }),
  Object.freeze({ key: "DailyHigh", label: "DailyHigh", kind: "number" }),
  Object.freeze({ key: "YesterdayRate", label: "YesterdayRate", kind: "number" }),
  Object.freeze({ key: "PaperMarketCap", label: "PaperMarketCap", kind: "number" }),
  Object.freeze({ key: "TradeDateTime", label: "TradeDateTime", kind: "string" })
]);

export const DETAIL_SUMMARY_COLUMNS = Object.freeze([
  Object.freeze({ key: "LastKnownRate", label: "שער אחרון", testId: "detail-last-rate" }),
  Object.freeze({ key: "BaseRateChangePercentage", label: "שינוי יומי %" }),
  Object.freeze({ key: "BuyLimit1", label: "BID1" }),
  Object.freeze({ key: "SellLimit1", label: "ASK1" }),
  Object.freeze({ key: "LastDealTimeOnly", label: "עסקה אחרונה" })
]);

export const US_DETAIL_SUMMARY_COLUMNS = Object.freeze([
  Object.freeze({ key: "Price", label: "Price", testId: "detail-price" }),
  Object.freeze({ key: "ChangePercent", label: "ChangePercent" }),
  Object.freeze({ key: "BidRate", label: "BidRate" }),
  Object.freeze({ key: "AskRate", label: "AskRate" }),
  Object.freeze({ key: "DailyVolume", label: "DailyVolume" }),
  Object.freeze({ key: "TradeDateTime", label: "TradeDateTime" })
]);

export const LEGACY_DETAIL_PROFILE = Object.freeze({
  historyColumns: HISTORY_COLUMNS,
  summaryColumns: DETAIL_SUMMARY_COLUMNS,
  currentProfile: LEGACY_CURRENT_PROFILE,
  requireChunkIndex: true
});

export const US_DETAIL_PROFILE = Object.freeze({
  historyColumns: US_HISTORY_COLUMNS,
  summaryColumns: US_DETAIL_SUMMARY_COLUMNS,
  currentProfile: US_CURRENT_PROFILE,
  requireChunkIndex: false
});

function isMissing(value) {
  return value === null || value === undefined || value === "";
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertProfile(profile) {
  if (
    !profile
    || !Array.isArray(profile.historyColumns)
    || profile.historyColumns.length === 0
    || !Array.isArray(profile.summaryColumns)
    || profile.summaryColumns.length === 0
    || !profile.currentProfile
  ) {
    throw new TypeError("Detail profile is invalid.");
  }
}

function freezeHistoryRow(source, profile) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("History row must be an object.");
  }
  if (!Number.isSafeInteger(source.collectedAtMs)) {
    throw new TypeError("History collectedAtMs must be a safe integer.");
  }
  if (!Number.isSafeInteger(source.cycleId)) {
    throw new TypeError("History cycleId must be a safe integer.");
  }
  if (profile.requireChunkIndex && !Number.isSafeInteger(source.chunkIndex)) {
    throw new TypeError("History chunkIndex must be a safe integer.");
  }
  return Object.freeze({ ...source });
}

function validateHistoryPage(page, profile) {
  assertProfile(profile);
  if (!page || !Array.isArray(page.rows) || typeof page.hasMore !== "boolean") {
    throw new TypeError("History page has an invalid shape.");
  }

  if (page.hasMore) {
    assertNonEmptyString(page.nextCursor, "History nextCursor");
  } else if (page.nextCursor !== null) {
    throw new TypeError("History nextCursor must be null when hasMore is false.");
  }

  return Object.freeze({
    rows: Object.freeze(page.rows.map((row) => freezeHistoryRow(row, profile))),
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

export function createDetailModel(
  securityResponse,
  historyPage,
  profile = LEGACY_DETAIL_PROFILE
) {
  const security = validateSecurity(securityResponse);
  const history = validateHistoryPage(historyPage, profile);

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

export function appendDetailHistory(
  model,
  historyPage,
  profile = LEGACY_DETAIL_PROFILE
) {
  if (!model || !Array.isArray(model.rows)) {
    throw new TypeError("Detail model is required.");
  }
  const page = validateHistoryPage(historyPage, profile);

  return Object.freeze({
    ...model,
    rows: Object.freeze([...model.rows, ...page.rows]),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor
  });
}

export function formatDetailSummaryValue(
  model,
  key,
  profile = LEGACY_DETAIL_PROFILE
) {
  assertProfile(profile);
  if (!model || !profile.summaryColumns.some((column) => column.key === key)) {
    throw new TypeError("Unknown Detail summary key.");
  }
  if (!model.isCurrent || model.currentRow === null) {
    return "—";
  }
  return formatCurrentCell(key, model.currentRow[key], profile.currentProfile);
}

export function formatHistoryCell(
  key,
  value,
  profile = LEGACY_DETAIL_PROFILE
) {
  assertProfile(profile);
  const column = profile.historyColumns.find((candidate) => candidate.key === key);
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
