# A7 SQL Static Preflight — Durable Producer Singleton Guard

## Proposed query

```sql
SELECT COUNT(*) AS running_count
FROM sessions
WHERE status = 'running'
```

This query is new production SQL and therefore must pass the AGENTS 10+ stage static SQL preflight before first execution.

1. **Purpose and contract** — before inserting a new producer session, determine whether any durable `sessions` row is still `running`. If any exists, reject the new session with `PRODUCER_ALREADY_ACTIVE`. The query is read-only and must not mutate authority.
2. **Schema/data-source validation** — `sessions.status` is `VARCHAR NOT NULL` in schema v3. Production writes use the explicit states `running`, `stopped`, and `interrupted`; startup recovery converts stale persisted `running` rows to `interrupted` after a service restart.
3. **Cardinality estimate** — one row exists per producer session for the trading-day database. Expected cardinality is small; the query returns exactly one aggregate row regardless of table size.
4. **Access-path inventory** — one scan of `sessions`, no joins, no subqueries, no correlated work, no repeated table visits.
5. **Predicate/selectivity review** — the only predicate is the exact authority state needed by the contract: `status = 'running'`. No additional filter is safe because any durable running session must block a new producer.
6. **Join and row-explosion review** — no joins and no row multiplication are possible. `COUNT(*)` collapses all matches to one row.
7. **Sort/group/window review** — no `ORDER BY`, grouping key, window, distinct, or materialization is required. Aggregate cost is linear in session rows and bounded by the daily database lifecycle.
8. **Repeated-work elimination** — the check runs once per `producer.session.start`, not per heartbeat or cycle. Reusing Viewer status is insufficient because it inspects only the latest session and can miss an older orphaned `running` row after later sessions stop.
9. **Boundedness and resource review** — result cardinality is exactly one scalar row; no unbounded result memory. It executes inside the existing serialized writer task immediately before the INSERT, so no same-service writer task can interleave between durable check and insert.
10. **Architecture/schema/code alternative review** — an in-memory-only guard is the defect being fixed. A schema rewrite, new lock subsystem, or index is disproportionate for a small daily sessions table. The smallest sufficient fix is a durable authority check in the existing serialized persistence boundary.

## First execution rule

First execution must be the smallest deterministic real-DuckDB regression: create one running session, simulate loss of in-memory ownership while leaving that row `running`, then attempt a second start and prove `PRODUCER_ALREADY_ACTIVE` with no second session row inserted. After the original row is transitioned out of `running`, a new start must succeed.
