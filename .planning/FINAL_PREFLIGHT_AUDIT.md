# Market Flow US — Final Adversarial Preflight Audit

## Purpose

This is the last code-level adversarial review before the user starts TREE `7.4` / `FR-0..FR-14` on the target Windows machine.

It is **not** a new product capability and does not replace the frozen TREE, contracts, CI, or first-run acceptance plan. It is a preflight defect-discovery work unit under the already-active `7.4` boundary.

Baseline:

- repository: `LirazShay/market-flow-us`
- baseline branch: `main`
- baseline SHA: `80d3bb7028051ced74e87088d8eb0cd716a4ed91`
- working branch: `audit/final-preflight`
- TREE leaf remains: `7.4` (`in_progress`)
- first-run execution resumes at `FR-0` only after this audit closes green

## Audit rules

For every reviewed production/tooling file or coherent file family:

1. compare behavior to the routed durable contract, not chat history;
2. inspect happy path **and** malformed/empty/null/failure/restart/cleanup paths relevant to that boundary;
3. inspect state ownership, lifecycle, concurrency/non-overlap and resource cleanup where applicable;
4. inspect boundary validation and fail-closed behavior;
5. inspect data identity/cardinality/ordering/transaction assumptions;
6. inspect Windows path/quoting/process/port behavior for user-facing launchers and scripts;
7. inspect error propagation/diagnostics for swallowed, ambiguous or unsanitized failures;
8. inspect tests for false confidence: missing assertions, over-mocking, race sensitivity, hidden retry/timeout masking, skipped paths, or tests that prove a different composition than production;
9. inspect code/docs/launcher/config drift;
10. prefer the smallest root-cause fix plus regression proof; no speculative subsystem or rewrite.

A finding is not closed by code inspection alone when deterministic proof is practical.

## Severity

- **BLOCKER** — can corrupt authority, run the wrong product path, break first-run/acceptance, leak protected data, or invalidate release evidence. Must be fixed before `FR-0`.
- **HIGH** — credible production/acceptance failure or silent wrong result under a realistic path. Fix before `FR-0` unless disproven by stronger evidence.
- **MEDIUM** — bounded correctness/diagnosability/operability defect with a realistic trigger. Fix when root-cause correction is small and safe; otherwise document exact rationale.
- **LOW** — non-blocking maintainability/readability concern. Do not churn release code without concrete value.

## Staged execution

### A0 — Baseline, authority and coverage map

Status: **done**

- fresh `main` identified and exact SHA recorded;
- root/planning status verified: implementation / frozen / TREE `7.4` in progress;
- TREE `7.4` and first-run mini-project routing confirmed;
- open PR audit: none;
- repository families mapped;
- dedicated audit branch created;
- no production code changed in A0.

### A1 — Browser acquisition, provider, Recorder, runtime and diagnostics

Status: **done**

Review all production code under:

- `browser/provider/`
- `browser/collector/`
- `browser/recorder/`
- `browser/runtime/`
- `browser/diagnostics/`
- `browser/live-verification/`

Cross-check especially:

- exact ScreenerHulPaging3 request/response validation;
- canonical `PaperId` identity and membership revision behavior;
- same-response universe+cycle coupling;
- cadence/non-overlap/stop/recovery races;
- ProducerBridge/WebSocket ACK ownership and stale-message handling;
- browser/runtime composition actually using the reviewed U.S. path;
- sanitized diagnostics/live evidence.

### A2 — Local service, DuckDB schema, persistence, protocol and recovery

Status: **done**

Review all production code under:

- `local-service/database/`
- `local-service/persistence/`
- `local-service/server/`

Cross-check especially:

- schema-v3 bootstrap/reopen/rejection semantics;
- transaction atomicity and rollback at every phase;
- history/latest/session/universe authority invariants;
- serialized ownership/cycle IDs/restart recovery;
- connection/statement/server cleanup;
- malformed/out-of-order/duplicate protocol messages;
- no accidental legacy schema/DB path.

### A3 — Trusted reads, Viewer and Scanner

Status: **done**

Review all production code under:

- `local-service/reads/`
- `local-service/scanner/`
- `browser/viewer/`

Cross-check especially:

- Current/Security/History U.S. projections;
- paging/cursor binding, deterministic ordering and historical-only lookup;
- zero vs missing semantics and display-name fallback;
- Current/Detail refresh/navigation/state restoration;
- Scanner admission/read-only boundary, saved-query state machine and scheduler;
- built-in staged SQL behavior and `securityId` navigation;
- query/result bounds and error isolation.

