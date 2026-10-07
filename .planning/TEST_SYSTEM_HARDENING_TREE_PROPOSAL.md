# Market Flow US — Test-System Hardening S&T Decomposition

Status: proposed implementation-ready decomposition; review/freeze/allocation still required.

This file decomposes the approved structural direction in `.planning/TEST_SYSTEM_HARDENING_REPLAN.md` into a concrete branch-7 subtree. It is not implementation authorization. Until this proposal passes coherent-slice review, whole-plan outside-in review, final planning review, freeze/no-drift verification and allocation validation, `.planning/TREE.yaml` remains the active frozen-history source and `7.4` remains blocked.

## 1. Placement

Add one new release/reclosure subtree under branch `7`:

```text
7
├─ historical 7.1 / 7.2 / 7.3 / 7.5 / 7.6
├─ 7.7 Verification-system hardening and completeness reclosure
└─ 7.4 Final target-machine/provider acceptance
```

`7.4` gains `7.7.4` as an additional direct dependency. Existing direct dependencies remain because their historical evidence is still valid.

Expected final branch-7 child order:

```yaml
children: ["7.1", "7.2", "7.3", "7.5", "7.6", "7.7", "7.4"]
```

Expected final `7.4` dependency list:

```yaml
depends_on: ["7.5", "8.5", "9.6", "7.6.5", "7.7.4"]
```

Current TREE baseline has 58 nodes / 44 implementation leaves. This proposal adds 11 nodes and 7 implementation leaves, producing 69 nodes / 51 leaves. Planning validation must not solve this by merely replacing historical hard-coded totals; the hardening work must remove brittle total-count authority in favor of structural/freeze-baseline invariants.

## 2. Proposed subtree

### 7.7 — Verification-system hardening and completeness reclosure

**Type:** parent

**Strategy:** Before final target-machine/provider acceptance, repository verification is made comprehensive, deterministic and fast enough for repeated use, with each material contract/risk owned by the narrowest faithful proof and no known material coverage or verification-topology gap.

**Tactic:** Establish explicit proof ownership and a durable coverage ledger; re-audit recent product capability for missing material proof; remove lifecycle/wait/process and service-suite waste without weakening isolation; remove duplicate Browser/Acceptance/Replay execution while preserving named evidence and path-trigger completeness; then reclose one exact candidate through all affected deterministic gates.

**Necessary assumptions:**
- A green existing suite does not prove that all material contract/risk areas are owned or that recent features have no proof gaps.
- Final acceptance should not be the first place where deterministic repository defects, race/lifecycle leaks or CI-routing gaps are discovered.
- Recurring verification speed affects engineering quality because slow suites are run less often and encourage weaker feedback loops.

**Sufficiency assumptions:**
- `7.7.1` closes verification ownership/completeness.
- `7.7.2` closes Fast/service determinism and recurring cost.
- `7.7.3` closes Browser/Acceptance/Replay/Workload topology and specialized proof routing.
- `7.7.4` proves the integrated result on one exact candidate before `7.4` resumes.

**Success evidence:**
- Every material durable contract/risk has an explicit authoritative proof owner or explicit justified target-machine-only disposition.
- No known material recent-feature proof gap remains.
- Known deterministic lifecycle/duplicate-execution waste is removed or explicitly justified by distinct evidence value.
- Fast, Browser, Replay, Workload, Planning Docs and required order/local acceptance evidence are coherent and green on one exact candidate.
- `7.4` is pointed to that exact candidate and remains the only user-dependent acceptance stage.

**Children:** `7.7.1`, `7.7.2`, `7.7.3`, `7.7.4`.

---

### 7.7.1 — Verification ownership and completeness

**Type:** parent

**Strategy:** Verification completeness is explicit and outside-in rather than inferred from test count or line coverage.

**Tactic:** First define the durable contract/risk/proof ledger and CI ownership model; then re-audit current product surfaces and recent extensions against that ledger and close material gaps at the narrowest faithful layer.

**Children:** `7.7.1.1`, `7.7.1.2`.

#### 7.7.1.1 — Durable proof ledger, ownership and CI-trigger contract

**Type:** implementation leaf

**Depends on:** `7.6.5`.

**Strategy:** One durable verification map states what is being proved, which recurring command/workflow owns it, what evidence is target-machine-only, and which source/test/helper paths must trigger that owner.

