# Market Flow US Product Requirements

## Ownership

This document owns **what the user must be able to do and understand**. Exact provider/data semantics belong to `DATA_CONTRACT.md`; implementation/protocol mechanics to `TECHNICAL_SPEC.md` and `DEMO_BUY_PROTOCOL_LIMITS.md`; browser interaction details to `DEMO_BUY_UX.md`; AI-pack contents to `AI_INVESTIGATION_PACK.md`; the standalone execution sidecar to `IBKR_ORDER_SERVICE.md` plus `IBKR_ORDER_SERVICE_SECURITY.md`; Market Recording + Replay to `MARKET_REPLAY.md`; verification to `TEST_STRATEGY.md`.

## 1. Product outcome

Market Flow US is a local, single-user U.S.-market product with three separated lanes:

```text
validated U.S. market snapshots
→ durable Current/history authority
→ editable read-only Scanner SQL
→ Demo Buy short-horizon validation
→ AI Investigation evidence for improving Scanner SQL

separate standalone execution sidecar
→ authenticated loopback IBKR order service
→ dry-run / what-if by default
→ explicit future live BUY/SELL only when every local/provider gate passes

separate Market Recording + Replay lane
→ validated browser snapshots
→ IndexedDB and/or portable recording
→ Play / Pause / Seek at original 1x frame spacing
→ normal producer protocol
→ unchanged Market Flow US service
→ isolated replay-only DuckDB
```

Demo Buy remains analytical evidence only. It does not place or simulate broker orders, fills, portfolios, fees, sell rules or liquidity/fillability. The IBKR order service is isolated and is **not** automatically driven by Scanner, Demo Buy, AI Investigation or Current. Replay is also isolated and does not add replay awareness to the normal market-data service/protocol.

## 2. Core user outcomes

The user can:

1. collect complete validated U.S. screener snapshots from the authenticated browser into local Node/DuckDB authority;
2. inspect Current and per-security history, including historical-only securities;
3. run recurring editable read-only Scanner SQL and manage saved queries;
4. create Demo Buy observations from selected rows, all rows or first X source rows, manually or automatically;
5. preserve the exact Scanner generation, original result rank and exact authoritative buy-history link for every observation;
6. inspect what source `Price` did after the virtual-buy acceptance at 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m;
7. distinguish pending future evidence from unusable baseline/future-price evidence and from integrity failure;
8. keep tracking one older observation while automatic capture continues creating newer observations;
9. inspect immutable query/provenance details without later draft/query edits rewriting old observations;
10. generate a local AI Investigation Pack for one observation, copy its disciplined prompt/path, and regenerate it when more outcome evidence exists;
11. understand when AI evidence is partial, when the target is outside retained Scanner peer context, and which facts were actually authoritative at decision time;
12. restart safely, rotate to a new trading day while preserving saved queries, and retain prior-day evidence only in its self-contained archived DB;
13. run deterministic Fake Market/local acceptance before final target-machine/authenticated verification;
14. run a separate Node 24 `ibkr-order-service` on loopback without changing the existing market-data runtime;
15. create strict normalized U.S.-equity BUY/SELL intents and obtain deterministic dry-run/provider what-if previews without submitting an order;
16. keep live submission fail-closed behind authenticated local caller access, explicit process-level live enablement, explicit request-level LIVE mode, valid IBKR session/account/permission, successful instrument/snapshot/what-if preflight and all local safety guards;
17. observe explicit order lifecycle/reply/cancel/reconciliation/trade states without blind duplicate submission after an uncertain acknowledgement;
18. keep real credentials, cookies/session tokens, account identifiers and raw authenticated IBKR dumps out of repository, persistence and diagnostics;
19. record complete validated provider snapshots in the browser while the localhost market-data service is stopped;
20. keep multiple recordings in IndexedDB with visible duration/frame-count/size/storage state, export them to a portable streaming-friendly file and delete browser copies only by explicit user choice;
21. select either an IndexedDB recording or a portable file and replay it without mandatory full-memory loading or mandatory IndexedDB re-import;
22. use a media-player-style `Play`, `Pause`, `Stop` and seekable progress bar at `1x`, preserving the exact observed gaps between recorded frames rather than a nominal poll cadence;
23. start or seek to any real recorded frame with no hidden warm-up, so missing earlier history behaves exactly like a normal live start in the middle of the trading day;
24. replay on a later day while provider market values stay original and local collection/cycle timestamps are externally rebased to contemporary wall-clock time;
25. run the normal Current/Detail-History/Scanner/Demo Buy/AI Investigation surfaces against a replay-only DB while the server/shared producer protocol remain replay-unaware.

