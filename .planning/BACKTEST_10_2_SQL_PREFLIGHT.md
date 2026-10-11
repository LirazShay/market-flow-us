# Backtest 10.2 SQL Preflight — truthful historical Scanner sandbox

Scope: resolve the exact successful committed cycle at-or-before requested historical time `T`, then materialize a detached in-memory DuckDB sandbox whose only strategy-authoritative relations are historical `history <= B` and `latest = history(B)`. The original Scanner SQL must execute unchanged through the existing Scanner admission authority. No Backtest source mutation, recovery, bootstrap, migration, repair, SQL predicate rewriting, or user-SQL access to the underlying evidence catalog is allowed.

This preflight covers every materially new SQL shape planned for task `10.2`. None of the SQL below may be executed before this document is committed.

## Proposed SQL shapes

### A. Resolve baseline cycle `B`

Executed only on the already validated, hardened, read-only evidence connection opened by task `10.1`:

```sql
SELECT cycle_id, committed_at_ms
FROM cycles
WHERE status = 'complete'
  AND committed_at_ms <= $requestedAtMs
ORDER BY committed_at_ms DESC, cycle_id DESC
LIMIT 1
```

`$requestedAtMs` is an internal safe-integer parameter supplied by Backtest code, not by Scanner/user SQL. Zero rows means the requested historical point is unavailable and sandbox preparation stops.

### B. Materialize bounded historical `history`

The implementation may use a temporary read-only attachment to the product-owned evidence file while preparing a fresh in-memory DuckDB instance. The source alias is implementation-owned and must be detached before any user SQL is admitted.

```sql
CREATE TABLE history AS
SELECT *
FROM evidence.main.history
WHERE cycle_id <= $baselineCycleId
```

### C. Materialize historical `latest`

```sql
CREATE TABLE latest AS
SELECT *
FROM evidence.main.history
WHERE cycle_id = $baselineCycleId
```

The implementation may use the equivalent DuckDB parameter-binding form supported by the Node API. It must not interpolate `T`, `B`, source paths, identifiers, or user-controlled strings into these statements.

### D. Detach the evidence catalog before Scanner construction

```sql
DETACH evidence
```

After detach, the sandbox connection is hardened and configuration-locked before `createScannerAuthority(...)` is constructed. User SQL therefore sees the isolated in-memory catalog, not the evidence DB.

## Static validation / optimization stages