**Tactic:** Convert `.planning/TEST_SYSTEM_COVERAGE_LEDGER.md` from planning baseline into the maintained proof ledger; align `docs/TEST_STRATEGY.md`, package scripts and workflow routing; validate source→proof ownership; replace brittle planning total-count checks with structural/freeze-baseline checks; evaluate lightweight Node built-in source coverage only as secondary telemetry, without arbitrary percentage targets.

**Success evidence:**
- Every material TREE/product contract family is mapped to primary proof layer, recurring owner, relevant command/workflow and acceptance/target disposition.
- Every shared helper/harness/source family that can invalidate a proof triggers at least one authoritative owner; no path-filter hole is known.
- Duplicate proof is classified as either intentional independent evidence or avoidable rerun; no duplicate is kept merely because it historically existed.
- Planning Docs validates TREE structure, parent/dependency correctness, required durable markers and frozen baseline without a hard-coded current total such as `58/44` or the new `69/51`.
- Source coverage telemetry, if retained, is documented as a gap-finding backstop; no 100% line/branch target becomes release authority.
- `docs/TEST_STRATEGY.md` states proof ownership and performance/determinism rules consistently with the ledger.

#### 7.7.1.2 — Current-product and recent-feature coverage gap closure

**Type:** implementation leaf

**Depends on:** `7.7.1.1`.

**Strategy:** Every material current capability is rechecked for normal, boundary, invalid/failure, recovery/lifecycle, security, race/concurrency and user-visible proof as applicable; tests are added only where a concrete risk lacks faithful evidence.

**Tactic:** Perform an outside-in audit spanning acquisition/universe, DB lifecycle/transactions, trusted reads, Current/Detail, Scanner, Demo Buy, AI Investigation, diagnostics/new-day, Replay recording/storage/portable source/Player/Host/isolation, standalone IBKR execution, Basic BUY confirmation/security and shared process/DB boundaries. Add the smallest deterministic missing proof; use table-driven/generative-style cases with existing tooling where appropriate; audit interactive surfaces for material keyboard/semantic/accessibility gaps before considering a new library.

**Success evidence:**
- Every ledger row is PASS, TARGET_ONLY with explicit rationale, or routed to a later `7.7` leaf for a known implementation/topology change; no unexplained material GAP remains.
- Replay, Basic BUY, IBKR, Demo Buy, AI Investigation, Current/Detail/Scanner, provider recovery/restart, diagnostics/support snapshot and Chat-27 hardening regressions each have current explicit proof mapping.
- Missing negative/boundary/failure/recovery/race/security cases found by the audit receive deterministic public-safe regressions at the narrowest layer.
- Browser interaction semantics that materially affect usability have focused keyboard/semantic/state proof with existing Playwright where feasible; no library is added solely to satisfy a category checklist.
- Any blocking defect discovered stays in this leaf through RCA → fix → regression → analogous-area sweep → affected verification → green.

---

### 7.7.2 — Fast/service determinism and recurring cost

**Type:** parent

**Strategy:** Fast feedback removes causal lifecycle/wait waste first, then optimizes real service integration only where measurement proves remaining cost.

**Tactic:** Eliminate referenced timers/process tails and avoidable real waits with deterministic lifecycle control; then profile service files/fixtures/bootstrap and optimize dominant recurring work without weakening real DuckDB/WebSocket/HTTP/filesystem isolation.

**Children:** `7.7.2.1`, `7.7.2.2`.

#### 7.7.2.1 — Timer/process/wait lifecycle RCA and deterministic cleanup

**Type:** implementation leaf

**Depends on:** `7.7.1.2`.

**Strategy:** Short test bodies must not leave referenced timers, child processes, sockets or arbitrary sleeps that extend process lifetime or create flaky timing.

**Tactic:** Fix the known Replay Host losing `Promise.race` timeout so the losing 5-second timer cannot retain the process; add regression proof; sweep production/test helpers for the same timer/process-lifecycle family; replace avoidable fixed sleeps/cadence waits with fake time, explicit gates/events or cancellable/unrefed bounded timers where semantics permit.

**Success evidence:**
- Replay Host child-stop success exits without the observed ~4.4–5 s referenced-timer tail and still escalates correctly on a genuinely stuck child.
- A regression fails on the old timer-retention behavior and passes the fix without relying on a long real sleep.
- Analogous `Promise.race`/timeout, child-process, socket/server and timer cleanup sites are enumerated and each has PASS/FIX/NOT_APPLICABLE disposition.
- Test-only timing seams do not create production bypasses or weaken real timeout behavior.
- Before/after process/runtime evidence is recorded and affected unit/service/replay proof is green.

