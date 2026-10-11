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

### B. Attach the already validated product-owned evidence source for preparation only

DuckDB's `ATTACH` grammar does not accept a prepared-statement parameter in the database-path position. The first focused execution proved that `ATTACH $sourcePath ...` fails at parse time before binding. Therefore the path is the one narrow exception to ordinary parameter binding: it must come only from `resolveBacktestEvidenceSourcePath(...)` after task `10.1` has validated the selected product source, and it must pass through one deterministic SQL string-literal encoder that rejects NUL and doubles every single quote before interpolation.

Conceptual shape:

```sql
ATTACH '<encoded product-owned source path>' AS evidence (READ_ONLY, TYPE DUCKDB)
```

The alias and database type are fixed implementation constants. `T`, `B`, identifiers, Scanner SQL and source ids are never interpolated. Focused regression must prove a legitimate product data directory containing apostrophes and SQL-like punctuation attaches successfully without creating any injected object or extra statement.

### C. Materialize bounded historical `history`

```sql
CREATE TABLE history AS
SELECT *
FROM evidence.main.history
WHERE cycle_id <= $baselineCycleId
```

### D. Materialize historical `latest`

```sql
CREATE TABLE latest AS
SELECT *
FROM evidence.main.history
WHERE cycle_id = $baselineCycleId
```

`$baselineCycleId` is an internal safe-integer parameter resolved from A. No user-controlled value is interpolated into C/D.

### E. Detach the evidence catalog before Scanner construction

```sql
DETACH evidence
```

After detach, the sandbox connection is hardened and configuration-locked before `createScannerAuthority(...)` is constructed. User SQL therefore sees the isolated in-memory catalog, not the evidence DB.

## Static validation / optimization stages

1. **Purpose and contract** — A resolves the last successful committed cycle at-or-before `T`; B provides one preparation-only read-only evidence attachment; C exposes all market history through `B`; D reconstructs `latest` exactly from cycle `B`; E removes the source catalog before user SQL. This directly implements PLAN 10.2 without changing Scanner query semantics.
2. **Authority-time validation** — baseline selection uses `committed_at_ms`, not provider time, collected time, cycle start, or cycle completion. This matches persistence authority, where a complete cycle becomes visible atomically only when committed.
3. **Status validation** — A requires `status = 'complete'`; failed or partial cycle metadata can never become `B` even if its timestamps precede `T`.
4. **Deterministic tie-break validation** — A sorts by `committed_at_ms DESC, cycle_id DESC`, so equal commit timestamps resolve deterministically to the later committed cycle identity exactly as PLAN 10.2 requires.
5. **Boundary validation** — A uses `committed_at_ms <= T`; C uses `cycle_id <= B`; D uses `cycle_id = B`. No later cycle can enter either strategy-authoritative sandbox table.
6. **Schema/data-source validation** — task 10.1 validates schema v3/v4 and required `cycles`/`history` structures before 10.2 runs. C/D copy the source `history` schema directly rather than reconstructing a lossy JS projection, preserving exact Scanner-visible column names/types.
7. **Cardinality estimate** — A returns 0..1 row. D returns exactly the securities committed in B. C returns the bounded active-day/archive history through B; it cannot exceed the source history row count and excludes every later row.
8. **Access-path inventory** — A visits `cycles` once and performs one bounded top-1 ordering over complete cycles at/before T. C and D each scan the read-only source `history` once during sandbox preparation. User queries never revisit the evidence source.
9. **Predicate/selectivity review** — A applies both authoritative predicates before top-1 selection. C/D apply cycle bounds while copying, not after user SQL. Moving these bounds into user queries would violate anti-lookahead because arbitrary Scanner SQL could omit or bypass them.
10. **Join / row-explosion review** — A/C/D contain zero joins, correlated subqueries, lateral joins, or fan-out operations. Materialization cannot multiply a source row.
11. **Sort/group/window review** — only A requires ordering, solely to identify one deterministic baseline. C/D require no sort, aggregate, distinct, group, or window operation; source row order is not relied upon because Scanner result order is defined by the original user query.
12. **Repeated-work elimination** — baseline resolution and sandbox materialization occur once per requested Backtest historical run/source selection. The sandbox is then reused for that run's Scanner execution rather than reattaching/re-copying for each SQL statement.
13. **Memory/resource boundedness** — the sandbox contains only two tables: history through B and one-cycle latest. No cycles/sessions/universe/saved-query/Demo Buy/order/Replay tables are copied. The source remains read-only and detached before user execution.
14. **Anti-lookahead/catalog bypass review** — source attachment is preparation-only. `DETACH evidence` must complete before Scanner authority creation. Focused canaries must prove direct `cycles`, `sessions`, `universe`, Demo Buy and source-qualified/catalog-qualified attempts fail, and that rows from cycles `> B` cannot be observed through `latest`, `history`, metadata functions, or a lingering source alias.
15. **Scanner-admission preservation review** — no new SQL parser or rewrite is introduced. The existing `createScannerAuthority` remains authoritative for one-statement SELECT-only, zero-parameter user SQL and forbidden/side-effect function rejection. Backtest only narrows the visible catalog.
16. **External-access review** — the preparation instance temporarily permits only the implementation-owned attachment operation. After materialization and detach, apply the existing DuckDB hardening and lock configuration. Focused proof must show user SQL cannot re-attach/read external files or recreate a path to the evidence source.
17. **Mutation/ownership review** — A/C/D read the evidence source only; all CREATE operations target the disposable in-memory sandbox. B is explicitly `READ_ONLY, TYPE DUCKDB`. No source transaction, UPDATE, DELETE, INSERT, COPY-to-source, migration, recovery, rename, delete, or process action exists.
18. **Failure/cleanup review** — no baseline produces an explicit unavailable result without a sandbox. Any attach/copy/detach/hardening failure closes the disposable sandbox and preserves the evidence connection/source unchanged. A source alias that cannot be detached must fail closed; user SQL must never run on that sandbox.
19. **Architecture alternative review** — rewriting user SQL with `WHERE cycle_id <= B`, exposing views over an attached source, executing directly on the evidence DB, or row-by-row JS copying are rejected because they either leave bypass paths, alter/fork Scanner semantics, or introduce avoidable memory/CPU overhead. Copying exact bounded source tables into a detached in-memory DB is the smallest sufficient mechanism.
20. **Index/optimization decision** — no new persistent source index or schema change is justified before measurement. Backtest preparation is offline and one-time per run; active-day/archive history is already bounded by product lifecycle. If focused workload evidence later shows materialization cost is unacceptable, optimization must preserve the same structural anti-lookahead boundary rather than weaken it.
21. **ATTACH literal-encoding review** — the database path position cannot use prepared binding in DuckDB 1.5.x Node execution. The only interpolated value is therefore a product-owned resolved path passed through the dedicated string-literal encoder. Single quotes are doubled, NUL is rejected, alias/type/options are constants, and a committed path-punctuation regression is mandatory. This prevents the parser limitation from becoming a general interpolation permission.

