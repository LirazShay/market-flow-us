# Market Flow US — ST Planner 2.0 Migration Ledger

Purpose: cumulative no-loss evidence for the one-time migration from the installed ST Planner 1.1.1 state to ST Planner 2.0.

Migration baseline:

- Market Flow US source snapshot: `932fa501ee251f01b5bd1492a7e0e7b408d440d8` (`main`).
- ST Planner session source: `LirazShay/st-planner@4746f54468b7c03e6e2c0fc5e3105e71e3ba3bfb`.
- Migration branch: `chore/st-planner-2-migration`.
- No V1 file may be deleted until every useful source item below has a reviewed destination.

## Authority target

| Truth | Target |
|---|---|
| Planning / S&T | `.planning/PLAN.md` |
| Execution task / owner / status / dependency / result | `.planning/EXECUTION.md` |
| Material decisions | `.planning/DECISIONS.md` |
| External/navigation compatibility | root `STATUS.yaml` (projection only) |

## Source → target ledger

| Source truth | Destination | State in this migration |
|---|---|---|
| `.planning/EXECUTION.yaml` task IDs, owner, status, result | `.planning/EXECUTION.md` | **RECONCILED in this checkpoint** |
| `.planning/TREE.yaml` real implementation-leaf dependencies | `.planning/EXECUTION.md -> Depends on` | **RECONCILED in this checkpoint** |
| `.planning/GOAL.md` outcome/current reality/constraints | `.planning/PLAN.md` | pending next migration checkpoint |
| `.planning/TREE.yaml` Strategy/Tactic/assumptions/necessity/sufficiency/success evidence | `.planning/PLAN.md` | pending next migration checkpoint |
| material `.planning/REVIEWS.md` findings not already durable elsewhere | `.planning/PLAN.md` / `.planning/DECISIONS.md` / durable product contract | pending content review before V1 review retirement |
| `.planning/DECISIONS.md` material decisions | `.planning/DECISIONS.md` | preserve; detailed review pending |
| root `AGENTS.md` project-owned rules outside bounded ST Planner block | rewritten root `AGENTS.md` | pending; must preserve project rules |
| `.planning/BACKLOG.md` | same file | preserve unchanged in first migration |
| `.planning/BASELINE_PROVENANCE.md` | same file | preserve unchanged |
| final acceptance/preflight evidence files | same files | preserve unchanged semantically |
| IBKR/Replay/pre-acceptance audit/reclosure evidence | same files | preserve unchanged semantically |
| `.planning/validate-ci-hygiene.mjs` project hygiene | `scripts/validate-ci-hygiene.mjs` | pending split; V1 assertions must not survive |
| `.github/workflows/planning-docs-ci.yml` product-contract checks | refactored same workflow | pending; V1 state-machine checks must be removed |
| active V1 references in README/START_HERE/FIRST_RUN_ACCEPTANCE/EXECUTOR_ROUTING/docs | ST Planner 2.0 authority wording | pending repository-wide active-reference sweep |
| framework-owned V1 runtime/install/validators | deletion after replacement review | **not yet eligible for deletion** |

## Execution reconciliation proof

Source implementation leaf count = **44**.

Target `.planning/EXECUTION.md` row count = **44**.

Status preservation:

- `done`: **43**
- `pending`: **1**
- `in_progress`: **0**
- `blocked`: **0**

Open work is preserved exactly:

```text
Task: 7.4
Owner: Chat 28
Status: pending
Depends on: 7.5, 8.5, 9.6, 7.6.5
Acceptance candidate: 682f8c8b01e9f68c7f8e159de8b0f233221f1878
Existing acceptance state: FR-0 PASS, FR-1 PASS, later checkpoints unchanged
```

### Leaf coverage

