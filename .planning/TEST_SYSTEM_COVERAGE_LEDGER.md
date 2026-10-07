# Market Flow US — Verification Coverage Ledger

Status: reviewed planning baseline for `7.7`; implementation closure not yet authorized.

This ledger defines material verification ownership for the current product and test system. It is outside-in and contract/risk driven. `PASS` means current evidence appears to cover the material risk family and must still survive the `7.7.1.2` audit. `AUDIT` means evidence exists but completeness/ownership must be rechecked. `GAP` means a known material issue requires change. `TARGET_ONLY` means repository automation cannot truthfully replace target-machine/provider proof.

Numeric line/branch coverage is not release authority. It may be used as secondary telemetry only if it cheaply exposes an otherwise hidden gap. Durable policy/ownership belongs in `docs/TEST_STRATEGY.md`; this file is the current-cycle audit/closure ledger.

| Area | Material contract / risk | Primary proof owner | Current evidence / routing | Planning status | Planned owner |
|---|---|---|---|---|---|
| Provider acquisition | complete `ScreenerHulPaging3`, exact count/shape, canonical `PaperId`, malformed/HTTP failure | Unit + Browser/Local Fake | provider/parser/unit + Fake Market E2E | PASS/AUDIT | `7.7.1.2` |
| Recorder / universe | one coherent response→cycle, membership revision, reorder invariance, non-overlap, stop/failure | Unit + Service + Browser | recorder/unit/service + FR-7/FR-8A-C | PASS/AUDIT | `7.7.1.2` |
| Schema lifecycle | schema v4 fresh/reopen/v3→v4, incompatible fail-closed, rollback/new-day preservation | Real Service/DuckDB | schema/migration/new-day service tests | PASS/AUDIT | `7.7.1.2` |
| Writer / persistence | transactional latest/history, rollback, serialized authority, session/universe facts | Real Service/DuckDB | database writer + service integration | PASS/AUDIT | `7.7.1.2` |
| Trusted reads | Current/Security/History/status shapes, historical-only lookup, paging/cursor binding | Real Service | trusted-read service tests | PASS/AUDIT | `7.7.1.2` |
| Current UI | U.S. fields, deterministic sort, null/zero, refresh, state restoration | Unit + Chromium | current surface + E2E | PASS/AUDIT | `7.7.1.2` |
| Detail/History UI | current/historical-only, pagination/retry, back/state, current Detail BUY entry boundary | Unit + Service + Chromium | Detail/History unit/service/E2E | PASS/AUDIT | `7.7.1.2` |
| Scanner | SELECT-only admission, saved-query CRUD, Draft/Persisted/Active isolation, scheduler, staged query behavior | Unit + Service + Chromium | Scanner unit/service/E2E | PASS/AUDIT | `7.7.1.2` |
| Demo Buy capture | immutable provenance, exact writer watermark/baseline, payload bounds, ACK unknown, no copied buy price | Unit + Real Service + Chromium | capture protocol/controller/service + FR-8E | PASS/AUDIT | `7.7.1.2` |
| Demo Buy evaluation | post-watermark horizons, null/unavailable semantics, keyset paging, targeted refresh, snapshot consistency | Real Service + Chromium + Workload | evaluator/service + FR-8F + bounded evaluator probe | PASS/AUDIT | `7.7.1.2` |
| AI Investigation | anti-hindsight watermark partition, returned-position semantics, sharing-safe redaction, regeneration/copy | Unit + Real Service + Chromium | pack tests + FR-8G/H | PASS/AUDIT | `7.7.1.2` |
| Diagnostics / support | bounded sanitized diagnostics, support snapshot, no credential/session leakage | Unit + Service | diagnostics/support service tests | PASS/AUDIT | `7.7.1.2` |
| New trading day | valid v3/v4 inspection, saved-query preservation, archive/reset/install semantics, running-owner fail-closed | Unit + Service + Workload | new-day tests + target-day probe | PASS/AUDIT | `7.7.1.2` |
| Replay recording | validated snapshot boundary, immutable frames, IndexedDB/storage/quota handling | Unit + Chromium Replay | replay recording/storage tests | PASS/AUDIT | `7.7.1.2` |
| Replay portable source | versioned file format, manifest/frame/footer agreement, malformed/truncated/unsupported fail-closed, direct file source | Unit + Chromium Replay | portable parser/source + replay E2E | PASS/AUDIT | `7.7.1.2` |
| Replay Player timing | 1x observed gaps, pause/resume, stop/restart, generation cancellation, timestamp rebase | Unit + Replay cross-layer | fake-clock/unit + replay player E2E | PASS/AUDIT | `7.7.1.2` / `7.7.2.1` |
| Replay Host lifecycle | loopback security, child ownership, fresh replay DB, foreign process/data fail-closed, clean stop/escalation | Service + Replay acceptance | replay-host service/race tests | **GAP: losing 5s timer retains process** | `7.7.2.1` |
| Replay isolation/start-without-history | seek starts fresh DB/no preroll, normal service replay-unaware, live DB untouched, missing prior history tolerated | Service + Replay Chromium | replay service/E2E + hardening proof | PASS/AUDIT | `7.7.1.2` |
| Order local security | 127.0.0.1, caller token, hostile Origin/CORS rejection, body bounds, sanitized diagnostics | Unit + Service + Order acceptance | order security/unit/service + synthetic acceptance | PASS/AUDIT | `7.7.1.2` |
| Order provider lifecycle | DRY_RUN/LIVE gates, what-if/submit/reply, cancel/fill, no-short SELL, ACK unknown reconciliation | Unit + Service + Order acceptance | adapter/state tests + acceptance | PASS/AUDIT | `7.7.1.2` |
| Order idempotency/restart | same request same intent replay, intent mismatch reject, token rotation, durable execution facts | Unit + Service + Order acceptance | persistence/restart + acceptance | PASS/AUDIT | `7.7.1.2` |
| Basic BUY | current Detail only, immutable ticket, quantity/mode ownership, trusted confirmation, CSRF, duplicate click, Node-only sidecar token | Unit + Service + Chromium + Order acceptance | Basic BUY unit/service/E2E | PASS/AUDIT | `7.7.1.2` |
| Cross-feature authority | Scanner/Demo Buy/AI/Replay/normal launch cannot execute orders; Replay/live DB/process boundaries disjoint | Service + Chromium + code/reclosure guards | pre-acceptance code audit + integration guards | PASS/AUDIT | `7.7.1.2` |
| Failure/recovery | provider failure/recovery, service restart, persistence restart, replay/order process failure, retry/unknown semantics | Service + Chromium + acceptance | FR-8C/D + service/order/replay tests | PASS/AUDIT | `7.7.1.2` |
| Race/concurrency | serialized writer/capture order, scheduler generation cancellation, ACK loss, process stop/start, duplicate clicks | Unit + Service | focused race/idempotency tests | PASS/AUDIT | `7.7.1.2` / `7.7.2.1` |
| Timer/process cleanup | no referenced losing timers, orphan child/server/socket handles, arbitrary sleep tails | Unit/Service lifecycle proof | historical demo timer fix; current Replay Host defect | **GAP** | `7.7.2.1` |
| Service fixture isolation | temp path, fresh DuckDB/service, port 0, WS cleanup, no cross-test contamination | Real Service harness | `tests/service/helpers/service-fixture.mjs` | PASS but cost must be profiled | `7.7.2.2` |
| Test maintainability/hygiene | no stale/duplicate proof, clear ownership/names/assertions, helpers reduce duplication without hiding semantics | Whole test tree + focused owners | broad existing suite; systematic whole-test audit not yet recorded | **AUDIT** | `7.7.1.2` |
| Flake/focus/retry discipline | no unowned `skip`/`todo`/`.only`; no retry masking; deterministic waits/gates; bounded repeat for changed race/timing paths | Unit/Service/Chromium harnesses | Playwright currently workers=1 and no configured retries; whole tree still needs audit | **AUDIT** | `7.7.1.2` + `7.7.4` |
| Fixture/data quality | deterministic minimal synthetic/public-safe fixtures; no unnecessary giant data or private material | Unit/Service/E2E/Workload helpers | existing synthetic/fake-market strategy | PASS/AUDIT | `7.7.1.2` / `7.7.2.2` |
| Failure diagnostics | failed proof identifies owning stage/root signal while reports/artifacts stay bounded and sanitized | Test harness + workflow artifacts | existing diagnostics/artifacts; systematic audit incomplete | **AUDIT** | `7.7.1.2` / `7.7.4` |
| Build/package/operator/config | browser/replay build, launchers, runtime/test config and selection seams fail visibly and trigger owners | Unit/build/specialized CI | build tests + CI build steps + prior packaging proof | PASS/AUDIT | `7.7.1.2` / `7.7.1.1` |
| Static/build checks | syntax/build/config mistakes caught at cheapest faithful layer; no blanket tool added without evidence | Build/unit/planning | browser/replay builds + Node execution; no lint release gate | AUDIT usefulness/gaps | `7.7.1.2` |
| Fast runtime | recurring unit/service/order feedback catches product defects without avoidable lifecycle/setup cost | Fast CI | 254 unit ~4.99s; 175 service ~19.03s; order acceptance short | **GAP: service/timer cost needs RCA/profile** | `7.7.2.1` + `7.7.2.2` |
| Browser full E2E | browser composition/user behavior once per candidate | Browser CI | full Chromium suite | PASS | `7.7.3.1` |
| Local Acceptance FR-7/8 | named release checkpoints over exact authoritative scenarios | Browser/local acceptance | `run-local-acceptance.mjs` re-executes scenarios already in full E2E | **GAP: duplicate execution** | `7.7.3.1` |
| Acceptance evidence freshness | acceptance report cannot reuse stale/different-candidate proof | Acceptance harness | current runner executes fresh child processes so freshness implicit | redesign required if proof reuse introduced | `7.7.3.1` |
| Replay recurring CI | Replay build/cross-layer acceptance plus lower-layer ownership for Replay code changes | Replay + Fast | Replay CI reruns replay unit/service; Fast path filters do not currently cover all Replay Host/browser Replay source | **GAP: ownership/trigger duplication-hole tradeoff** | `7.7.3.2` |
| Cross-workflow same-SHA closure | specialized green cannot replace missing/failing authoritative lower-layer owner | Release/reclosure | current workflows are separate; final process expects all required green | **AUDIT explicit guarantee after rerouting** | `7.7.3.2` / `7.7.4` |
| Order recurring CI | explicit operable synthetic sidecar lifecycle | Fast CI | `test:acceptance:order` after unit/service | PASS; intentional distinct evidence | `7.7.3.2` audit |
| Workload hosted CI | bounded end-to-end + isolated persistence/read/Scanner/Demo Buy sanity | Workload CI | two bounded jobs, sanitized reports | PASS/AUDIT | `7.7.3.2` |
| Heavy performance | 4096×180 and one-day target authority | Target machine | local target profiles only | TARGET_ONLY | `7.4` |
| Authenticated provider | real browser/provider compatibility and market-open movement | Target machine/provider | no live provider CI | TARGET_ONLY | `7.4` |
| Real IBKR submission | actual LIVE order only with external permission and explicit confirmation | Target machine/provider | synthetic/DRY_RUN CI only | TARGET_ONLY / may be `PENDING_EXTERNAL_PERMISSION` | `7.4` |
| Accessibility semantics | material keyboard/semantic/state usability of interactive Viewer/Replay/BUY surfaces | Chromium | existing UI behavior proof; systematic current-feature audit not yet complete | AUDIT | `7.7.1.2` |
| Source coverage telemetry | unexecuted implementation paths as secondary clue, not semantic authority | optional Node built-in coverage | no numeric release target | AUDIT usefulness/cost | `7.7.1.1` |
| CI path routing | each source/helper/harness/config change triggers authoritative proof owner | Planning + workflow validation | current Fast/Browser/Replay/Workload path filters differ; Replay lower-layer ownership has known overlap/hole | **GAP** | `7.7.1.1` + `7.7.3.2` |
| Planning validation | TREE/contracts/reviews/allocation/freeze invariants without historical-count brittleness | Planning Docs | currently hard-codes 58 nodes / 44 leaves | **GAP** | `7.7.1.1` |
| CI warning/error handling | no progression after warning/error without complete RCA and analogous-area sweep | all workflows + planning policy | framework 1.0.0 CI-RCA policy installed | PASS policy / enforce through `7.7.4` | all leaves |

