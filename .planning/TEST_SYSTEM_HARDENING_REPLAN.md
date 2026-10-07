# Market Flow US — Test-System Hardening Replan

Status: structural map resolved; deep decomposition/review still pending.

This is a focused replan inside the existing active cycle. It does not create a new cycle, does not reopen completed product implementation without evidence, and does not authorize implementation. Final target-machine/provider acceptance node `7.4` remains pending and blocked until this replan is reviewed, frozen, allocated, re-authorized, implemented and reclosed.

## 1. Outcome and boundary

Outcome:

> Market Flow US has a fast, deterministic, comprehensive verification system that proves the implemented product and recent features against durable contracts and material risks, removes avoidable recurring test/CI cost, detects meaningful regressions early, and leaves final target-machine/provider acceptance to an exact candidate whose repository verification has been reclosed.

Boundary:

- Preserve existing product behavior and proven verification mechanisms unless current evidence shows a defect, coverage gap, nondeterminism or avoidable recurring cost.
- This mini-project owns verification architecture, test/fixture/harness quality, CI topology, risk-to-proof coverage, deterministic timing, warning/error RCA discipline and repository reclosure.
- It does not replace user-dependent provider/target-machine evidence owned by `7.4`.
- It does not justify a new product subsystem, a rewrite, a blanket new test framework, or literal 100% line coverage.
- Blocking defects discovered while hardening verification remain in this work through root cause → fix → regression/proof → analogous-area sweep → affected verification → green.

## 2. Current evidence inventory

Current repository topology already contains substantial proof rather than a missing test framework:

- `node:test` unit coverage for pure/model/protocol/config/security/lifecycle behavior.
- real DuckDB/WebSocket/HTTP/filesystem service integration.
- Chromium/Playwright composition and user-visible behavior.
- dedicated Replay acceptance.
- standalone synthetic IBKR order-service acceptance.
- bounded hosted workload plus heavy target-machine profiles.
- deterministic Local Fake acceptance and separate authenticated provider acceptance.

Current main measurements/evidence used by this replan:

- latest Fast CI: 254 unit tests, about 4.99 s; 175 service tests, about 19.03 s; service execution dominates recurring Fast wall time;
- Browser CI runs the full Chromium suite and then `test:acceptance:local`; eight Local Fake browser checkpoints are selected from tests already executed by the preceding full E2E suite, so acceptance semantics are valuable but process execution is duplicated;
- Replay CI currently runs replay unit/service tests again inside `test:acceptance:replay` as well as replay-specific browser proof; Fast is the natural owner of unit/service proof when routing covers the affected source paths;
- service fixtures intentionally create isolated temp directories, real DuckDB/service instances and real WebSocket clients; this isolation must not be weakened before measured attribution proves a safe alternative;
- `replay-host/host.js::stopOwnedChild()` races child exit against a referenced 5000 ms delay. When child exit wins, the timer remains live. Current Fast logs show an approximately 4.4–5 s process-tail signature before Replay Host service tests. This is a concrete lifecycle/timer-waste finding and requires an analogous timer/process-lifecycle sweep rather than a one-line symptom fix;
- historical `TEST_FEEDBACK_PERFORMANCE.md` already established the correct optimization order: remove deterministic waits/lifecycle waste and duplicate work before concurrency, and treat hosted CI timing as evidence rather than a product SLO.

These observations are inputs to planning, not permission to implement before freeze/authorization.

## 3. Structural map

### Material questions

Q1. What does “full coverage” mean for this product without gaming a numeric metric?

Q2. Which proof layer owns each material contract/risk so the same behavior is not repeatedly paid for in multiple recurring commands?

Q3. Where is current recurring cost caused by real necessary integration work versus duplicated execution, fixed waits, timer/process leaks, repeated bootstrap or oversized fixtures?

Q4. Which timing/concurrency/failure/security paths require dedicated deterministic proof, and which are already adequately proven?

Q5. Which recent features need an explicit completeness re-audit before final acceptance?

Q6. Which metrics/gates are stable enough to fail CI without creating flaky performance policy?

### Dependency between questions

```text
contract/risk inventory
→ define complete coverage semantics
→ assign proof ownership by layer
→ measure gaps + duplicated/costly proof
→ choose smallest test/harness/CI changes
→ re-audit recent-feature completeness
→ integrated repository reclosure
→ 7.4 final target-machine/provider acceptance
```

Performance changes may not precede proof-ownership decisions because a “faster” suite that removed the only evidence for a risk is invalid. Concurrency may not precede lifecycle/isolation attribution because parallelism can hide rather than remove cost and can create cross-test races.

### Likely major TREE areas

The deep decomposition should cover four coherent areas under release/acceptance branch `7`:

1. **Verification contract and coverage ledger** — material contract/risk → authoritative proof mapping, recent-feature completeness audit, explicit gaps and non-goals.
2. **Fast/service determinism and cost** — lifecycle/timer/process/fixture attribution, root-cause fixes, isolation preservation, only then safe concurrency/topology changes if still justified.
3. **Browser/acceptance/replay topology** — remove duplicate executions while preserving named acceptance evidence; keep browser proof for browser behavior and route replay/order special proof deliberately.
4. **Integrated reclosure** — full affected suites, warning/error RCA closure, measured recurring runtime evidence, exact candidate, PR/main CI/diff/open-PR audit, then unblock `7.4`.

Exact child/leaf count is intentionally deferred until deep S&T decomposition.

## 4. Structural decision A — Keep hardening inside branch 7

**Decision:** Add a new hardening/reclosure subtree under existing release/acceptance branch `7`; do not create root branch `10`.

### Need

The request is cross-cutting, but its outcome is not an independent user capability. Its purpose is to make the final release candidate comprehensively and efficiently proven before `7.4`.

### Tactic validity

Branch `7` already owns deterministic reclosure, code audit, release evidence and final acceptance. A verification-system hardening subtree there is causally aligned: repository proof must close before target-machine/provider acceptance.

### Material alternative

Create root branch `10` for “verification infrastructure”. Rejected for this cycle because it would make verification tooling look like an additional product capability and force root sufficiency/count changes without improving causal clarity.

### Invalidation

Reconsider only if verification becomes an independently shipped/operator-facing capability with its own product outcome rather than release evidence, or if future planning shows a material capability that cannot truthfully sit under release/reclosure.

Expected dependency after decomposition:

```text
new branch-7 hardening/reclosure final leaf
→ required by 7.4
```

Completed historical leaves remain done unless current evidence proves their success claims invalid.

## 5. Structural decision B — “Full coverage” is contract/risk completeness, not 100% lines

**Decision:** Operational completeness is an explicit coverage ledger in which every material durable contract and risk has an authoritative proof owner and important normal/edge/failure/recovery/security/lifecycle paths are either proven or explicitly justified out of scope.

### Need

Raw line/branch coverage cannot establish correctness of market authority, persistence rollback, acknowledgement-unknown behavior, process ownership, security boundaries or browser lifecycle semantics. Conversely, insisting on 100% encourages low-value assertions and can increase recurring cost without reducing material risk.

### Tactic validity

Use outside-in contract/risk mapping first. Numeric source coverage is secondary telemetry/backstop only where it reveals otherwise invisible unexercised code at acceptable cost.

### Material alternatives

- **100% line/branch threshold:** rejected as a primary goal; it can be gamed and does not prove semantics.
- **No coverage telemetry at all:** not yet accepted either; deep planning may justify lightweight built-in coverage for changed/high-risk code if it exposes meaningful gaps.
- **Mutation testing everywhere:** rejected as a recurring default because of cost and weak fit for integration-heavy authority; a narrowly targeted audit remains possible only if a specific critical pure-logic area lacks confidence.

### Invalidation

If the contract/risk ledger is complete but empirical defect review repeatedly finds untested implementation paths that numeric coverage would have exposed cheaply, add the smallest useful coverage gate. Do not set an arbitrary percentage before measuring the baseline and gap-detection value.

## 6. Structural decision C — Each proof type has a primary job

**Decision:** Preserve existing `node:test` + Playwright architecture and make proof ownership explicit before adding tools.

Primary responsibilities:

- **Unit:** pure validation, models, state machines, protocol/config boundaries, invariants, deterministic/fake-time scheduling and cheap failure permutations.
- **Service/integration:** real DuckDB, WebSocket/HTTP, filesystem, process-owned persistence and transaction/lifecycle semantics where mocks would hide the risk.
- **Browser E2E:** browser composition, user-visible interaction, navigation/state, accessibility semantics, clipboard/fallback behavior and cross-layer journeys that genuinely require Chromium.
- **Acceptance reports:** named release evidence/checkpoints. Prefer deriving the report from already-executed authoritative tests rather than launching the identical browser scenario a second time solely to label it FR-7/FR-8.
- **Replay acceptance:** Replay build plus Replay-specific cross-layer/browser proof. Unit/service Replay semantics should have one recurring owner rather than being duplicated across Fast and Replay once source-path routing is complete.
- **Order acceptance:** standalone synthetic sidecar lifecycle proof remains explicit because it proves an operable boundary distinct from ordinary unit assertions.
- **Workload:** bounded correctness/performance sanity in hosted CI; heavy timing authority remains the target machine.
- **Authenticated/provider proof:** only final acceptance; never simulated by CI.

Security, concurrency/race, recovery and invariant testing are risk categories, not reasons by themselves to add separate frameworks. Implement them at the narrowest layer that faithfully exposes the risk.

## 7. Structural decision D — Performance optimization is causal, semantics-preserving and measured

**Decision:** Optimize recurring verification in this order:

```text
fixed waits / leaked timers / process tails
→ duplicate execution
→ unnecessary setup/bootstrap/fixture work
→ overly broad fixture/data size at the wrong layer
→ topology/cache/setup improvements
→ safe concurrency only after isolation proof
```

