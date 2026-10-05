# Market Flow US Product Spec

## 1. Runtime baseline

Market Flow US preserves the imported MarketScope topology:

```text
authenticated provider page
→ browser producer
→ ws://127.0.0.1:8765
→ localhost Node.js service
→ native DuckDB
→ browser Viewer
```

Provider authentication remains browser-owned.

The final post-Demo-Buy database contract is schema v4. Schema v4 preserves the existing U.S. market-authority tables and adds only the Demo Buy analytical observation tables required by this feature.

## 2. Product identity

Product name: `Market Flow US`

Canonical security identity, after fail-closed source-type validation, is:

```text
securityId = String(PaperId)
```

Accepted `PaperId` source types are non-blank string or JavaScript safe integer. Objects, arrays, booleans and non-safe numeric identities are rejected rather than generically stringified.

`Symbol` is display/query metadata, not the primary key.

## 3. Flow 1 — Start product

1. User opens an eligible authenticated Bank Leumi provider page.
2. User starts the local service with the exact provider Origin allowed.
3. User runs the Market Flow US browser runtime/bookmarklet.
4. Browser producer performs hello/session start.
5. Viewer opens/reuses the product window.
6. Collection starts only after local authority is ready.

If service start/hello fails, UI reports failure and no collection success is claimed.

## 4. Flow 2 — Acquire one U.S. snapshot

The browser performs:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

using the configured unbounded U.S. screener filters documented in DATA_CONTRACT.

A response is complete only when:

- HTTP status is successful;
- `data.ScreenerHulPaging` exists;
- `recordCount` is a positive safe integer;
- `records` is an array;
- `records.length === recordCount`;
- every record has `PaperId` whose source type is a non-blank string or safe integer;
- objects/arrays/booleans/non-safe numeric identities are rejected fail-closed;
- canonical `String(PaperId)` values are unique after that validation.

`Symbol` absence is diagnostic-worthy but does not override `PaperId` identity.

The cycle records browser timings and source envelope metadata needed for diagnostics, while preserving each raw row.

## 5. Flow 3 — Universe and cycle authority

Every validated full response contains both membership and row data.

For the first response in a producer session:

```text
derive universe
→ producer.universe.replace
→ receive universeRevision
→ commit same response as cycle under that revision
```

For later responses:

- if canonical membership is unchanged, commit under the accepted revision;
- if membership changes, replace universe from the newly validated full response, receive a new revision, then commit that same response under the new revision.

A membership change is not a failure by itself.

A failed/incomplete response never changes universe authority and never commits history/latest.

## 6. Flow 4 — Persist successful cycle

Node validates:

- running producer session;
- valid universe revision;
- exact membership equality;
- complete cycle counters;
- unique security IDs;
- raw row identity matches `securityId` under the same U.S. `PaperId` type contract.

Within one serialized DuckDB transaction:

1. allocate `cycle_id`;
2. insert complete cycle metadata;
3. append all rows to `history`;
4. replace all rows in `latest`;
5. update session counters/last-complete metadata;
6. COMMIT.

Any failure rolls back the whole cycle.

## 7. U.S. public row projection

The typed market projection is:

### String fields

```text
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng
```

### Numeric fields

```text
Price
ChangePercent
DailyHigh
DailyLow
YearHigh
YearLow
DailyVolume
BeginYearChangePercent
Month12ChangePercent
Month36ChangePercent
AskRate
BidRate
YesterdayRate
PaperMarketCap
PaperIdYatab
CountryId
PaperType
ESGRatingId
ESGScope
```

Every row also retains `raw_data JSON`.

Missing/invalid typed values project to SQL NULL without changing the raw JSON.

## 8. Display-name rule

Viewer `paperName` is the first non-empty value in this order:

```text
PaperNameEng
→ PaperNameHeb
→ Symbol
→ securityId
```

## 9. Flow 5 — Current

Current reads `latest` joined with current universe metadata.

Visible columns, in order:

```text
paperName
Symbol
ExchangeName
securityId
Price
ChangePercent
BidRate
AskRate
DailyVolume
DailyLow
DailyHigh
YesterdayRate
PaperMarketCap
TradeDateTime
collectedAtMs
```

Behavior:

- BOOTING before first read result;
- EMPTY when no committed Current exists;
- MAIN when rows exist;
- ERROR on read failure;
- default sort `DailyVolume DESC`;
- null/undefined/empty render as em dash; numeric zero remains zero;
- current sort and scroll survive authoritative refresh;
- row click/Enter/Space opens Detail.

