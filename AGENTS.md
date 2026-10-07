# AGENTS.md — Market Flow US Operating Rules

GitHub `main` in `LirazShay/market-flow-us` is the product source of truth.

Default repository language is Hebrew. Code, identifiers, filenames and technical terms may remain in English.

## Repository roles

- `market-flow-us` — THE PRODUCT and current truth.
- `market-scope@d8bc770d292d328d7e89febb8ef4f450abe9458e` — exact imported implementation/test donor.
- `trading-us@51fa85a951728c117f1e345760971aef5fa3cec4` — U.S. provider-discovery evidence donor.
- `market-flow` — historical design evidence only.
- `st-planner` — planning-framework reference.

Normal implementation must not require donor-repo history once the relevant fact is extracted here.

## Product migration rule

Market Flow US is a controlled U.S. conversion of the proven MarketScope product, not a rewrite.

```text
preserve proven MarketScope behavior
→ replace only Israel-specific provider/data assumptions
→ keep tests green
→ prove U.S. replacement
→ remove superseded Israel path only after cutover proof
```

Do not introduce a Strategy Engine, temporal-link engine, dynamic schema, new database architecture or new transport unless measured evidence proves the current mechanism insufficient.

The staged candidate idea is Scanner SQL. Strategy logic belongs in editable/saved SQL unless a later measured bottleneck justifies a narrower implementation optimization.

## Migration cutover sequencing

The U.S. conversion is **pre-cutover** until TREE node `5.2`.

Before `5.2`:

- nodes `1.*` through `4.*` and `5.1` implement and prove their U.S. target behavior through the existing constructor/dependency/config/test seams;
- they must not switch the normal built browser/runtime/demo/service composition to the U.S. path while downstream U.S. dependencies are still incomplete;
- the currently active proven composition must remain Browser-CI green;
- do not skip/disable Browser tests to hide an integration gap;
- do not invent a feature-flag subsystem or duplicate architecture just for migration staging.

Use the smallest existing injection/construction seam that lets focused tests exercise the U.S. implementation without activating an incomplete product path.

TREE node `5.2` is the normal-runtime U.S. cutover boundary. Chat 5 owns `5.1 → 5.2 → 5.3` in one work unit, so the normal runtime is switched only after the required U.S. provider, authority, read/UI and Scanner outcomes already exist, and the full U.S. Browser suite is adapted/green before that PR may merge.

Legacy Israel-specific paths may remain temporarily reachable only as pre-cutover compatibility. They receive no new product behavior and are removed/retired only after replacement proof, with final authoritative cleanup owned by `7.3`.

## Fresh-chat read order

Planning/review:

```text
AGENTS.md
→ STATUS.yaml
→ .planning/STATUS.yaml
→ .planning/GOAL.md
→ only current TREE nodes + routed contracts/evidence
```

Execution after freeze:

```text
AGENTS.md
→ STATUS.yaml
→ .planning/STATUS.yaml
→ .planning/EXECUTOR_HANDOFF.md
→ .planning/EXECUTION.yaml
→ assigned TREE nodes + dependencies
→ only routed contracts/tests/code
```

GitHub `main` overrides chat history.

## Branch and PR workflow

Every meaningful planning or engineering work unit uses:

```text
fresh main
→ focused branch
→ work + focused proof
→ update STATUS/EXECUTION on same branch
→ PR
→ required CI green
→ review diff
→ squash merge
→ verify main CI
→ audit open PRs
```

Rules:

- one coherent outcome per PR;
- no independent next unit before the current PR merges and required main CI is green;
- an unexpected open PR is a blocker until adopted, merged or closed;
- `main` is accepted truth; an open PR is work in progress;
- blocking defects remain with the chat that discovers them;
- fix root cause + regression proof, not only the symptom;
- if implementation proves the frozen plan materially wrong, reopen the smallest affected planning area before coding forward.

## Learning from failures

When a defect is found:

```text
root cause
→ fix
→ regression proof
→ affected verification
→ green
```

If the defect proves a frozen planning decision/contract wrong, stop coding forward and reopen only the smallest affected planning area before continuing.

## Planning boundary

Production implementation is forbidden while:

```text
STATUS.yaml -> phase: planning
```

Implementation is authorized only when:

```text
.planning/STATUS.yaml -> plan_state: frozen
AND
STATUS.yaml -> phase: implementation
AND
.planning/EXECUTION.yaml is allocated
```

The planner must finish contracts, S&T review, whole-goal coverage review, Final Planning Review, freeze, allocation and handoff verification before authorizing execution.

## Serial executor protocol

When the user says `אני צאט N תתחיל` or equivalent:

1. fetch current `main`;
2. read `.planning/EXECUTOR_HANDOFF.md`;
3. read `.planning/EXECUTION.yaml`;
4. verify root STATUS points to chat N and its first non-done node;
5. load only assigned TREE nodes/dependencies and routed contracts;
6. verify dependencies are `done`;
7. set the active node `in_progress` before implementation;
8. implement/test only assigned unblocked work;
9. mark `done` only after success evidence is green;
10. update STATUS/EXECUTION on the same branch;
11. PR → CI green → review → squash merge → verify main before the next independent work unit.

A chat may own several nodes; execute them in listed order.

## Engineering defaults

KISS:

```text
current verified requirement
→ smallest sufficient mechanism
→ prove it
→ stop
```

Tests protect observable/public contracts. Reuse imported tests wherever behavior is unchanged; adapt tests only where the U.S. contract intentionally changes.

### Automation performance is a first-class correctness contract

Recurring automated execution cost is product-development infrastructure and must be optimized aggressively. A test or workflow being green does **not** make excessive runtime acceptable.

This rule applies to every repeatedly executed automated path, including:

- GitHub Actions workflows and job topology;
- checkout/setup/dependency installation/cache restore;
- build and packaging steps;
- unit/service/browser tests;
- fixtures, Fake Market/Fake Leumi and local acceptance harnesses;
- temporary DuckDB/bootstrap/cleanup work;
- report generation and verification scripts;
- benchmark/workload preparation and small probes.

Measure **wall-clock feedback end-to-end**, not only the test body. A three-second test inside a seventy-second workflow is a seventy-second feedback problem.

Default priority when automation becomes materially slow or regresses:

```text
identify recurring cost
→ remove duplicated/unnecessary work
→ improve test/fixture/code architecture
→ improve job topology/cache/setup
→ parallelize only where it reduces real wall time safely
→ remeasure end-to-end
→ keep the proof
```

Rules:

- prefer refactoring automation/test code over accepting repeated waiting;
- treat an unexplained material slowdown as an engineering defect owned by the chat that discovers it;
- do not hide slow tests by increasing timeouts, adding retries, splitting the same expensive setup across more jobs, or moving the cost outside the measured command;
- investigate an individually slow test when it materially dominates feedback; do not chase harmless microseconds merely because a broad suite contains many tests;
- when several valid implementations are possible, prefer the one that keeps recurring verification cheapest while preserving correctness and diagnosability;
- optimize the highest recurring cost first because CI/test latency compounds across every future change;
- remove valuable coverage only when it is genuinely redundant and the remaining proof protects the same observable contract;
- hard ceilings are emergency failure bounds, never performance targets; normal repeated feedback should remain in seconds.

A broad, high-value recurring suite that exercises many real integration boundaries may legitimately take up to roughly **30 seconds wall-clock**. That is an acceptance ceiling, not a target. Before accepting such a runtime, inspect the dominant costs for removable duplication, avoidable waiting/polling, oversized fixtures/bootstrap, unnecessary I/O or serialization, and other practical optimizations that preserve the same proof. If no meaningful improvement remains without weakening evidence or adding disproportionate complexity, record the measured result as the **best practical verified state** and stop micro-optimizing it. Reopen performance work when timing materially regresses or architecture/data shape changes.

#### Hosted CI is correctness-first

GitHub-hosted runners are not the release-performance authority for this product.

Use them for:

- extensive unit/service/browser correctness proof;
- bounded performance sanity and catastrophic-regression detection;
- approximately-full-universe width checks when they remain small;
- diagnostic timing, not target-machine SLO claims.

Do not repeatedly run large end-to-end workloads in hosted CI merely because they are available. Heavy performance PASS/FAIL belongs to the final target-machine acceptance defined by TREE/TEST_STRATEGY.

