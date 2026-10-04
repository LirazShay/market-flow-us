const BUILTIN_SOURCE = [
  {
    queryId: "builtin:all-current-fields",
    source: "builtin",
    name: "All current fields",
    sql: `SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;`,
    intervalMs: 5000,
    editable: false,
    deletable: false,
    createdAtMs: null,
    updatedAtMs: null
  },
  {
    queryId: "builtin:market-ranking-example",
    source: "builtin",
    name: "Market ranking example",
    sql: `SELECT
  security_id AS securityId,
  LastKnownRate,
  BaseRateChangePercentage,
  DailyDealsQuantity,
  BuyLimit1,
  SellLimit1
FROM latest
WHERE LastKnownRate IS NOT NULL
ORDER BY BaseRateChangePercentage DESC NULLS LAST,
         DailyDealsQuantity DESC NULLS LAST,
         security_id ASC
LIMIT 20;`,
    intervalMs: 5000,
    editable: false,
    deletable: false,
    createdAtMs: null,
    updatedAtMs: null
  }
];

export function normalizeScannerQueryNameKey(name) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

export const BUILTIN_SCANNER_QUERIES = Object.freeze(
  BUILTIN_SOURCE.map((query) => Object.freeze({ ...query }))
);

const BUILTIN_IDS = new Set(BUILTIN_SCANNER_QUERIES.map((query) => query.queryId));
const BUILTIN_NAME_KEYS = new Set(
  BUILTIN_SCANNER_QUERIES.map((query) => normalizeScannerQueryNameKey(query.name))
);

export function isBuiltinQueryId(queryId) {
  return BUILTIN_IDS.has(queryId);
}

export function builtinNameKeys() {
  return new Set(BUILTIN_NAME_KEYS);
}


export function mergeScannerQueryLibrary(userQueries = []) {
  if (!Array.isArray(userQueries)) {
    throw new TypeError("userQueries must be an array.");
  }

  const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

  const sortedUsers = [...userQueries].sort((left, right) => {
    const leftKey = normalizeScannerQueryNameKey(left?.name ?? "");
    const rightKey = normalizeScannerQueryNameKey(right?.name ?? "");
    const byName = compareText(leftKey, rightKey);
    if (byName !== 0) return byName;
    return compareText(String(left?.queryId ?? ""), String(right?.queryId ?? ""));
  });

  return Object.freeze([
    ...BUILTIN_SCANNER_QUERIES,
    ...sortedUsers
  ]);
}
