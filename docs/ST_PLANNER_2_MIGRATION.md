# Market Flow US — ST Planner 2.0 Migration Runbook

## Purpose

This is the project-specific migration contract for moving `LirazShay/market-flow-us` from the installed ST Planner 1.1.1 model to ST Planner 2.x **without losing planning truth, execution progress, project-owned rules, future backlog, or verification evidence**.

This document is intentionally specific to Market Flow US. It supplements the current ST Planner `BOOTSTRAP.md`; it does not replace the framework methodology.

The migration priority is:

```text
preserve project truth first
→ establish ST Planner 2.0 authorities
→ prove equivalence/completeness
→ remove only superseded planner machinery
→ clean historical clutter only in a later, separately reviewed change if useful
```

Do not optimize directory cleanliness at the cost of information loss during the first migration.

---

# 0. Audit snapshot and no-loss review

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

Current execution truth is especially simple:

```text
43 implementation leaves = done
1 implementation leaf   = pending
pending leaf             = 7.4
owner                    = Chat 28
```

The final-acceptance ledger currently records:

- FR-0 exact candidate: PASS
- FR-1 host prerequisite preflight: PASS
- FR-2 onward: still pending/user-dependent at this snapshot
- exact acceptance candidate: `682f8c8b01e9f68c7f8e159de8b0f233221f1878`

## 0.1 Framework customization audit — PASS

The installed ST Planner 1.1.1 integrity metadata was checked against the current `.planning` tree.

Every framework-managed file still has the exact installed blob SHA:

- `.planning/README.md`
- `.planning/FRAMEWORK.md`
- `.planning/EXECUTOR_HANDOFF.md`
- `.planning/CI-RCA-POLICY.md`
- `.planning/executor-authority.mjs`
- `.planning/execution-guidance.mjs`
- `.planning/validate-allocation.mjs`
- `.planning/verify-freeze-baseline.mjs`
- `.planning/check-framework-update.mjs`

Therefore there is **no hidden project customization inside those managed files at this snapshot**.

The bounded root `AGENTS.md` ST Planner block also matches the exact 1.1.1 source block (`AGENTS.rules.md` blob `2265e1d423ffec8e98d577d727de0e482020ef36`).

Important: project-owned rules exist both **before and after** that bounded block. In particular, the `Market Flow US executor routing` rule after the block is project-owned and must survive.

Re-run this integrity/customization check immediately before the real migration. This audit result is evidence for the snapshot above, not permission to assume later files are unchanged.

## 0.2 Decision-state audit — PASS

The current material decision register contains decisions `D-US-001` through `D-US-048` and the current entries are resolved (some earlier sequencing decisions are explicitly marked superseded by later resolved decisions).

There is no known open material decision hidden in `DECISIONS.md` at this snapshot.

Do not discard the register: it contains durable architecture, security, data, replay, Demo Buy and IBKR execution rationale that remains useful after the planner format changes.

## 0.3 Review-state audit — no unresolved blocker found

The main `REVIEWS.md` records completed/superseded planning reviews and corrections. Material corrections were folded into TREE/DECISIONS/product contracts as the project evolved.

Separate project-specific review/audit documents also exist for IBKR, Replay, pre-acceptance and final acceptance.

Migration rule:

- do not preserve old review **workflow state** as ST Planner 2.0 authority;
- do preserve any durable finding/evidence that is not already represented elsewhere;
- do not delete project-specific audit/evidence files in the first migration PR.

## 0.4 User-entry documentation audit — migration update required

Root `README.md` still contains active V1-era planning references such as:

- `TREE 7.4` as a live release pointer;
- `STATUS.yaml` + `.planning/EXECUTION.yaml` as execution truth;
- `.planning/STATUS.yaml`, `.planning/TREE.yaml`, `.planning/EXECUTION.yaml` in its main truth list.

It also contains some product descriptions that predate later schema-v4 / IBKR / Replay extensions.

