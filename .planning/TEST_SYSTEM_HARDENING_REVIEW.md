# Market Flow US — Test-System Hardening Planning Review

Status: coherent-slice + outside-in review complete after corrections; final planning review/freeze/allocation still pending.

This review challenges `.planning/TEST_SYSTEM_HARDENING_TREE_PROPOSAL.md` and `.planning/TEST_SYSTEM_COVERAGE_LEDGER.md` before any mutation of the authoritative `.planning/TREE.yaml`.

## R-US-TEST-SYSTEM-HARDENING-COHERENT — Coherent-slice S&T review

**Result:** PASS AFTER CORRECTIONS; IMPLEMENTATION UNAUTHORIZED

### Slice 7.7.1 — Verification ownership and completeness

**Need:** PASS.

A large green suite does not establish that every material product contract/risk has a proof owner, that CI path routing invokes that owner, or that the test code itself follows deterministic/maintainable practices.

**Tactic validity:** PASS AFTER CORRECTION.

The proof ledger is useful as planning/audit evidence, but it must not become a second permanent planning framework. Durable verification policy/ownership belongs in `docs/TEST_STRATEGY.md`; `.planning/TEST_SYSTEM_COVERAGE_LEDGER.md` remains the cycle audit/closure ledger that demonstrates the migration to that durable policy.

`7.7.1.2` was also too product-only. The user's scope explicitly includes refactor/best-practices work across the tests themselves. The leaf therefore also owns an inventory/audit of test/harness quality: duplicated or stale tests/helpers, unowned skip/todo/only markers, retry-based flake masking, arbitrary sleeps, weak assertions, over-mocking where real integration is authoritative, resource cleanup, deterministic synthetic fixtures, failure diagnostics and test naming/ownership.

**Material alternatives challenged:**

- New standalone coverage-management subsystem: rejected; existing TEST_STRATEGY + one planning closure ledger are sufficient.
- 100% source-coverage threshold: rejected as semantic authority.
- Blanket ESLint/property/mutation/accessibility frameworks: rejected without a concrete gap proving unique value.
- Refactor test code merely for stylistic uniformity: rejected; refactors must improve clarity, determinism, reuse, diagnostics or runtime without hiding contract semantics.

**Invalidation:** Reopen only if the audit proves current artifacts cannot express proof ownership or a specialized tool catches a material gap that existing Node/Playwright tooling cannot reasonably prove.

### Slice 7.7.2 — Fast/service determinism and performance

**Need:** PASS.

The current Fast baseline contains a concrete referenced-timer/process-tail defect plus a service suite whose aggregate runtime requires causal attribution.

**Tactic validity:** PASS AFTER DEPENDENCY CORRECTION.

The known Replay Host timer defect does not technically require completion of the entire product-wide coverage audit. It requires the proof-ownership contract so the fix/regression lands under a defined owner. Therefore `7.7.2.1` depends on `7.7.1.1`, not `7.7.1.2`.

`7.7.2.2` correctly follows `7.7.2.1`: service profiling before removing the known ~5 s process tail would contaminate attribution. Fresh real DB/service/WS isolation remains the default; fixture reuse or concurrency requires contamination/order-independence and repeat/stress evidence.

**Material alternatives challenged:**

- Increase workers first: rejected.
- Share one mutable global service/DB fixture: rejected without evidence.
- Replace real integration with mocks to reduce time: rejected.
- Increase timeouts/retries: rejected as performance work.

**Invalidation:** After deterministic waste is removed, measured independent file-level cost may justify concurrency; otherwise concurrency is explicitly rejected rather than forced.

### Slice 7.7.3 — Browser/Acceptance/Replay/specialized CI topology

**Need:** PASS.

Browser currently re-executes identical FR scenarios after full Chromium, while Replay lower-layer duplication cannot simply be deleted because Fast path routing does not yet own every Replay/Host change.

**Tactic validity:** PASS AFTER DEPENDENCY + same-SHA-gate CORRECTION.

