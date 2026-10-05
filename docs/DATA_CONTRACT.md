# Market Flow US Data Contract

## 1. Ownership and evidence level

This document owns provider/data truth used by Market Flow US and the distinction between persisted facts and derived Demo Buy evaluation.

The Bank Leumi U.S. endpoint is empirically observed, not an official public API contract. Every provider field is therefore either:

- **proven shape** — observed and reproduced;
- **source-named semantic** — useful but exact external meaning may remain empirical;
- **unknown** — must not be silently upgraded into a stronger claim.

Raw provider rows are retained so later discoveries do not destroy information.

Demo Buy adds local analytical facts. Those facts must never be confused with provider-originated facts.

## 2. Provider endpoint

Current source:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

The request runs in the already-authenticated provider browser context using a relative same-origin URL.

No credentials/cookies/tokens are encoded by Market Flow US.

## 3. Current full-result request

Initial request parameters:

```text
region=1
Country=2
indexIdArray=0
paperType=1
sectorIdArray=0
subSectorIdArray=0
changePercentFrom=-999999999
changePercentTo=999999999
volumeFrom=-999999999
volumeTo=999999999
marketCapFrom=-999999999999999
marketCapTo=999999999999999
beginYearChangePercentFrom=-999999999
beginYearChangePercentTo=999999999
month12ChangePercentFrom=-999999999
month12ChangePercentTo=999999999
month36ChangePercentFrom=-999999999
month36ChangePercentTo=999999999
EsdRatingModeSelected=0
EsdRatingModeValueSelected=0
page=1
pageCount=5000
orderFieldName=DailyVolume
orderDir=DESC
rt=true
```

`pageCount=5000` is the currently proven practical request size, not a permanent provider guarantee.

If the provider later reports more rows than returned, the snapshot fails closed. Do not silently treat a partial page as a complete universe.

## 4. Observed response envelope

Expected high-level shape:

```text
data.ScreenerHulPaging.recordCount
data.ScreenerHulPaging.maxDateChange
data.ScreenerHulPaging.records[]

resultCode
rsCount
rtIsr
rtUsa
logtm
reqtm
responsetm
serverId
version
```

The following envelope fields are diagnostic/source metadata, not business identity:

```text
maxDateChange
rsCount
rtIsr
rtUsa
logtm
reqtm
responsetm
serverId
version
```

## 5. Complete-response validation

A response may become an authoritative cycle only when all are true:

1. HTTP response is 2xx.
2. JSON parsing succeeds.
3. `data.ScreenerHulPaging` exists and is an object.
4. `recordCount` is a positive safe integer.
5. `records` is an array.
6. `records.length === recordCount`.
7. every row is an object;
8. every row has `PaperId` whose source type is either a string or a JavaScript safe integer; blank strings, objects, arrays, booleans and non-safe numeric identities are rejected;
9. after that type validation, `String(PaperId)` is non-empty and unique across the response;
10. if `resultCode` is present, it is `0`.

The collector records warnings/diagnostics, but does not necessarily fail the snapshot, when:

- `Symbol` is missing;
- quote-like fields are null/missing;
- `TradeDateTime` appears old;
- `serverId` or `version` changes;
- `recordCount` changes;
- `rtUsa` is false or absent.

Warnings must not fabricate field values.

## 6. Canonical identity

Canonical product identity, **after the accepted `PaperId` source-type validation above**, is:

```text
securityId = String(PaperId)
```

The Node authority independently enforces the same fail-closed U.S. identity boundary before universe persistence; malformed values are never canonicalized with generic `String(object)` behavior.

Do not key market authority or Demo Buy observations by:

- array index;
- `Id`;
- `Symbol`;
- `PaperIdYatab`;
- display name.

`Symbol` may change and is query/display metadata.

## 7. Observed source row fields

Observed fields include:

### Identity / display

```text
Id
PaperId
PaperNameEng
PaperNameHeb
Symbol
ExchangeName
PaperIdYatab
CountryId
CountryName
CountryNameEng
PaperType
```

