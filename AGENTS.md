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
- `.planning/EXECUTOR_HANDOFF.md` — executor routing.
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

<!-- st-planner:rules:v2 -->
# S&T Framework Rules

## Framework freshness

At the start of any S&T planning request or numbered executor bootstrap, run:

```text
node .planning/check-framework-update.mjs
```

If the checker reports the installed framework is current, continue normally. If it reports a newer `recommended` release, tell the user the installed/latest versions and summary, then continue unless an upgrade is chosen. If it reports a newer `required` release, do not start new S&T planning/execution work until an explicit framework upgrade is completed and the checker reports current. If freshness cannot be checked because network access is unavailable, say so and continue from the installed framework without claiming it is current.

A framework upgrade may replace only framework-managed instruction/tooling files. It must never overwrite active cycle state: `.planning/GOAL.md`, `.planning/TREE.yaml`, `.planning/DECISIONS.md`, `.planning/REVIEWS.md`, `.planning/STATUS.yaml`, or `.planning/EXECUTION.yaml`.

## One-command planning trigger

When the user asks to plan using **S&T Planner** (including natural variants such as "ST Planner", "S T Planner", or "תתכנן לי בשיטת S&T Planner לפי הריפו"), treat that request as the complete planning command.

The requested planning scope may be a whole project/initiative or a meaningful scope inside an existing system, such as a release, feature, migration, refactor, architectural change, or other substantial change. Use the same S&T logic at every scale; do not require the user to classify the scope.

The user does **not** need to explain the framework workflow, name planning files, choose a number of stages, or paste a special starter prompt.

On that trigger, automatically:

1. Run `.planning/check-framework-update.mjs` and resolve any required framework update before new planning work.
2. Read the repository's existing `AGENTS.md` / routing / source-of-truth rules.
3. Read `.planning/README.md`, `.planning/FRAMEWORK.md`, and `.planning/STATUS.yaml`.
4. Inspect `.planning/STATUS.yaml -> cycle_state` before changing current-cycle planning state:
   - `active`: resume/replan the current cycle when the request belongs to the same intended scope; never erase it merely because a new request arrived;
   - `completed` or `abandoned`: a later independent scope may start a new cycle after the terminal review/snapshot is durably preserved;
   - V1 has one active S&T cycle per repository. If a genuinely independent new scope is requested while another cycle is still active, do not silently reset or create parallel cycle state. The current cycle must first be completed or explicitly abandoned, unless the new request is incorporated into/reframes that same cycle.
5. When starting a permitted new cycle, preserve installed framework/tooling and the S&T `AGENTS.md` rules, but reset only current-cycle state (`GOAL.md`, `TREE.yaml`, `DECISIONS.md`, `REVIEWS.md`, `STATUS.yaml`, `EXECUTION.yaml`). Start with `cycle_state: active`, `plan_state: active`, `implementation_authorized: false`. Use repository history for prior-cycle audit; do not create an archive tree by default.
6. Determine the requested planning scope from the user's request and current repository context. Do not invent a different scope or silently expand it to the whole project.
7. Separate the required outcome from any user-proposed feature, tool, technology, architecture, or implementation. Treat a proposed solution as a candidate tactic unless the user or an existing durable project contract explicitly makes it a fixed constraint/decision.
8. Use the repository's own context-loading rules and inspect only the workstream/component and files needed to understand the current reality and materially challenge the proposed scope/solution.

Before deep decomposition, create a **short structural map** of the current planning scope: the outcome/boundary, material questions and decisions that must be resolved, dependencies between those questions, material evidence still needed, and likely major tree areas. This is orientation only. It must not approve a tactic, skip a decision, weaken necessity/sufficiency, or replace full S&T justification.

