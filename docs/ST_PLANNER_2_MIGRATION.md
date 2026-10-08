# Market Flow US — ST Planner 2.0 Migration Runbook

## Purpose

This is the project-specific migration contract for moving `LirazShay/market-flow-us` from the installed ST Planner 1.1.1 model to ST Planner 2.x without losing planning truth, execution progress, target-owned rules, or verification evidence.

This document is intentionally specific to Market Flow US. It supplements the current ST Planner `BOOTSTRAP.md`; it does not replace the framework methodology.

## Audit snapshot

Prepared against:

- Market Flow US `main`: `932fa501ee251f01b5bd1492a7e0e7b408d440d8`
- current ST Planner 2.0 source: `LirazShay/st-planner@4746f54468b7c03e6e2c0fc5e3105e71e3ba3bfb`
- installed legacy framework: ST Planner `1.1.1`, source commit `be75edfd19df583c56ad07bc968b8b84ea4eb189`

At this audit snapshot Market Flow US is still in active implementation:

- root phase: `implementation`
- current owner: `Chat 28`
- current leaf: `7.4`
- title: `Final target-machine/provider acceptance`
- planning state: `frozen`
- implementation authorization: `true`
- implementation leaves: `44`
- numbered chats: `28`
- blockers: none
- open pull requests at audit time: none

## Critical cutover rule — do not migrate yet

Do **not** execute the migration while Chat 28 / leaf `7.4` final acceptance is still active.

The current final-acceptance process is SHA-bound and the existing planning/execution documents still define its live handoff. Replacing those files in the middle of that work would create avoidable ambiguity and could invalidate the exact acceptance boundary.

The migration may start only after all of these are true on `main`:

1. leaf `7.4` is closed with its required success evidence;
2. Chat 28 has no unfinished work;
3. the final target-machine/provider acceptance result has been durably recorded;
4. no planning/execution PR is open;
5. required engineering CI for the accepted product candidate is green;
6. `main` is the accepted product truth;
7. there is no unresolved execution blocker whose meaning depends on the V1 state machine.

Then perform the migration as one dedicated process-only branch/PR. Do not combine it with a product feature, runtime change, schema change, provider change, or test-behavior change.

---

# 1. What must survive the migration

The objective is **not** to erase the planning history. The objective is to remove V1 framework machinery while preserving project truth.

Preserve:

- the Market Flow US product goal and current reality;
- the still-relevant S&T reasoning;
- implementation-ready leaf IDs that still matter for understanding delivered work;
- real execution dependencies;
- all valid `done` evidence/results;
- current/future owner assignments when unfinished work exists;
- material decisions and their rationale;
- real blockers;
- target-owned executor routing;
- target-owned product/architecture/test/security contracts;
- all project-specific mini-project/acceptance evidence that remains useful;
- explicit numbered-chat identity: `Chat N` activates only when the user explicitly starts `Chat N`.

Do not restart or relabel valid completed work merely because the planner format changes.

---

# 2. Current ownership classification

## 2.1 Project-owned truth — preserve

These are Market Flow US data/contracts, not framework runtime:

- `AGENTS.md` content **outside** the bounded ST Planner block;
- `STATUS.yaml` until its external/Sequence Runner consumers are explicitly checked;
- `.planning/GOAL.md`;
- `.planning/TREE.yaml`;
- `.planning/DECISIONS.md`;
- `.planning/REVIEWS.md` as historical review evidence;
- `.planning/STATUS.yaml` only as an input to migration, not as a 2.0 destination;
- `.planning/EXECUTION.yaml` as the source for task/owner/status/result migration;
- `.planning/BACKLOG.md`;
- `.planning/BASELINE_PROVENANCE.md`;
- all Market Flow US mini-project, preflight, audit, reclosure and acceptance documents;
- `docs/EXECUTOR_ROUTING.md`;
- `docs/US_MIGRATION_AUDIT.md` and `docs/US_MIGRATION_FILE_MAP.md`;
- all PRODUCT / DATA / TECHNICAL / TEST / security / feature contracts.

`docs/EXECUTOR_ROUTING.md` is especially important: target-specific routing was deliberately moved there during the 1.1.1 upgrade. It must remain project-owned after the 2.0 migration.

## 2.2 Installed ST Planner 1.1.1 machinery — remove after replacement is verified

The install metadata identifies these as framework-managed V1 material:

- `.planning/README.md`;
- `.planning/FRAMEWORK.md`;
- `.planning/EXECUTOR_HANDOFF.md`;
- `.planning/CI-RCA-POLICY.md`;
- `.planning/executor-authority.mjs`;
- `.planning/execution-guidance.mjs`;
- `.planning/validate-allocation.mjs`;
- `.planning/verify-freeze-baseline.mjs`;
- `.planning/check-framework-update.mjs`;
- `.planning/ST_PLANNER_INSTALL.json`.

