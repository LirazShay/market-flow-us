# Project S&T State

This directory contains the installed S&T Planner framework/tooling plus the current S&T cycle state. The same installation is reused for later project/release/feature/change scopes. V1 supports one active cycle per repository.

## 1. Framework freshness comes first

Before any new S&T planning request or numbered executor bootstrap, run:

```text
node .planning/check-framework-update.mjs
```

The installed identity/provenance lives in `ST_PLANNER_INSTALL.json`.

Interpret the checker literally:

- exit `0` + current — continue;
- exit `0` + recommended update — surface it and continue unless an upgrade is chosen;
- exit `2` — required source update/reconciliation; do not start new S&T planning/execution;
- exit `3` — installed framework/provenance is missing, damaged, malformed, or drifted; repair/upgrade first;
- source/network unavailable with exit `0` — local framework integrity passed, but source freshness is **unverified**; never claim current.

Before contacting the source, the checker validates locally that:

1. every framework-managed `.planning` file exists and matches the installed release integrity metadata;
2. the update checker itself is included in that managed integrity set;
3. the bounded S&T rules block inside root `AGENTS.md` occurs exactly once and matches the installed release;
4. install provenance is internally coherent.

Text integrity is canonicalized to `LF`, so an ordinary Windows `CRLF` checkout does not create false drift.

Framework upgrade is separate from cycle reset. It may refresh framework-owned instructions/tooling only and must never overwrite current-cycle state:

```text
GOAL.md
TREE.yaml
DECISIONS.md
REVIEWS.md
STATUS.yaml
EXECUTION.yaml
```

`ST_PLANNER_INSTALL.json` is special install metadata and is written last during upgrades; it is not a normal framework-managed replacement path.

Root `AGENTS.md` is not framework-owned wholesale. Only the bounded `st-planner:rules:v3:begin/end` block belongs to S&T Planner; target-native rules outside it must survive upgrades unchanged.

## 2. Normal user command

A planning request may be as short as:

> תתכנן לי עם S&T Planner לפי הריפו: <מה אני רוצה להשיג>

or:

> Plan this with S&T Planner using the repository: <desired outcome/change>

The user does not need to classify the scope, name planning files, or repeat the framework procedure.

A proposed feature/tool/technology/architecture is normally a candidate tactic, not automatically the goal. Determine the outcome it is meant to achieve and challenge the tactic unless the user or a durable target-project contract fixes it as a constraint.

## 3. Planner read order

1. freshness checker — resolve exit `2`/`3` before planning;
2. target root `AGENTS.md` and routing/source-of-truth rules;
3. this `README.md`;
4. `FRAMEWORK.md`;
5. `STATUS.yaml`;
6. `GOAL.md`;
7. only relevant TREE nodes/evidence;
8. `DECISIONS.md` / `REVIEWS.md` only as needed.

Do not recursively preload the repository. Load more context only when it can materially change the current goal/tree/decision/review.

## 4. Efficient deep planning

S&T depth is non-negotiable. Efficiency comes from ordering/batching the same rigorous reasoning, not from skipping it.

Use this flow:

1. **Map** — make a short structural map of the scope: outcome/boundary, material questions/decisions, dependencies between them, evidence still needed, likely major tree areas. This is orientation only and approves nothing.
2. **Prove** — work in coherent planning slices and fully justify each material Strategy/Tactic choice, including materially plausible alternatives and invalidating assumptions.
3. **Persist once** — record durable rationale in the normal planning artifacts. Do not reopen the same decision merely for reassurance unless new evidence/contradiction/changed assumptions/review findings can change it materially.
4. **Batch mechanics** — apply related edits/checks together; use deterministic validators for deterministic invariants.
5. **Review coherently** — local review as you build, then mandatory whole-plan outside-in coverage and Final Planning Review.

There is no QUICK/DEEP mode. The standard of proof is unchanged.

## 5. Planning completion and authorization

Planning is ready for execution only after the complete intended plan:

- is decision-complete to implementation-ready leaves;
- passes tactic validity, necessity, sufficiency, assumption honesty, KISS, and whole-plan coverage;
- passes Final Planning Review;
- records reviewed-baseline evidence;
- passes no-drift verification;
- is frozen while implementation remains unauthorized;
- allocates every implementation-ready leaf exactly once in `EXECUTION.yaml`;
- passes `node .planning/validate-allocation.mjs --initial` (add `--serial-chats` only when the target explicitly uses serial numbered chats);
- passes the repository-only handoff verification in `EXECUTOR_HANDOFF.md`;
- is then explicitly authorized via `STATUS.yaml -> implementation_authorized: true`.

Freeze is not authorization. Allocation is not authorization. All leaves done is not cycle completion.

## 6. Executor read order

