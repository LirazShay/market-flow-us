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


## R-US-EXEC-REOPEN-002 — Static-market and deferred target-machine acceptance review

**Result:** PASS AFTER CORRECTION

**Trigger:** During Chat 7 the user clarified that development is occurring while the market may be static, and requested three separate proof families: a lightweight static-market check, user-runnable mock load/performance, and a final market-open verification. The frozen plan had one live-provider leaf that mixed these facts and would unnecessarily block subsequent development on market hours/user availability.

### Planning defect

The old `7.2` assumed the live gate could serve both provider compatibility and moving-market evidence. That is not logically sound when repeated equal provider values are a legitimate closed/static-market outcome.

It also placed a user-dependent external check before final cleanup, despite the user explicitly wanting all target-machine/authenticated checks deferred until development and release preparation are complete.

### Correction

The smallest affected planning area is branch `7` only.

Changes:

1. Added `D-US-019` and revised `D-US-016` to distinguish static-provider compatibility from moving-market evidence.
2. `7.2` now owns a reusable local Fake Leumi acceptance package built from the existing Fake Market/runtime/service/DuckDB/workload mechanisms.
3. `7.3` remains release cleanup/documentation but now prepares the exact final candidate and acceptance instructions before any user-dependent gate.
4. Added final leaf `7.4` for **all** user-dependent target-machine checks:
   - local Fake Leumi static/moving/failure/restart acceptance;
   - representative `4096 × 180` mock workload/performance on the target machine;
   - authenticated closed/static-market smoke allowing repeated equal values;
   - authenticated market-open run requiring observable provider market/freshness change.
5. TEST_STRATEGY now gives normal workflows a 3-minute hard ceiling and the representative workload a 5-minute hard ceiling; timeout is a performance blocker, not permission to extend runtime.
6. EXECUTION adds Chat 10 for `7.4`; Chats 8 and 9 remain `7.2` and `7.3` respectively.

### S&T / dependency review

After correction:

```text
TREE nodes                 28
implementation leaves      20
root capability branches    7
missing child references    0
one-child decompositions    0
invalid leaf dependencies   0
dependency cycles           0
chat allocation            10
```

The release sequence is now intentionally serial:

```text
7.1 offline candidate
→ 7.2 local acceptance tooling
→ 7.3 cleanup/docs/final candidate
→ 7.4 user-dependent target-machine acceptance
```

`7.4` depends on `7.3`; transitive dependencies therefore preserve `7.1` and `7.2` without redundant direct edges.

### Necessity / sufficiency challenge

- `7.2` is necessary because existing tests prove components but do not give the user one deterministic local acceptance flow or explicit static-market semantics.
- `7.3` remains necessary because acceptance should run only against the cleaned/documented final candidate.
- `7.4` is necessary because Fake Market cannot prove the user's actual browser/provider boundary or real market movement.
- The four children of branch `7` are sufficient together: deterministic candidate proof, reusable local acceptance, release cleanup, and final external target-machine evidence.

The static authenticated smoke is not allowed to substitute for the market-open gate; synthetic movement is not allowed to substitute for real-provider movement. Conversely, the market-open requirement no longer blocks deterministic development or cleanup.

### KISS / preservation result

PASS.

No new provider simulator, database, transport, strategy subsystem or test runner is introduced. The new acceptance kit must reuse the already-proven Fake Market, normal runtime, local service, DuckDB and representative workload.

All completed nodes `1.1` through `6.2` remain valid. Current `6.3` work remains valid and resumes unchanged after re-freeze. No completed implementation evidence is invalidated.

### Re-freeze decision

PASS.

The affected planning area is coherent, allocation is repaired with one new final chat, and implementation may resume at Chat 7 / node `6.3`.


## R-US-EXEC-REOPEN-004 — Correctness-first CI, configurable load probes and daily DB review

**Result:** PASS AFTER CORRECTION

**Trigger:** During Chat 7, hosted `4096 × 45` probes consumed the weak GitHub runner without providing a useful target-machine performance conclusion. The user clarified three product/testing facts: CI should emphasize many fast correctness tests and only light performance sanity; serious load/performance proof belongs on the user's stronger target machine at the final stage; and the active market-data DB is intended to hold one trading day, not years of intraday history. The user also requested a smarter configurable Fake Market/generator so performance probes can isolate only the subsystem being measured.

