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

Existing operations remain unchanged. Add Viewer-role operations:

```text
demo.buy.capture
demo.buy.page
demo.buy.capture.get
```

Do not create a second protocol or HTTP API for Demo Buy.

### `demo.buy.capture`

Payload:

```text
items: [
  { securityId: string, resultRank: positive integer }
]
sourceQuery:
  queryId: string | null
  name: string | null
  sql: string
  intervalMs: positive safe integer
sourceResult:
  startedAtMs: non-negative safe integer
  completedAtMs: non-negative safe integer
  rowCount: non-negative safe integer
selectionMode: manual | all | top_x
isAutomatic: boolean
topX: integer | null
```

Validation rules:

- exact payload/object keys are enforced;
- `items.length` is `1..5000`;
- every identity is a non-empty bounded canonical string;
- `securityId` values are unique; duplicate payload IDs are rejected, never repaired;
- `resultRank` values are positive, unique, strictly increasing and `<= sourceResult.rowCount`;
- for `top_x`, every `resultRank <= topX`;
- `topX` is present only for `top_x`, with `1 <= topX <= 5000`;
- `isAutomatic=true` is valid only for `all` or `top_x`;
- `sourceQuery.intervalMs > 0`;
- source SQL is exact activated SQL and remains bounded by the existing inbound-message boundary;
- query ID/name are provenance only and may be null;
- no price field exists in the contract.

The browser is responsible for choosing source rows first, then reducing duplicate canonical IDs to first occurrence while retaining each remaining row's original 1-based `resultRank`. Node validates the already-canonical request and does not silently change its meaning.

Response returns only capture authority facts:

```text
captureId
capturedAtMs
capturedItemCount
```

### `demo.buy.page`

Payload:

```text
cursor: string | null
```

The server owns a fixed Phase-1 page size of 50 evaluated items. The cursor is opaque and binds the last `(capture_id, result_rank)` in ordering:

```text
capture_id DESC
result_rank ASC
```

One page response contains compact capture metadata, baseline data and all ten derived horizons, but does not repeat source SQL per item.

### `demo.buy.capture.get`

Payload:

```text
captureId: positive safe integer
```

Returns one immutable capture header/provenance record including exact source SQL, source query identity/label, Scanner interval/result times/count, selection mode, automatic marker, Top-X value and committed item count.

This powers the Viewer details affordance without bloating every page row.

### Errors

Stable protocol semantics distinguish at least:

```text
invalid Demo Buy request
Demo Buy integrity violation
generic DB/read failure
```

Exact error-code names must follow the repository's existing constant style. Missing future horizons are normal data, not errors.

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

- fresh Market Flow US DB bootstraps directly as v4;
- v1/v2 remain unsupported and are rejected without mutation;
- valid v3 is upgraded transactionally to v4;
- valid v3 must contain neither Demo Buy table before migration;
- if a DB claims v3 while either Demo Buy table already exists, startup fails closed as suspicious partial/corrupt state;
- v3→v4 migration preserves all market authority and `scanner_saved_queries`;
- migration failure leaves the original v3 DB semantically usable as v3 and must not leave a partial accepted v4 marker;
- valid v4 requires both Demo Buy tables plus all existing U.S. required tables.

Migration:

```text
validate v3 prerequisites
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info schema_version=4 and product_version
→ COMMIT
```

Do not use `CREATE TABLE IF NOT EXISTS` to normalize an unexpected partial migration silently.

Add the smallest construction-only migration fault seam needed to prove rollback at multiple phases, mirroring the repository's existing persistence/migration fault-test style.

No new history index is required initially. The existing authority schema remains unchanged until representative Demo Buy workload proves a concrete bottleneck and a focused replan justifies a schema optimization.

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

Common columns remain the proven U.S. projection documented in DATA_CONTRACT, with keys:

```text
history PRIMARY KEY (cycle_id, security_id)
latest PRIMARY KEY (security_id)
```

No predecessor-link, materialized horizon or Demo Buy result columns are added.

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

Each successful generation already carries Node result timing. Browser generation state freezes:

```text
queryId
name
exact SQL
active intervalMs
startedAtMs
completedAtMs
rowCount
columns
rows
```

This generation snapshot is immutable even if the draft/library selection changes later.

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

New/materially changed SQL must pass mandatory static SQL preflight before first execution.

## 16. `demo_buy_captures`

Logical schema:

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

Rules:

- committed `capture_id > 0`;
- time/count values are non-negative at the application boundary;
- `source_interval_ms > 0`;
- `selection_mode ∈ {manual, all, top_x}`;
- `top_x` is non-null only for `top_x` and is `1..5000`;
- automatic mode is valid only for `all`/`top_x`;
- source fields are immutable generation provenance;
- source SQL is stored once per capture;
- no market Price or derived future-horizon value is stored here.

Use simple DuckDB CHECK constraints for straightforward row-shape/mode invariants where they add safety without complex schema machinery. Service validation remains authoritative for cross-field/request semantics.

## 17. `demo_buy_items`

Logical schema:

```text
capture_id BIGINT NOT NULL
result_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, result_rank)
```

`result_rank` is the original 1-based row position from the Scanner generation. Manual selections may therefore retain gaps.

Baseline relation:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

A physical foreign key is not required in Phase 1. Capture resolves every baseline before insertion and trusted reads treat a missing semantic link as corruption. Do not introduce foreign-key/index complexity without evidence.

No copied baseline columns and no future-horizon columns are stored.

## 18. Demo Buy capture authority

Create one small Node persistence component using the existing serialized writer.

The browser chooses rows before dedupe:

```text
manual → checked source rows
all    → every source row
top_x  → exactly first X source rows
```

Every chosen row must have a valid identity. The browser reduces duplicate canonical IDs to first chosen occurrence, preserving each remaining row's original `resultRank`. `Top X` never backfills beyond X after a duplicate.

Node receives already-deduped items and validates without silently rewriting them:

```text
1..5000 items
unique securityId
unique strictly increasing resultRank
resultRank <= sourceResult.rowCount
for top_x: resultRank <= topX
valid mode/automatic/topX/provenance
```

Capture execution:

```text
validate request
→ enqueue on serialized writer
→ BEGIN
→ captured_at_ms = Node clock inside serialized operation
→ resolve every ID from authoritative latest
→ require all to resolve
→ allocate positive monotonic committed capture_id
→ insert one capture
→ insert items using latest.cycle_id as buy_cycle_id
→ COMMIT
```

Writer ordering defines “buy now” precisely:

```text
market cycle commits first → capture may reference that cycle
capture commits first      → capture references the prior latest cycle
```

If any ID is absent from `latest`, any invariant fails, or persistence fails, rollback the complete Demo Buy capture.

Demo Buy failure must not poison the writer tail, Scanner scheduler or later captures.

## 19. Demo Buy evaluation/read model

Create a trusted Node read component; do not calculate analytical results in the browser.

Read ordering:

```text
capture_id DESC
result_rank ASC
```

Phase-1 page size is fixed at **50 items** because each item carries ten horizon result objects and is materially wider than a normal History row.

The opaque cursor binds `(capture_id, result_rank)`. Continuation excludes later newly inserted captures, so an existing pagination walk has no duplicate/gap caused by automatic captures arriving between requests. Refresh from page one is what reveals newer captures.

### Snapshot consistency

One `demo.buy.page` must obtain its 50 items, baseline rows and all ten horizons from **one transactionally consistent DuckDB read snapshot**.

Prefer one set-wise `runAndReadAll` SQL statement/CTE on the existing Viewer read connection. Do not implement this as N×10 separate timed reads. Do not open a multi-statement `BEGIN` transaction on the shared Viewer read connection merely to obtain consistency, because other Viewer requests may use that connection; a single statement is the safe default boundary.

For each item:

1. join the exact baseline `history` row by `(buy_cycle_id, security_id)`; missing baseline -> stable Demo Buy integrity error;
2. for each fixed horizon find the first same-security history row at or after `captured_at_ms + horizon`;
3. use that first qualifying row even if its Price is NULL; never skip it for a later non-null value;
4. return baseline/timing/provenance summary plus derived horizon model.

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

Derived horizon fields:

```text
horizonMs
targetAtMs
observedAtMs
actualElapsedMs
price
changePercent
outcome
unavailableReason
```

Outcome:

```text
UP           changePercent > 0
DOWN         changePercent < 0
FLAT         changePercent = 0
UNAVAILABLE  changePercent is null
```

Unavailable reason precedence:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

A missing baseline row is an integrity error and never an unavailable reason.

Compact item metadata includes source query ID/name and Scanner timing but **not source SQL**. Exact SQL is returned only through `demo.buy.capture.get`.

The read model recomputes from persisted `history` on every refresh/page request and never writes derived values back to Demo Buy tables.

## 20. Browser Demo Buy workflow

### Scanner-side capture state

Each successful Scanner generation freezes exact query/result provenance before later draft changes.

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

Selection semantics:

- invalid recognized identity rows are visibly non-selectable;
- Selected/All/Top-X choose source rows first;
- Top-X means exactly first X source rows;
- chosen rows containing an invalid identity make All/Top-X/auto fail visibly rather than silently changing meaning;
- duplicate canonical IDs reduce only after selection, preserving first occurrence and original result rank;
- All/auto-All with more than 5000 unique IDs is refused visibly, never truncated;
- zero selected IDs do not create an empty capture.

Use one Viewer-session Demo Buy capture slot shared by manual and automatic actions:

```text
slot free + manual action → submit once, disable capture actions until response
slot free + auto generation → submit once
slot busy + auto generation → visibly skip, never enqueue/replay
slot busy + manual action → controls remain disabled/busy
success/failure → release slot
```

This prevents accidental manual double-submit and unbounded auto queues while leaving Scanner scheduling independent.

### Demo Buy surface

Add a third top-level Viewer destination beside Current and Scanner.

Visible compact data includes:

```text
source label
capture time
signal/result-completed timing or latency indicator
manual/automatic marker
original result rank
Symbol / display name
securityId
baseline collection time / age
baseline Price
10s..10m Price / % / outcome
```

Unavailable outcomes may expose their reason compactly via text/tooltip/details; the UI must not imply every unavailable state simply means “wait longer”.

Direction is conveyed textually/symbolically in addition to optional styling. Color alone is insufficient.

The table may scroll horizontally. It supports Refresh and bounded Load more/keyset paging. Source SQL/details are fetched on demand with `demo.buy.capture.get`.

The current Viewer architecture keeps Scanner mounted while switching top-level views, so navigating to Demo Buy does not stop its scheduler/automatic mode. Viewer disposal still stops Scanner scheduling as today.

## 21. Diagnostics

Keep the existing tracker/checkpoint architecture.

Stable concepts include:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.provenance_read
demo_buy.viewer
```

Support Snapshot remains sanitized and bounded. It may expose Demo Buy operational counts/checkpoint/busy-skip status but must not dump stored query SQL or raw authenticated provider material.

## 22. Fake Market and synthetic generator

Fake Market serves the normal built runtime and the U.S. screener endpoint using deterministic stateful U.S. rows.

For Demo Buy deterministic profiles must create future paths producing:

```text
UP
DOWN
FLAT
UNAVAILABLE
```

plus at least one delayed observation whose actual elapsed time exceeds the nominal horizon.

## 23. Build and local files

Target outputs remain:

```text
dist/browser/market-flow-us.runtime.js
dist/browser/market-flow-us.bookmarklet.txt
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

Local files remain:

```text
production active DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
live DB: data/live-verification.duckdb
Windows launcher: START_MARKET_FLOW_US.cmd
```

## 24. Workload and performance profiles

Hosted CI is correctness-first and uses bounded profiles.

Heavy target-machine profile remains:

```text
4096 synthetic securities
180 end-to-end cycles
737280 history rows
```

Use narrow isolated profiles:

```text
persistence → validated generated cycles → writer/DuckDB
reads/Scanner/Demo Buy → directly seeded day-bounded DB → trusted reads/Scanner/evaluator
end-to-end → Fake Market → browser → WebSocket/service → DuckDB
```

Demo Buy measurement includes bounded realistic captures/items over day-bounded history and coexistence with recurring Scanner use. Do not add a history index, precompute or materialized horizon schema unless measurement proves the direct 50-item set-wise read materially insufficient.

## 25. Security

Preserve:

- loopback-only host;
- exact allowed Origin;
- no wildcard Origin;
- no credentials/session material in Node payloads or repo;
- no external DuckDB access/extensions/secrets;
- no raw authenticated dumps in diagnostics/tests;
- synthetic/sanitized fixtures only.

Demo Buy provenance contains locally authored Scanner SQL, never provider credentials/session data. Support/diagnostic snapshots must not dump that SQL.

## 26. Live verification boundary

Live verification keeps authenticated provider compatibility and real market movement as separate facts exactly as already documented.

The final target-machine bundle additionally proves one deterministic local Demo Buy journey on the same final SHA. Demo Buy outcomes never substitute for real-provider movement evidence.

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
- archived prior-day DB remains self-contained with history and Demo Buy references;
- saved queries survive reset;
- archive/reset never occurs while active writer owns the DB;
- failure leaves either prior DB or valid fresh DB recoverable;
- Demo Buy horizons do not bridge across the new active-day DB boundary;
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
replay queue for busy-skipped automatic captures
```

Phase 2 may revisit liquidity/volume/fillability only after Phase 1 is complete and verified.
