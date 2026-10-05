# Market Flow US Product Spec

## 1. Runtime baseline

Market Flow US preserves the proven MarketScope topology:

```text
authenticated provider page
→ browser producer
→ ws://127.0.0.1:8765
→ localhost Node.js service
→ native DuckDB
→ browser Viewer
```

Provider authentication remains browser-owned.

The final post-feature database contract is schema v4. Schema v4 preserves the existing U.S. market-authority tables and adds only Demo Buy analytical observation/provenance state required by the current feature set.

## 2. Product identity

Product name: `Market Flow US`.

Canonical security identity, after fail-closed source-type validation, is:

```text
securityId = String(PaperId)
```

Accepted `PaperId` source types are a non-blank string or JavaScript safe integer. Objects, arrays, booleans and non-safe numeric identities are rejected rather than generically stringified.

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

using the configured U.S. screener filters documented in `DATA_CONTRACT`.

A response is complete only when:

- HTTP status is successful;
- `data.ScreenerHulPaging` exists;
- `recordCount` is a positive safe integer;
- `records` is an array;
- `records.length === recordCount`;
- every record has `PaperId` whose source type is a non-blank string or safe integer;
- objects/arrays/booleans/non-safe numeric identities are rejected fail-closed;
- canonical `String(PaperId)` values are unique after validation.

`Symbol` absence is diagnostic-worthy but does not override `PaperId` identity.

The cycle records browser timings and source envelope metadata needed for diagnostics while preserving each raw row.

## 5. Flow 3 — Universe and cycle authority

Every validated full response contains both membership and market rows.

First response in a producer session:

```text
derive universe
→ producer.universe.replace
→ receive universeRevision
→ commit the same response under that revision
```

Later responses:

- same canonical membership -> commit under the accepted revision;
- changed membership -> replace universe from the new complete response, receive the new revision, then commit that same response.

Row reordering is not a membership change. Failed/incomplete provider input never changes universe authority and never commits history/latest.

## 6. Flow 4 — Persist successful cycle

Node validates running producer/session state, universe revision, exact membership, complete counters, unique IDs and raw-row identity.

One serialized DuckDB transaction:

```text
allocate cycle_id
→ insert cycle metadata
→ append every row to history
→ replace latest
→ update session counters
→ COMMIT
```

Any failure rolls back the whole cycle.

## 7. U.S. public row projection

String fields include:

```text
Symbol
PaperNameEng
PaperNameHeb
ExchangeName
TradeDateTime
CountryName
CountryNameEng
```

Numeric fields include:

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

Every row also retains `raw_data JSON`. Missing/invalid typed values project to SQL NULL without rewriting raw JSON.

## 8. Display-name rule

Viewer `paperName` is the first non-empty value:

```text
PaperNameEng
→ PaperNameHeb
→ Symbol
→ securityId
```

## 9. Flow 5 — Current

Current reads authoritative `latest` joined with current universe metadata.

Visible columns:

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

Behavior preserves BOOTING / EMPTY / MAIN / ERROR states, default `DailyVolume DESC`, deterministic identity tie-break, zero-vs-missing distinction, Detail navigation and sort/scroll preservation across refresh.

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

History shows persisted U.S. fields including `collectedAtMs`, `cycleId`, Price/change/bid/ask/volume/high/low/yesterday/market-cap/time.

History remains newest-first with 500-row cursor-bound keyset pages. Historical-only securities remain openable by canonical `securityId`.

## 11. Flow 7 — Scanner and saved queries

Scanner remains a general read-only analytical SQL surface:

- exactly one statement;
- SELECT only;
- zero parameters;
- side-effect helpers rejected;
- hardened DuckDB connection;
- exact result columns/rows returned;
- no hidden application rank/filter/sort/limit.

Saved-query behavior remains explicit Draft / Persisted / Active state. Loading does not activate. Built-ins are immutable but copyable.

