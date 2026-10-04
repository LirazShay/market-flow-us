# MarketScope Source Extraction

## Purpose

Migration provenance only. This is not a STATUS file.

Dispositions:
- **KEEP** — required behavior/data semantics/evidence survives substantially as-is.
- **ADAPT** — capability remains, but ownership/runtime/interface changes.
- **DROP** — do not migrate into MarketScope; source stays in Market Flow as history.
- **INVESTIGATE** — inspect only when a concrete question requires it.

## Stage 1 inventory

| Capability | Exact Market Flow source | Disposition | MarketScope use |
|---|---|---:|---|
| Provider/data continuity + three surfaces | `docs/project/decisions/D-043.md` | KEEP | product/data contracts |
| Node/WebSocket/native-DuckDB authority | `docs/project/decisions/D-045.md` | KEEP | technical/S&T input |
| Durable three-surface product shape | `docs/product/local-history-viewer-v2-product-shape.md` | KEEP | requirements/spec |
| Old root S&T | `.planning/*` | DROP | planning archaeology is not MarketScope current truth; only concrete evidence already extracted survives |
| Old Node-SQL migration inventory | `scripts/research/market-data/leumi/prototypes/local-history-viewer-v2/docs/node-sql-migration-inventory.md` | KEEP | provenance evidence used by the clean migration audit; not an execution authority |
| Dynamic universe browser acquisition | `.../local-history-viewer-v1/recorder/universe-loader.js` | ADAPT | browser still owns provider access |
| Pure universe semantics | `.../local-history-viewer-v1/recorder/pure/universe-logic.js` | KEEP | Stage 4 evidence / reuse candidate |
| Sequential security acquisition | `.../recorder/securities-chunk-fetcher.js` | ADAPT | provider behavior remains; handoff changes |
| Pure chunk semantics | `.../recorder/pure/securities-chunk-logic.js` | KEEP | Stage 4 evidence |
| Complete-cycle logic | `.../recorder/cycle-builder.js`, `.../recorder/pure/cycle-logic.js` | KEEP | integrity contract |
| Recorder orchestration | `.../recorder/recorder-loop.js`, `.../recorder/pure/recorder-loop-logic.js` | ADAPT | WebSocket→Node replaces browser persistence handoff |
| Current UI | `.../viewer/current-table.js` | ADAPT | preserve observable behavior, change data source |
| Current pure model/sort | `.../viewer/pure/current-table-logic.js` | KEEP | Stage 2 primary source |
| Viewer bootstrap/state | `.../viewer/bootstrap.js`, `.../viewer/pure/viewer-state.js` | ADAPT | preserve UX/state; authority changes |
| Live refresh | `.../viewer/live-refresh.js` | ADAPT | notification only; reread Node |
| Detail UI | `.../viewer/security-detail.js` | ADAPT | Stage 3 primary source |
| History access | `.../viewer/history-data.js` | ADAPT | replace IndexedDB with Node reads |
| Viewer owning spec | `.../local-history-viewer-v1/specs/viewer.spec.md` | ADAPT | Stage 2/3 normative evidence |
| Provider data spec | `.../local-history-viewer-v1/specs/provider-data-contract.spec.md` | KEEP | Stage 4 evidence |
| Recorder spec | `.../local-history-viewer-v1/specs/recorder.spec.md` | ADAPT | keep collection semantics, replace storage ownership |
| Current unit test | `.../tests/unit/current-table-logic.test.js` | KEEP | Stage 2 executable evidence |
| Current Chromium test | `.../tests/automation/specs/viewer-current-table.spec.js` | ADAPT | re-prove against Node authority |
| History Chromium test | `.../tests/automation/specs/viewer-history-data.spec.js` | ADAPT | Stage 3 evidence |
| Detail Chromium test | `.../tests/automation/specs/viewer-security-detail.spec.js` | ADAPT | Stage 3 evidence |
| Cycle/universe/chunk unit tests | `.../tests/unit/cycle-logic.test.js`, `universe-logic.test.js`, `securities-chunk-logic.test.js` | KEEP | Stage 4 executable evidence |
| Recorder-loop unit test | `.../tests/unit/recorder-loop-logic.test.js` | ADAPT | handoff changes |
| Sanitized provider fixtures | `.../tests/fixtures/leumi-api-fixtures.js` | KEEP | Fake Market seed evidence |
| Mock provider helper | `.../tests/automation/helpers/mock-leumi-api.js` | ADAPT | canonical Fake Market must become reusable real HTTP |
| Existing automation server | `.../tests/automation/server.js` | ADAPT | HTTP-test topology evidence only; canonical Fake Market is a new stateful real HTTP provider |
| Integrated V1 E2E | `.../tests/automation/specs/integrated-v1-e2e.spec.js` | ADAPT | preserve flow, replace authority |
| IndexedDB storage authority | `.../local-history-viewer-v1/storage/*` | DROP | Node/native DuckDB target authority |
| IndexedDB row/history semantics | `.../storage/pure/persistence-records.js`, `.../storage/read.js` | ADAPT | identity/history/recovery evidence retained; IndexedDB mechanism replaced by Node/DuckDB |
| BroadcastChannel state/ownership | `.../local-history-viewer-v1/messaging/*` | DROP | never authority in MarketScope |
| Metadata refresh hint concept | same messaging source | ADAPT | preserve metadata-only hint → authoritative reread semantics without making BroadcastChannel authority |
| Runtime build/entry packaging | `.../runtime/build-runtime.js`, `source-order.js`, `entry.js` | ADAPT | browser runtime remains; responsibilities change |
| Browser-SQL plans | `.../local-history-viewer-v2/docs/browser-sql-*.md` | DROP | historical only |
| DuckDB-Wasm/OPFS/SQL Worker production path | V2 Browser-SQL runtime/probe assets | DROP | superseded by D-045 |
| Browser DB Web Locks | superseded V2 mechanisms | DROP | one Node owns DuckDB |
| C01-C12 old graph / old master | old V2 execution/Issue graph | DROP | MarketScope S&T owns decomposition |
| Browser-SQL probe/live-gate tests | old V2 Browser-SQL probe tests | DROP | rejected-path machinery |

