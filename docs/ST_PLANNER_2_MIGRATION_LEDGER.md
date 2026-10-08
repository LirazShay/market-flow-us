# Market Flow US — ST Planner 2.0 Migration Ledger

Purpose: cumulative no-loss evidence for the one-time migration from the installed ST Planner 1.1.1 state to ST Planner 2.0.

Migration baseline:

- Market Flow US source snapshot: `932fa501ee251f01b5bd1492a7e0e7b408d440d8` (`main`).
- ST Planner session source: `LirazShay/st-planner@4746f54468b7c03e6e2c0fc5e3105e71e3ba3bfb`.
- Migration branch: `chore/st-planner-2-migration`.
- No V1 file may be deleted until every useful source item below has a reviewed destination. That gate was satisfied before the deletion checkpoint recorded below.

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
| material `.planning/REVIEWS.md` findings not already durable elsewhere | `.planning/PLAN.md` / `.planning/DECISIONS.md` / durable product contract | **RECONCILED; central V1 review registry retired** |
| `.planning/DECISIONS.md` material decisions | `.planning/DECISIONS.md` | **AUDITED: durable decisions preserved; D-US-017 retired as V1 ceremony-only; D-US-048 corrected to current history/authority model** |
| root `STATUS.yaml` | root `STATUS.yaml` | **MIGRATED to non-authoritative projection sourced from PLAN/EXECUTION** |
| root `AGENTS.md` project-owned rules outside bounded ST Planner block | rewritten root `AGENTS.md` | **MIGRATED: project rules preserved, V1 managed block removed, ST Planner 2 bootstrap/authority/executor flow installed** |
| `.planning/BACKLOG.md` | same file | preserve unchanged in first migration |
| `.planning/BASELINE_PROVENANCE.md` | same file | preserve unchanged |
| final acceptance/preflight evidence files | same files | preserve unchanged semantically |
| IBKR/Replay/pre-acceptance audit/reclosure evidence | same files | preserve unchanged semantically |
| `.planning/validate-ci-hygiene.mjs` project hygiene | `scripts/validate-ci-hygiene.mjs` | **SPLIT: genuine action-pin/npm-install hygiene migrated; V1 assertions not copied; old V1 file deleted** |
| `.github/workflows/planning-docs-ci.yml` product-contract checks | refactored same workflow | **MIGRATED: product/security/evidence checks preserved; V1 framework/TREE/freeze/allocation/handoff state-machine validation removed** |
| active V1 references in README/START_HERE/FIRST_RUN_ACCEPTANCE/EXECUTOR_ROUTING/docs | ST Planner 2.0 authority wording | **MIGRATED: README, FIRST_RUN_ACCEPTANCE, EXECUTOR_ROUTING and final-acceptance authorities corrected; START_HERE audited with no V1 authority refs and left unchanged** |
| framework-owned V1 runtime/install/validators and superseded V1 authority files | deletion manifest below | **DELETED AND POST-DELETE VERIFIED** |

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
- `fast-ci.yml`, `browser-ci.yml`, `replay-ci.yml`, `workload-ci.yml` and the reusable Chat-7 workload workflow were re-audited after the authority cutover and do not invoke or require V1 planning/runtime files.
- Full GitHub Actions execution is deferred until the migration PR exists; this checkpoint is repository-content verification, not a claim that remote CI has already run.

## Active-document reconciliation proof

