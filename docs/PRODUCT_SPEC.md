# Market Flow US Product Spec

## 1. Runtime topology

Preserve the proven market-analysis topology, the isolated execution sidecar, the isolated Market Recording + Replay lane, and the isolated Historical Backtest Lab lane:

```text
authenticated market provider page
→ browser producer + Viewer
→ ws://127.0.0.1:8765
→ localhost Market Flow US Node.js
→ native DuckDB

separate execution sidecar
→ authenticated local caller
→ http://127.0.0.1:8770
→ Node.js ibkr-order-service
→ HTTPS localhost Client Portal Gateway
→ Interactive Brokers

separate recording/replay lane
→ validated browser snapshot frames
→ IndexedDB and/or portable replay file
→ Market Player
→ normal ProducerBridge messages
→ unchanged Market Flow US service
→ replay-only DuckDB

separate historical Backtest lane
→ product-owned active/archive Market Flow US DuckDB evidence
→ http://127.0.0.1:8767 Backtest Lab
→ isolated historical latest/history surface
→ unchanged Scanner SQL
→ Inspect / Compare / Sweep
```

Market-provider authentication remains browser-owned. IBKR CPGW authentication is separately user-owned/manual. Final market-data schema is v4.

Scanner, Demo Buy, AI Investigation and Current do not call the order service automatically. They receive no Replay-specific read/SQL mode. Backtest is independently launched and receives no provider, producer, Replay or order-service authority.

## 2. Product identity and market authority

Canonical market-data security identity is validated `String(PaperId)`. `Symbol` and names are metadata only.

Successful committed market cycles remain the only market authority. Demo Buy adds analytical observation/provenance facts; AI Investigation adds derivative local export files.

The IBKR order service has separate local execution state for idempotency/reconciliation only; it does not become market-data authority and does not change schema-v4 market-day semantics.

A replay recording is source evidence before Node authority. During Replay, only cycles committed normally into the replay-only DuckDB become market authority for that replay run.

Backtest source DBs are immutable evidence. Historical sandboxes, point results, comparison summaries and Sweep state are derivative read-only research state and never become market authority or source persistence.

## 3. Existing U.S. flows retained

The product continues to provide:

- exact `ScreenerHulPaging3` full-response validation;
- canonical universe membership and serialized complete-cycle persistence;
- append-only active-day `history` and full `latest` replacement;
- Current with U.S. fields and `DailyVolume DESC` default;
- Detail/History with 500-row keyset paging and historical-only lookup;
- read-only Scanner SQL with hardened admission;
- saved-query Draft/Persisted/Active separation;
- deterministic Fake Market/runtime/service/DuckDB proof;
- one-day active-DB lifecycle and saved-query preservation.

Schema/provider field details remain owned by `DATA_CONTRACT.md` and `TECHNICAL_SPEC.md`. The standalone order lane is owned by `IBKR_ORDER_SERVICE.md` and `IBKR_ORDER_SERVICE_SECURITY.md`. Replay is owned by `MARKET_REPLAY.md`. Historical Backtest behavior is owned by `BACKTEST_LAB.md`.

## 4. Scanner lifecycle

Scanner exposes:

```text
Activate
Stop recurring scan
```

`Stop recurring scan` is resumable. It cancels future scheduled generations, invalidates any stale in-flight generation result for presentation/Auto purposes, keeps the Viewer alive and permits a later Activate. Terminal Viewer destruction remains a separate lifecycle action.

Saved-query edits after activation do not mutate the immutable active-generation snapshot used by a produced result.

Each successful result generation freezes:

```text
queryId / name
exact active SQL
active intervalMs
startedAtMs / completedAtMs
rowCount
columns / rows
```

A generation is Demo-Buy-capable only with exactly one recognized `securityId` or `security_id` column.

Scanner has no direct live-order authority and no Replay-specific query semantics. Backtest reuses the same supported Scanner SQL/admission semantics but does not create a second saved-query library and does not rewrite user SQL to inject historical predicates.

