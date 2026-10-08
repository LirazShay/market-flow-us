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

## Historical migration cutover record

The U.S. conversion used implementation leaf `5.2` as the normal-runtime cutover boundary. Before that point, leaves `1.*` through `4.*` and `5.1` proved the U.S. target through existing constructor/dependency/config/test seams without switching the incomplete normal runtime. Browser CI remained green and no feature-flag subsystem or duplicate architecture was introduced solely for staging.

Leaf `5.2` completed the normal-runtime U.S. cutover only after provider, authority, read/UI and Scanner prerequisites were ready; `5.3` proved the composed Browser path and `7.3` completed superseded Israel-path cleanup. This is historical product provenance, not a current execution gate.

## ST Planner 2.0 bootstrap and authority

ST Planner is a method/reference, not an installed runtime inside this repository. Do not recreate framework installers, freshness checkers, hashes, freeze state, authorization state, allocation validators or handoff state machines.

For any fresh planning/review or numbered executor session:

```text
fetch fresh market-flow-us/main
→ read AGENTS.md
→ resolve one exact current LirazShay/st-planner main commit
→ from that same commit read BOOTSTRAP.md
→ docs/SNT-METHODOLOGY.md
→ docs/EXECUTION-MANAGEMENT.md
→ .planning/PLAN.md
→ .planning/EXECUTION.md
→ only then load the relevant task/leaf and routed project context
```

Never mix ST Planner documents from different framework commits within one bootstrap.

Repository authority is:

```text
.planning/PLAN.md      = planning / S&T truth
.planning/EXECUTION.md = task / owner / status / real dependency / result-evidence truth
.planning/DECISIONS.md = durable supporting decision rationale
STATUS.yaml            = non-authoritative navigation/compatibility projection only
```

GitHub `main` overrides chat history. `STATUS.yaml` may project the current task for external tooling, but it must never independently redefine owner, status, dependency or completion truth.

## Fresh executor flow

A numbered executor starts only from an explicit request such as `אני צאט N תתחיל` / `I am chat N`. A generic `continue`, repository current pointer, handoff text or previous chat identity must never silently activate another numbered chat.

After the ST Planner 2.0 bootstrap above:

1. read `.planning/EXECUTION.md` and locate tasks explicitly owned by Chat N;
2. verify each task's real dependencies are `done` before starting it;
3. read the corresponding implementation-ready leaf in `.planning/PLAN.md`, including success evidence;
4. read only the matching row(s) in `docs/EXECUTOR_ROUTING.md`;
5. load only routed contracts/tests/code needed for that task;
6. move the active task to `in_progress` when implementation actually begins;
7. implement/test only owned, unblocked work;
8. mark a task `done` only after its success evidence is green and record useful result/evidence in `.planning/EXECUTION.md`;
9. refresh root `STATUS.yaml` only as a projection of the authoritative execution state;
10. complete the branch/PR/CI workflow before starting an independent next work unit.

A chat may own several tasks. Execute them in dependency-valid order from `.planning/EXECUTION.md`; chat numbering itself is not dependency truth and need not be contiguous.

If the requested Chat N is not the current owner of any executable task, or required dependencies are not `done`, do not rewrite planning/execution truth to fit the request. Report the blocker briefly.

## Planning and execution boundary

ST Planner 2.0 does not use freeze/authorization ceremony as execution authority.

Planning changes belong in `.planning/PLAN.md` and durable rationale in `.planning/DECISIONS.md`. Execution starts only from an explicit row in `.planning/EXECUTION.md` whose real dependencies permit it.

If implementation or verification proves the current PLAN/contract materially wrong:

```text
stop coding forward
→ identify the smallest affected planning/contract area
→ repair PLAN / DECISIONS / durable contract as needed
→ review the affected reasoning and success evidence
→ repair EXECUTION mapping/dependencies if needed
→ continue only from the corrected truth
```

Do not work around a plan known to be wrong, and do not invent a second status/authorization mechanism.

