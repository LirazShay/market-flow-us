# Executor Handoff Bootstrap

This file is the portable entry contract for executor conversations.

It explains **how to resume execution from repository state only**. It does not duplicate task content from `TREE.yaml` or allocation/state from `EXECUTION.yaml`.

## Framework freshness gate

Before starting or resuming S&T execution, run:

```text
node .planning/check-framework-update.mjs
```

- if it reports the installed framework is current, continue;
- if it reports a newer `recommended` release, surface the version/summary to the user and continue unless an upgrade is chosen;
- if it reports a newer `required` release, do not start new S&T planning/execution work until the explicit framework upgrade is completed and the checker reports current;
- if network access is unavailable, report that freshness could not be verified and continue from the installed framework rather than claiming it is current.

Framework upgrade is an explicit operation. It may replace only framework-managed files and must never overwrite active cycle state (`GOAL.md`, `TREE.yaml`, `DECISIONS.md`, `REVIEWS.md`, `STATUS.yaml`, `EXECUTION.yaml`). See `.planning/ST_PLANNER_INSTALL.json` and the source `docs/FRAMEWORK-UPDATES.md`.

## Authorization gate

Before reading implementation details, read `.planning/STATUS.yaml`.

Execution is allowed only when all three values in **`.planning/STATUS.yaml`** are satisfied:

```yaml
cycle_state: active
plan_state: frozen
implementation_authorized: true
```

If any condition is false:

- do not start or mark any node `in_progress`;
- do not improvise missing planning;
- report the repository-visible reason execution is unavailable.

A `completed` or `abandoned` cycle is terminal and cannot execute even if stale planning/execution data remains in the repository. Terminal cycles must have `implementation_authorized: false`.

## Execution authority vs project projections

For executor work, authoritative state is:

1. `.planning/EXECUTION.yaml` for chat allocation and node execution state;
2. `TREE.yaml -> depends_on` for execution prerequisites;
3. `.planning/STATUS.yaml` for cycle/planning/implementation authorization.

A target repository may also keep `STATUS.yaml`, `current_chat`, `current_node`, phase pointers, dashboards, or other human/tooling projections. Those are **not peer execution authorities** for S&T Planner.

Use `.planning/execution-guidance.mjs` as the executable reference for deriving runnable chats/nodes from `TREE.yaml + EXECUTION.yaml`.

If a target-owned current pointer differs from the derived runnable state:

- diagnose it as projection drift;
- repair or regenerate the projection when useful;
- do not let that mismatch alone stop otherwise-safe implementation;
- never mutate authoritative EXECUTION merely to make a projection look right.

A hard stop is reserved for genuinely unsafe authority problems such as disabled implementation authorization, an unallocated executor, invalid/duplicate allocation, broken dependency state, or another contradiction inside authoritative S&T state.

## Conversation identity — allocation is not activation

Repository allocation and conversation identity are separate concepts.

A numbered executor becomes active in a conversation only after an explicit startup message, for example:

```text
אני צאט 17 תתחיל
```

Established forms such as `אני צ'אט מספר 17` / `I am chat 17` also count as explicit startup.

A generic continuation such as:

```text
תמשיך לשלב הבא
continue
next
```

is never enough to activate a different executor merely because repository state or a target pointer now mentions that chat.

While an executor is actively working before a handoff boundary, do not switch that conversation to another Chat N. Finish/handoff the current executor first.

### After a handoff

A `[[SEQUENCE_RUNNER_NEW_CHAT]] ... [[/SEQUENCE_RUNNER_NEW_CHAT]]` handoff means:

- the current executor scope has ended;
- a fresh conversation is **recommended** for focus and clean context;
- a generic `continue` in the old conversation must **not** silently adopt the next chat;
- the user is not forced to open a new conversation if they prefer continuity.

If, after handoff, the user explicitly sends a valid startup such as:

```text
אני צאט 18 תתחיל
```

then the same conversation may intentionally **re-bootstrap** Chat 18, but only after fresh repository checks confirm implementation authorization, Chat 18 allocation, and its runnable dependencies. Treat this as a new executor bootstrap, not as implicit identity mutation.

Therefore the accidental case remains prevented:

```text
Chat 17 handoff emitted
repo/project pointer moves to Chat 18
user: תמשיך לשלב הבא
```

Result: do not execute Chat 18 implicitly. Recommend the startup command. If the user explicitly starts Chat 18, re-bootstrap it safely.

`.planning/executor-authority.mjs` is the executable reference for these semantics.

## Executor read order

For an explicit Chat N startup or re-bootstrap:

1. read target `AGENTS.md` and its routing/source-of-truth rules;
2. read this `.planning/EXECUTOR_HANDOFF.md`;
3. run `.planning/check-framework-update.mjs` and resolve any required framework update;
4. establish the explicitly requested conversation executor identity N;
5. read `.planning/STATUS.yaml` and confirm the authorization gate;
6. read `.planning/EXECUTION.yaml` and confirm Chat N is allocated;
7. read only Chat N's assigned `TREE.yaml` leaves and their `depends_on` prerequisites;
8. derive runnable work from authoritative TREE/EXECUTION state, not a target `current_chat` projection;
9. load only decisions/specs/code/tests materially required by the assigned runnable work, using the Market Flow US routing appendix below.

Do not preload all planning history or the whole repository.

## Determine what can run

For each assigned node:

- if its state is `pending` or `in_progress` and every `depends_on` node is `done`, it is runnable;
- if any prerequisite is not `done`, leave a pending node pending;
- an unmet dependency is not itself a blocker state;
- a `blocked` node is not runnable;
- independent chats may be runnable at the same time; chat numbering does not itself create serial order.

If no assigned node is available, report the exact prerequisite/blocker. Do not advance target pointers or EXECUTION merely to satisfy the requested chat number.

## Context routing

The target repository remains authoritative for its own implementation rules and product/technical contracts.

Use this order:

1. target `AGENTS.md` / project routing rules;
2. the assigned S&T node, ancestor reasoning needed to understand why it exists, and materially relevant decisions;
3. directly relevant target specs/code/tests routed below;
4. history or unrelated areas only when a concrete uncertainty requires them.

An external/reference/source repository is read-only context unless the target repository explicitly says otherwise or the assigned node explicitly requires changing it.

Do not copy Strategy/Tactic text into this handoff file.

## Market Flow US contract routing

This target-specific appendix preserves the repository's narrow context-loading contract while keeping allocation and task content authoritative in `TREE.yaml` / `EXECUTION.yaml`.