Therefore repository migration is incomplete unless active user/agent entry documents are reviewed and updated. Do not remove V1 files while leaving the root README teaching the old authority model.

`START_HERE.md` is primarily operational/product usage and does not currently depend on the V1 planner authority model in the same way; still include it in the final dead-reference/user-entry sweep.

---

# 1. Critical cutover rule — do not migrate yet

Do **not** execute the migration while Chat 28 / leaf `7.4` final acceptance is still active.

The current final-acceptance process is SHA-bound and the existing planning/execution documents still define its live handoff. Replacing those files in the middle of that work would create avoidable ambiguity and could invalidate the exact acceptance boundary.

The migration may start only after all of these are true on `main`:

1. leaf `7.4` is closed with its required success evidence;
2. Chat 28 has no unfinished work;
3. FR-14/final handoff is complete for the accepted candidate, or the durable final acceptance contract explicitly records any legitimate externally unavailable proof state;
4. the final target-machine/provider acceptance result has been durably recorded;
5. no planning/execution PR is open;
6. required engineering CI for the accepted product candidate is green;
7. `main` is the accepted product truth;
8. there is no unresolved execution blocker whose meaning depends on the V1 state machine.

Then perform the migration as one dedicated process-only branch/PR. Do not combine it with a product feature, runtime change, schema change, provider change, or test-behavior change.

---

# 2. What must survive the migration

The objective is **not** to erase planning history. The objective is to remove V1 framework machinery while preserving Market Flow US truth.

Preserve:

- product goal and current reality;
- still-relevant S&T reasoning;
- implementation-ready leaf IDs that remain useful for traceability;
- real execution dependencies;
- every valid `done` result/evidence;
- current/future owner assignments when unfinished work exists;
- material decisions and rationale;
- real blockers;
- future backlog items that are intentionally outside the current plan;
- target-owned executor routing;
- target-owned product/architecture/test/security contracts;
- baseline provenance;
- project-specific mini-project, reclosure, audit, preflight and acceptance evidence;
- explicit numbered-chat identity: `Chat N` activates only when the user explicitly starts `Chat N`.

Do not restart, renumber or relabel valid completed work merely because the planner format changes.

---

# 3. Exhaustive `.planning` disposition inventory

This section exists to prevent broad deletion such as “remove the old `.planning` folder”.

The first migration PR must account for **every current file** before deletion/move.

## 3.1 Transform into ST Planner 2.0 live authorities

| Current file | 2.0 disposition |
|---|---|
| `.planning/GOAL.md` | Merge current outcome/current reality/constraints into `.planning/PLAN.md` |
| `.planning/TREE.yaml` | Convert S&T reasoning/leaves/success evidence into `.planning/PLAN.md`; execution prerequisites go to `EXECUTION.md` |
| `.planning/EXECUTION.yaml` | Convert owner/status/dependencies/result into `.planning/EXECUTION.md` |
| `.planning/DECISIONS.md` | Keep as optional `.planning/DECISIONS.md`; this project is complex enough to justify it |
| `.planning/STATUS.yaml` | Input-only for migration; do not reproduce freeze/authorization lifecycle state |
| `.planning/REVIEWS.md` | Extract any still-unrepresented durable finding, then retire as live authority |

## 3.2 Installed ST Planner 1.1.1 machinery — remove only after replacements are proven

Current integrity audit says these are exact framework bytes, with no hidden target customization:

- `.planning/README.md`
- `.planning/FRAMEWORK.md`
- `.planning/EXECUTOR_HANDOFF.md`
- `.planning/CI-RCA-POLICY.md`
- `.planning/executor-authority.mjs`
- `.planning/execution-guidance.mjs`
- `.planning/validate-allocation.mjs`
- `.planning/verify-freeze-baseline.mjs`
- `.planning/check-framework-update.mjs`
- `.planning/ST_PLANNER_INSTALL.json`

Also remove only the bounded root block:

```text
<!-- st-planner:rules:v3:begin -->
...
<!-- st-planner:rules:v3:end -->
```