## Stage 1 conclusion

The clean extraction path is viable without copying Market Flow wholesale. Stage 2 must deeply read only the Current Universe sources and direct tests above and write the exact Current contract into `docs/PRODUCT_SPEC.md`. No Current implementation is migrated yet.

## Stage 2 — Current Universe extraction evidence

The Stage 2 deep read was intentionally limited to the V1 Current surface and directly coupled shell/refresh evidence:

- `viewer/current-table.js`;
- `viewer/pure/current-table-logic.js`;
- `viewer/bootstrap.js`;
- `viewer/pure/viewer-state.js`;
- `viewer/live-refresh.js`;
- `specs/viewer.spec.md`;
- `tests/unit/current-table-logic.test.js`;
- `tests/unit/viewer-state.test.js`;
- `tests/automation/specs/viewer-current-table.spec.js`;
- `tests/automation/specs/viewer-bootstrap.spec.js`;
- `tests/automation/specs/viewer-live-refresh.spec.js`.

### Extracted dispositions

- **KEEP** — exact 16-column Current product shape.
- **KEEP** — latest-derived row set with optional universe metadata; missing universe metadata never removes a valid latest row.
- **KEEP** — canonical string identity, zero/missing display distinction and deterministic null-safe sorting.
- **KEEP** — default activity sort, interactive all-column sorting and deterministic tie-breakers.
- **KEEP** — explicit BOOTING/EMPTY/MAIN/ERROR semantics for Current.
- **KEEP** — authoritative reread semantics, manual refresh without provider calls, sort preservation and Current scroll preservation requirement.
- **KEEP** — click/Enter/Space row activation and accessible sortable controls.
- **ADAPT** — Current read source changes from IndexedDB to localhost Node/DuckDB.
- **ADAPT** — live refresh notification transport; preserve hint→authoritative-reread behavior, not BroadcastChannel.
- **ADAPT** — user-visible success/error wording must no longer claim IndexedDB authority.
- **ADAPT** — Detail destination/Back/history behavior is now owned explicitly by Product Spec Surface B and the Node-backed Viewer plan.

### Stage 3 correction to Stage 2 evidence

The Stage 3 direct Detail test proves horizontal Current-table scroll restoration across Current → Detail → live refresh → Back. The V1 implementation stores both horizontal and vertical scroll coordinates. MarketScope therefore keeps viewport preservation as a directly evidenced round-trip behavior, while replacement E2E should cover the relevant axes explicitly.


## Stage 3 — Security Detail / History extraction evidence

Deep-read sources:

- `viewer/history-data.js`;
- `viewer/security-detail.js`;
- `viewer/live-refresh.js`;
- `storage/schema.js`;
- `storage/read.js` for continuation semantics only;
- `storage/pure/persistence-records.js` for persisted history-row shape only;
- `specs/viewer.spec.md`;
- `tests/automation/specs/viewer-history-data.spec.js`;
- `tests/automation/specs/viewer-security-detail.spec.js`;
- `docs/product/local-history-viewer-v2-product-shape.md`;
- `docs/project/decisions/D-043.md`.

### Extracted dispositions

- **KEEP** — canonical SecurityId detail identity.
- **KEEP** — exact V1 current/detail summary fields for a currently present security.
- **KEEP** — exact 15-column V1 history table shape.
- **KEEP** — 500-row initial history page.
- **KEEP** — newest-first per-security history.
- **KEEP** — continuation guarantee: equal timestamps cannot duplicate/skip.
- **KEEP** — explicit Load More with localized retry on continuation failure.
- **KEEP** — Detail loading, empty-history and localized read-error semantics.
- **KEEP** — live refresh remains in Detail and preserves previously loaded history depth.
- **KEEP** — Back restores Current sort and viewport; direct V1 automation proves horizontal scroll restoration.
- **ADAPT** — IndexedDB history reads become Node/DuckDB read operations.
- **ADAPT** — IndexedDB-specific continuation token shape becomes a Node/DuckDB keyset/read contract while preserving observable guarantees.
- **ADAPT** — historical-only Detail must be addressable by canonical SecurityId independently of Current.
- **ADAPT** — V1 refresh coupling to the refreshed Current model must be removed so historical-only Detail remains usable.
- **DROP** — direct IndexedDB access as Viewer authority.
- **ADAPT** — Node read-message/cursor encoding is resolved in Technical Spec; Product Spec remains transport-agnostic.

### V1/V2 boundary discovered

V1's user entry path is Current-row → Detail and its refresh implementation expects the selected security to remain in Current. The accepted V2 durable product shape adds a stronger requirement: known persisted history remains useful when the security is no longer current.

MarketScope resolves the product behavior without fabricating authority: open by canonical SecurityId, keep history accessible, and show missing Current-only values as unavailable instead of promoting the newest history row to Current.

## Stage 4 — Provider / Recorder / complete-cycle extraction evidence

Deep-read sources:

- `recorder/universe-loader.js`;
- `recorder/pure/universe-logic.js`;
- `recorder/securities-chunk-fetcher.js`;
- `recorder/pure/securities-chunk-logic.js`;
- `recorder/cycle-builder.js`;
- `recorder/pure/cycle-logic.js`;
- `recorder/recorder-loop.js`;
- `recorder/pure/recorder-loop-logic.js`;
- `recorder/pure/config-logic.js`;
- `specs/provider-data-contract.spec.md`;
- `specs/recorder.spec.md`;
- direct unit tests for universe/chunk/cycle/Recorder loop;
- sanitized provider fixtures;
- durable decisions D-004..D-015, D-043 and D-045.

### Extracted dispositions

- **KEEP** — MapHeat2 dynamic-universe role and full-record preservation.
- **KEEP** — GetSecuritiesData detailed snapshot role and full raw Security preservation.
- **KEEP** — source-specific canonical identity: `String(PaperId)` for MapHeat, `String(Key)` for Security.
- **KEEP** — PaperId↔Key join by canonical ID; never array index.
- **KEEP** — two-step count/full universe completeness checks.
- **KEEP** — exact requested/received/unique/missing/duplicate/unexpected membership validation.
- **KEEP** — response order may differ from request order.
- **KEEP** — sequential chunking as proven baseline.
- **KEEP** — local chunk timing and server-as-of preservation.
- **KEEP** — whole-cycle validation and commit-before-success behavior.
- **KEEP** — raw `null` / `0` / empty / missing distinction.
- **ADAPT** — V1 Browser persistence handoff becomes validated universe + CompleteCycle transport to Node.
- **ADAPT** — add explicit `unexpected: 0` to clean CompleteCycle integrity counters even though V1 represented it as a validated condition rather than a returned counter.
- **ADAPT** — V1 in-memory universe helper fields are reduced at the Node boundary to the normalized persisted universe plus raw MapHeat records.
- **ADAPT** — failed provider/validation work becomes a bounded sanitized FailedCycleReport when Node is reachable; it remains diagnostics only.
- **DROP** — IndexedDB commit/session IDs from Browser→Node payloads; Node assigns durable IDs.
- **DROP** — any assumption that 561 or exactly three 187-sized chunks is a contract.
- **ADAPT** — WebSocket envelope/message names, Node schema and transaction layout are resolved in Technical Spec.

