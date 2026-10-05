# Market Flow US Planning

This directory is the durable planning/execution source of truth for the Market Flow US conversion.

## Read order

Planning/review:

```text
../AGENTS.md
→ ../STATUS.yaml
→ STATUS.yaml
→ GOAL.md
→ only the current TREE nodes and routed contracts/evidence
```

Execution after freeze:

```text
../AGENTS.md
→ ../STATUS.yaml
→ STATUS.yaml
→ EXECUTOR_HANDOFF.md
→ EXECUTION.yaml
→ assigned TREE nodes + dependencies
→ only routed contracts/tests/code
```

## Ownership

- `GOAL.md` — stable product/migration goal.
- `TREE.yaml` — Strategy & Tactic logic, dependencies and leaf success evidence.
- `DECISIONS.md` — material resolved planning decisions.
- `REVIEWS.md` — necessity/sufficiency/KISS, final planning and execution-reopen reviews.
- `STATUS.yaml` — planning state/current planning pointer.
- `EXECUTION.yaml` — numbered chat allocation and implementation state.
- `EXECUTOR_HANDOFF.md` — compact executor bootstrap/routing.
- `FRAMEWORK.md` — planning/execution governance.
- `BACKLOG.md` — future candidate work only; backlog entries are **not** implementation authorization until promoted into TREE/EXECUTION.

## Current performance/storage contract

The current frozen contract is summarized by `D-US-011`, `D-US-020`, `D-US-021`, `D-US-022` and review `R-US-EXEC-REOPEN-004`:

```text
hosted CI = correctness-first + small performance sanity
configurable synthetic generator = shared Fake Market/load source
component performance = isolate the relevant layer
heavy performance authority = final target-machine acceptance
active market DB = one trading day; archive/reset between days
```

Do not infer old `4096 × 180 must pass in GitHub CI` semantics from historical review text. TREE + current decisions/tests own the active definition.

## Backlog rule

Future ideas discovered during execution belong in `BACKLOG.md` when they are useful but not authorized by the current frozen TREE.

A future planner must review backlog items explicitly and either:

```text
promote into TREE/contracts
or
leave them deferred
```

Executors must not implement a backlog item merely because it exists.

GitHub `main` remains the source of truth between chats; open branches/PRs are work in progress until merged.
