# Market Flow US Technical Spec

## 1. Architecture

Preserve the proven MarketScope architecture and extend it only at the existing Scanner/Viewer/Node boundaries:

```text
provider browser
  ├─ U.S. ScreenerHulPaging3 adapter
  ├─ complete-response validator
  ├─ Recorder
  ├─ Producer Bridge
  └─ Viewer
       ├─ Current
       ├─ Detail / History
       ├─ Scanner
       └─ Demo Buy
              │
              │ ws://127.0.0.1:8765
              ▼
localhost Node.js
  ├─ WebSocket protocol/service
  ├─ producer/session authority
  ├─ serialized writer
  ├─ native DuckDB
  ├─ trusted Viewer reads
  ├─ Scanner
  ├─ saved-query library
  ├─ Demo Buy capture persistence
  └─ Demo Buy evaluation reads
```

No cloud backend, no browser-owned production DB, no second transport, no Strategy Engine and no background horizon worker are introduced.

## 2. Runtime/tooling baseline

Keep:

```text
Node.js 24.x
native ESM
@duckdb/node-api 1.5.5-r.5
ws 8.21.3
esbuild
node:test
@playwright/test / Chromium
```

Do not change toolchain for Demo Buy without evidence.

## 3. Canonical identity

Canonical product identity is:

```text
securityId = String(PaperId)
```

but only after fail-closed U.S. source-type validation:

- string: accepted only when non-blank;
- number: accepted only when `Number.isSafeInteger`;
- object/array/boolean/non-safe numeric identities: rejected.

Browser acquisition and Node universe authority independently enforce that same boundary. Generic `String(object)` canonicalization is not permitted.

`Symbol`, provider row order, names and `PaperIdYatab` are never primary identity.

Demo Buy also uses only canonical `security_id`; it never guesses identity from `Symbol`.

## 4. Provider adapter boundary

The U.S. provider adapter owns:

- same-origin screener URL construction;
- fetch;
- parse;
- exact completeness validation;
- strict `PaperId` identity validation;
- one-segment cycle shaping;
- canonical membership extraction;
- safe source metadata.

It owns no persistence and no Demo Buy behavior.

## 5. Recorder behavior

Preserve Recorder lifecycle/scheduling semantics.

Configuration after U.S. conversion:

```text
snapshotIntervalMs
```

Initial demo/default interval:

```text
3000 ms
```

Live-safe cadence remains empirical and can change as configuration without schema redesign.

## 6. Protocol

Keep protocol version `1` unless implementation proves a concrete incompatibility.

Existing operations remain:

```text
client.hello
producer.session.start
producer.heartbeat
producer.universe.replace
producer.cycle.commit
producer.cycle.failed
producer.session.stop

viewer.current.get
viewer.status.get
viewer.security.get
viewer.history.page
viewer.support.snapshot

scanner.execute
scanner.queries.*
```

Add Viewer-role operations:

```text
demo.buy.capture
demo.buy.page
```

Do not create a second protocol or HTTP API for Demo Buy.

### `demo.buy.capture`

Payload shape:

```text
securityIds: ordered array of canonical strings
sourceQuery:
  queryId: string | null
  name: string | null
  sql: string
selectionMode: manual | all | top_x
isAutomatic: boolean
topX: integer | null
resultRowCount: non-negative safe integer
```

Validation rules:

- `securityIds` must contain 1..5000 entries before Node dedupe validation completes;
- every identity is a non-empty bounded string;
- duplicate IDs are reduced to first occurrence while preserving result order;
- after dedupe, 1..5000 unique IDs are required;
- `topX` is present only for `top_x`, with `1 <= topX <= 5000`;
- `isAutomatic=true` is valid only for `all` or `top_x`;
- source SQL is required and bounded by the existing inbound-message limit;
- query ID/name are provenance only and may be null.

Response returns at least:

```text
captureId
capturedAtMs
capturedItemCount
```

It does not echo market prices.

