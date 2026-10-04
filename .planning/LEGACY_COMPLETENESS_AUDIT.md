# Stage 10 — Legacy Migration Completeness + Outside-In Coverage Audit

## Purpose

This is the explicit pre-freeze second pass requested to verify that MarketScope did not leave important product/integrity/test knowledge behind in Market Flow and that every required user flow has an implementation/proof owner.

This document is review evidence, not live status.

## Fresh inventory

### V1
- root: `scripts/research/market-data/leumi/prototypes/local-history-viewer-v1/`
- 140 files total.
- 102 core product/runtime/storage/viewer/provider/spec/test/design candidates.

### V2
- root: `scripts/research/market-data/leumi/prototypes/local-history-viewer-v2/`
- 236 files total.
- 113 core candidates after separating HOT/history/planning archaeology.
- 99 docs; many are superseded Browser-SQL/DuckDB-Wasm/OPFS/Worker research.

The audit re-enumerated these trees from Market Flow `main`; it did not rely only on the earlier SOURCE_EXTRACTION list.

## Fresh deep-read emphasis

Earlier stages had already deep-read Current, Detail/History, provider/Recorder and diagnostics. Stage 10 concentrated on areas most likely to hide migration gaps:

- V1 requirements/architecture/data-model;
- persistence/session lifecycle and transaction/recovery semantics;
- Viewer recovery while Recorder/provider are unavailable;
- messaging/invalidation;
- runtime/bookmarklet packaging and repeated launch;
- storage growth and no-retention evidence;
- V2 durable product shape and live-SQL product requirement;
- D-043 and D-045;
- V2 Node migration inventory;
- V2 product-shape contract tests.

Historical Browser-SQL files were re-enumerated, but not blindly reread line-by-line: D-045 and the current Node migration inventory already classify them as historical unless an implementation-independent requirement is extracted.

## Discrepancies found and resolved

### 1. No silent retention
V1 explicitly states no automatic retention. MarketScope only implied this through restart/history durability.

Correction: Product Requirements, Technical Spec, Test Strategy and S&T 2.4 now prohibit silent production-history deletion/TTL/cleanup.

### 2. Viewer independence
V1 explicitly proves Viewer close does not stop Recorder and Viewer recovery does not require active provider/Recorder availability.

Correction: Product Spec D3, E2E-08 and S&T 4.4 now own this under Node authority.

### 3. Runtime/bookmarklet packaging
V1 directly proves one source graph, generated readable runtime + bookmarklet, `javascript:` one-line raw JS, no whole-payload percent encoding, no arbitrary build ceiling and idempotent repeated launch.

Correction: Technical Spec, build tests and S&T 1.1/4.4 now own the clean MarketScope form.

### 4. Historical loopback proof
D-045 records successful real-origin loopback WebSocket smoke from `https://hb2.bankleumi.co.il` to `ws://127.0.0.1:8765`.

Correction: preserved as historical feasibility evidence; the final MarketScope candidate still rechecks current Origin/CSP/LNA/browser behavior.

## Explicit non-promotions

| Legacy item | Result |
|---|---|
| IndexedDB production authority | DROP |
| Browser SQL Worker / DuckDB-Wasm / OPFS / Web Locks | DROP/ARCHIVE |
| Browser-SQL probes / C01-C12 | DROP/ARCHIVE |
| Debug Bundle user UI | DROP |
| browser storage quota UI | DROP |
| DATABASE_CLEARED event | DROP |
| V1 rolling GitHub Release tag | not a MarketScope requirement |
| Current filtering/charts | not required by initial Current surface |
| persisted Scanner active config + automatic restart execution from old Browser-SQL design | DROP/historical |
| old IndexedDB schema/code | evidence only; guarantees adapted |

## Outside-in required-flow audit

| Flow | Path | Main implementation leaves | Main proof owner |
|---|---|---|---|
| FLOW-001 | start collection | 2.1,2.2,2.3,2.4,2.5,2.6,4.4 | 6.4 + 7.2 |
| FLOW-002 | browse Current | 3.1,3.3,4.1 | 6.4 |
| FLOW-003 | Current → Detail | 4.1,4.2 | 6.4 |
| FLOW-004 | Load More | 3.2,4.2 | 6.4 |
| FLOW-005 | Back to Current | 4.2,4.3 | 6.4 |
| FLOW-006 | historical-only security | 3.2,4.2 | 6.1 + 6.4 |
| FLOW-007 | activate Scanner | 5.1,5.2 | 6.4 |
| FLOW-008 | repeat/no overlap | 5.2 | unit + 6.4 |
| FLOW-009 | zero-row success | 5.1,5.2 | service + 6.4 |
| FLOW-010 | visible Scanner error | 5.1,5.2 | service + 6.4 |
| FLOW-011 | Scanner SecurityId → Detail | 5.3,4.2 | 6.4 |
| FLOW-012 | Node unavailable at launch | 3.3,4.4 | 6.4 |
| FLOW-013 | service disconnect | 2.6,4.4 | 6.4 |
| FLOW-014 | explicit relaunch | 2.6,4.4 | 6.4 |
| FLOW-015 | complete Fake Market product | 6.1,6.2,6.4 | 6.4 |
| FLOW-016 | Node restart | 1.3,2.6 | service + 6.4 |
| FLOW-017 | reopen/preserve history | 2.4,3.2,4.4 | service + 6.4 |
| FLOW-018 | multiple viewers | 1.4,3.3,4.4 | 6.4 |
| FLOW-019 | second producer conflict | 1.4,4.4 | service + 6.4 |
| FLOW-020 | lost hint recovery | 4.3 | 6.4 |

Every required user-flow slice has a Product Spec contract, implementation owner and proof owner.

## Coverage-map rule

`.planning/COVERAGE_MAP.yaml` maps every unique `MASTER_COVERAGE` ID individually. CI must prove exact set equality: no missing IDs and no extras.

## Stage 10 gate result

After branch/main CI:
- READY-022: PASS.
- READY-023: PASS.
- READY-031: PASS.

READY-024 and later remain for Final Planning Review/freeze/execution allocation.

## Conclusion

No material legacy product behavior, integrity invariant, recovery requirement, runtime-delivery invariant or verification obligation identified by this fresh pass remains only in Market Flow.

MarketScope can proceed to Final Planning Review using its own durable contracts and S&T; Market Flow remains historical/source evidence.
