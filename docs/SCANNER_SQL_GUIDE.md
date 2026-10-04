# Market Flow US Scanner SQL Guide

## 1. Purpose

Scanner runs user-editable read-only DuckDB SQL over the local Market Flow US database.

Strategy logic belongs in SQL. The application does not secretly rank/filter/sort results.

## 2. Public tables

### latest

One latest committed row per current security.

Key/common columns:

```text
cycle_id
session_id
universe_revision
security_id
chunk_index
cycle_started_at_ms
chunk_received_at_ms
collected_at_ms
source_metadata_json

Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng

Price
ChangePercent
DailyHigh
DailyLow
YearHigh
YearLow
DailyVolume
BeginYearChangePercent
Month12ChangePercent
Month36ChangePercent
AskRate
BidRate
YesterdayRate
PaperMarketCap
PaperIdYatab
CountryId
PaperType
ESGRatingId
ESGScope

raw_data
```

### history

Same market-row projection as `latest`, with many rows per security over completed cycles.

Primary historical identity is `(cycle_id, security_id)`.

### universe

Current/all-seen identity metadata, including:

```text
security_id
is_current
universe_revision
first_seen_at_ms
last_seen_at_ms
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
raw_source
```

### cycles / sessions

Operational collection authority metadata.

### scanner_saved_queries

User query-library configuration metadata.

## 3. Important semantics

### security_id

Canonical identity is `String(PaperId)`.

To make Scanner rows navigable to Detail, return:

```sql
security_id AS securityId
```

### Price

Source-named current/last-like provider field. Do not assume a stronger market-data semantic than documented.

### collected_at_ms

Browser collection time used for local history ordering and relative-time analysis.

### TradeDateTime

Source string. It is not the authoritative local collection timestamp.

### Nulls

Provider fields may be SQL NULL. Numeric zero is not missing.

## 4. Scanner security boundary

Allowed query shape:

- exactly one statement;
- SELECT;
- zero parameters;
- no blocked dynamic query helpers;
- no side-effect functions.

Use explicit LIMIT for exploratory result sets.

## 5. Basic examples

### Current rows

```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

### Active U.S. names by source daily volume

```sql
SELECT
  security_id AS securityId,
  Symbol,
  ExchangeName,
  Price,
  ChangePercent,
  DailyVolume
FROM latest
ORDER BY DailyVolume DESC NULLS LAST, security_id
LIMIT 100;
```

### Largest current daily percentage moves

```sql
SELECT
  security_id AS securityId,
  Symbol,
  Price,
  ChangePercent,
  DailyVolume
FROM latest
WHERE ChangePercent IS NOT NULL
ORDER BY ChangePercent DESC, DailyVolume DESC NULLS LAST
LIMIT 100;
```

## 6. Relative historical lookup

To find the latest available sample at or before a target age:

```sql
SELECT h.*
FROM history AS h
WHERE h.security_id = $CURRENT_SECURITY
  AND h.collected_at_ms <= $CURRENT_TIME - $AGE_MS
ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
LIMIT 1
```

Scanner itself does not support parameters; the fragment above explains the pattern used inside a complete query.

## 7. Built-in staged candidate ranking

Initial editable example:

```sql
WITH candidates AS (
  SELECT
    l.security_id AS securityId,
    l.Symbol,
    l.ExchangeName,
    l.Price,
    l.ChangePercent,
    l.DailyVolume,
    l.collected_at_ms,

    p10.Price  AS price_10s,
    p20.Price  AS price_20s,
    p30.Price  AS price_30s,
    p45.Price  AS price_45s,
    p60.Price  AS price_60s,
    p90.Price  AS price_90s,
    p120.Price AS price_120s
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

  WHERE l.Price IS NOT NULL
),
scored AS (
  SELECT
    *,
    CASE
      WHEN price_10s IS NULL  OR Price <= price_10s  THEN 0
      WHEN price_20s IS NULL  OR Price <= price_20s  THEN 1
      WHEN price_30s IS NULL  OR Price <= price_30s  THEN 2
      WHEN price_45s IS NULL  OR Price <= price_45s  THEN 3
      WHEN price_60s IS NULL  OR Price <= price_60s  THEN 4
      WHEN price_90s IS NULL  OR Price <= price_90s  THEN 5
      WHEN price_120s IS NULL OR Price <= price_120s THEN 6
      ELSE 7
    END AS stage_reached
  FROM candidates
)
SELECT
  securityId,
  Symbol,
  ExchangeName,
  Price,
  ChangePercent,
  DailyVolume,
  stage_reached,
  price_10s,
  price_20s,
  price_30s,
  price_45s,
  price_60s,
  price_90s,
  price_120s
FROM scored
ORDER BY
  stage_reached DESC,
  ChangePercent DESC NULLS LAST,
  DailyVolume DESC NULLS LAST,
  securityId ASC
LIMIT 100;
```

This query is deliberately ordinary SQL.

Change stages, predicates or tie-breakers by editing/copying the query. No DB schema change is required.

## 8. Performance guidance

Prefer:

- `latest` as the starting set when evaluating current candidates;
- bounded result sets;
- explicit target-time predicates;
- only the historical joins needed by the strategy.

The staged built-in is intentionally measured in the representative U.S. workload.

Do not add materialized horizon columns unless real workload evidence proves direct history SQL is materially insufficient.

## 9. AI prompt pattern

Use:

```text
Write one read-only DuckDB SELECT for Market Flow US.

Public tables/fields follow docs/SCANNER_SQL_GUIDE.md.
Return security_id AS securityId when a result should open Detail.
Do not mutate data.
Keep the result bounded with LIMIT unless aggregation naturally bounds it.

Goal:
<describe the market filter/ranking/comparison I want>
```
