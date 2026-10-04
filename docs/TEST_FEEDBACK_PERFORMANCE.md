# Test Feedback Performance

This document is the measured before/after evidence owner for execution node `6.6`.
It supplements the stable contract in `docs/TEST_STRATEGY.md` §15; it does not weaken any test obligation.

## Historical baseline

Authority: GitHub Actions run `36348375187`.

| Step | Historical wall time |
|---|---:|
| npm ci | ~2s |
| Chromium install with dependencies | ~26s |
| focused unit/service | ~1s |
| focused Chromium | ~12s |
| full Fast | ~15s |
| full Browser | ~16s |
| total job | ~79s |

This historical job intentionally included focused proof immediately followed by full proof and therefore contains known serial duplication.

## Chat 12 current full-only profile

Authority: GitHub Actions run `36352649760` on PR #32.

The temporary profiling workflow preserved all current coverage:
- unit: 57/57 pass;
- service: 57/57 pass;
- Chromium: 14/14 pass.

Measured command durations:

| Component | Current |
|---|---:|
| npm ci | 2.592s |
| browser build | 0.182s |
| full unit | 1.335s |
| full service | 14.980s |
| Chromium provisioning | 33.622s |
| full Browser | 15.926s |
| measured component total | 68.637s |

The profiling-only per-service-file rerun is excluded from the component total above. Including runner/setup/post overhead, the equivalent current full-only serial path is approximately 74 seconds before any optimization.

### Service file process profile

Each service file was run in its own fresh `node --test` process to expose process/lifecycle cost.

| Service file | Wall time |
|---|---:|
| `browser-producer-bridge.test.mjs` | 0.466s |
| `cycle-authority.test.mjs` | 1.244s |
| `database-lifecycle.test.mjs` | 1.247s |
| `demo-orchestration.test.mjs` | 5.612s |
| `diagnostics.test.mjs` | 0.522s |
| `fake-market.test.mjs` | 0.250s |
| `producer-authority.test.mjs` | 0.777s |
| `producer-recovery.test.mjs` | 0.850s |
| `saved-query-library.test.mjs` | 0.945s |
| `scanner-authority.test.mjs` | 0.842s |
| `service-fixture.test.mjs` | 0.346s |
| `viewer-reads.test.mjs` | 0.745s |
| `websocket-transport.test.mjs` | 0.471s |
| sequential per-file total | 14.317s |

The full service command is 14.980s, close to the 14.317s sum of fresh per-file processes. Therefore the bottleneck is not one unexplained process-exit tail after a fast suite; significant time is distributed across file-level lifecycle/bootstrap work, with `demo-orchestration.test.mjs` the largest single contributor.

### Demo orchestration tail localization

Run `36352649760` also exposes per-test duration inside `demo-orchestration.test.mjs`:

| Test | Duration |
|---|---:|
| CLI `npm run demo:fake-market` stack proof | 432.621ms |
| direct `startDemo` stack proof | 139.772ms |
| same-path restart persistence proof | 271.429ms |
| demo reset safety proof | 3.827ms |
| demo startup diagnostics proof | 49.206ms |
| **sum of test bodies** | **896.855ms** |
| **node:test file duration** | **5579.435ms** |
| **unattributed process tail** | **4682.580ms** |

The first test completes at `21:41:59.491Z`; the file process exits at `21:42:04.496Z`, almost exactly five seconds later.

The causal code is the test helper `startDemoCommand().close()`:

- it races child-process exit against a 5000ms rejection timer;
- when child exit wins, the timeout is not cleared or unref'ed;
- that still-referenced timer keeps the Node test process alive until the five-second deadline;
- the behavior is test-harness-only; product shutdown itself completed promptly.

This is the first deterministic lifecycle optimization target for the next stage. The correct repair is to make the timeout cancellable/cleared when process exit wins while preserving the 5s failure bound.

## Attribution and next optimization order

Measured current component share:

1. Chromium provisioning: 33.622s, about 49% of measured component time.
2. Browser execution: 15.926s, about 23%.
3. Service execution: 14.980s, about 22%.
4. npm/unit/build combined: about 4.109s, about 6%.

