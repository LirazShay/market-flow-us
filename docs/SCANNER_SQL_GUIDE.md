# Market Flow US Scanner SQL Guide

## Purpose

This is the canonical authoring guide for **Market Flow US Scanner SQL**.

Use it when:

- writing or reviewing a Scanner query;
- asking an AI assistant to create or modify Scanner SQL;
- checking the public DuckDB schema that Scanner may read;
- understanding the built-in U.S. examples, including staged candidate ranking.

The Market Flow US target contract is **schema v3**. The normal imported MarketScope runtime is intentionally not cut over to the U.S. profile until TREE node `5.2`; the U.S. built-ins below therefore exist as an explicit pre-cutover target profile during Chat 4.

This guide must stay synchronized with:

- `docs/DATA_CONTRACT.md`;
- `docs/TECHNICAL_SPEC.md`;
- the real schema-v3 DuckDB bootstrap;
- `MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES`;
- Scanner admission and schema-drift tests.

---

## 1. Scanner rules in one page

Scanner is a trusted local **read-only analytical SQL** surface.

Use exactly one `SELECT` statement.

Supported analytical constructs include:

- `SELECT`;
- `JOIN` and `LEFT JOIN LATERAL`;
- `WHERE`;
- `GROUP BY` / `HAVING`;
- `ORDER BY` / `LIMIT`;
- window functions;
- time/history predicates;
- cross-security comparisons and ranking.

Scanner rejects:

- empty SQL;
- more than one statement;
- `INSERT`, `UPDATE`, `DELETE`;
- `CREATE`, `DROP`, `ALTER`;
- parameterized statements;
- `query(...)`;
- `query_table(...)`;
- functions reported by DuckDB as side-effecting.

The Scanner connection is also hardened against external access/extensions/secrets/config mutation.

Saving SQL is configuration CRUD; it does **not** validate or execute the SQL. Admission happens only when the user explicitly activates/executes the draft.

---

## 2. Practical authoring rules

Prefer deliberately bounded queries.

For Current-style exploration:

```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

For history:

- filter by `security_id` when analyzing one security;
- constrain `collected_at_ms` when practical;
- use an explicit `ORDER BY` whenever order matters;
- use `LIMIT` when only a sample/top-N is required.

The Scanner UI does not add hidden ranking, filtering, sorting or limits.

If a result row should open the normal Security Detail / History surface, return the canonical ID exactly as:

```sql
security_id AS securityId
```

Do not use `Symbol`, provider row order or a paper name as identity.

---

## 3. Canonical identity and joins

The U.S. provider identity mapping is:

```text
ScreenerHulPaging3 record.PaperId
→ String(PaperId)
→ universe.security_id
→ history.security_id / latest.security_id
```

`Symbol` is useful display/query metadata but is not the primary key.

### Current row + universe metadata

<!-- scanner-us-executable:latest-with-universe -->
```sql
SELECT
  l.security_id AS securityId,
  l.Symbol,
  COALESCE(NULLIF(l.PaperNameEng, ''), NULLIF(l.PaperNameHeb, ''), l.Symbol, l.security_id) AS displayName,
  l.ExchangeName,
  l.Price,
  l.ChangePercent,
  l.DailyVolume
FROM latest AS l
LEFT JOIN universe AS u
  ON u.security_id = l.security_id
ORDER BY l.security_id
LIMIT 100;
```

The `LEFT JOIN` keeps the committed market row even if universe display metadata is absent.

### History for one canonical security

<!-- scanner-us-executable:recent-history -->
```sql
SELECT
  security_id AS securityId,
  cycle_id,
  collected_at_ms,
  Price,
  ChangePercent,
  BidRate,
  AskRate,
  DailyVolume
