# Market Flow US Backlog

This folder records future product/development work that is intentionally **not allocated in the active ST Planner execution map**.

Backlog items do not authorize implementation. Before implementation, each item must be reviewed against fresh `main`, planned into the smallest coherent PLAN leaves/contracts, dependency-reviewed, and explicitly allocated in `.planning/EXECUTION.md`.

Backlog items are **non-blocking by default**. A backlog item must not prevent unrelated planning, development, PRs, CI, or execution unless a later approved PLAN/EXECUTION dependency explicitly makes it blocking.

## Priority

There is currently **no approved backlog priority order**. Every item is `Unprioritized` until `B-US-007` is completed.

`B-US-000` is listed first only because the user explicitly requested the deferred final target-machine/provider acceptance to be the first backlog item. Its first position is **not** a dependency and does **not** block other work.

## Items

| Item | Summary | Status | Priority | Blocking |
|---|---|---|---|---|
| [B-US-000](B-US-000-final-target-machine-provider-acceptance.md) | Deferred target-machine/provider acceptance. When resumed, validate the latest intended runtime candidate from fresh `main`; do not freeze development behind an old SHA. | Backlog | Unprioritized | No |
| [B-US-001](B-US-001-file-backed-sql-authoring-library.md) | Make Scanner/query artifacts file-backed and AI-authorable instead of DuckDB-only. | Backlog | Unprioritized | No |
| [B-US-002](B-US-002-query-correctness-contract-tests.md) | Add executable correctness contracts for every checked-in production/example query. | Backlog | Unprioritized | No |
| [B-US-003](B-US-003-static-sql-performance-gate.md) | Add machine-enforced static SQL performance checks before first execution. | Backlog | Unprioritized | No |
| [B-US-004](B-US-004-ai-query-development-workflow.md) | Define a safe repeatable AI workflow for adding/changing Scanner SQL. | Backlog | Unprioritized | No |
| [B-US-005](B-US-005-replay-pre-user-run-hardening-audit.md) | Preserved Replay hardening backlog item; must be reconciled against current `main` because later execution may already satisfy it. | Needs fresh-main review | Unprioritized | No |
| [B-US-006](B-US-006-basic-in-product-buy.md) | Preserved basic BUY backlog item; must be reconciled against current `main` because later execution may already satisfy it. | Needs fresh-main review | Unprioritized | No |
| [B-US-007](B-US-007-prioritize-backlog.md) | Review the full backlog against fresh `main`, remove/supersede stale items, and assign an explicit priority/order. | Backlog | Unprioritized | No |

## Backlog rules

- Keep one Markdown file per backlog item.
- Keep this README as the short index only; detailed scope belongs in the item file.
- Do not duplicate one backlog task across `.planning/` and `backlog/` as two live sources of truth.
- Moving an item into active execution requires explicit PLAN/EXECUTION work; its presence or ordering here never activates it.
- If fresh `main` proves an item already completed, mark/remove/supersede it during backlog review rather than re-implementing it.