### `demo.buy.page`

Payload:

```text
cursor: string | null
```

Response returns a bounded page of evaluated Demo Buy item read models plus continuation metadata. The cursor is opaque to the browser and binds deterministic ordering.

Stable protocol errors must distinguish invalid Demo Buy input from generic DB failure. Absence of a future horizon is normal data, not an error.

## 7. DuckDB authority

Keep one Node-owned **active-day** DuckDB.

Final schema v4 tables:

```text
schema_info
sessions
universe
cycles
history
latest
scanner_saved_queries
demo_buy_captures
demo_buy_items
```

Keep:

- one serialized writer;
- separate trusted Viewer read connection;
- separate hardened Scanner connection;
- external-access/extension/secret hardening;
- transactional complete-cycle authority;
- append-only successful market history within the active trading day;
- full-table `latest` replacement inside the same successful market transaction.

Demo Buy uses the same writer for capture ordering but does not become market authority and does not mutate `history`/`latest`.

## 8. Schema version policy

Historical states:

```text
MarketScope v1/v2   incompatible Israeli semantics
Market Flow US v3   existing U.S. market authority
Market Flow US v4   v3 authority + Demo Buy analytical persistence
```

Policy:

- new default DB filename remains `data/market-flow-us.duckdb`;
- fresh Market Flow US DB bootstraps directly as v4;
- v1/v2 remain unsupported and are rejected without mutation;
- v3 is upgraded transactionally to v4;
- v3→v4 migration preserves all market authority and `scanner_saved_queries`;
- migration failure leaves the original v3 DB semantically usable as v3 and must not leave a partial v4 marker.

The additive migration is:

```text
BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info to 4
→ COMMIT
```

Implementation may use the smallest equivalent transactional DDL sequence supported by DuckDB, but observable all-or-nothing behavior is required.

## 9. Universe table

Logical columns remain:

```text
security_id VARCHAR PRIMARY KEY
is_current BOOLEAN
universe_revision BIGINT
first_seen_at_ms BIGINT
last_seen_at_ms BIGINT
Symbol VARCHAR NULL
PaperNameEng VARCHAR NULL
PaperNameHeb VARCHAR NULL
ExchangeName VARCHAR NULL
raw_source JSON NOT NULL
```

Universe replace retains all-seen rows and toggles `is_current` as already proven.

## 10. Cycle table

Keep the current cycle-authority shape.

One U.S. full response is represented as one segment:

```text
chunk_count = 1
chunks_json = JSON array with one response timing/metadata record
```

Failed cycles continue to record bounded counters/phase/error metadata without changing latest/history authority.

## 11. `history` / `latest`

Common columns remain the proven U.S. projection:

```text
cycle_id BIGINT
session_id VARCHAR
universe_revision BIGINT
security_id VARCHAR
chunk_index INTEGER
cycle_started_at_ms BIGINT
chunk_received_at_ms BIGINT
collected_at_ms BIGINT
source_metadata_json JSON NULL

Symbol VARCHAR NULL
PaperNameEng VARCHAR NULL
PaperNameHeb VARCHAR NULL
ExchangeName VARCHAR NULL
TradeDateTime VARCHAR NULL
CountryName VARCHAR NULL
CountryNameEng VARCHAR NULL

Price DOUBLE NULL
ChangePercent DOUBLE NULL
DailyHigh DOUBLE NULL
DailyLow DOUBLE NULL
YearHigh DOUBLE NULL
YearLow DOUBLE NULL
DailyVolume DOUBLE NULL
BeginYearChangePercent DOUBLE NULL
Month12ChangePercent DOUBLE NULL
Month36ChangePercent DOUBLE NULL
AskRate DOUBLE NULL
BidRate DOUBLE NULL
YesterdayRate DOUBLE NULL
PaperMarketCap DOUBLE NULL
PaperIdYatab DOUBLE NULL
CountryId DOUBLE NULL
PaperType DOUBLE NULL
ESGRatingId DOUBLE NULL
ESGScope DOUBLE NULL

raw_data JSON NOT NULL
```

