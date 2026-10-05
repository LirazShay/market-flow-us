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

The initial typed market projection is:

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

## 12. Built-in staged candidate query

Market Flow US adds a built-in editable query named conceptually `Staged candidate ranking`.

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

## 13. Flow 8 — Failure/recovery

Preserve imported behavior:

- provider HTTP/shape/validation failure -> failed cycle diagnostic, prior authority unchanged;
- WebSocket disconnect -> producer stops fail-closed;
- DB failure -> transaction rollback;
- Viewer may continue to read last committed state after producer stop;
- service restart marks stale running sessions interrupted;
- explicit relaunch creates a new producer generation.

## 14. Fake Market behavior

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
- restart/persistence.

## 15. Polling cadence

Configuration remains in seconds/milliseconds as an implementation timing value; no market-history schema is generated from it.

Initial offline/demo default remains the inherited 3000 ms snapshot interval.

This is not a claim that the provider contract guarantees safe 3-second polling. Real-provider verification records actual behavior. If live evidence requires a slower default, change the collection configuration without changing data architecture.

## 16. U.S. workload shape

Representative workload:

```text
universe size = 4096 synthetic securities
cycles = 180
history rows = 737280
```

This proves approximately-4k scale without treating the observed 4015 as a product constant and keeps the manually triggered workload practical.

The workload measures:

- commit latency;
- Current read;
- History first/continuation page;
- general Scanner JOIN/GROUP/window/time queries;
- staged candidate query;
- restart-to-ready;
- DB file size;
- count integrity.

No arbitrary latency threshold is a correctness gate in the first U.S. baseline.

## 17. Branding / generated artifacts

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

## 18. Live verification

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

is required for FR-13. If the base authenticated boundary passes but no real provider-field change is observed, movement remains `PENDING`; it is never inferred from local collection timestamps and never upgraded manually. If a change is observed but its Current/History reflection is not proven, movement is `FAIL` while the already-proven static/base boundary remains a separate fact.

This is a bounded sustained proof, not a long-duration throttling/SLA guarantee. Only the live gate may report the external facts it actually verifies.
