# Market Flow US Planning Reviews

## R-US-001 — S&T Necessity / Sufficiency / KISS Review

**Result:** PASS

**Scope:** replacement Market Flow US TREE after the 124-file migration audit and reviewed U.S. contracts.

### Structural result

```text
nodes:              27
implementation leaves: 19
root branches:       7
missing children:    0
invalid parents:     0
one-child branches:  0
invalid dependencies:0
self dependencies:   0
dependency cycles:   0
```

### Root necessity

Each root child remains necessary:

1. **U.S. acquisition** — without it no authoritative U.S. source enters the product.
2. **U.S. data authority** — without it validated browser data is not durable/trusted.
3. **Trusted reads + Viewer** — without it persisted U.S. data is not usable through Current/History.
4. **Scanner adaptation** — without it the general strategy surface and requested staged candidate workflow are incomplete.
5. **Fake Market + Browser E2E** — without it the normal browser/runtime composition cannot be proved safely/deterministically.
6. **Packaging / diagnostics / workload** — without it the product is not operable, diagnosable or measured at U.S. scale.
7. **Live cutover / release closure** — without it external provider/browser facts and final migration cleanup remain unproven.

Removing any branch without replacement leaves a required GOAL/contract clause unmet.

### Parent sufficiency

- Branch 1: provider validation + Recorder/universe integration are sufficient for the browser acquisition boundary.
- Branch 2: schema lifecycle + atomic U.S. persistence + real producer integration are sufficient for durable authority.
- Branch 3: trusted reads + Current + Detail/History are sufficient for non-Scanner user analysis surfaces.
- Branch 4: U.S. built-ins/staged SQL + preserved Scanner/saved-query behavior are sufficient; a Strategy Engine is unnecessary.
- Branch 5: U.S. Fake Market + normal runtime/demo + Chromium E2E are sufficient for deterministic browser-level proof.
- Branch 6: packaging/branding + diagnostics/live harness + representative workload are sufficient to prepare an integrated release candidate.
- Branch 7: final offline gates + bounded live repeatability + release cleanup are sufficient for end-to-end closure.

### Whole-goal coverage

Goal/contract traceability:

```text
ScreenerHulPaging3 + exact validation          -> 1.1, 1.2
String(PaperId) identity + dynamic membership -> 1.1, 1.2, 2.3
schema v3 + history/latest atomic authority    -> 2.1, 2.2, 2.3
Current + Detail/History                       -> 3.1, 3.2, 3.3
Scanner + saved queries + staged ranking       -> 4.1, 4.2
offline deterministic provider/browser proof   -> 5.1, 5.2, 5.3
Market Flow US packaging/diagnostics            -> 6.1, 6.2
approximately-4k workload + staged measurement -> 6.3, 7.1
real authenticated provider boundary            -> 7.2
remove authoritative Israel-only runtime        -> 7.3
public-safe/local-only constraints               -> all affected leaves, especially 5.1/6.2/7.2
```

No stated non-goal was introduced as required work. IBKR/order execution, portfolio/risk, Strategy Engine and dynamic horizon schema remain outside the tree.

### Corrections discovered during review

1. **Live repeatability gap**  
   A one-snapshot live gate did not prove even bounded repeated collection. D-US-016, PRODUCT_SPEC, TEST_STRATEGY, 6.2 and 7.2 were tightened to require three consecutive complete live cycles at the candidate cadence. This remains bounded and is not a long-run provider SLA test.

2. **Execution workflow mismatch in 7.3**  
   Leaf success evidence previously required its own PR to already be squash-merged/main-green, conflicting with the repository workflow where leaf proof closes before the PR/merge transition. The leaf now proves release-branch readiness; AGENTS/root completion owns PR/merge/main-green closure.

3. **Test-feedback preservation**  
   7.1 now explicitly guards against reintroducing avoidable focused+full duplication or unexplained Fast/Browser feedback regression.

### KISS result

PASS.

The tree does **not** introduce:

- a new protocol;
- a new DB architecture;
- predecessor/horizon tables;
- Strategy Engine;
- generic migration framework;
- alternative frontend framework;
- cloud backend;
- new test runner.

The conversion remains focused on provider/data/schema/UI/test/branding changes required by U.S. evidence.

### Local node status

All 27 nodes may be marked `approved`.

This does **not** freeze the whole plan and does **not** authorize implementation.

### Next gate