Plan the mapped work in **coherent planning slices**. Within each slice, perform the full S&T reasoning required for every material tactic/decision, persist the rationale in the normal planning artifacts, then validate/review the coherent slice. Do not force a complete read/edit/status/review cycle after every small edit. Once a material decision is justified and durably recorded, do not reopen the same reasoning merely for reassurance unless new evidence, a contradiction, a changed assumption, or a review finding could materially change it.

Existing project patterns, prior designs, or reusable mechanisms are evidence about current reality and candidate alternatives only. They are never sufficient justification by themselves; every material choice must still be justified for the current scope.

9. Update `GOAL.md` with the outcome boundary, established current reality, hard constraints, and non-goals.
10. Before accepting a material root or lower-level tactic, challenge why the objective is needed, why the tactic can achieve it, whether a materially plausible alternative would be preferable under the actual constraints, and what assumption/fact would invalidate the choice. Do this recursively at business, product, architecture, component, and technical levels as materiality requires; do not mechanically brainstorm alternatives for trivial choices.
11. Resolve ordinary local reasoning in TREE assumptions. Put only material unresolved questions/choices in `DECISIONS.md`; do not ask the user for facts/choices that can be established from repository context or reliable evidence. An open decision blocks a node only when continuing would require guessing or could create a materially different subtree.
12. **Default to informed planner autonomy.** The user is not an approval API. When the goal, constraints, repository evidence, and engineering/product tradeoffs are sufficient to choose responsibly, make the choice, record the rationale, and continue. Do not ask the user merely because several technically valid options exist. Prefer a reasonable reversible default for low-risk uncertainty. Ask only when the missing information is genuinely user-owned or when no responsible choice can be derived and different answers would materially change the plan. If a question is unavoidable, ask the smallest possible question, preferably with the planner's recommendation and the consequence of the choice; batch tightly related unknowns instead of interrogating the user one-by-one. Respect an explicit user request to "decide yourself" unless a truly user-owned decision remains.
13. Build the complete S&T tree in `TREE.yaml`. Features/releases are ordinary S&T nodes/subtrees, not special schema types. Do not create default folder/checklist branches such as Frontend / Backend / Database / Tests unless they are independently necessary outcomes. Alternatives are not simultaneous necessary children; keep only the selected active path in TREE.
14. Review/correct the plan as required by the framework, including tactic-choice validity, necessity, sufficiency, sibling-level coherence, assumption honesty, KISS, implementation readiness, whole-plan completeness, durable-contract vs live-status hygiene, and stale decision/investigation cleanup. Correct obvious defects while authoring, but interpret "review as you build" as local quality control, not as a mandate to rerun every review dimension after every edit. Run the meaningful multidimensional review on a coherent slice/subtree and rerun only affected logic after a concrete finding. Whole-plan outside-in coverage and Final Planning Review remain mandatory.
15. Record meaningful reviews in `REVIEWS.md` and keep `.planning/STATUS.yaml` current. Do not update lifecycle/status merely to mirror every technical edit; update it when planning state or the truthful resume point materially changes.
16. Do **not** implement target-project work while planning.
17. Continue planning until the complete intended plan passes Final Planning Review.
18. Record the reviewed baseline evidence in `.planning/REVIEWS.md`.
19. Verify that material planning files (`.planning/GOAL.md`, `.planning/TREE.yaml`, `.planning/DECISIONS.md`) have not drifted from that reviewed baseline. In Git workflows prefer `node .planning/verify-freeze-baseline.mjs --reviewed-ref <ref>`; after a merge/rebase/integration that creates a later frozen ref, verify again with `--frozen-ref <ref>`. If no stable Git ref exists, record equivalent evidence.
20. If drift exists, keep planning active, review the changed baseline again, and do not freeze.
21. Set `.planning/STATUS.yaml -> plan_state: frozen` while keeping `.planning/STATUS.yaml -> cycle_state: active` and `.planning/STATUS.yaml -> implementation_authorized: false`.
22. Populate `EXECUTION.yaml` by assigning every implementation-ready leaf exactly once to numbered executor chats.
23. Run `node .planning/validate-allocation.mjs --initial`; fix every authoritative allocation failure before continuing. Add `--serial-chats` only when the target explicitly uses serial numbered chats.
24. Run the mandatory execution/handoff verification from `.planning/EXECUTOR_HANDOFF.md`, including accidental old-conversation rollover, advisory target-pointer drift, explicit post-handoff re-bootstrap, and fresh-conversation activation; record the result in `REVIEWS.md`.
25. Fix any hard allocation/authorization/dependency/context-routing defect the verification exposes and rerun the failed case. Projection drift or other advisory warnings should be recorded/repaired when useful but do not by themselves keep implementation blocked.
26. Only after freeze no-drift, authoritative allocation validation, and execution/handoff gates pass set `.planning/STATUS.yaml -> implementation_authorized: true`. Freeze/allocation alone never authorize implementation.
27. After all required execution leaves are `done`, run the Cycle Closure Review from `REVIEWS.md`. Do not infer whole-scope success from leaf completion alone. Verify the root outcome after integration and promote any cross-cycle decision/contract into the target repository's durable source of truth.
28. On a passing closure set `cycle_state: completed` and `implementation_authorized: false`. If the scope is intentionally stopped without proving the root outcome, record abandonment instead and set `cycle_state: abandoned`, `implementation_authorized: false`. Do not label abandonment as completion.

