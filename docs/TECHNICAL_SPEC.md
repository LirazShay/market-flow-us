# Market Flow US Technical Spec

## 1. Architecture

Preserve the proven MarketScope architecture:

```text
provider browser
  ├─ U.S. ScreenerHulPaging3 adapter
  ├─ complete-response validator
  ├─ Recorder
  ├─ Producer Bridge
  └─ Viewer
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
  └─ saved-query library
```

No cloud backend and no browser-owned production DB.

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

Do not change toolchain during the U.S. conversion without evidence.

## 3. Provider adapter boundary

Replace the two-file Israel provider model with a U.S. full-response adapter.

Target source modules may be organized differently, but the public collector boundary must produce one validated complete-cycle object compatible with Producer Bridge/Node authority.

Provider responsibilities:

- build same-origin screener URL;
- fetch;
- parse;
- validate exact completeness/identity;
- shape one-segment cycle;
- expose canonical membership from the same response;
- attach safe source metadata.

The provider adapter owns no persistence.

## 4. Recorder behavior

Preserve Recorder lifecycle/scheduling semantics.

Configuration after U.S. conversion:

```text
snapshotIntervalMs
```

Any remaining generic lifecycle settings may stay, but Israel-only `chunkSize` and `chunkDelayMs` are removed from the active U.S. collector contract.

Initial demo/default interval:

```text
3000 ms
```

Live-safe cadence remains empirical and can change as configuration without schema redesign.

## 5. Protocol

Keep protocol version and message families unless implementation proves a concrete incompatibility:

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

The U.S. migration should prefer adapting payload validation over creating a second protocol.

## 6. DuckDB authority

Keep one Node-owned DuckDB with:

```text
schema_info
sessions
universe
cycles
history
latest
scanner_saved_queries
```

Keep:

- one serialized writer;
- separate trusted Viewer read connection;
- separate Scanner connection;
- external-access/extension/secret hardening;
- transactional complete-cycle authority;
- append-only successful history;
- full-table `latest` replacement inside the same transaction.

## 7. Schema version policy

Imported MarketScope schema version is v2.

Market Flow US market-data schema is:

```text
schema v3
```

Reason: the authority tables change semantic market projection from Israel to U.S.

KISS migration policy:

- new default DB filename is `data/market-flow-us.duckdb`;
- fresh Market Flow US DB bootstraps directly as v3;
- schema v1/v2 MarketScope DBs are not automatically converted into U.S. market facts;
- opening an incompatible v1/v2 DB through the Market Flow US service fails with `DB_SCHEMA_UNSUPPORTED` and does not mutate that DB;
- saved-query portability from MarketScope is not part of the first U.S. conversion.

This avoids destructive or semantically false conversion of Israeli historical data while preserving the old file separately.

## 8. Universe table v3

Target logical columns:

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

Universe replace retains all-seen rows and toggles `is_current` exactly as MarketScope did.

## 9. Cycle table

Keep the current cycle-authority shape to minimize migration risk.

One U.S. full response is represented as one segment:

```text
chunk_count = 1
chunks_json = JSON array with one response timing/metadata record
```

Failed cycles continue to record bounded counters/phase/error metadata without changing latest/history authority.

Failure phase vocabulary changes provider-specific wording where necessary, but remains stable and diagnosable.

## 10. history/latest v3

Common columns:

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

Keys remain:

```text
history PRIMARY KEY (cycle_id, security_id)
latest PRIMARY KEY (security_id)
```

`chunk_index` remains physically present and is `0` for the initial U.S. provider path.

No temporal predecessor-link columns are added.

## 11. Persistence transaction

Successful commit:

```text
validate session/revision/exact membership
→ BEGIN
→ allocate cycle_id
→ insert cycle
→ insert every history row
→ DELETE FROM latest
→ insert every latest row
→ update session success state
→ COMMIT
```

Fault at any point rolls back all authority changes.

Keep construction-only persistence fault seams and regression proofs.

## 12. Trusted reads

Adapt field projection only; keep read behavior.

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

## 13. Scanner

Keep the current security design:

1. extract exactly one DuckDB statement;
2. prepare;
3. require `StatementType.SELECT`;
4. require zero parameters;
5. reject dynamic query helpers/side-effect functions;
6. execute on hardened Scanner connection;
7. JSON-safe encode exact result metadata/rows.

No Strategy Engine is added.

## 14. Staged candidate built-in

The built-in is ordinary SQL over `latest` and `history`.

For each age it uses a correlated/lateral latest-prior lookup by:

```text
history.security_id = latest.security_id
history.collected_at_ms <= latest.collected_at_ms - age_ms
ORDER BY collected_at_ms DESC, cycle_id DESC
LIMIT 1
```

Initial ages:

```text
10, 20, 30, 45, 60, 90, 120 seconds
```

Initial stage predicate:

```text
latest.Price > prior.Price
```

The SQL computes contiguous `stage_reached`, exposes `security_id AS securityId`, and orders by stage plus explicit tie-breakers.

This query is mechanically tested against the actual schema and included in workload measurement.

## 15. Diagnostics

Keep the imported tracker/checkpoint architecture.

Rename user-facing product strings to Market Flow US while preserving stable diagnostic concepts:

```text
browser runtime
service hello
provider snapshot
producer universe
cycle commit/ACK
database readiness
viewer reads
scanner execution
demo
live verification
```

Support Snapshot remains sanitized and bounded.

## 16. Fake Market

Replace provider paths/fixtures, not the overall fake architecture.

Fake Market serves:

- normal built Market Flow US runtime;
- `ScreenerHulPaging3`;
- deterministic stateful U.S. rows.

It must not require Playwright interception for normal scenarios.

## 17. Build and artifact naming

Target outputs:

```text
dist/browser/market-flow-us.runtime.js
dist/browser/market-flow-us.bookmarklet.txt
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

Global runtime/live-result keys should be renamed coherently to `MARKET_FLOW_US` during branding cleanup.

## 18. Local file naming

```text
production DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
live DB: data/live-verification.duckdb
Windows launcher: START_MARKET_FLOW_US.cmd
```

Keep SETUP/START_DEMO/RESET_DEMO/RUN_TESTS/PREPARE_LIVE_VERIFICATION names unless a user-facing reason requires additional rename.

## 19. Workload

U.S. representative workload:

```text
4096 synthetic securities
180 cycles
737280 history rows
```

It is a manually triggered proof layer, not Fast CI.

Measure distributions, do not invent latency SLOs.

If staged SQL is materially impractical at this scale, reopen only Scanner/history performance before release.

## 20. Security

Preserve:

- loopback-only host;
- exact allowed Origin;
- no wildcard Origin;
- no credentials/session material in Node payloads or repo;
- no external DuckDB access/extensions/secrets;
- no raw authenticated dumps in diagnostics/tests;
- synthetic/sanitized fixtures only.

## 21. Live verification boundary

Live verification uses production U.S. adapter/protocol and exactly one complete snapshot.

It proves the external provider/browser boundary and product authority end-to-end but never substitutes for deterministic offline tests.