Run Final Planning Review against GOAL + contracts + audited file map + approved TREE, repair any remaining planning/document/handoff/CI inconsistencies, then freeze only if the entire plan passes.


## R-US-002 — Second-pass adversarial migration/S&T review

**Result:** PASS AFTER CORRECTIONS

**Reason for repeat:** user requested a fresh review because the first S&T review might have missed migration details.

### Review method

The second pass did not trust R-US-001. It independently challenged:

- the original 124-file audit denominator;
- every file classified KEEP;
- every ADAPT/REPLACE file's implementation-leaf ownership;
- stale MarketScope planning artifacts;
- Planning CI guards;
- executor handoff/allocation validation;
- cross-contract live-verification consistency;
- continuous-collection evidence;
- S&T structure/dependencies/non-goals.

### Findings and fixes

1. **Audit denominator wording was wrong.**  
   The 124-file audit snapshot was 121 exact MarketScope baseline files plus 3 U.S. replan/evidence files already added. Durable audit/map text now states this precisely.

2. **Eleven original KEEP classifications were too optimistic.**  
   Ten files contained MarketScope branding/channel/fixture/Israeli-field coupling and moved to ADAPT. `.planning/verify-handoff.mjs` moved to PLANNING_REPLACE because its guard responsibility changed.

3. **Stale MarketScope planning truth remained.**  
   Planning CI and EXECUTOR_HANDOFF still referenced old node IDs, D/R IDs, 561x600 workload and legacy coverage. Both were rewritten.

4. **Obsolete coverage artifacts contradicted the current FRAMEWORK.**  
   MASTER_COVERAGE, COVERAGE_MAP and LEGACY_COMPLETENESS_AUDIT were removed. Whole-plan coverage is now review evidence, not a parallel task/coverage database.

5. **Live verification was internally inconsistent and too weak.**  
   TECHNICAL_SPEC still said one snapshot while other files said three cycles. The final reviewed contract is at least 20 consecutive complete cycles spanning at least 60 seconds at the candidate cadence.

6. **Allocation integrity guard regressed when Planning CI was simplified.**  
   verify-handoff now validates complete leaf allocation, dependency order and serial execution invariants in addition to the current pointer.

### File audit proof

```text
KEEP              15
ADAPT             88
REPLACE            8
PLANNING_REPLACE  10
DROP               3
TOTAL             124
```

Every one of the 96 ADAPT/REPLACE files maps to at least one implementation leaf:

```text
mapped = 96
unmapped = 0
```

All current KEEP files were content-scanned for the known U.S.-migration coupling families. Remaining donor MarketScope wording in BASELINE_PROVENANCE is intentional provenance, not runtime coupling.

### S&T re-check

After corrections:

- nodes: 27;
- implementation leaves: 19;
- root capability branches: 7;
- missing child references: 0;
- non-root nodes with invalid parent count: 0;
- one-child decompositions: 0;
- invalid leaf dependencies: 0;
- dependency cycles: 0;
- non-goal Strategy Engine / temporal schema / order execution: absent.

No additional implementation branch was required by the second pass. The existing leaves already cover the newly corrected ADAPT files through 4.2, 6.1 and 6.2 as applicable.

### KISS result

PASS.

The second pass strengthened proof/ownership without adding a new product subsystem.

### Planning state

The corrected TREE remains locally approved.

This review still does **not** freeze the plan and does **not** authorize implementation.

Next gate: Final Planning Review over the corrected planning infrastructure and contracts.


## R-US-FINAL — Final Planning Review

**Result:** PASS

**Scope:** complete Market Flow US conversion plan after R-US-001 and the adversarial R-US-002 corrections.

### Repository truth

At review time:

```text
main = cf6a21a17288832af3a69703dff39c9f843fe9a5
planning branch = e9ccb81a6f64ce22061e450e027a32e3045603f0 before final-review edits
open PRs = 0
```

Main remained the exact imported green baseline; no competing repository work had overtaken the planning branch.

### Planning-state prerequisites

PASS:

- root phase remained `planning`;
- plan_state remained `active` during review;
- EXECUTION remained `chats: {}`;
- all 27 TREE nodes were `approved`;
- all 17 material decisions were resolved;
- no implementation authorization was active.

### S&T structure

PASS:

```text
TREE nodes                 27
implementation leaves      19
root capability branches    7
bad parent counts           0
one-child decompositions    0
invalid dependencies        0
dependency cycles           0
non-approved nodes          0
```