## 3. Canonical identity and authority

Canonical market-data identity is validated `String(PaperId)`. `Symbol` and display names are metadata only.

Market authority remains successful committed `history`/`latest` rows. Demo Buy never mutates market authority. The isolated order service has a separate execution responsibility and does not become market-data authority. Replay recordings are source artifacts before Node authority; once replayed, only normally committed replay DB rows become market authority for that replay session.

For one Demo Buy item:

```text
baseline identity = (buy_cycle_id, security_id)
```

`buy_cycle_id` is also the capture-time market-authority watermark because market commits and Demo Buy capture share the serialized writer.

Therefore:

```text
prediction-time authority: cycle_id <= buy_cycle_id
post-capture authority:    cycle_id > buy_cycle_id
```

Wall-clock timestamps remain useful diagnostics but never override writer/cycle ordering.

## 4. Current and History

Current shows exactly one latest committed row for every currently authoritative security using source-shaped U.S. fields. Default sort remains `DailyVolume DESC` with deterministic identity tie-break.

Detail/History preserves newest-first 500-row keyset paging, retry without losing loaded rows, historical-only lookup and return-state preservation.

Numeric zero, SQL NULL, empty string and missing source property must never be conflated in user-visible semantics.

## 5. Scanner

Scanner remains a general read-only SQL surface. The application adds no hidden ranking, filtering, sorting or LIMIT.

It provides:

- Draft / Persisted / Active separation;
- saved-query CRUD and immutable copyable built-ins;
- explicit `Activate`;
- a resumable `Stop recurring scan` action that stops future generations without destroying the Viewer and permits a later Activate;
- exact result-table reflection;
- Detail navigation only from a canonical identity column;
- Demo Buy controls only when exactly one recognized `securityId` or `security_id` column exists.

Stopping recurring scan stops future Scanner generations and therefore future Auto Demo Buy attempts. Auto configuration may remain armed for the next later Activate.

Scanner has no direct order-submit authority in branch `8` and no replay-specific SQL authority in branch `9`.

## 6. Demo Buy selection

Supported modes:

```text
manual selected rows
all source rows
Top X source rows
automatic all
automatic Top X
```

Selection is source-row-first:

```text
choose source rows
→ validate every chosen identity
→ dedupe canonical IDs by first chosen occurrence
→ preserve original 1-based resultRank
```

`Top X` means exactly the first X source rows before dedupe; duplicates never pull a later row from outside X.

The browser freezes the exact displayed Scanner generation and chosen row set synchronously when capture is invoked. A newer Scanner generation cannot change an already-started capture.

The browser performs preflight; Node independently validates and never silently repairs duplicate/malformed protocol input. Exact numeric/byte/context bounds are owned by `DEMO_BUY_PROTOCOL_LIMITS.md`.

## 7. Demo Buy timing and acknowledgement

The browser never supplies a buy price.

`captured_at_ms` is assigned inside the serialized Node capture operation when the capture actually owns its writer-order position. Scanner completion time, browser click time and baseline collection time are diagnostic context, not the authority ordering.

Capture outcomes are exactly:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Unknown acknowledgement is never shown as confirmed failure and never blindly replayed. The user reconnects/relaunches, refreshes Demo Buy, then decides whether another observation is needed.

## 8. Demo Buy evaluation

For every fixed horizon `H`:

```text
target_at_ms = captured_at_ms + H
```

The future observation is the first row satisfying both:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying row remains authoritative even when its `Price` is NULL; the evaluator never skips forward to obtain a nicer value.

Outcome is `UP`, `DOWN`, `FLAT` or `UNAVAILABLE`. Unavailable reason distinguishes no future observation, unavailable baseline price, zero baseline and unavailable matched future price. A missing baseline **row** is an integrity error.

No horizon result is persisted or updated in the background.

## 9. Demo Buy user experience

Top-level navigation is:

```text
Current | Scanner | Demo Buy
```