## 5. Demo Buy selection/capture flow

Supported capture modes:

```text
manual selected
all
Top X
auto all
auto Top X
```

Source-row semantics:

```text
choose source rows by mode
→ validate every chosen identity
→ dedupe canonical IDs by first chosen occurrence
→ retain original 1-based resultRank
```

`Top X` means the first X source rows **before** dedupe. Manual selection follows original result order, not click order.

At user action time the browser synchronously freezes the displayed generation snapshot and selected source rows before any async submission. New Scanner results cannot alter that capture.

Exact capture/context/SQL/transport bounds are owned by `DEMO_BUY_PROTOCOL_LIMITS.md`. The browser preflights; Node independently validates and rejects malformed duplicates/order/context rather than repairing them.

The browser never sends a buy price.

## 6. Capture authority

Capture uses the existing serialized writer:

```text
validate request
→ enqueue behind earlier writer work
→ BEGIN
→ assign captured_at_ms
→ resolve every selected security from authoritative latest
→ persist capture + immutable Scanner context
→ persist item (result_rank, security_id, buy_cycle_id)
→ COMMIT
```

All selected items must resolve or the complete capture rolls back.

For each item:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The linked history row owns baseline market facts.

`buy_cycle_id` is also the capture-time authority watermark:

```text
pre-capture authoritative market evidence: cycle_id <= buy_cycle_id
post-capture authoritative evidence:       cycle_id > buy_cycle_id
```

Timestamps are diagnostics and do not override this ordering.

## 7. Capture acknowledgement/backpressure

One Viewer-wide capture slot covers manual and automatic capture.

- manual second submit while busy: disabled/refused;
- auto generation while busy: visibly skipped, never queued;
- zero-row successful auto generation: normal no-op;
- confirmed success/rejection releases the slot;
- transport loss after dispatch may produce `ACKNOWLEDGEMENT_UNKNOWN`.

Capture outcomes are:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Unknown acknowledgement is never blindly replayed. Recovery requires reconnect/relaunch and Demo Buy refresh/inspection before another capture.

## 8. Automatic capture UX

Auto mode is Viewer-session state:

```text
Off | All | Top X
```

Changes apply only to future successful Scanner generations and never retroactively capture the currently displayed result.

When Auto is enabled, a persistent cross-surface toolbar indicator shows mode and offers `Turn off`. Turning Auto off does not cancel an already dispatched/in-flight capture; it only prevents future generation attempts.

Stopping recurring Scanner generation stops future Auto attempts. Auto configuration may remain armed until a later Activate.

A bounded summary reports latest capture/skip/error state and busy-skip count; no unbounded activity log is created.

## 9. Demo Buy evaluation