#### 7.7.2.2 — Service-suite profiling, fixture/bootstrap optimization and safe concurrency decision

**Type:** implementation leaf

**Depends on:** `7.7.2.1`.

**Strategy:** Real service integration remains authoritative where it catches persistence/protocol/lifecycle risk, but its setup and repeated work are measured and minimized.

**Tactic:** Profile service execution by file/fixture/bootstrap/DB/process phase after timer-tail removal; optimize dominant setup or oversized fixture work with the smallest change; preserve fresh temp DB/service isolation unless evidence proves a safer reusable boundary; evaluate file-level or other concurrency only after repeat/stress proof demonstrates independence and net wall-clock benefit.

**Success evidence:**
- A repeatable profile identifies dominant service costs instead of treating the 175-test aggregate as one number.
- Fresh real DuckDB/service/WebSocket isolation remains for tests whose risk requires it; any fixture reuse has explicit contamination/order-independence proof.
- No optimization converts a real integration contract into a mock-only assertion merely for speed.
- Any concurrency change is stress/repeat proven, has no shared port/path/DB/process race and produces a measured net win; otherwise concurrency is explicitly rejected with evidence.
- Fast CI and local Fast commands retain complete unit/service/order proof with before/after runtime evidence and no material regression hidden by timeout increases.

---

### 7.7.3 — Browser, acceptance and specialized CI topology

**Type:** parent

**Strategy:** Browser and specialized gates each execute unique proof once per recurring path while preserving named acceptance evidence and focused subsystem ownership.

**Tactic:** Deduplicate full Chromium versus Local Fake checkpoint execution through exact same-candidate proof reuse; then align Replay/Fast/Workload/Order path routing so specialized workflows add distinct evidence rather than rerunning the same lower-layer suite.

**Children:** `7.7.3.1`, `7.7.3.2`.

#### 7.7.3.1 — Chromium/Local Acceptance single-execution evidence topology

**Type:** implementation leaf

**Depends on:** `7.7.1.2`.

**Strategy:** FR-7/FR-8 acceptance checkpoints remain first-class evidence, but Browser CI does not execute the identical Playwright scenarios once in full E2E and again solely to relabel them.

**Tactic:** Make the full Chromium run emit or expose a sanitized exact-test proof manifest/result that Local Acceptance can validate into its existing FR report for the same candidate/run; preserve standalone Local Acceptance execution for explicit operator use; fail closed on missing/stale/different-SHA/incomplete evidence.

**Success evidence:**
- Browser CI runs each FR-7/FR-8 Playwright scenario once while still producing the current named acceptance checkpoint report.
- Acceptance reuse binds to exact test identity and candidate SHA/run evidence and cannot silently consume stale prior-run output.
- `RUN_LOCAL_ACCEPTANCE`/individual profiles still execute the requested scenario when invoked independently and preserve failure diagnostics.
- AI-pack safety and any non-browser subcheck are either consumed from trustworthy same-run proof or deliberately retained as a small distinct check with documented ownership.
- Full Browser behavior, including material new interactive semantics from the completeness audit, is green and measured wall time shows the duplicate-execution cost removed without weaker evidence.

#### 7.7.3.2 — Replay/Fast/Workload/Order routing and specialized-proof deduplication

**Type:** implementation leaf

**Depends on:** `7.7.1.2`.

**Strategy:** Replay, Workload and Order gates remain specialized evidence; lower-layer unit/service work has exactly one recurring owner for each relevant source-path change.

**Tactic:** Expand/repair workflow path ownership so Fast reliably runs Replay unit/service proof for relevant Replay/Host/shared changes, then focus Replay CI on Replay build and Replay-specific browser/cross-layer acceptance; preserve Order acceptance as distinct sidecar lifecycle proof; keep Workload bounded correctness/performance profiles separate from heavy target-machine authority; close helper/path-filter holes.

**Success evidence:**
- Replay-affecting production/shared/helper paths cannot change without triggering the authoritative unit/service owner.
- Replay CI no longer reruns Replay unit/service proof if Fast is the authoritative owner for the same candidate, but still proves Replay build and Replay-specific cross-layer/browser contracts.
- Order acceptance remains explicit and synthetic/public-safe because it proves an operable sidecar lifecycle not reducible to individual unit cases.
- Workload CI retains bounded end-to-end plus isolated persistence/read/Scanner/Demo Buy sanity and does not absorb target-machine 4096×180 authority.
- Workflow path matrices cover production code, shared helpers, test harnesses and relevant config/package files; a regression test or planning validation guards the routing invariants where practical.
- Recurring workflow runtimes are measured after topology changes and no warning/error is waived without full RCA.

