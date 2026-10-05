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
    sql: `WITH stage_offsets(age_ms) AS (
  VALUES
    (10000),
    (20000),
    (30000),
    (45000),
    (60000),
    (90000),
    (120000)
),
latest_bounds AS (
  SELECT
    min(collected_at_ms) AS min_collected_at_ms,
    max(collected_at_ms) AS max_collected_at_ms
  FROM latest
),
targets AS (
  SELECT
    l.security_id,
    l.collected_at_ms,
    o.age_ms,
    l.collected_at_ms - o.age_ms AS target_at_ms
  FROM latest AS l
  CROSS JOIN stage_offsets AS o
),
recent_history AS (
  SELECT
    h.security_id,
    h.collected_at_ms,
    h.cycle_id,
    h.Price
  FROM history AS h
  CROSS JOIN latest_bounds AS b
  WHERE h.collected_at_ms >= b.min_collected_at_ms - 150000
    AND h.collected_at_ms <= b.max_collected_at_ms - 10000
  QUALIFY row_number() OVER (
    PARTITION BY h.security_id, h.collected_at_ms
    ORDER BY h.cycle_id DESC
  ) = 1
),
recent_matches AS (
  SELECT
    t.security_id,
    t.collected_at_ms,
    t.age_ms,
    t.target_at_ms,
    h.cycle_id AS matched_cycle_id,
    h.Price AS matched_price
  FROM targets AS t
  ASOF LEFT JOIN recent_history AS h
    ON t.security_id = h.security_id
   AND t.target_at_ms >= h.collected_at_ms
),
fallback_matches AS (
  SELECT
    r.security_id,
    r.collected_at_ms,
    r.age_ms,
    f.cycle_id AS matched_cycle_id,
    f.Price AS matched_price
  FROM recent_matches AS r
  LEFT JOIN LATERAL (
    SELECT
      h.cycle_id,
      h.Price
    FROM history AS h
    WHERE h.security_id = r.security_id
      AND h.collected_at_ms <= r.target_at_ms
    ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
    LIMIT 1
  ) AS f ON true
  WHERE r.matched_cycle_id IS NULL
),
resolved_matches AS (
  SELECT
    security_id,
    collected_at_ms,
    age_ms,
    matched_cycle_id,
    matched_price
  FROM recent_matches
  WHERE matched_cycle_id IS NOT NULL

  UNION ALL

  SELECT
    security_id,
    collected_at_ms,
    age_ms,
    matched_cycle_id,
    matched_price
  FROM fallback_matches
),
anchors AS (
  SELECT
    security_id,
    collected_at_ms,
    max(CASE WHEN age_ms = 10000 THEN matched_price END) AS price_10s_ago,
    max(CASE WHEN age_ms = 20000 THEN matched_price END) AS price_20s_ago,
    max(CASE WHEN age_ms = 30000 THEN matched_price END) AS price_30s_ago,
    max(CASE WHEN age_ms = 45000 THEN matched_price END) AS price_45s_ago,
    max(CASE WHEN age_ms = 60000 THEN matched_price END) AS price_60s_ago,
    max(CASE WHEN age_ms = 90000 THEN matched_price END) AS price_90s_ago,
    max(CASE WHEN age_ms = 120000 THEN matched_price END) AS price_120s_ago
  FROM resolved_matches
  GROUP BY security_id, collected_at_ms
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
