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

### B-US-001..004 sequencing note

These four items are strongly related and should probably be planned as one future capability with ordered leaves:

```text
file-backed query source
→ correctness harness
→ static performance analyzer/gate
→ AI authoring workflow/docs
```

However, future planning must re-evaluate the smallest sufficient decomposition from fresh `main`; this backlog does not pre-authorize that exact TREE shape.

## B-US-005 — Replay pre-user-run hardening audit

### Priority / timing

Run this as the **immediate next mini-project after TREE `9.5` Replay reclosure**, before relying on the user's target-machine Replay run. The user's own testing may proceed in parallel, but it must not be the first serious integration proof.

This is verification/hardening, not a new Replay capability. Plan/freeze it normally before execution because it is outside the current frozen allocation.

### Goal

Perform an independent, uncompromising audit of the complete Market Recording + Replay implementation so defects are found in repository/CI proof before the user's run.

### Required audit

#### Full static review

Read the complete Replay implementation and every materially affected generic seam, not only the latest diff:

```text
validated acquisition/recording seam
Recorder + IndexedDB store/library
portable export/parser/file source
Player scheduling/rebase/generation cancellation
ProducerBridge composition
Replay UI/coordinator/client
Replay Host lifecycle/security/ownership
service --db/--port/--allowed-origin seams
Current / History / Scanner / Demo Buy behavior used by Replay
build/launcher/docs/diagnostics
```

Check contracts against implementation line-by-line where material, error paths as well as happy paths, ownership/cleanup races, stale callbacks, restart/seek/stop transitions, malformed inputs, missing history, timestamp invariants, privacy and normal-live isolation.

#### Executable proof

Run and review at minimum:

- all Replay-focused unit tests;
- all Replay-focused real service/DuckDB tests;
- focused Replay browser/Chromium specs;
- `npm run test:acceptance:replay`;
- full `test:unit` and `test:service` so generic regressions are not hidden by focused selection;
- materially affected full Browser/Planning/Workload gates;
- dedicated build/launcher drift proof;
- arbitrary middle-frame start with zero preroll;
- next-day local-time rebasing with source values unchanged;
- Stop→Play fresh-run, Seek fresh-run and Pause/Resume same-run semantics;
- Host credential/origin/foreign-process/live-DB isolation;
- Current/History/Scanner/Demo Buy progressive behavior from missing history;
- malformed/truncated/wrong-version portable files and storage/quota failure boundaries;
- stale-generation and ACK-gating races.

Where current tests do not actually prove a material risk discovered by static review, add the smallest regression/proof test instead of merely documenting the gap.

### Defect rule

Any defect found belongs to this hardening mini-project through:

```text
root cause
→ smallest correct fix
→ regression proof
→ affected verification
→ green
```

Do not waive a deterministic failure because the user can test it manually later.

### Completion evidence

- Durable audit record mapping all Replay contracts/components to reviewed code and green proof.
- No known untested material Replay risk remains within scope.
- Focused Replay acceptance plus full unit/service and materially affected broad gates are green on one exact SHA.
- Diff/review confirms no replay-aware shared server/protocol behavior and no live-DB ownership regression.
- Candidate is merged, `main` CI green, and open-PR state clean before declaring the Replay feature safe for the user's run.

## B-US-006 — Basic in-product BUY via existing order API

### Goal

After Replay hardening, implement the **smallest useful BUY integration** from Market Flow US into the already-built local `ibkr-order-service` API.

Initial scope is deliberately basic. More advanced order behavior will be planned separately later.

### Initial MVP intent

Provide one explicit user-initiated `BUY` action from the product that:

```text
selected market item
→ build bounded BUY request from simple local configuration
→ call authenticated localhost ibkr-order-service
→ reuse existing preview / validation / LIVE gates
→ show deterministic success / rejection / unknown result
```

The exact surface and minimal config shape must be chosen during the S&T plan, but the initial configuration should stay simple—for example a configured buy amount or equivalent bounded quantity rule. Do not build a strategy engine merely to support this first BUY.

### Required boundaries

- Reuse the existing order-service API; do not call IBKR directly from Viewer/Scanner code.
- Preserve its caller authentication, DRY_RUN default, explicit LIVE enablement, request idempotency, provider preflight/what-if/reply handling and `ACKNOWLEDGEMENT_UNKNOWN` behavior.
- BUY must be an explicit user action in this first MVP; no automatic Scanner→order loop unless a later plan explicitly authorizes it.
- No credential, session, account identifier or caller token may enter repository/config persisted in unsafe form or diagnostics.
- No SELL automation, portfolio engine, position sizing system, risk engine or sophisticated execution strategy is required in this first MVP.
- Configuration errors, unavailable price/instrument data, unavailable order service, failed preview, permission/session failure and uncertain acknowledgement must fail visibly and safely.

### S&T requirement

Before implementation, perform a focused S&T mini-project from fresh `main` to justify:

- which existing surface owns the first BUY button/action;
- the minimal user configuration required for amount/quantity;
- how symbol/security identity is mapped into the existing U.S. STK/USD/SMART order intent;
- preview/confirmation UX and exact transition from DRY_RUN to LIVE;
- idempotency/requestId ownership across retries/reconnects;
- error/recovery presentation;
- smallest unit/service/browser/acceptance proof needed.

Keep decisions that are not needed for the basic MVP open for the later API development session.

### Acceptance evidence

- A deterministic synthetic journey selects an item in Market Flow US and reaches the real local order-service API with the expected normalized BUY intent.
- Configured amount/quantity behavior is deterministic and boundary-tested.
- DRY_RUN proves zero provider submit; LIVE remains impossible unless every existing independent gate is satisfied.
- Double-click/retry/reconnect cannot create an uncontrolled duplicate BUY.
- Service unavailable, validation/preview/provider rejection and acknowledgement-unknown are distinct and recoverable in the UI.
- Existing Scanner/Demo Buy/Replay behavior remains green and does not automatically gain order authority.
- Unit, service, browser/composition and dedicated BUY integration acceptance are green; materially affected broad gates are green before merge.

### New work sequencing note

The current intended sequence after the frozen Replay work is:

```text
complete TREE 9.5
→ B-US-005 Replay hardening audit
→ B-US-006 basic BUY integration
→ later deeper API/order product planning
```

Future planning must always re-evaluate ordering from fresh `main`; this file does not itself authorize implementation.