---

### 7.7.4 — Integrated verification completeness/performance reclosure

**Type:** implementation leaf

**Depends on:** `7.7.2.2`, `7.7.3.1`, `7.7.3.2`.

**Strategy:** One exact post-hardening candidate proves comprehensive deterministic repository correctness and acceptable feedback topology before any user-dependent final acceptance resumes.

**Tactic:** Re-run focused regressions and all affected authoritative gates; reconcile the coverage ledger; compare recurring runtime and duplicate-execution topology to baseline; close every warning/error RCA; review final diff/contracts/planning truth; merge and verify main CI/open-PR state; pin the exact candidate for `7.4`.

**Success evidence:**
- Unit, real-service, standalone order acceptance, browser build/full Chromium, Replay build/specialized acceptance, bounded Local Fake evidence, Planning Docs and bounded Workload gates are green according to the final ownership topology.
- `.planning/TEST_SYSTEM_COVERAGE_LEDGER.md` contains no unexplained material GAP; target-machine-only rows are explicitly deferred to `7.4` and are not mislabeled as repository PASS.
- Known Replay Host timer-tail and Browser duplicate-execution findings are closed with before/after evidence; remaining expensive proof is justified by distinct risk value.
- All CI warnings/errors encountered during this mini-project have recorded complete RCA: signal, root cause, prevention/detection failure, reusable prevention, analogous-area sweep and closing evidence.
- Final docs/scripts/workflows/tests agree on the same verification topology; no stale historical count or old command claims release authority.
- Final hardening PR is reviewed/squash-merged; required main CI is green; open PR audit is clean; exact final SHA is recorded.
- `7.4` is updated to depend on `7.7.4` and resumes only against that exact merged candidate.

## 3. Dependency graph

```text
7.6.5 (done historical audited candidate)
  ↓
7.7.1.1 proof ledger / ownership / routing contract
  ↓
7.7.1.2 product-wide gap audit + missing-proof closure
  ├──────────────→ 7.7.2.1 timer/process/wait RCA
  │                    ↓
  │               7.7.2.2 service profiling/optimization
  │
  ├──────────────→ 7.7.3.1 Browser/Local Acceptance dedup
  │
  └──────────────→ 7.7.3.2 Replay/Fast/Workload/Order routing

7.7.2.2 + 7.7.3.1 + 7.7.3.2
  ↓
7.7.4 integrated reclosure
  ↓
7.4 final target-machine/provider acceptance
```

`7.7.2.1`, `7.7.3.1` and `7.7.3.2` are technically parallel after `7.7.1.2`; later serial Chat allocation may order them for merge safety without falsifying TREE dependencies.

## 4. Why this is neither under- nor over-decomposed

Rejected smaller decomposition: one leaf for “improve all tests” would combine audit, defects, performance, Browser topology and final reclosure into an unverifiable multi-purpose task.

Rejected larger decomposition: separate leaves for each framework/test file/category would encode implementation mechanics into S&T and create dozens of artificial handoffs. Security/race/accessibility/property-like checks remain risk classes owned by the leaf whose boundary can faithfully prove them.

Seven leaves are the smallest set that gives each material decision boundary an independently checkable outcome while allowing the expensive implementation work to proceed in coherent engineering units.

## 5. Review questions before TREE mutation

The next planning review must explicitly challenge:

1. Does `7.7.1.1` make coverage/CI ownership durable without inventing a second planning framework?
2. Does `7.7.1.2` define “complete” strongly enough while avoiding test-category theater and arbitrary 100% coverage?
3. Is the known Replay Host timer defect correctly owned by `7.7.2.1`, including analogous-family prevention rather than a local patch?
4. Does `7.7.2.2` preserve real integration isolation and prohibit concurrency-before-evidence?
5. Can `7.7.3.1` preserve named FR evidence while executing the same Playwright proof once?
6. Can `7.7.3.2` remove Replay lower-layer duplication without creating path-filter proof holes?
7. Does `7.7.4` prove both completeness and feedback quality before `7.4`?
8. Is any material recent feature/risk absent from the coverage ledger or subtree?

Only after those challenges are resolved should this proposal be copied into `.planning/TREE.yaml`, reviewed/frozen and allocated.