### Market-like fields

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
TradeDateTime
AskRate
BidRate
YesterdayRate
PaperMarketCap
```

### Other observed fields

```text
Logo
ESGRatingId
ESGScope
```

No consumer may assume every row contains every field.

## 8. Typed projection

The U.S. DuckDB public market projection promotes the following source fields while retaining `raw_data`.

### VARCHAR

```text
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng
```

### DOUBLE

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

Projection rule:

- finite JavaScript number -> DOUBLE;
- string -> VARCHAR;
- wrong type / absent / non-finite -> SQL NULL;
- raw JSON preserves the original value/property presence.

`PaperId` is represented separately as canonical `security_id`.

## 9. Source and local-time semantics that remain intentionally distinct

### Price

Persist as source column `Price`.

Do not rename it to `Last` or `LastPrice` until provider/live evidence establishes that stronger semantic.

Demo Buy may compare source `Price` values mechanically. Such a comparison is analytical evidence only and does not establish an executable/fillable trade price.

### DailyVolume

Persist as `DailyVolume`.

Do not describe its unit more strongly than the source field name until verified.

### PaperMarketCap

Persist as `PaperMarketCap`.

Exact unit remains empirical.

### TradeDateTime

Persist the delivered string exactly as `TradeDateTime`.

Do not parse it into the authoritative collection timestamp or assume timezone/session semantics.

### collected_at_ms

Browser-generated collection time is the authoritative local acquisition timestamp for history ordering and relative-time SQL.

It is independent from `TradeDateTime`.

### Scanner result timing

A successful Scanner result already carries Node-produced local execution times:

```text
startedAtMs
completedAtMs
```

Demo Buy stores those values as immutable **Scanner-generation provenance** together with the active Scanner interval. They describe when the analytical result was produced; they are not provider/exchange timestamps and do not become market authority.

`source_result_completed_at_ms` is the result/signal-ready time used only to explain the delay between a Scanner result and the later virtual-buy acceptance.

### captured_at_ms

`captured_at_ms` is a Node-generated local timestamp assigned inside the serialized Demo Buy writer operation. It marks the virtual-buy event in local product time.

It is not a provider timestamp, exchange timestamp or claim about real order execution.

Demo Buy future-horizon targets are measured from `captured_at_ms`. The baseline market row may have an earlier `collected_at_ms` because it is the latest authoritative observation available when the capture is serialized.

Derived timing diagnostics such as `captureLatencyMs = capturedAtMs - sourceResultCompletedAtMs` and `baselineAgeMs = capturedAtMs - baselineCollectedAtMs` are exposed only when the local timestamps make a non-negative value meaningful; they are not persisted market facts.

## 10. Validated snapshot/cycle shape

To minimize conversion risk, Market Flow US preserves the existing complete-cycle protocol shape.

One full U.S. response maps to exactly one collection segment:

```text
chunkIndex = 0
chunk_count = 1
```

Cycle:

```text
status = complete
startedAtMs
completedAtMs
durationMs
requested = recordCount
received = records.length
unique = canonical unique PaperId count
missing = 0
duplicates = 0
unexpected = 0
chunks = [single response timing/metadata entry]
securities = one item per row
```

Each security item contains:

```text
securityId
chunkIndex = 0
chunkReceivedAtMs
collectedAtMs
sourceMetadata
data = raw provider row
```

This preserves the proven Node protocol/persistence boundary without pretending the U.S. source is actually chunked.

## 11. Universe contract

A validated response also defines its canonical current membership.

Universe row metadata includes at least:

```text
security_id
is_current
universe_revision
first_seen_at_ms
last_seen_at_ms
symbol
paper_name_eng
paper_name_heb
exchange_name
raw_source
```

On the first valid response, browser replaces universe then commits that same snapshot.

On later responses:

- identical canonical membership -> reuse accepted universe revision;
- changed membership -> replace universe from the newly validated response, receive a new revision, then commit that same response.

A changed row order does not constitute a membership change.

## 12. Null / zero / missing contract

These remain distinct source facts:

```text
property missing
property present = null
property present = ""
property present = 0
```

Typed SQL projection may map wrong-type/missing values to SQL NULL, but `raw_data` preserves the original distinction.

UI formatting must never display numeric zero as missing.

For Demo Buy evaluation, absence of a qualifying future history row is also distinct from a future row whose `Price` is SQL NULL. Both produce an unavailable percentage, but the trusted read model preserves that distinction through an explicit unavailable reason.

A missing immutable baseline row is different again: it violates a persisted Demo Buy integrity invariant and must surface as an integrity/read error rather than `UNAVAILABLE`.

## 13. Dynamic count contract

Observed on 2026-10-04:

```text
recordCount = 4015
records.length = 4015
```

This proves only the tested screener result set at that time.

The product must not hard-code 4015 or claim this endpoint equals every U.S.-listed security.

The current acquisition request is bounded by `pageCount=5000`; Demo Buy therefore also bounds one capture to at most 5000 unique canonical security IDs. That is a product/transport bound, not a claim that the market permanently contains at most 5000 securities.

## 14. Schema-v4 Demo Buy persisted facts

Schema v4 preserves all schema-v3 market authority and adds two local analytical tables.

### `demo_buy_captures`

Persisted local facts:

```text
capture_id BIGINT PRIMARY KEY
captured_at_ms BIGINT NOT NULL
source_query_id VARCHAR NULL
source_query_name VARCHAR NULL
source_query_sql VARCHAR NOT NULL
source_interval_ms BIGINT NOT NULL
source_result_started_at_ms BIGINT NOT NULL
source_result_completed_at_ms BIGINT NOT NULL
source_result_row_count BIGINT NOT NULL
selection_mode VARCHAR NOT NULL
is_automatic BOOLEAN NOT NULL
top_x BIGINT NULL
```

`selection_mode` is exactly one of:

```text
manual
all
top_x
```

Rules:

- `capture_id > 0` for committed captures;
- `captured_at_ms`, source result times and row count are non-negative safe-integer values at the application boundary;
- `source_interval_ms > 0`;
- `top_x` is non-null only when `selection_mode = top_x` and is in `1..5000`;
- `is_automatic = true` is valid only for `all` or `top_x`;
- query/result timing fields are immutable Scanner-generation provenance, not market authority;
- source SQL is stored once per capture rather than per item;
- later query edits never mutate old capture provenance.

The schema should enforce simple shape/mode invariants with CHECK constraints where DuckDB supports them cleanly, while protocol/service validation remains the primary semantic boundary.

### `demo_buy_items`

Persisted local facts:

```text
capture_id BIGINT NOT NULL
result_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, result_rank)
```

`result_rank` is the original 1-based Scanner row position in that generation. It is not re-numbered after manual selection or duplicate reduction, so ranks such as `2, 7, 20` remain meaningful provenance.

The authoritative baseline relation is:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The Demo Buy item does **not** persist a copied baseline price, Symbol, name, future price, percentage, outcome or unavailable reason. Those values are read/derived from market history.

A physical foreign key is not required for Phase 1. The capture transaction resolves the baseline before insertion and trusted reads treat a missing semantic baseline as corruption. Do not add foreign-key/index complexity unless implementation evidence shows a concrete safety/performance benefit.

## 15. Schema-v3 → v4 migration integrity

A valid v3 database contains the proven U.S. authority tables plus `scanner_saved_queries` and **no Demo Buy tables**.

Migration contract:

```text
validate exact v3 prerequisites
→ reject suspicious partial Demo Buy table state
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info.schema_version = 4 and product_version
→ COMMIT
```

If a DB claims schema v3 while either Demo Buy table already exists, startup fails closed with an unsupported/corrupt-schema error. The implementation must not use `CREATE TABLE IF NOT EXISTS` to normalize a partial migration silently.

Migration failure at any injected phase must leave the original v3 database semantically usable as v3 with its market authority and saved queries intact.

Fresh databases bootstrap directly as v4. Existing valid v4 databases require both Demo Buy tables in addition to the established U.S. tables.

MarketScope v1/v2 remain incompatible and are rejected without mutation.

No new `history` index is required by the schema contract up front. The existing history authority remains unchanged; add an evaluation-oriented index only if representative Demo Buy workload evidence proves the direct bounded read model materially insufficient and a focused replan approves that schema change.

## 16. Demo Buy selection and capture semantics

Selection is defined against one immutable Scanner generation **before** duplicate reduction:

1. `manual` chooses the checked source rows;
2. `all` chooses every source row;
3. `top_x` chooses exactly the first X source rows in SQL result order;
4. every chosen row must contain a valid non-blank canonical identity string;
5. duplicate canonical IDs reduce to the first chosen occurrence in the browser;
6. each remaining item retains its original 1-based `result_rank`.

Therefore Top X never backfills from a later row after a duplicate. For example, if duplicate identities occur inside the first ten source rows, Top-10 may persist fewer than ten unique Demo Buy items.

The browser sends already-deduped ordered `{securityId, resultRank}` items. Node independently validates but does **not** silently dedupe malformed protocol input:

- 1..5000 items are required for an actual capture;
- every `securityId` is canonical/non-blank/bounded;
- every `resultRank` is positive, unique and within `source_result_row_count`;
- item ranks are strictly increasing in Scanner result order;
- every `securityId` is unique in the request;
- for `top_x`, every rank is `<= top_x`;
- invalid/duplicate/out-of-order input is rejected atomically.

At one serialized capture boundary:

1. validate request/provenance/mode bounds;
2. enqueue behind prior serialized writer work;
3. begin one transaction;
4. assign Node `captured_at_ms`;
5. resolve every selected `security_id` against authoritative `latest`;
6. require every selected security to resolve;
7. allocate a positive monotonic committed `capture_id`;
8. store each resolved latest row's `cycle_id` as `buy_cycle_id`;
9. persist one capture plus all items atomically;
10. commit.

Failure to resolve any selected security fails the entire capture. The same security may appear in multiple later captures because these are observations, not positions.

A zero-row automatic Scanner result is a browser-side no-op and creates no empty capture.

## 17. Demo Buy derived evaluation facts

Demo Buy evaluation is a trusted read model, not additional stored market authority.

Fixed Phase-1 horizons:

```text
10000
20000
30000
45000
60000
90000
120000
180000
300000
600000 milliseconds
```

For one item and horizon `H`:

```text
target_at_ms = captured_at_ms + H
```

The future observation is the first persisted market-history row satisfying:

```text
same security_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying authoritative row wins even when its `Price` is SQL NULL. The evaluator must not skip that row and cherry-pick a later non-null price.