### Evidence boundaries

- 187 is a conservative proven chunk-size baseline, not a permanent provider threshold.
- 3000ms snapshot interval and 1000ms inter-chunk delay are V1 defaults/evidence, not frozen MarketScope requirements.
- Exact provider private-API stability remains a bounded live-verification concern.

## Stage 5 — Product completeness re-audit / diagnostics extraction

The original brief was re-read after Stages 2–4. One omitted extraction item was found: recorder/health diagnostics displayed to the user.

Additional V1 evidence read:

- `viewer/diagnostics-data.js`;
- `viewer/diagnostics.js`;
- `viewer/pure/diagnostics-logic.js`;
- `specs/viewer.spec.md`;
- `tests/unit/viewer-diagnostics-logic.test.js`;
- `tests/automation/specs/viewer-diagnostics.spec.js`.

### Diagnostics dispositions

- **KEEP** — explicit operational-health surface visible in MAIN and DETAIL.
- **KEEP** — health states UNKNOWN/RUNNING/STALE/STOPPED/ERROR and deterministic precedence semantics.
- **KEEP** — last update, last cycle, cycle duration, Current count, completed/failed cycles and history count.
- **KEEP** — zero-valued counters remain zero, not missing.
- **KEEP** — manual/live-hint refresh rereads diagnostics from authority.
- **ADAPT** — diagnostics source moves from IndexedDB to Node trusted status/read operations.
- **ADAPT** — V1's 15-second stale threshold becomes technical heartbeat/staleness configuration; preserve semantics, not an accidental old cadence constant.
- **DROP** — browser storage usage/quota as a required product metric.
- **DROP** — V1 Debug Bundle export UI from initial MarketScope scope; it was not required by the MarketScope brief and would add product surface without current need.

### Stage 5 brief audit result

No other product-level requirement from the original brief was found missing after adding diagnostics and expanding all eight mandatory user flows. Technical, Fake-Market implementation, testing, workload, CI and S&T-allocation obligations remain intentionally pending in their owning future planning stages.

## Stage 6 — Technical architecture evidence/dispositions

Additional legacy evidence inspected only where it informed the clean runtime delivery contract:

- `local-history-viewer-v1/runtime/README.md`;
- `local-history-viewer-v1/runtime/build-runtime.js`;
- `local-history-viewer-v1/runtime/entry.js`;
- V1 README runtime/recovery summary.

### Runtime dispositions

- **KEEP** — one generated self-contained browser runtime from one source graph.
- **ADAPT** — production bookmarklet delivery remains a launcher for the normal runtime, but persistence/authority moves entirely to Node.
- **KEEP** — repeated runtime launch must be idempotent with respect to the active producer.
- **KEEP** — Fake Market/CI must use the same normal browser runtime rather than a second UI.
- **DROP** — same-origin IndexedDB access as the reason the Viewer must be same-origin; same-origin remains useful for runtime/UI and metadata-only BroadcastChannel.
- **DROP** — V1 debug-bundle API from the initial MarketScope product surface per D-004.

### External implementation evidence checked in Stage 6

Current upstream API/package facts were verified before locking the technical contract:

- Node 24 LTS line;
- DuckDB Node Neo high-level API and current package baseline;
- Node Neo `extractStatements` and prepared `statementType`;
- DuckDB `duckdb_functions().has_side_effects`;
- DuckDB hardening configuration;
- DuckDB `query()` dynamic SQL risk;
- current `ws` package baseline;
- current browser loopback secure-context/LNA constraints.

These are dependency/platform facts, not Market Flow product truth.

## Stage 7 — Test strategy / Fake Market extraction and adaptation

Additional V1 evidence inspected:

- `local-history-viewer-v1/tests/TESTING_POLICY.md`;
- `tests/fixtures/leumi-api-fixtures.js`;
- `tests/automation/helpers/mock-leumi-api.js`;
- `tests/automation/server.js`;
- `tests/automation/specs/integrated-v1-e2e.spec.js`;
- `playwright.config.js`;
- V1 Fast CI and Browser CI workflows.

