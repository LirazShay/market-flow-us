# Planning Reviews

### R-001 — 2026-09-27 — Stage 1 bootstrap/source-discovery boundary

**Result:** pass

**Gates checked:**
- goal/source-of-truth boundary
- progressive disclosure
- migration direction
- S&T bootstrap integrity
- KISS
- no premature production implementation
- fresh-session continuity

**Findings:**
- MarketScope was empty and can be bootstrapped cleanly.
- D-043/D-045 support provider/product continuity and Node/native-DuckDB authority.
- Direct V1 Current, Detail, provider pure logic, fixtures and tests exist without loading Browser-SQL archaeology.
- GitHub visibility is currently private; repository policy remains public-safe.
- Product behavior is not yet sufficiently extracted to authorize implementation.

**Corrections made:**
- Market Flow is explicitly reference-only.
- Browser-SQL/old S&T artifacts are excluded from HOT context.
- package/application scaffolding is deferred until the frozen plan justifies it.

**Opened/referenced decisions:** None.

**Next review target:** Exact V1 Current Universe contract extraction.

### R-002 — 2026-09-27 — Stage 1 CI verification correction

**Result:** pass

**Gates checked:**
- planning/docs guard correctness
- failure diagnosability
- final Stage 1 repository validation

**Findings:**
- The first Planning Docs CI guard used one brittle literal grep for the four SOURCE_EXTRACTION dispositions and failed without identifying the specific assertion.
- The product/planning documents themselves were present; the verification guard was wrong.

**Corrections made:**
- Validate KEEP, ADAPT, DROP and INVESTIGATE individually.
- Give every structural grep a concrete failure message.
- Re-run the workflow on the corrected baseline.

**Verification:**
- Planning Docs CI run 36311891900: PASS on commit d3da3649f565272d0cfdb4aa462bc0e787e760e2.

**Opened/referenced decisions:** None.

**Next review target:** Exact V1 Current Universe contract extraction.

### R-003 — 2026-09-27 — Stage 2 V1 Current Universe extraction

**Result:** pass

**Gates checked:**
- source scope stayed limited to Current and directly coupled Viewer refresh/state evidence
- exact row-set and identity semantics
- exact 16-column shape
- missing/zero formatting
- deterministic sorting and tie-breakers
- populated/empty/error semantics
- live/manual refresh behavior
- sort/viewport preservation evidence
- row activation/accessibility boundary
- implementation-mechanism leakage

**Findings:**
- Current is derived from authoritative latest rows; universe is enrichment and cannot remove a valid latest row.
- V1 has a precise 16-column contract and deterministic sort contract.
- V1's literal IndexedDB success/error wording is observable but is storage-mechanism leakage and must be adapted under the accepted Node/DuckDB authority.
- BroadcastChannel is an implementation mechanism; notification-as-hint plus authoritative reread is the durable behavior.
- Sort preservation has direct Chromium proof.
- Stage 2 did not yet inspect the Detail round-trip test; Stage 3 later found direct horizontal scroll-restoration evidence there.

**Corrections made:**
- Replaced the Stage 2 placeholder in `docs/PRODUCT_SPEC.md` with the evidence-backed Current contract.
- Explicitly separated durable behavior from V1 IndexedDB/BroadcastChannel mechanics.
- Kept viewport preservation as a product requirement; Stage 3 later upgraded its evidence level after reading the owning Detail round-trip test.

**Opened/referenced decisions:** None.

**Next review target:** Stage 3 exact Security Detail / History extraction.

### R-004 — 2026-09-27 — Stage 2 verification closure

**Result:** pass

**Gates checked:**
- Stage 2 extracted contract persisted on main
- Planning Docs CI on the full Stage 2 document set
- no production implementation introduced
- next pointer advances only after verification

**Verification:**
- Planning Docs CI run 36312255951: PASS on commit c34edb86cb8617f1b1bffc1d528238ca4d569964.

**Pending:** None for Stage 2.

**Next review target:** Stage 3 Security Detail / History extraction.

### R-005 — 2026-09-27 — Original-brief anti-forgetting coverage pass

**Result:** pass

**Purpose:** Convert the large original MarketScope brief into a durable granular coverage inventory without inflating the causal S&T tree.

**Findings:**
- The original brief contains substantially more work than the early extraction stages: protocol, transactionality, restart, Scanner hardening, Fake Market, demo, layered testing, workload, live verification, CI, serial execution and final handoff all need durable coverage.
- Relying only on stage-by-stage memory would create a material omission risk.
- Mirroring every granular obligation as an S&T leaf would create the opposite problem: an oversized task tree with poor causal structure.

**Correction:**
- Added `.planning/MASTER_COVERAGE.md` with granular stable IDs across governance, migration, product contracts, protocol, DB, Scanner, Fake Market, tests, workload, CI, S&T, execution and final quality.
- Added a mandatory re-audit cadence.
- Required each coverage ID to map before freeze to a durable owner/decision/S&T node or explicit N/A rationale.
- Kept the existing Stage 3 pointer unchanged; this pass is a planning-quality safeguard, not advancement of product-extraction work.


### R-006 — 2026-09-27 — Stage 3 V1 Security Detail / History extraction

**Result:** pass

**Gates checked:**
- canonical Detail identity and entry
- exact current/detail summary
- exact history row shape
- ordering/page-size/continuation
- equal-timestamp duplicate/skip protection
- Load More and retry behavior
- loading/empty/error/not-found distinctions
- live Detail refresh and loaded-depth preservation
- historical-only continuity
- Back-to-Current sort/viewport preservation
- provider-call prohibition
- IndexedDB mechanism leakage

**Findings:**
- V1 directly proves a 500-row newest-first per-security initial page.
- V1 continuation tracks both index position and primary row identity, and directly proves no duplicate/skip across an equal-timestamp 500/501 boundary.
- V1 Detail refresh reloads enough pages to preserve already-loaded depth and directly proves 502 loaded rows become 503 after a new cycle.
- The direct Detail round-trip Playwright test proves Current sort and horizontal scroll restoration, correcting the weaker Stage 2 evidence assessment.
- V1 entry/refresh is coupled to a Current row, but the accepted V2 product shape explicitly requires persisted historical-only securities to remain useful.

**Corrections / clean-contract adaptations:**
- Historical-only Detail is keyed directly by canonical SecurityId.
- Absence from Current no longer makes Detail refresh fail.
- Missing Current summary values remain unavailable rather than being synthesized from newest history.
- Completely unknown SecurityId is distinct from known security with empty history.
- IndexedDB cursor mechanics are not preserved as architecture; only deterministic keyset/no-duplicate/no-skip behavior is preserved.

**Decision:** D-001 resolved historical-only summary semantics.

**Next review target:** Stage 4 provider / Recorder / complete-cycle data-contract extraction.

### R-007 — 2026-09-27 — Stage 3 verification closure

**Result:** pass

**Verification:**
- Planning Docs CI run 36312869099: PASS on commit a5d362ab3a9c60def441b6f9e9b421d50a105f6b.

**Pending:** None for Stage 3.

**Next review target:** Stage 4 provider / Recorder / complete-cycle data-contract extraction.

### R-008 — 2026-09-27 — Stage 4 provider/Recorder/data-contract extraction

**Result:** pass

**Gates checked:**
- provider endpoint roles and evidence level
- dynamic universe / no hardcoded size
- source-specific PaperId/Key canonicalization
- no index-based joins
- chunk request/response membership
- response-order independence
- sequential collection baseline
- chunk/cycle timing semantics
- whole-cycle exact completeness
- raw MapHeat/Security preservation
- null/zero/empty/missing fidelity
- failure versus authority separation
- commit-before-success boundary
- exact Browser→Node universe/cycle objects
- provider credentials excluded from Node
- V1 defaults separated from product requirements

**Findings:**
- MapHeat identity is strictly `PaperId`; Security identity is strictly `Key`; both canonicalize with `String`.
- GetSecuritiesData may return a different order than requested; exact membership is set/identity based.
- V1 validates missing/unexpected/duplicates at both chunk and whole-cycle boundaries.
- V1 successful cycle omits an explicit `unexpected` counter only because success validation already proved zero.
- V1 complete-cycle data is already close to a clean provider-neutral transport object.
- Old 187/1000ms/3000ms values are implementation evidence/defaults, not product laws.
- Node does not need Browser chunk-planning helper fields or IndexedDB-shaped row IDs.