## Coverage-completeness rule

A row may close only when all applicable dimensions are addressed:

```text
normal behavior
+ boundary/invalid input
+ failure semantics
+ restart/recovery/lifecycle
+ race/concurrency where ordering matters
+ security/privacy where authority crosses a boundary
+ user-visible semantics where a browser surface exists
+ performance/load only where the contract is materially performance-sensitive
+ test-system hygiene/determinism where the proof itself can fail silently or flake
```

Not every row needs every dimension. `NOT_APPLICABLE` must be justified by the contract/risk boundary, not by absence of an existing test.

## Proof-ownership rule

The narrowest faithful layer owns the assertion:

```text
pure semantics              → unit
real persistence/protocol   → service/integration
browser composition/UX      → Chromium
named release checkpoint    → acceptance evidence over authoritative proof
Replay-specific composition → Replay gate
order operability/lifecycle → order acceptance
bounded scale sanity        → Workload
heavy/provider truth        → 7.4 target machine
```

A second execution is justified only when it adds independent evidence. A new label/report over the same successful execution is not a reason to rerun the scenario.

## Test-system hygiene rule

Refactoring tests is justified when it improves at least one of:

```text
contract visibility
correctness / gap closure
determinism / flake resistance
resource cleanup / isolation
failure diagnostics
maintainability / non-duplicated helpers
fixture size / recurring runtime
```