Keys:

```text
history PRIMARY KEY (cycle_id, security_id)
latest PRIMARY KEY (security_id)
```

No temporal predecessor-link columns are added.

## 12. Market persistence transaction

Successful market commit remains:

```text
validate session/revision/exact membership
→ BEGIN
→ allocate cycle_id
→ insert cycle
→ persist every history row
→ replace latest from that committed cycle
→ update session success state
→ COMMIT
```

Fault at any point rolls back all authority changes.

## 13. Trusted market reads

### Current

Read all `latest` rows plus current-universe metadata, ordered deterministically by identity before browser-side sorting.

### Security

Resolve canonical `security_id` across current universe/history and return current row if available.

### History

500-row keyset pagination ordered:

```text
collected_at_ms DESC
cycle_id DESC
```

Cursor remains bound to the requested security.

## 14. Scanner

Keep the existing security design:

1. extract exactly one DuckDB statement;
2. prepare;
3. require `StatementType.SELECT`;
4. require zero parameters;
5. reject dynamic query helpers/side-effect functions;
6. execute on hardened Scanner connection;
7. JSON-safe encode exact result metadata/rows.

No hidden rank/filter/sort/limit is added by Demo Buy.

A Scanner result generation is Demo-Buy-capable only if its columns contain exactly one recognized canonical identity column named `securityId` or `security_id`.

## 15. Staged candidate built-in

The built-in remains ordinary SQL over `latest` and `history` with exact nearest-prior semantics.

Initial ages:

```text
10, 20, 30, 45, 60, 90, 120 seconds
```

Initial predicate:

```text
latest.Price > prior.Price
```

Prior match:

```text
same security_id
prior collected_at_ms <= target anchor
highest collected_at_ms
then highest cycle_id tie-break
```

The SQL computes contiguous `stage_reached`, exposes `security_id AS securityId`, and orders by explicit SQL tie-breakers.

New/materially changed SQL must pass the mandatory static SQL preflight before first execution.

## 16. `demo_buy_captures`

Logical schema:

```text
capture_id BIGINT PRIMARY KEY
captured_at_ms BIGINT NOT NULL
source_query_id VARCHAR NULL
source_query_name VARCHAR NULL
source_query_sql VARCHAR NOT NULL
selection_mode VARCHAR NOT NULL
is_automatic BOOLEAN NOT NULL
top_x BIGINT NULL
result_row_count BIGINT NOT NULL
```

Rules:

- `selection_mode ∈ {manual, all, top_x}`;
- `top_x` is non-null only for `top_x`;
- automatic mode is allowed only for `all`/`top_x`;
- source query fields are immutable provenance snapshots;
- no market `Price` or future-horizon values are stored here.

## 17. `demo_buy_items`

Logical schema:

```text
capture_id BIGINT NOT NULL
selection_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, selection_rank)
```

`selection_rank` preserves first-occurrence Scanner result ordering inside the capture.

The semantic baseline reference is:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

A physical foreign key is not required unless implementation evidence shows it improves safety without harming the proven bulk-write path; semantic resolution and tests are mandatory.

No copied baseline market columns and no future-horizon columns are stored.

## 18. Demo Buy capture authority

Create a dedicated small Node persistence component using the existing serialized writer.

Capture execution:

```text
validate request
→ dedupe IDs preserving first rank
→ enqueue on serialized writer
→ BEGIN
→ allocate monotonic capture_id
→ captured_at_ms = Node clock inside serialized operation
→ resolve every ID from authoritative latest
→ require all to resolve
→ insert capture
→ insert ordered items using latest.cycle_id as buy_cycle_id
→ COMMIT
```

Writer ordering defines “buy now” precisely:

```text
market cycle commits first → capture may reference that cycle
capture commits first      → capture references the prior latest cycle
```

