# MarketScope Scanner SQL Guide

## Purpose

This is the canonical authoring guide for MarketScope Scanner SQL.

Use it when:

- writing a new Scanner query manually;
- asking an AI assistant to create or modify a Scanner query;
- checking which tables/columns are safe and supported;
- deciding how to join Current, history, universe metadata and saved-query configuration.

The guide describes **schema v2** and must stay synchronized with:

- `docs/TECHNICAL_SPEC.md`;
- the real fresh DuckDB schema;
- the built-in Scanner query definitions;
- the Scanner admission tests.

If those sources change, this guide and the corresponding drift proof must change in the same work unit.

---

## 1. Scanner rules in one page

Scanner is a trusted local **read-only analytical SQL** surface.

Use one `SELECT` statement only.

Supported analytical constructs include:

- `SELECT`;
- `JOIN`;
- `WHERE`;
- `GROUP BY`;
- `HAVING`;
- `ORDER BY`;
- `LIMIT`;
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
- functions currently marked by DuckDB as having side effects.

Scanner also runs on a hardened DuckDB instance with external access/extensions/secrets/config mutation restricted by the Technical Spec.

Saving SQL in the Saved Query Library does **not** validate or execute it. SQL is admitted only when the user explicitly activates/executes it.

---

## 2. Practical authoring rules

Prefer queries that are deliberately bounded.

For exploratory Current queries:

```sql
... 
FROM latest
...
LIMIT 100;
```

For history:

- filter by `security_id` when looking at one security;
- constrain `collected_at_ms` or otherwise bound the history range when practical;
- add `LIMIT` when only a sample/top-N is needed.

Do not assume row order unless your SQL contains an explicit `ORDER BY`.

The Scanner UI does not add hidden sorting, filtering, ranking or limits.

If a result should support navigation to the normal Security Detail / History screen, return the canonical ID with this result-column name:

```sql
security_id AS securityId
```

Do not use array position or paper name as identity.

---

## 3. Canonical identity and joins

The canonical market identity is a string `security_id`.

Provider identity mapping is:

```text
MapHeat2.PaperId
→ String(...)
→ universe.security_id

GetSecuritiesData.Key
→ String(...)
→ history/latest.security_id
```

Common joins:

### Latest market row + universe metadata

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

Use `LEFT JOIN`, not an inner join, when the market row should survive missing universe metadata.

### History + universe metadata

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

Do not filter `latest` by `universe.is_current` to reconstruct Current. Product Current authority comes from the latest committed complete cycle.

---

## 4. Time and value semantics

### Local time fields

The following `*_at_ms` values are local runtime/database timing facts represented in milliseconds. They are **not exchange timestamps** unless a future contract explicitly says otherwise:

- `sessions.started_at_ms`;
- `sessions.stopped_at_ms`;
- `sessions.last_heartbeat_at_ms`;
- `sessions.last_completed_at_ms`;
- `universe.first_seen_at_ms`;
- `universe.last_seen_at_ms`;
- `cycles.started_at_ms`;
- `cycles.completed_at_ms`;
- `cycles.committed_at_ms`;
- `history.cycle_started_at_ms`;
- `history.chunk_received_at_ms`;
- `history.collected_at_ms`;
- the equivalent `latest` columns;
- saved-query `created_at_ms` / `updated_at_ms`.

### Provider values

Raw provider values preserve the distinction:

```text
0
!= null
!= ""
!= missing property
```

The typed market projections convert raw numeric values to `DOUBLE` where applicable.

If the raw property is null, missing, or has a non-matching type, the typed projection can be SQL `NULL`.

Therefore:

- do not replace `NULL` with zero unless the query explicitly intends that meaning;
- use `IS NULL` / `IS NOT NULL` deliberately;
- use `NULLS LAST` / `NULLS FIRST` when ordering nullable market fields where result placement matters.

Historical evidence confirms Level-1 bid/ask fields may be null.

### Known versus unknown market semantics

The fields below are persisted because they are useful provider facts, but their exact business semantics are **not independently frozen by MarketScope merely from their names**.

Treat them as provider-named observations unless another durable contract explicitly defines more:

- `LastKnownRate`;
- `BaseRateChangePercentage`;
- `BuyLimit1`;
- `BuyVolume1`;
- `SellLimit1`;
- `SellVolume1`;
- `DailyDealsQuantity`;
- `LastDealVolume`;
- `DailyTurnover`;
- `DailyNISRevenue`;
- `DailyLowestRate`;
- `DailyHighestRate`;
- `LastDealTimeOnly`.

An AI assistant must not invent undocumented interpretations, units, trading signals or financial guarantees for these fields.

---

## 5. Public Scanner schema — schema v2

Scanner can read these seven public tables:

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

Exactly one row.