### Dispositions

- **KEEP** — test/proof-first discipline and public-contract assertions.
- **KEEP** — targeted changed-test execution before broader suites.
- **KEEP** — full Chromium final-state verification for browser/product changes.
- **KEEP** — sanitized four-security fixture identities/data patterns as useful fake seed.
- **ADAPT** — V1 `page.route` provider mock becomes the canonical real HTTP Fake Market for main flows.
- **ADAPT** — V1 static HTTP automation server becomes a deterministic provider server + runtime host.
- **ADAPT** — V1 integrated mocked E2E flow becomes Browser→WebSocket→Node→DuckDB full E2E.
- **ADAPT** — Fast CI now includes real service integration in addition to unit tests.
- **ADAPT** — Browser CI becomes automatic for product-code changes rather than only a manual/checkpoint workflow.
- **KEEP/ADAPT** — Playwright trace/screenshot/report failure diagnostics plus sanitized service/fake logs.
- **DROP** — IndexedDB-specific browser storage self-tests from the MarketScope target.
- **DROP** — reliance on Playwright interception as proof of the main provider integration path.
- **DROP** — Browser-storage growth benchmark; replaced by native DuckDB workload verification.

The canonical fake retains the old sanitized fixture spirit but expands it to deterministic logical cycles, historical-only universe changes and failure scenarios.


## Stage 10 — Fresh legacy migration completeness audit

This pass did **not** trust the earlier extraction summary by itself.

Fresh repository inventory:

- V1 workstream: 140 files total; 102 code/spec/test/design files in the core product/runtime/storage/viewer/provider/testing candidate surface.
- V2 workstream: 236 files total; 113 core candidates after separating HOT/history/planning archaeology.
- V2 contains 99 docs, many superseded Browser-SQL/DuckDB-Wasm/OPFS/Worker planning artifacts. They remain historical unless current Node migration evidence identifies a reusable requirement.

Freshly rechecked durable evidence included V1 system/requirements/architecture/data-model, persistence/session lifecycle, recovery, messaging, runtime/bookmarklet build, storage-growth/no-retention evidence, V2 durable product shape/live SQL requirement, D-043/D-045, the V2 Node migration inventory and product-shape contract test.

### New/reconfirmed dispositions

| Legacy evidence | Disposition | MarketScope owner / rationale |
|---|---|---|
| no automatic retention / no silent history deletion | **KEEP / ADAPT** | Product Requirements + Technical Spec + tests + S&T 2.4 |
| Viewer close does not stop recorder; reopen works without provider | **KEEP / ADAPT** | Product Spec D3 + E2E-08 + S&T 4.4 |
| generated runtime + bookmarklet from one source graph | **KEEP / ADAPT** | Technical Spec + S&T 1.1 |
| `javascript:` single-line bookmarklet, no whole-runtime percent encoding, no arbitrary build ceiling | **KEEP / ADAPT** | Technical Spec + Unit build proof + S&T 1.1 |
| clean stop/relaunch cannot overlap prior recorder ownership | **KEEP / ADAPT** | Node stop ACK/ownership release + S&T 4.4 |
| D-045 real-origin loopback smoke | **KEEP as historical evidence** | Technical Spec evidence; final candidate reruns bounded live gate |
| Debug Bundle user UI | **DROP** | D-004; service/test diagnostics own debugging |
| IndexedDB storage quota/usage UI | **DROP** | old browser-storage semantics |
| `DATABASE_CLEARED` BroadcastChannel event | **DROP** | no production clear operation; demo reset is separate |
| rolling V1 GitHub Release tag | **DROP as requirement** | generated artifacts remain required; publication mechanism is not product behavior |
| Current filtering/charts | **DROP / not required** | Current remains browse/sort/navigation; analytical filtering is Scanner SQL |
| Browser-SQL persisted active Scanner config + restart auto-run | **DROP / historical** | absent from durable V2 product requirement and MarketScope brief |
| Worker/Wasm/OPFS/Web Locks/probes/C01-C12 | **DROP / ARCHIVE** | D-045 + V2 migration inventory |
| IndexedDB schema/code | **DROP as production mechanism; KEEP as evidence** | atomicity/recovery/raw-history principles adapted to Node/DuckDB |

After these corrections, no material V1/V2 product behavior, integrity invariant or direct proof obligation identified by the fresh inventory remains only in Market Flow without a MarketScope owner.
