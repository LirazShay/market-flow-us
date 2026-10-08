# B-US-003 — Machine-enforced static SQL performance gate

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`

## Goal

Extend the existing human 10+ stage SQL preflight with automated static checks so obviously expensive query shapes are rejected before first execution.

## Required outcome

Build the smallest practical static SQL inspection/lint layer using existing DuckDB/Scanner parsing capabilities where possible. It must run without executing the candidate query against representative data.

Minimum checks to investigate/implement:

1. inventory referenced tables and repeated visits to the same large table;
2. detect correlated/lateral subqueries and repeated nearest-row lookups;
3. detect `CROSS JOIN` or joins without an explicit selective key;
4. flag joins whose static shape can create many-to-many/intermediate row explosion;
5. flag unbounded `history` access on recurring/hot-path queries unless explicitly justified;
6. identify whether time/security predicates can bound history work;
7. identify `ORDER BY`, `DISTINCT`, `GROUP BY`, windows and ordered aggregates over potentially large intermediates;
8. flag `SELECT *` on large/history paths where projection size materially matters;
9. detect repeated equivalent subqueries/CTEs/table scans where one-pass/set-based reuse is possible;
10. verify output bounds (`LIMIT`) while explicitly distinguishing output bounds from work bounds;
11. require declared expected scale/cardinality for recurring production queries;
12. estimate worst-case intermediate rows from declared scale where possible;
13. flag query cost that grows with total DB lifetime when the intended analysis only needs a bounded recent horizon;
14. require deterministic tie-break ordering for nearest-row/ranking logic;
15. check nullable comparison semantics that can accidentally force or invalidate later stages;
16. compare alternative architecture choices before execution: SQL rewrite vs code flow vs schema/index/precompute/data model;
17. prevent first execution when mandatory static findings remain unresolved;
18. emit a small machine-readable preflight report suitable for CI/review.

The automated checks supplement rather than replace the AGENTS 10+ human/static reasoning gate.

## Execution discipline

```text
query file change
→ correctness static/schema checks
→ machine static performance checks
→ 10+ human preflight review
→ all findings resolved
→ smallest deterministic execution probe
→ measure
→ only then scale up
```

No representative benchmark is allowed merely to discover a query shape that static inspection can already reject.

## Acceptance evidence

- Known bad patterns, including repeated lateral nearest-history lookups and lifetime-growing history joins for short-horizon queries, are rejected or produce blocking findings before execution.
- A deliberately bounded small query passes without false-positive blocking.
- Static gate runs in normal Fast feedback time without adding material CI latency.
- Reports identify the exact query/file/check and why it is blocked.