**Corrections / clean-contract adaptations:**
- Defined a minimal `ValidatedUniverse` boundary with normalized identity/metadata plus full raw MapHeat record.
- Defined exact `CompleteCycle` Browser→Node shape and added explicit `unexpected: 0`.
- Defined universe-replace ACK ordering before cycles validated against a refreshed universe.
- Defined a bounded nullable-counter `FailedCycleReport` as diagnostics only.
- Recorded D-002 and D-003.

**Next review target:** Stage 5 product requirements/spec completeness and mandatory original-brief coverage re-audit.

### R-009 — 2026-09-27 — Stage 4 verification closure

**Result:** pass

**Verification:**
- Planning Docs CI run 36313267463: PASS on commit c2acc4a260ffc863f0deb5ea461e9c00db59024f.

**Pending:** None for Stage 4.

**Next review target:** Stage 5 product requirements/spec completeness plus mandatory original-brief coverage re-audit.

### R-010 — 2026-09-27 — Stage 5 original-brief / product-completeness review

**Result:** pass pending CI verification

**Gates checked:**
- original brief re-read end-to-end
- MASTER_COVERAGE compared to original product obligations
- PRODUCT_REQUIREMENTS WHAT/WHY completeness
- Current + Detail extraction completeness
- Scanner product behavior completeness
- all eight mandatory user flows
- operational health/diagnostics
- failure/recovery observable behavior
- Fake Market product-mode expectations
- restart/persistence observable behavior
- product/technical separation
- KISS / legacy-surface pruning

**Omission found:**
- Dedicated user-visible recorder/health diagnostics coverage was missing from the first MASTER_COVERAGE and Product Spec despite being explicitly requested in the original brief.

**Corrections:**
- Added DIAG-001..DIAG-020.
- Added V1-evidenced operational diagnostics contract.
- Completed PRODUCT_REQUIREMENTS for integrity, locality, recovery, offline verification and quality.
- Expanded Scanner and all eight mandatory product flows.
- Recorded D-004 to retain useful health metrics while dropping IndexedDB quota and initial Debug Bundle UI from MarketScope product scope.

**Product-level result:**
- READY-001 Current extraction: satisfied.
- READY-002 Detail/History extraction: satisfied.
- READY-003 Provider/Recorder/data extraction: satisfied.
- READY-004 Product Requirements complete/reviewed: satisfied.
- READY-005 Product Spec complete/reviewed: satisfied.
- READY-006 Data Contract complete/reviewed: satisfied.
- Remaining READY gates are technical/test/S&T work and are not skipped.

**Next review target:** Stage 6 implementation-ready Technical Spec.

### R-011 — 2026-09-27 — Stage 5 verification closure

**Result:** pass

**Verification:**
- Planning Docs CI run 36313611783: PASS on commit a3d41f2aad518f5ad890d927bf8de75df8a39407.

**Pending:** None for Stage 5.

**Readiness advanced:**
- READY-001 through READY-006 satisfied.
- READY-007 and later remain open and owned by subsequent technical/test/S&T stages.

**Next review target:** Stage 6 implementation-ready Technical Spec.

### R-012 — 2026-09-27 — Stage 6 implementation-ready Technical Spec review

**Result:** pass pending CI verification

**Gates checked:**
- current supported Node/DuckDB/ws dependency baseline
- Browser/Node process ownership
- one-root-package/KISS architecture
- self-contained browser runtime delivery
- exact protocol envelope/roles/operations/errors
- Origin/loopback/message-size policy
- one producer / multiple viewers
- service/session lifecycle and heartbeat/stale semantics
- schema v1 and raw-data retention
- atomic universe/cycle/failure transactions
- whole-latest replacement
- deterministic history keyset pagination
- restart/stale-session recovery
- metadata-only refresh notification
- Scanner scheduler
- DuckDB-native single-statement/SELECT admission
- side-effect function hardening
- Fake Market/demo topology
- production/demo/test path separation
- shutdown/logging/security
- external provider CSP/LNA honesty

**External verification findings:**
- Node 24 is currently LTS.
- current `@duckdb/node-api` npm baseline is 1.5.5-r.5 and the old `duckdb` Node package is deprecated.
- Node Neo high-level API directly exposes `extractStatements()` and prepared `statementType`, so no direct low-level bindings dependency is needed.
- DuckDB documents `has_side_effects` in `duckdb_functions()`.
- DuckDB documents `query()` as able to execute arbitrary query text and potentially change database state.
- required hardening settings exist in current DuckDB.
- current `ws` package baseline is 8.21.3.
- loopback is treated as potentially trustworthy, but current browser Local Network Access/provider CSP can still affect an HTTPS page's loopback connection and must be proved against the real provider.

**Decisions:** D-005 through D-009.

**Readiness result:**
- READY-007 through READY-013 satisfied after CI.
- READY-014 through READY-016 remain Stage 7 work.

**Next review target:** Stage 7 Test Strategy + canonical Fake Market/demo proof contract.

### R-013 — 2026-09-27 — Stage 6 verification closure

**Result:** pass

**Verification:**
- Planning Docs CI run 36314893944: PASS on commit 5be155d81a2a0f783fbbde8905a1287a6cf6733a.

**Readiness advanced:**
- READY-007 through READY-013 satisfied.
- READY-014 through READY-016 remain open for Stage 7.

**Pending:** None for Stage 6.

**Next review target:** Stage 7 Test Strategy + canonical Fake Market/demo verification contract.

### R-014 — 2026-09-27 — Stage 7 Test Strategy / Fake Market review

**Result:** pass pending CI verification

**Gates checked:**
- original brief testing/Fake Market sections re-read
- public-contract/test-first discipline
- cheapest-layer ownership
- exact Unit scope
- real service integration with real ws + DuckDB
- rollback fault-injection matrix
- Scanner non-mutation matrix
- canonical real HTTP Fake Market
- deterministic complete logical-cycle advancement
- synthetic zero/null/missing/failure/universe-change scenarios
- full Chromium end-to-end topology
- no page.route dependency for main happy path
- manual demo uses identical infrastructure
- safe demo reset
- representative 561×600 workload
- measurement-before-optimization
- bounded sanitized real-provider gate
- Fast/Browser/workload/live CI ownership
- clear "proves / does not prove" boundaries

**Findings:**
- V1's testing discipline is largely reusable, but the Node/DuckDB architecture makes real service integration part of the fast core rather than a browser-only concern.
- V1's sanitized four-security fixtures are a useful base but the old main provider mock depended on Playwright interception.
- The canonical fake needs state across multiple real HTTP chunk requests so one Browser cycle observes one deterministic logical synthetic cycle.
- Transaction rollback requires an explicit test-only fault seam; assertions remain on response/durable state.
- No evidence supports a numeric performance SLO before the first native-DuckDB workload baseline.

**Decisions:** D-010 through D-013.

**Readiness result:**
- READY-014 through READY-016 satisfied after CI.
- READY-001 through READY-016 are therefore satisfied.
- S&T decomposition/review/freeze gates remain open.

**Next review target:** Stage 8 build the causal S&T decomposition from the completed product/data/technical/test contracts.

### R-015 — 2026-09-27 — Stage 7 CI guard correction

**Result:** pass

**Finding:**
- The Stage 7 planning guard searched for the prose literal `561 × 600`, while TEST_STRATEGY deliberately expresses the workload contract as separate `universe = 561` and `cycles = 600` facts.

**Correction:**
- Validate the two semantic workload facts independently instead of coupling CI to one formatting phrase.

**Product/test strategy impact:** None. The verification contract itself was already present.


### R-016 — 2026-09-27 — Stage 7 verification closure

**Result:** pass

**Verification:**
- Initial Stage 7 Planning Docs CI run 36315314478 failed only because the guard searched for one prose formatting literal instead of the two workload facts.
- Corrected Planning Docs CI run 36315358874: PASS on commit c77c56b276a8d694b99d0111a5443e5b501db9b3.

**Readiness advanced:**
- READY-014 Fake Market contract: satisfied.
- READY-015 local demo contract: satisfied.
- READY-016 verification-layer contract: satisfied.
- READY-001 through READY-016 are now satisfied.

**Pending:** None for Stage 7.

**Next review target:** Stage 8 causal S&T implementation decomposition.

### R-017 — 2026-09-27 — Branch/PR workflow governance

**Result:** process correction applied through the new workflow itself.

**Reason:**  
Direct writes to `main` make it too easy to mix partial work, verification fixes and accepted state. MarketScope benefits from a stronger review boundary as the plan moves from contracts into S&T decomposition and later implementation.

**Decision:**  
Meaningful work units use focused branches and pull requests. The branch owns the full work unit and its verification fixes; CI must be green before squash merge. `main` remains the last accepted verified truth. A normal user-facing stage should now be larger/coherent enough to justify a branch rather than producing many tiny main commits.

