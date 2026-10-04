# US Migration Audit

## Coverage

Repository branch audited: plan/us-market-migration-replan

- files in branch: 124
- files classified: 124
- missing: 0
- duplicates: 0
- extra: 0

Disposition counts after second-pass review:

- KEEP: 17
- ADAPT: 87
- REPLACE: 8
- PLANNING_REPLACE: 9
- DROP: 3

## Main conclusion

This is an incremental conversion of the proven MarketScope product to the U.S. data source, not a rewrite.

Keep the existing local architecture, WebSocket transport, Node service, DuckDB authority, history/latest model, Viewer surfaces, Scanner engine, saved-query library, diagnostics, demo and verification layers unless the U.S. data contract forces a change.

Do not add a new temporal-history subsystem during this conversion. Existing history plus Scanner SQL is the baseline. Optimize later only if representative workload proves a real bottleneck.

## Required conversion areas

1. Replace the Israel-specific provider flow based on MapHeat2 and GetSecuritiesData with the U.S. ScreenerHulPaging3 full-response flow.
2. Preserve complete-response validation, canonical String(PaperId) identity, raw-row fidelity and fail-closed commit semantics.
3. Adapt recorder configuration to remove chunk-only assumptions that no longer apply.
4. Keep the existing database table layout concept, but replace Israel-specific typed market columns and MapHeat metadata with U.S. fields.
5. Preserve Current and Detail/History behavior while changing visible columns and labels.
6. Preserve Scanner architecture and adapt the public schema guide, built-ins and examples.
7. Replace the provider-specific Fake Market implementation with a deterministic U.S. screener fake.
8. Replace the 561-security/chunk-specific workload with a U.S.-scale workload based on the observed roughly-4k universe, without hard-coding 4015 as a permanent product constant.
9. Adapt the bounded live verification gate to the U.S. provider.
10. Rename MarketScope package/runtime/database/launcher/CI user-facing names to Market Flow US.
11. Replace imported MarketScope planning artifacts before implementation allocation.

## Explicitly preserved

- local-only architecture
- browser-authenticated provider access
- loopback WebSocket
- one-producer ownership/session lifecycle
- serialized DuckDB writer
- atomic commit/rollback
- append-only history
- full-row latest mechanism
- history paging
- read-only Scanner admission
- saved-query CRUD
- diagnostics/Support Snapshot
- demo/reset concept
- Fast/Browser/Workload verification layers
- public-safe security discipline

## Contract decisions to settle before TREE

1. Exact U.S. typed columns for universe/history/latest.
2. Final Current and Detail/History visible columns and default sort.
3. Treatment of Price and TradeDateTime while exact provider semantics remain empirical.
4. Whether each full U.S. poll directly refreshes current-universe membership.
5. Initial collection cadence for demo/offline proof and how live cadence is tuned.
6. Representative U.S. workload size/cycle count.
7. Exact staged-ranking Scanner SQL example and deterministic proof fixture.
8. Schema migration/version from the imported MarketScope schema.
9. Final runtime/bookmarklet/database/Windows-launcher naming.

## File disposition

### KEEP (17)

.gitignore
.planning/BASELINE_PROVENANCE.md
.planning/FRAMEWORK.md
.planning/verify-handoff.mjs
browser/diagnostics/support-snapshot.js
browser/viewer/refresh-controller.js
browser/viewer/scanner-query-library.js
browser/viewer/scanner-scheduler.js
browser/viewer/scanner-surface.js
local-service/database/writer.js
local-service/scanner/query-library.js
local-service/scanner/scanner.js
local-service/server/startup-diagnostics.js
playwright.config.mjs
scripts/demo-reset.mjs
shared/diagnostics/index.js
shared/protocol/index.js
tests/service/helpers/database-worker.mjs
tests/service/helpers/service-fixture.mjs
tests/service/saved-query-library.test.mjs
tests/service/service-fixture.test.mjs
tests/service/websocket-transport.test.mjs
tests/unit/saved-query-library.test.mjs
tests/unit/scanner-admission.test.mjs
tests/unit/scanner-scheduler.test.mjs
tests/unit/viewer-refresh-controller.test.mjs

### REPLACE (8)

browser/collector/cycle.js
browser/provider/securities.js
browser/provider/universe.js
tests/fake-market/server.mjs
tests/service/cycle-authority.test.mjs
tests/service/fake-market.test.mjs
tests/unit/provider-data.test.mjs
tests/workload/representative-workload.test.mjs

### PLANNING_REPLACE (9)

.github/workflows/planning-docs-ci.yml
.planning/COVERAGE_MAP.yaml
.planning/DECISIONS.md
.planning/EXECUTION.yaml
.planning/EXECUTOR_HANDOFF.md
.planning/GOAL.md
.planning/LEGACY_COMPLETENESS_AUDIT.md
.planning/MASTER_COVERAGE.md
.planning/README.md
.planning/REVIEWS.md
.planning/STATUS.yaml
.planning/TREE.yaml

### ADAPT (87)

All remaining branch files not listed above. The 124/124 classification check proved there are no unclassified files.

The ADAPT set includes the workflows, launchers, runtime composition, recorder, Viewer field models, diagnostics/branding channels, test helpers that encode MarketScope names/fields, durable product/data/technical/test docs, schema/persistence/read projections, package metadata, build/demo scripts, Scanner built-ins, U.S.-affected E2E/service/unit tests, and user documentation.

Second-pass review corrected nine files that had been incorrectly classified KEEP because their core mechanism was reusable but they still contained MarketScope branding/channel/fixture assumptions.

### DROP (3)

The following imported planning-only artifacts are superseded by the current FRAMEWORK review method and the U.S. migration audit/reviews, so retaining them would preserve contradictory MarketScope planning truth:

- .planning/MASTER_COVERAGE.md
- .planning/COVERAGE_MAP.yaml
- .planning/LEGACY_COMPLETENESS_AUDIT.md

## Next-stage gate

Do not build the replacement TREE yet.

Next order:

audit -> durable U.S. contracts + decisions -> new S&T TREE -> review -> freeze -> EXECUTION allocation.