Fixed horizons are:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m, 10m
```

For horizon H:

```text
target_at_ms = captured_at_ms + H
```

The trusted Node evaluator selects the first row satisfying:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying row wins even when `Price` is NULL.

Percentage:

```text
((futurePrice / baselinePrice) - 1) * 100
```

Outcome:

```text
UP | DOWN | FLAT | UNAVAILABLE
```

Unavailable reasons are:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

Missing baseline row is a stable integrity error, not an unavailable horizon.

No horizon values are persisted or updated in the background.

## 10. Read operations

Keep protocol version 1 unless implementation proves incompatibility.

Viewer-role Demo Buy operations are:

```text
demo.buy.capture
demo.buy.page
demo.buy.capture.get
demo.buy.observation.get
demo.buy.ai-pack.create
```

`demo.buy.page` uses fixed 50-item keyset pages ordered:

```text
capture_id DESC
result_rank ASC
```

One page is evaluated from one consistent DuckDB statement snapshot. Newer Auto captures do not disturb an existing continuation walk.

`demo.buy.capture.get(captureId)` returns immutable capture SQL/provenance on demand.

`demo.buy.observation.get(captureId, securityId)` returns exactly one current browser-ready observation using the same trusted evaluator. It supports targeted progressive refresh without resetting list pagination.

## 11. Demo Buy Viewer

Top-level navigation:

```text
Current | Scanner | Demo Buy
```

The Demo Buy page renders capture groups. Capture-level query/timing/mode/provenance is shown once in the group header. If pagination splits a capture, the next page repeats the compact capture header and may mark it continued.

Leading columns stay sticky:

```text
resultRank
Symbol/display name
securityId
baseline Price
```

Each horizon is one compact cell, e.g.:

```text
UP +0.42%
$123.45
```

rather than three separate columns.

`NO_FUTURE_OBSERVATION` displays as `Pending / ממתין`; baseline/future-price problems display as warning-style unavailable states. Text/symbol communicates direction independently of color.

List actions:

```text
Refresh latest   → reset to first page
Load more        → append stable continuation
Refresh observation → update one expanded/selected item in place
```

Errors preserve prior trustworthy data whenever possible.

## 12. Scanner result selection interaction

A Demo-Buy-capable result adds accessible row checkboxes and selected count.

Interactive controls inside a Scanner row do not trigger the existing row-to-Detail click/keyboard navigation. Invalid identity rows are visibly ineligible.

Selection resets when a new rendered Scanner generation replaces the previous one.

## 13. Schema v4

Schema v4 adds only:

```text
demo_buy_captures
demo_buy_items
```

Capture facts include immutable query/result timing and `source_result_context_json`; item facts include original `result_rank`, canonical identity and exact `buy_cycle_id`.

No copied baseline price, future price, percentage or outcome is stored.

Valid v3 migrates transactionally to v4. Suspicious partial v3+Demo structures fail closed. Fresh DBs boot v4. v1/v2 remain unsupported.

No new `history` index is part of the initial contract; add one only after measured evidence and focused replan.

The order service does not add order tables to this market-day schema. Its smallest durable idempotency/reconciliation store is separate from market authority. Replay also does not add schema-v4 tables; it runs the unchanged service against a separate replay-only DB path. Backtest adds no table/index/schema/result persistence to the market DB and never migrates a selected source.

## 14. Scanner comparison context

The exact context contract is owned by `DEMO_BUY_PROTOCOL_LIMITS.md`.

Current required behavior includes:

```text
first up to 50 source rows
<=64 retained columns total
canonical identity column always retained
<=128 UTF-8 bytes per textual/serialized cell after deterministic clipping
<=256 KiB serialized context
exact SQL <=1 MiB UTF-8
```

Original row ranks and source column metadata/omission/truncation metadata are preserved. Node cross-checks every selected item with `resultRank <= 50` against the context row identity before commit.

## 15. AI Investigation flow

From one Demo Buy item:

```text
Investigate with AI
→ Generate AI Investigation Pack
→ Copy AI Prompt / Copy folder path
→ Regenerate when later evidence exists
```

The product never calls an AI provider or mutates Scanner SQL automatically.

Pack contents are owned by `AI_INVESTIGATION_PACK.md`. Core evidence is:

```text
exact query + immutable Scanner context
prediction-time target history
exact baseline
post-capture target history
trusted Demo Buy outcomes
field guide
anti-hindsight prompt
```

Prediction-time history requires `cycle_id <= buy_cycle_id`; outcome history requires `cycle_id > buy_cycle_id`. This prevents later-committed data from leaking backward merely because its wall-clock timestamp is earlier.

The pack marks `targetInScannerContext`. A target outside retained Top-50 remains valid but cannot claim exact peer reconstruction.

One Viewer-wide AI-export slot prevents repeated Generate/Regenerate queueing.

AI Investigation cannot submit orders.

## 16. AI-pack publication

Use a product-controlled ignored root:

```text
exports/ai-investigations/
```

The browser supplies no path. Node writes to a temporary internal directory and atomically renames only after every required file succeeds. Existing successful packs are never overwritten.

The Viewer receives a **relative product path**, not an absolute machine/user path.

A lost export acknowledgement may leave a valid local pack; after reconnect it is safe to generate another pack because export performs no DB mutation.

Clipboard actions use the existing fallback pattern: try `navigator.clipboard`, otherwise reveal selectable text.

## 17. AI outcome evidence status

`PARTIAL_OUTCOME` / `COMPLETE_OUTCOME` describe persisted evidence progress, not profitability or fillability.

Completeness uses a committed post-capture evidence watermark reaching `captured_at_ms + 10m`. No “day ended therefore complete” shortcut exists; an archive whose evidence never reached that boundary remains partial.

Complete evidence does not guarantee every target horizon has a usable Price and does not imply fillability/profitability.

## 18. New Trading Day

New Trading Day accepts structurally valid v3 or v4 source DBs, rejects v1/v2, corrupt/partial states and running producer ownership, preserves `scanner_saved_queries`, optionally archives the source as-is, and installs a fresh v4 active DB with empty Demo Buy state.

Prior-day Demo Buy evidence never bridges into the new DB.

Order-service execution state is not part of this rollover. Replay DBs are not active-day rollover inputs unless an explicit future contract says otherwise. Backtest may read the resulting product-owned active/archive evidence later but does not participate in rollover or mutate either side.

## 19. Diagnostics and privacy

Market-analysis diagnostics may expose bounded operational state such as current surface, Auto mode, capture/export busy flags, skip counts and last outcome categories.

Never include SQL text, Scanner rows, history rows, pack prompt/evidence, credentials, cookies, auth/session data or raw authenticated dumps.

The order service follows the same public-safe discipline and additionally excludes provider account identifiers and local caller-token values. Order diagnostics expose only product-owned local IDs, bounded lifecycle state, stable error code/checkpoint and sanitized causal messages.

Replay diagnostics are owned by the Player/Host and expose only bounded recording/frame/position/storage/host states plus stable error/checkpoint data; recordings/diagnostics never include provider authentication/session/account/private DOM material.

Backtest diagnostics expose only bounded source IDs/kinds, operation/checkpoint/error metadata and aggregate counts/timings. They do not emit user SQL, market rows, arbitrary absolute source paths, credentials/session material or raw authenticated dumps.

## 20. Performance discipline

Use the existing architecture first:

```text
static SQL preflight
→ tiny deterministic fixtures
→ bounded representative workload
→ optimize only on measured evidence
```

For Backtest the representative sequence includes Inspect, Compare, second-level Sweep and Sweep-Compare on the same bounded source profile. Reuse repeated baseline/query/evidence work only where semantics remain exact. Hosted timings are diagnostic, not a product SLO; a new index, precompute, background worker or result database requires evidence and focused replan.

Do not add background horizon materialization, another normal market-data transport/DB, a speculative history index or Strategy Engine before evidence requires it.

The isolated local order HTTP API is a deliberate new execution boundary; it is not a replacement transport for market-data/Viewer traffic. Replay reuses the normal producer/service path and must not create a second persistence implementation. Backtest uses its own narrow read-only local HTTP boundary and must not reuse live producer/service mutation paths merely to access historical evidence.

## 21. Standalone IBKR order-service topology

The sidecar listens only on:

```text
127.0.0.1:8770
```

`GET /health` may be unauthenticated only when it returns no provider/account/session/order facts. Every other endpoint requires the high-entropy per-run local caller credential before body/route/provider processing. Browser `Origin` requests are rejected by default; wildcard or credentialed CORS is forbidden.

Target local API:

```text
GET  /health
GET  /session
POST /session/init
POST /instruments/resolve
POST /orders/preview
POST /orders
POST /orders/{localOrderId}/confirm
POST /orders/{localOrderId}/cancel
GET  /orders
GET  /orders/{localOrderId}
GET  /trades
```

No endpoint accepts provider credentials or durable account IDs.

## 22. Order intent and provider workflow

Initial normalized order scope:

```text
instrument: U.S. STK / USD / SMART
side:       BUY | SELL
quantity:   positive finite
orderType:  LMT | MKT
tif:        DAY | GTC
executionMode: DRY_RUN | LIVE
requestId:  mandatory caller idempotency key
```

`LMT` requires positive finite `limitPrice`; `MKT` forbids it. No short opening is supported.

Provider-capable workflow:

```text
local caller auth
→ local intent validation/idempotency
→ gateway/session/account checks
→ contract resolution
→ market-data snapshot prerequisite
→ what-if preview
→ local preview/risk validation
→ actual submit only if process LIVE + request LIVE + provider permission
→ immediate result OR REPLY_REQUIRED
→ explicit confirmation when required
→ reconciliation/open-order/trade observation
→ explicit cancellation when requested
```

Unknown provider confirmation questions fail closed.

## 23. Order acknowledgement/idempotency

Same `requestId` + same normalized intent returns/reconciles the existing local order result. Same `requestId` + different normalized intent is rejected.

Transport loss after a provider submit is not assumed to be failure. The service records `ACKNOWLEDGEMENT_UNKNOWN`, performs no blind resubmit and reconciles against provider order/trade state before a later explicit action.

Local lifecycle semantics must distinguish at least dry-run complete, preview rejected/ready-to-submit, reply required, submitted, provider rejected, acknowledgement unknown, cancelled, partially filled and filled.

## 24. SELL safety guard

Before LIVE SELL the service must establish enough current provider position information to prove the requested quantity does not exceed the known long position covered by the initial contract. If it cannot establish that fact, LIVE SELL fails closed.

This is a narrow no-short-opening guard, not a portfolio/risk engine.

## 25. Provider/session/privacy boundary

The service uses first-party IBKR Client Portal Web API through Client Portal Gateway. Manual gateway authentication stays user-owned on the same machine; the service never automates login.

The runtime account identifier may exist in memory only as needed for provider calls. It is not persisted or logged.

A localhost CPGW certificate exception, if required, must be scoped to the loopback CPGW client only; process-global TLS verification disable is forbidden.

## 26. Order persistence

Reuse the existing DuckDB dependency for the smallest separate local execution store unless implementation evidence proves unsuitable.

Persist only facts needed for restart-safe idempotency/reconciliation: request ID/fingerprint, product-owned local order ID, sanitized provider reference when required, last lifecycle state and bounded timestamps/diagnostics.

Never persist provider account identity, credentials, cookies/session tokens or raw authenticated responses.

## 27. Synthetic IBKR proof

One deterministic fake provider must cover disconnected/not-authenticated/authenticated session states; empty/non-empty accounts; exact/missing/ambiguous contract resolution; snapshot preflight; what-if success/rejection; exact BUY/SELL payload translation; immediate submit; reply-required confirm success/rejection; pre-submit provider failure; post-submit transport loss; reconciliation; cancellation; partial/full fill; session timeout/keepalive; long-position SELL guard; local caller security and restart-safe request-id idempotency.

All fixtures are synthetic/public-safe.

## 28. Standalone packaging / future integration

Provide a Windows/operator launcher that makes DRY_RUN obvious and requires explicit opt-in to enable LIVE. No committed config contains account identity or authentication data.

The existing Market Flow US runtime starts independently.

A future Scanner/strategy integration must consume this authenticated local API and must not bypass it to call IBKR directly.

## 29. Market Replay recording/source model

The dedicated Replay browser artifact reuses the validated U.S. snapshot acquisition boundary but does not require the localhost market-data service while recording.

Each committed recording frame owns:

```text
strict sequence
validated snapshot timing
recordCount
complete source-shaped records
canonical membership/identity evidence required to reconstruct the normal U.S. collection candidate
bounded replay metadata
```

Only complete validated snapshots become frames. Provider acquisition/validation failure cannot create a valid frame.

IndexedDB holds the browser recording library. A closed complete recording is immutable except user naming metadata. Storage/quota failure stops new recording while preserving previously committed frames.

## 30. Portable Replay file

Version 1 is streaming-friendly UTF-8 line-oriented JSON:

```text
manifest
frame 0
frame 1
...
footer
```

Playback is allowed only after exact manifest/frame/footer identity, count, sequence and snapshot validation succeeds. Truncated/malformed/wrong-version input fails closed.

Large export is cursor/stream-oriented. Portable-file playback can build a lightweight frame-position/byte-offset index and read frames on demand; full-memory buffering and mandatory IndexedDB re-import are not requirements.

## 31. Replay Player timing

Initial speed is exactly `1x`.

The delay between two frames is the recorded difference between validated snapshot completion timestamps, not the configured poll interval.

Provider/source fields remain unchanged. Local browser timing that would normally be stamped during live acquisition is rebased to current wall clock before normal candidate/ProducerBridge emission. All cycle/chunk/security local timestamps receive one coherent segment offset so existing duration/order validation remains valid.

The Player remains ACK-gated: the next market frame cannot overtake an unresolved normal producer commit.

## 32. Pause / Resume / Stop

`Pause` emits nothing and freezes recording position without resetting the replay DB. Old scheduled callbacks are invalidated by Player generation.

`Resume` establishes a new wall-clock timing segment, preserves the remaining part of the current inter-frame delay, then continues at recorded `1x` gaps. A real pause may therefore produce a real gap in persisted replay history. This preserves compatibility with Node-owned wall-clock facts such as Demo Buy `captured_at_ms` without a server virtual clock.

`Stop` closes the current player/producer generation but never deletes the source recording.

## 33. Seek and replay isolation

A seek target snaps deterministically to a real recorded frame boundary. Seek performs no hidden historical playback:

```text
invalidate Player generation
→ stop normal producer when possible
→ Replay Host stops only the service child it owns
→ delete/reset only replay-owned DB artifacts
→ restart unchanged normal service on fresh replay DB
→ selected frame becomes first authoritative replay cycle
→ continue at recorded 1x spacing
```

Missing prior history after seek is correct and equivalent to starting the live application at that real market moment.

Replay Host must use explicit child/process ownership and replay-only DB path ownership. If the normal service port is occupied by a process it did not create, it fails closed instead of attaching to, stopping or resetting it.

## 34. Replay product surfaces

Replay reuses normal read and analytical surfaces against the isolated replay DB:

```text
Current
Detail / History
Scanner
Demo Buy
AI Investigation
```

No Viewer/Scanner call receives an `isReplay` parameter. The existing server/shared producer protocol remains unaware of recording, seek, speed or replay identity.

## 35. Replay packaging / test isolation

Replay receives a dedicated browser artifact and operator launcher. Ordinary live/demo commands retain existing semantics and do not auto-load Replay.

Replay timing is primarily tested with deterministic/fake clocks. A short real-wall-clock integration smoke is allowed; multi-hour real-time test playback is not.

Normal local acceptance must not silently inherit long Replay waits.

## 36. Historical Backtest source and baseline

Backtest is launched explicitly with `START_BACKTEST_LAB.cmd` and listens on loopback port `8767`. The browser chooses a source ID from a controlled catalog; it never supplies an arbitrary filesystem path.

Initial allowed evidence is:

```text
data/market-flow-us.duckdb
data/archive/market-flow-us-*.duckdb
```

The Lab accepts structurally compatible product-owned schema-v3/v4 market evidence. It opens sources through the dedicated read-only Backtest path, not the normal opener that may bootstrap/migrate/recover state. Locked/in-use/incompatible/corrupt evidence fails visibly. Backtest never repairs the file, steals a lock, kills/stops another process or changes source bytes.

For requested historical decision time `T0`:

```text
B = last successful complete committed cycle with committed_at_ms <= T0
```

No prior cycle makes the point explicitly unavailable. The resolved cycle and timing/provenance remain inspectable.

## 37. Backtest Query / Inspect / Compare

For baseline `B`, the user's supported Scanner SQL runs unchanged against an isolated historical surface:

```text
latest  = source history rows at cycle_id = B
history = source history rows with cycle_id <= B
```

The underlying source catalog and future rows/objects are not reachable while the Query executes. Scanner admission remains at least as strict as the normal Scanner contract. Unsupported object references fail explicitly rather than weakening isolation.

Returned row order is preserved. `Top X` means first X returned source rows before canonical-ID first-occurrence dedupe. Outcome evaluation requires exactly one recognized `securityId` or `security_id` column and preserves neutral 1-based returned-position semantics.

For each selected security, baseline facts are `history(B, securityId)`. For horizon `H`, future evidence is the first row where `cycle_id > B` and `collected_at_ms >= T0 + H`, ordered by `collected_at_ms`, then lowest `cycle_id`. Existing Demo Buy percentage/unavailable semantics are reused where equivalent.

Inspect runs one Query at one point. Compare runs the frozen Query set against the exact same source, `B`, `T0`, Top-X policy and horizon set. Compare supports two Queries by default and optional Query C. Summary is orientation only; full per-security Side-by-Side evidence and exact SQL/provenance remain available, and the product never declares a winner automatically.

## 38. Sweep

Sweep generates inclusive requested times:

```text
from, from + interval, ... <= to
```

where interval is a positive integer number of seconds or minutes within product bounds. It never interpolates/synthesizes market cycles.

Every requested `T0` remains a distinct backtest point. Several points may resolve to the same baseline `B`; Query selection may be reused once per distinct baseline because the historical Query surface is identical, but outcome horizons remain evaluated independently for each requested `T0` and Query.

One successful run exposes a bounded overview plus paged timeline. Opening one stored point uses the exact existing point result and renders it through Inspect/Compare; it must not rerun `/api/point/run` or silently replace the point with a newly resolved result. A newer successful Sweep invalidates stale in-memory handles.

Public Sweep metrics remain limited to the observable run contract:

```text
requestedPointCount
availablePointCount
unavailablePointCount
distinctBaselineCount
queryExecutionCount
```

Internal evidence-open instrumentation is not a public API field.

## 39. Backtest UX / packaging

`START_BACKTEST_LAB.cmd` is an offline-only operator path. It does not start provider login, bookmarklet/Collector, Replay or IBKR order service. It refuses a foreign process already using `127.0.0.1:8767` rather than terminating it.

Default beginner configuration is Compare, two Queries, Top 10 and horizons `10s,20s,30s,45s,60s,90s,120s`. Inline guidance explains `T0`, resolved cycle, no-lookahead, returned position, repeated Sweep baselines, Pending/Unavailable, and why Summary does not replace evidence.

Advanced SQL editing, Query C, longer horizons and detailed timing/provenance remain available without changing the simple default path.

Backtest run/Sweep results are in-memory only in the initial version. No cross-day result warehouse, optimizer state or background outcome materialization is introduced.

## 40. Current release boundary

Branch `10` deterministic reclosure must preserve all completed live-analysis, order-service and Replay contracts while adding the Backtest evidence family.

The complete Backtest candidate must prove controlled read-only source access, anti-lookahead unchanged Scanner SQL, exact outcome semantics, Inspect/Compare evidence, seconds/minutes Sweep with repeated-baseline correctness, exact stored-point Open, beginner/offline operability and bounded representative workload behavior. Affected Fast, Browser, Planning and materially affected Workload gates must be green; final diff/security/public-safe review must find no blocker; the reclosure PR must merge; required `main` CI must be green; and the open-PR audit must be clean.

Final target-machine/authenticated provider acceptance remains a separate explicitly activated evidence family/backlog item. It is not silently completed by Backtest reclosure. Actual live order placement may remain `PENDING_EXTERNAL_PERMISSION` when IBKR permission is unavailable; no live-success evidence may be fabricated.