FROM history
WHERE security_id = '101'
ORDER BY collected_at_ms DESC, cycle_id DESC
LIMIT 100;
```

---

## 4. Time and value semantics

### Local timing

`*_at_ms` columns are local runtime/database timing facts in milliseconds. They are not exchange timestamps unless another durable contract explicitly says so.

For staged history comparisons, `latest.collected_at_ms` is the current row's local collection time and `history.collected_at_ms` is the corresponding historical collection time.

`TradeDateTime` is preserved as a provider string. Do not invent timezone or exchange-time semantics beyond verified provider evidence.

### Raw versus typed values

Raw provider data preserves the distinction:

```text
0
!= null
!= ""
!= missing property
```

Typed numeric projections become SQL `DOUBLE` when the source value is valid and otherwise may be SQL `NULL`. The full source-shaped row remains in `raw_data`.

Therefore:

- do not silently turn `NULL` into zero;
- use `IS NULL` / `IS NOT NULL` deliberately;
- use `NULLS LAST` / `NULLS FIRST` explicitly when nullable ordering matters.

### Known versus unknown market semantics

Market Flow US intentionally preserves provider-shaped names where independent semantics are not yet stronger than the source evidence.

Fields such as `Price`, `DailyVolume`, `PaperMarketCap`, `TradeDateTime`, `BidRate` and `AskRate` are queryable source facts. Do not invent undocumented units, venue coverage, freshness guarantees or trading meaning.

Scanner SQL can mechanically compare values without claiming that the comparison is a profitable trading rule.

---

## 5. Public Scanner schema — schema v3

Scanner reads the same seven public tables owned by the local service:

```text
schema_info
sessions
universe
cycles
history
latest
scanner_saved_queries
```

There is no hidden analytical database.

### 5.1 `schema_info`

| Column | Type | Null | Meaning |
|---|---|---|---|
| `schema_version` | INTEGER | NO | Market Flow US schema version; target is `3`. |
| `created_at_ms` | BIGINT | NO | Local DB creation time. |
| `product_version` | VARCHAR | NO | Product/service version recorded at bootstrap. |

### 5.2 `sessions`

| Column | Type | Null |
|---|---|---|
| `session_id` | VARCHAR | NO |
| `producer_instance_id` | VARCHAR | NO |
| `status` | VARCHAR | NO |
| `started_at_ms` | BIGINT | NO |
| `stopped_at_ms` | BIGINT | YES |
| `stop_reason` | VARCHAR | YES |
| `last_heartbeat_at_ms` | BIGINT | NO |
| `completed_cycles` | BIGINT | NO |
| `failed_cycles` | BIGINT | NO |
| `last_completed_cycle_id` | BIGINT | YES |
| `last_completed_at_ms` | BIGINT | YES |
| `config_json` | JSON | NO |
| `last_error_json` | JSON | YES |

### 5.3 `universe`

| Column | Type | Null | Meaning |
|---|---|---|---|
| `security_id` | VARCHAR | NO | Canonical `String(PaperId)`. |
| `is_current` | BOOLEAN | NO | Membership in the latest accepted universe. |
| `universe_revision` | BIGINT | NO | Node-assigned accepted revision. |
| `first_seen_at_ms` | BIGINT | NO | First local accepted sighting. |
| `last_seen_at_ms` | BIGINT | NO | Most recent accepted sighting. |
| `Symbol` | VARCHAR | YES | Provider display/query metadata. |
| `PaperNameEng` | VARCHAR | YES | Provider name metadata. |
| `PaperNameHeb` | VARCHAR | YES | Provider name metadata. |
| `ExchangeName` | VARCHAR | YES | Provider exchange-name metadata. |
| `raw_source` | JSON | NO | Full preserved universe/source record. |

### 5.4 `cycles`

| Column | Type | Null |
|---|---|---|
| `cycle_id` | BIGINT | NO |
| `session_id` | VARCHAR | NO |
| `universe_revision` | BIGINT | YES |
| `status` | VARCHAR | NO |
| `started_at_ms` | BIGINT | NO |
| `completed_at_ms` | BIGINT | NO |
| `committed_at_ms` | BIGINT | NO |
| `duration_ms` | BIGINT | NO |
| `requested` | BIGINT | YES |
| `received` | BIGINT | YES |
| `unique_count` | BIGINT | YES |
| `missing` | BIGINT | YES |
| `duplicates` | BIGINT | YES |
| `unexpected` | BIGINT | YES |
| `chunk_count` | INTEGER | YES |
| `chunks_json` | JSON | YES |
| `failure_phase` | VARCHAR | YES |
| `error_json` | JSON | YES |

A successful complete U.S. cycle has one source segment and exact count integrity; failed/incomplete provider work never replaces `latest` or appends authoritative history.

### 5.5 `history` and `latest`

Both tables have the same columns. `history` is append-only successful authority with primary key `(cycle_id, security_id)`. `latest` has primary key `security_id` and is fully replaced in the same successful-cycle transaction.

| Column | Type | Null |
|---|---|---|
| `cycle_id` | BIGINT | NO |
| `session_id` | VARCHAR | NO |
| `universe_revision` | BIGINT | NO |
| `security_id` | VARCHAR | NO |
| `chunk_index` | INTEGER | NO |
| `cycle_started_at_ms` | BIGINT | NO |
| `chunk_received_at_ms` | BIGINT | NO |
| `collected_at_ms` | BIGINT | NO |
| `source_metadata_json` | JSON | YES |
| `Symbol` | VARCHAR | YES |
| `PaperNameEng` | VARCHAR | YES |
| `PaperNameHeb` | VARCHAR | YES |
| `ExchangeName` | VARCHAR | YES |
| `TradeDateTime` | VARCHAR | YES |
| `CountryName` | VARCHAR | YES |
| `CountryNameEng` | VARCHAR | YES |
| `Price` | DOUBLE | YES |
| `ChangePercent` | DOUBLE | YES |
| `DailyHigh` | DOUBLE | YES |
| `DailyLow` | DOUBLE | YES |
| `YearHigh` | DOUBLE | YES |
| `YearLow` | DOUBLE | YES |
| `DailyVolume` | DOUBLE | YES |
| `BeginYearChangePercent` | DOUBLE | YES |
| `Month12ChangePercent` | DOUBLE | YES |
| `Month36ChangePercent` | DOUBLE | YES |
| `AskRate` | DOUBLE | YES |
| `BidRate` | DOUBLE | YES |
| `YesterdayRate` | DOUBLE | YES |
| `PaperMarketCap` | DOUBLE | YES |
| `PaperIdYatab` | DOUBLE | YES |
| `CountryId` | DOUBLE | YES |
| `PaperType` | DOUBLE | YES |
| `ESGRatingId` | DOUBLE | YES |
| `ESGScope` | DOUBLE | YES |
| `raw_data` | JSON | NO |

### 5.6 `scanner_saved_queries`

| Column | Type | Null | Meaning |
|---|---|---|---|
| `query_id` | VARCHAR | NO | Opaque user query ID. |
| `name` | VARCHAR | NO | User-visible name. |
| `name_key` | VARCHAR | NO | Normalized unique collision key. |
| `sql_text` | VARCHAR | NO | Saved draft SQL text. |
| `interval_ms` | BIGINT | NO | Positive repeat interval. |
| `created_at_ms` | BIGINT | NO | Local creation time. |
| `updated_at_ms` | BIGINT | NO | Local update time. |

Built-ins are source-defined and are not persisted as rows in `scanner_saved_queries`.

---

## 6. Market Flow US built-in queries

The U.S. target profile currently contains three immutable, copyable built-ins. Each uses a 5-second default interval and each is bounded.

### 6.1 All current fields

```text
queryId: builtin:all-current-fields
name: All current fields
intervalMs: 5000
```

<!-- scanner-us-executable:builtin-all-current-fields -->
```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