Both `7.7.3.1` and `7.7.3.2` require the ownership/routing contract in `7.7.1.1`, but they do not technically require all product-wide missing-proof work in `7.7.1.2` to finish. Their dependencies are therefore changed to `7.7.1.1`; serial Chat allocation may still run the gap audit first for merge safety.

Replay unit/service reruns may be removed from Replay CI only when:

1. every relevant Replay/Host/shared/helper/config path triggers Fast's authoritative lower-layer owner;
2. Replay CI still provides its distinct build/composed-browser proof;
3. release/reclosure checks both required same-SHA evidence families, so a green Replay specialized job cannot substitute for a failing/missing Fast owner.

Browser acceptance proof reuse must bind to the same candidate/run and exact test identities. Standalone local acceptance remains executable and cannot silently consume stale CI artifacts.

**Material alternatives challenged:**

- Delete Local Acceptance labels/reports: rejected; release evidence remains valuable.
- Keep duplicate execution because it is historically named acceptance: rejected when no independent evidence is added.
- Delete Replay unit/service execution before trigger ownership is fixed: rejected because it creates a proof hole.
- Merge all specialized workflows into one giant workflow: rejected; focused failure routing and subsystem evidence are useful.

**Invalidation:** If same-run proof reuse becomes more complex or brittle than the duplicated execution it removes, retain the distinct execution and document its evidence value/cost instead of building a fragile cache protocol.

### Slice 7.7.4 — Integrated reclosure

**Need:** PASS.

Changes to tests, harnesses and CI topology require one exact-candidate reclosure before target-machine/provider acceptance.

**Tactic validity:** PASS AFTER DEPENDENCY CORRECTION.

Because performance/topology leaves no longer depend on `7.7.1.2`, `7.7.4` must depend directly on `7.7.1.2` in addition to `7.7.2.2`, `7.7.3.1`, and `7.7.3.2`.

The reclosure must also show deterministic stability, not merely one green run: materially changed timing/race/lifecycle/topology paths receive bounded repeat/stress proof; no retries are introduced to manufacture green results. Shared-runner micro-timing remains non-authoritative.

## Dependency correction

Previous proposal incorrectly encoded desired planning/execution order as technical dependency truth:

```text
7.7.1.1
→ 7.7.1.2
→ 7.7.2.1 / 7.7.3.1 / 7.7.3.2
```

Correct technical graph:

```text
7.6.5
  ↓
7.7.1.1 proof ownership / routing contract
  ├─→ 7.7.1.2 product + test-system gap/hygiene audit
  ├─→ 7.7.2.1 timer/process/wait RCA
  │      ↓
  │   7.7.2.2 service profiling/optimization
  ├─→ 7.7.3.1 Browser/Local Acceptance topology
  └─→ 7.7.3.2 Replay/Fast/Workload/Order routing

7.7.1.2 + 7.7.2.2 + 7.7.3.1 + 7.7.3.2
  ↓
7.7.4 integrated reclosure
  ↓
7.4
```

A later serial allocation may still execute `7.7.1.2` before the other branches. Allocation order is process/merge sequencing; TREE `depends_on` remains causal engineering truth.

## R-US-TEST-SYSTEM-HARDENING-OUTSIDE-IN — Whole-plan coverage audit

**Result:** PASS AFTER CORRECTIONS; READY FOR TREE/CONTRACT PROMOTION, NOT YET FREEZE

### Product capability walkthrough

Covered by the ledger + proposed leaves:

```text
provider acquisition / universe
→ schema / writer / trusted reads
→ Current / Detail / Scanner
→ Demo Buy / AI Investigation
→ diagnostics / new-day
→ Replay record / portable source / Player / Host / isolation
→ standalone IBKR security / provider lifecycle / idempotency
→ Basic BUY trusted confirmation
→ cross-feature authority boundaries
→ deterministic repository verification
→ target-machine/provider-only evidence in 7.4
```

No material current product family remains outside the ledger.

### Failure / lifecycle / race / security walkthrough

Explicitly owned:

- malformed/invalid/boundary input;
- transaction rollback and migration failure;
- lost acknowledgement and idempotency/reconciliation;
- provider/service/process restart and recovery;
- timer/child/socket/server cleanup;
- writer/scheduler/process/duplicate-click races;
- localhost caller/Origin/CSRF/token boundaries;
- sharing-safe/redacted diagnostics and fixtures;
- Replay/live DB/process isolation;
- target-only authenticated/provider/live-order evidence.

### Test-system walkthrough

The review found four test-system concerns that were not explicit enough in the first proposal and must be represented in the corrected ledger/leaf evidence:

1. **Test maintainability/hygiene** — duplicated/stale tests/helpers, assertion quality, naming/ownership and helper abstraction must be audited, not only product coverage.
2. **Flake/determinism policy** — no unowned `skip`/`todo`/`.only`, no retries as a substitute for RCA, no arbitrary sleeps when deterministic gates/clocks can prove the same contract; materially changed race/timing paths get bounded repeat/stress evidence.
3. **Build/package/operator/config proof** — browser/replay builds, launchers, runtime configuration and test-selection/config files are verification inputs and need ownership/routing; adding a blanket linter is not automatically required.
4. **Failure diagnostics/public-safe evidence** — failures must be actionable while reports/artifacts remain sanitized; optimization must not remove diagnostic fidelity.

These additions fit `7.7.1.2` and the existing seven-leaf plan; no extra leaf is necessary.

### Necessity challenge

**PASS.** Removing any implementation leaf loses a distinct outcome:

- `7.7.1.1`: no durable proof-owner/routing authority;
- `7.7.1.2`: no product-wide + test-hygiene completeness closure;
- `7.7.2.1`: no causal lifecycle/timer/process cleanup family closure;
- `7.7.2.2`: no measured service-fixture/bootstrap/concurrency decision;
- `7.7.3.1`: Browser/Local Acceptance remains duplicate or loses named evidence;
- `7.7.3.2`: Replay/specialized dedup cannot be made trigger-safe;
- `7.7.4`: no exact integrated candidate/reclosure before `7.4`.

No one-child decomposition is introduced.

### Sufficiency challenge

**PASS AFTER CORRECTIONS.** The seven leaves jointly own:

```text
what must be proved
+ whether current tests prove it
+ quality/maintainability of the tests and fixtures
+ deterministic lifecycle behavior
+ measured recurring performance
+ browser acceptance evidence topology
+ specialized workflow routing
+ integrated same-candidate reclosure
+ explicit target-only handoff to 7.4
```

The direct `7.7.1.2` dependency on `7.7.4` closes the only structural sufficiency gap found by the dependency correction.

### KISS / negative-space challenge

**PASS.** The plan does not pre-authorize:

```text
new test framework
new coverage-management subsystem
100% code-coverage target
blanket linter migration
property-testing dependency
mutation-testing suite
accessibility dependency
visual-regression system
global mutable integration fixture
unproven test parallelism
larger timeouts/retries as optimization
```

Any such mechanism requires concrete evidence that existing Node/Playwright/tooling cannot close a material gap more simply.

### Target-machine boundary

**PASS.** Hosted/repository verification continues to stop before:

- 4096×180 target-machine performance authority;
- authenticated market-provider compatibility/movement;
- actual IBKR LIVE submission when external permission exists.

Those stay under `7.4`; repository automation may not relabel synthetic evidence as target/provider success.

## Review outcome

The corrected seven-leaf decomposition is coherent, necessary, sufficient and KISS-compliant for the requested test-system mini-project.

Remaining planning work before implementation authorization:

```text
apply review corrections to proposal + coverage ledger
→ promote corrected subtree into .planning/TREE.yaml
→ update durable DECISIONS + docs/TEST_STRATEGY + Planning Docs contract
→ final planning review / adversarial no-gap pass
→ freeze + reviewed-baseline/no-drift proof
→ resume allocation validation
→ handoff simulation
→ implementation authorization gates
```

`7.4` remains blocked throughout this work.