## First-execution finding and RCA

Fast CI run `#584` was the first execution after the committed preflight/tests. Four historical-sandbox tests failed at exactly the same parser boundary:

```text
Parser Error: syntax error at or near "$"
ATTACH $sourcePath AS evidence (READ_ONLY)
```

The no-baseline test passed because it never needed an attachment, and the pre-existing suites remained green. Root cause: the preflight generalized DuckDB prepared-parameter support to the `ATTACH` database-path grammar, but that grammar requires a literal at parse time. The failure escaped static review because the assumption concerned parser capability, not query semantics/cardinality; the mandated smallest first execution caught it before broader rollout.

Corrective rule: never infer that a DuckDB statement position accepts bind parameters merely because ordinary expressions do. When a grammar position requires a literal, prefer a non-SQL API if one exists; otherwise keep interpolation narrowly typed, provenance-restricted and encoded, with punctuation/injection regression proof. No change to PLAN 10.2's detached-sandbox architecture is required.

## First-execution gate

Before any material SQL above is executed, focused committed tests must exist for:

- exact baseline selection before/between/equal/after commit timestamps, including equal-`committed_at_ms` tie-breaks;
- no-baseline explicit unavailable behavior;
- `latest` reconstructed from exactly B and `history` containing no cycle `> B`;
- original representative Scanner SQL over `latest` and `history` executing unchanged with preserved result order;
- direct and qualified attempts to reach `cycles`, `sessions`, `universe`, Demo Buy tables or the temporary source alias failing;
- future-row canaries proving a known cycle `> B` is unreachable;
- source immutability before/after sandbox preparation and Scanner execution;
- existing Scanner admission regressions remaining green;
- a product-owned source path containing apostrophe/SQL-like punctuation attaching successfully with only `history`/`latest` visible afterward.

Only after those tests are committed may the new SQL receive its focused execution/rerun.