1. freshness checker — resolve exit `2`/`3` before execution;
2. target root `AGENTS.md` / routing rules;
3. `EXECUTOR_HANDOFF.md`;
4. `CI-RCA-POLICY.md`;
5. establish the **explicitly requested** Chat N identity;
6. `STATUS.yaml` — require `cycle_state: active`, `plan_state: frozen`, `implementation_authorized: true`;
7. `EXECUTION.yaml` — confirm Chat N allocation/state;
8. only Chat N's assigned TREE leaves;
9. dependency states from `EXECUTION.yaml`;
10. only referenced/materially required decisions, ancestor reasoning, and target-project context.

A numbered executor starts only from an explicit request such as:

> אני צאט N תתחיל

or:

> I am chat N

Allocation, target `current_chat/current_node`, `NEXT_CHAT_PROMPT`, generic `continue`, or newly runnable work never changes conversation identity implicitly.

A handoff recommends a fresh conversation but is not a permanent lock. After handoff, generic `continue` must not silently become the next executor; explicit Chat N startup may intentionally re-bootstrap in the same conversation after fresh authority checks.

## 7. Execution authority

After freeze:

- `EXECUTION.yaml` is authoritative for numbered-chat allocation and node execution state;
- `TREE.yaml -> depends_on` is authoritative for execution prerequisites;
- `.planning/STATUS.yaml` is authoritative for cycle/planning/implementation authorization;
- target-owned root `STATUS.yaml`, `current_chat`, `current_node`, phase/workstream pointers, dashboards, or similar fields are projections/navigation aids only.

Projection drift should be diagnosed/repaired when useful. It does not by itself block otherwise-safe assigned work or redefine executor identity.

Hard-stop only for genuine authority problems: implementation not authorized, missing/unallocated executor, invalid/duplicate allocation, broken authoritative dependency state, material planning defect, or another contradiction that prevents determining safe assigned work.

## 8. CI warning/error gate

Every CI warning or error pauses progression until `CI-RCA-POLICY.md` is closed.

A local symptom fix or green rerun alone is not closure. Establish:

1. what happened;
2. causal root;
3. why prevention/detection failed;
4. reusable prevention/detection improvement;
5. materially analogous areas sharing the weakness;
6. closing evidence for original and analogous findings.

Tell the user explicitly that progression is paused for RCA and that a local fix alone is insufficient.

## 9. Ownership

### Framework-managed/stable material

- `README.md` — installed entry/read-order map.
- `FRAMEWORK.md` — portable S&T planning/execution/cycle contract.
- `EXECUTOR_HANDOFF.md` — executor bootstrap/handoff contract.
- `CI-RCA-POLICY.md` — mandatory CI RCA procedure.
- `check-framework-update.mjs` — local integrity + source freshness detector.
- `executor-authority.mjs` — explicit activation/re-bootstrap reference.
- `execution-guidance.mjs` — canonical runnable-work derivation.
- `validate-allocation.mjs` — TREE/EXECUTION allocation validator.
- `verify-freeze-baseline.mjs` — reviewed-baseline no-drift verifier.
- bounded root `AGENTS.md` S&T rules block — repository entry contract.

### Install metadata

- `ST_PLANNER_INSTALL.json` — installed version/source commit plus managed/root-rules integrity; written last during install/upgrade.

### Current-cycle project state — never overwritten by framework upgrade

- `GOAL.md`
- `TREE.yaml`
- `DECISIONS.md`
- `REVIEWS.md`
- `STATUS.yaml`
- `EXECUTION.yaml`

Conversation executor identity is intentionally not stored as repository state.

## 10. Cycle lifecycle

`STATUS.yaml` separates:

```yaml
cycle_state: active | completed | abandoned
plan_state: active | frozen
implementation_authorized: false | true
```

- `active` — current scope is still being planned/executed/verified;
- `completed` — Cycle Closure Review proved the integrated root outcome;
- `abandoned` — scope intentionally closed without claiming success.

Terminal cycles must have `implementation_authorized: false`.

A later independent cycle does not reinstall S&T Planner. After the previous cycle is terminal and durable cross-cycle contracts are promoted to the target project's normal source of truth, reset only the six current-cycle state files and start:

```yaml
cycle_state: active
plan_state: active
implementation_authorized: false
```

Use Git history for prior-cycle audit. Do not create an archive hierarchy or plan-version registry by default.

## 11. If execution exposes a planning defect

Keep the cycle active, block the affected node factually, set `plan_state: active`, revoke implementation authorization, stop starting new execution work, and reopen only the smallest affected S&T area.

Preserve previously `done` work only when its Strategy/evidence/outcome remains valid under the corrected plan. After focused re-review, repair only affected EXECUTION entries, re-freeze, validate with `--resume`, rerun handoff verification, and explicitly re-authorize before execution resumes.

## 12. Cycle closure

After all required execution leaves are done, run Cycle Closure Review. Verify the integrated root/current-scope outcome and promote durable cross-cycle decisions/contracts into the target project's normal source of truth.

Only then set:

```yaml
cycle_state: completed
implementation_authorized: false
```

If work stops without proving the root outcome, record `abandoned` instead of completion.