| Node | Primary durable truth |
|---|---|
| `1.*` acquisition | DATA_CONTRACT, PRODUCT_SPEC, TECHNICAL_SPEC provider/Recorder, TEST_STRATEGY |
| `2.*` market schema/authority | DATA_CONTRACT, TECHNICAL_SPEC schema/persistence, TEST_STRATEGY |
| `3.*` reads/Viewer | PRODUCT_REQUIREMENTS, PRODUCT_SPEC, TECHNICAL_SPEC reads, TEST_STRATEGY |
| `4.1`–`4.2` Scanner | PRODUCT_REQUIREMENTS Scanner, PRODUCT_SPEC Scanner, TECHNICAL_SPEC Scanner, SCANNER_SQL_GUIDE, TEST_STRATEGY |
| `4.3.1` Demo Buy schema | DEMO_BUY_VALIDATION §§5,10,16; DEMO_BUY_PROTOCOL_LIMITS; DATA_CONTRACT v4; TECHNICAL_SPEC schema; TEST_STRATEGY migration/context |
| `4.3.2` capture authority | DEMO_BUY_VALIDATION §§3–9; DEMO_BUY_PROTOCOL_LIMITS; DECISIONS D-US-026/027/031; TECHNICAL_SPEC protocol/capture; TEST_STRATEGY capture/lost-ACK |
| `4.3.3` evaluation/read model | DEMO_BUY_VALIDATION §§7,11–13; DEMO_BUY_PROTOCOL_LIMITS watermark; TECHNICAL_SPEC Demo Buy reads; TEST_STRATEGY read/evaluation; AGENTS SQL preflight |
| `4.4.1` Scanner Demo Buy UX | DEMO_BUY_UX Scanner/Auto/Stop; PRODUCT_REQUIREMENTS; PRODUCT_SPEC; TEST_STRATEGY browser model |
| `4.4.2` Demo Buy surface | DEMO_BUY_UX outcome/refresh/errors; PRODUCT_REQUIREMENTS; PRODUCT_SPEC; TEST_STRATEGY Browser E2E |
| `4.5.1` AI exporter | AI_INVESTIGATION_PACK; DEMO_BUY_PROTOCOL_LIMITS; DATA_CONTRACT; TECHNICAL_SPEC exporter; TEST_STRATEGY AI unit/service |
| `4.5.2` AI UX | DEMO_BUY_UX investigation/export/clipboard; AI_INVESTIGATION_PACK; PRODUCT_SPEC; TEST_STRATEGY Chromium |
| `5.*` Fake Market/E2E | TEST_STRATEGY Fake Market/Browser, DATA_CONTRACT, PRODUCT_SPEC runtime |
| `6.1` packaging | TECHNICAL_SPEC files/artifacts, build/launcher/docs tests |
| `6.2` diagnostics/live | AGENTS diagnosability, TECHNICAL_SPEC diagnostics/live, TEST_STRATEGY authenticated gates |
| `6.3` workload | TEST_STRATEGY workload, TECHNICAL_SPEC performance, shared generator, AGENTS SQL preflight |
| `7.1`–`7.3` historical closure | TREE evidence + existing release/local acceptance contracts |
| `7.4` final acceptance | TEST_STRATEGY target-machine/local Fake Leumi/Demo Buy/AI/order-sidecar/Replay/heavy workload/authenticated gates; exact audited/reclosed final candidate |
| `7.5` historical post-Demo-Buy reclosure | Demo Buy/AI contracts + USER_GUIDE/SCANNER_SQL_GUIDE + historical deterministic gates |
| `7.6.*` pre-acceptance extension audit | PRE_ACCEPTANCE_CODE_AUDIT; BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE + SECURITY; MARKET_REPLAY + REPLAY_HARDENING; changed production/tests/launchers/shared seams |
| `8.1` local order authority | IBKR_ORDER_SERVICE §§1,3,5–8,10,14,17–18; IBKR_ORDER_SERVICE_SECURITY; PRODUCT_REQUIREMENTS §15; TECHNICAL_SPEC §§33–35,37,40–41; TEST_STRATEGY §§24–25,28 |
| `8.2` real CPGW lifecycle | IBKR_ORDER_SERVICE §§2,4,5,9,11–16; DECISIONS D-US-035/037/038; TECHNICAL_SPEC §§35–39; TEST_STRATEGY §§26–30 |
| `8.3` packaging/integration seam | IBKR_ORDER_SERVICE §§19–21; IBKR_ORDER_SERVICE_SECURITY §10; PRODUCT_SPEC/TECHNICAL_SPEC packaging; TEST_STRATEGY §§31–32 |
| `8.4` branch-8 reclosure | all IBKR order contracts + affected generic contracts + full required deterministic gates + PR/main/open-PR truth |
| `8.5` basic in-product BUY | BASIC_BUY_INTEGRATION; IBKR_ORDER_SERVICE; IBKR_ORDER_SERVICE_SECURITY; current Detail/service/launcher/order-sidecar tests/code; extension review |
| `9.1` Replay recorder/storage | MARKET_REPLAY recording/library sections; DATA_CONTRACT Replay recording projection; PRODUCT_REQUIREMENTS/PRODUCT_SPEC Replay; TEST_STRATEGY recorder/storage proof; existing ScreenerHulPaging3 validation seam |
| `9.2` portable recording format | MARKET_REPLAY portable/large-recording sections; DATA_CONTRACT portable format; TEST_STRATEGY file/export/source proof |
| `9.3` Player/time projection | MARKET_REPLAY playback/time/Pause/Resume sections; DATA_CONTRACT Replay time projection; D-US-042; TEST_STRATEGY player timing; existing ProducerBridge/shared protocol |
| `9.4` Replay Host/isolation | MARKET_REPLAY Stop/Seek/Host/Viewer sections; D-US-043/044; TEST_STRATEGY Stop/Seek/isolation/bootstrap; existing service `--db`/`--port`/`--allowed-origin` seams |
| `9.5` branch-9 reclosure | MARKET_REPLAY + affected generic PRODUCT/DATA/TECHNICAL/TEST contracts + focused Replay acceptance + materially affected broad gates + PR/main/open-PR truth |
| `9.6` Replay hardening | REPLAY_HARDENING; MARKET_REPLAY; extension review; existing Replay tests/code only as routed by the hardening contract |

TREE `success_evidence` remains the definition of done; this appendix is context routing only and must not duplicate allocation or execution state.

## Branch and verification behavior

Follow the target repository's existing Git, branch, PR, testing, and verification rules.

S&T Planner does not impose a branch/PR workflow when the target project does not have one.

Before marking a node `done`:

- execute within the assigned node's planned scope;
- verify its `success_evidence` using the target project's appropriate tests/inspection;
- write only a short result/evidence reference to `EXECUTION.yaml`.

## Mandatory CI warning/error RCA gate

If CI emits **any warning or error**, pause progression before the next implementation step and follow `.planning/CI-RCA-POLICY.md`.

A green rerun after changing the immediately failing line is not sufficient closure. The executor must establish:

