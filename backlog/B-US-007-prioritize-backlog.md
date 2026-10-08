# B-US-007 — Prioritize and reconcile the backlog

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`

## Goal

Review every backlog item against fresh `main`, remove or supersede stale work, identify dependencies, and establish an explicit priority/order for the remaining backlog.

## Required outcome

- Re-read `backlog/README.md` and every backlog item from fresh `main`.
- Compare each item with current PLAN/EXECUTION, merged implementation, contracts and verification evidence.
- Mark items already satisfied by current `main` as completed/superseded or remove them from the active backlog while preserving useful historical provenance where appropriate.
- Identify duplicates or items that should be combined into one coherent future capability.
- Assign an explicit priority/order to the remaining backlog with short rationale.
- Record any real dependency edges separately from simple priority/order.
- Keep backlog items non-blocking until one is explicitly planned and allocated in `.planning/EXECUTION.md`.
- Update `backlog/README.md` so its summary, status and priority columns match the reconciled item files.

## Acceptance evidence

- Every backlog item has a fresh-main disposition.
- No known already-completed task remains presented as pending future implementation.
- Remaining tasks have explicit priorities and dependency notes where needed.
- `backlog/README.md` is consistent with the individual task files.
- No backlog item is accidentally treated as active execution authority.

## Non-goal

This task does not itself authorize implementation of the prioritized items. Any selected item still requires normal ST Planner planning/allocation before execution.