Each successful execution exposes Node `startedAtMs` and `completedAtMs`. Demo Buy freezes these timings together with exact active query/interval/result provenance; later draft/library edits never rewrite an existing generation.

A result is Demo-Buy-capable only when it exposes exactly one recognized canonical identity column named `securityId` or `security_id`. Identity is never guessed from `Symbol`.

## 12. Built-in staged candidate query

The editable staged example uses source `Price` with target ages:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

For each target age it chooses the nearest history row at/before the anchor, deterministic by `collected_at_ms DESC, cycle_id DESC`.

Initial stage predicate:

```text
current.Price > prior.Price
```

`stage_reached` is contiguous from the first stage; missing/failed stage stops progression.

Initial ordering:

```text
stage_reached DESC
ChangePercent DESC NULLS LAST
DailyVolume DESC NULLS LAST
securityId ASC
```

This is editable SQL, not hard-coded strategy infrastructure.

## 13. Flow 8 — Create a Demo Buy capture

Supported modes from one successful Scanner generation:

```text
manual selected rows
all source rows
first X source rows (Top X)
automatic all
automatic Top X
```

Selection is source-row-first:

1. choose rows according to mode;
2. validate every chosen recognized identity value;
3. reduce duplicate canonical IDs to first chosen occurrence;
4. preserve each retained row's original 1-based Scanner `resultRank`.

A duplicate inside Top X never backfills from a later row outside X. Manual ranks may contain gaps.

One capture supports at most 5000 unique canonical IDs. `Top X` is 1..5000 source rows. All/auto-All never silently truncate. Empty manual selection does not submit; automatic zero-row selection is a no-op.

The capture also freezes bounded original Scanner comparison context for later forensic analysis. Exact protocol/provenance limits are owned by `DEMO_BUY_PROTOCOL_LIMITS.md`, including first-50 result rows, first-128 columns, exact SQL up to 1 MiB and bounded deterministic cell/context encoding. SQL provenance is never silently truncated.

The browser sends ordered `{securityId, resultRank}` items plus immutable query/timing/result/context provenance. It never sends a buy price.

One Viewer capture slot covers manual and automatic capture. Manual double-submit is disabled. An automatic generation arriving while capture is busy is visibly skipped rather than queued/replayed. Scanner scheduling continues.

Node validates already-deduped ordered payload semantics and rejects malformed duplicates/ranks rather than repairing them.

Capture runs through the existing serialized writer:

```text
validate bounded request
→ enqueue behind prior writer work
→ BEGIN
→ captured_at_ms = Node clock
→ resolve every selected security from authoritative latest
→ require every item to resolve
→ persist capture + immutable context + exact buy_cycle_id links
→ COMMIT
```

The baseline relation is:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The history row owns baseline market facts; they are not copied into Demo Buy items.

Timing semantics remain distinct:

```text
signal/result-ready = source_result_completed_at_ms
virtual buy         = captured_at_ms
capture latency     = captured_at_ms - source_result_completed_at_ms
baseline age        = captured_at_ms - baseline_collected_at_ms
```

These are local analytical diagnostics, not broker execution claims.

### Capture acknowledgement state

After dispatch the Viewer distinguishes:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

`ACKNOWLEDGEMENT_UNKNOWN` means transport disappeared before a conclusive response; the capture may already have committed. It is never automatically replayed. Further capture is blocked in that Viewer instance until explicit reconnect/relaunch and Demo Buy refresh/inspection.

Repeated later captures of the same security remain valid independent observations, not positions.

## 14. Flow 9 — Evaluate Demo Buy outcomes

Fixed horizons:

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

For capture time `captured_at_ms` and horizon `H`, the trusted Node read model finds the first same-security row satisfying:

```text
collected_at_ms >= captured_at_ms + H
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying row remains authoritative even if `Price` is NULL; later priced rows are not cherry-picked.

Percentage:

```text
((futurePrice / baselinePrice) - 1) * 100
```

Outcome:

```text
UP          > 0
DOWN        < 0
FLAT        = 0
UNAVAILABLE no trustworthy percentage
```

Unavailable reasons distinguish no future observation, baseline price unavailable, baseline zero and future price unavailable. A missing linked baseline row is an integrity error, not normal `UNAVAILABLE`.

Matched horizons expose real observed time and actual elapsed time. Demo Buy pages are recomputed from history; no background updater/materialized horizon columns exist.

Each page is evaluated from one transactionally consistent DuckDB statement snapshot.

## 15. Flow 10 — Demo Buy Viewer

Top-level destinations are:

```text
Current | Scanner | Demo Buy
```

Demo Buy orders `capture_id DESC, resultRank ASC` and uses fixed 50-item opaque-keyset pages. Newer auto captures do not disturb an existing continuation walk; Refresh from page one exposes them.

Each observation shows source/capture/signal timing, manual/automatic marker, original result rank, identity/display, baseline time/age/Price and all ten horizon Price/%/outcome cells. Unavailable reason is inspectable and direction is not color-only.

Full SQL/capture provenance is loaded on demand rather than repeated per row.

Scanner remains mounted/scheduled while navigating to Demo Buy under the existing Viewer lifecycle.

## 16. Flow 11 — Generate AI Investigation Pack

From one Demo Buy observation the user can invoke:

```text
Generate AI Investigation Pack
```

The local Node service validates `captureId + securityId` membership and generates a controlled local evidence directory. The browser never supplies an output path and the product never calls an AI provider automatically.

The pack contains:

```text
README.md
PROMPT.md
MANIFEST.json
QUERY.sql
SCANNER_CONTEXT.json
TARGET_BEFORE.jsonl
BASELINE.json
TARGET_AFTER.jsonl
OUTCOME.json
FIELD_GUIDE.md
```

Evidence boundary:

```text
prediction-time:
  exact immutable query
  frozen bounded original Scanner context
  target history for 30 minutes ending at capturedAtMs
  exact baseline

outcome:
  target history from capturedAtMs through +10 minutes
  trusted Demo Buy horizon outcomes
