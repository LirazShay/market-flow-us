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

## 3. Canonical identity

Canonical product identity is:

```text
securityId = String(PaperId)
```

but only after fail-closed U.S. source-type validation:

- string: accepted only when non-blank;
- number: accepted only when `Number.isSafeInteger`;
- object/array/boolean/non-safe numeric identities: rejected.

Browser acquisition and Node universe authority independently enforce that same boundary. Generic `String(object)` canonicalization is not permitted on the U.S. release path.

`Symbol`, provider row order, names and `PaperIdYatab` are never primary identity.

## 4. Provider adapter boundary

Replace the two-file Israel provider model with a U.S. full-response adapter.

Target source modules may be organized differently, but the public collector boundary must produce one validated complete-cycle object compatible with Producer Bridge/Node authority.

Provider responsibilities:

- build same-origin screener URL;
- fetch;
- parse;
- validate exact completeness and the strict `PaperId` identity boundary;
- shape one-segment cycle;
- expose canonical membership from the same response;
- attach safe source metadata.

The provider adapter owns no persistence.

## 5. Recorder behavior

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

## 6. Protocol

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

## 7. DuckDB authority

Keep one Node-owned **active-day** DuckDB with:

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
- append-only successful history **within the active trading day**;
- full-table `latest` replacement inside the same transaction.

The active database is not intended to accumulate intraday history across months/years. Daily rollover is defined in section 23.

## 8. Schema version policy

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

## 9. Universe table v3

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

## 10. Cycle table

Keep the current cycle-authority shape to minimize migration risk.

One U.S. full response is represented as one segment:

```text
chunk_count = 1
chunks_json = JSON array with one response timing/metadata record
```

Failed cycles continue to record bounded counters/phase/error metadata without changing latest/history authority.

Failure phase vocabulary changes provider-specific wording where necessary, but remains stable and diagnosable.

## 11. history/latest v3

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

## 12. Persistence transaction

Successful commit preserves the existing authority semantics:

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

The implementation may use bulk/set-wise writer optimizations as long as the observable transaction and fault semantics stay identical.

Fault at any point rolls back all authority changes.

Keep construction-only persistence fault seams and regression proofs.

## 13. Trusted reads

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

## 14. Scanner

Keep the current security design:

1. extract exactly one DuckDB statement;
2. prepare;
3. require `StatementType.SELECT`;
4. require zero parameters;
5. reject dynamic query helpers/side-effect functions;
6. execute on hardened Scanner connection;
7. JSON-safe encode exact result metadata/rows.

No Strategy Engine is added.

## 15. Staged candidate built-in

The built-in remains ordinary SQL over `latest` and `history` and preserves exact nearest-prior semantics for each security/anchor.

Initial ages:

```text
10, 20, 30, 45, 60, 90, 120 seconds
```

Initial stage predicate:

```text
latest.Price > prior.Price
```

The implementation uses a bounded recent-history hot path with nearest-prior/ASOF-style matching plus exact fallback for missing recent matches, preserving:

```text
same security_id
prior collected_at_ms <= target anchor
highest collected_at_ms
then highest cycle_id tie-break
```

The SQL computes contiguous `stage_reached`, exposes `security_id AS securityId`, and orders by stage plus explicit tie-breakers.

New/materially changed Scanner SQL must pass the static preflight contract before execution. Correctness is mechanically tested against the actual schema. Heavy timing authority is measured on day-bounded target-machine profiles rather than weak hosted CI.

## 16. Diagnostics

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

## 17. Fake Market and synthetic generator

Replace provider paths/fixtures, not the overall fake architecture.

Fake Market serves:

- normal built Market Flow US runtime;
- `ScreenerHulPaging3`;
- deterministic stateful U.S. rows.

It must not require Playwright interception for normal scenarios.

Fake Market and workload/performance tooling share one deterministic synthetic generator/profile boundary. The profile must support at least:

```text
universe size
cycle/history count or logical day shape
logical cadence/timestamps
static or moving value pattern
membership-change schedule
failure/recovery schedule
reproducible seed
```

The generator can be used directly by component tests so a persistence probe does not need a browser, and a read/Scanner probe can seed a day-bounded DB without replaying every end-to-end cycle.

## 18. Build and artifact naming

Target outputs:

```text
dist/browser/market-flow-us.runtime.js
dist/browser/market-flow-us.bookmarklet.txt
dist/live-verification/market-flow-us-live-verification.js
dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
```

Global runtime/live-result keys should be renamed coherently to `MARKET_FLOW_US` during branding cleanup.

## 19. Local file naming

```text
production active DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
live DB: data/live-verification.duckdb
Windows launcher: START_MARKET_FLOW_US.cmd
```

Prior-day archive naming/location must be deterministic and documented by the new-day tooling, but does not require a new storage subsystem.

Keep SETUP/START_DEMO/RESET_DEMO/RUN_TESTS/PREPARE_LIVE_VERIFICATION names unless a user-facing reason requires additional rename.

## 20. Workload and performance profiles

Workload tooling is profile-driven rather than one monolithic benchmark.

### Hosted CI

CI is correctness-first and uses bounded profiles:

- extensive unit/service/browser correctness;
- small multi-cycle history/Scanner profile;
- at least one approximately-4096-security width sanity cycle/few cycles;
- timing recorded diagnostically only.

Do not require the full heavy workload to pass on GitHub-hosted hardware.

### Target-machine end-to-end profile

```text
4096 synthetic securities
180 cycles
737280 history rows
```

This profile measures the real pipeline end to end and retains the 5-minute target-machine acceptance ceiling unless later evidence explicitly reopens it.

### Isolated profiles

Use the narrowest layer that can answer the performance question:

```text
persistence → generated validated cycles → writer/DuckDB
reads/Scanner → efficiently seed day-bounded history → read/Scanner connections
end-to-end → Fake Market → browser → WebSocket/service → DuckDB
```

Read/Scanner profiles may seed the configured one-trading-day history directly. They must preserve schema/cardinality/timestamp/null/tie-break invariants but need not pay for irrelevant browser/transport/commit work.

Measure distributions; do not invent hosted-runner latency SLOs.

## 21. Security

Preserve:

- loopback-only host;
- exact allowed Origin;
- no wildcard Origin;
- no credentials/session material in Node payloads or repo;
- no external DuckDB access/extensions/secrets;
- no raw authenticated dumps in diagnostics/tests;
- synthetic/sanitized fixtures only.

## 22. Live verification boundary

Live verification keeps two acceptance facts separate in one SHA-bound report.

### Base authenticated boundary

The production U.S. adapter/protocol runs at least 20 consecutive complete cycles spanning at least 60 seconds at candidate cadence. Every cycle must validate and receive COMMIT ACK; final Current/History/Scanner authority is checked before clean stop. A base `overall: "PASS"` remains valid when provider market values are static.

### Market-open movement evidence

After a base PASS, the gate executes one already-preflighted bounded read-only Scanner query over exactly the committed live cycle-id range. It considers only persisted provider market/freshness fields:

```text
Price
ChangePercent
BidRate
AskRate
DailyVolume
TradeDateTime
```

Local `collected_at_ms` is not movement evidence.

When no committed provider field changes, the report records:

```text
movement.status = "PENDING"
```

When a witness exists, trusted Current and History reads must prove that the changed field is represented in committed authority through the final cycle before:

```text
movement.status = "PASS"
```

If a change is detected but reflection cannot be proven, movement is `FAIL`. The movement report contains only bounded witness metadata (security identity/field/status), not raw provider responses or market-value dumps.

This proves short-run continuous provider/browser operation and, when movement is PASS, the final TREE `7.4` moving-provider boundary. It never substitutes for deterministic offline tests, target-machine load/performance acceptance, or claims a long-duration provider SLA.

## 23. Daily active-DB lifecycle

The active market-data authority covers one trading day.

The release must provide the smallest safe documented new-day operation:

```text
stop producer/service cleanly
→ optionally archive prior-day market DB/data
→ create/reset fresh schema-v3 active market authority
→ preserve scanner saved-query library
→ start the new trading day
```

Requirements:

- no automatic indefinite accumulation of prior-day `cycles/history/latest/universe/sessions` in the active DB;
- prior-day archive is optional operational retention, not an always-open analytics database;
- saved queries survive the new-day operation;
- archive/reset never occurs while the active writer owns the DB;
- failure leaves either the prior active DB or a valid fresh DB recoverable; do not silently destroy the only copy;
- performance tests model at most one configured trading day's active history unless a separate future feature explicitly introduces multi-day analytics.