When measuring one component, exercise the narrowest relevant layer: persistence tests need not pay for browser/HTTP; read/Scanner tests may seed valid day-bounded data directly; only end-to-end acceptance should pay for the complete Fake Market → browser → service → DuckDB path.

For meaningful changes to automation-heavy areas, inspect whether the touched path introduced or preserves avoidable repeated work. If so, fix/refactor it in the same work unit rather than carrying known automation debt forward.

### SQL static preflight gate

Do not manually execute, benchmark, dispatch or introduce into a first execution any **new or materially changed SQL** until it has passed at least ten explicit static validation/optimization stages.

This gate applies to product SQL, Scanner SQL, benchmark/workload SQL, migration SQL and ad-hoc diagnostic SQL proposed by the executor. Existing unchanged SQL that already passed this gate and is protected by committed regression tests may run normally; reopen the gate when the query, schema, cardinality/data shape or intended scale changes materially.

Before first execution, document/reason through at least these ten stages:

1. **Purpose and contract** — state exactly what observable result the query must produce and what it must not change.
2. **Schema/data-source validation** — verify every table, column, type, nullability, identity key and timing field against the current schema contract.
3. **Cardinality estimate** — estimate input rows, rows per key, expected output rows and worst-case growth at intended scale.
4. **Access-path inventory** — count full scans, joins, correlated subqueries, lateral lookups, repeated table visits and other potentially multiplicative operations.
5. **Predicate/selectivity review** — prove filters are applied as early as safely possible and identify predicates that cannot reduce work.
6. **Join and row-explosion review** — verify join keys, uniqueness assumptions and worst-case intermediate cardinality; reject accidental many-to-many expansion.
7. **Sort/group/window review** — identify every `ORDER BY`, aggregation, window, distinct/dedup and materialization-like operation and estimate its cost.
8. **Repeated-work elimination** — look for equivalent set-based rewrites, one-pass aggregation, reuse of already-persisted authority, or removal of duplicate projection/copy work.
9. **Boundedness and resource review** — prove result bounds, memory/disk implications, transaction scope and failure/rollback behavior are appropriate for the intended scale.
10. **Architecture/schema/code alternative review** — explicitly ask whether the right fix is actually outside the SQL: change the calling code, persistence flow, schema/index/precomputation strategy, data model or feature behavior rather than forcing an expensive query.

After those ten, perform any additional static checks needed for the specific query. Only then may execution begin, and the first execution must be the smallest deterministic fixture/probe that can falsify the reasoning quickly.

Execution discipline after preflight:

```text
10+ static validation/optimization stages
→ smallest deterministic execution
→ measure
→ if slow or surprising, stop early
→ fix SQL OR code/schema/data flow at the root cause
→ repeat static gate when materially changed
→ only then scale up
```

Do not use a large workload to discover an obviously poor query shape. Do not wait through long SQL runs merely to obtain a number. If a query approaches ordinary CI time budgets, stop and optimize/rethink before scaling further.

### Diagnosability-by-design

Preserve the proven diagnosability model:

- stable component/checkpoint;
- stable error code;
- last successful checkpoint;
- sanitized causal message;
- bounded Support Snapshot / CLI fallback;
- no secrets, cookies, auth/session material, account identifiers, raw authenticated dumps or private browser state.

The target boundary remains:

```text
authenticated provider page
→ validated complete U.S. snapshot
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB
→ Current / Detail-History / Scanner
```

## Security

Treat the repository as public-safe regardless of visibility.

Never commit credentials, cookies, authorization/session data, account identifiers, private browser state or raw authenticated captures. Use sanitized/synthetic fixtures only. Do not bypass browser/provider security mechanisms.

## Durable ownership