Do not refactor merely for stylistic uniformity. Do not use retries, sleeps, mocks or broad helper abstraction to hide a failing contract. Any intentional skip/todo/exclusion requires an explicit owner and reason.

## Performance baseline entering 7.7

Latest recorded Fast CI baseline on current main candidate:

```text
unit:    254 tests, ~4.99 s
service: 175 tests, ~19.03 s
order acceptance: short synthetic post-step
```

Known current recurring topology finding:

```text
Browser CI
→ full Chromium E2E
→ Local Acceptance re-executes FR-7/FR-8 scenarios selected from that full E2E suite
```

Known lifecycle finding:

```text
Replay Host stopOwnedChild
→ Promise.race(child exit, referenced 5000ms delay)
→ child exits quickly
→ losing delay remains referenced
→ Node process can stay alive ~5s
```

These are planning baselines, not immutable numeric SLOs. Closing evidence must show causal improvement and absence of proof regression; it must not game shared-runner variance.

## Exit condition for this ledger

Before `7.7.4` can close:

- every material row is `PASS`, `TARGET_ONLY` with explicit `7.4` routing, or an explicitly justified non-applicable row;
- no `GAP` or unexplained `AUDIT` remains;
- proof ownership and workflow path routing match actual scripts/workflows;
- test/harness hygiene findings are either fixed or explicitly justified with ownership;
- materially changed timing/race/lifecycle/topology paths have bounded repeat/stress evidence without retry masking;
- every defect discovered during audit has RCA/fix/regression/analogous sweep evidence;
- no sensitive credential/session/account material is introduced into fixtures, reports or artifacts.