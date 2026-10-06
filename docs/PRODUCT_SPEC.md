# Market Flow US Product Spec

## 1. Runtime topology

Preserve the proven market-analysis topology and add one isolated execution sidecar:

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
```

Market-provider authentication remains browser-owned. IBKR CPGW authentication is separately user-owned/manual. Final market-data schema is v4.

Scanner, Demo Buy, AI Investigation and Current do not call the order service automatically in branch `8`.

## 2. Product identity and market authority

Canonical market-data security identity is validated `String(PaperId)`. `Symbol` and names are metadata only.

Successful committed market cycles remain the only market authority. Demo Buy adds analytical observation/provenance facts; AI Investigation adds derivative local export files.

The IBKR order service has separate local execution state for idempotency/reconciliation only; it does not become market-data authority and does not change schema-v4 market-day semantics.

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

Schema/provider field details remain owned by `DATA_CONTRACT.md` and `TECHNICAL_SPEC.md`. The standalone order lane is owned by `IBKR_ORDER_SERVICE.md` and `IBKR_ORDER_SERVICE_SECURITY.md`.

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

Scanner has no direct live-order authority in this mini-project.

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

The order service does not add order tables to this market-day schema. Its smallest durable idempotency/reconciliation store is separate from market authority.

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

AI Investigation cannot submit orders in branch `8`.

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

## 18. New Trading Day

New Trading Day accepts structurally valid v3 or v4 source DBs, rejects v1/v2, corrupt/partial states and running producer ownership, preserves `scanner_saved_queries`, optionally archives the source as-is, and installs a fresh v4 active DB with empty Demo Buy state.

Prior-day Demo Buy evidence never bridges into the new DB.

Order-service execution state is not part of this rollover.

## 19. Diagnostics and privacy

Market-analysis diagnostics may expose bounded operational state such as current surface, Auto mode, capture/export busy flags, skip counts and last outcome categories.

Never include SQL text, Scanner rows, history rows, pack prompt/evidence, credentials, cookies, auth/session data or raw authenticated dumps.

The order service follows the same public-safe discipline and additionally excludes provider account identifiers and local caller-token values. Order diagnostics expose only product-owned local IDs, bounded lifecycle state, stable error code/checkpoint and sanitized causal messages.

## 20. Performance discipline

Use the existing architecture first:

```text
static SQL preflight
→ tiny deterministic fixtures
→ bounded active-day workload
→ optimize only on evidence
```

Do not add background horizon materialization, another market-data transport/DB, a speculative history index or Strategy Engine before evidence requires it.

The isolated local order HTTP API is a deliberate new execution boundary; it is not a replacement transport for market-data/Viewer traffic.

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

## 29. Release boundary

Deterministic implementation/reclosure completes before final target-machine/authenticated acceptance.

The exact final candidate must prove Demo Buy capture/evaluation, Auto operability, targeted refresh, AI Investigation pack generation/regeneration, and the permission-independent standalone IBKR order-service contract locally before final acceptance is considered complete.

Actual live order submission may remain `PENDING_EXTERNAL_PERMISSION` when IBKR permission is not yet available; no live-success evidence may be fabricated.