**Interruption rule:**  
If a work unit is interrupted before merge, continuation must inspect/resume its open PR/branch before creating overlapping work.

**Platform note:**  
This is a repository operating rule enforced by workflow discipline and review. Current connector capabilities do not provide administration writes for GitHub branch-protection/ruleset configuration, so this does not claim server-side protection is enabled.

### R-018 — 2026-09-27 — First branch-workflow CI failure review

**Result:** corrected on the same feature branch.

**Technical root cause:**  
The first workflow edit used JavaScript `String.replace` with replacement text containing a dollar-sign/end-anchor sequence that JavaScript interpreted as a special replacement token. That duplicated/corrupted the rest of the workflow.

**Reasoning/process cause:**  
The generated workflow was not reread in full before the PR was treated as ready.

**Escape cause:**  
The defect remained on the feature branch and could not reach `main`; the branch/PR boundary exposed it immediately.

**What to do differently:**  
For generated text substitutions, use a replacer function or another method that cannot interpret replacement tokens. For CI/workflow edits, reread the complete rendered file from the branch before merge.

**Smallest prevention:**  
Mandatory final-file inspection for CI/workflow edits. No new YAML framework or extra process layer.

**Learning promotion:**  
Keep the lesson narrow; the feature-branch/PR boundary plus final-file inspection is sufficient.

### R-019 — 2026-09-27 — Stage 8 causal S&T decomposition

**Result:** decomposition complete; local node approval intentionally deferred to Stage 9.

**Scope:**
- Converted the completed Product/Data/Technical/Test contracts into one causal implementation tree.
- Kept the tree compact rather than mirroring the granular MASTER_COVERAGE.
- Stopped at implementation-ready leaves with explicit `depends_on` and success evidence.
- Did not freeze the plan.
- Did not allocate `EXECUTION.yaml`.
- Did not write production code.

**Shape / structural proof:**
- 7 top-level capability branches.
- 27 implementation-ready leaves.
- 35 total nodes including root/parents.
- every `depends_on` references an existing leaf;
- no self-dependencies;
- no dependency cycles;
- `EXECUTION.yaml -> chats: {}` remains empty.

**Planning correction discovered:**
- The earlier technical/test documents had left the lightweight browser bundler and non-browser test runner as an implementation choice. D-014 resolves this to esbuild + node:test + Playwright so executor chats do not re-plan tooling.

**Review status:**
- All nodes intentionally remain `draft` until Stage 9 checks Strategy/Tactic validity, necessity, sufficiency, assumptions, dependency correctness and KISS.
- Whole-plan outside-in coverage mapping, Final Planning Review, freeze and executor allocation remain later work.

### R-020 — 2026-09-27 — Stage 8 branch verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-08-st-decomposition`
- PR: #2

**Structural verification before PR:**
- 35 total nodes;
- 7 top-level capability branches;
- 27 implementation-ready leaves;
- every dependency references an existing leaf;
- no self-dependencies;
- no dependency cycles;
- every node remains `draft`;
- `EXECUTION.yaml` remains empty;
- `plan_state` remains `active`.

**PR verification:**
- Planning Docs CI run 36316479150: PASS on commit 7c3896081b3e916ef8e96e6da269394ee4e68e7b.

**Stage boundary:**
- Stage 8 only decomposed the implementation plan.
- No necessity/sufficiency/KISS approval was claimed.
- No freeze, EXECUTION allocation or production implementation occurred.

**Next review target:** Stage 9 local S&T necessity/sufficiency/KISS/dependency review.

### R-021 — 2026-09-27 — Stage 9 first-pass necessity / sufficiency / KISS findings

**Result:** corrections applied; approval pending final structural/review pass.

**Review method:**  
Each of the 35 Stage-8 nodes was challenged locally for Strategy↔Tactic validity, child necessity, child-set sufficiency, assumption quality, implementation-ready leaf size and execution-only dependency semantics.

**Gaps/corrections found:**
1. **Missing Browser composition owner.** Individual producer, Viewer and Scanner leaves did not explicitly own the final production browser bootstrap/start-daily-collection composition. Added leaf `4.4` for one idempotent normal runtime shell.
2. **Execution dependencies were over-specified.** Several leaves encoded preferred sequencing or transitive prerequisites rather than “cannot correctly begin until”. Reduced them to direct implementation prerequisites.
3. **Fake Market was unnecessarily coupled to provider-adapter implementation.** It can be built from the durable Data Contract plus browser build foundation, so `6.1` no longer waits for `2.1`.
4. **Browser CI was unnecessarily coupled to Fast-CI completion.** Browser E2E needs completed product surfaces + Fake Market, while Fast CI is an independent final gate.
5. **Workload/live verification had unnecessary CI/E2E sequencing dependencies.** Their direct prerequisites are the actual service/product capabilities they exercise.
6. **GOAL current reality was stale.** It still said V1 extraction remained to be done; updated it to the actual pre-implementation state.
7. **Failure-learning governance was only conversational/Test-Strategy guidance.** Added the generalized RCA/escape/prevention rule to `AGENTS.md` so executor chats inherit it.

**KISS outcome:**  
No new framework, Issue system, service, task database or planning layer was added. GitHub Issues remain unnecessary; TREE/EXECUTION/STATUS remain the execution-management system.

### R-022 — 2026-09-27 — Stage 9 second-pass dependency and approval review

**Result:** pass

**Second-pass findings:**
- `4.4` had an explicit `2.6` prerequisite already implied by both of its direct Browser-surface prerequisites; removed the redundant edge.
- `7.2` had an explicit `2.5` prerequisite already implied by its trusted-read prerequisites; removed the redundant edge.
- No remaining missing/non-leaf/self/cyclic dependencies.
- Every non-root node has a necessity assumption.
- Every parent has a sufficiency assumption.
- Leaves stop at implementation-ready scope and do not carry child-sufficiency claims.
- Every node has observable success evidence.
- Parent/child sets remain jointly sufficient after the KISS corrections.

**Approval:**  
All TREE nodes are approved for the current planning model. Approval means the local Strategy/Tactic/necessity/sufficiency/KISS review passed; it does **not** mean the plan is frozen.

**Still required before freeze:**
- outside-in end-to-end flow audit;
- full MASTER_COVERAGE mapping;
- final original-brief re-audit;
- Final Planning Review;
- freeze;
- EXECUTION allocation;
- fresh-chat simulation.

### R-023 — 2026-09-27 — Stage 9 final local S&T review + next completeness gate

**Result:** pass pending branch CI

**Final Stage 9 checks:**
- 36 total nodes;
- 7 top-level capability branches;
- 28 implementation-ready leaves after adding the missing Browser runtime composition owner;
- every node approved;
- every non-root node has a necessity assumption;
- every parent has a sufficiency assumption;
- every node has success evidence;
- all dependencies reference existing leaves;
- no self-dependencies;
- no dependency cycles;
- no transitive/redundant direct dependency edges remain;
- `EXECUTION.yaml` remains empty;
- `plan_state` remains active.

**KISS result:**
- No GitHub Issues planning layer introduced.
- No new runtime/framework/service added by planning review.
- Dependency edges describe true implementation prerequisites rather than preferred sequencing.

**Durable process improvement:**
- `AGENTS.md` now requires generalized failure learning: technical root cause, reasoning/process cause, escape cause, local fix/regression proof and smallest reusable prevention.

**User-requested next gate:**
- Added READY-031 and MIGCHECK-001..MIGCHECK-012.
- Stage 10 will re-enumerate relevant Market Flow V1/V2 evidence and compare it against MarketScope contracts/TREE before performing the outside-in flow/coverage audit.
- This is a second-pass migration completeness audit, not a trust-in-summary exercise.

**Stage 9 approval meaning:**  
The causal tree is locally coherent and KISS-reviewed. It is **not frozen** and can still be corrected by Stage 10 completeness evidence.

### R-024 — 2026-09-27 — Stage 9 branch verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-09-st-review`
- PR: #3

**Verification:**
- Planning Docs CI run 36317214872: PASS on commit eb33ce8e3ee442f64571987ffb7ae97376b10096.

**Stage 9 result:**
- 36 S&T nodes approved after local Strategy/Tactic, necessity, sufficiency, dependency and KISS review.
- 28 leaves remain implementation-ready.
- the missing Browser composition owner was added;
- redundant sequencing dependencies were removed;
- generalized failure-learning governance is durable in AGENTS;
- no freeze/EXECUTION allocation/production code occurred.

**Next review target:** Stage 10 Legacy Migration Completeness + Outside-In Coverage Audit.