### 6.2 U.S. market ranking example

```text
queryId: builtin:market-ranking-example
name: U.S. market ranking example
intervalMs: 5000
```

<!-- scanner-us-executable:builtin-market-ranking-example -->
```sql
SELECT
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
LIMIT 20;
```

This demonstrates canonical Detail navigation plus deterministic U.S.-field ranking. It is an example, not a trading recommendation.

### 6.3 Staged candidate ranking

```text
queryId: builtin:staged-candidate-ranking
name: Staged candidate ranking
intervalMs: 5000
```

For each current security the query finds the latest historical row at or before 10s, 20s, 30s, 45s, 60s, 90s and 120s before the current `collected_at_ms`.

At every stage the initial example asks only:

```text
current Price > prior Price
```

Credit is contiguous. If a stage fails or the required historical row/price is unavailable, later stages cannot restore credit.

The final order is:

```text
stage_reached DESC
ChangePercent DESC NULLS LAST
DailyVolume DESC NULLS LAST
securityId ASC
```

<!-- scanner-us-executable:builtin-staged-candidate-ranking -->
```sql
SELECT
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
LIMIT 100;
```

The durations and predicate are editable SQL text, not product infrastructure. Changing them does not require schema changes.

---

## 7. Additional U.S. examples

### Count persisted samples per security

<!-- scanner-us-executable:history-sample-counts -->
```sql
SELECT
  security_id AS securityId,
  COUNT(*) AS samples,
  MAX(Price) AS max_observed_price
FROM history
GROUP BY security_id
HAVING COUNT(*) >= 10
ORDER BY samples DESC,
         security_id ASC
LIMIT 50;
```

### Rank current rows by ChangePercent