### Outside-in whole-goal coverage

The FRAMEWORK goal-traceability challenge was repeated from the final corrected state.

1. **Acquire U.S. market data**  
   Protected by 1.1/1.2, DATA_CONTRACT and provider tests.

2. **Persist every successful complete snapshot durably**  
   Protected by 2.1/2.2/2.3, schema-v3 lifecycle, atomic history/latest transaction and rollback evidence.

3. **Expose trusted Current and per-security history**  
   Protected by 3.1/3.2/3.3 with paging, historical-only lookup, state restoration and U.S. field contracts.

4. **Keep strategy flexible in SQL**  
   Protected by 4.1/4.2 and SCANNER_SQL_GUIDE. The staged candidate workflow remains ordinary editable SQL.

5. **Prove the normal browser product without credentials**  
   Protected by 5.1/5.2/5.3 using the canonical U.S. Fake Market and normal runtime.

6. **Keep the product operable/diagnosable at U.S. scale**  
   Protected by 6.1/6.2/6.3 for packaging, diagnostics/live tooling and 4096 x 180 representative workload.

7. **Prove the real provider boundary and close migration cleanly**  
   Protected by 7.1/7.2/7.3, including the bounded sustained live run and final Israel-only-runtime audit.

No meaningful GOAL clause remains without a TREE/contract owner.

### Root gap test

Assuming every implementation leaf succeeds exactly as written, the desired product cannot still fail for an unowned migration concern identified by the audit/contracts.

The final file-to-leaf proof maps every implementation-affecting audited file:

```text
ADAPT + REPLACE files = 96
mapped to >=1 leaf    = 96
unmapped               = 0
```

Planning-only changes are separately owned before execution.

### Boundary challenge

Reviewed material external/system boundaries:

- authenticated browser/provider;
- ScreenerHulPaging3 completeness and changing membership;
- loopback WebSocket;
- producer/session ownership;
- DuckDB schema/transaction authority;
- Viewer trusted reads;
- Scanner sandbox;
- Fake Market;
- build/Windows launchers;
- representative workload;
- authenticated real-provider verification.

No required boundary is silently assumed away.

### Failure/edge scenario walkthrough

PASS for representative scenarios:

1. first valid U.S. collection -> universe revision -> atomic commit -> Current;
2. same membership reordered -> no false universe change;
3. add/remove membership -> revision replacement before same-response commit;
4. partial/malformed/duplicate response -> fail closed, prior authority unchanged;
5. persistence fault -> full rollback;
6. service restart -> stale-session recovery + durable history/latest;
7. old MarketScope DB -> no mutation, explicit unsupported-schema failure;
8. Current -> Detail -> paged history -> back with state restored;
9. staged Scanner query -> deterministic stage ranking + missing-history stop;
10. provider/service interruption -> visible diagnostics and explicit recovery;
11. final real-provider run -> >=20 consecutive complete cycles and >=60 seconds before PASS.

### Negative-space check

PASS. The frozen plan does not require:

- IBKR/order execution;
- portfolio/risk engine;
- Strategy Engine;
- dynamic horizon/predecessor schema;
- new DB/transport architecture;
- cloud backend;
- semantic conversion of Israeli market history into U.S. facts.

### Migration-file audit

Final corrected audited-snapshot classification:

```text
KEEP              15
ADAPT             88
REPLACE            8
PLANNING_REPLACE  10
DROP               3
TOTAL             124
```

The audit denominator is explicitly 121 exact MarketScope baseline files plus 3 pre-audit U.S. planning/evidence additions.

### Planning infrastructure review

PASS after R-US-002 corrections:

- old MASTER_COVERAGE/COVERAGE_MAP/LEGACY_COMPLETENESS_AUDIT removed;
- Planning CI no longer requires old MarketScope nodes/reviews/561x600 assumptions;
- EXECUTOR_HANDOFF routes the new 1.*–7.* tree;
- verify-handoff validates exact leaf allocation, dependency order and serial pointer invariants once allocation exists;
- frozen-plan guard requires this `R-US-FINAL` record.

### Contract consistency

PASS on the material cross-contract invariants:

- `securityId = String(PaperId)`;
- provider = `ScreenerHulPaging3`;
- 4015 remains evidence, never a constant;
- U.S. schema = v3;
- old v1/v2 DBs fail without mutation;
- history/latest authority remains;
- Current/Detail use U.S. fields;
- strategy remains Scanner SQL;
- workload = 4096 x 180;
- bounded live verification = at least 20 consecutive complete cycles spanning at least 60 seconds;
- public-safe/no-auth-data rules remain.

### Final KISS challenge

PASS.

No smaller plan can remove a root capability without leaving a stated requirement unowned, and no additional product subsystem is justified before implementation evidence.

### Verification limitation

The planning branch could not be cloned into the local container because that environment had no external DNS access. Therefore this Final Planning Review does **not** claim a local execution of the GitHub Actions shell job.

Instead, the Planning CI/verify-handoff logic was reviewed directly from the authoritative GitHub branch and its structural predicates were checked against repository state. Actual Planning Docs CI remains a required PR/main verification before the planning work unit can be merged.

### Freeze decision

PASS — the complete plan may now be frozen.

Freeze does **not** authorize production implementation by itself.

Next stage after freeze:

```text
allocate all 19 implementation leaves exactly once in EXECUTION.yaml
→ verify dependency/chat order
→ set root implementation pointer
→ only then authorize phase: implementation
```


## R-US-EXEC-REOPEN-001 — Pre-cutover activation boundary review

**Result:** PASS AFTER CORRECTION

**Trigger:** Chat 1 node `1.1` implemented the correct ScreenerHulPaging3 adapter but replaced modules used by the normal built runtime. Fast CI was green while Browser CI failed because the still-Israeli local service/Fake Market could not consume the U.S. provider/cycle contract. This exposed an execution-staging ambiguity rather than a U.S. provider-contract defect.

### Root cause

The frozen plan correctly assigned normal runtime integration to `5.2`, but it did not explicitly state that earlier U.S. component leaves are **pre-cutover** and must remain non-authoritative in the normal composed runtime until downstream U.S. dependencies exist.

That ambiguity conflicted with two existing repository invariants:

```text
AGENTS: keep tests green / required CI green
TEST_STRATEGY: Browser CI for product-code changes
```

### Correction

Added `D-US-018` and the global `AGENTS.md` migration-cutover rule:

- nodes `1.*` through `4.*` and `5.1` implement/test U.S. behavior through existing construction/dependency/configuration seams;
- they do not activate an incomplete U.S. normal runtime/service composition;
- Browser tests remain enabled and green on every pre-cutover work unit;
- no generic feature-flag subsystem or duplicate architecture is introduced;
- `5.2` remains the sole normal-runtime U.S. activation boundary;
- Chat 5 already owns `5.1`, `5.2`, `5.3` on one work unit, so the Browser suite is migrated and green before the cutover PR can merge;
- `7.3` retains final superseded-path cleanup/audit ownership.

### TREE / dependency review

No TREE structure change is required.

Reasons:

1. `5.2` already explicitly owns normal Market Flow US runtime/demo composition.
2. Chats are serial and Chats 1–4 complete before Chat 5 begins.
3. `5.2` already depends on the acquisition/authority/Fake Market outcomes that make its direct composition possible, while Chat ordering guarantees the already-allocated trusted-read/UI/Scanner work is complete before Chat 5.
4. The defect was activation timing ambiguity, not a missing capability, leaf, dependency cycle or product requirement.

Therefore:

```text
TREE nodes: unchanged (27)
implementation leaves: unchanged (19)
chat allocation: unchanged (9)
new subsystem: none
```

### Valid implementation evidence preserved

The focused node `1.1` U.S. provider tests and implementation logic remain valid evidence and should be preserved. The runtime-coupled placement is what must be repaired after re-freeze: move/shape the U.S. provider implementation behind the existing pre-cutover seam while restoring the normal active composition until `5.2`.

No execution node was previously `done`, so no completed outcome required invalidation.

### KISS / whole-plan challenge

PASS.

The smallest correction is one staging invariant. It avoids both bad alternatives:

- weakening/skipping Browser CI; or
- prematurely implementing downstream schema/Fake Market work inside Chat 1.

The original seven capability branches, success evidence, non-goals and final release gates remain sufficient and unchanged.

### Re-freeze decision

The corrected planning area is coherent. EXECUTION does not require reallocation. Node `1.1` may be reset from `blocked` to `pending`, the plan may be frozen again, and Chat 1 may resume from the preserved branch after implementation authorization is restored.