Never replace root `AGENTS.md` wholesale.

## 3.3 Local V1 helper — remove after replacement

### `.planning/verify-handoff.mjs`

This is a local implementation of the V1 serial state machine. It enforces frozen plan/allocation/current pointer/serial prefix semantics.

Remove it after `PLAN.md + EXECUTION.md + AGENTS.md` express the simpler 2.0 execution contract:

- explicit Chat N activation;
- only that owner's assigned work;
- real dependency readiness;
- verified result before `done`;
- no silent owner switch.

## 3.4 Mixed project/planner helper — split, do not delete blindly

### `.planning/validate-ci-hygiene.mjs`

This file contains both:

1. V1 planning/handoff assertions — remove;
2. Market Flow US engineering/security hygiene — preserve.

Preserve at least the real project checks for:

- reviewed/current GitHub Action pins;
- strict npm install-script policy;
- approved `esbuild@0.28.2` install script only.

Recommended target:

```text
scripts/validate-ci-hygiene.mjs
```

or another normal project-owned script location.

## 3.5 Project-owned future work — preserve

### `.planning/BACKLOG.md`

Preserve it in the first migration PR.

It explicitly contains future work that is **not allocated in the current frozen execution**, including file-backed Scanner SQL/query-authoring and related correctness/static-performance workflow work.

Some older backlog entries may already have been implemented through later branches. Do not prune them during the ST Planner migration. Backlog cleanup is a separate product-planning review so migration cannot accidentally erase an unimplemented request.

## 3.6 Project provenance — preserve

### `.planning/BASELINE_PROVENANCE.md`

Preserve. It records the exact MarketScope donor baseline, imported commit/tree and initial green-CI boundary used as migration/rollback provenance.

## 3.7 Final acceptance / preflight evidence — preserve in first migration

Do not delete or move these in the first migration PR:

- `.planning/FINAL_ACCEPTANCE_EXECUTION.md`
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md`
- `.planning/FINAL_PREFLIGHT_AUDIT.md`
- `.planning/FINAL_PREFLIGHT_PROGRESS.yaml`
- `.planning/FINAL_PREFLIGHT_A7_SQL_PREFLIGHT.md`
- `.planning/FINAL_PREFLIGHT_A8_SQL_PREFLIGHT.md`

Before any later cleanup, ensure the final accepted `7.4` result in `EXECUTION.md` contains a concise durable pointer to the exact accepted SHA and final evidence/result.

Historical preflight progress may later move to Git history, but that is not part of this migration.

## 3.8 IBKR execution evidence — preserve in first migration

Do not delete or move:

- `.planning/IBKR_ORDER_MINI_PROJECT.md`
- `.planning/IBKR_ORDER_PACKAGING_REVIEW.md`
- `.planning/IBKR_ORDER_RECLOSURE.md`
- `.planning/IBKR_ORDER_REVIEWS.md`

These contain project-specific provider/security/packaging/reclosure reasoning and evidence, not generic framework runtime.

## 3.9 Replay / BUY extension evidence — preserve in first migration

Do not delete or move:

- `.planning/MARKET_REPLAY_MINI_PROJECT.md`
- `.planning/MARKET_REPLAY_RECLOSURE.md`
- `.planning/REPLAY_BUY_EXTENSION_REVIEW.md`
- `.planning/REPLAY_HARDENING_AUDIT.md`

These are project-specific capability/hardening evidence.

## 3.10 Pre-acceptance extension audit evidence — preserve in first migration

Do not delete or move:

- `.planning/PRE_ACCEPTANCE_CODE_AUDIT.md`
- `.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPLAN_REVIEW.md`
- `.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPORT.md`

These document the combined order/BUY/Replay/shared-seam audit and the defects/proofs that produced the final candidate.

### First-migration safety rule

The first ST Planner 2.0 migration is **not** a `.planning` directory cleanup project.

After the migration, the live planning authorities should be only `PLAN.md`, `EXECUTION.md` and optional `DECISIONS.md`, but project-specific evidence documents may temporarily remain beside them as clearly non-authoritative evidence. A later cleanup may move/remove historical evidence only after a separate review proves nothing durable becomes harder to recover.

---

# 4. Target ST Planner 2.0 authority model

The authoritative live planning core after migration is:

```text
.planning/
├── PLAN.md
├── EXECUTION.md
└── DECISIONS.md
```

Other project-specific evidence documents may remain, but must not become competing planning/execution authorities.

Do **not** create `.planning/STATUS.md` initially.

## Root `STATUS.yaml` — keep in the first migration

For the first migration, keep root `STATUS.yaml` even if its external consumer is not yet proven.

Reason: it may be consumed by Sequence Runner or another external workflow outside repository code search. Deleting it in the same migration would create unnecessary compatibility risk.

Rewrite it as a **small non-authoritative projection** only:

- product/repository phase if still useful;
- current owner/task pointer only when an external consumer genuinely needs it;
- optional next/blocker summary.

State explicitly:

```text
.planning/PLAN.md       = planning/reasoning authority
.planning/EXECUTION.md  = task/owner/status/dependency/result authority
STATUS.yaml             = external/navigation projection only
```

Do not require `STATUS.yaml` and `EXECUTION.md` to be synchronized by a validator/state machine.

Remove root `STATUS.yaml` only in a later change after its absence is proven safe for Sequence Runner/other external consumers.

---

# 5. Exact content migration map

## 5.1 `.planning/GOAL.md` → `.planning/PLAN.md`

Move current truth:

- three-lane product outcome: market analysis, standalone IBKR execution, isolated recording/replay;
- intentional separation between analysis, execution and replay authority;
- stable product direction;
- current constraints/non-goals;
- current completion boundary;
- canonical contract precedence only where it remains useful.

Do not copy V1 lifecycle/freeze prose merely because it exists.

The current GOAL contains older planning-boundary text from earlier branch-9 planning. Treat later TREE/DECISIONS/contracts/current execution as newer truth where they explicitly supersede it.

## 5.2 `.planning/TREE.yaml` → `.planning/PLAN.md`

Preserve the S&T model, not the YAML schema.

Carry forward:

- root Strategy/Tactic;
- all still-useful Strategy/Tactic relationships;
- necessity/sufficiency reasoning;
- material assumptions;
- implementation-ready leaf IDs;
- objective success evidence;
- final `7.4` definition-of-done;
- the real distinction between S&T hierarchy and execution dependency.

Execution-order prerequisites belong in `EXECUTION.md -> Depends on`.

Do not preserve exact node-count requirements as a planner invariant. The current `58 TREE nodes / 44 implementation leaves` values are facts of this completed/near-completed plan, not a permanent schema contract.

## 5.3 `.planning/DECISIONS.md` → keep as `.planning/DECISIONS.md`

Keep the material decision register because this project has many cross-cutting decisions.

At this audit snapshot `D-US-001..048` are resolved/current-or-explicitly-superseded decisions; there is no open decision requiring separate migration resolution.

Preserve product/architecture/security/data/replay/order rationale. Remove a decision only when it is purely V1 planner ceremony and no future executor/product reader needs it.

`PLAN.md` should reference decision IDs instead of duplicating full decision text.

## 5.4 `.planning/REVIEWS.md`

Do not make historical review chronology a ST Planner 2.0 live state machine.

Before retiring it as live authority:

1. identify every finding marked unresolved/open/blocked;
2. require zero unresolved material findings or migrate each finding to `PLAN.md`, `DECISIONS.md`, a durable product contract or `EXECUTION.md`;
3. verify every material correction that still matters is represented in current TREE/DECISIONS/contracts;
4. keep Git history as chronology/audit fallback.

At this audit snapshot no unresolved material blocker was found in the main review file.

Do not delete the separate project-specific audit/reclosure evidence files listed in Section 3.

## 5.5 `.planning/STATUS.yaml`

Use only to understand migration starting state.

Do not carry forward:

- `plan_state`;
- `replan_mode`;
- `implementation_authorized`;
- freeze/refreeze state;
- review-cycle markers.

Real blockers/tasks belong in `EXECUTION.md`; navigation projection may remain in root `STATUS.yaml`.

## 5.6 `.planning/EXECUTION.yaml` → `.planning/EXECUTION.md`

Use the 2.0 shape:

| Task | Owner | Status | Depends on | Result/Evidence |
|---|---|---|---|---|
| `<leaf ID>` | `Chat N` | `pending / in_progress / blocked / done` | real prerequisites only | verified result/evidence |

Migration invariants:

- keep leaf IDs stable;
- preserve owner for every unfinished task;
- preserve every valid `done` state;
- preserve useful result/evidence text;
- preserve real dependencies from TREE;
- do not require contiguous chat numbering as a validity rule;
- do not require all work to form one serial prefix merely because V1 did;
- do not create `allocation_validated`, `handoff_verified`, `implementation_authorized`, or equivalent fields.

At this audit snapshot:

```text
44 leaves total
43 done
7.4 pending under Chat 28
```

The migration must account for all latest leaves before deleting the YAML source.

If migration starts after final `7.4`, the expected state is all current leaves `done`, with `7.4` result containing the final accepted SHA/evidence. If later work added new leaves, migrate the actual latest `main` instead of relying on this snapshot.

---

# 6. `AGENTS.md` migration

## 6.1 Preserve project-owned behavior

Preserve/re-express Market Flow US rules for:

- repository roles/product source of truth;
- relevant controlled U.S. conversion/product boundaries;
- branch/PR workflow;
- RCA/root-cause behavior;
- automation-performance contract;
- SQL static preflight gate;
- diagnosability-by-design;
- public-safe/security constraints;
- durable product contract ownership;
- target-owned `docs/EXECUTOR_ROUTING.md`;
- explicit `אני צאט N תתחיל` activation and no silent owner switch.

## 6.2 Remove/translate V1 project-native sections

Several V1-coupled sections live **outside** the bounded framework block and therefore will not disappear automatically.

Review and rewrite at least:

- `Fresh-chat read order`;
- `Planning boundary`;
- `Serial executor protocol`;
- `Durable ownership`;
- any branch/release text that names TREE/STATUS/EXECUTION as framework authorization gates;
- any reference to freeze, implementation authorization, handoff validation or current-pointer equality as permission to work.

Do not delete the useful engineering rule merely because its wording mentions TREE. Translate the rule to the new authority model.

## 6.3 Remove exact bounded framework block

Current audit confirms the bounded block matches the installed ST Planner source. Remove exactly between the begin/end markers and preserve everything outside them.

## 6.4 New fresh-chat execution order

Recommended:

```text
AGENTS.md
→ resolve one current ST Planner source commit for this session
→ read BOOTSTRAP + SNT-METHODOLOGY + EXECUTION-MANAGEMENT from that commit
→ .planning/PLAN.md
→ .planning/EXECUTION.md
→ assigned leaf/Strategy in PLAN
→ matching docs/EXECUTOR_ROUTING.md row
→ only routed product contracts/code/tests
```

A generic `continue` never changes executor identity. `Chat N` remains `Chat N` until the user explicitly starts another owner.

---

# 7. Root/user-entry documentation migration

Review active entry documents after the new authorities exist.

At minimum:

- `README.md`
- `START_HERE.md`
- `AGENTS.md`
- any release/development guide that names old planning files as current authority.

For root `README.md` specifically:

- replace `.planning/TREE.yaml`, `.planning/STATUS.yaml`, `.planning/EXECUTION.yaml` authority references with `PLAN.md` / `EXECUTION.md` and the projection role of root `STATUS.yaml`;
- remove V1 planner lifecycle wording;
- ensure product description reflects the current implemented product (schema v4 / Demo Buy / AI / IBKR sidecar/basic BUY / Replay as applicable at migration time);
- do not mix this documentation correction with new runtime behavior.

Historical documents may keep historical file names when they are clearly describing a past event and are not used as current instructions.

---

# 8. Planning Docs CI migration — mandatory

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

## 8.1 Preserve real Market Flow US checks

Keep checks that protect product/engineering invariants, for example:

- required durable product contracts;
- U.S. schema/provider contract checks;
- security/privacy contract checks;
- Demo Buy / IBKR / Replay contract invariants that are still current;
- prevention of reintroducing Israel-only typed fields into current U.S. contracts;
- representative workload/product constraints that remain current;
- open-PR hygiene if the project intentionally keeps that rule;
- npm/GitHub Actions hygiene moved out of planner tooling.

## 8.2 Remove planning-engine checks

Remove checks whose only purpose is proving V1:

- framework install/update freshness;
- exact TREE shape/counts;
- freeze/no-drift state;
- allocation completeness validator;
- serial handoff validator;
- `implementation_authorized`;
- framework-managed file presence;
- review-history marker counts that do not protect a current product contract.

## 8.3 ST Planner 2.0 CI rule

CI may perform lightweight deterministic sanity checks on `PLAN.md` / `EXECUTION.md` if a repeated real failure justifies them, but must not recreate a second planner schema/state machine.

Prefer direct product-contract checks.

---

# 9. Recommended migration sequence

Perform in one focused migration branch after Section 1's cutover gate is satisfied.

## Step 1 — refresh sources

1. fetch latest Market Flow US `main`;
2. verify no unexpected open PR;
3. resolve current `LirazShay/st-planner` `main` to one exact commit;
4. read `BOOTSTRAP.md`, `docs/SNT-METHODOLOGY.md`, `docs/EXECUTION-MANAGEMENT.md` from that same commit;
5. use latest project state, not this audit snapshot, for migration values.

## Step 2 — snapshot the migration inventory

Before edits, record in the PR description or migration notes:

- base `main` SHA;
- current planning files present;
- current leaf count/status/owners;
- current final acceptance result/candidate;
- current open blockers;
- open-PR state.

Git history is the rollback snapshot; do not create a permanent duplicate archive directory.

## Step 3 — repeat customization/integrity audit

Compare framework-managed files with `.planning/ST_PLANNER_INSTALL.json` and compare bounded `AGENTS` block with its installed source.

If any managed file/block changed since this review, classify the delta before deletion.

## Step 4 — create `PLAN.md`

Consolidate latest GOAL + TREE + still-relevant decision/review findings.

Perform outside-in review before deleting sources.

## Step 5 — create `EXECUTION.md`

Convert latest execution allocation plus real TREE dependencies.

Prove:

- every leaf accounted for;
- no unfinished owner changed silently;
- every valid `done` result preserved;
- real dependencies retained;
- final `7.4` evidence preserved after completion;
- no process-only fields introduced.

## Step 6 — keep/normalize `DECISIONS.md`

Keep material decisions. Remove only clearly obsolete planner-ceremony entries if any exist; do not opportunistically rewrite product decisions during migration.

## Step 7 — rewrite `AGENTS.md`

Translate V1-coupled project-native rules to 2.0 and only then remove the exact bounded framework block.

## Step 8 — keep root `STATUS.yaml` as projection

Do not delete it in the first migration. Demote it explicitly to projection-only and remove V1 authorization semantics.

## Step 9 — refactor CI/hygiene

Refactor `planning-docs-ci.yml` and split `validate-ci-hygiene.mjs` before removing their V1 inputs.

Keep real engineering/product checks.

## Step 10 — update active entry docs

Update README/AGENTS/START_HERE or other current instructions so a fresh reader never follows removed V1 authorities.

## Step 11 — remove V1 framework/runtime state

Only after Steps 4–10 are reviewed, remove superseded framework files/scripts plus live V1 status/review authority.

Do not delete project-specific evidence documents listed in Section 3.

## Step 12 — repository-wide dead-reference sweep

Search active/current documentation, workflows and scripts for:

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
allocation validation
```

