# Project S&T State

This directory contains the current S&T planning-cycle state, installed framework/tooling, and the minimal post-freeze execution allocation.

The same installation is reused sequentially for later project/release/feature/change scopes. V1 allows one active S&T cycle per repository.

## Framework freshness

Before new S&T planning work or a numbered executor bootstrap, run:

```text
node .planning/check-framework-update.mjs
```

The installed framework identity is in `.planning/ST_PLANNER_INSTALL.json`.

- current version — continue;
- newer `recommended` release — tell the user the available version/summary and continue unless upgrade is chosen;
- newer `required` release — do not start new S&T planning/execution until an explicit framework upgrade is completed and the checker reports current;
- update check unavailable — say freshness could not be verified and continue from the installed framework without claiming it is current.

Framework upgrade is separate from cycle reset. It may refresh framework-managed files only and must never overwrite current-cycle state (`GOAL.md`, `TREE.yaml`, `DECISIONS.md`, `REVIEWS.md`, `STATUS.yaml`, `EXECUTION.yaml`).

## User-facing planning command

Normal usage from a planning chat can be as short as:

> תתכנן לי בשיטת S&T Planner לפי הריפו: <מה אני רוצה להשיג/לבנות/לשנות>

or:

> Plan this with S&T Planner using the repository: <desired outcome/change>

The scope may be a project, release, feature, migration, refactor, architecture change, or another meaningful change. The user should not need to classify it, name these files, or repeat the framework procedure.

The planner should keep the user-facing transition equally simple. Once the plan is frozen, allocation/handoff checks pass, and implementation is authorized, tell the user explicitly:
- that planning is ready for execution;
- how many executor chats were allocated;
- which executor chat(s) are runnable now based on `TREE.yaml -> depends_on` and current `EXECUTION.yaml` states;
- the preferred next action: start one of those Chat N executors explicitly, normally in a fresh conversation for clean context.

Preferred startup:

> אני צאט N תתחיל

Established explicit forms such as `אני צ'אט מספר N` / `I am chat N` remain valid.

Do not hard-code Chat 1 unless Chat 1 is actually runnable. If several chats can start in parallel, tell the user which ones can be opened independently. Do not make the user inspect YAML to discover whether planning is ready or what can run.

Chat allocation is not chat activation. Target-owned `current_chat/current_node` fields are projections/navigation aids, not executor identity and not S&T execution authority. Runnable work is derived from `TREE.yaml` dependencies plus `.planning/EXECUTION.yaml`.

After a `SEQUENCE_RUNNER_NEW_CHAT` handoff, a generic `תמשיך לשלב הבא` / `continue` in the old conversation must not silently become the next executor. A fresh conversation is recommended, but if the user explicitly sends `אני צאט N תתחיל` in the same conversation, it may intentionally re-bootstrap that allocated executor after fresh authorization/allocation/dependency checks.

After Cycle Closure Review reaches `completed`, tell the user explicitly that this scope is closed and that a later scope can be requested with the normal short S&T Planner command. If the cycle becomes `abandoned`, say that it was closed without claiming the planned outcome succeeded.

## Planner read order

1. run `check-framework-update.mjs` and resolve a required framework update
2. project `AGENTS.md` and its routing/source-of-truth rules
3. `FRAMEWORK.md`
4. `.planning/STATUS.yaml`
5. `GOAL.md`
6. relevant `TREE.yaml` nodes
7. `DECISIONS.md` when needed
8. `REVIEWS.md` when needed

Before replacing current-cycle state, inspect `STATUS.yaml -> cycle_state`:
- `active` — resume/replan the current cycle; do not erase it merely because another request arrived;
- `completed` / `abandoned` — a new independent cycle may start after terminal review/evidence is durably preserved.

## Efficient deep planning

S&T depth is non-negotiable. Every material decision must still be challenged and justified, and every required branch must still pass necessity, sufficiency, implementation-readiness, whole-plan coverage, and Final Planning Review.

Efficiency comes from **ordering and batching the same deep reasoning**, not from skipping it:

1. **Map first** — before deep decomposition, make a short structural map of the current scope: outcome/boundary, material questions and decisions, dependencies between those questions, material evidence still needed, and likely major tree areas. The map is orientation only; it approves nothing.
2. **Prove second** — work through coherent planning slices and perform full S&T reasoning for every material tactic/decision in the slice. Existing patterns are evidence/candidates only; they never justify a choice by themselves.
3. **Persist once** — once a decision is justified, record its durable rationale in the normal planning artifacts. Do not reopen the same reasoning merely for reassurance unless new evidence, a contradiction, a changed assumption, or a review finding can materially change it.
4. **Batch mechanics** — avoid a full read/edit/status/review cycle after every small edit. Apply related changes together and use deterministic validation for deterministic checks where practical.
5. **Review coherently** — correct obvious defects while authoring, but run the meaningful multidimensional review on a coherent slice or completed subtree. Re-review only the affected logic after a concrete finding. Whole-plan outside-in coverage and Final Planning Review remain mandatory.

This is not a QUICK/DEEP mode. The standard of proof is unchanged; only repeated reasoning and planning ceremony are reduced.

## Executor read order

1. run `check-framework-update.mjs` and resolve a required framework update
2. project `AGENTS.md` and its routing/source-of-truth rules
3. `EXECUTOR_HANDOFF.md`
4. `CI-RCA-POLICY.md`
5. establish the explicitly requested Chat N executor context; generic continue is not startup
6. `.planning/STATUS.yaml` — require `cycle_state: active`, `plan_state: frozen`, and `implementation_authorized: true`
7. `EXECUTION.yaml` — confirm Chat N allocation/state
8. only assigned `TREE.yaml` nodes for Chat N
9. dependency states from EXECUTION
10. derive runnable work from TREE + EXECUTION (`execution-guidance.mjs` when useful)
11. only referenced/materially required decisions, ancestor reasoning, and target-project context

