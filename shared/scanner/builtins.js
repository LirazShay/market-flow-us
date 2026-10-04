const LEGACY_BUILTIN_SOURCE = [
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

const MARKET_FLOW_US_BUILTIN_SOURCE = [
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
    name: "U.S. market ranking example",
    sql: `SELECT
  security_id AS securityId,
  Symbol,
  PaperNameEng,
  ExchangeName,
  Price,
  ChangePercent,
  BidRate,
  AskRate,
  DailyVolume,
  PaperMarketCap
FROM latest
WHERE Price IS NOT NULL
ORDER BY ChangePercent DESC NULLS LAST,
         DailyVolume DESC NULLS LAST,
         security_id ASC
LIMIT 20;`,
    intervalMs: 5000,
    editable: false,
    deletable: false,
    createdAtMs: null,
    updatedAtMs: null
  },
  {
    queryId: "builtin:staged-candidate-ranking",
    source: "builtin",
    name: "Staged candidate ranking",
    sql: `SELECT
  l.security_id AS securityId,
  l.Symbol,
  l.PaperNameEng,
  l.ExchangeName,
  l.Price,
  l.ChangePercent,
  l.DailyVolume,
  p10.Price AS price_10s_ago,
  p20.Price AS price_20s_ago,
  p30.Price AS price_30s_ago,
  p45.Price AS price_45s_ago,
  p60.Price AS price_60s_ago,
  p90.Price AS price_90s_ago,
  p120.Price AS price_120s_ago,
  CASE
    WHEN l.Price > p10.Price THEN
      CASE
        WHEN l.Price > p20.Price THEN
          CASE
            WHEN l.Price > p30.Price THEN
              CASE
                WHEN l.Price > p45.Price THEN
                  CASE
                    WHEN l.Price > p60.Price THEN
                      CASE
                        WHEN l.Price > p90.Price THEN
                          CASE WHEN l.Price > p120.Price THEN 7 ELSE 6 END
                        ELSE 5
                      END
                    ELSE 4
                  END
                ELSE 3
              END
            ELSE 2
          END
        ELSE 1
      END
    ELSE 0
  END AS stage_reached
FROM latest AS l
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 10000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p10 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 20000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p20 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 30000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p30 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 45000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p45 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 60000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p60 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 90000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p90 ON TRUE
LEFT JOIN LATERAL (
  SELECT h.Price
  FROM history AS h
  WHERE h.security_id = l.security_id
    AND h.collected_at_ms <= l.collected_at_ms - 120000
  ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
  LIMIT 1
) AS p120 ON TRUE
ORDER BY stage_reached DESC,
         l.ChangePercent DESC NULLS LAST,
         l.DailyVolume DESC NULLS LAST,
         l.security_id ASC
LIMIT 100;`,
    intervalMs: 5000,
    editable: false,
    deletable: false,
    createdAtMs: null,
    updatedAtMs: null
  }
];

function freezeQueries(source) {
  return Object.freeze(source.map((query) => Object.freeze({ ...query })));
}

export function normalizeScannerQueryNameKey(name) {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

// Normal runtime remains on the imported MarketScope profile until TREE node 5.2.
export const BUILTIN_SCANNER_QUERIES = freezeQueries(LEGACY_BUILTIN_SOURCE);

// Explicit pre-cutover target profile used by U.S. Scanner contract/tests.
export const MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES = freezeQueries(
  MARKET_FLOW_US_BUILTIN_SOURCE
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