## 10. Flow 6 — Detail / History

Detail summary shows:

```text
Price
ChangePercent
BidRate
AskRate
DailyVolume
TradeDateTime
```

History columns:

```text
collectedAtMs
cycleId
Price
ChangePercent
BidRate
AskRate
DailyVolume
DailyLow
DailyHigh
YesterdayRate
PaperMarketCap
TradeDateTime
```

History remains newest-first with 500-row keyset pages.

A security that is absent from Current but exists in history remains openable by canonical `securityId`.

## 11. Flow 7 — Scanner and saved queries

Scanner keeps existing admission/security rules:

- exactly one statement;
- SELECT only;
- zero parameters;
- blocked side-effect functions;
- hardened DuckDB connection;
- exact result columns/rows returned.

Saved-query behavior remains unchanged:

- built-ins are source-defined and immutable;
- user queries live in DuckDB;
- loading never activates;
- create/update/delete are explicit;
- active generation remains separate from selected draft.

A successful Scanner execution exposes result `startedAtMs` and `completedAtMs`. Demo Buy freezes those timings together with the active query/interval/result snapshot; later draft/library edits do not rewrite an existing generation.

A result is Demo-Buy-capable only when it exposes exactly one recognized canonical identity column named `securityId` or `security_id`. Identity is never guessed from `Symbol`.

## 12. Built-in staged candidate query

Market Flow US includes an editable built-in staged candidate query.

Its first version uses source `Price` and target ages:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

For each target age, SQL chooses:

```text
latest history row
for the same security
where collected_at_ms <= current.collected_at_ms - target_age_ms
order by collected_at_ms DESC, cycle_id DESC
limit 1
```

Stage rule for the initial example:

```text
current.Price > prior.Price
```

`stage_reached` is the number of consecutive successful stages from the beginning. Missing historical data ends progression at that stage.

Sort:

```text
stage_reached DESC
ChangePercent DESC NULLS LAST
DailyVolume DESC NULLS LAST
securityId ASC
```

The query is an example, not hard-coded strategy behavior.

## 13. Flow 8 — Create a Demo Buy capture

Demo Buy validates Scanner selections without simulating a broker order.

Supported capture modes from one successful Scanner result generation are:

```text
manual selected rows
all rows
first X source rows (Top X)
automatic all
automatic Top X
```

Selection semantics are source-row first:

1. manual uses the checked source rows;
2. All uses all source rows;
3. Top X uses exactly the first X source rows in Scanner SQL result order;
4. every chosen row must have a valid canonical identity;
5. duplicate identities inside the chosen set reduce to their first chosen occurrence;
6. each retained item keeps its original 1-based Scanner `resultRank`.

Therefore a duplicate inside Top X does not pull a later row from outside X into the capture. Manual ranks may contain gaps.

A single capture is bounded to at most 5000 unique canonical IDs. `Top X` is bounded to 1..5000 source rows. All/auto-All never silently truncate; invalid chosen rows or oversized deduped All selections are refused visibly. Manual empty selection does not create a capture; automatic zero-row selection is a no-op.

The browser sends ordered `{securityId, resultRank}` items plus immutable active-generation provenance:

```text
queryId / name / exact SQL
active intervalMs
Scanner startedAtMs / completedAtMs
source rowCount
selection mode / automatic / topX
```

It never sends a buy price.

One Viewer-level capture slot covers manual and automatic capture. A manual action is disabled while a capture is in flight; an automatic generation arriving while busy is visibly skipped rather than queued. A failure releases the slot and does not stop Scanner scheduling.

Node validates that submitted IDs/ranks are already unique and consistent with the source-row provenance; it rejects duplicate protocol items rather than silently repairing them.

Node performs the capture through the existing serialized writer boundary. At that serialized point it:

```text
validates the bounded request
→ records captured_at_ms
→ resolves every selected security in authoritative latest
→ obtains each exact latest.cycle_id
→ requires every item to resolve
→ persists one capture and its ordered original-rank items
→ COMMIT
```

If any item cannot be resolved, the whole capture fails and no partial Demo Buy event is stored.

Each item therefore has an immutable baseline reference:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The linked history row owns the baseline `Price`, names, Symbol and baseline collection time. Demo Buy does not copy those market facts into the item.

The Scanner result-ready moment and virtual-buy moment are distinct:

```text
signal/result-ready = source_result_completed_at_ms
virtual buy         = captured_at_ms
capture latency     = captured_at_ms - source_result_completed_at_ms
baseline age        = captured_at_ms - baseline_collected_at_ms
```

These are local diagnostics, not broker timing claims.

Repeated later captures of the same security are valid independent observations; they are not portfolio positions.

## 14. Flow 9 — Evaluate Demo Buy outcomes

Phase-1 horizons are fixed product behavior:

```text
10s
20s
30s
45s
60s
90s
120s
3m
5m
10m
```

For a capture at `captured_at_ms` and a horizon `H`, Node's trusted Demo Buy read model finds:

```text
same security_id
AND collected_at_ms >= captured_at_ms + H
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

This is the first authoritative market observation available at or after the requested horizon. The horizon clock starts at the Node-authoritative virtual-buy moment, not at Scanner completion time and not at an older baseline collection timestamp.

The first qualifying history row remains authoritative for that horizon even when its `Price` is NULL; evaluation never skips an unusable row to cherry-pick a later value.

For a matched future row:

```text
changePercent = ((futurePrice / baselinePrice) - 1) * 100
```

Direction is derived by the read model:

```text
UP          changePercent > 0
DOWN        changePercent < 0
FLAT        changePercent = 0
UNAVAILABLE changePercent is null
```

`UNAVAILABLE` also carries one reason:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

A missing immutable baseline row is instead a Demo Buy integrity error.

Each matched horizon exposes the observation time and actual elapsed time from capture, so a collection delay is visible.

No background updater or materialized horizon columns are required. Refreshing the Demo Buy screen recomputes the read model from persisted `history`.

Each bounded page is evaluated from one transactionally consistent DuckDB read snapshot so market writes cannot create internally mixed horizon results within one response.

## 15. Flow 10 — Demo Buy Viewer

The Viewer has a third top-level destination beside Current and Scanner:

```text
Demo Buy
```

The Demo Buy table is newest capture first and then original Scanner `resultRank` ascending inside each capture.

Phase 1 uses 50-item opaque-keyset pages because Demo Buy rows are materially wider than History rows. A continuation cursor is anchored to `(capture_id, result_rank)`, so newer automatic captures do not create gaps/duplicates in an already-started continuation walk; they become visible on refresh from the first page.

For each item the user can see at least:

```text
source query label
signal/result-completed time or capture latency
capture time
manual/automatic marker
original Scanner result rank
Symbol / display name
securityId
baseline collection time / baseline age
baseline Price
10s Price / % / outcome
20s Price / % / outcome
30s Price / % / outcome
45s Price / % / outcome
60s Price / % / outcome
90s Price / % / outcome
120s Price / % / outcome
3m Price / % / outcome
5m Price / % / outcome
10m Price / % / outcome
```

Unavailable horizons use the existing missing-value convention plus explicit `UNAVAILABLE`; the detailed unavailable reason remains inspectable. Direction must not rely on color alone.

A wide horizontally scrollable table is acceptable for Phase 1.

Full source SQL and immutable capture provenance are loaded on demand per capture through a dedicated capture-details read, rather than repeated in every visible item row.

Automatic capture remains Viewer-session state and may continue while the user views Demo Buy. Capture failure is visible but does not stop Scanner scheduling.

## 16. Flow 11 — Schema-v4 lifecycle and recovery

Fresh databases bootstrap directly as schema v4.

A valid schema-v3 Market Flow US active DB migrates additively and transactionally to v4 while preserving market authority and saved Scanner queries.

A database marked v3 but already containing only part of the Demo Buy v4 structures is treated as an inconsistent partial state and fails closed rather than being silently resumed/upgraded.

Preserve imported failure/recovery behavior:

- provider HTTP/shape/validation failure -> failed cycle diagnostic, prior authority unchanged;
- WebSocket disconnect -> producer stops fail-closed;
- DB failure -> transaction rollback;
- Viewer may continue to read last committed state after producer stop;
- service restart marks stale running sessions interrupted;
- explicit relaunch creates a new producer generation;
- Demo Buy capture failure is all-or-nothing and does not mutate market authority;
- Demo Buy read failure does not mutate stored observations;
- active-day Demo Buy observations survive service restart.

No additional `history` index is part of the v4 contract. Add one later only if representative Demo Buy workload demonstrates a real bottleneck.

## 17. Fake Market behavior

Canonical Fake Market serves the normal browser runtime plus the U.S. screener endpoint.

It owns deterministic scenarios for:

- normal moving values;
- same membership with reordered rows;
- added/removed security;
- duplicate `PaperId`;
- missing `PaperId`;
- mismatched `recordCount`;
- null/zero/missing market fields;
- malformed JSON/shape;
- HTTP failure;
- delayed response;
- restart/persistence;
- deterministic future price paths that produce positive, negative, flat and all unavailable-reason cases needed by Demo Buy tests.

## 18. Polling cadence

Configuration remains in seconds/milliseconds as an implementation timing value; no market-history schema is generated from it.

Initial offline/demo default remains the inherited 3000 ms snapshot interval.

This is not a claim that the provider contract guarantees safe 3-second polling. Real-provider verification records actual behavior. If live evidence requires a slower default, change the collection configuration without changing data architecture.

## 19. U.S. workload shape

Representative heavy target-machine workload:

```text
universe size = 4096 synthetic securities
cycles = 180
history rows = 737280
```

This proves approximately-4k scale without treating the observed 4015 as a product constant.

Hosted CI uses bounded correctness/performance-smoke profiles rather than the heavy target-machine workload.

Workload coverage includes:

- commit latency;
- Current read;
- History first/continuation page;
- general Scanner JOIN/GROUP/window/time queries;
- staged candidate query;
- bounded 50-item Demo Buy evaluation/read over representative active-day observations;
- Scanner + Demo Buy refresh coexistence on the existing Viewer transport;
- restart-to-ready;
- DB file size;
- count integrity.

No arbitrary latency threshold is a correctness gate in hosted CI.

## 20. Branding / generated artifacts

Target names:

```text
npm package: market-flow-us
default DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
browser runtime: dist/browser/market-flow-us.runtime.js
bookmarklet: dist/browser/market-flow-us.bookmarklet.txt
live runtime: dist/live-verification/market-flow-us-live-verification.js
live bookmarklet: dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
Windows launcher: START_MARKET_FLOW_US.cmd
```

Old MarketScope names are donor history, not final product surface.

## 21. Daily active-DB lifecycle

The active DB covers one trading day.

The new-day flow is:

```text
stop producer/service cleanly
→ optionally archive prior-day DB
→ create fresh schema-v4 active DB
→ preserve scanner_saved_queries
→ leave new demo_buy_captures/demo_buy_items empty
→ start the new trading day
```

If a prior DB is archived, it remains self-contained with the Demo Buy observations and history rows they reference. The active product does not create a multi-day strategy warehouse in Phase 1.

## 22. Live verification

The bounded real-provider gate proves the authenticated provider/authority boundary and separately reports market-open movement evidence.

Base authenticated proof:

```text
producer hello/session
→ at least 20 consecutive validated U.S. full responses spanning at least 60 seconds at candidate cadence
→ universe ACK/revision handling
→ cycle COMMIT ACK for every cycle
→ Current on final cycle
→ Security
→ History containing the live committed cycles
→ bounded Scanner SELECT
→ producer ownership/status
→ clean stop
```

A base `overall: "PASS"` is valid closed/static compatibility even when provider market values repeat.

For final market-open acceptance the same SHA-bound report also contains a separate `movement` classification. It scans only the committed live cycle range for a change in persisted provider market/freshness fields (`Price`, `ChangePercent`, `BidRate`, `AskRate`, `DailyVolume`, `TradeDateTime`) and then proves that witness through trusted Current/History reads.

```text
movement.status = PASS
```

is required for final moving-market acceptance. If the base authenticated boundary passes but no real provider-field change is observed, movement remains `PENDING`; it is never inferred from local collection timestamps and never upgraded manually.

The final target-machine bundle also contains a deterministic local Demo Buy journey on the exact post-feature candidate so schema-v4 capture/evaluation/UI behavior is proven on the user's machine before completion.

This is a bounded sustained proof, not a long-duration throttling/SLA guarantee. Only the live gate may report the external facts it actually verifies.

## 23. Explicit Phase-1 non-goals

Demo Buy Phase 1 does not add:

```text
real order placement
manual buy-price entry
fill simulation
bid/ask execution modeling
fees/slippage
sell rules
portfolio/risk state
trade quantity
volume-after-buy sellability analysis
strategy aggregate dashboards/scorecards
multi-day active analytics
Strategy Engine
background horizon materialization
speculative history indexing without measured need
```

The requested volume/liquidity/fillability analysis belongs to a later Phase 2 after this increment is completely implemented and verified.
