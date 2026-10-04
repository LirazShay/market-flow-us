# Market Flow US Data Contract

## 1. Ownership and evidence level

This document owns the provider/data truth used by Market Flow US.

The Bank Leumi U.S. endpoint is empirically observed, not an official public API contract. Every field is therefore either:

- **proven shape** — observed and reproduced;
- **source-named semantic** — useful but exact external meaning may remain empirical;
- **unknown** — must not be silently upgraded into a stronger claim.

Raw provider rows are retained so later discoveries do not destroy information.

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
8. every row has non-null/non-empty `PaperId`;
9. `String(PaperId)` is unique across the response.
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

Canonical product identity:

```text
securityId = String(PaperId)
```

Do not key history/current by:

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

## 9. Source semantics that remain intentionally unnormalized

### Price

Persist as source column `Price`.

Do not rename it to `Last` or `LastPrice` until provider/live evidence establishes that stronger semantic.

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
- changed membership -> replace universe from the newly validated response, receive new revision, then commit that same response.

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

## 13. Dynamic count contract

Observed on 2026-10-04:

```text
recordCount = 4015
records.length = 4015
```

This proves only the tested screener result set at that time.

The product must not hard-code 4015 or claim this endpoint equals every U.S.-listed security.

## 14. External facts reserved for live verification

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