For every match classify:

- active instruction → update/remove;
- historical evidence → may remain if clearly historical;
- product contract → translate without weakening the underlying rule.

## Step 13 — no-loss cross-check before deletion commit

Perform a source-to-target ledger:

### PLAN coverage

For each current TREE node/leaf that carries still-useful reasoning/evidence, identify its PLAN location or explicit durable contract/decision reference.

### EXECUTION coverage

For every current implementation leaf identify exactly one EXECUTION row and compare:

- owner;
- status;
- real dependencies;
- result/evidence.

### Decisions

Account for every current material decision ID.

### Evidence

Confirm every project-specific evidence file in Section 3 still exists unchanged in the migration diff unless an explicitly reviewed reason says otherwise.

No V1 source file is deleted until this ledger has no unexplained gap.

## Step 14 — verify and merge

Require:

1. fresh-reader review from repository alone;
2. `PLAN.md` covers current S&T truth;
3. `EXECUTION.md` preserves ownership/status/dependencies/results;
4. `DECISIONS.md` preserves material rationale;
5. `docs/EXECUTOR_ROUTING.md` still routes relevant maintained leaf families;
6. no active file requires removed framework runtime;
7. root user/agent docs teach only the 2.0 authority model;
8. product contract CI remains meaningful and green;
9. normal required engineering CI is green;
10. PR diff contains no runtime/product behavior change unless separately justified;
11. squash merge;
12. verify `main`, required main CI and open-PR state after merge.