```

The prompt explicitly forbids hindsight leakage: a proposed Scanner rule may use only information that existed by capture time. Future evidence may explain what happened and suggest hypotheses but cannot be presented as an original predictive input.

The retained comparison context is the bounded Top-50 original Scanner result. If the target row is retained, `targetInScannerContext=true` and peer/rank comparison is permitted. A valid target outside that retained context remains exportable with `targetInScannerContext=false`; the prompt explicitly forbids inventing its missing output row/peer neighborhood.

The exporter reuses the trusted Demo Buy evaluator for `OUTCOME.json`, never implements a second horizon algorithm, and performs no DB write.

Publication is atomic:

```text
validate/read evidence
→ write all files to an internally generated temp directory under exports/ai-investigations/
→ close files
→ atomic rename to a collision-safe final directory
```

Failure publishes no misleading complete directory and never overwrites an existing successful pack.

Viewer exposes:

```text
outcome evidence PARTIAL_OUTCOME / COMPLETE_OUTCOME
context coverage true/false
Generate
Copy AI Prompt
Regenerate
local generated path
```

Regeneration may update later outcome-dependent evidence but never rewrites immutable query/context/baseline evidence.

## 17. Flow 12 — Schema-v4 lifecycle and recovery

Fresh databases bootstrap directly as schema v4.

A valid schema-v3 active DB migrates additively and transactionally to v4. A v3 database already containing partial Demo Buy structures fails closed instead of being silently normalized.

Preserve existing failure/recovery behavior:

- provider failure leaves prior authority unchanged;
- DB failure rolls back;
- WebSocket disconnect fails pending browser requests visibly;
- Viewer may still read last committed authority after producer stop;
- service restart recovers stale producer session state;
- capture failure is all-or-nothing;
- acknowledgement-unknown is not falsely called rollback and is not auto-replayed;
- Demo Buy read/AI-export failures never mutate observations/market authority;
- active-day Demo Buy observations/context survive service restart.

No new `history` index is part of initial schema v4; optimization requires representative evidence.

## 18. Fake Market behavior

Canonical Fake Market serves normal runtime plus the U.S. screener endpoint and deterministic scenarios for movement, reorder, membership add/remove, duplicate/missing identity, recordCount mismatch, null/zero/missing values, malformed response, HTTP failure, delay, restart and recovery.

For Demo Buy/AI Investigation it also provides deterministic trajectories producing `UP`, `DOWN`, `FLAT`, unavailable reasons, delayed observations and a failed high-ranked candidate with useful frozen comparison context.

## 19. Polling cadence

Initial offline/demo default remains 3000 ms. It is configuration, not a provider SLA or schema fact. Live-safe cadence remains evidence-driven.

## 20. U.S. workload shape

Heavy target-machine profile remains:

```text
4096 securities
180 cycles
737280 history rows
```

Hosted CI uses bounded correctness/performance-smoke profiles.

Measured areas include cycle commit, Current, History, general/staged Scanner, 50-item Demo Buy evaluation, bounded AI-pack generation, Scanner/Demo Buy coexistence, restart-to-ready, DB size and count integrity.

AI-pack performance is measured with realistic one-security 30-minute/10-minute export windows; do not create a full-universe forensic export benchmark.

## 21. Branding / generated artifacts

Target names include:

```text
npm package: market-flow-us
default DB: data/market-flow-us.duckdb
demo DB: .demo/market-flow-us.duckdb
browser runtime: dist/browser/market-flow-us.runtime.js
bookmarklet: dist/browser/market-flow-us.bookmarklet.txt
live runtime: dist/live-verification/market-flow-us-live-verification.js
live bookmarklet: dist/live-verification/market-flow-us-live-verification.bookmarklet.txt
Windows launcher: START_MARKET_FLOW_US.cmd
AI exports: exports/ai-investigations/
```

`exports/` is ignored local user output and never a repository artifact.

## 22. Daily active-DB lifecycle

The active DB covers one trading day.

After schema v4 ships, New Trading Day accepts either a valid v3 source DB or valid v4 source DB, while rejecting v1/v2, partial/corrupt schema state and a running producer session.

Flow:

```text
stop producer/service
→ inspect source without mutation
→ preserve scanner_saved_queries only
→ build temporary fresh schema-v4 DB
→ seed saved queries transactionally
→ optionally archive/move original source DB as-is
→ atomically install fresh v4 active DB
```

A v4 archive remains self-contained with history, Demo Buy/context and forensic source evidence. A v3 archive remains valid historical pre-Demo-Buy data. Demo Buy state never crosses into the fresh day, and future horizons never bridge across DB files.

## 23. Live verification

Authenticated proof remains bounded and local.

Closed/static smoke may pass with repeated equal provider values while proving exact shape/commit/Current/History/Scanner/ownership/clean stop.

Final market-open acceptance on the same SHA requires at least 20 consecutive complete cycles spanning at least 60 seconds plus at least one provider market/freshness field change reflected in committed Current/History.

No observed change leaves movement pending/inconclusive rather than fabricating PASS.

The final target-machine bundle also proves the local Demo Buy journey and local AI Investigation Pack generation/copy/regeneration on the exact final candidate. Acceptance does not require uploading the pack to any external AI.

## 24. Explicit current non-goals

Do not add:

```text
real broker orders
manual buy price
fill simulator
fees/slippage
sell automation
portfolio/risk engine
trade quantity/liquidity proof
Strategy Engine
background horizon materialization
cross-day strategy warehouse
auto-capture replay queue
AI provider integration/API keys
automatic AI editing/activation of Scanner SQL
internet/web enrichment for investigation
causal claims from one failed observation
```

Phase-2 liquidity/sellability work remains deferred until this increment is fully implemented and verified.