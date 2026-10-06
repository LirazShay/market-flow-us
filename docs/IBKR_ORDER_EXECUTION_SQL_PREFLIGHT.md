# IBKR Order Execution Store — SQL Static Preflight

Scope: TREE `8.1` standalone IBKR order-service local execution authority.

This preflight is completed before the new execution-store SQL is first executed. The store is intentionally separate from the market-analysis DuckDB and persists only the minimum local facts required for restart-safe idempotency/reconciliation.

## Proposed SQL surface

Schema:

```sql
CREATE TABLE IF NOT EXISTS execution_orders (
  request_id VARCHAR PRIMARY KEY,
  intent_fingerprint VARCHAR NOT NULL,
  local_order_id VARCHAR NOT NULL UNIQUE,
  lifecycle_state VARCHAR NOT NULL,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL
)
```

Idempotency lookup:

```sql
SELECT request_id,
       intent_fingerprint,
       local_order_id,
       lifecycle_state,
       created_at_ms,
       updated_at_ms
FROM execution_orders
WHERE request_id = $requestId
LIMIT 1
```

Insert of a newly accepted local dry-run execution fact:

```sql
INSERT INTO execution_orders (
  request_id,
  intent_fingerprint,
  local_order_id,
  lifecycle_state,
  created_at_ms,
  updated_at_ms
)
VALUES (
  $requestId,
  $intentFingerprint,
  $localOrderId,
  $lifecycleState,
  $createdAtMs,
  $updatedAtMs
)
```

No provider account identifier, credential, cookie, provider session token, caller token, raw provider response or raw authenticated dump is part of this schema.

## Static validation / optimization stages

### 1. Purpose and contract

The table must support exactly these observable TREE `8.1` properties:

- mandatory `requestId` can be looked up after process restart;
- same `requestId` plus the same normalized intent fingerprint reuses the existing `localOrderId` and lifecycle result;
- same `requestId` plus a different fingerprint is rejected;
- persisted data contains only bounded local execution facts needed for idempotency/reconciliation.

The SQL must not submit an order, infer risk, persist provider/private authentication state, or modify the market-analysis database.

### 2. Schema/data-source validation

`execution_orders` is a new table in a dedicated order-service DuckDB file.

- `request_id`: bounded application-validated string, max 128 characters; primary identity key.
- `intent_fingerprint`: application-generated SHA-256 hexadecimal string; non-null.
- `local_order_id`: application-generated bounded local identifier; unique and non-null.
- `lifecycle_state`: bounded application-owned enum-like value; TREE `8.1` writes `DRY_RUN_COMPLETE` only.
- `created_at_ms` / `updated_at_ms`: integer millisecond timestamps generated locally; non-null.

No nullable columns are required. No foreign keys or dependency on market tables exists.

### 3. Cardinality estimate

One row is stored per distinct accepted `requestId`.

Each create request performs at most one keyed lookup and, only for a new request, one insert. Same-key retries do not add rows. The intended local scale is tiny compared with market-snapshot storage: even tens of thousands of historical dry-run requests remain tens of thousands of narrow rows, with exactly one output row maximum for a `request_id` lookup.

Worst-case row growth is linear in distinct caller-generated request IDs, not in retries, symbols, snapshots or provider events.

### 4. Access-path inventory

Per create request:

- one equality lookup on the primary key `request_id`;
- zero joins;
- zero correlated subqueries;
- zero lateral lookups;
- zero repeated scans;
- one insert only for a genuinely new request.

The schema bootstrap is one idempotent `CREATE TABLE IF NOT EXISTS` statement.

### 5. Predicate/selectivity review

The only read predicate is `request_id = $requestId`, targeting the primary key. It is maximally selective and is applied directly in the query. `LIMIT 1` documents the expected bound even though primary-key uniqueness already guarantees at most one row.

No post-filtering is needed.

### 6. Join and row-explosion review

There are no joins and therefore no many-to-many or row-explosion path. The primary-key constraint guarantees one persisted row per `requestId`; the unique `local_order_id` constraint prevents accidental duplicate local identities.

### 7. Sort/group/window review

There is no `ORDER BY`, aggregation, `DISTINCT`, window function, grouping, deduplication, temporary materialization or result-set sort in the TREE `8.1` persistence path.

### 8. Repeated-work elimination

The store persists the fingerprint instead of the full normalized intent or provider preview. This is sufficient to compare retries and avoids repeated persistence/copying of order payloads or provider material.

The caller already computes the normalized intent fingerprint once for the mutation path; the store receives that value rather than recomputing it in SQL.

### 9. Boundedness and resource review

Each keyed read returns zero or one narrow row. Each accepted new request writes exactly one narrow row.

The service serializes create mutations in-process so the lookup-plus-insert decision cannot race within one service process. DuckDB primary/unique constraints provide a second integrity boundary.

No large transaction is required; each insert is a single bounded statement. A failed insert leaves no partial row. Restart durability is provided by the dedicated DuckDB file; caller authorization tokens remain memory-only and are not represented in SQL.

### 10. Architecture/schema/code alternative review

A separate order-service DuckDB is preferable to extending the market-analysis schema because the two authorities have different lifecycles, security boundaries and retention concerns. Reusing the market database would create unnecessary coupling.

A memory-only map is insufficient because TREE `8.1` explicitly requires restart-safe idempotency. A larger event-sourcing/lifecycle subsystem is unnecessary at this stage because later TREE `8.2` owns real provider lifecycle behavior.

The smallest sufficient mechanism is therefore one dedicated DuckDB file plus one table and a serialized application mutation path.

### 11. Security/privacy static review

The proposed columns were checked against the public-safe repository/security contract. None can contain credentials, cookies, browser/provider sessions, provider account identifiers, caller tokens or raw provider responses. The store API will accept only the already-normalized bounded request ID, SHA-256 fingerprint, generated local ID, fixed lifecycle state and timestamps.

### 12. Failure/restart review

A process crash before the insert leaves no accepted persisted result; a process crash after the insert leaves a complete row that can be reconciled by `requestId` after restart. Because TREE `8.1` never performs provider submit, there is no ambiguous provider side effect between lookup and persistence.

The first execution must use a temporary deterministic test database with one synthetic request, then same-key replay, different-intent collision, close/reopen and persisted-row inspection. Scale-up is unnecessary unless this smallest proof exposes a surprising runtime or query shape.
