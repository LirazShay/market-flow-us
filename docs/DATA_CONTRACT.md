# Market Flow US Data Contract

## 1. Ownership

This document owns current provider/data truth and the distinction between:

```text
provider/market authority facts
Demo Buy persisted local facts
Demo Buy derived read-model facts
AI Investigation derivative export evidence
```

Historical migration evidence remains in the dedicated U.S. evidence/audit documents. This file describes the current product contract.

The Bank Leumi U.S. source is empirically observed, not an official immutable API contract. Unknown provider semantics must remain unknown rather than being strengthened by naming assumptions.

## 2. Provider source

Current endpoint:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

The request runs from the already-authenticated provider browser context using a relative same-origin URL. Market Flow US never embeds credentials, cookies, tokens or account identifiers.

The currently proven request uses the U.S. screener filters and:

```text
page=1
pageCount=5000
orderFieldName=DailyVolume
orderDir=DESC
rt=true
```

`pageCount=5000` is a current practical envelope, not a permanent market-size guarantee.

A response becomes authoritative only when HTTP/JSON/envelope validation succeeds, `recordCount` is a positive safe integer, `records.length === recordCount`, every row has a valid `PaperId`, canonical IDs are unique and any present success code is valid. Incomplete or ambiguous responses fail closed.

## 3. Canonical security identity

Canonical identity is:

```text
securityId = String(PaperId)
```

but only after source-type validation:

- non-blank string: accepted;
- JavaScript safe integer: accepted;
- object/array/boolean/non-safe numeric/blank identity: rejected.

The browser and Node authority independently enforce this boundary.

Never key authority or Demo Buy by:

```text
row index
Id
Symbol
PaperIdYatab
display name
```

`Symbol` and names are display/query metadata only.

## 4. Source-shaped U.S. projection

Every successful market row keeps `raw_data JSON` and promotes the current typed projection.

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

```text
finite JS number → DOUBLE
string            → VARCHAR
wrong type/missing/non-finite → SQL NULL
raw_data          → preserve original source value/property presence
```

Do not rename `Price` to a stronger semantic such as `LastPrice`; do not assert exact units/timezones for source-named fields until live evidence proves them.

## 5. Time fields and authority

The product intentionally distinguishes:

```text
TradeDateTime                    source-delivered string
collected_at_ms                  local market-row collection timestamp
Scanner startedAtMs/completedAtMs local Scanner execution diagnostics
captured_at_ms                   local Demo Buy acceptance timestamp inside writer work
cycle_id / writer order          market-authority ordering
```

Wall-clock timestamps are diagnostics. They do not override serialized writer/cycle ordering when clocks regress or disagree.

Derived timing diagnostics are returned only when non-negative:

```text
scannerDurationMs
captureLatencyMs
baselineAgeMs
```

Otherwise the value is `null` and a bounded timing-anomaly indicator explains which diagnostic could not be trusted. Raw timestamps remain unchanged.

## 6. Market cycle authority

One validated U.S. full response maps to one complete producer segment/cycle. Successful persistence remains transactional:

```text
validate session/revision/exact membership
→ BEGIN
→ allocate cycle_id
→ insert cycle
→ append every row to history
→ replace latest from that committed cycle
→ update session state
→ COMMIT
```

Keys:

```text
history PRIMARY KEY (cycle_id, security_id)
latest  PRIMARY KEY (security_id)
```

Failed/incomplete cycles never alter authoritative `history`/`latest`.

## 7. Null / zero / missing

These are distinct source facts:

```text
missing property
null
empty string
numeric 0
```

Typed projection may map invalid/missing values to SQL NULL, but `raw_data` preserves original distinction. UI must never render numeric zero as missing.

## 8. Schema versions

Historical/current meanings:

```text
MarketScope v1/v2  incompatible Israeli semantics
Market Flow US v3  proven U.S. market authority + scanner_saved_queries
Market Flow US v4  v3 authority + Demo Buy / AI-investigation provenance
```