<!-- scanner-us-executable:current-rank -->
```sql
SELECT
  security_id AS securityId,
  Symbol,
  ChangePercent,
  RANK() OVER (
    ORDER BY ChangePercent DESC NULLS LAST
  ) AS change_rank
FROM latest
ORDER BY change_rank,
         security_id
LIMIT 50;
```

### Inspect saved user-query configuration

<!-- scanner-us-executable:saved-query-config -->
```sql
SELECT
  query_id,
  name,
  interval_ms,
  created_at_ms,
  updated_at_ms
FROM scanner_saved_queries
ORDER BY name_key,
         query_id
LIMIT 100;
```

Use product CRUD controls/protocol to mutate saved queries. Scanner SQL remains read-only.

---

## 8. Common mistakes to avoid

- Do not join by `Symbol` or name when canonical `security_id` is available.
- Do not reconstruct Current from `universe.is_current`; Current authority is `latest` from the last committed complete cycle.
- Do not collapse `NULL` into zero unless that is explicitly the intended analysis.
- Do not assume a provider field name proves units, venue coverage, timestamp semantics or market freshness.
- Do not send multiple SQL statements.
- Do not mutate market/config tables through Scanner.
- Do not turn the staged example into a hidden application ranking engine; strategy remains editable SQL.

---

## 9. Prompt template for an AI assistant

```text
I am writing one Market Flow US Scanner query.

Use only docs/SCANNER_SQL_GUIDE.md and the durable Market Flow US contracts.

Requirements:
- Return exactly one read-only SELECT statement.
- Do not use DML/DDL, multiple statements, parameters, query(...), query_table(...), or side-effecting functions.
- Use security_id as canonical identity.
- If result rows should open Security Detail, return security_id AS securityId.
- Preserve NULL semantics deliberately.
- Add deterministic ORDER BY when ranking/order matters.
- Bound potentially large results unless I explicitly request an unbounded analytical result.
- Prefer latest for current committed rows and history for time-series/prior-cycle analysis.
- Do not invent undocumented provider semantics or trading guarantees.

My goal:
<describe the analysis>

Optional constraints:
<security IDs, time range, top N, fields, grouping, interval, etc.>
```

---

## 10. Saved Query Library behavior relevant to SQL authors

A saved query stores name, SQL and a positive repeat interval.

Selecting a saved query or built-in loads **Draft** only. It does not Activate automatically.

Editing Draft does not replace either persisted saved-query state or an already-active Scanner generation. Save/Update changes persistence; Activate changes the active generation.

Built-ins are read-only and non-deletable but may be copied into a user query.

Invalid/incomplete SQL may still be saved; execution errors appear only at Activate/execute time.

---

## 11. Maintenance contract

This guide is part of the executable Scanner contract.

A change to any of these requires guide review in the same work unit:

- public Scanner tables/columns/types;
- canonical identity/join semantics;
- typed/raw projection rules;
- Scanner admission restrictions;
- U.S. built-in query ID/name/SQL/interval;
- saved-query fields/semantics;
- `securityId` navigation alias rules.

Fast verification mechanically compares a fresh schema-v3 `information_schema.columns` inventory with the v3 manifest below and compares the U.S. source-defined built-ins with the documented built-in manifest/SQL.

---

## 12. Authority note

For conflicts:

1. `docs/DATA_CONTRACT.md` owns provider identity/raw-value facts.
2. `docs/TECHNICAL_SPEC.md` owns database/protocol/admission contracts.
3. This guide owns the user/AI Scanner-authoring presentation of those facts.

Do not silently change this guide to disagree with an owning durable contract.

---

## Appendix A. Market Flow US drift-check manifest