### R-026 — 2026-09-27 — Stage 10 outside-in + exact coverage mapping

**Result:** content review pass; branch CI pending.

**Legacy completeness:**
- fresh V1 inventory: 140 files, 102 core candidates;
- fresh V2 inventory: 236 files, 113 core candidates;
- rechecked previously under-read system/persistence/recovery/runtime/storage-growth evidence;
- rechecked V2 durable product shape, live-SQL product requirement, D-043, D-045, Node migration inventory and product-shape contract;
- corrected no-retention, Viewer independence and bookmarklet/runtime-delivery gaps;
- explicitly classified historical mechanisms that must not become MarketScope requirements.

**Outside-in result:**
- FLOW-001..FLOW-020 each map to an observable product contract, concrete S&T leaves and a proof owner;
- no required flow terminates in a document-only promise without implementation/proof ownership.

**Coverage result:**
- `.planning/COVERAGE_MAP.yaml` contains 660 exact unique IDs;
- current `MASTER_COVERAGE.md` contains the same 660 unique IDs;
- missing IDs: 0;
- extra IDs: 0;
- CI now fails on any future set mismatch.

**Original brief re-audit:**
- the complete original MarketScope brief was reread again during Stage 10;
- no original-brief requirement was found unowned after the legacy corrections and outside-in mapping.

**Planning-only guard:**
- while `plan_state: active`, CI rejects production implementation roots such as `package.json`, `browser/`, `local-service/`, `shared/`, or `tests/`;
- this mechanically protects READY-030 during the remaining planning stages.

**Readiness after CI:**
- READY-017 repository/package/CI structure justified by plan: pass;
- READY-018 material decisions resolved: pass;
- READY-019 necessity review: pass;
- READY-020 sufficiency review: pass;
- READY-021 KISS review: pass;
- READY-022 outside-in flow audit: pass;
- READY-023 no unmapped requirement: pass;
- READY-030 no accidental production implementation: pass;
- READY-031 legacy migration completeness: pass.

READY-024 Final Planning Review and READY-025..029 remain open.

### R-027 — 2026-09-27 — Repeated text-transformation failure promoted to durable prevention

**Result:** corrected on Stage 10 branch before PR.

**Failure:**  
The Stage 10 workflow edit repeated the earlier JavaScript replacement-token failure: replacement text containing a dollar-sign/end-anchor sequence was interpreted by `String.replace` and duplicated unrelated workflow suffix content.

**Why it recurred:**  
The prior lesson was recorded in REVIEWS but not promoted into the repository operating rules, so a later planning step could repeat the same unsafe transformation pattern.

**Escape:**  
Branch-first work + mandatory final-file reread caught the corruption before PR/merge. No bad workflow reached `main`.

**Generalized prevention promoted:**  
`AGENTS.md` now requires replacer-function/known-good-baseline construction for programmatic text edits when inserted text may contain `$`, plus complete rendered-file/diff inspection before PR.

**Scope:**  
This is a text-transformation/process safeguard, not a new product framework.

### R-028 — 2026-09-27 — Stage 10 verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-10-legacy-completeness`
- PR: #4

**Verification:**
- final pre-PR branch sanity check:
  - 660 unique MASTER_COVERAGE IDs;
  - 660 exact COVERAGE_MAP entries;
  - missing: 0;
  - extra: 0;
  - 36 S&T nodes remain approved;
  - EXECUTION remains empty;
  - plan_state remains active;
  - no production implementation roots exist.
- Planning Docs CI run 36318231813: PASS on commit 97f9925b883c53c6df51a09ac86299e3d4d54e6a.

**Stage 10 readiness closure:**
- READY-017 through READY-023: pass.
- READY-030: pass.
- READY-031: pass.
- READY-024 and READY-025..029 remain open.

**Meaning:**  
The clean MarketScope planning set now contains the product/integrity/runtime/test obligations found by the fresh legacy audit. This does not freeze the plan; Stage 11 must still perform the whole-plan Final Planning Review and one final original-brief comparison.

### R-029 — 2026-09-27 — Final Planning Review

**Result:** pass; branch verification pending.

**Review scope:**
- reread the complete original MarketScope brief one final time;
- reviewed GOAL, Product Requirements, Product Spec, Data Contract, Technical Spec, Test Strategy and Source Extraction as one contract set;
- reviewed all 14 decisions;
- reviewed all 36 approved S&T nodes / 28 implementation-ready leaves;
- reviewed the Stage 10 legacy-completeness audit;
- reviewed the full MASTER_COVERAGE ↔ COVERAGE_MAP traceability;
- reviewed freeze-readiness, negative space and execution-handoff assumptions.

**Final-review defects found and corrected:**
1. `GOAL.md` still described the S&T as under local review after Stage 9 had already passed.
2. Durable product/data/technical/test specs contained historical planning-stage/readiness snapshots that duplicated STATUS/REVIEWS ownership.
3. `MASTER_COVERAGE.md` duplicated READY-007..READY-016 in historical checkpoint/status prose; the old exact-set CI could not detect duplicate occurrences.
4. `SOURCE_EXTRACTION.md` retained eight stale `INVESTIGATE` classifications even though later technical/legacy reviews had already resolved them.
5. README's phase wording was planning-snapshot text rather than phase-neutral navigation.
6. Long-running work progress updates were only conversation-level behavior; `AGENTS.md` now makes useful progress orientation a durable repository rule.

**Post-correction proof:**
- MASTER_COVERAGE occurrences: 660; unique IDs: 660.
- COVERAGE_MAP occurrences: 660; unique IDs: 660.
- missing coverage IDs: 0; extra IDs: 0; duplicate IDs: 0.
- S&T: 36 nodes / 28 leaves; all approved; no parent/dependency/cycle/evidence errors.
- decisions: 14 total; 0 open.
- SOURCE_EXTRACTION: 0 unresolved `INVESTIGATE` entries outside the disposition definition.
- durable specs: 0 planning-stage/status-leak matches.
- production implementation roots while plan is active: 0.
- EXECUTION remains empty.
- `plan_state` remains `active`.

**Final brief result:**  
No original-brief requirement or Stage-10 legacy obligation remains unowned. No material contradiction remains between the product, data, technical, test and S&T contracts.

**Freeze recommendation:**  
The plan is ready to enter the dedicated freeze stage. This review does **not** itself mutate `plan_state`; Stage 12 owns the freeze transition and its guards.

### R-030 — 2026-09-27 — Progress-orientation rule

**Result:** promoted to repository governance.

**User problem:**  
Long tool-heavy work could leave the user waiting without understanding what was being checked, what had completed, or what remained.

**Prevention:**  
`AGENTS.md -> Long-running work progress updates` now requires concise periodic orientation during long work: current focus, completed work, remaining sub-steps, meaningful discoveries and blockers.

**KISS:**  
This is a communication rule only; no tracking service, issue system or extra planning layer was added.

### R-031 — 2026-09-27 — Stage 11 verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-11-final-planning-review`
- PR: #5

**Verification:**
- Final Planning Review content and guards were committed on the branch.
- Planning Docs CI run 36319112917: PASS on commit c70553830a6cf2782044f374a87c2ee93f07826e.

**Final Planning Review closure:**
- original brief final reread: pass;
- whole-contract consistency: pass;
- 14/14 decisions resolved;
- 36/36 S&T nodes approved;
- 28 implementation-ready leaves;
- 660/660 exact one-to-one coverage mapping;
- stale INVESTIGATE entries: 0;
- durable spec status leaks: 0;
- production implementation roots: 0;
- EXECUTION remains empty;
- `plan_state` remains `active` until Stage 12.

**Next:** Stage 12 Plan Freeze.

### R-032 — 2026-09-27 — Plan Freeze

**Result:** freeze transition prepared; branch CI pending.

**Entry gate:**
- Final Planning Review R-029: pass.
- Stage 11 PR head `c6bfdd9ed849ee18a32f700081cce63db3b986c3` and merged main `d06c194242ca867b84026148ae6a21188b731d4a` have the exact same Git tree SHA: `b4ec1421de322236970f10d202a0b52ad0b7c8f8`.
- Therefore the reviewed baseline did not drift during squash merge.
- 36 S&T nodes remain approved.
- 28 implementation-ready leaves remain unchanged.
- 14 decisions remain resolved.
- 660/660 coverage remains one-to-one.
- EXECUTION remains empty.
- No production implementation exists.

**Freeze semantics:**
- `.planning/STATUS.yaml -> plan_state: frozen` locks the reviewed contract/S&T baseline.
- root `STATUS.yaml -> phase: planning` continues to forbid production implementation through Stage 13 allocation and Stage 14 fresh-chat verification.
- implementation becomes eligible only after root phase advances to `implementation` with a frozen plan and allocated execution state.
- material execution-time planning defects explicitly reopen `.planning/STATUS.yaml -> active` and root phase `planning`.