1. what happened;
2. why it happened at root cause level;
3. why existing prevention/detection allowed it to reach CI;
4. the smallest reusable prevention/detection improvement;
5. materially analogous areas that may contain the same underlying weakness;
6. verification evidence that closes the original signal and every analogous instance found.

When reporting the incident to the user, explicitly say that progression is paused for RCA and that a local symptom fix alone is not considered closure. Only continue implementation after the RCA is closed.

## Completion transition and projections

Node completion is an authoritative EXECUTION transition.

The safe default is:

1. re-read authoritative execution state before writing;
2. confirm this chat still owns the node and prerequisites remain valid;
3. persist the node's `done` state + result in `.planning/EXECUTION.yaml`;
4. re-read/derive runnable work from `TREE + EXECUTION`;
5. update target-owned status/current projections only as secondary summaries when the target project requires them;
6. if a projection update fails or temporarily lags, report/repair it, but do not rewrite valid authoritative EXECUTION merely to match it.

When the available Git mutation path cannot safely keep several peer representations synchronized, prefer the framework design above: mutate the single authoritative EXECUTION state and derive secondary current/next information from it.

Do not intentionally create a process where correctness depends on committing `STATUS.current`, `.planning/STATUS.current_node`, and EXECUTION in a particular file-by-file order.

## User-facing completion handoff

After finishing all currently runnable work assigned to this chat and persisting authoritative `EXECUTION.yaml` state:

1. re-read `EXECUTION.yaml` and relevant TREE dependencies;
2. derive runnable chats/nodes (use `execution-guidance.mjs` when useful);
3. if this same chat still has another runnable assigned node, continue with it;
4. otherwise identify the other runnable executor chat ID(s);
5. recommend a fresh chat and emit the configured handoff when the surrounding workflow uses it;
6. provide the exact startup command, e.g. `אני צאט 3 תתחיל`;
7. if the user prefers to stay in the same conversation, require that explicit startup before re-bootstrap; never treat generic `continue` as the next executor startup;
8. if several independent chats are runnable, say so instead of manufacturing serial order;
9. if no pending chat is runnable, state the exact dependency/blocker;
10. if all required execution leaves are `done`, do **not** infer `cycle_state: completed`. Direct the user to Cycle Closure Review.

Never require the user to inspect YAML to choose the next action.

## Planning defect discovered during execution

If implementation reveals a material planning gap or contradiction:

1. stop the affected node;
2. mark it `blocked` with a short factual reason in `.planning/EXECUTION.yaml`;
3. keep `.planning/STATUS.yaml -> cycle_state: active`;
4. set `.planning/STATUS.yaml -> plan_state: active`;
5. set `.planning/STATUS.yaml -> implementation_authorized: false`;
6. stop starting new execution work;
7. return the smallest affected S&T area to planning.

Do not redesign the plan inside an executor chat.

After correction, re-freeze alone is not enough. Record the corrected reviewed baseline, pass freeze no-drift verification again, run allocation validation in `--resume` mode, rerun the required execution/handoff verification, and only then explicitly restore implementation authorization.

## Mandatory execution/handoff verification before authorization

After allocation, first require a clean mechanical allocation validation:

```text
node .planning/validate-allocation.mjs --initial
```

Use `--resume` when re-authorizing after execution/replanning, and add `--serial-chats` only when numbered chats are explicitly serial.

Then simulate representative executor behavior from repository state.

Verify:

1. **first available executor** — explicit startup finds its assignment and runnable work;
2. **dependency-blocked executor** — identifies unmet prerequisites without mutating state;
3. **parallel availability** — independent chats may both be reported runnable;
4. **projection drift** — target `current_chat/current_node` differs from derived TREE/EXECUTION state; result is warning/repair guidance, not a framework execution blocker by itself;
5. **old-conversation accidental rollover** — Chat N emits handoff, a target pointer moves to N+1, then generic `continue` is sent in the same conversation; N+1 is not bootstrapped or mutated;
6. **explicit post-handoff re-bootstrap** — after the same handoff, explicit `אני צאט N+1 תתחיל` may activate N+1 in the same conversation when allocation/authorization/dependencies permit;
7. **fresh-conversation activation** — explicit Chat N startup in a fresh conversation works from repository truth alone;
8. **invalid authority** — unallocated chat, invalid allocation, disabled authorization, or unmet dependency remains fail-closed;
9. **final implementation completion** — no runnable executor is invented after all required leaves are done; transition goes to Cycle Closure Review.

Warnings such as target projection drift do **not** keep implementation unauthorized. Only failed authoritative allocation/authorization/dependency/context checks do.

Record the verification result in `.planning/REVIEWS.md`.