- `README.md` reflects the implemented schema-v4/Demo Buy/AI/Replay/order-sidecar/Basic-BUY product and points planning/execution authority to PLAN/EXECUTION rather than V1 STATUS/TREE/EXECUTION.yaml files.
- `docs/EXECUTOR_ROUTING.md` is context routing only. PLAN owns leaf success evidence; EXECUTION owns owner/status/dependencies/results; generic continuation cannot activate another numbered chat.
- `docs/FIRST_RUN_ACCEPTANCE.md` takes the exact runtime candidate from `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` and verifies it against `.planning/FINAL_ACCEPTANCE_EXECUTION.md`; it no longer reads candidate/authority from `.planning/EXECUTOR_HANDOFF.md`, `.planning/STATUS.yaml` or TREE state.
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` and `.planning/FINAL_ACCEPTANCE_EXECUTION.md` were re-audited after the first sweep: PLAN/EXECUTION now own planning/execution truth, the active detailed procedure is `docs/FIRST_RUN_ACCEPTANCE.md`, and `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` is explicitly historical/provenance evidence only.
- The exact runtime candidate remains `682f8c8b01e9f68c7f8e159de8b0f233221f1878`; FR-0 and FR-1 remain PASS and later checkpoint states remain unchanged.
- `START_HERE.md` contains no active V1 planning/execution authority reference and remains unchanged.
- Historical/provenance evidence may continue to mention V1 filenames, old candidates, TREE counts or prior process state when clearly describing historical truth; those mentions are not live authority.

## Deletion manifest and post-delete verification

The branch-level `.planning/` inventory and every active authority/entrypoint named by the migration contract were re-read before deletion. `package.json` contains no planner runtime scripts, and all GitHub workflows were checked after the Planning CI refactor. No active product/runtime/CI/executor/acceptance consumer required any file in the DELETE set below.

### DELETE — superseded V1 authority/runtime/process files

The following **17 files were deleted** from `chore/st-planner-2-migration` after the deletion gate opened:

```text
.planning/README.md
.planning/FRAMEWORK.md
.planning/GOAL.md
.planning/TREE.yaml
.planning/STATUS.yaml
.planning/EXECUTION.yaml
.planning/REVIEWS.md
.planning/EXECUTOR_HANDOFF.md
.planning/CI-RCA-POLICY.md
.planning/ST_PLANNER_INSTALL.json
.planning/check-framework-update.mjs
.planning/executor-authority.mjs
.planning/execution-guidance.mjs
.planning/validate-allocation.mjs
.planning/validate-ci-hygiene.mjs
.planning/verify-freeze-baseline.mjs
.planning/verify-handoff.mjs
```

Deletion rationale:

- `GOAL.md` + `TREE.yaml` were reconciled into `PLAN.md`.
- `EXECUTION.yaml` + `.planning/STATUS.yaml` were reconciled into `EXECUTION.md`; root `STATUS.yaml` remains projection-only.
- `REVIEWS.md` current material findings were reconciled into PLAN/DECISIONS/durable contracts; dedicated project review/audit evidence files are preserved separately.
- `.planning/README.md`, `FRAMEWORK.md`, `ST_PLANNER_INSTALL.json`, framework checkers, freeze/allocation/executor/handoff helpers and `EXECUTOR_HANDOFF.md` are V1 framework/process runtime and have no ST Planner 2 role.
- `CI-RCA-POLICY.md` project-owned RCA requirements are preserved in `AGENTS.md`.
- `.planning/validate-ci-hygiene.mjs` useful repository hygiene was migrated to `scripts/validate-ci-hygiene.mjs`; V1 assertions were intentionally not copied.

Post-delete proof:

- comparing the pre-delete gate commit `ed580f9f06d5be22bd7b8fc99906bf554e70901c` to the branch after deletion showed exactly **17 commits / 17 removed files**, with no modified or added file in that deletion slice;
- the post-delete `.planning/` inventory still contains `PLAN.md`, `EXECUTION.md`, `DECISIONS.md`, `BACKLOG.md`, final-acceptance files and the preserved provenance/audit/evidence set;
- root `STATUS.yaml` remains `role: projection` / `non_authoritative: true` and still projects task `7.4`, Chat 28, `pending`, 44 leaves / 43 done / 1 pending;
- `.planning/EXECUTION.md` remains authoritative and still records task `7.4`, owner Chat 28, status pending, exact candidate `682f8c8b01e9f68c7f8e159de8b0f233221f1878`, with FR-0 and FR-1 PASS;
- `.github/workflows/planning-docs-ci.yml` requires only the preserved ST Planner 2/evidence files and invokes `scripts/validate-ci-hygiene.mjs`; it does not require any deleted V1 file;
- no remote CI result is claimed yet; GitHub Actions execution remains part of the migration PR checkpoint.

### PRESERVE — ST Planner 2 live truth

```text
.planning/PLAN.md
.planning/EXECUTION.md
.planning/DECISIONS.md
.planning/BACKLOG.md
STATUS.yaml
AGENTS.md
docs/EXECUTOR_ROUTING.md
```

`BACKLOG.md` remains unchanged in this first migration.

### PRESERVE — active acceptance authority / procedure

```text
.planning/FINAL_ACCEPTANCE_RUNBOOK.md
.planning/FINAL_ACCEPTANCE_EXECUTION.md
docs/FIRST_RUN_ACCEPTANCE.md
```

### PRESERVE — historical/provenance/audit/evidence

At minimum, the following remain evidence and are not deletion targets:

```text
.planning/BASELINE_PROVENANCE.md
.planning/FIRST_RUN_ACCEPTANCE_PLAN.md
.planning/FINAL_PREFLIGHT_AUDIT.md
.planning/FINAL_PREFLIGHT_PROGRESS.yaml
.planning/FINAL_PREFLIGHT_A7_SQL_PREFLIGHT.md
.planning/FINAL_PREFLIGHT_A8_SQL_PREFLIGHT.md
.planning/IBKR_ORDER_MINI_PROJECT.md
.planning/IBKR_ORDER_PACKAGING_REVIEW.md
.planning/IBKR_ORDER_RECLOSURE.md
.planning/IBKR_ORDER_REVIEWS.md
.planning/MARKET_REPLAY_MINI_PROJECT.md
.planning/MARKET_REPLAY_RECLOSURE.md
.planning/REPLAY_BUY_EXTENSION_REVIEW.md
.planning/REPLAY_HARDENING_AUDIT.md
.planning/PRE_ACCEPTANCE_CODE_AUDIT.md
.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPLAN_REVIEW.md
.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPORT.md
```

These files may contain historical V1/TREE/handoff wording when it records provenance. They are not execution/planning authority unless an active document explicitly designates a narrower evidence role.

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

**COMPLETED — the scoped 17-file DELETE manifest was executed and post-delete verified.**

The deletion checkpoint is valid because:

1. planning, execution and decision truth were reconciled into ST Planner 2 files before deletion;
2. root `STATUS.yaml` is projection-only;
3. AGENTS/executor bootstrap does not consume V1 runtime state;
4. CI/hygiene does not consume V1 framework/state-machine files;
5. README/routing/active first-run acceptance were migrated;
6. final acceptance authority is detached from V1 and preserves the exact runtime candidate/checkpoint state;
7. the post-delete diff contains exactly the 17 manifest removals and no collateral file change;
8. the post-delete tree retains all explicitly preserved live/evidence files.

This completion does **not** change task `7.4`, its owner/status/dependencies, the accepted runtime candidate, or any final-acceptance checkpoint. Remote CI and fresh-reader verification remain required before the migration PR can be merged.