**Freeze guards added:**
- a frozen state requires Final Planning Review evidence;
- every TREE node must remain `approved`;
- active state still requires empty EXECUTION;
- any root planning phase rejects production implementation roots regardless of frozen/active state.

**Correction:**
- fixed the stale EXECUTION comment that incorrectly said root `STATUS.yaml` owns `plan_state`; ownership is `.planning/STATUS.yaml`.

**Allocation:** intentionally deferred to Stage 13.

### R-033 — 2026-09-27 — Stage 12 freeze-guard CI failure

**Result:** corrected on the freeze branch; rerun pending.

**Technical root cause:**  
The new frozen-state Node heredoc was nested visually inside a shell `if`. YAML removed only the workflow block indentation, leaving extra spaces before the closing `NODE` delimiter. Bash therefore never recognized the heredoc terminator and ended with `syntax error: unexpected end of file`.

**Reasoning/process cause:**  
The guard was reviewed semantically but not against the shell's post-YAML indentation rule for heredoc terminators.

**Escape:**  
PR CI caught the rendered-shell syntax error before merge. The frozen planning state and product contracts were not invalid.

**Correction / reusable prevention:**  
In GitHub Actions `run: |` blocks, heredoc opener/body/terminator are kept at the YAML block's base indentation so the shell sees the terminator at column 0. For nested control flow, shell indentation is sacrificed rather than indenting the heredoc delimiter.

**Scope:**  
No product/S&T/freeze semantic change.

### R-034 — 2026-09-27 — Stage 12 verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-12-freeze`
- PR: #6

**Verification sequence:**
- initial PR CI run 36319424799: FAIL due only to nested-heredoc shell indentation in the new freeze guard;
- failure RCA: R-033;
- corrected PR CI run 36319502446: PASS on commit 68d33d927f10857e88f443e59378007163b0f08e.

**Freeze result:**
- `.planning/STATUS.yaml -> plan_state: frozen`;
- root `STATUS.yaml -> phase: planning`;
- 36/36 TREE nodes approved;
- 28 implementation-ready leaves unchanged;
- 14/14 decisions resolved;
- 660/660 one-to-one coverage preserved;
- `EXECUTION.yaml -> chats: {}` remains intentionally unallocated;
- no production implementation roots exist.

**Readiness:** READY-025 passes. READY-026..029 remain for allocation and fresh-chat handoff stages.

**Next:** Stage 13 EXECUTION Allocation.

### R-035 — 2026-09-27 — Stage 13 EXECUTION allocation design

**Result:** allocation complete; branch verification pending.

**Allocation shape:**
- 28 frozen implementation-ready leaves;
- 13 numbered executor chats;
- every leaf assigned exactly once;
- no non-leaf node assigned;
- no missing/duplicate leaf;
- every dependency is allocated to an earlier chat or an earlier node in the same chat.

**Chat boundaries:**
1. package/protocol/database foundation — 1.1, 1.2, 1.3
2. WebSocket/service-test foundation + Fake Market — 1.4, 1.5, 6.1
3. provider acquisition / Recorder schedule — 2.1, 2.2
4. Node producer/session/universe + atomic authority — 2.3, 2.4
5. Browser producer bridge / recovery — 2.5, 2.6
6. trusted reads / Viewer client — 3.1, 3.2, 3.3
7. Current / Detail / refresh — 4.1, 4.2, 4.3
8. Scanner — 5.1, 5.2, 5.3
9. normal Browser composition + demo — 4.4, 6.2
10. Fast CI + Browser CI — 6.3, 6.4
11. representative workload — 7.1
12. bounded live-provider gate — 7.2
13. final repository/release/handoff — 7.3

**Rationale:**  
The grouping follows coherent engineering boundaries rather than one-chat-per-leaf ceremony. Same-chat dependencies are ordered explicitly and later chats never require a leaf allocated to a later chat.

**CI guard added:**  
When a frozen plan has a non-empty EXECUTION allocation, CI validates exact leaf coverage, valid states, contiguous chat numbering and dependency-safe ordering.

**Planning boundary:**  
Root phase remains `planning`; allocation does not authorize implementation. Stage 14 must still prove fresh-chat handoff before the root phase can advance.

### R-036 — 2026-09-27 — Allocation authorization boundary correction

**Result:** corrected before Stage 13 PR.

**Finding:**  
`AGENTS.md` still used the older shorthand “After freeze, Chat N executes”. Stage 12 intentionally introduced a safe intermediate state: `plan_state: frozen` while root `phase: planning` during allocation and fresh-chat verification.

**Risk:**  
A fresh executor could treat freeze alone as implementation authorization and start code before Stage 14 handoff verification.

**Correction:**
- executor authorization now requires both `plan_state: frozen` and root `phase: implementation`;
- frozen + planning explicitly means allocation/handoff only;
- same-chat nodes execute in listed order so same-chat dependencies can become done first;
- CI requires every allocated node to remain `pending` with `result: null` while root phase is planning.

**Scope:**  
No S&T node, dependency or allocation grouping changed.

### R-037 — 2026-09-27 — Stage 13 verification closure

**Result:** pass

**Branch / PR:**
- branch: `plan/stage-13-execution-allocation`
- PR: #7

**Allocation verification:**
- 28 implementation-ready leaves;
- 28 assignments;
- 13 contiguous numbered chats;
- duplicates: 0;
- missing leaves: 0;
- non-leaf assignments: 0;
- dependency-order violations: 0;
- all initial node states: `pending`;
- all initial results: `null`.

**Authorization boundary:**
- plan remains `frozen`;
- root phase remains `planning`;
- executor implementation requires both frozen plan and root `phase: implementation`;
- therefore Stage 13 allocation itself cannot accidentally start implementation.

**CI:**
- Planning Docs CI run 36319842402: PASS on commit 94f64c5998fefa0e7c36dbf5c6cfab9275e380cf.

**Readiness:** READY-026 and READY-027 pass. READY-028/READY-029 remain for Stage 14.

**Next:** Stage 14 Fresh-Chat / Handoff Simulation.

### R-038 — 2026-09-27 — Fresh-chat / handoff simulation

**Result:** GitHub-only simulation pass; branch CI pending.

**Simulation basis:**  
A fresh executor was reconstructed from repository state only: `AGENTS.md`, root/planning STATUS, `EXECUTOR_HANDOFF.md`, `EXECUTION.yaml`, assigned TREE nodes/dependencies and routed durable contracts. Conversation history was not used as an input.

**Pre-authorization safety check:**
- plan state: `frozen`;
- root phase: `planning`;
- Chat 1 contains dependency-free node `1.1`, but implementation remains forbidden because root phase is not `implementation`.

**Initial availability across all 13 chats:**
- Chat 1 / node `1.1`: first available node once implementation is authorized;
- Chats 2–13: their first assigned node has at least one `pending` dependency blocker;
- therefore Chat 1 is the only valid initial executor.

**Representative simulations:**
- Chat 1: resolves `1.1, 1.2, 1.3`, sees `1.1` available, routes to Technical Spec/Test Strategy.
- Chat 2: resolves `1.4, 1.5, 6.1`, sees `1.4` blocked by `1.2/1.3`.
- Chat 8: resolves Scanner nodes `5.1, 5.2, 5.3`, sees `5.1` blocked by `1.5/2.4/3.1`.
- Chat 13: resolves final closure node `7.3`, sees blockers from the required prior verification/release leaves.

**Context-routing proof:**
- all 28 implementation leaves resolve to at least one durable contract route;
- normal executor context does not require preloading `market-flow`;
- `market-flow` remains provenance/source-reuse only through `SOURCE_EXTRACTION.md` when a concrete node needs it.

**Handoff defect found and corrected:**
- `EXECUTOR_HANDOFF.md` existed, but older read-order text in `AGENTS.md` and `.planning/README.md` still bypassed it.
- both entry paths now require the same handoff bootstrap and authorization gate.

**Durable handoff verifier:**
- `.planning/verify-handoff.mjs` validates implementation authorization/pointer against frozen planning state, EXECUTION allocation and TREE dependencies;
- CI runs the verifier;
- while root phase is `planning`, the verifier intentionally does not authorize execution;
- once root phase becomes `implementation`, it requires the root pointer to match the first unfinished chat/node and requires all current-node dependencies to be `done`.

**Conclusion:**  
Repository state is sufficient for a new executor to identify authorization, assigned work, contract context and blockers without planning-chat history.

