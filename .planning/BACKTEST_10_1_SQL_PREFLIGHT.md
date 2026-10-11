# Backtest 10.1 SQL Preflight — durable in-use guard

Scope: the first Backtest evidence opener must reject a source that still has durable active producer ownership without mutating or recovering that source.

Proposed read-only probe:

```sql
SELECT 1 AS in_use
FROM sessions
WHERE status = 'running'
LIMIT 1
```

1. **Purpose and contract** — return at most one witness that a source is durably marked in use. The query must not change session state or infer that an absent witness proves any external process state beyond the persisted authority marker.
2. **Schema/data-source validation** — schema v3/v4 validation runs first and both require `sessions`; `status` is the persisted session-status field already used by normal ownership/recovery code.
3. **Cardinality estimate** — input is the bounded active-day `sessions` table; output is zero or one row. Historical session count is tiny relative to market history and cannot multiply rows.
4. **Access-path inventory** — one table scan, zero joins, zero correlated subqueries, zero lateral lookups and one table visit.
5. **Predicate/selectivity review** — the only predicate is exact `status = 'running'`; no earlier safe filter exists and `LIMIT 1` stops after the first witness.
6. **Join and row-explosion review** — no joins and no row multiplication are possible.
7. **Sort/group/window review** — no `ORDER BY`, aggregate, grouping, window, distinct or materialization is required.
8. **Repeated-work elimination** — execute once per evidence open after structural validation; no polling/background repetition and no second ownership query is added.
9. **Boundedness and resource review** — result is one scalar witness at most, memory is constant, execution is read-only under the hardened DuckDB connection, and failure closes the evidence connection without source mutation.
10. **Architecture/schema/code alternative review** — relying on DuckDB/file locking was falsified by Fast CI because a same-process read-only open can coexist with the writer. Adding a new lock subsystem or mutating stale sessions would violate the Backtest contract. Reusing the existing durable `sessions.status` ownership fact is the smallest sufficient mechanism.

First execution is limited to the focused service fixture that keeps a real live DB owner with a `running` session, verifies Backtest rejects it, then proves the original writer remains usable. Broader Fast CI runs only after that focused contract is represented in committed tests.
