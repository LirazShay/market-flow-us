# Market Flow US S&T State

This directory contains the durable S&T planning state and the minimal post-freeze execution allocation.

## Planner read order

1. project `AGENTS.md`
2. root `STATUS.yaml`
3. `.planning/STATUS.yaml`
4. `GOAL.md`
5. relevant `TREE.yaml` nodes
6. `DECISIONS.md` when needed
7. routed durable contracts/evidence
8. `REVIEWS.md` for prior review findings

The exhaustive imported-baseline audit lives in:

- `docs/US_MIGRATION_AUDIT.md`
- `docs/US_MIGRATION_FILE_MAP.md`

Whole-plan coverage is performed through the challenge questions in `FRAMEWORK.md` and recorded in `REVIEWS.md`; there is no separate legacy MASTER_COVERAGE/COVERAGE_MAP authority.

## Executor read order

1. project `AGENTS.md`
2. root `STATUS.yaml`
3. `.planning/STATUS.yaml`
4. `EXECUTOR_HANDOFF.md`
5. `EXECUTION.yaml`
6. only assigned `TREE.yaml` nodes/dependencies
7. only routed contract/test/code sections

## Ownership

- GOAL — stable U.S. migration outcome/boundary.
- TREE — S&T logic, planning status, dependencies and success evidence.
- DECISIONS — material resolved/open planning decisions.
- REVIEWS — S&T, whole-goal and Final Planning Review evidence.
- STATUS — small planning resume pointer and active/frozen state.
- EXECUTION — after freeze: numbered chat allocation and execution state/result for leaf IDs.
- EXECUTOR_HANDOFF — fresh-chat authorization/read-order/context-routing contract.

## Rules

- Production implementation is forbidden while `plan_state: active`.
- The whole intended plan must pass Final Planning Review before `plan_state: frozen`.
- Freeze happens before execution allocation.
- After freeze, assign every implementation-ready leaf exactly once in EXECUTION.
- Do not duplicate Strategy/Tactic/task descriptions in EXECUTION.
- Execution dependencies remain only in TREE `depends_on`.
- If implementation discovers a material planning defect, follow FRAMEWORK execution-reopen rules and preserve valid completed work.