If any ID is absent from `latest`, any invariant fails, or persistence fails, rollback the complete Demo Buy capture.

Demo Buy failure does not poison the writer tail, Scanner scheduler or future captures.

## 19. Demo Buy evaluation/read model

Create a trusted Node read component; do not calculate business results in the browser.

Read ordering:

```text
capture_id DESC
selection_rank ASC
```

Use bounded keyset pagination; default page size reuses the established 500-item Viewer convention unless measured evidence requires a smaller bound.

For each item:

1. join the exact baseline `history` row by `(buy_cycle_id, security_id)`;
2. for each fixed horizon find the first same-security history row at or after `captured_at_ms + horizon`;
3. return the baseline and derived horizon model.

Fixed horizons in milliseconds:

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
600000
```

Future match:

```text
same security_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

Derived fields:

```text
baselineCollectedAtMs
baselinePrice
observedAtMs
actualElapsedMs = observedAtMs - capturedAtMs
price
changePercent = ((price / baselinePrice) - 1) * 100
outcome
```

Outcome:

```text
UP           changePercent > 0
DOWN         changePercent < 0
FLAT         changePercent = 0
UNAVAILABLE  changePercent is null
```

`changePercent` is null when no future row exists, baseline `Price` is null/zero, or future `Price` is null.

The read model recomputes from persisted `history` on each refresh/page request. It never writes derived values back to Demo Buy tables.

The implementation should use set-wise/lateral/ASOF-capable SQL appropriate to DuckDB rather than N×10 independent browser calls. Exact query shape remains an implementation choice after mandatory static preflight and tiny-fixture correctness proof.

## 20. Browser Demo Buy workflow

### Scanner-side capture state

Each successful Scanner generation has immutable provenance:

```text
queryId
name
sql
result columns
result rows
```

Editing/selecting/saving another draft does not rewrite provenance of an already-produced generation.

Manual controls:

```text
row checkboxes
Demo Buy selected
Demo Buy all
Top X + Demo Buy Top X
```

Automatic state is Viewer-session-only:

```text
off
auto all
auto Top X
```

Automatic capture executes once per successful Scanner result generation. Zero selected rows are a no-op.

Auto requests must be serialized/bounded client-side so interval ticks cannot create uncontrolled overlapping capture requests. Failure is shown and later generations may still capture.

Selection state belongs to the exact visible generation and is cleared/rebuilt when a new result generation replaces it.

### Demo Buy surface

Add a third top-level Viewer destination beside Current and Scanner.

Visible data includes:

```text
source label
capture time
Symbol / display name
securityId
baseline collection time
baseline Price
10s..10m Price / % / outcome
```

Direction is conveyed by text/symbol as well as any optional styling; color alone is insufficient.

Unavailable horizons use the existing missing-value convention plus `UNAVAILABLE` state.

The table may scroll horizontally. It supports refresh and bounded Load more/keyset paging. Source SQL can be displayed on demand rather than duplicated in every visible row.

Navigating away from Scanner does not implicitly stop its scheduler or automatic Demo Buy mode.

## 21. Diagnostics

Keep the existing tracker/checkpoint architecture.

Stable concepts include:

```text
browser runtime
service hello
provider snapshot
producer universe
cycle commit/ACK
database readiness
viewer reads
scanner execution
demo_buy.capture
demo_buy.read
demo
live verification
```

Support Snapshot remains sanitized and bounded. It may expose Demo Buy operational counts/checkpoint status but must not dump stored query SQL or raw authenticated provider material.

## 22. Fake Market and synthetic generator

Fake Market serves:

- normal built Market Flow US runtime;
- `ScreenerHulPaging3`;
- deterministic stateful U.S. rows.

Fake Market and workload tooling share one deterministic synthetic generator/profile boundary supporting at least:

```text
universe size
cycle/history count or logical day shape
logical cadence/timestamps
static or moving value pattern
membership-change schedule
failure/recovery schedule
reproducible seed
```