Unless the user explicitly asks to stop earlier or work one stage per message, complete this planning workflow autonomously in the same planning conversation.

For long/tool-heavy work, provide concise periodic progress updates at meaningful boundaries: what is being checked now, what is already complete, what remains before this stage can close, and any meaningful discovery/blocker. Do not narrate every tool call or repeat status noise. If the user requested one stage per message, these updates do not advance the stage.

If the user's request does not contain enough information to identify what should be planned and the repository has no single unambiguous active target, ask only for the missing outcome/boundary—not for framework instructions.

## Execution rules

1. Run `node .planning/check-framework-update.mjs`; resolve any `required` framework update before new execution work.
2. Read the repository's existing `AGENTS.md`/routing rules first, then `.planning/README.md`, `.planning/FRAMEWORK.md`, `.planning/STATUS.yaml`, `.planning/EXECUTOR_HANDOFF.md`, and `.planning/CI-RCA-POLICY.md`.
3. Respect existing project context-loading/source-of-truth conventions; do not recursively preload the repository.
4. Treat `.planning/STATUS.yaml -> cycle_state` as the whole current-cycle lifecycle: `active | completed | abandoned`. V1 allows one active S&T cycle per repository.
5. Do not implement while `.planning/STATUS.yaml -> plan_state: active`.
6. Do not implement merely because `plan_state: frozen`; execution also requires `cycle_state: active` and `implementation_authorized: true`.
7. Execute directly from S&T leaves; do not create GitHub Issues merely to mirror S&T work.
8. `.planning/EXECUTION.yaml` is the authority for executor allocation and node execution state. `TREE.yaml -> depends_on` is the authority for execution prerequisites. `.planning/STATUS.yaml` owns lifecycle/planning/authorization, not a duplicate executor-current pointer.
9. Target-owned `STATUS.yaml`, `current_chat`, `current_node`, phase/workstream pointers, dashboards, or similar fields are **projections/navigation aids**. Derive runnable work from TREE + EXECUTION (use `.planning/execution-guidance.mjs` when useful). A target pointer mismatch is a warning/repair concern, not a framework blocker by itself and never a reason to rewrite authoritative EXECUTION merely to match the projection.
10. Hard-stop only for genuinely unsafe authority conditions: implementation not authorized, executor not allocated, invalid/duplicate allocation, broken authoritative dependency state, a real planning defect, or another contradiction that prevents determining safe assigned work.
11. Before first authorization run `node .planning/validate-allocation.mjs --initial`; before re-authorization after replanning use `--resume`. Add `--serial-chats` only when the target really uses serial chats.
12. **Chat allocation is not chat activation.** A numbered executor context starts only from an explicit message such as `אני צאט N תתחיל` (established forms `אני צ'אט מספר N` / `I am chat N` also count). A target `current_chat` pointer, `NEXT_CHAT_PROMPT`, `תמשיך לשלב הבא`, `continue`, or newly runnable allocation never changes executor identity implicitly.
13. While an executor is actively working before a handoff boundary, do not switch that conversation to another Chat N. Finish/handoff the current executor first.
14. A handoff recommends a fresh conversation but is not a permanent lock. After handoff, generic `continue` must not silently roll into the next executor. If the user explicitly sends `אני צאט N תתחיל`, the same conversation may intentionally re-bootstrap that allocated executor after fresh authorization/allocation/dependency checks pass.
15. When explicit startup requests Chat N, require the lifecycle authorization gate, confirm Chat N is allocated in EXECUTION, read only its assigned TREE leaves/context, and execute only nodes whose dependencies are done. A differing target-owned current pointer is advisory; do not adopt its ID automatically and do not block Chat N solely because of that pointer.
16. Before completing a node, re-read authoritative state, confirm this chat still owns the node, verify `success_evidence`, then persist `done` + short result in EXECUTION. Re-derive runnable work afterward. Do not depend on manually advancing several peer current-pointer files in a specific file-by-file order.
17. If target status/current projections are required, update or regenerate them as secondary summaries after authoritative EXECUTION is correct. If such a projection temporarily lags, diagnose/repair it without stopping unrelated safe development.
18. If the same chat still has another runnable assigned node, continue it. Otherwise recommend/emit handoff to other runnable chats. If several chats are independent, report them as parallel rather than manufacturing a serial order.
19. `NODE_COMPLETE`, chat-scope completion, implementation completion, and cycle completion are distinct. All execution leaves done means implementation work is complete; Cycle Closure Review is still required before `cycle_state: completed`.
20. If a material planning defect appears during execution, keep `cycle_state: active`, mark the affected node blocked with a factual reason, set `plan_state: active` and `implementation_authorized: false`, and stop starting new execution work until focused replanning/review/validation restores authorization.
21. Preserve `done` work across replanning only when its Strategy, evidence, and produced outcome remain valid under the corrected plan.
22. If implementation/offline proof is complete but required external live verification cannot factually run yet, keep that leaf `blocked` with passed/remaining evidence and the factual availability reason. Do not reopen planning unless the plan itself is wrong and do not block unrelated nodes.
23. After all required work is done, run Cycle Closure Review. `completed` requires integrated root-outcome proof; `abandoned` records an intentional stop without claiming success. Both terminal states require `implementation_authorized: false`.
24. Before terminal closure, promote any decision/contract that future cycles must obey into the target repository's durable source of truth; cycle-local DECISIONS is not a permanent architecture registry.
25. **Every CI warning or error is a mandatory RCA gate before progressing.** Do not stop at a local symptom fix or a green rerun. Follow `.planning/CI-RCA-POLICY.md`: establish what happened, the causal root, why prevention/detection failed, the reusable prevention, materially analogous areas that may share the same weakness, and closing evidence. Explicitly tell the user that progression is paused for RCA and that a local fix alone is not closure. Only continue after the RCA and analogous-area review are closed.
26. When CI/workflow validation logic becomes non-trivial, put it in a small versioned helper script and let the workflow call it; avoid large inline parsers/heredocs in YAML or shell.
27. For programmatic repository text edits, use literal-safe replacement, require expected source text before replacing, and reread the rendered file or full diff before PR/merge.
28. Follow the target repository's existing branch/PR/merge/post-merge verification rules when they exist. Do not impose GitHub Flow or PR ceremony when the target repository does not require it.
29. Prefer one planning chat; use repository state for durability and optional continuation.
