# Market Flow US Backlog

This file records future product/development work that is intentionally **not allocated in the current frozen TREE/EXECUTION**.

Backlog items do not authorize implementation. Before implementation they must be reviewed against current `main`, converted into the smallest coherent TREE leaves/contracts, dependency-reviewed, frozen and allocated normally.

## B-US-001 — File-backed SQL authoring library

### Goal

Make every important Scanner/query artifact AI-authorable and source-visible as a normal file rather than allowing DuckDB to be the only durable place where a query exists.

### Required outcome

- Define one simple file-backed query layout, preferably one `.sql` file per query with the smallest necessary metadata mechanism.
- Built-ins/examples/templates must be sourced from files or mechanically synchronized from one file source of truth; do not maintain duplicate handwritten SQL strings in code/docs/tests.
- User-authored/saved queries must have a supported file representation so the DB is not their only durable copy. The implementation may keep DuckDB as runtime persistence/index/cache, but a query must be exportable/importable or file-first in a deterministic way.
- AI tooling must be able to create/edit a query by changing ordinary repository/local files without requiring direct DuckDB manipulation.
- Define deterministic identity/name/interval metadata, conflict behavior and file↔runtime synchronization semantics.
- Preserve Scanner admission/security, Draft/Persisted/Active semantics and read-only execution.
- Keep KISS: no generic query-language subsystem, remote store or new database merely to support files.

### Acceptance evidence

- A checked-in query can be added/edited by changing files only and then loaded through the normal product path.
- Built-in SQL has exactly one authoritative text source.
- A user query can be round-tripped file → runtime persistence → file without semantic drift.
- File/DB conflict behavior is deterministic and covered by tests.
- No private/authenticated data is written to query files.

## B-US-002 — Query correctness contract tests

### Goal

Every file-backed production/example query must have executable correctness proof, not only parser/admission proof.

### Required outcome

For every checked-in executable query:

- parse/admission test against the current Scanner security contract;
- schema-binding test against a real temporary schema-v3 DuckDB;
- deterministic fixture with expected rows/columns/order;
- assertions for query-specific semantics, not merely "query executed";
- explicit edge cases where applicable: `NULL`, numeric zero, missing history, equal timestamps, `cycle_id` tie-break, ties in ranking, empty history, static/repeated values and membership changes;
- deterministic bounds/`LIMIT` assertions where the query is intended to be bounded;
- exact file↔loaded-SQL drift test so documentation/runtime/test copies cannot diverge.

Prefer small deterministic fixtures and millisecond/seconds feedback. Do not use the representative workload to prove basic correctness.

### Acceptance evidence

- Adding or changing a `.sql` query without adding/updating its correctness contract fails Fast verification.
- Intentional semantic changes require an explicit expected-result test change.
- Incorrect nearest-history/tie/null/ranking behavior is caught by focused tests before any performance run.

## B-US-003 — Machine-enforced static SQL performance gate

### Goal

Extend the existing human 10+ stage SQL preflight with automated static checks so obviously expensive query shapes are rejected before first execution.

### Required outcome

Build the smallest practical static SQL inspection/lint layer using the existing DuckDB/Scanner parsing capabilities where possible. It must run without executing the candidate query against representative data.

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
11. require declared expected scale/cardinality for recurring production queries (latest rows, history rows/security, cadence/frequency);
12. estimate worst-case intermediate rows from declared scale where possible;
13. flag query cost that grows with total DB lifetime when the intended analysis only needs a bounded recent horizon;
14. require deterministic tie-break ordering for nearest-row/ranking logic;
15. check nullable comparison semantics that can accidentally force or invalidate later stages;
16. compare alternative architecture choices before execution: SQL rewrite vs code flow vs schema/index/precompute/data model;
17. prevent first execution when mandatory static findings remain unresolved;
18. emit a small, machine-readable preflight report suitable for CI/review.

The automated checks supplement rather than replace the AGENTS 10+ human/static reasoning gate.

### Execution discipline

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

### Acceptance evidence

- Known bad patterns (including seven repeated lateral nearest-history lookups and a lifetime-growing history join for a short-horizon query) are rejected or produce blocking findings before execution.
- A deliberately bounded small query passes without false-positive blocking.
- Static gate runs in normal Fast feedback time, ideally well below one second per query family and without adding material CI latency.
- Reports identify the exact query/file/check and why it is blocked.

## B-US-004 — Query development workflow for AI

### Goal

Make "ask AI to add/change a Scanner query" a safe repeatable workflow.

### Desired flow

```text
AI edits/adds .sql file
→ metadata validation
→ correctness tests
→ static performance gate
→ human 10+ preflight for material SQL
→ tiny deterministic probe
→ normal Scanner activation only after green proof
```

### Acceptance evidence

- Documentation provides a short prompt/workflow for adding a query.
- The AI does not need to modify DuckDB directly.
- CI gives precise feedback for syntax/schema/correctness/performance-static failures.
- The workflow preserves normal saved-query UX and does not create a second Scanner engine.

## Priority / sequencing note

These items are strongly related and should probably be planned as one future capability with ordered leaves:

```text
file-backed query source
→ correctness harness
→ static performance analyzer/gate
→ AI authoring workflow/docs
```

However, future planning must re-evaluate the smallest sufficient decomposition from fresh `main`; this backlog does not pre-authorize that exact TREE shape.
