# MarketScope to Market Flow US Migration Audit

## Audit boundary

This audit is completed before constructing the replacement S&T tree.

- Repository: LirazShay/market-flow-us
- Branch: plan/us-market-migration-replan
- Files audited/classified: 124
- Missing from classification: 0
- Duplicate classifications: 0
- Extra classifications: 0

## Governing conclusion

This is an incremental U.S. market conversion, not a rewrite.

The proven MarketScope architecture remains: authenticated provider page -> browser acquisition -> complete-cycle validation -> loopback WebSocket -> localhost Node.js -> native DuckDB -> Current -> Detail/History -> Dynamic SQL Scanner.

The staged best-candidate idea remains ordinary Scanner SQL. No Strategy Engine, dynamic horizon schema, predecessor-link columns, or new temporal infrastructure are introduced in this migration.

## Main migration changes

### Provider and collection

Replace the Israel-specific MapHeat2 plus chunked GetSecuritiesData flow with the proven U.S. ScreenerHulPaging3 full-response flow. Preserve canonical identity, full-response validation, raw-row fidelity, timing metadata, fail-closed behavior, and commit only after a coherent complete cycle.

### Recorder

Preserve start/stop/relaunch, snapshot cadence, one-producer ownership, heartbeat/recovery and commit-ACK semantics. Remove or adapt chunkSize, chunkDelayMs and MapHeat-specific universe refresh configuration where the U.S. full response makes them unnecessary.

### Identity and universe

Keep security_id as canonical product identity and derive it from String(PaperId). Adapt universe metadata to Symbol, display name, ExchangeName and preserved raw source row. Remove MapHeat-only metadata columns.

### Database

Keep schema_info, sessions, universe, cycles, history, latest, scanner_saved_queries, serialized writer, append-only history, full-row latest replacement, rollback and hardening. Replace Israeli typed projections with U.S. source fields such as Price, ChangePercent, BidRate, AskRate, DailyVolume, DailyHigh, DailyLow, YearHigh, YearLow, YesterdayRate, PaperMarketCap, TradeDateTime, Symbol and ExchangeName. Introduce a U.S. schema version migration.

### Current and Detail/History

Preserve UI states, sorting, null handling, navigation, viewport restoration, historical-only detail, paging, retry and refresh behavior. Adapt visible columns and labels to U.S. fields and choose a U.S.-appropriate default sort.

### Scanner

Keep the read-only SQL engine, scheduler, saved-query CRUD and Detail navigation contract. Adapt the public schema guide, built-ins and examples. Add one editable staged-candidate ranking query that calculates how far each security passes through the chosen SQL stages and orders by stage reached. Stage definitions remain SQL, not infrastructure.

### Fake Market

Replace the Israeli MapHeat2/GetSecuritiesData fake with a stateful ScreenerHulPaging3 fake. Preserve deterministic scenarios for complete responses, reordering, dynamic membership, missing/duplicate/invalid rows, null/zero/missing distinctions, HTTP/shape errors, delay, changing values, restart and diagnostics.

### Workload

Replace the 561 x 600 / chunk-size-187 Israeli workload assumptions with a U.S.-scale representative workload based on the observed roughly 4,015-result universe without treating 4015 as a permanent constant. Measure commit, Current, History, normal Scanner queries, the staged ranking query, restart and DB size. Optimize only if measurement proves a bottleneck.

### Live verification

Keep the bounded gate structure and change only provider acquisition/validation to the U.S. endpoint. Live verification owns unresolved external facts: market-hours behavior, safe polling cadence, session expiry, current provider shape and browser loopback compatibility.

### Branding and local operation

Rename MarketScope user-facing package/runtime/bookmarklet/database/launcher/CI/artifact names to Market Flow US while preserving the one-command setup/demo/reset/test/service workflows.

### Planning artifacts

The imported MarketScope TREE, coverage, decisions, reviews and execution history are donor history, not the new U.S. execution truth. They will be rebuilt only after this audit and durable U.S. contracts are coherent.

## What explicitly does not change

- Local-only architecture
- Browser-authenticated provider access
- Loopback WebSocket transport
- One-producer authority and session recovery
- Serialized native DuckDB writer
- Atomic cycle commit/rollback
- Append-only history and full-row latest mechanism
- History pagination
- Scanner admission/sandboxing
- Saved-query CRUD
- Diagnostics and Support Snapshot
- Demo/reset concept
- Fast, Browser and Workload verification layers
- Public-safe security rules

## Remaining contract decisions before TREE

1. Exact U.S. typed projection list and final Current/History columns.
2. Whether Price remains source-named or receives a normalized alias after semantic proof.
3. Exact handling/display of TradeDateTime before timezone/session semantics are proven.
4. Whether every U.S. poll directly refreshes the current universe; prefer the single full response unless evidence requires otherwise.
5. Initial offline/demo polling interval and the rule for live tuning.
6. Representative U.S. workload size/cycle count that proves about-4k scale while keeping the workload practical.
7. Exact staged-ranking SQL example and deterministic fixture.
8. Schema migration/versioning from imported MarketScope schema v2 to the U.S. schema.
9. Final generated-file/database/Windows-launcher naming.

## File-by-file disposition

### KEEP - 26