```text
SCANNER_US_SCHEMA_MANIFEST_V3
schema_info: schema_version,created_at_ms,product_version
sessions: session_id,producer_instance_id,status,started_at_ms,stopped_at_ms,stop_reason,last_heartbeat_at_ms,completed_cycles,failed_cycles,last_completed_cycle_id,last_completed_at_ms,config_json,last_error_json
universe: security_id,is_current,universe_revision,first_seen_at_ms,last_seen_at_ms,Symbol,PaperNameEng,PaperNameHeb,ExchangeName,raw_source
cycles: cycle_id,session_id,universe_revision,status,started_at_ms,completed_at_ms,committed_at_ms,duration_ms,requested,received,unique_count,missing,duplicates,unexpected,chunk_count,chunks_json,failure_phase,error_json
history: cycle_id,session_id,universe_revision,security_id,chunk_index,cycle_started_at_ms,chunk_received_at_ms,collected_at_ms,source_metadata_json,Symbol,PaperNameEng,PaperNameHeb,ExchangeName,TradeDateTime,CountryName,CountryNameEng,Price,ChangePercent,DailyHigh,DailyLow,YearHigh,YearLow,DailyVolume,BeginYearChangePercent,Month12ChangePercent,Month36ChangePercent,AskRate,BidRate,YesterdayRate,PaperMarketCap,PaperIdYatab,CountryId,PaperType,ESGRatingId,ESGScope,raw_data
latest: cycle_id,session_id,universe_revision,security_id,chunk_index,cycle_started_at_ms,chunk_received_at_ms,collected_at_ms,source_metadata_json,Symbol,PaperNameEng,PaperNameHeb,ExchangeName,TradeDateTime,CountryName,CountryNameEng,Price,ChangePercent,DailyHigh,DailyLow,YearHigh,YearLow,DailyVolume,BeginYearChangePercent,Month12ChangePercent,Month36ChangePercent,AskRate,BidRate,YesterdayRate,PaperMarketCap,PaperIdYatab,CountryId,PaperType,ESGRatingId,ESGScope,raw_data
scanner_saved_queries: query_id,name,name_key,sql_text,interval_ms,created_at_ms,updated_at_ms
END_SCANNER_US_SCHEMA_MANIFEST_V3
```

```text
SCANNER_US_SCHEMA_TYPES_V3
schema_info.schema_version|INTEGER|NO
schema_info.created_at_ms|BIGINT|NO
schema_info.product_version|VARCHAR|NO
sessions.session_id|VARCHAR|NO
sessions.producer_instance_id|VARCHAR|NO
sessions.status|VARCHAR|NO
sessions.started_at_ms|BIGINT|NO
sessions.stopped_at_ms|BIGINT|YES
sessions.stop_reason|VARCHAR|YES
sessions.last_heartbeat_at_ms|BIGINT|NO
sessions.completed_cycles|BIGINT|NO
sessions.failed_cycles|BIGINT|NO
sessions.last_completed_cycle_id|BIGINT|YES
sessions.last_completed_at_ms|BIGINT|YES
sessions.config_json|JSON|NO
sessions.last_error_json|JSON|YES
universe.security_id|VARCHAR|NO
universe.is_current|BOOLEAN|NO
universe.universe_revision|BIGINT|NO
universe.first_seen_at_ms|BIGINT|NO
universe.last_seen_at_ms|BIGINT|NO
universe.Symbol|VARCHAR|YES
universe.PaperNameEng|VARCHAR|YES
universe.PaperNameHeb|VARCHAR|YES
universe.ExchangeName|VARCHAR|YES
universe.raw_source|JSON|NO
cycles.cycle_id|BIGINT|NO
cycles.session_id|VARCHAR|NO
cycles.universe_revision|BIGINT|YES
cycles.status|VARCHAR|NO
cycles.started_at_ms|BIGINT|NO
cycles.completed_at_ms|BIGINT|NO
cycles.committed_at_ms|BIGINT|NO
cycles.duration_ms|BIGINT|NO
cycles.requested|BIGINT|YES
cycles.received|BIGINT|YES
cycles.unique_count|BIGINT|YES
cycles.missing|BIGINT|YES
cycles.duplicates|BIGINT|YES
cycles.unexpected|BIGINT|YES
cycles.chunk_count|INTEGER|YES
cycles.chunks_json|JSON|YES
cycles.failure_phase|VARCHAR|YES
cycles.error_json|JSON|YES
history.cycle_id|BIGINT|NO
history.session_id|VARCHAR|NO
history.universe_revision|BIGINT|NO
history.security_id|VARCHAR|NO
history.chunk_index|INTEGER|NO
history.cycle_started_at_ms|BIGINT|NO
history.chunk_received_at_ms|BIGINT|NO
history.collected_at_ms|BIGINT|NO
history.source_metadata_json|JSON|YES
history.Symbol|VARCHAR|YES
history.PaperNameEng|VARCHAR|YES
history.PaperNameHeb|VARCHAR|YES
history.ExchangeName|VARCHAR|YES
history.TradeDateTime|VARCHAR|YES
history.CountryName|VARCHAR|YES
history.CountryNameEng|VARCHAR|YES
history.Price|DOUBLE|YES
history.ChangePercent|DOUBLE|YES
history.DailyHigh|DOUBLE|YES
history.DailyLow|DOUBLE|YES
history.YearHigh|DOUBLE|YES
history.YearLow|DOUBLE|YES
history.DailyVolume|DOUBLE|YES
history.BeginYearChangePercent|DOUBLE|YES
history.Month12ChangePercent|DOUBLE|YES
history.Month36ChangePercent|DOUBLE|YES
history.AskRate|DOUBLE|YES
history.BidRate|DOUBLE|YES
history.YesterdayRate|DOUBLE|YES
history.PaperMarketCap|DOUBLE|YES
history.PaperIdYatab|DOUBLE|YES
history.CountryId|DOUBLE|YES
history.PaperType|DOUBLE|YES
history.ESGRatingId|DOUBLE|YES
history.ESGScope|DOUBLE|YES
history.raw_data|JSON|NO
latest.cycle_id|BIGINT|NO
latest.session_id|VARCHAR|NO
latest.universe_revision|BIGINT|NO
latest.security_id|VARCHAR|NO
latest.chunk_index|INTEGER|NO
latest.cycle_started_at_ms|BIGINT|NO
latest.chunk_received_at_ms|BIGINT|NO
latest.collected_at_ms|BIGINT|NO
latest.source_metadata_json|JSON|YES
latest.Symbol|VARCHAR|YES
latest.PaperNameEng|VARCHAR|YES
latest.PaperNameHeb|VARCHAR|YES
latest.ExchangeName|VARCHAR|YES
latest.TradeDateTime|VARCHAR|YES
latest.CountryName|VARCHAR|YES
latest.CountryNameEng|VARCHAR|YES
latest.Price|DOUBLE|YES
latest.ChangePercent|DOUBLE|YES
latest.DailyHigh|DOUBLE|YES
latest.DailyLow|DOUBLE|YES
latest.YearHigh|DOUBLE|YES
latest.YearLow|DOUBLE|YES
latest.DailyVolume|DOUBLE|YES
latest.BeginYearChangePercent|DOUBLE|YES
latest.Month12ChangePercent|DOUBLE|YES
latest.Month36ChangePercent|DOUBLE|YES
latest.AskRate|DOUBLE|YES
latest.BidRate|DOUBLE|YES
latest.YesterdayRate|DOUBLE|YES
latest.PaperMarketCap|DOUBLE|YES
latest.PaperIdYatab|DOUBLE|YES
latest.CountryId|DOUBLE|YES
latest.PaperType|DOUBLE|YES
latest.ESGRatingId|DOUBLE|YES
latest.ESGScope|DOUBLE|YES
latest.raw_data|JSON|NO
scanner_saved_queries.query_id|VARCHAR|NO
scanner_saved_queries.name|VARCHAR|NO
scanner_saved_queries.name_key|VARCHAR|NO
scanner_saved_queries.sql_text|VARCHAR|NO
scanner_saved_queries.interval_ms|BIGINT|NO
scanner_saved_queries.created_at_ms|BIGINT|NO
scanner_saved_queries.updated_at_ms|BIGINT|NO
END_SCANNER_US_SCHEMA_TYPES_V3
```

