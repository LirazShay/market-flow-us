const numberFormatter = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 6
});

const timeFormatter = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

export const CURRENT_COLUMNS = Object.freeze([
  Object.freeze({ key: "paperName", label: "שם נייר", kind: "string" }),
  Object.freeze({ key: "securityId", label: "מספר נייר", kind: "string" }),
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
  Object.freeze({ key: "DailyLowestRate", label: "נמוך יומי", kind: "number" }),
  Object.freeze({ key: "DailyHighestRate", label: "גבוה יומי", kind: "number" }),
  Object.freeze({ key: "LastDealTimeOnly", label: "עסקה אחרונה", kind: "time" }),
  Object.freeze({ key: "collectedAtMs", label: "נאסף בשעה", kind: "timestamp" })
]);

export const US_CURRENT_COLUMNS = Object.freeze([
  Object.freeze({ key: "paperName", label: "שם נייר", kind: "string" }),
  Object.freeze({ key: "Symbol", label: "Symbol", kind: "string" }),
  Object.freeze({ key: "ExchangeName", label: "בורסה", kind: "string" }),
  Object.freeze({ key: "securityId", label: "PaperId", kind: "string" }),
  Object.freeze({ key: "Price", label: "Price", kind: "number" }),
  Object.freeze({ key: "ChangePercent", label: "ChangePercent", kind: "percentage" }),
  Object.freeze({ key: "BidRate", label: "BidRate", kind: "number" }),
  Object.freeze({ key: "AskRate", label: "AskRate", kind: "number" }),
  Object.freeze({ key: "DailyVolume", label: "DailyVolume", kind: "number" }),
  Object.freeze({ key: "DailyLow", label: "DailyLow", kind: "number" }),
  Object.freeze({ key: "DailyHigh", label: "DailyHigh", kind: "number" }),
  Object.freeze({ key: "YesterdayRate", label: "YesterdayRate", kind: "number" }),
  Object.freeze({ key: "PaperMarketCap", label: "PaperMarketCap", kind: "number" }),
  Object.freeze({ key: "TradeDateTime", label: "TradeDateTime", kind: "string" }),
  Object.freeze({ key: "collectedAtMs", label: "נאסף בשעה", kind: "timestamp" })
]);

export const LEGACY_CURRENT_PROFILE = Object.freeze({
  columns: CURRENT_COLUMNS,
  initialSortKey: "DailyDealsQuantity",
  identityTieBreakOnly: false
});

export const US_CURRENT_PROFILE = Object.freeze({
  columns: US_CURRENT_COLUMNS,
  initialSortKey: "DailyVolume",
  identityTieBreakOnly: true
});

const HEALTH_LABELS = Object.freeze({
  UNKNOWN: "לא ידוע",
  RUNNING: "רץ",
  STALE: "לא מעודכן",
  STOPPED: "נעצר",
  ERROR: "שגיאה"
});

function profileColumns(profile) {
  if (!profile || !Array.isArray(profile.columns) || profile.columns.length === 0) {
    throw new TypeError("Current profile must expose columns.");
  }
  return profile.columns;
}

function columnsByKey(profile) {
  return new Map(profileColumns(profile).map((column) => [column.key, column]));
}

function missingRank(value) {
  if (value === null) return 1;
  if (value === undefined) return 2;
  if (value === "") return 3;
  return 0;
}

function compareStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareLocaleStrings(left, right) {
  const result = String(left).localeCompare(String(right), "he-IL", {
    numeric: false,
    sensitivity: "variant"
  });
  return result === 0 ? 0 : result < 0 ? -1 : 1;
}

function comparePresentValues(left, right, column) {
  if (column.kind === "number" || column.kind === "percentage" || column.kind === "timestamp") {
    if (typeof left === "number" && Number.isFinite(left)
        && typeof right === "number" && Number.isFinite(right)) {
      return left === right ? 0 : left < right ? -1 : 1;
    }
  }

  if (column.key === "securityId") {
    return compareStrings(String(left), String(right));
  }

  return compareLocaleStrings(left, right);
}

function compareWithMissing(left, right, comparePresent) {
  const leftRank = missingRank(left);
  const rightRank = missingRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (leftRank !== 0) {
    return 0;
  }

  return comparePresent(left, right);
}

function assertSort(sort, profile) {
  const byKey = columnsByKey(profile);
  if (!sort || !byKey.has(sort.key) || !["asc", "desc"].includes(sort.direction)) {
    throw new TypeError("Invalid Current sort state.");
  }
}