The next implementation stage should therefore:

1. profile `demo-orchestration.test.mjs` internal lifecycle/wait boundaries and the next-largest service files before changing them;
2. profile Browser test/spec duration to identify deterministic waits versus irreducible Chromium work;
3. prove a safe exact-version Playwright/Chromium cache or equivalent provisioning reuse;
4. preserve all 57 unit, 57 service and 14 Browser tests while measuring each optimization against this report.

No timing target is relaxed by this profile.


## Optimization 1 — clear the demo shutdown timeout

Authority: GitHub Actions run `36352976403`.

Change:
- `startDemoCommand().close()` still enforces the same 5000ms failure bound;
- the timeout handle is now cleared in `finally` when child-process exit wins;
- no product behavior, assertion, fixture authority or Browser contract was weakened.

Measured result:

| Metric | Before | After | Change |
|---|---:|---:|---:|
| `demo-orchestration.test.mjs` | 5.612s | 1.143s | -4.469s / -79.6% |
| full service suite | 14.980s | 10.050s | -4.930s / -32.9% |
| full `test:fast` | ~15s historical | 11.244s | ~-25.0% |
| Chromium provisioning | 33.622s | 29.014s | runner variance; no cache optimization yet |
| full Browser | 15.926s | 16.787s | runner variance; no Browser optimization yet |

Coverage remained unchanged and green:
- unit: 57/57;
- service: 57/57;
- Chromium: 14/14.

The demo file is no longer the dominant service outlier. Its 1.143s wall time is now in the same order of magnitude as the larger DB/authority service files.

The Fast target of <=10s is **not yet met**: measured `npm run test:fast` is 11.244s, 1.244s over target. The result is recorded rather than relaxing the target.

Using only the non-duplicated final-path components from this run:

```text
npm ci              2.415s
browser build       0.237s
full Fast          11.244s
Chromium provision 29.014s
full Browser       16.787s
--------------------------
component total    59.697s
```

That component total is about 24.4% below the historical 79s job, so the node's required >=35% improvement is also not yet satisfied.

### Next measured bottleneck

After the deterministic demo-timer repair, remaining material costs are:
1. Chromium provisioning: 29.014s;
2. Browser execution: 16.787s versus <=12s target;
3. Fast: 11.244s versus <=10s target.

The next stage should profile Browser spec/test duration to localize deterministic waits and lifecycle overhead before changing any Browser timing behavior. Exact-version Chromium provisioning reuse follows that localization.


## Browser profile — per-spec and per-test localization

Authority: GitHub Actions run `36353261423`.

The Browser profiler ran each E2E spec independently with Playwright's list reporter and then reran the full 14-test suite unchanged.

### Per-spec wall time

| Spec | Wall time |
|---|---:|
| `current-surface.spec.mjs` | 2.977s |
| `detail-surface.spec.mjs` | 3.864s |
| `runtime-composition.spec.mjs` | 10.406s |
| `scanner-surface.spec.mjs` | 3.292s |
| `viewer-refresh.spec.mjs` | 3.270s |
| independent-spec sequential total | 23.809s |
| unchanged full Browser suite | 17.076s |

Independent-spec totals include fresh Playwright worker/browser startup for every file and therefore are diagnostic only, not a proposed final execution mode.

### Per-test duration

| Test | Duration |
|---|---:|
| Current populated/sort/accessibility | 0.422s |
| Current empty vs read failure | 0.203s |
| Detail history/load-more/back | 1.8s |
| Detail empty/unknown/error/historical-only | 0.276s |
| Detail stale-open suppression | 0.180s |
| Runtime normal composition | 0.978s |
| Runtime Viewer close/reopen + producer independence | **3.7s** |
| Runtime service-unavailable recovery | 0.714s |
| Runtime Query Library CRUD/reopen | 2.0s |
| Runtime Support Snapshot | 0.782s |
| Scanner cadence/draft isolation | 0.860s |
| Scanner invalid interval | 0.228s |
| Scanner shared Detail navigation | 0.482s |
| Viewer authoritative refresh/state preservation | 1.6s |