```text
SCANNER_US_BUILTIN_MANIFEST_V1
builtin:all-current-fields|All current fields|5000
builtin:market-ranking-example|U.S. market ranking example|5000
builtin:staged-candidate-ranking|Staged candidate ranking|5000
END_SCANNER_US_BUILTIN_MANIFEST_V1
```

---

## Appendix B. Temporary pre-cutover MarketScope regression contract

This appendix exists only because normal runtime composition remains on the imported schema-v2 profile until TREE node `5.2`. It is **not** the Market Flow US authoring schema. Its markers keep the inherited regression suite green while Chat 4 proves the U.S. target profile separately.

Legacy regression anchor retained for the inherited suite: `## 5. Public Scanner schema — schema v2`.

### Legacy executable examples

<!-- scanner-executable:latest-with-universe -->
```sql
SELECT
  l.security_id AS securityId,
  u.paper_name,
  l.LastKnownRate,
  l.BaseRateChangePercentage
FROM latest AS l
LEFT JOIN universe AS u
  ON u.security_id = l.security_id
ORDER BY l.security_id
LIMIT 100;
```

<!-- scanner-executable:history-with-universe -->
```sql
SELECT
  h.security_id AS securityId,
  u.paper_name,
  h.collected_at_ms,
  h.LastKnownRate
FROM history AS h
LEFT JOIN universe AS u
  ON u.security_id = h.security_id
WHERE h.security_id = '1001'
ORDER BY h.collected_at_ms DESC, h.cycle_id DESC
LIMIT 100;
```