Fresh Market Flow US DBs bootstrap directly as v4 after this feature ships.

Valid v3 may migrate transactionally to v4 only when neither Demo Buy table already exists. A DB marked v3 with partial Demo Buy structures is suspicious/corrupt and fails closed; migration never silently resumes through `IF NOT EXISTS`.

Migration failure leaves the original v3 authority semantically usable as v3.

No new `history` index is part of the initial v4 contract. Add one only after representative workload demonstrates a concrete need and planning is reopened for that change.

## 9. Schema-v4 Demo Buy persisted facts

Schema v4 adds exactly two Demo Buy tables.

### `demo_buy_captures`

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
source_result_context_json JSON NOT NULL
selection_mode VARCHAR NOT NULL
is_automatic BOOLEAN NOT NULL
top_x BIGINT NULL
```

Rules:

- `capture_id > 0` for committed captures;
- timestamp/count inputs are non-negative safe integers at the application boundary;
- `source_interval_ms > 0`;
- `selection_mode ∈ {manual, all, top_x}`;
- `top_x` exists only for `top_x` and is `1..5000`;
- automatic mode is valid only for `all`/`top_x`;
- source query/timing/context fields are immutable Scanner-generation provenance;
- source SQL is stored once per capture;
- no baseline Price or future outcome is copied here.

### `demo_buy_items`

```text
capture_id BIGINT NOT NULL
result_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, result_rank)
```

`result_rank` is the original 1-based Scanner result position, not a dense selection rank.

The baseline relation is:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

A missing linked baseline after successful capture is corruption/integrity failure, not an ordinary unavailable outcome.

No copied baseline/future Price, percentage, outcome or unavailable-reason fields are persisted.

## 10. Bounded Scanner comparison provenance

`source_result_context_json` freezes context from the exact successful Scanner generation; it is never reconstructed by re-running SQL later.

Concrete bounds are owned by `docs/DEMO_BUY_PROTOCOL_LIMITS.md` and are currently:

```text
first source rows                 <= 50
retained columns                  <= 64 total
canonical identity column         mandatory even when beyond source column 64
textual/serialized cell           <= 128 UTF-8 bytes after deterministic clipping
serialized context JSON           <= 256 KiB UTF-8
exact source SQL                  <= 1 MiB UTF-8 for Demo-Buy-capable generation
capture unique items              <= 5000
```

Context preserves:

```text
original row order
original 1-based resultRank
original retained-column index/name
omitted row/column metadata
explicit cell truncation/encoding metadata
```

Canonical identity values are never clipped into ambiguity.

For every captured item with `resultRank <= 50`, Node requires the frozen context row at that exact rank to exist and to contain the same canonical identity. A mismatch fails the complete capture before commit.

A target with rank > 50 is valid but later AI investigation reports `targetInScannerContext=false`.

## 11. Demo Buy selection/capture facts

Selection is defined before duplicate reduction:

```text
manual → checked source rows
all    → all source rows
top_x  → exactly first X source rows
```

Every chosen row must have a valid canonical identity. Duplicate IDs reduce to the first chosen occurrence in the browser; retained items keep original `resultRank`. Top X never backfills from rows after X.

Node accepts only already-deduped ordered `{securityId,resultRank}` items and rejects duplicate/malformed/out-of-range protocol input rather than repairing it silently.

Inside the shared serialized writer:

```text
validate bounded request/context
→ BEGIN
→ captured_at_ms = Node clock
→ resolve every security from current authoritative latest
→ require every security to resolve
→ allocate capture_id
→ persist capture
→ persist each latest.cycle_id as buy_cycle_id
→ COMMIT
```

Failure is all-or-nothing.

## 12. Capture authority watermark

For one item, `buy_cycle_id` is both the exact baseline cycle and the market-authority watermark available at capture time.

Prediction-time authoritative target history:

```text
same security_id
AND cycle_id <= buy_cycle_id
```

Post-capture authoritative history:

```text
same security_id
AND cycle_id > buy_cycle_id
```

This watermark is required in addition to timestamps. It prevents a market observation collected earlier but committed only after the Demo Buy from leaking backward into prediction-time evidence.

## 13. Derived Demo Buy evaluation

Fixed horizons:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m, 10m
```