---

# 10. Migration acceptance checklist

The migration is complete only when all are true:

- [ ] final pre-migration execution work was not lost/reset;
- [ ] final `7.4` accepted SHA/result/evidence is represented durably;
- [ ] every latest implementation leaf is accounted for exactly once in the execution map;
- [ ] every unfinished owner assignment, if any, is preserved;
- [ ] every valid completed result remains represented;
- [ ] real execution prerequisites are preserved;
- [ ] every material decision remains available;
- [ ] future backlog remains available;
- [ ] baseline provenance remains available;
- [ ] all project-specific acceptance/audit/reclosure evidence files from Section 3 remain available;
- [ ] `docs/EXECUTOR_ROUTING.md` remains project-owned context routing only;
- [ ] product/data/technical/test/security contracts are unchanged unless explicitly reviewed;
- [ ] project rules outside the bounded ST Planner block are preserved or deliberately translated;
- [ ] root README/entry docs no longer teach old planner authorities;
- [ ] no V1 framework checker/validator/state machine is required to continue work;
- [ ] no global freeze or implementation-authorization flag exists;
- [ ] generic continuation cannot silently become another Chat N;
- [ ] root `STATUS.yaml` is projection-only in first migration;
- [ ] Planning Docs CI no longer enforces obsolete planner schemas/counts;
- [ ] useful CI/security hygiene formerly mixed into planner scripts still exists in normal project tooling;
- [ ] fresh chat can recover from repository truth without old chat history;
- [ ] required CI is green after squash merge;
- [ ] no unexpected open PR remains after merge.

---

# 11. Rollback / safety

This migration must be a focused process/documentation/tooling PR with no product runtime behavior change.

Before merge, rollback is abandoning the branch/PR.

After merge, Git history preserves the complete V1 state.

Do not create a permanent archive directory of old framework files merely for comfort; that recreates duplicate live authorities. Instead, keep project-specific durable evidence and rely on Git history for superseded framework/process chronology.

If migration verification exposes an unexplained gap, stop and keep the V1 source file until the gap is resolved. “Cleanup” is never a reason to accept uncertain information loss.

---

# 12. One-line operating principle

> Preserve every Market Flow US fact, decision, task result, future request and useful proof; remove only ST Planner's obsolete management machinery.