| Task | Owner | Source status | Target row | Dependency destination |
|---|---|---|---|---|
| `1.1` | Chat 1 | `done` | exactly once | — |
| `1.2` | Chat 1 | `done` | exactly once | `1.1` |
| `2.1` | Chat 2 | `done` | exactly once | — |
| `2.2` | Chat 2 | `done` | exactly once | `2.1` |
| `2.3` | Chat 2 | `done` | exactly once | `1.2`, `2.2` |
| `3.1` | Chat 3 | `done` | exactly once | `2.2` |
| `3.2` | Chat 3 | `done` | exactly once | `3.1` |
| `3.3` | Chat 3 | `done` | exactly once | `3.1` |
| `4.1` | Chat 4 | `done` | exactly once | `2.2` |
| `4.2` | Chat 4 | `done` | exactly once | `4.1` |
| `4.3.1` | Chat 10 | `done` | exactly once | `2.3` |
| `4.3.2` | Chat 10 | `done` | exactly once | `4.3.1` |
| `4.3.3` | Chat 11 | `done` | exactly once | `4.3.1` |
| `4.4.1` | Chat 12 | `done` | exactly once | `4.3.2`, `4.2`, `5.2` |
| `4.4.2` | Chat 13 | `done` | exactly once | `4.3.3`, `4.4.1`, `5.2` |
| `4.5.1` | Chat 14 | `done` | exactly once | `4.3.2`, `4.3.3` |
| `4.5.2` | Chat 15 | `done` | exactly once | `4.5.1`, `4.4.2`, `5.2` |
| `5.1` | Chat 5 | `done` | exactly once | `1.1` |
| `5.2` | Chat 5 | `done` | exactly once | `1.2`, `2.3`, `5.1` |
| `5.3` | Chat 5 | `done` | exactly once | `3.2`, `3.3`, `4.2`, `5.2` |
| `6.1` | Chat 6 | `done` | exactly once | `2.1` |
| `6.2` | Chat 6 | `done` | exactly once | `2.3`, `3.1`, `4.2`, `6.1` |
| `6.3` | Chat 7 | `done` | exactly once | `2.3`, `4.1` |
| `7.1` | Chat 7 | `done` | exactly once | `5.3`, `6.2`, `6.3` |
| `7.2` | Chat 8 | `done` | exactly once | `7.1` |
| `7.3` | Chat 9 | `done` | exactly once | `7.2`, `6.1` |
| `7.5` | Chat 16 | `done` | exactly once | `4.4.1`, `4.4.2`, `4.5.2`, `7.3` |
| `7.6.1` | Chat 27 | `done` | exactly once | `7.5`, `8.5`, `9.6` |
| `7.6.2` | Chat 27 | `done` | exactly once | `7.6.1` |
| `7.6.3` | Chat 27 | `done` | exactly once | `7.6.2` |
| `7.6.4` | Chat 27 | `done` | exactly once | `7.6.3` |
| `7.6.5` | Chat 27 | `done` | exactly once | `7.6.4` |
| `7.4` | Chat 28 | `pending` | exactly once | `7.5`, `8.5`, `9.6`, `7.6.5` |
| `8.1` | Chat 17 | `done` | exactly once | `7.5` |
| `8.2` | Chat 18 | `done` | exactly once | `8.1` |
| `8.3` | Chat 19 | `done` | exactly once | `8.2` |
| `8.4` | Chat 20 | `done` | exactly once | `8.3` |
| `8.5` | Chat 26 | `done` | exactly once | `3.3`, `8.4` |
| `9.1` | Chat 21 | `done` | exactly once | `1.1` |
| `9.2` | Chat 21 | `done` | exactly once | `9.1` |
| `9.3` | Chat 22 | `done` | exactly once | `9.2`, `2.3` |
| `9.4` | Chat 23 | `done` | exactly once | `9.3` |
| `9.5` | Chat 24 | `done` | exactly once | `9.4`, `8.4` |
| `9.6` | Chat 25 | `done` | exactly once | `9.5` |

Checks performed:

- 44 source implementation leaves represented.
- 44 unique target Task IDs; no duplicate target row.
- every `Depends on` target is itself an implementation leaf.
- no self-dependency.
- no dependency cycle.
- owner fidelity preserved; chat numbers are not required to be contiguous or serial.
- no completion was invented.
- `7.4` final acceptance result/evidence is not synthesized; the row points to the existing runbook/evidence ledger.

## Deletion gate

**CLOSED.** This checkpoint intentionally does not delete any V1 source. The gate may open only after PLAN/DECISIONS/AGENTS/CI/docs mappings above are completed and reviewed.