| Column | Type | Meaning |
|---|---|---|
| `schema_version` | INTEGER NOT NULL | Current MarketScope DB schema version. Current contract: `2`. |
| `created_at_ms` | BIGINT NOT NULL | Local DB creation time in milliseconds. Preserved across v1→v2 migration. |
| `product_version` | VARCHAR NOT NULL | MarketScope product/service version associated with current schema state. |

### 5.2 `sessions`

One durable producer-session record.

| Column | Type | Meaning |
|---|---|---|
| `session_id` | VARCHAR PRIMARY KEY | Node-generated durable session identity. |
| `producer_instance_id` | VARCHAR NOT NULL | Local producer-instance identity. Operational metadata, not market identity. |
| `status` | VARCHAR NOT NULL | `running`, `stopped` or `interrupted`. |
| `started_at_ms` | BIGINT NOT NULL | Local session start time. |
| `stopped_at_ms` | BIGINT NULL | Local stop/interruption time when known. |
| `stop_reason` | VARCHAR NULL | Local stop/interruption reason. |
| `last_heartbeat_at_ms` | BIGINT NOT NULL | Most recent producer heartbeat time observed by Node. |
| `completed_cycles` | BIGINT NOT NULL | Count of successfully committed complete cycles for the session. |
| `failed_cycles` | BIGINT NOT NULL | Count of persisted failed-cycle reports for the session. |
| `last_completed_cycle_id` | BIGINT NULL | Most recent successfully committed Node cycle ID. |
| `last_completed_at_ms` | BIGINT NULL | Completion time associated with the most recent committed cycle. |
| `config_json` | JSON NOT NULL | Sanitized persisted recorder/session configuration. |
| `last_error_json` | JSON NULL | Sanitized most recent session error metadata when present. |

Do not treat session identifiers as security identifiers.

### 5.3 `universe`

Durable all-seen security catalog plus latest accepted universe membership.

| Column | Type | Meaning |
|---|---|---|
| `security_id` | VARCHAR PRIMARY KEY | Canonical security identity derived from provider `PaperId`. |
| `is_current` | BOOLEAN NOT NULL | Whether the security is in the latest accepted universe replacement. |
| `universe_revision` | BIGINT NOT NULL | Node-assigned revision of the accepted universe replacement. |
| `first_seen_at_ms` | BIGINT NOT NULL | First local time the security entered the durable catalog. |
| `last_seen_at_ms` | BIGINT NOT NULL | Most recent local time seen in accepted universe metadata. |
| `paper_name` | VARCHAR NULL | Provider-supplied display metadata, not identity. |
| `map_heat_date_change_json` | JSON NULL | Preserved provider metadata value; exact business semantics are not expanded beyond source evidence. |
| `raw_map_heat` | JSON NOT NULL | Full preserved logical MapHeat provider record. |

A security may remain in `universe` with `is_current = false` so historical-only Detail can retain metadata.

### 5.4 `cycles`

One persisted successful or failed cycle event.

| Column | Type | Meaning |
|---|---|---|
| `cycle_id` | BIGINT PRIMARY KEY | Node-assigned durable cycle identity. |
| `session_id` | VARCHAR NOT NULL | Owning producer session. |
| `universe_revision` | BIGINT NULL | Accepted universe revision associated with the cycle when available. |
| `status` | VARCHAR NOT NULL | `complete` or `failed`. |
| `started_at_ms` | BIGINT NOT NULL | Local cycle start time. |
| `completed_at_ms` | BIGINT NOT NULL | Local cycle completion/failure time. |
| `committed_at_ms` | BIGINT NOT NULL | Local durable persistence time. |
| `duration_ms` | BIGINT NOT NULL | Local cycle duration. |
| `requested` | BIGINT NULL | Requested security count when available. |
| `received` | BIGINT NULL | Received security count when available. |
| `unique_count` | BIGINT NULL | Unique security count when available. |
| `missing` | BIGINT NULL | Missing expected security count when available. |
| `duplicates` | BIGINT NULL | Duplicate security count when available. |
| `unexpected` | BIGINT NULL | Unexpected security count when available. |
| `chunk_count` | INTEGER NULL | Number of provider chunks represented by the cycle when available. |
| `chunks_json` | JSON NULL | Persisted chunk-summary metadata. |
| `failure_phase` | VARCHAR NULL | Failed-cycle phase, e.g. universe/chunk-fetch/cycle-validation where applicable. |
| `error_json` | JSON NULL | Sanitized failure information for failed cycles. |

For a successful complete cycle:

```text
requested == received == unique_count
missing == 0
duplicates == 0
unexpected == 0
```

Unavailable failed-cycle counters remain `NULL`; they are not fabricated as zero.

### 5.5 `history`