For Demo Buy, deterministic profiles must also be able to create future price paths that produce:

```text
UP
DOWN
FLAT
UNAVAILABLE
```

and delayed observations whose actual elapsed time is greater than the nominal horizon.

## 23. Build and local files

Target outputs remain:

```text
dist/browser/market-flow-us.runtime.js
dist/browser/market-flow-us.bookmarklet.txt
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

Local files:

```text
production active DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
live DB: data/live-verification.duckdb
Windows launcher: START_MARKET_FLOW_US.cmd
```

## 24. Workload and performance profiles

Hosted CI is correctness-first and uses bounded profiles:

- extensive unit/service/browser correctness;
- small multi-cycle history/Scanner/Demo Buy profile;
- at least one approximately-4096-security width sanity cycle/few cycles;
- timing recorded diagnostically only.

Heavy target-machine profile remains:

```text
4096 synthetic securities
180 end-to-end cycles
737280 history rows
```

Isolated profiles use the narrowest useful layer:

```text
persistence → generated validated cycles → writer/DuckDB
reads/Scanner/Demo Buy → directly seeded day-bounded DB → trusted reads/Scanner
end-to-end → Fake Market → browser → WebSocket/service → DuckDB
```

Demo Buy performance proof uses a bounded realistic capture/item count over day-bounded history. Do not generate a giant cross-product merely to benchmark ten horizons.

No temporal precompute/materialized horizon schema is added unless measured intended-use evidence proves the direct read model materially insufficient.

## 25. Security

Preserve:

- loopback-only host;
- exact allowed Origin;
- no wildcard Origin;
- no credentials/session material in Node payloads or repo;
- no external DuckDB access/extensions/secrets;
- no raw authenticated dumps in diagnostics/tests;
- synthetic/sanitized fixtures only.

Demo Buy provenance contains locally authored Scanner SQL, never provider credentials/session data.

## 26. Live verification boundary

Live verification keeps two external facts separate:

### Base authenticated boundary

At least 20 consecutive complete cycles spanning at least 60 seconds at candidate cadence. Every cycle validates and receives COMMIT ACK; final Current/History/Scanner authority is checked before clean stop. Static values are valid for this compatibility fact.

### Market-open movement evidence

After base PASS, bounded analysis considers only persisted provider market/freshness fields:

```text
Price
ChangePercent
BidRate
AskRate
DailyVolume
TradeDateTime
```

Local `collected_at_ms` and Demo Buy outcomes are not substitutes for provider movement evidence.

No observed provider change → movement `PENDING`.
Observed change reflected through trusted Current/History → movement `PASS`.
Detected change without reflection proof → movement `FAIL`.

The final target-machine bundle separately proves one deterministic local Demo Buy journey on the same final SHA.

## 27. Daily active-DB lifecycle

The active authority covers one trading day.

New-day operation:

```text
stop producer/service cleanly
→ optionally archive prior-day DB/data
→ create/reset fresh schema-v4 active authority
→ preserve scanner_saved_queries
→ start with empty demo_buy_captures/demo_buy_items
→ start the new trading day
```

Requirements:

- no indefinite prior-day market/Demo-Buy accumulation in active DB;
- an archived prior-day DB remains self-contained with its history and Demo Buy references;
- saved queries survive reset;
- archive/reset never occurs while active writer owns the DB;
- failure leaves either prior DB or a valid fresh DB recoverable;
- no cross-day Demo Buy warehouse is introduced in Phase 1.

## 28. Phase-1 non-goals

Do not implement:

```text
real broker orders
manual buy price
fill simulator
bid/ask execution model
fees/slippage
sell automation
portfolio/risk engine
trade quantity accounting
volume/liquidity sellability analysis
aggregate strategy scorecards
multi-day active analytics
Strategy Engine
background horizon materialization
```

Phase 2 may revisit liquidity/volume/fillability only after Phase 1 is complete and verified.