### R-039 — 2026-09-27 — Implementation handoff authorization

**Result:** authorized-state transition committed; authorized-state CI pending.

**Pre-authorization proof:**
- PR #8 fresh-chat/handoff machinery CI run 36320676403: PASS on commit 8ec6d88d0c3154474e31a289252fa703392ed41c.
- plan remained frozen;
- root phase remained planning during that proof;
- all 28 execution nodes remained pending/null.

**Authorization transition:**
- root `STATUS.yaml -> phase: implementation`;
- root current pointer -> Chat 1 / node `1.1`;
- `.planning/STATUS.yaml -> current_node: "1.1"`;
- `plan_state` remains `frozen`;
- no EXECUTION node state changed yet.

**Initial executor truth:**
- Chat 1 owns `1.1, 1.2, 1.3`;
- node `1.1` has no execution dependency and is the first available node;
- every later chat remains blocked by one or more pending dependencies;
- all normal implementation context is available from MarketScope GitHub state without planning-chat history.

**Safety:**  
This planning chat authorizes the next executor but does not start production implementation itself. The authorized-state CI must pass before merge, and post-merge main CI must pass before Chat 1 is treated as the durable main-branch handoff.

### R-040 — 2026-09-27 — Stage 14 authorized handoff verification

**Result:** pass

**Pre-authorization CI:**  
Planning Docs CI run 36320676403: PASS while root phase was still `planning`.

**Authorized-state transition:**  
Root phase moved to `implementation`, current pointer moved to Chat 1 / node `1.1`, plan remained `frozen`, and all 28 execution leaves remained `pending`.

**Authorized-state CI:**  
Planning Docs CI run 36320739229: PASS on commit 25839c8115c190ee8b71b5aa242a0459a41c050d.

The durable handoff verifier therefore proved under the real authorized state that:

- plan state is frozen;
- EXECUTION is allocated;
- the first unfinished chat is Chat 1;
- the first unfinished node is `1.1`;
- root STATUS points exactly to Chat 1 / node `1.1`;
- node `1.1` has no unfinished dependency;
- no product implementation has started in the planning chat.

**Planning readiness:** READY-001..READY-031 all pass.

**Handoff:**  
The planning process is complete. The next repository actor is a new executor Chat 1, not this planning conversation.


### R-041 — 2026-09-27 — Diagnosability replan review

**Result:** pass; re-freeze/reauthorization intentionally deferred to the next step.

**Trigger:**  
Execution was paused before closing Chat 9 / node `6.2` because the user added a cross-cutting product requirement: ordinary failures must self-localize so a future run can report where it failed, the last successful checkpoint, a stable error code and a safe technical cause without first requiring broad debugging.

**Necessity:** pass.

Existing MarketScope already had explicit error states, health, stable protocol errors and sanitized logs, but these were fragmented. There was no durable product contract requiring one user-copyable diagnostic result that identifies the failing boundary. The new requirement is therefore not duplicate ceremony.

**Sufficiency after review corrections:** pass.

The reviewed contract now covers:
- Browser runtime load and initial localhost hello;
- post-start service transport loss;
- Node DB/schema readiness and service-listen readiness;
- producer ownership/session;
- provider universe acquisition/validation separately from Node universe acceptance;
- complete provider cycle separately from durable COMMIT/ACK;
- trusted Current/Detail reads;
- Scanner execution;
- demo runtime build/Fake Market/service/stack startup;
- Browser copyable Support Snapshot;
- CLI/startup fallback when Viewer diagnostics cannot exist;
- CI failure artifacts and security-sentinel proof.

**KISS:** pass.

The design intentionally reuses existing errors, status and protocol request IDs. It adds only:
- stable component/checkpoint IDs;
- one bounded process-local diagnostic ring (max 32);
- one read-only `viewer.support.snapshot` operation;
- one normal Viewer copy/selectable-text action;
- one concise `MARKETSCOPE_DIAGNOSTIC` CLI fallback.

Explicitly excluded: OpenTelemetry, remote/cloud telemetry, metrics server, persistent diagnostic event DB, distributed tracing backend and generic logging framework.

**Security/privacy:** pass after corrections.

Review corrections include:
- removed `sessionId` from public diagnostic-context examples;
- public/support output never copies raw `Error.message` automatically;
- requestId is reused as correlation only when it matches a bounded safe opaque format; otherwise a local safe alias is generated;
- producer/client/session identifiers are excluded from the Node support snapshot;
- raw provider rows/bodies, Scanner SQL/results, credentials, cookies, auth/session data, account identifiers, private browser state, URL query/fragment data and absolute local paths are forbidden;
- DGN sentinel tests include unsafe requestId/raw-error/path/secret-like synthetic values.

**Failure-family proof:** pass.

`TEST_STRATEGY.md` now owns DGN-01..DGN-11. The acceptance rule is not merely “error visible”; tests must prove the exact component/checkpoint, last successful boundary where applicable, stable code, safe cause, correct authority behavior and absence of forbidden data.

**TREE / dependency review:** pass after correction.

- new leaf `6.5` is approved;
- `6.5` depends on completed product/runtime/demo surfaces `4.4`, `5.3`, `6.2`;
- both final Fast CI `6.3` and Browser CI `6.4` depend on `6.5`;
- Chat 10 order is `6.5 → 6.3 → 6.4`;
- final release node `7.3` already depends on the final CI/demo leaves, so diagnosability flows into final release closure.

**Allocation / coverage structural proof:**
- TREE nodes: 37;
- implementation leaves: 29;
- EXECUTION assignments: 29;
- numbered chats: 13 contiguous;
- duplicate leaves: 0;
- missing leaves: 0;
- extra/non-leaf assignments: 0;
- dependency-order violations: 0;
- current execution states during reopened planning: 22 done, 6 pending, 1 blocked (`6.2`), 0 in_progress;
- MASTER_COVERAGE IDs: 672;
- COVERAGE_MAP IDs: 672;
- missing/extra/duplicate coverage IDs: 0.

**Mid-implementation replan defect found and fixed:**

The original Planning Docs CI assumed every `phase: planning` state was a clean pre-implementation repository. That would incorrectly require deleting existing product code and resetting allocated/done execution state during a legitimate execution-time replan.

Correction:
- `.planning/STATUS.yaml` now uses `replan_mode: execution_reopen`;
- framework/README define that mode as preserving valid implementation/done/allocation state while forbidding new `in_progress` work;
- Planning Docs CI distinguishes initial planning from execution reopen;
- allocated TREE/EXECUTION dependency validation now also applies during the reopen;
- reopen requires a factual blocked node and zero in-progress nodes;
- the workflow was rebuilt from clean `main` after a programmatic-replacement corruption was detected.

**Programmatic-edit incident during this review:**

A raw JavaScript replacement containing shell `$'` triggered the exact replacement-token corruption class already documented in `AGENTS.md`, duplicating the workflow suffix. The corrupted workflow was not accepted. It was rebuilt from the known-good main baseline using replacement callbacks, then reread completely. Final workflow has one validation-success marker, one allocation validator and one handoff verifier.

**Resume preservation:** pass.

- node `4.4` remains done;
- node `6.2` implementation remains complete;
- its final Fast/demo proof remains Actions run `36341859492`;
- `6.2` is blocked only as the durable resume checkpoint while planning is active;
- no 4.4/6.2 implementation redo is required by the revised plan.

**Next:** re-freeze the corrected plan, perform reauthorization/handoff checks, then resume Chat 9 at node `6.2` closure.


### R-042 — 2026-09-27 — Scanner saved-query architecture review

**Result:** pass for architecture/contract; S&T decomposition/allocation intentionally remains pending.

**Trigger:**  
The user added persistent named Scanner query CRUD, built-in examples, and a durable AI-friendly SQL authoring workflow during Chat 10 execution.

**Focused-boundary review:**  
The replan remains limited to Scanner/configuration persistence plus the unavoidable schema/protocol/test/doc consequences. Completed market ingestion, Current, Detail and existing Scanner execution semantics are not reopened.

**Persistence decision:** pass.

Node-owned same-DuckDB persistence is preferred over browser storage because it provides one origin-independent durable library and reuses existing serialized persistence. The resulting schema v2 is justified by a real new durable table and uses one explicit v1→v2 migration rather than a migration framework.

**Authority isolation:** pass.

`scanner_saved_queries` is configuration metadata, not market authority. CRUD uses explicit protocol operations. Failed CRUD must not change sessions/universe/cycles/history/latest, and saved-library edits cannot mutate an active Browser Scanner generation.

**UX semantics:** pass.