Approximate sum of reported test bodies is 14.225s. The full command measured 17.076s, leaving about 2.85s of shared Playwright/worker/browser/reporting overhead.

### Dominant deterministic wait

The 3.7s runtime test is the largest single Browser test. Its intent is to prove that closing the Viewer does not stop producer persistence and that clean stop/relaunch does not overlap producer ownership.

Its proof currently waits until persisted `history` grows after the Viewer closes. The runtime uses the normal Recorder default:

```text
snapshotIntervalMs = 3000
```

The Recorder's first cycle runs immediately and then schedules the next cycle from that 3000ms cadence. Therefore this test pays roughly one full production snapshot interval before the assertion can succeed.

This is an **incidental test wait**, not a requirement to prove that the production interval itself is three seconds. The next optimization stage should use the existing runtime recorder-config seam to give this test a small deterministic interval while preserving:
- the same producer-independence assertion;
- real Browser + Fake Market + real local service/DuckDB behavior;
- the production default of 3000ms unchanged;
- no tighter timing assertion against normal product behavior.

After that repair the Browser suite must be re-profiled before touching the 2.0s Query Library or 1.8s Detail tests.


## Optimization 2 — remove incidental production cadence from producer-independence E2E

Authority: GitHub Actions run `36353473919`.

Change:
- only the producer-independence Browser test sets `__MARKET_SCOPE_CONFIG__.recorder.snapshotIntervalMs = 100` through the runtime's existing recorder-config seam;
- production default remains `snapshotIntervalMs = 3000`;
- the test still uses the real built Browser runtime, Fake Market, WebSocket local service and DuckDB;
- the proof still requires persisted history to grow after the Viewer closes, then proves stop/relaunch never overlaps producer ownership.

Measured result:

| Metric | Before | After | Change |
|---|---:|---:|---:|
| producer-independence E2E test | 3.7s | 1.2s | -2.5s / -67.6% |
| `runtime-composition.spec.mjs` independent wall | 10.406s | 8.201s | -2.205s / -21.2% |
| full Browser suite | 17.076s | 14.396s | -2.680s / -15.7% |

All 14 Browser tests remained green.

The Browser target of <=12s is **not yet met**: the measured full suite is 14.396s, 2.396s over target. The target remains unchanged.

The next largest individual Browser tests are now:
1. Runtime Query Library CRUD/reopen: about 2.2s.
2. Detail history/load-more/back: about 1.9s.
3. Viewer authoritative refresh/state preservation: about 1.8s.

Before changing any of those tests, the next stage should localize their internal waits/lifecycle costs and distinguish real behavior proof from incidental cadence or repeated bootstrap.


## Browser profile — remaining heavy-test phase attribution

Authority: GitHub Actions run `36353703729`.

Temporary phase instrumentation was added only for measurement, then removed. The full Browser suite remained green.

### Query Library CRUD/reopen

Measured phases:

| Phase | Delta |
|---|---:|
| runtime + Viewer ready | 0.526s |
| built-in query execute/render | 0.308s |
| two user-query creates | 0.353s |
| update + rename + duplicate-name rejection | 0.383s |
| Viewer reopen + Current ready | 0.173s |
| delete both user queries + built-in verification | 0.210s |
| measured phase total | 1.952s |

There is no single sleep/cadence bottleneck here. Time is distributed across real WebSocket/service/DuckDB CRUD, Viewer reopen, and public UI verification. Shortening one phase by removing operations would weaken the Query Library contract rather than remove incidental waiting.

### Detail 500-row/load-more/retry proof

Measured phases:

| Phase | Delta |
|---|---:|
| mount fixture | 0.151s |
| delayed security read + initial 500-row render | 0.410s |
| failed continuation + retry UI | 0.355s |
| retry + 502-row render | 0.422s |
| Back + call-sequence verification | 0.125s |
| measured phase total | 1.463s |

The only explicit synthetic delay is `securityDelayMs = 50`, used to make the loading-state proof observable. It is small relative to the test. Most time is actual 500/502-row DOM rendering plus retry-state verification. Removing rows or retry behavior solely for speed would weaken the public contract.

### Viewer authoritative refresh/state-preservation proof