Automatic capture can continue while Scanner is hidden, so an enabled Auto mode has a persistent cross-surface indicator and direct Off action.

The Demo Buy screen is capture-oriented. Capture metadata appears once per capture group; item rows preserve original result rank. Each horizon uses one compact cell containing outcome + percentage + Price rather than three independent columns. Leading identity/baseline columns remain visible while horizontally scrolling.

`NO_FUTURE_OBSERVATION` is presented as Pending/ממתין; non-temporal unavailable reasons are warnings rather than “wait longer”. Direction is never color-only.

`Load more` continues one stable keyset walk. `Refresh latest` intentionally resets to page one. A separate targeted action:

```text
demo.buy.observation.get(captureId, securityId)
```

backs `Refresh observation`, so an older observation remains trackable while Auto adds newer captures.

A failed refresh/detail/export operation preserves already trustworthy rendered data and scopes the error to the smallest affected area.

## 10. Automatic capture operability

Auto is Viewer-session-only and starts Off after relaunch.

Enabling/changing Auto applies only to **future successful Scanner generations** and never retroactively captures the result already on screen.

One Viewer-wide capture slot covers manual and automatic submission. Busy Auto generations are skipped visibly, never queued. Zero-result successful generations are normal no-ops. Bounded status shows current mode, last capture result, captured count, busy-skip count and last skip/error reason without an unbounded activity log.

## 11. AI Investigation Pack

Every Demo Buy observation exposes `Investigate with AI` and local pack generation.

The product does **not** call an AI provider, store an AI credential, automatically upload evidence or edit/activate SQL.

The pack contains exact immutable query/provenance, bounded original Scanner comparison context, prediction-time target history, exact baseline, post-capture history, trusted Demo Buy outcomes, field semantics and an anti-hindsight prompt.

Prediction-time evidence is constrained by both time and capture authority watermark. Outcome evidence is strictly post-watermark. The AI is instructed to separate fact, derived calculation and hypothesis; any Scanner improvement must cite evidence that was available at capture time and must be validated across multiple observations rather than accepted from one anecdote.

Targets outside retained Top-50 Scanner context remain investigable with `targetInScannerContext=false`; the prompt forbids fabricated peer/rank reconstruction.

The Viewer provides Generate/Regenerate, Partial/Complete status, `Copy AI Prompt`, and `Copy folder path`. At most one export is in flight per Viewer. Clipboard failure exposes selectable fallback text.

Returned/displayed export paths are product-relative under `exports/ai-investigations/`, never absolute machine/user paths.

AI Investigation has no direct order-submit authority in branch `8`.

## 12. Daily lifecycle

The active market DB represents one trading day.

New Trading Day accepts a structurally valid Market Flow US v3 or v4 source, rejects unsupported/corrupt/running states, preserves `scanner_saved_queries`, optionally archives the source unchanged, and installs a fresh schema-v4 active DB with empty Demo Buy tables.

Demo Buy evidence never crosses into a new active-day DB without its referenced history. Archived v4 DBs remain self-contained; archived v3 DBs remain valid pre-Demo-Buy historical databases.

Order-service idempotency/reconciliation persistence is a separate local execution concern and must not be copied into the market-day DB lifecycle. Replay DBs are also separate temporary/local authorities and are never treated as the normal active trading-day DB.

## 13. Security / privacy

The market provider browser owns market-data authentication. Credentials, cookies, session data, account identifiers and raw authenticated dumps never enter the repository, diagnostics, Demo Buy payloads, AI packs or replay recordings.

The IBKR provider browser/gateway authentication is also user-owned. The order service never accepts credentials, persists provider account identity or authentication/session material, or exposes raw authenticated provider responses.

Loopback binding alone is not authorization for an order-capable service. Every protected order-service endpoint requires the ephemeral local caller credential defined in `IBKR_ORDER_SERVICE_SECURITY.md`; browser-origin requests are rejected by default and wildcard/credentialed CORS is forbidden.

Replay Host control is also loopback-only, exact-Origin-scoped and limited to a child process/DB it owns. It must fail closed rather than attach to, stop or reset an unrelated service/DB.

Generated AI packs are explicit local user artifacts and are git-ignored. Support diagnostics may contain bounded status/counters/IDs, not SQL text or evidence payloads.