### Planning defect

The frozen contracts conflated three different jobs:

```text
correctness proof
hosted-runner performance observation
target-machine release performance
```

`6.3` and `7.1` effectively required the full `4096 × 180` workload as pre-release/CI-style evidence, even though GitHub-hosted hardware is not representative of the intended local machine. The workload was also too monolithic: Scanner/read measurement could require replaying many real commits and full runtime layers even when those layers were irrelevant to the performance question.

Finally, the performance model implicitly allowed active history to grow indefinitely, while the intended operating model is one trading day per active DB with optional archival/reset between days.

### Correction

The smallest affected area remains `6.3` plus release branch `7`; no completed node is reopened.

1. Revised `D-US-011`: `4096 × 180` remains the heavy end-to-end target-machine profile, but hosted CI is no longer performance authority.
2. Added `D-US-021`: Fake Market and workload tooling share one externally configurable deterministic synthetic generator/profile rather than duplicate large fixtures.
3. Added `D-US-022`: active market-data authority is one trading day; performance profiles are day-bounded and saved queries must survive new-day reset/rotation.
4. Rewrote TREE `6.3` around correctness-first bounded CI smoke, approximately-4k width sanity, isolated persistence/read/Scanner probes, and target-machine heavy-profile exposure.
5. Rewrote TREE `7.1` so the final offline candidate requires Fast, Browser and bounded workload correctness/sanity only.
6. Reworked `7.2` to package configurable Fake Leumi plus isolated and end-to-end load profiles.
7. Extended `7.3` to document/prove the safe one-day archive/reset operational lifecycle.
8. Extended `7.4` so heavy `4096 × 180`, one-day-sized isolated performance and new-day lifecycle PASS are final target-machine evidence.
9. TEST_STRATEGY and TECHNICAL_SPEC now explicitly separate component probes from end-to-end probes and allow efficient direct seeding of day-bounded Scanner/read datasets.
10. EXECUTOR_HANDOFF now forbids treating weak hosted-runner timing as release-performance authority.

### S&T / allocation review

The correction changes evidence ownership, not capability count or dependency order:

```text
TREE nodes                 28
implementation leaves      20
root capability branches    7
chat allocation            10
new leaf nodes              0
new product subsystem       0
```

Existing serial order remains valid:

```text
Chat 7: 6.3 → 7.1
Chat 8: 7.2
Chat 9: 7.3
Chat 10: 7.4
```

No reallocation is required.

### Correctness / performance boundary challenge

PASS.

The revised proof model does not weaken correctness:

- Unit/service/browser correctness stays extensive in CI.
- Workload count/history/latest/restart/Scanner/report correctness stays automated with bounded fixtures.
- At least one approximately-4096-security width sanity remains in CI to catch full-universe shape problems.
- Heavy timing moves to the machine where the product will actually run rather than disappearing.
- The final target-machine bundle still requires the full `4096 × 180` end-to-end profile.
- Scanner/read performance gains a stronger one-day-sized dataset proof because the harness can seed the intended data shape directly instead of paying for irrelevant browser/transport work.

### Daily DB challenge

PASS with the following boundary:

```text
active DB = one trading day of market authority
prior day = optional archive
new day = fresh market tables/authority
saved queries = preserved user configuration
```

This remains the existing DuckDB architecture. It does not add a warehouse, multi-day analytics subsystem or second database engine. Release work owns only the smallest safe stop/archive/reset/new-day procedure and its proof.

### Preservation result

All completed nodes `1.1` through `6.2` remain valid.

Current `6.3` implementation work remains useful, including static Scanner optimization evidence and the discovered duplicate persistence work. The failed hosted `4096 × 45` run remains diagnostic history but is no longer a release-performance gate. Known obviously duplicated work should still be removed when it materially improves the real runtime; the correction only prevents weak CI hardware from defining the product's performance PASS/FAIL.

### Re-freeze decision

PASS.