Measured phases:

| Phase | Delta |
|---|---:|
| fixture/controller bootstrap | 0.063s |
| Current refresh + sort | 0.115s |
| open Detail + render 500 + load 502 | 0.606s |
| committed-cycle refresh to 503 + summary/status refresh | 0.292s |
| Back + viewport/sort restoration | 0.084s |
| manual refresh + no-network verification | 0.070s |
| measured phase total | 1.230s |

Again, there is no incidental fixed wait. The dominant phase is the intended 500/502-row depth-preservation proof.

### Warm Browser observation

The unchanged full Browser command at the end of this profiling run measured `10.842s` with 14/14 passing. This run followed five independent per-spec Browser executions in the same job, so it is **warm evidence**, not a cold/stability proof. It shows that the <=12s target is achievable on the reference runner, but the prior 14.396s run means the target is not yet considered stable.

### Consequence

The remaining heavy tests do not expose another safe test-local wait comparable to the removed 3000ms Recorder cadence. The next Browser optimization should therefore move to a runner-level lever: prove that file-level Playwright parallelism (while keeping tests within each file ordered and preserving the fixed-port runtime-composition file) is deterministic and reduces cold full-suite wall time. Test semantics should remain unchanged.


## Optimization probe — file-level Playwright parallelism rejected

Initial authority: GitHub Actions run `36353979246`.

The first cold matrix compared fresh runners with `workers=1`, two `workers=2` repetitions, and `workers=3`. The baseline passed, while every parallel job failed the same Detail loading-state assertion.

That failure was not a cross-spec resource collision. It exposed a pre-existing timing race in the Detail test:
- the test tried to keep the loading state observable with a fixed `securityDelayMs = 50`;
- under parallel CPU scheduling, the 50ms timer could complete before Playwright observed the transient loading status;
- the public behavior was still correct, but the proof depended on wall-clock luck.

The test harness was repaired by replacing the 50ms delay with an explicit test-controlled promise gate. The test now:
1. starts the real Detail open flow;
2. waits until the loading state is visibly asserted;
3. explicitly releases the synthetic security read;
4. continues the same 500-row, retry, pagination and Back verification.

No product behavior or assertion was weakened.

Re-proof authority: GitHub Actions run `36354083502`.

| Fresh-runner variant | Command wall | Playwright result |
|---|---:|---:|
| `workers=1` | 12.738s | 14/14 pass, 12.0s reported |
| `workers=2` repeat A | 15.266s | 14/14 pass |
| `workers=2` repeat B | 14.530s | 14/14 pass |
| `workers=3` | 16.065s | 14/14 pass |

Conclusion: file-level parallelism is deterministic after the loading-proof repair, but it is slower on the reference GitHub runner. The optimization is rejected. `workers: 1` remains the correct KISS execution shape.

The cold single-worker Browser command is still slightly above the <=12s target by command wall (12.738s), while Playwright's own reported execution is 12.0s and a prior warm run was 10.842s. There is no evidence supporting target relaxation yet; remaining Browser variance should be treated as runner/process overhead rather than solved by parallelism.


## Optimization 3 — exact-version Chromium cache reuse

Authority: GitHub Actions run `36354367303`.

The proof used two different fresh `ubuntu-latest` runners:
1. **prime** — exact cache miss, provision dependencies and Chromium, run the unchanged Browser suite, then save the browser cache;
2. **reuse** — restore the exact cache on a new runner with `fail-on-cache-miss: true`, verify Chromium without a download, and run the same Browser suite.

The cache key contract is:

```text
ms-playwright-${runner.os}-${runner.arch}-${hashFiles('package-lock.json')}
```

This is intentionally stricter than a hand-maintained Playwright-version key. The repository lock currently pins `@playwright/test = 1.63.0` and `playwright = 1.63.0`; any lockfile change automatically invalidates the browser cache.

### Measured result

| Metric | Cold cache miss | Fresh-runner cache hit |
|---|---:|---:|
| Chromium cache | miss | **hit** |
| system dependency provisioning | 14.657s | 19.531s |
| Chromium binary provisioning / verification | 12.846s | **0.689s** |
| full Browser command | 14.223s | **11.959s** |
| Browser coverage | 14/14 | 14/14 |
| whole GitHub job wall | **56s** | **48s** |