Select = load draft only. Create/Save/Rename/Delete are explicit. Built-ins are immutable but copyable. Normalized name collisions fail visibly rather than overwriting.

**Built-in scope:** pass.

The baseline uses one bounded latest-row discovery query and one bounded generic ranking example. No undocumented trading formula is invented.

**AI authoring/documentation:** pass.

One canonical `docs/SCANNER_SQL_GUIDE.md` is required. Fast proof must compare current public schema metadata and built-in definitions against it so later schema/example edits cannot silently stale the AI instructions.

**Security/KISS:** pass.

No credentials/session/account data is stored in the query table. Existing SELECT-only Scanner admission still prevents arbitrary SQL mutation. Rejected alternatives: localStorage authority, separate JSON persistence, cloud sync, query history, server scheduler and generic migration framework.

**Pending before re-freeze:**  
Update the S&T tree, assign exact new implementation leaves/dependencies, repair EXECUTION allocation, create the canonical guide contract/content, run focused completeness review, then freeze and reauthorize execution.


### R-043 — 2026-09-27 — Scanner query-library focused completeness review

**Result:** pass; ready for a separate re-freeze/reauthorization step.

**Scope reviewed:**  
Saved-query product requirements, D-015 architecture, schema-v2 migration/persistence, protocol CRUD, Browser Draft/Persisted/Active behavior, built-in examples, canonical SQL guide, TEST_STRATEGY QL matrix, S&T decomposition, EXECUTION allocation and executor routing.

**Canonical SQL guide completeness:** pass.

`docs/SCANNER_SQL_GUIDE.md` now documents:
- all seven public Scanner tables;
- every planned public column in schema v2;
- canonical SecurityId identity and join rules;
- local timing versus provider semantics;
- null/zero/empty/missing distinctions;
- known versus Unknown provider-field semantics;
- supported and rejected Scanner SQL;
- bounded authoring/performance guidance;
- Detail navigation through `security_id AS securityId`;
- the two initial built-ins;
- additional executable examples;
- saved-query Draft/Activate behavior;
- a copyable AI prompt template;
- maintenance/authority rules.

Mechanical review found 0 missing public tables and 0 missing planned columns.

**Built-in contract correction:** pass after review correction.

The architecture already fixed stable built-in IDs/SQL/interval but did not freeze exact display names, even though built-in-name collisions are part of D-015. The Technical Spec and SQL guide now freeze:
- `builtin:all-current-fields` / `All current fields` / 5000 ms;
- `builtin:market-ranking-example` / `Market ranking example` / 5000 ms.

The guide also contains compact schema/built-in manifests so node 5.6 can implement a simple deterministic drift test instead of brittle prose scraping.

**Executor routing correction:** pass after review correction.

`.planning/EXECUTOR_HANDOFF.md` now routes node `5.6` to the canonical SQL guide in addition to Scanner Product/Technical/Test sections.

**S&T sufficiency:** pass.

Three new leaves are sufficient and non-overlapping:
- `5.4` — schema-v2 migration + durable CRUD/protocol;
- `5.5` — Browser library + built-ins + active-generation isolation;
- `5.6` — canonical AI guide + executable examples + drift guards.

`6.5` now depends on `5.6`, so diagnostics must converge after the new Scanner failure boundaries exist.

**Allocation/dependency structural proof:** pass.

- TREE nodes: 40;
- implementation leaves: 32;
- EXECUTION assignments: 32;
- numbered chats: 14 contiguous;
- duplicate/missing/extra leaf assignments: 0;
- dependency-order violations: 0;
- execution-time replan has 0 in-progress nodes and retains an explicit blocked execution node;
- MASTER_COVERAGE/COVERAGE_MAP remain exact one-to-one at 695 IDs.

**Security/KISS:** pass.

No new credential/session/account/provider dump requirement exists. Saved SQL is user configuration only. No cloud sync, browser-local authority, generic migration framework, query history, SQL builder framework or second persistence engine was introduced.

**Remaining action:**  
Do not implement yet. In the next stage, transition the reviewed plan back to `plan_state: frozen`, restore root `phase: implementation`, repair the temporary blocked execution state to the first authorized pending leaf, run planning/handoff CI, merge the planning branch only after green review/CI, verify green main, then resume execution at Chat 10 / node `5.4`.


### R-044 — 2026-09-27 — Chat 10 / node 5.5 shutdown-race failure review

**Trigger:** repeated Chromium worker `SIGSEGV` in the existing Viewer close/reopen composition test after Query Library auto-load was introduced.

**Technical root cause:**  
The service serialized normal WebSocket messages through each connection's `messageTail`, but only separately queued producer-interruption work was registered in the service-wide `connectionTasks` set. `service.close()` therefore could close DuckDB after sockets closed while an already-accepted Viewer/Scanner message was still executing against `viewerReadConnection`. Query Library startup added an automatic `scanner.queries.list` read, materially increasing the chance of hitting that native-close race.

**Reasoning/process cause:**  
The existing shutdown proof covered producer/session cleanup but did not model an in-flight Viewer read at the exact DB-close boundary. The first SIGSEGV was initially treated cautiously as a possible runner/browser crash because native worker termination supplied no JS assertion or stack; recurrence on the same reopen boundary provided the evidence needed to promote it to a blocking lifecycle defect.

**Escape cause:**  
Normal message tasks and producer close tasks used two superficially similar serial chains, but only one path participated in the service-wide shutdown drain. No deterministic test held a Viewer DB operation open while invoking `service.close()`.

**Fix:**  
Every accepted normal WebSocket `handleMessage` task is now registered with `trackConnectionTask`. Service shutdown closes sockets, awaits all tracked connection tasks, drains the writer, and only then closes DuckDB.

**Regression/prevention:**  
A deterministic real-service test wraps the real Viewer read connection, pauses `scanner.queries.list` after it enters the DB-read boundary, starts `service.close()`, proves close remains unsettled, then releases the read and proves shutdown completes. This protects the whole Viewer/Scanner message family rather than only the observed Saved Query request.

**Verification:**  
Actions run `36348375187` passed:
- focused unit: 8/8;
- focused saved-query service: 5/5;
- browser build;
- focused Chromium: 7/7;
- full unit suite: 53/53;
- full service suite: 50/50, including the deterministic shutdown-drain regression;
- full Chromium suite: 13/13.

**Promotion:**  
The shutdown ordering is now explicit in `docs/TECHNICAL_SPEC.md`. No generic cancellation framework or extra lifecycle abstraction was introduced.


### R-045 — 2026-09-27 — Test feedback optimization mini-project replan

**Result:** pass for focused replan.

**Trigger:**  
During Chat 10 the verification wait was identified as materially too long. Successful Actions run `36348375187` provides the concrete baseline.

**Measured baseline:**  
- full proof job: about 79 seconds;
- Chromium provisioning: about 26 seconds;
- focused Chromium: about 11 seconds;
- full Fast: about 15 seconds;
- full Browser: about 16 seconds.

**Finding:**  
The current proof shape pays large browser setup cost and serially runs focused then full suites. Full Fast also contains enough process/lifecycle overhead to justify profiling before final CI is frozen.

**Resolution:**  
Add node `6.6 Test Feedback Optimization` after `6.5` and before `6.3/6.4`. Preserve full correctness coverage. D-016 and TEST_STRATEGY §15 define the optimization order, KISS boundary and timing targets.

**Execution allocation:**  
- Chat 10 remains `5.6`.
- Chat 11 becomes diagnosability `6.5`.
- Chat 12 owns test-feedback mini-project `6.6`.
- Chat 13 owns final Fast/Browser CI `6.3→6.4`.
- workload/live/final closure move to Chats 14/15/16.

**KISS review:** pass.  
No new test runner, distributed service, permanent test daemon, or platform is authorized. First choices are deterministic lifecycle fixes, removal of duplicate final proof, browser cache/reuse, path gating and parallel independent CI jobs.

**Coverage review:** pass.  
TST-061..TST-068 make feedback optimization explicit while all existing full-suite requirements remain in force.

**Re-freeze condition:**  
TREE/EXECUTION/coverage/handoff structural checks pass with `5.6` still the first unfinished node. Then planning may freeze from R-045 and implementation may resume at Chat 10 / 5.6.


### R-046 — 2026-09-28 — Saved-query diagnosability checkpoint repair

**Result:** pass; focused execution-time replan is sufficient and ready to re-freeze.

**Trigger:**  
While implementing node `6.5`, the executor reached the saved-query CRUD failure proof required by the node success evidence and found that the frozen checkpoint registry contained only `scanner.execute`, whose contract is explicitly limited to admitted SQL execution. Reusing it for query-library persistence would produce a misleading public diagnostic.

