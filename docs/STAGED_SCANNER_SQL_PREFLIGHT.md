# Staged Scanner SQL — Static Preflight

Status: **REJECTED FOR SCALE — do not execute/benchmark further in this shape**

Scope: the materially changed `builtin:staged-candidate-ranking` query currently using one `history` join plus seven ordered filtered aggregates for the 10/20/30/45/60/90/120-second anchors.

This record satisfies the AGENTS SQL static-preflight requirement before any further intentional execution of the changed query. It does not certify runtime performance.

## 1. Purpose and contract

The query must, for every current `latest` security, resolve the nearest historical `Price` at or before each logical anchor (10/20/30/45/60/90/120 seconds before the current row), preserve the deterministic `(collected_at_ms DESC, cycle_id DESC)` tie-break, award only contiguous stages where current `Price > prior Price`, expose `securityId`, and return the deterministic top 100 ranking.

It must not change authority, persist derived strategy state, reinterpret provider timestamps, or introduce a hidden Strategy Engine.

Result: **PASS**.

## 2. Schema/data-source validation

Current rows come from `latest`, keyed by `security_id`. Historical rows come from append-only `history`, whose primary key is `(cycle_id, security_id)`. The query uses only documented schema-v3 fields: `security_id`, `cycle_id`, `collected_at_ms`, `Price`, `Symbol`, `PaperNameEng`, `ExchangeName`, `ChangePercent`, and `DailyVolume`.

`Price` is nullable and the staged CASE naturally stops when an anchor price is missing/NULL.

Result: **PASS**.

## 3. Cardinality estimate

Representative node 6.3 scale is:

```text
latest: 4,096 rows
history: 4,096 × 180 = 737,280 rows
logical spacing: 3 seconds
```

For the final representative cycle, the 10-second join predicate can admit about 176 historical rows per security, or roughly:

```text
4,096 × 176 = 720,896 joined rows
```

before grouping back to about 4,096 anchor rows and finally sorting/limiting to 100.

More importantly, `history` is append-only and the join has no lower time bound. At normal long-running product usage, rows admitted per security continue growing with retained history.

Result: **FAIL FOR RECURRING SCALE** — input work is not bounded by the seven requested horizons.

## 4. Access-path inventory

The previous query shape performed seven `LEFT JOIN LATERAL` nearest-row lookups. The current rewrite improves repeated logical table visits to one joined relation, but that relation still visits all qualifying historical rows older than the 10-second cutoff for every current security.

There is no schema-v3 index/derived temporal authority specifically aligned to `(security_id, collected_at_ms, cycle_id)` nearest-prior retrieval, and static review must not assume an optimizer can make an unbounded logical access pattern constant-cost.

Result: **IMPROVED BUT NOT SUFFICIENT**.

## 5. Predicate/selectivity review

The join predicate correctly applies:

```text
same security
AND history.collected_at_ms <= latest.collected_at_ms - 10s
```

This excludes rows too recent even for the first anchor, but it does not exclude arbitrarily old rows. The 20–120 second conditions are aggregate FILTER predicates and therefore do not reduce the joined input relation.

Adding an arbitrary lower bound would reduce work but would change the current nearest-earlier semantics when collection gaps exceed that bound, so it cannot be introduced silently.

Result: **FAIL FOR BOUNDEDNESS**.

## 6. Join and row-explosion review

The `security_id` equality prevents cross-security many-to-many expansion, but each `latest` row still joins to many historical rows for that security. At representative scale this is roughly hundreds of rows per security; over a long-lived DB it becomes thousands or more per security.

Output cardinality is bounded, intermediate cardinality is not.

Result: **FAIL FOR LONG-RUN SCALE**.

## 7. Sort/group/aggregate review

The query groups by current security/time and computes seven `first(Price ORDER BY collected_at_ms DESC, cycle_id DESC) FILTER (...)` aggregates. This preserves the required tie-break semantics, but ordered aggregates can require substantial ordering/state work within each group. Static reasoning must not assume DuckDB shares all seven ordered aggregate work internally.

The final top-100 sort is small relative to the history join; it is not the dominant concern.

Result: **RISK PRESENT**.

## 8. Repeated-work elimination

The rewrite successfully removes the most obvious repeated work from seven independent LATERAL query shapes and computes all anchors from one history relation.

However it still repeatedly carries historical rows that are far older than the requested anchor region, and seven ordered aggregate expressions process the same joined groups.

Further static alternatives to examine before execution include a nearest-match-oriented set-based shape (for example one target-row relation for all seven horizons plus a single temporal/ASOF-style match) or another mechanism that makes work depend primarily on the requested anchor set rather than total retained history.

No alternative is approved merely by being named here; it must itself pass the full static gate before first execution.

Result: **PARTIAL PASS; MORE ELIMINATION REQUIRED**.

## 9. Boundedness/resources/failure review

The query is read-only and does not affect transaction rollback/authority. `LIMIT 100` bounds returned rows but not scan/join/group memory or CPU.

Because the query is a built-in with `intervalMs: 5000`, an input cost that grows with all retained history is especially problematic: recurring cost compounds every five seconds and competes with normal product work.

Under the repository automation-performance rule, a large workload must not be used to discover this already-visible structural risk.

Result: **FAIL**.

## 10. Architecture/schema/code alternative review

Do not add temporal schema/precomputation merely by assumption: D-US-010 still requires evidence before introducing that subsystem. But the current aggregate rewrite is also not acceptable for scale simply because it is smaller than seven LATERAL expressions.

Next engineering action must stay KISS:

1. design a bounded/nearest-match SQL shape using the existing schema first;
2. run the same 10+ static checks on that candidate;
3. only if it passes, execute the smallest deterministic fixture/probe;
4. measure before scaling;
5. if existing-schema SQL cannot make intended recurring use practical, reopen the smallest performance planning area and then evaluate schema/precompute/index/code changes with evidence.

Result: **REJECT CURRENT SHAPE; NO SCHEMA CHANGE YET**.

## Gate decision

```text
current one-join + seven ordered filtered aggregates
→ semantically plausible
→ better than seven explicit repeated LATERAL shapes
→ still logically unbounded with retained history
→ NOT APPROVED for further intentional execution/benchmark
```

The next SQL candidate must reduce recurring work structurally before any probe. The representative `4096 × 180` workload remains forbidden for this staged query until a replacement candidate passes the static gate and a small deterministic probe.

The existing guide/code drift is intentionally not resolved by documenting this rejected SQL as canonical. `docs/SCANNER_SQL_GUIDE.md` should be synchronized only after the replacement query shape has passed static preflight.