<!-- scanner-executable:builtin-all-current-fields -->
```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

<!-- scanner-executable:builtin-market-ranking-example -->
```sql
SELECT
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
LIMIT 20;
```

<!-- scanner-executable:current-with-names -->
```sql
SELECT
  l.security_id AS securityId,
  u.paper_name,
  l.LastKnownRate,
  l.DailyDealsQuantity
FROM latest AS l
LEFT JOIN universe AS u
  ON u.security_id = l.security_id
ORDER BY u.paper_name ASC NULLS LAST,
         l.security_id ASC
LIMIT 100;
```

<!-- scanner-executable:recent-history -->
```sql
SELECT
  security_id AS securityId,
  cycle_id,
  collected_at_ms,
  LastKnownRate,
  BuyLimit1,
  SellLimit1
FROM history
WHERE security_id = '1001'
ORDER BY collected_at_ms DESC, cycle_id DESC
LIMIT 100;
```

<!-- scanner-executable:history-sample-counts -->
```sql
SELECT
  security_id AS securityId,
  COUNT(*) AS samples,
  MAX(LastKnownRate) AS max_observed_rate
FROM history
GROUP BY security_id
HAVING COUNT(*) >= 10
ORDER BY samples DESC,
         security_id ASC
LIMIT 50;
```

<!-- scanner-executable:current-rank -->
```sql
SELECT
  security_id AS securityId,
  BaseRateChangePercentage,
  RANK() OVER (
    ORDER BY BaseRateChangePercentage DESC NULLS LAST
  ) AS change_rank
FROM latest
ORDER BY change_rank,
         security_id
LIMIT 50;
```

<!-- scanner-executable:saved-query-config -->
```sql
SELECT
  query_id,
  name,
  interval_ms,
  created_at_ms,
  updated_at_ms
FROM scanner_saved_queries
ORDER BY name_key,
         query_id