## Branch and PR workflow

Every meaningful planning or engineering work unit uses:

```text
fresh main
→ focused branch
→ work + focused proof
→ update PLAN/EXECUTION/STATUS projection as applicable on the same branch
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
- if implementation proves the current plan materially wrong, repair the smallest affected planning area before coding forward.

## Learning from failures

When a defect is found:

```text
root cause
→ fix
→ regression proof
→ affected verification
→ green
```

If the defect proves a planning decision/contract wrong, stop coding forward and reopen only the smallest affected planning area before continuing.

### CI warning/error RCA gate

Every CI warning or error pauses progression until a comprehensive RCA is closed. A local symptom fix or a green rerun alone is not closure.

Before continuing, establish:

- the root cause;
- why the defect escaped prevention/detection;
- the reusable change that reduces recurrence;
- materially analogous areas that may share the weakness;
- regression/verification evidence covering the cause and affected paths.

Only after that evidence is green may execution continue.

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

Do not repeatedly run large end-to-end workloads in hosted CI merely because they are available. Heavy performance PASS/FAIL belongs to the final target-machine acceptance defined by `.planning/PLAN.md` and `docs/TEST_STRATEGY.md`.

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

The core market-data boundary remains:

```text
authenticated provider page
→ validated complete U.S. snapshot
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB
→ Current / Detail-History / Scanner
```

Replay and order execution remain separate boundaries as defined by their durable contracts; they must not weaken this authority path.

## Security

Treat the repository as public-safe regardless of visibility.

Never commit credentials, cookies, authorization/session data, account identifiers, private browser state or raw authenticated captures. Use sanitized/synthetic fixtures only. Do not bypass browser/provider security mechanisms.

## Durable ownership

- `.planning/PLAN.md` — planning / S&T truth, including outcome, strategies/tactics, assumptions, necessity/sufficiency and leaf success evidence.
- `.planning/EXECUTION.md` — execution task/owner/status/dependency/result truth.
- `.planning/DECISIONS.md` — durable supporting product/architecture/security/verification/operational rationale and supersession history.
- `STATUS.yaml` — non-authoritative navigation/compatibility projection from current execution truth.
- `.planning/BACKLOG.md` — preserved backlog; not live execution authority.
- `docs/EXECUTOR_ROUTING.md` — target-owned executor context routing; read only the assigned task rows after ST Planner bootstrap.
- `docs/US_MIGRATION_AUDIT.md` + `docs/US_MIGRATION_FILE_MAP.md` — exhaustive imported-baseline migration audit.
- `docs/US_CONTRACT_REVIEW.md` — durable contract coherence review.
- `docs/PRODUCT_REQUIREMENTS.md` — what/why.
- `docs/PRODUCT_SPEC.md` — observable behavior.
- `docs/DATA_CONTRACT.md` — provider/data truth.
- `docs/TECHNICAL_SPEC.md` — architecture/schema contract.
- `docs/TEST_STRATEGY.md` — verification contract.
- `docs/SCANNER_SQL_GUIDE.md` — public Scanner schema/query guide.
- `docs/SOURCE_EXTRACTION.md` / `docs/US_SOURCE_EVIDENCE.md` — migration provenance/evidence.
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` + `.planning/FINAL_ACCEPTANCE_EXECUTION.md` — exact final target-machine acceptance procedure/candidate/evidence state.
- project-specific audit/reclosure/preflight files under `.planning/` — historical or scoped evidence; not ST Planner runtime state unless a live PLAN/EXECUTION row explicitly points to them.

Do not duplicate live operational status in durable specs.

## Market Flow US executor routing

For numbered executor chats, after the ST Planner 2.0 bootstrap and `.planning/EXECUTION.md` ownership/dependency checks, read `docs/EXECUTOR_ROUTING.md` and load only the row(s) for the explicitly assigned task(s). This routing contract is target-owned and remains part of the project even though ST Planner 1.x handoff/runtime machinery is retired.
