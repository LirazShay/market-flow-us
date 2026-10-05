# Market Flow US Migration Audit

## Audit boundary

The first exhaustive migration snapshot contained **124 files**:

```text
121 files from the exact MarketScope baseline
+ 3 U.S. replan/evidence files created before the audit
= 124 audited files
```

The three pre-audit additions were:

- `.planning/BASELINE_PROVENANCE.md`
- `docs/US_PRODUCT_DIRECTION.md`
- `docs/US_SOURCE_EVIDENCE.md`

The exact historical per-file disposition is owned by `docs/US_MIGRATION_FILE_MAP.md`.

## Second-pass verified disposition

```text
KEEP              15
ADAPT             88
REPLACE            8
PLANNING_REPLACE  10
DROP               3
TOTAL             124
```

Coverage proof for that snapshot:

- classified: 124/124;
- duplicate classifications: 0;
- missing classifications: 0;
- extra classifications: 0.

These counts remain historical evidence. Files proved superseded and removed later during execution remain represented in the original denominator rather than rewriting the audit after the fact.

## Main conclusion

This remains an incremental U.S. conversion of the proven MarketScope product, not a rewrite.

Preserve:

- browser-authenticated provider execution;
- loopback WebSocket;
- Node/DuckDB authority;
- one-producer/session lifecycle;
- serialized writer;
- atomic cycle commit/rollback;
- append-only history within the active trading day;
- full-row latest;
- trusted Current/Security/History reads;
- Current/Detail/Scanner product model;
- Scanner admission and saved-query architecture;
- deterministic Fake Market architecture;
- diagnostics/Support Snapshot concept;
- Fast/Browser/Workload/live verification layering.

Replace/adapt only the boundaries that U.S. provider/data/scale/branding require.

## Required conversion areas

1. Replace `MapHeat2 + GetSecuritiesData` acquisition with `ScreenerHulPaging3`.
2. Use `String(PaperId)` as canonical security identity.
3. Treat every valid full response as one complete one-segment cycle.
4. Drive current-universe revision from canonical membership changes.
5. Replace Israeli schema projections with source-shaped U.S. schema-v3 fields.
6. Preserve history/latest transaction semantics.
7. Adapt Current and Detail/History fields while preserving UX/state/paging behavior.
8. Keep Scanner generic and add staged candidate ranking as editable SQL only.
9. Replace provider-specific Fake Market fixtures/path with U.S. screener behavior.
10. Replace the 561/chunk-specific workload with configurable U.S. workload tooling including the `4096 x 180` target profile.
11. Adapt diagnostics/live verification to the U.S. path.
12. Rename operational package/runtime/DB/launcher/CI surfaces to Market Flow US.
13. Replace stale MarketScope planning guards/handoff artifacts before freeze.
14. Bound the active production DB to one trading day with a safe archive/new-day operation that preserves saved queries.

## Explicit non-changes

Do not add during this conversion:

- Strategy Engine;
- predecessor/horizon schema;
- dynamic temporal columns;
- new database architecture;
- new transport;
- cloud backend;
- IBKR/order execution;
- semantic conversion of Israeli historical DB rows into U.S. market rows.

Direct `history` SQL remains the strategy mechanism. Performance optimization is evidence-driven by the representative workload and target-machine acceptance.

## Planning-stage corrections retained as history

The repeat review intentionally challenged the first audit and corrected false KEEP classifications, stale planning infrastructure, live-repeatability requirements and execution-allocation validation.

Three superseded planning-only coverage artifacts were removed:

- `.planning/MASTER_COVERAGE.md`
- `.planning/COVERAGE_MAP.yaml`
- `.planning/LEGACY_COMPLETENESS_AUDIT.md`

Whole-goal coverage now follows `.planning/FRAMEWORK.md` and is recorded in `.planning/REVIEWS.md`.

The sustained authenticated provider proof was strengthened to:

```text
>= 20 consecutive complete cycles
AND
>= 60 seconds elapsed
at the candidate collection cadence
```

That gate proves bounded sustained authenticated authority. It does not by itself prove changing market values; movement-specific evidence remains a distinct final market-open acceptance fact.

`.planning/verify-handoff.mjs` owns reusable execution-allocation validation for exact leaf allocation, dependency order, serial done-prefix discipline, execution-reopen invariants and STATUS-pointer consistency.

## TREE 7.3 final runtime audit

The release-closure audit checks **authoritative runtime reachability**, not merely whether donor-era words appear somewhere in history/provenance/tests.

### Browser authority

The normal browser build entrypoint is:

```text
scripts/build-browser.mjs
→ browser/runtime/index.js
→ browser/runtime/application.js
→ browser/collector/us-cycle.js
→ browser/provider/us-screener.js
→ browser/provider/us-universe.js
```

The default runtime therefore acquires one complete `ScreenerHulPaging3` U.S. response and does not depend on the old two-provider acquisition path.

After U.S. replacement proof, TREE `7.3` removed the superseded Israel acquisition implementation:

```text
browser/provider/universe.js
browser/provider/securities.js
browser/collector/cycle.js
tests/unit/provider-data.test.mjs
```

Their U.S. replacements and focused proof remain in the repository.

### Service/database authority

The normal package service command starts:

```text
local-service/server/index.js
```

That entrypoint injects `openMarketFlowUsDatabase`, so the production service boots schema v3 U.S. authority. Legacy schema helpers/adapters that remain inside reusable modules are not selected by the normal Market Flow US entrypoint and are not evidence of an authoritative Israel product path.

### Mechanical release guard

`tests/unit/release-runtime-audit.test.mjs` protects the release boundary by verifying that:

- the superseded Israel acquisition modules are absent;
- their U.S. replacements are present;
- the actual generated browser runtime contains `ScreenerHulPaging3`;
- the generated browser runtime contains neither `MapHeat2` nor `GetSecuritiesData`;
- representative Israeli typed market fields are absent from the generated browser artifact;
- the normal service command resolves to the Market Flow US server entrypoint and schema-v3 database bootstrap.

Historical/generic fixtures may retain donor-era vocabulary only when they are not packaged or reachable through the normal product entrypoints and still protect reusable behavior. They must not be used to justify a production dependency on the retired provider path.

## Release-closure status

The audit no longer defines the active planning/execution pointer. `STATUS.yaml`, `.planning/STATUS.yaml` and `.planning/EXECUTION.yaml` own live operational state.

TREE `7.3` prepares an exact release candidate for final target-machine acceptance. It must not claim overall completion before TREE `7.4` supplies the user-dependent target-machine workload, new-day lifecycle, authenticated static compatibility and market-open movement evidence.