- `STATUS.yaml` — operational phase/current execution pointer.
- `.planning/STATUS.yaml` — plan state.
- `.planning/GOAL.md` — stable U.S. migration goal.
- `.planning/TREE.yaml` — S&T logic/dependencies/evidence.
- `.planning/DECISIONS.md` — material decisions.
- `.planning/REVIEWS.md` — planning and whole-goal coverage reviews.
- `.planning/EXECUTION.yaml` — numbered execution allocation after freeze.
- `.planning/EXECUTOR_HANDOFF.md` — framework-owned executor bootstrap/handoff contract.
- `docs/EXECUTOR_ROUTING.md` — target-owned executor context routing; read only the assigned node rows after framework bootstrap.
- `docs/US_MIGRATION_AUDIT.md` + `docs/US_MIGRATION_FILE_MAP.md` — exhaustive imported-baseline migration audit.
- `docs/US_CONTRACT_REVIEW.md` — durable contract coherence review.
- `docs/PRODUCT_REQUIREMENTS.md` — what/why.
- `docs/PRODUCT_SPEC.md` — observable behavior.
- `docs/DATA_CONTRACT.md` — provider/data truth.
- `docs/TECHNICAL_SPEC.md` — architecture/schema contract.
- `docs/TEST_STRATEGY.md` — verification contract.
- `docs/SCANNER_SQL_GUIDE.md` — public Scanner schema/query guide.
- `docs/SOURCE_EXTRACTION.md` / `docs/US_SOURCE_EVIDENCE.md` — migration provenance/evidence.

Do not duplicate live operational status in durable specs.

<!-- st-planner:rules:v3:begin -->
# S&T Planner Rules

## Mandatory freshness gate

Before any S&T planning request or numbered executor bootstrap, run:

```text
node .planning/check-framework-update.mjs
```

Interpret the result literally:

- exit `0` + current — continue;
- exit `0` + recommended update — surface the update and continue unless an upgrade is chosen;
- exit `2` — a required framework upgrade/reconciliation exists; do not start new S&T planning/execution until it is resolved and the checker reports current;
- exit `3` — installed framework/provenance is missing, damaged, malformed, or drifted; repair/upgrade it before S&T work;
- freshness unavailable because the network/source cannot be reached — say that source freshness is unverified and continue only from the locally integrity-checked installed framework without claiming it is current.

Framework upgrades may refresh framework-owned instructions/tooling only. They must never overwrite `.planning/GOAL.md`, `.planning/TREE.yaml`, `.planning/DECISIONS.md`, `.planning/REVIEWS.md`, `.planning/STATUS.yaml`, or `.planning/EXECUTION.yaml`.

## Planning trigger

A request such as `תתכנן לי עם S&T Planner לפי הריפו: ...`, `ST Planner`, or an equivalent natural-language request is sufficient. The user does not need to restate the framework procedure.

After the freshness gate, follow the installed framework contract in this order:

```text
project-native AGENTS/routing rules
→ .planning/README.md
→ .planning/FRAMEWORK.md
→ .planning/STATUS.yaml
→ current-cycle S&T state/evidence as routed
```

Use the complete S&T method described there: outcome before solution, deep justified Strategy/Tactic reasoning, necessity/sufficiency, implementation-ready leaves, final review, freeze/no-drift, allocation validation, handoff verification, and explicit implementation authorization. Do not implement target-project work while planning.

## Executor trigger

A numbered executor starts only from an explicit request such as `אני צאט N תתחיל` / `I am chat N`. Allocation, target current pointers, `NEXT_CHAT_PROMPT`, or generic `continue` never activate another Chat N implicitly.

After the freshness gate, follow `.planning/EXECUTOR_HANDOFF.md`, `.planning/CI-RCA-POLICY.md`, `.planning/EXECUTION.yaml`, TREE dependencies, and only the explicitly assigned/routed project context. `.planning/EXECUTION.yaml` is execution-state authority; target-owned current chat/node pointers are projections only.

## CI warning/error gate

Every CI warning or error pauses progression until the RCA in `.planning/CI-RCA-POLICY.md` is closed. A local symptom fix or a green rerun alone is not closure. Establish root cause, why prevention/detection failed, reusable recurrence prevention, materially analogous areas that may share the weakness, and closing evidence before continuing.

## Update-safe ownership

This whole block is framework-owned and is bounded by the `st-planner:rules:v3:begin/end` markers. Target-project instructions belong outside the markers and must be preserved byte-for-byte by framework upgrades.
<!-- st-planner:rules:v3:end -->

## Market Flow US executor routing

For numbered executor chats, after the S&T framework bootstrap/authorization checks, read `docs/EXECUTOR_ROUTING.md` and load only the row(s) for the explicitly assigned node(s). This routing contract is target-owned and intentionally lives outside framework-managed files.