Append-only rows from successfully committed complete cycles.

Primary key:

```text
(cycle_id, security_id)
```

| Column | Type | Meaning |
|---|---|---|
| `cycle_id` | BIGINT NOT NULL | Owning committed cycle. |
| `session_id` | VARCHAR NOT NULL | Owning producer session. |
| `universe_revision` | BIGINT NOT NULL | Universe revision accepted for this cycle. |
| `security_id` | VARCHAR NOT NULL | Canonical security identity derived from provider `Key`. |
| `chunk_index` | INTEGER NOT NULL | Zero-based provider collection chunk index. |
| `cycle_started_at_ms` | BIGINT NOT NULL | Local Browser cycle start time. |
| `chunk_received_at_ms` | BIGINT NOT NULL | Local time the provider HTTP response object resolved for the row's chunk. |
| `collected_at_ms` | BIGINT NOT NULL | Local time JSON parsing completed for the row's chunk. |
| `server_as_of_date_json` | JSON NULL | Preserved provider `AsOfDate` value when present; exact semantics remain provider-defined. |
| `LastKnownRate` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `BaseRateChangePercentage` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `BuyLimit1` | DOUBLE NULL | Same-named Level-1 provider projection; may be null. |
| `BuyVolume1` | DOUBLE NULL | Same-named Level-1 provider projection; may be null. |
| `SellLimit1` | DOUBLE NULL | Same-named Level-1 provider projection; may be null. |
| `SellVolume1` | DOUBLE NULL | Same-named Level-1 provider projection; may be null. |
| `DailyDealsQuantity` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `LastDealVolume` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `DailyTurnover` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `DailyNISRevenue` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `DailyLowestRate` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `DailyHighestRate` | DOUBLE NULL | Same-named typed provider projection; exact business semantics Unknown beyond the provider field. |
| `LastDealTimeOnly` | VARCHAR NULL | Same-named provider string projection; do not assume timezone/date semantics not defined elsewhere. |
| `raw_data` | JSON NOT NULL | Full logical GetSecuritiesData Security object with raw value fidelity. |

History is the normal table for time-series and prior-cycle analysis.

### 5.6 `latest`

`latest` has the **same columns and types as `history`**.

Difference:

- primary key is `security_id`;
- it contains exactly one row per security from the latest successfully committed complete cycle;
- the table is replaced as a whole inside the successful-cycle transaction.

Use `latest` for Current-style analysis.

Use `history` for prior-cycle/time-series analysis.

### 5.7 `scanner_saved_queries`

Durable user configuration, not market authority.

| Column | Type | Meaning |
|---|---|---|
| `query_id` | VARCHAR PRIMARY KEY | Node-generated opaque ID in `user:<uuid>` form. |
| `name` | VARCHAR NOT NULL | Trimmed user-visible query name. |
| `name_key` | VARCHAR NOT NULL UNIQUE | Internal normalized collision key. |
| `sql_text` | VARCHAR NOT NULL | SQL text exactly saved as user-authored configuration. |
| `interval_ms` | BIGINT NOT NULL | Positive Scanner repeat interval in milliseconds. |
| `created_at_ms` | BIGINT NOT NULL | Local creation time. |
| `updated_at_ms` | BIGINT NOT NULL | Local last-update time. |

The table contains **user queries only**.

Built-ins are source-defined and do not appear as rows here.

Name collision normalization is:

```text
Unicode NFKC
→ trim
→ collapse internal whitespace
→ lowercase deterministically
```

Saved SQL can be syntactically invalid. Save is configuration CRUD; Activate is the execution/admission boundary.

---

## 6. Built-in Scanner queries

Initial built-ins use a 5-second interval.

### 6.1 All current fields

Definition:

```text
queryId: builtin:all-current-fields
name: All current fields
intervalMs: 5000
```

SQL:

<!-- scanner-executable:builtin-all-current-fields -->
```sql
SELECT *
FROM latest
ORDER BY security_id
LIMIT 100;
```

Purpose:

- discover the real latest-row field shape;
- keep exploration bounded;
- avoid inventing an analytical ranking.

### 6.2 Market ranking example

Definition:

```text
queryId: builtin:market-ranking-example
name: Market ranking example
intervalMs: 5000
```

SQL:

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

Purpose:

- demonstrate canonical Detail navigation via `securityId`;
- demonstrate a normal filter;
- demonstrate multi-column ranking and null placement;
- keep output bounded.

This is an SQL usage example, **not a trading strategy** and not a claim that any one provider field is sufficient for a decision.

---

## 7. Additional executable examples

### 7.1 Current rows with names

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

### 7.2 One security's recent persisted history

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

Replace `'1001'` with the desired canonical SecurityId.

### 7.3 Securities with enough persisted samples

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