Also remove the bounded root `AGENTS.md` block between:

```text
<!-- st-planner:rules:v3:begin -->
...
<!-- st-planner:rules:v3:end -->
```

Remove **only** that block. Preserve all Market Flow US rules around it.

## 2.3 Local V1 helpers that need classification, not blind deletion

### `.planning/verify-handoff.mjs`

This script exists to enforce the old serial V1 state machine: frozen planning, allocated YAML, serial prefix, root status pointer, current chat/node equality, and handoff validity.

It should be removed during the 2.0 migration. The useful behavior is replaced by the simpler execution rule:

- explicit Chat N activation;
- read `PLAN.md` + `EXECUTION.md`;
- work only on that owner's assigned runnable tasks;
- require real dependencies to be satisfied;
- never silently become another owner.

### `.planning/validate-ci-hygiene.mjs`

Do **not** delete this file without preserving its target-owned engineering checks.

It currently contains two kinds of behavior:

1. V1 planning/handoff assertions — remove these;
2. Market Flow US CI/security hygiene — preserve these, including reviewed GitHub Action pins and strict npm install-script approval.

Recommended migration:

- move the useful non-planner checks to a normal project script such as `scripts/validate-ci-hygiene.mjs`;
- remove checks whose only purpose is `TREE/STATUS/EXECUTOR_HANDOFF` authority;
- invoke the surviving project hygiene check from normal engineering CI if it still protects a real invariant.

---

# 3. Target ST Planner 2.0 state

The normal live planning state after migration should be:

```text
.planning/
├── PLAN.md
├── EXECUTION.md
└── DECISIONS.md        # keep here because this project has a large material decision set
```

Do **not** create `.planning/STATUS.md` initially. Market Flow US already has a root `STATUS.yaml`; introducing another status file would recreate duplicate state.

After migration, decide the root `STATUS.yaml` separately:

- if Sequence Runner or another real external integration still consumes it, keep it as a **small non-authoritative projection** and state explicitly that `.planning/EXECUTION.md` owns execution status;
- if no external consumer requires it, remove it instead of keeping duplicate current-chat/current-node state.

Never let both root `STATUS.yaml` and `EXECUTION.md` independently own the same execution fact.

---

# 4. Exact content migration map

## `.planning/GOAL.md` → `.planning/PLAN.md`

Move only current planning truth:

- root outcome;
- relevant current reality;
- constraints and non-goals;
- U.S.-conversion boundary that still matters;
- success boundary that remains meaningful.

Do not copy lifecycle/freeze prose merely because it exists.

## `.planning/TREE.yaml` → `.planning/PLAN.md`

Preserve the S&T model, not its YAML schema.

Carry forward:

- Strategy/Tactic relationships that remain useful;
- necessity/sufficiency reasoning;
- material assumptions;
- implementation-ready leaf IDs;
- objective success evidence;
- still-relevant planning dependencies.

Execution-order prerequisites belong in `EXECUTION.md -> Depends on`, not in the logical S&T hierarchy.

Do not preserve exact node-count requirements as a planner invariant. The current `58 TREE nodes / 44 implementation leaves` counts are historical facts of this plan, not a permanent schema contract.

## `.planning/DECISIONS.md` → keep as `.planning/DECISIONS.md`

This project has a large decision set, so the optional ST Planner 2.0 `DECISIONS.md` is justified for readability.

Preserve material product/architecture/security/data decisions and their rationale. Remove only entries that exist solely to describe V1 framework ceremony when they have no continuing project meaning.

`PLAN.md` should reference relevant decision IDs rather than duplicate their full text.

## `.planning/REVIEWS.md`

Do not carry review history forward as live workflow state.

Before deletion from live planning state:

- copy any unresolved material finding into `PLAN.md`, `DECISIONS.md`, a product contract, or `EXECUTION.md` as appropriate;
- confirm that completed review history is recoverable from Git history.

Then remove the live `REVIEWS.md` authority.

Project-specific review/audit documents that contain durable evidence may remain as project evidence; they do not become framework state.

## `.planning/STATUS.yaml`

Use it only to understand the migration starting point.

Do not carry forward:

- `plan_state`;
- `replan_mode`;
- `implementation_authorized`;
- freeze/refreeze state;
- review-cycle markers.

Real blockers or next work belong in `EXECUTION.md` or the small external status projection if one is still needed.

## `.planning/EXECUTION.yaml` → `.planning/EXECUTION.md`

Preserve every implementation leaf that still matters for execution/history with:

| Task | Owner | Status | Depends on | Result |
|---|---|---|---|---|
| `<leaf ID>` | `Chat N` | `pending / in_progress / blocked / done` | real prerequisites only | short verified result/evidence |

Migration invariants:

- keep leaf IDs stable;
- preserve the existing Chat owner for every unfinished task;
- preserve every valid `done` state;
- preserve the useful result/evidence text;
- preserve real dependencies;
- do not require chat numbers to be globally contiguous as a validity rule;
- do not require all work to be one serial prefix merely because V1 did;
- do not create `allocation_validated`, `handoff_verified`, `implementation_authorized`, or equivalent fields.

At the current audit snapshot the source contains 44 implementation leaves across 28 chats. The migration must account for all 44 before the old YAML is removed.

If migration happens after final `7.4` acceptance, the expected starting state is that all current leaves are closed. If any new work has been added by then, migrate the actual latest `main` state instead of relying on the numbers in this document.

---

# 5. `AGENTS.md` migration

Preserve Market Flow US project rules, including:

- repository roles and product source of truth;
- controlled U.S. conversion principles that still matter;
- branch/PR workflow;
- RCA/root-cause behavior;
- automation-performance contract;
- SQL static preflight gate;
- diagnosability-by-design;
- security/public-safe constraints;
- durable product contract ownership;
- explicit `אני צאט N תתחיל` activation rule.

Remove/rewrite V1-specific sections that require:

- freshness checker execution;
- installed framework files;
- freeze/unfreeze;
- `implementation_authorized`;
- allocation validator;
- mandatory handoff verifier;
- `.planning/EXECUTOR_HANDOFF.md`;
- `.planning/STATUS.yaml` as planning authority;
- `.planning/EXECUTION.yaml` as YAML authority;
- exact current-chat pointer equality as execution authorization.

Recommended fresh-chat execution order after migration:

```text
AGENTS.md
→ resolve one current ST Planner source commit for the session
→ read that commit's BOOTSTRAP + SNT-METHODOLOGY + EXECUTION-MANAGEMENT
→ .planning/PLAN.md
→ .planning/EXECUTION.md
→ assigned leaf/Strategy in PLAN
→ matching docs/EXECUTOR_ROUTING.md row
→ only the routed product contracts/code/tests
```

A generic `continue` never changes executor identity. `Chat N` remains `Chat N` until the user explicitly starts another numbered chat.

---

# 6. Planning Docs CI migration — mandatory

The current `.github/workflows/planning-docs-ci.yml` cannot survive unchanged.

It currently enforces V1 machinery, including:

- presence of framework-installed files and validators;
- `plan_state: active|frozen`;
- root `phase` coupled to planner lifecycle;
- exact TREE root/children;
- required V1 leaf IDs in YAML;
- exact `58` TREE-node count;
- exact `44` implementation-leaf count;
- allocation/freeze/handoff scripts;
- historical review markers as live CI requirements.

Removing V1 files without changing this workflow will intentionally break CI.

## Preserve from Planning Docs CI

Keep checks that protect real Market Flow US product/engineering invariants, for example:

- required durable product contracts;
- U.S. schema/provider contract checks;
- security/privacy contract checks;
- Demo Buy / IBKR / Replay contract invariants that are still current;
- prevention of reintroducing Israel-only typed fields into current U.S. contracts;
- representative workload/product constraints that remain current;
- open-PR hygiene if the project still intentionally wants that rule;
- useful npm/GitHub Actions hygiene after moving it out of planner tooling.

## Remove from Planning Docs CI

Remove checks whose only purpose is proving the old planning engine:

- framework install/update freshness;
- exact TREE shape/counts;
- freeze/no-drift state;
- allocation completeness validator;
- serial handoff validator;
- `implementation_authorized`;
- framework-managed file presence;
- review-history marker counts that do not protect a current product contract.

## 2.0 replacement

The workflow may still check that ongoing substantial planning has coherent `PLAN.md` / `EXECUTION.md`, but do not rebuild a schema engine around them.

Prefer simple product-contract checks over a second ST Planner runtime.

---

# 7. Recommended migration sequence

Perform these steps in one focused migration branch after the cutover rule is satisfied.

## Step 1 — refresh all sources

1. fetch latest Market Flow US `main`;
2. verify there are no unexpected open PRs;
3. resolve the current `LirazShay/st-planner` `main` to one exact commit;
4. read `BOOTSTRAP.md`, `docs/SNT-METHODOLOGY.md`, and `docs/EXECUTION-MANAGEMENT.md` from that same commit;
5. use the latest project state, not this document's audit snapshot, for actual migration values.

## Step 2 — audit customization before deletion

Compare the installed V1 framework-managed files against `.planning/ST_PLANNER_INSTALL.json` integrity metadata.