No TREE dependency or chat-allocation change is required. Reset `6.3` from planning `blocked` back to `in_progress`, freeze the plan, restore root phase `implementation`, and resume Chat 7 under the revised correctness-first/performance-target-machine contract.


## R-US-EXEC-REOPEN-005 — Demo Buy strategy-validation final review

**Result:** PASS AFTER CORRECTIONS; IMPLEMENTATION BLOCKED ON CI AVAILABILITY

**Trigger:** Before executing the previously final target-machine leaf `7.4`, the user added a new product requirement: finish a Demo Buy strategy-validation feature first so Scanner-selected candidates can be treated as virtual buys and inspected later to determine whether `Price` actually rose or fell over short horizons. The user also explicitly changed sequencing so all remaining development must finish before target-machine/authenticated acceptance.

### Scope of reopen

The smallest affected area is Scanner branch `4` plus release branch `7`.

Completed nodes `1.1` through `7.3` remain valid evidence for the capabilities they already proved. The previously unexecuted `7.4` is deferred rather than invalidated.

New implementation leaves are:

```text
4.3.1 schema v4 / migration / Demo Buy persistence
4.3.2 serialized capture authority / protocol
4.3.3 trusted evaluation / read model
4.4.1 Scanner capture controls / automatic capture
4.4.2 dedicated Demo Buy outcome screen
7.5   post-feature deterministic release re-closure
```

`7.4` remains the final user-dependent target-machine/authenticated acceptance leaf.

### Structural S&T review

PASS after dependency repair:

```text
TREE nodes                 36
implementation leaves      26
root capability branches    7
missing child references    0
invalid parent counts        0
one-child decompositions    0
invalid leaf dependencies   0
dependency cycles           0
non-approved nodes          0
```

Dependency corrections made during review:

- `4.4.2` now depends on `4.4.1`, because its required browser E2E starts from real Scanner capture controls rather than an imagined stub path;
- `7.5` depends on both `4.4.1` and `4.4.2`, so release re-closure cannot start with only half of the user workflow complete.

### Necessity challenge

Every new leaf is necessary:

- `4.3.1`: without durable capture facts and schema lifecycle there is no restart-safe observation authority;
- `4.3.2`: schema alone cannot define the precise virtual-buy moment, writer race semantics or exact baseline linkage;
- `4.3.3`: stored capture facts do not answer what happened later without one trusted calculation/read layer;
- `4.4.1`: the user cannot create observations from Scanner results without capture controls;
- `4.4.2`: backend evidence is not a usable strategy-validation product without an inspection surface;
- `7.5`: the old release candidate predates schema/UI/protocol changes and cannot be the accepted final SHA.

Removing any of these leaves leaves a user requirement or release-safety condition unowned.

### Sufficiency / outside-in user walkthrough

PASS.

A fresh user journey is fully owned:

```text
activate/edit Scanner SQL
→ successful ordered result generation
→ choose Selected / All / Top X or session-only Auto All / Auto Top X
→ browser preserves exact active-generation provenance
→ Node captures one authoritative moment without user-entered price
→ each item links (buy_cycle_id, security_id) to exact history baseline
→ later history continues to accumulate normally
→ Node recomputes 10s/20s/30s/45s/60s/90s/120s/3m/5m/10m outcomes
→ Demo Buy screen shows baseline, future Price, %, direction and actual observation timing
→ Refresh progressively changes UNAVAILABLE horizons into observed outcomes
```

The user can therefore answer the intended Phase-1 question directly: “If I had bought this Scanner candidate at that captured moment, what happened afterward?”

### Corrections discovered during review