- .gitignore
- .planning/BASELINE_PROVENANCE.md
- .planning/FRAMEWORK.md
- .planning/verify-handoff.mjs
- browser/diagnostics/support-snapshot.js
- browser/viewer/refresh-controller.js
- browser/viewer/scanner-query-library.js
- browser/viewer/scanner-scheduler.js
- browser/viewer/scanner-surface.js
- local-service/database/writer.js
- local-service/scanner/query-library.js
- local-service/scanner/scanner.js
- local-service/server/startup-diagnostics.js
- playwright.config.mjs
- scripts/demo-reset.mjs
- shared/diagnostics/index.js
- shared/protocol/index.js
- tests/service/helpers/database-worker.mjs
- tests/service/helpers/service-fixture.mjs
- tests/service/saved-query-library.test.mjs
- tests/service/service-fixture.test.mjs
- tests/service/websocket-transport.test.mjs
- tests/unit/saved-query-library.test.mjs
- tests/unit/scanner-admission.test.mjs
- tests/unit/scanner-scheduler.test.mjs
- tests/unit/viewer-refresh-controller.test.mjs

### ADAPT - 78

- .github/workflows/browser-ci.yml
- .github/workflows/fast-ci.yml
- .github/workflows/workload-ci.yml
- AGENTS.md
- PREPARE_LIVE_VERIFICATION.cmd
- README.md
- RESET_DEMO.cmd
- RUN_TESTS.cmd
- SETUP.cmd
- START_DEMO.cmd
- START_HERE.md
- START_MARKETSCOPE.cmd
- STATUS.yaml
- browser/live-verification/harness.js
- browser/live-verification/index.js
- browser/recorder/config.js
- browser/recorder/recorder.js
- browser/runtime/application.js
- browser/runtime/index.js
- browser/runtime/producer-bridge.js
- browser/viewer/client.js
- browser/viewer/current-model.js
- browser/viewer/current-surface.js
- browser/viewer/detail-model.js
- browser/viewer/detail-surface.js
- docs/DATA_CONTRACT.md
- docs/LIVE_VERIFICATION.md
- docs/PRODUCT_REQUIREMENTS.md
- docs/PRODUCT_SPEC.md
- docs/SCANNER_SQL_GUIDE.md
- docs/SOURCE_EXTRACTION.md
- docs/TECHNICAL_SPEC.md
- docs/TEST_FEEDBACK_PERFORMANCE.md
- docs/TEST_STRATEGY.md
- docs/USER_GUIDE.md
- docs/US_PRODUCT_DIRECTION.md
- docs/US_SOURCE_EVIDENCE.md
- docs/benchmarks/REPRESENTATIVE_WORKLOAD_BASELINE.md
- local-service/database/database.js
- local-service/database/schema.js
- local-service/persistence/cycle-authority.js
- local-service/persistence/producer-authority.js
- local-service/reads/viewer-reads.js
- local-service/server/config.js
- local-service/server/index.js
- local-service/server/service.js
- package-lock.json
- package.json
- scripts/build-browser.mjs
- scripts/build-live-verification.mjs
- scripts/demo-fake-market.mjs
- shared/scanner/builtins.js
- tests/e2e/current-surface.spec.mjs
- tests/e2e/detail-surface.spec.mjs
- tests/e2e/runtime-composition.spec.mjs
- tests/e2e/scanner-surface.spec.mjs
- tests/e2e/viewer-refresh.spec.mjs
- tests/service/browser-producer-bridge.test.mjs
- tests/service/database-lifecycle.test.mjs
- tests/service/demo-orchestration.test.mjs
- tests/service/diagnostics.test.mjs
- tests/service/producer-authority.test.mjs
- tests/service/producer-recovery.test.mjs
- tests/service/scanner-authority.test.mjs
- tests/service/viewer-reads.test.mjs
- tests/unit/browser-build.test.mjs
- tests/unit/current-surface.test.mjs
- tests/unit/detail-surface.test.mjs
- tests/unit/diagnostics.test.mjs
- tests/unit/live-verification-build.test.mjs
- tests/unit/live-verification.test.mjs
- tests/unit/producer-bridge.test.mjs
- tests/unit/protocol.test.mjs
- tests/unit/recorder-scheduling.test.mjs
- tests/unit/scanner-query-library.test.mjs
- tests/unit/service-config.test.mjs
- tests/unit/viewer-client.test.mjs
- tests/unit/windows-launchers.test.mjs

### REPLACE - 8

- browser/collector/cycle.js
- browser/provider/securities.js
- browser/provider/universe.js
- tests/fake-market/server.mjs
- tests/service/cycle-authority.test.mjs
- tests/service/fake-market.test.mjs
- tests/unit/provider-data.test.mjs
- tests/workload/representative-workload.test.mjs

### PLANNING_REPLACE - 12

- .github/workflows/planning-docs-ci.yml
- .planning/COVERAGE_MAP.yaml
- .planning/DECISIONS.md
- .planning/EXECUTION.yaml
- .planning/EXECUTOR_HANDOFF.md
- .planning/GOAL.md
- .planning/LEGACY_COMPLETENESS_AUDIT.md
- .planning/MASTER_COVERAGE.md
- .planning/README.md
- .planning/REVIEWS.md
- .planning/STATUS.yaml
- .planning/TREE.yaml

## Gate to next stage

Next order: this audit -> rewrite durable U.S. contracts and decisions -> construct new S&T TREE -> necessity/sufficiency/KISS review -> Final Planning Review -> freeze -> allocate EXECUTION chats.

Do not construct the replacement TREE from the imported MarketScope planning history.