The cached browser therefore removes about **12.2s** of binary provisioning on the measured runners while preserving the full Browser contract.

### Target evaluation

- **Cold CI target <=60s:** met by the 56s cache-miss Browser job.
- **Warm CI target <=45s:** not yet met; the cache-hit job was 48s.
- The remaining warm bottleneck is no longer the Chromium binary. `install-deps chromium` plus cache restore dominates setup time.
- No target is relaxed.

The exact-version cache pattern is safe for Chat 13 to consume in final Browser CI. The temporary proof workflows were removed after measurement; final CI orchestration still belongs to nodes 6.3/6.4.

### Next optimization boundary

The next stage should evaluate the smallest safe way to remove the remaining warm provisioning overhead. In particular, prove whether the reference GitHub runner can execute the pinned headless Chromium from the exact cache without a per-run `install-deps chromium`, or whether a smaller headless-shell provisioning path is required. Any adopted path must still run all 14 Browser tests on a fresh runner and must not depend on an unverified host assumption.


## Optimization 4 — warm Browser without per-run system dependency provisioning

Authority: GitHub Actions run `36354652419`.

A fresh `ubuntu-latest` runner restored the exact Chromium cache created by the prior lockfile-keyed proof and intentionally **did not run** `playwright install-deps chromium`.

Execution shape:

```text
npm ci
restore ~/.cache/ms-playwright by exact lockfile key
npx playwright install chromium   # verification only; no download
npm run build:browser
npm run test:e2e
```

Measured result:

| Metric | Result |
|---|---:|
| exact Chromium cache | hit |
| `install-deps chromium` | **skipped** |
| cached Chromium verification | 2.228s |
| full Browser command | 14.453s |
| Browser coverage | 14/14 pass |
| whole GitHub job wall | **31s** |

This proves that the current reference `ubuntu-latest` runner image already contains the runtime system libraries required by the pinned Playwright 1.63.0 Chromium artifact. The Browser test itself is the runtime proof: if the host image later loses a required dependency, the real Chromium launch fails rather than silently passing.

### Target evaluation

- **Warm CI target <=45s:** met with 31s.
- This is 17s faster than the prior 48s cache-hit job that still ran `install-deps chromium`.
- No headless-shell-specific provisioning path is justified; the simpler exact-cache + real-browser execution path is both faster and proven.
- The production/browser test semantics are unchanged and all 14 tests still execute.

The final Browser CI owned by Chat 13 should consume this KISS shape:
- exact lockfile-keyed Chromium cache;
- no unconditional `install-deps` on the proven `ubuntu-latest` runner;
- real Browser execution remains the dependency compatibility guard;
- a cold cache miss still installs the pinned Chromium binary before executing the suite.

The full Browser command itself remains variable around the <=12s execution target (11.959s in the previous cache-hit proof, 14.453s in this run). Warm **job** latency is solved; Browser execution stability remains separate success evidence for node 6.6.


## Representative optimized product-code verification proof

Authority: GitHub Actions run `36354809655`.

The proof ran the two required product-code gates independently/in parallel, with no focused→full serial duplication:

```text
Fast job                         Browser job
npm ci                          npm ci
npm run test:fast               exact Chromium cache restore
                                cached Chromium verification
                                browser build
                                npm run test:e2e
```

Measured command results:

| Gate | Result |
|---|---:|
| full unit | 57/57 pass; 1.327s node:test duration |
| full service | 57/57 pass; 9.952s node:test duration |
| full `test:fast` command | **11.695s** |
| Chromium cache | exact lockfile-keyed hit |
| Chromium verification | 1.640s |
| Browser build | 0.219s |
| full Browser | **14.450s**, 14/14 pass |
| Fast job wall | 20s |
| Browser job wall | 33s |

The two product jobs overlapped. From the first product-job start (`22:18:09Z`) to the last product-job completion (`22:18:44Z`), the representative required product-code verification path was **35 seconds**.

Against the historical 79-second baseline:

```text
improvement = (79 - 35) / 79 = 55.7%
```

Therefore the hard >=35% wall-clock improvement requirement is met with substantial margin.

### Remaining command-level targets

The final proof does **not** silently claim the individual command budgets are met:

- `test:fast`: 11.695s versus <=10s target;
- Browser execution: 14.450s versus <=12s target.

Both full suites stayed intact: 57 unit + 57 service + 14 Browser.

For Fast, the measured composition is now explicit: ~1.33s unit plus ~9.95s service plus npm/process overhead. The next optimization should test whether the independent unit/service layers can be executed concurrently through a portable deterministic runner without shared-resource interference. If that is not both faster and reliable, the remaining Fast excess should be recorded as measured irreducible overhead rather than weakening tests.

For Browser, prior evidence already shows:
- 10.842s warm full suite;
- 11.959s cache-hit full suite;
- 12.738s cold workers=1 command;
- 14.396–14.453s slower runs;
- workers 2/3 are slower;
- remaining heavy-test phases are real CRUD, reopen and 500+ row rendering/state-preservation work rather than arbitrary waits.

The <=12s Browser budget is therefore achievable but not stable on the reference shared runner. No test or target is relaxed; the measured runner variance and irreducible behavior work remain visible for final node assessment.


## Final Fast probe — unit/service parallel execution rejected

Authority: GitHub Actions run `36355039922`.

The last safe Fast optimization hypothesis was to execute the already-independent full Unit and Service layers concurrently. The proof used a portable Node child-process runner and compared one sequential baseline with two parallel repetitions on separate fresh GitHub runners.

All executions preserved the complete coverage:
- Unit: 57/57 pass;
- Service: 57/57 pass.

Measured results:

| Shape | Unit node:test duration | Service node:test duration | full Fast wall |
|---|---:|---:|---:|
| sequential baseline | 1.383s | 10.377s | **12.210s** |
| parallel repeat A | 2.133s | 11.170s | 11.452s |
| parallel repeat B | 1.639s | 12.425s | **12.615s** |

Parallel execution is therefore rejected:
- one run improved wall time by only 0.758s;
- the second run was 0.405s slower than sequential;
- both Unit and especially Service became slower under shared-runner contention;
- correctness stayed green, but the performance result was not deterministic.

The permanent `test:fast` command remains sequential. No extra runner script or concurrency dependency is retained.

### <=10s Fast target assessment

The <=10s command target is not met on the shared reference runner. The miss is now measured rather than assumed:
- Service alone consumed 10.377s in the matched sequential baseline;
- Unit added 1.383s;
- npm/process orchestration accounts for the remaining ~0.45s;
- the only safe cross-layer concurrency tested increased Service duration to 11.170–12.425s and did not produce a stable wall-time reduction.

Earlier profiling already removed the proven 4.68s artificial demo shutdown tail. The remaining service time is distributed across real DuckDB lifecycle/migration, producer/session, WebSocket, Scanner/query-library, Viewer paging and demo behavior proofs rather than one arbitrary fixed wait.

Meeting <=10s from this evidence would require either weakening/removing coverage or introducing unproven test-isolation/runner complexity. Neither is authorized. The numeric miss is therefore recorded as measured irreducible overhead for node 6.6, with the target itself unchanged.


## Node 6.6 final audit

Review authority: `R-049`.

| Success evidence | Result |
|---|---|
| 79s baseline recorded + setup/Fast/Browser attribution | PASS |
| Full Unit/Service/Browser coverage preserved | PASS — 57/57 + 57/57 + 14/14 |
| Fast <=10s / Browser <=12s or measured irreducible evidence | PASS by measured-irreducible exception; targets unchanged |
| >=35% representative wall-clock improvement | PASS — 79s → 35s = 55.7% |
| Warm <=45s / cold <=60s evaluated | PASS — 31s warm / 56s cold |
| No focused+full serial duplication in final path | PASS |
| Optimized output remains deterministic/diagnosable | PASS |

Node 6.6 is complete from a test-feedback-contract perspective. Permanent Fast/Browser CI orchestration remains intentionally owned by nodes 6.3/6.4.