function validateSummary(summary, rowCount) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new TypeError("Current summary must be an object.");
  }

  if (!Number.isInteger(summary.rowCount) || summary.rowCount < 0 || summary.rowCount !== rowCount) {
    throw new TypeError("Current summary rowCount must match rows.");
  }

  if (summary.lastCycleId !== null && !Number.isInteger(summary.lastCycleId)) {
    throw new TypeError("Current summary lastCycleId must be an integer or null.");
  }

  if (
    summary.lastCollectedAtMs !== null
    && (typeof summary.lastCollectedAtMs !== "number" || !Number.isFinite(summary.lastCollectedAtMs))
  ) {
    throw new TypeError("Current summary lastCollectedAtMs must be finite or null.");
  }

  return Object.freeze({
    rowCount: summary.rowCount,
    lastCycleId: summary.lastCycleId,
    lastCollectedAtMs: summary.lastCollectedAtMs
  });
}

export function createCurrentModel(response) {
  if (!response || !Array.isArray(response.rows)) {
    throw new TypeError("Current response rows must be an array.");
  }

  const seen = new Set();
  const rows = response.rows.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("Current row must be an object.");
    }
    if (typeof source.securityId !== "string" || source.securityId.length === 0) {
      throw new TypeError("Current row securityId must be a non-empty string.");
    }
    if (seen.has(source.securityId)) {
      throw new TypeError(`Duplicate securityId in Current rows: ${source.securityId}`);
    }
    seen.add(source.securityId);
    return Object.freeze({ ...source });
  });

  return Object.freeze({
    rows: Object.freeze(rows),
    summary: validateSummary(response.summary, rows.length)
  });
}

export function createInitialCurrentSort(profile = LEGACY_CURRENT_PROFILE) {
  const byKey = columnsByKey(profile);
  if (!byKey.has(profile.initialSortKey)) {
    throw new TypeError("Current profile initialSortKey is not a visible column.");
  }
  return Object.freeze({
    key: profile.initialSortKey,
    direction: "desc"
  });
}

export function nextCurrentSort(currentSort, selectedKey, profile = LEGACY_CURRENT_PROFILE) {
  assertSort(currentSort, profile);
  const column = columnsByKey(profile).get(selectedKey);
  if (!column) {
    throw new TypeError(`Unknown Current column: ${selectedKey}`);
  }

  if (currentSort.key === selectedKey) {
    return Object.freeze({
      key: selectedKey,
      direction: currentSort.direction === "asc" ? "desc" : "asc"
    });
  }

  return Object.freeze({
    key: selectedKey,
    direction: column.kind === "string" ? "asc" : "desc"
  });
}

export function sortCurrentRows(rows, sort, profile = LEGACY_CURRENT_PROFILE) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Current rows must be an array.");
  }
  assertSort(sort, profile);

  const column = columnsByKey(profile).get(sort.key);
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const selected = compareWithMissing(
      left?.[column.key],
      right?.[column.key],
      (a, b) => comparePresentValues(a, b, column)
    );
    if (selected !== 0) {
      const leftMissing = missingRank(left?.[column.key]);
      const rightMissing = missingRank(right?.[column.key]);
      return leftMissing !== rightMissing ? selected : selected * direction;
    }

    if (profile.identityTieBreakOnly !== true) {
      const paperName = compareWithMissing(
        left?.paperName,
        right?.paperName,
        compareLocaleStrings
      );
      if (paperName !== 0) return paperName;
    }

    return compareStrings(String(left?.securityId ?? ""), String(right?.securityId ?? ""));
  });
}

export function formatCurrentCell(key, value, profile = LEGACY_CURRENT_PROFILE) {
  const column = columnsByKey(profile).get(key);
  if (!column) {
    throw new TypeError(`Unknown Current column: ${key}`);
  }

  if (missingRank(value) !== 0) {
    return "—";
  }

  if (column.kind === "timestamp") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return String(value);
    }
    return timeFormatter.format(new Date(value));
  }

  if (column.kind === "number" || column.kind === "percentage") {
    const formatted = typeof value === "number" && Number.isFinite(value)
      ? numberFormatter.format(value)
      : String(value);
    return column.kind === "percentage" ? `${formatted}%` : formatted;
  }

  return String(value);
}

export function formatRecorderHealth(value) {
  return HEALTH_LABELS[value] ?? HEALTH_LABELS.UNKNOWN;
}

export function formatDiagnosticValue(value) {
  return missingRank(value) === 0 ? numberFormatter.format(value) : "—";
}

export function formatDiagnosticTime(value, nowMs = Date.now()) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const ageMs = Math.max(0, nowMs - value);
  const ageSeconds = Math.floor(ageMs / 1000);
  return `${timeFormatter.format(new Date(value))} · לפני ${numberFormatter.format(ageSeconds)} שנ׳`;
}