If any framework-managed file differs, inspect the difference before deleting it.

At minimum re-check:

- `.planning/README.md`;
- `.planning/FRAMEWORK.md`;
- `.planning/EXECUTOR_HANDOFF.md`;
- `.planning/CI-RCA-POLICY.md`;
- framework scripts;
- bounded ST Planner block in root `AGENTS.md`.

Project-specific executor routing already lives in `docs/EXECUTOR_ROUTING.md`; preserve it.

## Step 3 — create `PLAN.md`

Consolidate current GOAL + S&T reasoning + still-relevant decisions/review findings into `.planning/PLAN.md`.

Review the result outside-in before deleting sources.

## Step 4 — create `EXECUTION.md`

Convert the latest `.planning/EXECUTION.yaml` and real TREE dependencies into the lightweight table.

Prove:

- no implementation leaf disappeared;
- no unfinished owner changed silently;
- every valid `done` result remains represented;
- real dependencies are retained;
- no process-only state was reintroduced.

## Step 5 — preserve optional decisions

Keep `.planning/DECISIONS.md` as the optional material decision register and remove V1-only ceremony from it only when clearly process-only.

## Step 6 — rewrite project routing/rules

Update `AGENTS.md` to the 2.0 read/execution model while preserving Market Flow US engineering/product rules.

Remove only the bounded installed ST Planner block after the project-native replacement is complete.

## Step 7 — refactor CI

Refactor `planning-docs-ci.yml` and `validate-ci-hygiene.mjs` before deleting their V1 inputs.

Keep real product/engineering checks. Remove planning-engine checks.

## Step 8 — remove V1 framework/runtime state

Only after Steps 3–7 are reviewed, remove the superseded installed framework files/scripts and live V1 review/status machinery.

Do not delete product contracts, executor routing, mini-project evidence, acceptance runbooks or project-specific audit evidence merely because they are under `.planning/` today. Classify each by content first.

## Step 9 — repository-wide dead-reference sweep

Search for and resolve active references to:

```text
.planning/README.md
.planning/FRAMEWORK.md
.planning/GOAL.md
.planning/TREE.yaml
.planning/REVIEWS.md
.planning/STATUS.yaml
.planning/EXECUTION.yaml
.planning/EXECUTOR_HANDOFF.md
.planning/ST_PLANNER_INSTALL.json
check-framework-update.mjs
executor-authority.mjs
execution-guidance.mjs
validate-allocation.mjs
verify-freeze-baseline.mjs
verify-handoff.mjs
implementation_authorized
plan_state
freeze
handoff verification
```

Historical text may remain when clearly historical and not used as current authority.

## Step 10 — verify and merge

Require:

1. fresh-reader review from the repository alone;
2. `PLAN.md` covers current S&T truth;
3. `EXECUTION.md` preserves work ownership/status/dependencies/results;
4. `docs/EXECUTOR_ROUTING.md` still routes every relevant active/maintained leaf family;
5. no active file requires removed framework runtime;
6. product contract CI remains meaningful and green;
7. normal required engineering CI is green;
8. PR diff contains no runtime/product behavior change unless separately justified;
9. squash merge;
10. verify `main` and required main CI after merge.

---

# 8. Migration acceptance checklist

The migration is complete only when all are true:

- [ ] final pre-migration execution work was not lost or reset;
- [ ] all latest implementation leaves are accounted for;
- [ ] all unfinished owner assignments are preserved;
- [ ] all valid completed results remain represented;
- [ ] real execution prerequisites are preserved;
- [ ] material decisions remain available;
- [ ] `docs/EXECUTOR_ROUTING.md` remains project-owned and authoritative for context routing only;
- [ ] product/data/technical/test/security contracts are unchanged unless explicitly reviewed;
- [ ] root project rules outside the bounded ST Planner block are preserved;
- [ ] no V1 framework checker/validator/state machine is required to continue work;
- [ ] no global freeze or implementation-authorization flag exists;
- [ ] generic continuation cannot silently become another Chat N;
- [ ] Planning Docs CI no longer enforces obsolete planner schemas/counts;
- [ ] useful CI/security hygiene formerly mixed into planner scripts still exists in normal project tooling;
- [ ] fresh chat can recover using repository truth without old chat history;
- [ ] `main` CI is green after squash merge.

---

# 9. Rollback / safety

This migration must be a single focused PR with no product behavior change.

Before merge, rollback is simply abandoning the branch/PR.

After merge, Git history preserves the complete V1 state. Do not create a permanent archive directory of the old framework files unless a concrete recovery need is demonstrated; that would recreate duplicate live authorities.

---

# 10. One-line operating principle

> Preserve Market Flow US truth and execution evidence; remove only ST Planner's old management machinery.
