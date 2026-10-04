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

The exact per-file disposition is owned by `docs/US_MIGRATION_FILE_MAP.md`.

## Second-pass verified disposition

```text
KEEP              15
ADAPT             88
REPLACE            8
PLANNING_REPLACE  10
DROP               3
TOTAL             124
```

Coverage proof:

- classified: 124/124;
- duplicate classifications: 0;
- missing classifications: 0;
- extra classifications: 0.

## Main conclusion

This remains an incremental U.S. conversion of the proven MarketScope product, not a rewrite.

Preserve:

- browser-authenticated provider execution;
- loopback WebSocket;
- Node/DuckDB authority;
- one-producer/session lifecycle;
- serialized writer;
- atomic cycle commit/rollback;
- append-only history;
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
10. Replace the 561/chunk-specific workload with the 4096 x 180 U.S. workload.
11. Adapt diagnostics/live verification to the U.S. path.
12. Rename operational package/runtime/DB/launcher/CI surfaces to Market Flow US.
13. Replace stale MarketScope planning guards/handoff artifacts before freeze.

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

Direct `history` SQL is the initial strategy mechanism. Performance optimization is evidence-driven by the representative workload.

## Second-pass corrections

The repeat review intentionally challenged the first audit and found:

### False KEEP classifications

Several reusable files still contained MarketScope branding/channels/fixtures or Israeli fields. They were moved to ADAPT, including diagnostics, Viewer broadcast/surface files, service-test helpers and Viewer refresh tests.

`.planning/verify-handoff.mjs` also moved from KEEP to PLANNING_REPLACE because stronger allocation validation is required after replacing the old Planning CI.

### Stale planning infrastructure

The imported Planning CI and executor handoff still referenced old MarketScope nodes/reviews/workload/coverage. They were rewritten for the current U.S. tree.

Three superseded legacy coverage artifacts were deleted:

- `.planning/MASTER_COVERAGE.md`
- `.planning/COVERAGE_MAP.yaml`
- `.planning/LEGACY_COMPLETENESS_AUDIT.md`

Whole-goal coverage now follows `.planning/FRAMEWORK.md` and is recorded in `.planning/REVIEWS.md`.

### Live repeatability

A one-cycle and then three-cycle live proof was judged too weak for a continuous collector.

Final planned live proof is bounded but sustained:

```text
>= 20 consecutive complete cycles
AND
>= 60 seconds elapsed
at the candidate collection cadence
```

This is short-run repeatability proof, not a long-duration provider SLA claim.

### Execution allocation guard

The repeat review noticed that rewriting Planning CI had accidentally removed the old exact leaf-allocation guard.

`.planning/verify-handoff.mjs` now owns one reusable validation path for:

- every implementation leaf assigned exactly once;
- contiguous chat numbers;
- valid execution states;
- dependency order;
- serial done-prefix discipline;
- at most one `in_progress`;
- dependency completion for done/in-progress nodes;
- execution-reopen invariants;
- implementation STATUS pointer correctness.

## File-to-TREE coverage

All **96** implementation-affecting files:

```text
88 ADAPT
+ 8 REPLACE
= 96
```

were mechanically routed to at least one implementation leaf.

Result:

```text
mapped:   96
unmapped: 0
```

The 10 PLANNING_REPLACE files are owned by the planning process before execution.
The 3 DROP files are intentionally removed.
The 15 KEEP files require no U.S. implementation change; donor/provenance mentions are intentional where present.

## Current planning gate

The migration audit is now considered corrected.

The next stage is Final Planning Review, not implementation.
