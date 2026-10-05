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
    sql: `WITH anchors AS (
  SELECT
    l.security_id,
    l.collected_at_ms,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 10000) AS price_10s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 20000) AS price_20s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 30000) AS price_30s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 45000) AS price_45s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 60000) AS price_60s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 90000) AS price_90s_ago,
    first(h.Price ORDER BY h.collected_at_ms DESC, h.cycle_id DESC)
      FILTER (WHERE h.collected_at_ms <= l.collected_at_ms - 120000) AS price_120s_ago
  FROM latest AS l
  LEFT JOIN history AS h
    ON h.security_id = l.security_id
   AND h.collected_at_ms <= l.collected_at_ms - 10000
  GROUP BY l.security_id, l.collected_at_ms
)
SELECT
  l.security_id AS securityId,
  l.Symbol,
  l.PaperNameEng,
  l.ExchangeName,
  l.Price,
  l.ChangePercent,
  l.DailyVolume,
  a.price_10s_ago,
  a.price_20s_ago,
  a.price_30s_ago,
  a.price_45s_ago,
  a.price_60s_ago,
  a.price_90s_ago,
  a.price_120s_ago,
  CASE
    WHEN l.Price > a.price_10s_ago THEN
      CASE
        WHEN l.Price > a.price_20s_ago THEN
          CASE
            WHEN l.Price > a.price_30s_ago THEN
              CASE
                WHEN l.Price > a.price_45s_ago THEN
                  CASE
                    WHEN l.Price > a.price_60s_ago THEN
                      CASE
                        WHEN l.Price > a.price_90s_ago THEN
                          CASE WHEN l.Price > a.price_120s_ago THEN 7 ELSE 6 END
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
LEFT JOIN anchors AS a
  ON a.security_id = l.security_id
 AND a.collected_at_ms = l.collected_at_ms
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

// Retained only for the imported schema-v2 regression suite.
export const LEGACY_SCANNER_QUERIES = freezeQueries(LEGACY_BUILTIN_SOURCE);
export const BUILTIN_SCANNER_QUERIES = LEGACY_SCANNER_QUERIES;

// Market Flow US is the normal product query-library profile after TREE node 5.2.
export const MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES = freezeQueries(
  MARKET_FLOW_US_BUILTIN_SOURCE
);

const BUILTIN_IDS = new Set(
  MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.map((query) => query.queryId)
);
const BUILTIN_NAME_KEYS = new Set(
  MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES.map(
    (query) => normalizeScannerQueryNameKey(query.name)
  )
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
    ...MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES,
    ...sortedUsers
  ]);
}