LIMIT 100;
```

```text
SCANNER_SCHEMA_MANIFEST_V2
schema_info: schema_version,created_at_ms,product_version
sessions: session_id,producer_instance_id,status,started_at_ms,stopped_at_ms,stop_reason,last_heartbeat_at_ms,completed_cycles,failed_cycles,last_completed_cycle_id,last_completed_at_ms,config_json,last_error_json
universe: security_id,is_current,universe_revision,first_seen_at_ms,last_seen_at_ms,paper_name,map_heat_date_change_json,raw_map_heat
cycles: cycle_id,session_id,universe_revision,status,started_at_ms,completed_at_ms,committed_at_ms,duration_ms,requested,received,unique_count,missing,duplicates,unexpected,chunk_count,chunks_json,failure_phase,error_json
history: cycle_id,session_id,universe_revision,security_id,chunk_index,cycle_started_at_ms,chunk_received_at_ms,collected_at_ms,server_as_of_date_json,LastKnownRate,BaseRateChangePercentage,BuyLimit1,BuyVolume1,SellLimit1,SellVolume1,DailyDealsQuantity,LastDealVolume,DailyTurnover,DailyNISRevenue,DailyLowestRate,DailyHighestRate,LastDealTimeOnly,raw_data
latest: cycle_id,session_id,universe_revision,security_id,chunk_index,cycle_started_at_ms,chunk_received_at_ms,collected_at_ms,server_as_of_date_json,LastKnownRate,BaseRateChangePercentage,BuyLimit1,BuyVolume1,SellLimit1,SellVolume1,DailyDealsQuantity,LastDealVolume,DailyTurnover,DailyNISRevenue,DailyLowestRate,DailyHighestRate,LastDealTimeOnly,raw_data
scanner_saved_queries: query_id,name,name_key,sql_text,interval_ms,created_at_ms,updated_at_ms
END_SCANNER_SCHEMA_MANIFEST_V2
```

```text
SCANNER_SCHEMA_TYPES_V2
schema_info.schema_version|INTEGER|NO
schema_info.created_at_ms|BIGINT|NO
schema_info.product_version|VARCHAR|NO
sessions.session_id|VARCHAR|NO
sessions.producer_instance_id|VARCHAR|NO
sessions.status|VARCHAR|NO
sessions.started_at_ms|BIGINT|NO
sessions.stopped_at_ms|BIGINT|YES
sessions.stop_reason|VARCHAR|YES
sessions.last_heartbeat_at_ms|BIGINT|NO
sessions.completed_cycles|BIGINT|NO
sessions.failed_cycles|BIGINT|NO
sessions.last_completed_cycle_id|BIGINT|YES
sessions.last_completed_at_ms|BIGINT|YES
sessions.config_json|JSON|NO
sessions.last_error_json|JSON|YES
universe.security_id|VARCHAR|NO
universe.is_current|BOOLEAN|NO
universe.universe_revision|BIGINT|NO
universe.first_seen_at_ms|BIGINT|NO
universe.last_seen_at_ms|BIGINT|NO
universe.paper_name|VARCHAR|YES
universe.map_heat_date_change_json|JSON|YES
universe.raw_map_heat|JSON|NO
cycles.cycle_id|BIGINT|NO
cycles.session_id|VARCHAR|NO
cycles.universe_revision|BIGINT|YES
cycles.status|VARCHAR|NO
cycles.started_at_ms|BIGINT|NO
cycles.completed_at_ms|BIGINT|NO
cycles.committed_at_ms|BIGINT|NO
cycles.duration_ms|BIGINT|NO
cycles.requested|BIGINT|YES
cycles.received|BIGINT|YES
cycles.unique_count|BIGINT|YES
cycles.missing|BIGINT|YES
cycles.duplicates|BIGINT|YES
cycles.unexpected|BIGINT|YES
cycles.chunk_count|INTEGER|YES
cycles.chunks_json|JSON|YES
cycles.failure_phase|VARCHAR|YES
cycles.error_json|JSON|YES
history.cycle_id|BIGINT|NO
history.session_id|VARCHAR|NO
history.universe_revision|BIGINT|NO
history.security_id|VARCHAR|NO
history.chunk_index|INTEGER|NO
history.cycle_started_at_ms|BIGINT|NO
history.chunk_received_at_ms|BIGINT|NO
history.collected_at_ms|BIGINT|NO
history.server_as_of_date_json|JSON|YES
history.LastKnownRate|DOUBLE|YES
history.BaseRateChangePercentage|DOUBLE|YES
history.BuyLimit1|DOUBLE|YES
history.BuyVolume1|DOUBLE|YES
history.SellLimit1|DOUBLE|YES
history.SellVolume1|DOUBLE|YES
history.DailyDealsQuantity|DOUBLE|YES
history.LastDealVolume|DOUBLE|YES
history.DailyTurnover|DOUBLE|YES
history.DailyNISRevenue|DOUBLE|YES
history.DailyLowestRate|DOUBLE|YES
history.DailyHighestRate|DOUBLE|YES
history.LastDealTimeOnly|VARCHAR|YES
history.raw_data|JSON|NO
latest.cycle_id|BIGINT|NO
latest.session_id|VARCHAR|NO
latest.universe_revision|BIGINT|NO
latest.security_id|VARCHAR|NO
latest.chunk_index|INTEGER|NO
latest.cycle_started_at_ms|BIGINT|NO
latest.chunk_received_at_ms|BIGINT|NO
latest.collected_at_ms|BIGINT|NO
latest.server_as_of_date_json|JSON|YES
latest.LastKnownRate|DOUBLE|YES
latest.BaseRateChangePercentage|DOUBLE|YES
latest.BuyLimit1|DOUBLE|YES
latest.BuyVolume1|DOUBLE|YES
latest.SellLimit1|DOUBLE|YES
latest.SellVolume1|DOUBLE|YES
latest.DailyDealsQuantity|DOUBLE|YES
latest.LastDealVolume|DOUBLE|YES
latest.DailyTurnover|DOUBLE|YES
latest.DailyNISRevenue|DOUBLE|YES
latest.DailyLowestRate|DOUBLE|YES
latest.DailyHighestRate|DOUBLE|YES
latest.LastDealTimeOnly|VARCHAR|YES
latest.raw_data|JSON|NO
scanner_saved_queries.query_id|VARCHAR|NO
scanner_saved_queries.name|VARCHAR|NO
scanner_saved_queries.name_key|VARCHAR|NO
scanner_saved_queries.sql_text|VARCHAR|NO
scanner_saved_queries.interval_ms|BIGINT|NO
scanner_saved_queries.created_at_ms|BIGINT|NO
scanner_saved_queries.updated_at_ms|BIGINT|NO
END_SCANNER_SCHEMA_TYPES_V2
```

```text
SCANNER_BUILTIN_MANIFEST_V1
builtin:all-current-fields|All current fields|5000
builtin:market-ranking-example|Market ranking example|5000
END_SCANNER_BUILTIN_MANIFEST_V1
```
