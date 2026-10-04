# US Migration File Map

This is the exact classification of the 124 files imported from the MarketScope baseline.

Second-pass review corrected nine false KEEP classifications and explicitly drops three superseded MarketScope planning-only coverage artifacts.

## KEEP (17)

- .gitignore
- .planning/BASELINE_PROVENANCE.md
- .planning/FRAMEWORK.md
- .planning/verify-handoff.mjs
- browser/viewer/scanner-query-library.js
- browser/viewer/scanner-scheduler.js
- local-service/database/writer.js
- local-service/scanner/query-library.js
- local-service/scanner/scanner.js
- playwright.config.mjs
- scripts/demo-reset.mjs
- shared/protocol/index.js
- tests/service/service-fixture.test.mjs
- tests/unit/saved-query-library.test.mjs
- tests/unit/scanner-admission.test.mjs
- tests/unit/scanner-scheduler.test.mjs
- tests/unit/viewer-refresh-controller.test.mjs

## ADAPT (87)

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
- browser/diagnostics/support-snapshot.js
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
- browser/viewer/refresh-controller.js
- browser/viewer/scanner-surface.js
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
- local-service/server/startup-diagnostics.js
- package-lock.json
- package.json
- scripts/build-browser.mjs
- scripts/build-live-verification.mjs
- scripts/demo-fake-market.mjs
- shared/diagnostics/index.js
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
- tests/service/helpers/database-worker.mjs
- tests/service/helpers/service-fixture.mjs
- tests/service/producer-authority.test.mjs
- tests/service/producer-recovery.test.mjs
- tests/service/saved-query-library.test.mjs
- tests/service/scanner-authority.test.mjs
- tests/service/viewer-reads.test.mjs
- tests/service/websocket-transport.test.mjs
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

## REPLACE (8)

- browser/collector/cycle.js
- browser/provider/securities.js
- browser/provider/universe.js
- tests/fake-market/server.mjs
- tests/service/cycle-authority.test.mjs
- tests/service/fake-market.test.mjs
- tests/unit/provider-data.test.mjs
- tests/workload/representative-workload.test.mjs

## PLANNING_REPLACE (9)

- .github/workflows/planning-docs-ci.yml
- .planning/DECISIONS.md
- .planning/EXECUTION.yaml
- .planning/EXECUTOR_HANDOFF.md
- .planning/GOAL.md
- .planning/README.md
- .planning/REVIEWS.md
- .planning/STATUS.yaml
- .planning/TREE.yaml

## DROP (3)

- .planning/COVERAGE_MAP.yaml
- .planning/LEGACY_COMPLETENESS_AUDIT.md
- .planning/MASTER_COVERAGE.md

## Coverage proof

- imported baseline files: 124
- classified files: 124
- duplicates: 0
- missing: 0
- extra: 0

New Market Flow US planning/evidence files created after the baseline import are not part of this 124-file denominator.