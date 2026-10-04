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
