# Project S&T State

This directory contains the durable planning state and the minimal post-freeze execution allocation.

## User-facing planning command

Normal usage from a planning chat can be as short as:

> תתכנן לי בשיטת S&T Planner לפי הריפו: <מה אני רוצה להשיג>

or:

> Plan this with S&T Planner using the repository: <desired outcome>

The project `AGENTS.md` owns the automatic behavior behind this command. The user should not need to name these files or repeat the framework procedure.

## Planner read order

1. `FRAMEWORK.md`
2. `STATUS.yaml`
3. `GOAL.md`
4. relevant `TREE.yaml` nodes
5. `DECISIONS.md` when needed
6. `REVIEWS.md` when needed
7. before Final Planning Review/freeze: `LEGACY_COMPLETENESS_AUDIT.md` and `COVERAGE_MAP.yaml`

## Executor read order

1. project `AGENTS.md`
2. root `STATUS.yaml`
3. `.planning/STATUS.yaml`
4. `EXECUTOR_HANDOFF.md`
5. `EXECUTION.yaml`
6. only assigned `TREE.yaml` nodes/dependencies
7. only routed contract sections

## Ownership

- GOAL — stable goal boundary.
- TREE — S&T logic, planning status, dependencies, success evidence.
- DECISIONS — material open questions and decisions.
- REVIEWS — planning review history.
- LEGACY_COMPLETENESS_AUDIT — dedicated pre-freeze second-pass Market Flow migration + outside-in evidence.
- COVERAGE_MAP — exhaustive MASTER_COVERAGE ID → durable owner / S&T-node mapping.
- STATUS — small planning resume pointer and active/frozen state.
- EXECUTION — after freeze only: numbered chat allocation + execution state/result for leaf node IDs.
- EXECUTOR_HANDOFF — fresh-chat authorization/read-order/context-routing contract.

## Important

- One planning chat is preferred.
- New planning chats are optional continuation only.
- Do not implement while `plan_state: active`.
- If execution reopens planning after implementation has begun, use `replan_mode: execution_reopen`: preserve valid code/done nodes/allocation, block the affected node, allow no `in_progress` execution, and repair only the affected planning area.
- The whole intended plan must pass Final Planning Review before `plan_state: frozen`.
- After freeze, assign every implementation-ready leaf exactly once in EXECUTION.
- Do not duplicate Strategy/Tactic/task descriptions in EXECUTION.
- Execution dependencies remain in TREE -> depends_on.