Any new/materially changed SQL discovered during fixes must re-enter the AGENTS 10+ stage static SQL preflight before execution.

### A4 — Build, setup, launchers and Windows process orchestration

Status: **done**

Review:

- `package.json` / lockfile assumptions;
- `scripts/build-browser.mjs`;
- `scripts/build-live-verification.mjs`;
- `SETUP.cmd`;
- `RUN_TESTS.cmd`;
- `START_DEMO.cmd`;
- `RESET_DEMO.cmd`;
- `START_MARKET_FLOW_US.cmd`;
- `PREPARE_LIVE_VERIFICATION.cmd`;
- any helper invoked by those entry points.

Cross-check:

- Node 24 enforcement;
- `npm ci` / pinned Chromium assumptions;
- paths with spaces and shell quoting;
- exit-code propagation;
- port/process ownership and clean stop;
- generated artifact names/locations;
- provider Origin handling without auth/session capture;
- production/default/demo DB separation.

### A5 — Fake Market, acceptance, workload and trading-day lifecycle

Review:

- `tests/fake-market/` reusable support that participates in executable product acceptance;
- `scripts/demo-fake-market.mjs`;
- `scripts/run-local-acceptance.mjs`;
- `scripts/run-workload-profile.mjs`;
- `scripts/new-trading-day.mjs`;
- `RUN_LOCAL_ACCEPTANCE.cmd`;
- `NEW_TRADING_DAY.cmd`;
- workload support and report generation.

Cross-check:

- static/moving/membership/failure/recovery/restart modes exercise the normal path;
- target profiles mean what the reports claim;
- count/integrity assertions cannot PASS on partial work;
- subprocess failures/timeouts/signals propagate;
- temporary DB/files/processes clean up;
- new-day rollover cannot destroy saved queries or active DB accidentally;
- archive/reset behavior is safe and deterministic;
- reports remain sanitized and SHA-bound where required.

### A6 — Test-suite and CI adversarial review

Review all:

- `tests/unit/`
- `tests/service/`
- `tests/e2e/`
- `tests/workload/`
- Playwright config/support;
- `.github/workflows/*.yml`.

Look specifically for:

- production code paths with no meaningful regression proof;
- assertions that only check process success instead of authority/result correctness;
- mocks/stubs that bypass the production constructor/composition seam;
- races/flaky sleeps/retries/oversized timeouts;
- accidental test ordering/shared-state dependence;
- workflow path filters that can let a code change skip required CI;
- duplicated or missing gates versus `TEST_STRATEGY`;
- green-but-materially-slow recurring setup/work.

### A7 — Cross-cutting defect sweep

Repository-wide static review for:

- `TODO` / `FIXME` / temporary migration compatibility;
- swallowed exceptions / empty catches;
- fire-and-forget async work;
- unhandled promise/event listener errors;
- timers/listeners/sockets/processes not disposed;
- magic ports/paths/old product names/provider names;
- hidden hard-coded universe size/cycle assumptions;
- stale Israel typed fields or authoritative MapHeat/GetSecuritiesData paths;
- unsafe/raw diagnostics, credentials/session/cookie/account data;
- path traversal/destructive filesystem behavior;
- race-prone mutable global/session state;
- dead code reachable from normal composition.

Every hit must be classified as defect, intentional provenance/test fixture, or harmless dead text with evidence.

### A8 — Contract/documentation/runtime drift review

Mechanically reconcile implementation and entry points against:

- `docs/DATA_CONTRACT.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/TEST_STRATEGY.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `docs/FIRST_RUN_ACCEPTANCE.md`
- `docs/LOCAL_FAKE_ACCEPTANCE.md`
- `docs/LIVE_VERIFICATION.md`
- `START_HERE.md`
- `README.md`

The question is not whether prose sounds plausible; commands, filenames, defaults, expected outputs and failure routing must match executable reality.

### A9 — Integrated proof after fixes

After all findings are fixed/closed:

- focused regression tests per finding;
- full Fast suite;
- browser build + full Browser suite;
- bounded workload suite;
- planning/docs verification;
- inspect recurring wall-clock cost for any regression;
- inspect final diff for accidental scope expansion;
- inspect branch for secrets/private material.

No heavy target-machine acceptance is run here; that remains TREE `7.4` / FR-9+.

### A10 — Closure and return to first-run flow

- finding ledger has no open BLOCKER/HIGH defect;
- all required verification green;
- update durable operational truth only where genuinely changed;
- PR the coherent audit/fix work unit;
- CI green;
- review diff;
- squash merge;
- verify `main` CI green;
- verify no unexpected open PR;
- record the new exact `main` SHA;
- resume TREE `7.4` at `FR-0`.

## Finding ledger

| ID | Stage | Severity | Area/file | Finding/root cause | Fix | Regression proof | State |
|---|---|---|---|---|---|---|---|
| A1-001 | A1 | HIGH | `browser/provider/us-screener.js` | Provider acquisition/JSON had no hard failure bound, so a stalled request could hold `cycleInFlight` and stop/relaunch indefinitely. | Added a 10-second AbortController/Promise.race bound. | `tests/unit/final-preflight-a1.test.mjs` | fixed; A1 CI green |
| A1-002 | A1 | HIGH | `browser/runtime/producer-bridge.js`, `application.js` | Stop rejection could re-arm heartbeat; partial launch failure could leave a producer session alive. | Stop now fails closed; launch failure cleans Recorder/session authority before remaining in error. | `tests/unit/final-preflight-a1.test.mjs` | fixed; A1 CI green |
| A1-003 | A1 | MEDIUM | browser runtime/support diagnostics | Reviewed A1 diagnostics still exposed old MarketScope product naming. | Rebranded reviewed producer/support diagnostic strings and producer identity. | existing branding/diagnostic suites | fixed; A1 CI green |
| A2-001 | A2 | HIGH | `browser/recorder/recorder.js` -> failed-cycle authority | Raw provider/network error text crossed Browser→Node and could be persisted in cycle/session error JSON. | Keep raw error only in Browser local state; send fixed phase-specific safe failure descriptors across authority boundary. | `tests/unit/final-preflight-a2.test.mjs`, `recorder-scheduling.test.mjs` | fixed; A2 CI green |
| A2-002 | A2 | HIGH | `local-service/database/writer.js` | `ROLLBACK` flushed pending Appender buffers first; an Appender failure could prevent DuckDB from ever receiving rollback and poison the serialized connection. | Rollback discards all pending non-authoritative buffers/copy state and runs directly on the underlying connection. | `tests/unit/database-writer.test.mjs`, existing U.S. F1-F5 rollback suite | fixed; A2 CI green |
| A3-001 | A3 | HIGH | `local-service/reads/viewer-reads.js` | Status reads could re-emit arbitrary legacy `last_error_json` text persisted before A2 hardening. | Treat persisted failure JSON only as an error-presence signal and return a fixed safe collection descriptor. | `tests/service/final-preflight-a3.test.mjs`, `viewer-reads.test.mjs` | fixed; A3 CI green |
| A3-002 | A3 | MEDIUM | `browser/viewer/client.js` | Concurrent requests recorded diagnostic operation IDs from the global post-await sequence, so out-of-order completion could mis-correlate diagnostics. | Capture and propagate each request's exact requestId through completion. | `tests/unit/viewer-client.test.mjs` | fixed; A3 CI green |
| A3-003 | A3 | MEDIUM | `browser/viewer/client.js` | Viewer defaults and connection/error strings still exposed old MarketScope branding. | Rebranded Viewer identity and local-service messages to Market Flow US. | `viewer-client.test.mjs`, branding suites | fixed; A3 CI green |
| A3-004 | A3 | MEDIUM | `browser/viewer/detail-surface.js` | A live authoritative refresh could supersede an in-flight History `loadMore` while leaving `loadingMore=true`, permanently disabling pagination in that Detail session. | Refresh now releases stale pagination ownership before starting the new generation; stale continuation data remains ignored. | `tests/unit/detail-surface.test.mjs` | fixed; A3 CI green |
| A4-001 | A4 | HIGH | Windows launchers | Node 24 was enforced only by setup, so later Node-version drift could run the installed product/tests on an unsupported runtime. | Added one shared Node-24 preflight and invoke it before work from every post-setup launcher. | `tests/unit/final-preflight-a4.test.mjs` | fixed; A4 CI green |
| A4-002 | A4 | MEDIUM | `START_DEMO.cmd` | The asynchronous browser opener trusted any HTTP 200 on port 4173, so an older demo could be opened while the new demo failed to bind. | Preflight both demo/service loopback ports before launching the opener. | `tests/unit/final-preflight-a4.test.mjs` | fixed; A4 CI green |

Detailed review notes, candidate SHAs and non-findings are maintained in `.planning/FINAL_PREFLIGHT_PROGRESS.yaml`.

## Current pointer

`A0` through `A4` are complete. Next stage is **A5 — Fake Market, acceptance, workload and trading-day lifecycle**.