A differing target-owned current pointer is advisory; it does not activate another identity and does not by itself block safe assigned work.

## CI warning/error gate

Every CI warning or error pauses progression until the RCA in `CI-RCA-POLICY.md` is closed. A local symptom fix or green rerun alone is not enough. The executor must establish root cause, why prevention/detection failed, reusable recurrence prevention, materially analogous areas at risk, and closing verification evidence, and must explicitly tell the user that progression is paused for this RCA.

## Ownership

### Installed/stable framework material

- `README.md` — this installed state/read-order map.
- `FRAMEWORK.md` — portable S&T planning/execution/cycle contract.
- `EXECUTOR_HANDOFF.md` — stable executor bootstrap/read-order and handoff-verification contract; never task content.
- `CI-RCA-POLICY.md` — mandatory root-cause/recurrence/analogous-area procedure for every CI warning/error.
- `ST_PLANNER_INSTALL.json` — installed framework version/provenance.
- `check-framework-update.mjs` — detects newer source framework releases.
- `executor-authority.mjs` — executable reference for explicit activation/re-bootstrap vs accidental rollover; framework tooling, not project state.
- `execution-guidance.mjs` — derives canonical runnable work from TREE + EXECUTION and classifies target-pointer drift as advisory unless authoritative execution itself is invalid.
- `validate-allocation.mjs` — portable mechanical validator for TREE/EXECUTION allocation invariants; framework tooling, not project state.
- `verify-freeze-baseline.mjs` — portable freeze no-drift verifier for the reviewed material baseline; framework tooling, not project state.
- project `AGENTS.md` S&T rules — installed behavior contract.

### Current-cycle state

- `GOAL.md` — stable boundary of the current planning scope.
- `TREE.yaml` — S&T logic, planning status, dependencies, success evidence.
- `DECISIONS.md` — material open questions and decision history for the current cycle.
- `REVIEWS.md` — planning/replanning/handoff/closure review history for the current cycle.
- `.planning/STATUS.yaml` — cycle lifecycle, active/frozen planning state, planning resume pointer, and explicit implementation-authorization gate.
- `EXECUTION.yaml` — after freeze: authoritative numbered-chat allocation + execution state/result for leaf node IDs.

Conversation executor identity is intentionally **not** stored as repository execution state. It is established by explicit startup/re-bootstrap in the conversation.

## Cycle lifecycle

`STATUS.yaml` separates:

```yaml
cycle_state: active | completed | abandoned
plan_state: active | frozen
implementation_authorized: false | true
```

- `cycle_state: active` means the current scope is still being planned, executed, or verified.
- `cycle_state: completed` means Cycle Closure Review proved the integrated root outcome.
- `cycle_state: abandoned` means the scope was intentionally closed without claiming root success.
- completed/abandoned cycles must have `implementation_authorized: false`.

Freeze is not completion. All leaves being `done` is also not automatically completion; root/current-scope evidence must still pass Cycle Closure Review.

## Starting a later cycle

A later scope does not reinstall S&T Planner.

Only after the previous cycle is `completed` or `abandoned` with terminal evidence durably preserved, reset the six current-cycle files:

- `GOAL.md`
- `TREE.yaml`
- `DECISIONS.md`
- `REVIEWS.md`
- `STATUS.yaml`
- `EXECUTION.yaml`

Keep the installed framework/tooling and project `AGENTS.md` rules.

Start the new STATUS as:

```yaml
cycle_state: active
plan_state: active
implementation_authorized: false
```

Git/repository history preserves previous cycle reasoning. Any decision/contract that future cycles must obey belongs in the target project's durable source of truth before closure; do not use old cycle-local DECISIONS as a permanent architecture registry.

Do not create `.planning/archive/`, plan-version registries, or parallel active cycle directories by default.

## Important

- One planning chat is preferred; later planning chats are continuation only.
- V1 allows one active S&T cycle per repository.
- Run the framework freshness checker before new planning/execution; a required framework release blocks new S&T work until explicit upgrade.
- Framework upgrades never overwrite the six current-cycle state files.
- Do not implement while `cycle_state` is terminal or `plan_state: active`.
- The whole intended plan must pass Final Planning Review before `plan_state: frozen`.
- `plan_state: frozen` does **not** authorize implementation.
- Keep `implementation_authorized: false` while post-freeze allocation/handoff checks are being completed.
- Execution requires `cycle_state: active`, `plan_state: frozen`, `implementation_authorized: true`, valid allocation, and satisfied dependencies.
- `EXECUTION.yaml` + TREE dependencies are execution authority; target current pointers are projections.
- Target pointer drift should normally warn/repair, not stop development by itself.
- Generic continue never activates a different Chat N implicitly.
- Every CI warning/error requires RCA closure before further progress.
- After handoff, explicit Chat N startup may intentionally re-bootstrap in the same conversation when repository authority confirms it.
- After freeze, assign every implementation-ready leaf exactly once in EXECUTION.
- Before first authorization run `node .planning/validate-allocation.mjs --initial`. Authoritative validation failures block authorization.
- Use `--serial-chats` only when the target explicitly treats numbered chats as a serial execution order.
- After replanning with preserved execution state, validate with `--resume`.
- After all required work is done, run Cycle Closure Review before marking the cycle completed.
- A target repository's root `STATUS.yaml`, phase, release state, `current_chat`, or workstream status is target-owned and is never an alias for `.planning/STATUS.yaml`, EXECUTION authority, or conversation identity.
- Do not duplicate Strategy/Tactic/task descriptions in EXECUTION.
- Execution dependencies remain in TREE -> depends_on.