The baseline value comes from the linked `(buy_cycle_id, security_id)` history row. That row must exist; its absence is a Demo Buy integrity failure rather than an unavailable horizon.

Derived values include:

```text
baselinePrice
baselineCollectedAtMs
baselineAgeMs
captureLatencyMs
futurePrice
observedAtMs
actualElapsedMs = observedAtMs - capturedAtMs
changePercent = ((futurePrice / baselinePrice) - 1) * 100
```

Derived outcome is:

```text
UP           when changePercent > 0
DOWN         when changePercent < 0
FLAT         when changePercent = 0
UNAVAILABLE  when changePercent is NULL
```

When outcome is `UNAVAILABLE`, one reason is exposed with this precedence:

```text
NO_FUTURE_OBSERVATION     no qualifying future row
BASELINE_PRICE_UNAVAILABLE baseline Price is NULL
BASELINE_PRICE_ZERO        baseline Price is zero
FUTURE_PRICE_UNAVAILABLE   matched future row exists but Price is NULL
```

A missing baseline row is never converted into one of these reasons; it remains an integrity error.

These prices/percentages/outcomes/reasons are application-derived analytical facts. They are not provider fields and are not persisted as market authority.

A bounded evaluated page must observe one transactionally consistent DuckDB read snapshot so baseline and all ten horizons for that page cannot be assembled from different writer commit points.

## 18. Daily lifecycle relation

Demo Buy observations belong to the same active-day evidence boundary as the `history` rows they reference.

At new-day reset:

- prior-day DB may be archived as one self-contained file;
- fresh active DB is schema v4;
- market authority tables start fresh;
- `demo_buy_captures` and `demo_buy_items` start empty;
- `scanner_saved_queries` are preserved/restored;
- no Demo Buy row is copied into a DB that does not contain its referenced history;
- horizon evaluation never joins into the new active-day DB; any prior-day horizon without a qualifying row before rollover remains unavailable in that prior day's self-contained evidence.

## 19. External facts reserved for live verification

Still empirical:

- safe sustained polling cadence;
- throttling/rate-limit behavior;
- session-expiry response;
- market-open versus closed behavior;
- pre-market/after-hours behavior;
- exact `rt=true` freshness semantics;
- exchange/consolidation coverage;
- exact `DailyVolume` unit;
- exact `PaperMarketCap` unit;
- exact `Price` semantics;
- exact timezone/session semantics of `TradeDateTime`;
- permanent maximum `pageCount`.

Until verified, code/docs must remain conservative.