### Need

Current Service cost and Browser acceptance duplication show that raw parallelism is not the first problem. A known Replay Host referenced timer also demonstrates that process-tail waste can dominate despite short test bodies.

### Tactic validity

Every optimization keeps the same observable contract or moves the proof to a cheaper authoritative layer with an explicit ledger update. Measure before/after wall time at the narrowest relevant layer and then remeasure the recurring command.

### Material alternatives

- Increase workers immediately: rejected until DB/files/ports/process ownership and lifecycle cleanup are proven independent.
- Raise timeouts/retries: rejected as optimization; it hides failures and does not reduce wall time.
- Delete long integration journeys: rejected when they are the only proof of a material cross-layer contract.
- Share one mutable DB/service fixture globally: rejected without isolation evidence because it can create order dependence and state leakage.

### Invalidation

If lifecycle/duplication/bootstrap work is removed and a measured suite remains materially dominated by independent isolated files, safe concurrency becomes the next legitimate lever and must be stress/repeat proven.

Hosted CI may use broad regression ceilings to catch catastrophic slowdown, but fragile product-like millisecond SLOs on shared runners are forbidden. Target-machine performance remains authoritative for heavy profiles.

## 8. Structural decision E — Determinism before more test categories

**Decision:** No blanket addition of property-testing, mutation-testing, accessibility or performance libraries during planning.

- Use fake clocks, explicit gates/promises and deterministic inputs instead of real sleeps wherever possible.
- Use existing loops/table-driven `node:test` cases for property-like invariants unless generative testing demonstrates unique value.
- Audit interactive Viewer/Replay/BUY surfaces for accessibility-relevant browser proof; add focused semantics/keyboard/state assertions with existing Playwright first. Add an accessibility library only if the gap cannot be proved adequately without it.
- Security and race tests stay close to their owning seam and use synthetic/public-safe fixtures.
- Specialized heavy/performance probes stay out of ordinary paths unless their recurring value justifies the cost.

This satisfies “all needed test types” by risk, not by collecting framework categories.

## 9. Structural decision F — Reclosure and RCA gate are part of correctness

**Decision:** The hardening subtree does not close when individual test refactors are green. It closes only after an integrated completeness/reclosure stage.

Required closing evidence:

- coverage ledger has no unexplained material contract/risk gap;
- every new-feature family is re-audited against current contracts and actual proof: Replay recording/storage/portable source/Player/Host/isolation, Basic BUY/CSRF/ticket/DRY_RUN-LIVE boundary, IBKR lifecycle/idempotency/ack-unknown/no-short guard, Demo Buy, AI Investigation sharing/anti-hindsight, Current/Detail/Scanner, provider recovery/restart, diagnostics/support snapshot and Chat-27 hardening regressions;
- every CI warning/error encountered during this mini-project receives full RCA: exact signal, root cause, why earlier prevention/detection failed, reusable prevention, analogous-area sweep and closing evidence before progression;
- recurring runtime is measured before/after and no proof is weakened merely to hit a time number;
- all affected required workflows are green on one exact candidate; planning/contract drift guards are updated; diff review/open-PR audit are clean;
- only then may `7.4` resume on that exact candidate.

## 10. Explicit known investigation targets for deep decomposition

The next stage must turn these into decision-complete leaves only where evidence confirms them:

1. Replay Host stop timeout lifecycle leak and analogous referenced-timer/process-lifecycle sweep.
2. Per-file/per-fixture attribution of the 175-test Service suite; preserve real isolation unless measured evidence supports narrower fixture reuse or safe file-level concurrency.
3. Browser full-E2E + Local Acceptance duplicate execution: preserve FR evidence while removing identical second process executions.
4. Replay CI duplication/routing: make Fast the authoritative recurring owner of unit/service proof for all replay-affecting source paths, then keep Replay CI focused on Replay-specific build/cross-layer acceptance if the path analysis validates this split.
5. Fake time/gates for any remaining test that waits on production cadence or arbitrary sleeps.
6. Completeness ledger for recent features and currently weak/implicit proof, including accessibility, security/recovery/race paths.
7. CI path filters so every source/fixture/helper change reliably triggers its authoritative proof owner.
8. Stable performance evidence/reporting that catches large regressions without flaky shared-runner micro-SLOs.

## 11. Next planning checkpoint

Next work is deep S&T decomposition, not implementation:

```text
structural decisions above
→ contract/risk coverage inventory
→ proposed branch-7 subtree/leaves + dependencies + success_evidence
→ coherent-slice challenge/review
→ outside-in whole-plan coverage audit
→ final planning review
→ freeze/no-drift proof
→ resume allocation validation + handoff simulation
→ implementation authorization
```

Until those gates finish:

```text
cycle_state: active
plan_state: active
implementation_authorized: false
7.4: pending / blocked by replan
```