1. **Wrong possible horizon anchor** — contracts were aligned so horizons start at Node-authoritative `captured_at_ms`, not the potentially older baseline `collected_at_ms`.
2. **Backend ownership too coarse** — one vague backend leaf was decomposed into persistence, capture authority and evaluation/read model.
3. **UI could have been forgotten** — the dedicated Demo Buy screen is an explicit implementation leaf with its own success evidence.
4. **Hidden truncation risk** — `All`/auto-All may not silently truncate above 5000 unique IDs; they fail visibly. `Top X` is explicitly bounded.
5. **Invalid identity ambiguity** — recognized identity cells are fail-closed; invalid chosen rows cannot be silently skipped or guessed from `Symbol`.
6. **Browser/Node dedupe boundary** — browser reduces duplicate canonical IDs by first occurrence before submission; Node independently requires the payload to be unique and ordered rather than silently repairing malformed protocol input.
7. **Auto-capture backlog risk** — Phase 1 uses one bounded in-flight auto-capture slot; a Scanner generation arriving while busy is visibly skipped, not queued without bound, and no replay subsystem is added.
8. **Baseline integrity ambiguity** — a missing linked baseline after successful capture is a data-integrity failure, not an ordinary `UNAVAILABLE` future horizon.
9. **Daily rollover ambiguity** — Demo Buy evidence is day-bounded with its referenced history; unresolved future horizons do not bridge into the fresh next-day active DB.
10. **Navigation assumption checked against current code** — Scanner remains mounted while top-level views switch, so automatic capture can continue while Demo Buy is visible without a new scheduler subsystem.

### Contract consistency

PASS across PRODUCT_REQUIREMENTS, PRODUCT_SPEC, DATA_CONTRACT, TECHNICAL_SPEC, TEST_STRATEGY and DEMO_BUY_VALIDATION on the material invariants:

```text
canonical identity           = security_id / securityId from validated PaperId
virtual-buy moment           = captured_at_ms inside serialized Node operation
baseline                     = history(buy_cycle_id, security_id)
manual buy price             = forbidden
persisted future outcomes    = none
horizon authority            = first same-security history row >= captured_at_ms + H
horizons                     = 10s,20s,30s,45s,60s,90s,120s,3m,5m,10m
calculation owner            = trusted Node read model
browser calculation          = none
screen                       = dedicated Demo Buy top-level surface
active-day lifecycle         = prior DB may archive; fresh DB starts Demo Buy empty
Phase 2 liquidity/sellability= explicitly deferred
```

### Failure / edge walkthrough

PASS for:

- empty Scanner result;
- Scanner result without exactly one canonical ID column;
- invalid canonical identity cell;
- duplicate IDs;
- more than 5000 unique selected IDs;
- Top X bounds;
- capture racing a market-cycle commit;
- one unresolved latest security causing all-or-nothing rollback;
- persistence failure and later recovery;
- repeated same security in later independent captures;
- null/zero baseline Price;
- null future Price;
- no future row yet;
- delayed future observation;
- missing baseline integrity failure;
- pagination stability;
- saved-query edits after an old capture;
- auto capture busy/failure without stopping Scanner scheduling;
- Viewer navigation while Scanner/auto remains active;
- restart and new-day rollover.

### KISS challenge

PASS.

The plan deliberately does not add:

- Strategy Engine;
- order/fill simulator;
- portfolio state;
- background horizon updater;
- materialized ten-horizon columns;
- temporal feature subsystem;
- second DB;
- second transport;
- cross-day analytics warehouse;
- auto-capture replay queue;
- Phase-2 volume/liquidity/sellability logic.

Two tiny persistence tables plus direct bounded trusted reads over existing `history` are the smallest sufficient mechanism until measurement proves otherwise.

### Planned serial allocation

The revised implementation order is:

```text
Chat 10: 4.3.1 → 4.3.2
Chat 11: 4.3.3
Chat 12: 4.4.1
Chat 13: 4.4.2
Chat 14: 7.5
Chat 15: 7.4
```

This reuses the previously unexecuted Chat 10 slot rather than creating an artificial gap. Final target-machine acceptance moves to Chat 15 and remains last.

### CI / Actions blocker

The user reported that GitHub Actions is currently unavailable for the required CI workflow. This review does not claim a Planning Docs CI run while that condition exists.

Therefore the safe state is:

```text
plan_state = frozen
execution allocation = prepared
root phase = planning
implementation_authorized = false
blocker = required GitHub Actions/CI unavailable
```

This preserves the fully reviewed plan while making it mechanically impossible for an executor to start production code under the AGENTS authorization gate.

### Freeze decision

PASS — Demo Buy planning is complete enough to freeze.

Implementation must **not** begin until the planning work unit can pass its required GitHub Actions/CI gate, merge according to repository workflow, and root status is deliberately advanced to `phase: implementation`.