`max_observed_rate` is only the maximum stored value of the provider field named `LastKnownRate`; do not attach undocumented market meaning to it.

### 7.4 Rank current rows by one provider field

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

### 7.5 Inspect saved user-query configuration

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

Use the product CRUD controls/protocol to mutate saved queries. Scanner SQL remains read-only.

---

## 8. Common mistakes to avoid

### Do not use paper name as identity

Wrong idea:

```sql
JOIN ... ON paper_name = ...
```

Use `security_id`.

### Do not assume `universe.is_current` means a row is in Current

Current comes from the last committed complete `latest` set.

### Do not collapse NULL into zero casually

This can change analytical meaning.

Prefer explicit SQL such as:

```sql
WHERE BuyLimit1 IS NOT NULL
```

or, only when intended:

```sql
COALESCE(BuyLimit1, 0)
```

### Do not assume provider timestamps/field names imply undocumented semantics

`LastDealTimeOnly`, `server_as_of_date_json` and named market projections remain provider-defined unless another durable contract states more.

### Do not send multiple statements

Wrong:

```sql
SELECT * FROM latest;
SELECT * FROM history;
```

Write one SELECT.

### Do not try to mutate through Scanner

Use product CRUD operations for saved queries. Market tables are owned by collection/persistence logic.

---

## 9. Prompt template for an AI assistant

Copy the block below together with this guide, or point the AI assistant to this file if it can read the repository.

```text
I am writing one MarketScope Scanner query.

Use only the schema and semantics documented in docs/SCANNER_SQL_GUIDE.md.

Requirements:
- Return exactly one read-only SELECT statement.
- Do not use INSERT/UPDATE/DELETE/DDL, multiple statements, parameters, query(...), query_table(...), or side-effecting functions.
- Use security_id as canonical identity.
- If I want result-row navigation to MarketScope Detail, return security_id AS securityId.
- Do not invent meanings, units, trading rules or financial interpretations for provider fields whose semantics are documented as Unknown.
- Preserve NULL semantics deliberately; do not silently treat NULL as zero.
- Add ORDER BY when deterministic/ranked order matters.
- Bound potentially large results with appropriate WHERE/time filters and/or LIMIT unless I explicitly ask for an unbounded analytical result.
- Prefer latest for current committed market rows and history for prior-cycle/time-series analysis.
- Explain briefly which documented fields/tables you used and flag any requested concept that cannot be derived safely from the documented schema.

My goal:
<describe the analysis I want>

Optional constraints:
<security IDs, time range, top N, fields, grouping, interval, etc.>
```

When the requested concept depends on undocumented provider semantics, the correct AI behavior is to say which semantics are missing and either:

- produce only the mechanically valid query that uses the named field without reinterpreting it; or
- ask for a verified business-definition update before claiming more.

---

## 10. Saved Query Library behavior relevant to SQL authors

A saved query stores:

- name;
- SQL;
- positive repeat interval.

Selecting a saved query or built-in loads it into the Scanner **Draft**.

It does not Activate automatically.

Editing a draft does not change:

- the persisted saved query until Save/Update;
- the active Scanner generation until Activate.

Built-ins:

- are read-only;
- cannot be deleted;
- may be copied with Save As/New;
- remain source-defined after a copy is made.

A saved query may contain invalid SQL so that incomplete work can still be preserved. The error appears only when that SQL is Activated/executed through normal Scanner admission.

---

## 11. Maintenance contract

This document is not best-effort prose. It is part of the executable Scanner contract.

A change to any of these requires this guide to be reviewed and updated in the same work unit:

- public Scanner tables;
- public Scanner columns/types;
- identity/join semantics;
- typed projection rules;
- Scanner admission restrictions;
- built-in query ID/name/SQL/interval;
- saved-query persistence fields;
- result navigation alias rules.

Fast verification must mechanically compare a fresh schema's public `information_schema.columns` inventory with the schema documented here.

Fast verification must also compare built-in source definitions with the built-in IDs/SQL/intervals documented here.

The implementation should use stable machine-readable markers or equivalent testable extraction so drift fails CI rather than relying on human memory.

---

## 12. Authority note

For conflicts:

1. `docs/DATA_CONTRACT.md` owns provider identity/raw-value facts.
2. `docs/TECHNICAL_SPEC.md` owns the actual database/protocol/admission contract.
3. This guide owns the user/AI Scanner authoring presentation of those facts.

Do not silently change this guide to disagree with the authoritative contracts. Change the owning contract first, then update this guide and its drift proof.


## Appendix A. Drift-check manifest

This compact manifest is intentionally redundant with the explanatory sections above. It exists so automated verification can compare current schema/built-ins to documentation without scraping prose.

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

The drift test must compare built-in SQL text separately as well as these ID/name/interval records.