## 14. Analytical-lane non-goals

The following remain non-goals for Scanner / Demo Buy / AI Investigation themselves:

```text
automatic real orders
manual buy price
portfolio/P&L/risk
fees/slippage/sell automation
trade quantity accounting
liquidity/fillability proof
aggregate strategy dashboard/scorecard
background horizon materialization
Strategy Engine
cross-day strategy warehouse
AI API/provider integration
automatic AI SQL mutation
```

Branch `8` deliberately adds a **separate** order-execution sidecar; this does not convert Demo Buy into execution. Order-service non-goals additionally include short selling, options/futures/FX, bracket/OCA/algo orders, automated CPGW login, credential storage and permission bypass.

Liquidity/volume/fillability strategy analysis remains a later phase.

## 15. Standalone IBKR order-service requirements

The durable execution contract is `IBKR_ORDER_SERVICE.md` plus `IBKR_ORDER_SERVICE_SECURITY.md`.

Initial observable requirements:

```text
Node.js 24
127.0.0.1:8770 only
high-entropy per-run local caller authorization
DRY_RUN default
U.S. STK / USD / SMART
BUY / SELL
LMT / MKT
DAY / GTC
requestId idempotency
no short opening
```

The user must be able to preview a normalized intent without live submission, and later enable LIVE without redesign when provider permission becomes available. Live submission must still fail closed unless every local authorization/live/risk gate and every IBKR session/account/permission/what-if/confirmation requirement is satisfied.

Provider reply-required states, cancellation, partial/final fill observation, session expiry and `ACKNOWLEDGEMENT_UNKNOWN` must remain explicit and diagnosable. Unknown provider questions are never automatically accepted.

## 16. Market Recording + Replay requirements

The durable Replay contract is `MARKET_REPLAY.md`.

The recorder must run independently of the localhost market-data service and store only complete validated browser snapshots plus replay metadata. It must never capture authentication/session/account/private DOM state.

The browser library must expose recording identity/name, original start/end, duration, frame count, approximate size, completion state and storage/quota status when available. Quota failure must preserve previously committed frames and must never auto-delete older recordings.

Portable recordings must be versioned and streaming-friendly. Large export/file playback must not require loading the whole recording into memory, and selecting a portable file must not require copying it into IndexedDB before playback.

Playback is `1x` in initial scope. Frame sequencing follows the exact recorded validated-snapshot completion gaps, including irregular delays. Provider/source values remain unchanged.

Local collection/cycle timestamps that live acquisition would stamp locally are externally rebased to contemporary wall-clock time before normal producer emission. The service/shared producer protocol receive no Replay-specific operation or flag.

`Pause` freezes recording position and emits no new cycles. `Resume` starts a new wall-clock timing segment while preserving the remaining inter-frame delay; a real pause may therefore appear as a real history gap.

`Seek` starts a fresh replay authority at a real frame boundary:

```text
invalidate old player generation
→ stop only the Replay-Host-owned service child
→ reset only replay-owned DB artifacts
→ restart unchanged service on fresh replay DB
→ selected frame is first committed market frame
→ continue at recorded 1x spacing
```

No hidden `fast-forward`/`preroll` is permitted. Missing earlier history is normal start-of-session behavior and must not be disguised by Replay-specific server behavior.

Replay Host must never attach to or terminate a process it did not create, and must never open/reset/delete the normal live DB.

Normal `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` and `START_MARKET_FLOW_US.cmd` retain their existing semantics and do not auto-load Replay.

## 17. Completion requirement

Branch `9` is ready for implementation only when the Replay durable/generic contracts, decisions, TREE, tests, allocation and handoff are mutually consistent and the plan is frozen/authorized.

Branch `9` implementation is complete only after deterministic recorder/file/player/host/next-day/mid-recording-start acceptance is green, affected normal verification remains green without hidden long real-time waits, the exact complete-product candidate is re-pinned, and final target-machine/provider acceptance `7.4` resumes on that candidate.

Software implementation of the already-completed branch `8` remains governed by its existing order-service contract; actual live submission may remain exactly `PENDING_EXTERNAL_PERMISSION` when external IBKR permission is unavailable.

Overall product completion still requires all assigned leaves, deterministic re-closure, final target-machine/provider acceptance, merged PRs, green main CI and no blocking defect.