**Root cause:**  
The diagnosability replan named Scanner execution/query-library coverage at the tactic and success-evidence level, but its initial checkpoint registry modeled Scanner SQL execution and omitted the distinct saved-query CRUD boundary introduced by the later Scanner Query Library replan.

**Smallest correction:** pass.
- add one stable checkpoint, `scanner.query_library`, owned by component `scanner`;
- keep schema migration failures under `node.database.ready`, because v1→v2 migration occurs before DB readiness;
- extend DGN-07 to prove saved-query CRUD failures separately from SQL execution;
- clarify existing DIAG-028 coverage text; no new S&T node, allocation, architecture, persistence engine or coverage ID is needed.

**S&T sufficiency:** pass.  
Node `6.5` already explicitly owns Scanner query-library diagnosability and its success evidence already requires saved-query CRUD/migration failure localization. TREE and EXECUTION decomposition therefore remain correct; only the missing public checkpoint contract required repair.

**Security/KISS:** pass.  
The repair adds one contract string and reuses the same bounded process-local diagnostic tracker. It does not authorize saved SQL, query results, credentials, session/account identifiers, provider dumps or remote telemetry in Support Snapshot output.

**Resume:**  
Re-freeze from R-046, restore Chat 11 / node `6.5` to `in_progress`, and continue the existing implementation branch.


### R-047 — 2026-09-28 — Chat 11 native lifecycle and Viewer composition failure review

**Trigger:**  
PR #31 proof runs exposed two blocking regressions while integrating node `6.5`: the demo same-process restart reopened the same DuckDB path with zero visible market rows after a successful pre-close commit, and the built Browser runtime entered `error` with `diagnosticsRoot must be a DOM element.`.

**Technical root causes:**  
1. `openMarketScopeDatabase()` owned a native `DuckDBInstance` but normal/startup-failure cleanup closed connections only. The instance lifetime therefore depended on garbage collection. Diagnosability added longer-lived references and made the latent ownership defect deterministic during same-process reopen.  
2. Viewer diagnostics composition created `operationalDiagnostics` and `supportDiagnostics` but an editing error both moved those nodes out of the diagnostics container and omitted them from the returned element map. `createViewerRefreshController()` therefore received `undefined`.

**Reasoning/process causes:**  
- Native database ownership had been modeled at the connection level rather than as owner + child resources with deterministic teardown order.
- The UI edit was accepted after a partial-file transformation check instead of validating the complete create/append/return wiring as one composition invariant.

**Escape causes:**  
- Existing restart evidence passed while the native instance happened to become collectible quickly enough; it did not force the same-process owner to be explicitly closed.
- Existing Viewer tests covered the old single diagnostics root and did not yet exercise the newly split Support Snapshot roots until full Browser composition.

**Fix and regression proof:**  
- close scanner/viewer/writer connections and then `DuckDBInstance.closeSync()` on normal shutdown; startup failure now best-effort closes every already-created child plus the instance while preserving the original error;
- keep both Viewer diagnostic subroots inside the diagnostics container and return both from `createShellDocument()`;
- the strengthened demo restart proof asserts committed counts before close, identical DB path after reopen, and preserved counts after reopen;
- full Browser composition proves the diagnostic roots through the normal built runtime.

**Reusable prevention:**  
Any native resource aggregate introduced or modified in MarketScope must explicitly close the owning native handle after its child handles; do not rely on GC for reopen correctness. DOM composition changes must preserve create → parent attachment → returned reference as one tested boundary.


### R-048 — 2026-09-28 — Chat 12 Browser loading-proof timing race

**Trigger:**  
The first file-level Playwright parallelism proof in Actions run `36353979246` passed at `workers=1` but all three parallel variants failed the same Detail loading-state assertion.

**Technical root cause:**  
The Detail E2E fixture used a fixed `securityDelayMs = 50` to keep the transient loading state visible long enough for Playwright to observe it. Under concurrent worker CPU scheduling, that timer could expire before the assertion executed, even though the product flow itself remained correct.

**Reasoning/process cause:**  
A transient UI state was made observable with elapsed wall-clock time rather than a deterministic synchronization boundary. The earlier single-worker environment hid the race by making the 50ms assumption usually true.

**Escape cause:**  
Existing Browser coverage exercised the loading proof only in one-worker execution. No test intentionally varied scheduling pressure, so the fixed-delay dependency remained latent.

**Fix and regression proof:**  
The synthetic security read now waits on an explicit test-controlled promise gate. The test starts the real Detail flow, proves the loading status, releases the gate, and then performs the same 500-row, retry, pagination and Back assertions. Actions run `36354083502` passed all 14 Browser tests on fresh runners with workers 1, 2, 2 and 3.

**Reusable prevention:**  
Do not use short fixed sleeps to make transient UI states testable. Where the test owns the async fixture, expose a deterministic gate/event and release it only after the public state under test has been observed. Fixed delays remain acceptable only when elapsed time is itself the behavior being tested.


### R-049 — 2026-09-28 — Chat 12 / node 6.6 final success-evidence audit

**Result:** pass; node 6.6 success evidence is satisfied and the implementation branch is ready for final PR review/merge.

**Evidence audit:**
1. **Baseline + attribution:** pass. Historical Actions run `36348375187` (79s) is recorded; `docs/TEST_FEEDBACK_PERFORMANCE.md` contains measured npm/setup/Fast/Browser and per-file/per-phase attribution.
2. **Coverage preserved:** pass. Representative final proof run `36354809655` passed 57/57 unit, 57/57 service and 14/14 Chromium. No test was removed or converted to a weaker mock for timing.
3. **Fast/Browser command budgets:** pass under the contract's measured-irreducible exception. Final representative values were 11.695s Fast and 14.450s Browser. The node removed the proven 4.68s demo shutdown tail and 3s incidental Recorder cadence, profiled remaining Browser phases, rejected slower Browser parallelism, and rejected nondeterministic Unit/Service concurrency. Further reduction from the measured state would require weakening real CRUD/DuckDB/WebSocket/500+ row behavior proofs or adding unproven runner complexity. Targets remain unchanged.
4. **Hard wall-clock improvement + warm/cold evaluation:** pass. Representative optimized product-code path is 35s versus 79s baseline, a 55.7% reduction. Cold Browser job measured 56s (<=60s). Exact-cache warm Browser job without per-run install-deps measured 31s (<=45s).
5. **Final-path shape:** pass. Final proof runs Fast and Browser as independent parallel full gates with no focused→full serial duplication. Exact lockfile-keyed Chromium cache is proven on a fresh runner; outputs retain normal node:test/Playwright diagnostics.

**Rejected optimizations retained as evidence, not code:** Browser workers 2/3 and parallel Unit/Service execution. Temporary profiling/proof workflows and runner scripts were removed.

**Changed product/test surface:** only deterministic test-harness corrections remain:
- demo shutdown timeout handle is cleared without weakening the 5s failure bound;
- producer-independence E2E uses the existing recorder-config seam instead of waiting on the production 3000ms cadence;
- Detail loading-state proof uses an explicit fixture gate instead of a 50ms scheduling assumption.

**Next boundary:** review PR #32 diff, require green PR-head CI, squash-merge, verify green main, then advance durable status to Chat 13 / node 6.3.


### R-050 — 2026-09-28 — Chat 12 closure pointer invariant

**Trigger:**  
After R-049 marked node `6.6` done, Planning Docs CI run `36355311182` failed in `.planning/verify-handoff.mjs` with: expected Chat 13 / 6.3, got Chat 12 / 6.6.

**Technical root cause:**  
`.planning/EXECUTION.yaml` had already made `6.6` done, but root `STATUS.yaml` and `.planning/STATUS.yaml` intentionally stayed on Chat 12 / 6.6 to represent the still-unmerged PR boundary. The handoff verifier defines the current pointer differently: it must always identify the first non-done execution node.

**Reasoning/process cause:**  
PR/merge lifecycle state was overloaded onto the execution pointer instead of preserving the repository's existing pointer invariant.

**Escape cause:**  
The status update was reasoned from workflow narrative rather than checked against `verify-handoff.mjs` before committing the closure state.

**Fix:**  
Advance durable current/next pointers to Chat 13 / node 6.3 immediately when `6.6` becomes done. PR #32 merge readiness remains represented by the PR itself and the Chat 12 conversation, not by falsifying the execution pointer.

**Reusable prevention:**  
Whenever an EXECUTION node transitions to `done`, update STATUS pointers in the same logical change to the first non-done node computed by the handoff verifier. Never use the execution pointer to encode “pending merge”; PR state owns that concern.
