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
| `.planning/EXECUTION.yaml` task IDs, owner, status, result | `.planning/EXECUTION.md` | **RECONCILED** |
| `.planning/TREE.yaml` real implementation-leaf dependencies | `.planning/EXECUTION.md -> Depends on` | **RECONCILED** |
| `.planning/GOAL.md` outcome/current reality/constraints | `.planning/PLAN.md` | **RECONCILED** |
| `.planning/TREE.yaml` Strategy/Tactic/assumptions/necessity/sufficiency/success evidence | `.planning/PLAN.md` | **RECONCILED** |
| material `.planning/REVIEWS.md` findings not already durable elsewhere | `.planning/PLAN.md` / `.planning/DECISIONS.md` / durable product contract | **RECONCILED for material current findings; historical review file not yet retired** |
| `.planning/DECISIONS.md` material decisions | `.planning/DECISIONS.md` | **AUDITED: durable decisions preserved; D-US-017 retired as V1 ceremony-only; D-US-048 corrected to current history/authority model** |
| root `STATUS.yaml` | root `STATUS.yaml` | **MIGRATED to non-authoritative projection sourced from PLAN/EXECUTION** |
| root `AGENTS.md` project-owned rules outside bounded ST Planner block | rewritten root `AGENTS.md` | **MIGRATED: project rules preserved, V1 managed block removed, ST Planner 2 bootstrap/authority/executor flow installed** |
| `.planning/BACKLOG.md` | same file | preserve unchanged in first migration |
| `.planning/BASELINE_PROVENANCE.md` | same file | preserve unchanged |
| final acceptance/preflight evidence files | same files | preserve unchanged semantically |
| IBKR/Replay/pre-acceptance audit/reclosure evidence | same files | preserve unchanged semantically |
| `.planning/validate-ci-hygiene.mjs` project hygiene | `scripts/validate-ci-hygiene.mjs` | **SPLIT: genuine action-pin/npm-install hygiene migrated; V1 handoff/planning assertions not copied; old V1 file retained only until deletion checkpoint** |
| `.github/workflows/planning-docs-ci.yml` product-contract checks | refactored same workflow | **MIGRATED: product/security/evidence checks preserved; V1 framework/TREE/freeze/allocation/handoff state-machine validation removed** |
| active V1 references in README/START_HERE/FIRST_RUN_ACCEPTANCE/EXECUTOR_ROUTING/docs | ST Planner 2.0 authority wording | pending repository-wide active-reference sweep |
| framework-owned V1 runtime/install/validators | deletion after replacement review | **not yet eligible for deletion** |

## Planning reconciliation proof

- `.planning/PLAN.md` owns the current desired outcome, current reality, constraints/non-goals, root Strategy/Tactic, all nine necessary capability branches, S&T necessity/sufficiency, material assumptions, success evidence and completion boundary.
- All **44** implementation leaf IDs represented by the source TREE are represented exactly once in the PLAN and exactly once in `.planning/EXECUTION.md`.
- Execution dependencies are intentionally not duplicated into PLAN; `.planning/EXECUTION.md` is their sole live authority.
- Material review corrections already made durable in TREE/DECISIONS/contracts were carried into PLAN, including returned-position semantics, sharing-safe AI export, Replay fresh-run isolation/zero-preroll, Basic BUY trust boundaries and final code-audit/reclosure requirements.
- V1 process states such as freeze, implementation authorization, review-cycle state, allocation state and handoff state were not promoted into PLAN.

## Decision reconciliation proof

- Durable product/architecture/security/verification/operational decisions `D-US-001`–`D-US-016` and `D-US-018`–`D-US-048` remain represented.
- `D-US-017` was removed from live decisions because it described only V1 planning ceremony (`TREE -> review -> allocation -> freeze/authorization`) and carried no independent product/architecture/operational invariant.
- Decision IDs were not renumbered.
- `D-US-048` was corrected so the historical requested sequence includes the completed `7.6.1–7.6.5` staged pre-acceptance audit before `7.4`; it no longer pretends to own dependency truth.
- `.planning/DECISIONS.md` now explicitly defers S&T truth to PLAN and execution truth to EXECUTION.

## AGENTS reconciliation proof

The ST Planner 1.x managed block bounded by `st-planner:rules:v3:begin/end` was removed rather than carried forward.

Project-owned rules remain represented for:

- GitHub `main` source-of-truth and donor/reference roles;
- KISS / preserve-proven-mechanism engineering;
- focused branch → PR → CI → review → squash merge → main verification/open-PR workflow;
- blocking-defect ownership and root-cause/regression discipline;
- comprehensive CI warning/error RCA, including analogous-area review and recurrence prevention;
- automation feedback-cost/performance discipline;
- 10+ stage static SQL preflight before first execution of new/materially changed SQL;
- diagnosability-by-design and public-safe security;
- project-owned executor routing.

The replacement bootstrap now resolves one exact ST Planner `main` commit and reads `BOOTSTRAP.md`, `SNT-METHODOLOGY.md` and `EXECUTION-MANAGEMENT.md` from that same commit, then uses PLAN/EXECUTION and routed project context. Numbered Chat identity is explicit-only; generic continuation cannot activate another Chat N.

No installed framework checker, framework version/provenance file, freeze/authorization gate, allocation validator or handoff state machine is recreated in AGENTS.

## CI / hygiene reconciliation proof

- `scripts/validate-ci-hygiene.mjs` retains only genuine repository hygiene: deprecated GitHub Action pin rejection, exact reviewed `esbuild@0.28.2` install-script allowlist, and `.npmrc` fail-closed enforcement.
- The V1 checks that interpreted `EXECUTOR_HANDOFF.md` or planning authority were deliberately not migrated.
- `.github/workflows/planning-docs-ci.yml` now invokes the project-owned hygiene script and validates durable product/contracts/security/evidence rather than planner runtime state.
- Preserved CI checks include U.S. provider/schema invariants, Demo Buy and AI evidence/privacy boundaries, IBKR order security/lifecycle contracts, Replay contracts, target workload expectations, forbidden Israel-only typed fields and post-main open-PR hygiene.
- Minimal ST Planner 2 sanity is limited to required `PLAN.md` / `EXECUTION.md` presence/table shape and `STATUS.yaml` projection markers; CI does not parse or count S&T nodes/leaves or infer execution ownership/status/dependencies.
- Removed CI authority includes `ST_PLANNER_INSTALL`, framework freshness, `.planning/STATUS.yaml`, `TREE.yaml` shape/count/status validation, allocation/freeze/authorization logic, `EXECUTOR_HANDOFF.md`, `verify-handoff.mjs`, review-marker gates and framework-runtime-file presence.
- Full GitHub Actions execution is deferred until the migration PR exists; this checkpoint is a repository-content refactor, not a claim that remote CI has already run.

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

**CLOSED.** Planning/execution/decision authority, AGENTS bootstrap and CI/hygiene replacements are now reconciled. V1 source deletion remains blocked until the repository-wide active-document reference sweep is completed and the pre-delete no-loss search proves there are no active consumers of the legacy files.