1. **Purpose and contract** — A resolves the last successful committed cycle at-or-before `T`; B exposes all market history through `B`; C reconstructs `latest` exactly from cycle `B`; D removes the source catalog before user SQL. This directly implements PLAN 10.2 without changing Scanner query semantics.
2. **Authority-time validation** — baseline selection uses `committed_at_ms`, not provider time, collected time, cycle start, or cycle completion. This matches persistence authority, where a complete cycle becomes visible atomically only when committed.
3. **Status validation** — A requires `status = 'complete'`; failed or partial cycle metadata can never become `B` even if its timestamps precede `T`.
4. **Deterministic tie-break validation** — A sorts by `committed_at_ms DESC, cycle_id DESC`, so equal commit timestamps resolve deterministically to the later committed cycle identity exactly as PLAN 10.2 requires.
5. **Boundary validation** — A uses `committed_at_ms <= T`; B uses `cycle_id <= B`; C uses `cycle_id = B`. No later cycle can enter either strategy-authoritative sandbox table.
6. **Schema/data-source validation** — task 10.1 validates schema v3/v4 and required `cycles`/`history` structures before 10.2 runs. B/C copy the source `history` schema directly rather than reconstructing a lossy JS projection, preserving exact Scanner-visible column names/types.
7. **Cardinality estimate** — A returns 0..1 row. C returns exactly the securities committed in B. B returns the bounded active-day/archive history through B; it cannot exceed the source history row count and excludes every later row.
8. **Access-path inventory** — A visits `cycles` once and performs one bounded top-1 ordering over complete cycles at/before T. B and C each scan the read-only source `history` once during sandbox preparation. User queries never revisit the evidence source.
9. **Predicate/selectivity review** — A applies both authoritative predicates before top-1 selection. B/C apply cycle bounds while copying, not after user SQL. Moving these bounds into user queries would violate anti-lookahead because arbitrary Scanner SQL could omit or bypass them.
10. **Join / row-explosion review** — A/B/C contain zero joins, correlated subqueries, lateral joins, or fan-out operations. Materialization cannot multiply a source row.
11. **Sort/group/window review** — only A requires ordering, solely to identify one deterministic baseline. B/C require no sort, aggregate, distinct, group, or window operation; source row order is not relied upon because Scanner result order is defined by the original user query.
12. **Repeated-work elimination** — baseline resolution and sandbox materialization occur once per requested Backtest historical run/source selection. The sandbox is then reused for that run's Scanner execution rather than reattaching/re-copying for each SQL statement.
13. **Memory/resource boundedness** — the sandbox contains only two tables: history through B and one-cycle latest. No cycles/sessions/universe/saved-query/Demo Buy/order/Replay tables are copied. The source remains read-only and detached before user execution.
14. **Anti-lookahead/catalog bypass review** — source attachment is preparation-only. `DETACH evidence` must complete before Scanner authority creation. Focused canaries must prove direct `cycles`, `sessions`, `universe`, Demo Buy and source-qualified/catalog-qualified attempts fail, and that rows from cycles `> B` cannot be observed through `latest`, `history`, metadata functions, or a lingering source alias.
15. **Scanner-admission preservation review** — no new SQL parser or rewrite is introduced. The existing `createScannerAuthority` remains authoritative for one-statement SELECT-only, zero-parameter user SQL and forbidden/side-effect function rejection. Backtest only narrows the visible catalog.
16. **External-access review** — after preparation, apply the existing DuckDB hardening to the in-memory connection and lock configuration. Focused proof must show user SQL cannot re-attach/read external files or recreate a path to the evidence source.
17. **Mutation/ownership review** — A/B/C read the evidence source only; all CREATE operations target the disposable in-memory sandbox. No source transaction, UPDATE, DELETE, INSERT, COPY-to-source, migration, recovery, rename, delete, or process action exists.
18. **Failure/cleanup review** — no baseline produces an explicit unavailable result without a sandbox. Any attach/copy/detach/hardening failure closes the disposable sandbox and preserves the evidence connection/source unchanged. A source alias that cannot be detached must fail closed; user SQL must never run on that sandbox.
19. **Architecture alternative review** — rewriting user SQL with `WHERE cycle_id <= B`, exposing views over an attached source, or executing directly on the evidence DB are rejected because they leave bypass paths and alter/fork Scanner semantics. Copying exact bounded source tables into a detached in-memory DB is the smallest mechanism that enforces the historical world structurally.
20. **Index/optimization decision** — no new persistent source index or schema change is justified before measurement. Backtest preparation is offline and one-time per run; active-day/archive history is already bounded by product lifecycle. If focused workload evidence later shows materialization cost is unacceptable, optimization must preserve the same structural anti-lookahead boundary rather than weaken it.

## First-execution gate

Before any material SQL above is executed, focused committed tests must exist for:

- exact baseline selection before/between/equal/after commit timestamps, including equal-`committed_at_ms` tie-breaks;
- no-baseline explicit unavailable behavior;
- `latest` reconstructed from exactly B and `history` containing no cycle `> B`;
- original representative Scanner SQL over `latest` and `history` executing unchanged with preserved result order;
- direct and qualified attempts to reach `cycles`, `sessions`, `universe`, Demo Buy tables or the temporary source alias failing;
- future-row canaries proving a known cycle `> B` is unreachable;
- source immutability before/after sandbox preparation and Scanner execution;
- existing Scanner admission regressions remaining green.

Only after those tests are committed may the new SQL receive its first focused execution.