For horizon `H`:

```text
target_at_ms = captured_at_ms + H
```

Future observation:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying post-watermark row wins even if its `Price` is NULL; never skip it to cherry-pick a later priced row.

Percentage:

```text
((futurePrice / baselinePrice) - 1) * 100
```

Outcome:

```text
UP           changePercent > 0
DOWN         changePercent < 0
FLAT         changePercent = 0
UNAVAILABLE  changePercent is NULL
```

Unavailable-reason precedence:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

The read model also exposes target/observed/elapsed times. A bounded page is evaluated from one transactionally consistent DuckDB read snapshot. Derived values are never persisted as market authority.

## 14. AI Investigation evidence partition

An investigation target is:

```text
capture_id + security_id
```

Prediction-time history is limited by both watermark and time window:

```text
same security_id
AND cycle_id <= buy_cycle_id
AND captured_at_ms - 30m <= collected_at_ms
AND collected_at_ms <= captured_at_ms
```

Outcome history is:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms
AND collected_at_ms <= captured_at_ms + 10m
```

`BASELINE.json` is the exact linked baseline row. `OUTCOME.json` reuses the trusted Demo Buy evaluator.

`targetInScannerContext=true` only when the exact target row is present in retained context. A missing expected Top-50 target row is integrity failure; rank > 50 remains valid with `false` and no fabricated peer reconstruction.

## 15. Partial versus complete investigation evidence

Define:

```text
postWindowEndMs = captured_at_ms + 10m
evidenceWatermarkMs = MAX(history.collected_at_ms)
  from committed cycles after the capture watermark in the opened DB
```

Then:

```text
COMPLETE_OUTCOME when evidenceWatermarkMs >= postWindowEndMs
PARTIAL_OUTCOME  otherwise
```

Wall-clock passage alone does not make evidence complete. An archived day that never persisted evidence through the boundary remains honestly partial.

Complete evidence does not guarantee every target horizon has a usable Price and does not imply fillability/profitability.

## 16. AI Investigation export facts

Generated packs are derivative local artifacts, never DB authority.

They may contain exact local Scanner SQL/history evidence but must not contain credentials, cookies, auth headers, account identifiers or raw authenticated HTTP/session dumps.

The controlled export root is repository-relative and ignored:

```text
exports/ai-investigations/
```

Viewer-visible/export-manifest paths are relative to this product root, not machine-specific absolute user paths.

The browser cannot supply an output path.

## 17. Active-day lifecycle

The active DB represents one trading day.

New-day accepts either:

```text
valid v3 source DB
valid v4 source DB
```

and rejects v1/v2, running producer sessions, missing required structures and suspicious partial/corrupt v3/v4 states.

Flow:

```text
inspect source without mutation
→ read scanner_saved_queries
→ build fresh schema-v4 DB
→ seed saved queries transactionally
→ optionally archive/move original source unchanged
→ atomically install fresh v4 DB
```

Market authority and Demo Buy captures/items/context do not cross into the fresh active DB. A v4 archive remains self-contained with its history and Demo Buy evidence; a v3 archive remains valid historical pre-feature authority.

Generated AI packs remain independent local files.

## 18. External facts reserved for live verification

Still empirical and not upgraded by Demo Buy:

```text
safe sustained polling cadence
provider throttling/session-expiry behavior
market-open/closed/pre/after-hours behavior
rt=true freshness meaning
exchange/consolidation coverage
exact Price semantics
DailyVolume/PaperMarketCap units
TradeDateTime timezone/session semantics
permanent pageCount maximum
```

Code/docs must remain conservative until live evidence proves stronger semantics.
