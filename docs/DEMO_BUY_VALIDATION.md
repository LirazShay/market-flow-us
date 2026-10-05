# Demo Buy Strategy Validation — Phase 1 Contract

## 1. Purpose

Demo Buy answers:

> When Scanner selected a security and the virtual buy was accepted, what did persisted source `Price` do afterward over the strategy's short horizons?

It is analytical validation only. It is not a broker/order/fill simulator, portfolio/P&L engine, sell engine or liquidity model.

Phase 2 may later investigate traded volume/liquidity/fillability. That work is excluded here.

## 2. Responsibility split

```text
Persistence facts
→ trusted Node evaluation/read model
→ Viewer UX
→ optional local AI Investigation export
```

Persistence stores only reconstructable facts/provenance. Node owns evaluation. Browser owns interaction/presentation and never independently reconstructs horizon authority.

## 3. Scanner generation provenance

Each successful Scanner result used for Demo Buy has an immutable generation snapshot:

```text
queryId | null
name | null
exact activated SQL
active intervalMs
startedAtMs
completedAtMs
rowCount
columns
rows
```

Editing/selecting/saving another draft later never rewrites that result generation.

Wall-clock times are diagnostics only. If clock movement makes a derived duration negative, preserve raw timestamps, return the derived value as null and expose a bounded timing anomaly indicator. Do not reject an otherwise authoritative capture or clamp negative diagnostics to zero.

## 4. Identity and selection

A Scanner result is Demo-Buy-capable only when it contains exactly one recognized identity column named `securityId` or `security_id`.

Identity is never inferred from `Symbol`.

Modes:

```text
manual selected
all
Top X
auto all
auto Top X
```

Selection semantics:

1. choose source rows according to mode;
2. validate every chosen identity;
3. dedupe canonical security IDs by first chosen occurrence;
4. retain each remaining row's original 1-based `resultRank`.

Manual rows are ordered by original Scanner result order, not checkbox click order. `Top X` means the first X **source rows before dedupe**; duplicates never backfill from rows after X.

The browser freezes the displayed generation snapshot + chosen rows synchronously when the capture action starts. A later recurring result cannot change the in-flight capture.

## 5. Capture/provenance bounds

Exact limits and deterministic shaping rules are owned by `docs/DEMO_BUY_PROTOCOL_LIMITS.md`.

Current required limits include:

```text
unique capture items <= 5000
source SQL <= 1 MiB UTF-8
Scanner context <= first 50 source rows
retained context columns <= 64 total, canonical identity mandatory
textual/serialized cell <= 128 UTF-8 bytes after deterministic clipping
serialized context JSON <= 256 KiB UTF-8
```

The browser preflights; Node independently validates.

Scanner context is immutable provenance, not market authority. Original ranks/source-column metadata plus omission/truncation metadata are preserved.

For every selected item with `resultRank <= 50`, Node requires the retained context row at that rank to exist and contain the same canonical identity. Mismatch/missing/unusable identity fails the whole capture before commit.

Items ranked above 50 remain valid observations; later investigation reports `targetInScannerContext=false`.

## 6. Capture request authority

The browser sends ordered deduped items:

```text
{ securityId, resultRank }
```

plus immutable source-query/result/context provenance and mode metadata. It never sends a buy price.

Node rejects malformed duplicates/out-of-order ranks/context rather than silently repairing them.

Capture uses the existing shared serialized writer:

```text
validate request/context
→ enqueue behind earlier writer work
→ BEGIN
→ assign captured_at_ms
→ resolve all selected IDs from authoritative latest
→ require all to resolve
→ allocate capture_id
→ persist capture + items + exact buy_cycle_id links
→ COMMIT
```

Any unresolved item or persistence failure rolls back the entire capture.

## 7. Baseline and authority watermark

Each item links:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The linked history row owns baseline `Price`, Symbol/name metadata and `collected_at_ms`.

Because market commits and Demo Buy captures share the serialized writer, `buy_cycle_id` is also the capture-time market-authority watermark:

```text
prediction-time authoritative rows: cycle_id <= buy_cycle_id
post-capture authoritative rows:    cycle_id > buy_cycle_id
```

This ordering is stronger than wall-clock timestamps and prevents later-committed data from leaking backward merely because its local timestamp is earlier.

## 8. Capture acknowledgement states

After request dispatch the Viewer distinguishes exactly:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Unknown acknowledgement means transport closed before a conclusive response and the capture may already have committed.

Rules:

- never auto-replay an unknown capture;
- block further capture in that Viewer instance until explicit reconnect/relaunch;
- refresh Demo Buy before the user chooses another capture;
- never label unknown as confirmed failure.

No durable idempotency subsystem is added in Phase 1 unless implementation evidence proves this recovery insufficient.

## 9. Capture backpressure / Auto

One Viewer-wide capture slot covers manual and automatic capture.

```text
manual while free → freeze generation/selection, submit once
manual while busy → disabled/refused
Auto while free   → submit once for that generation
Auto while busy   → visibly skip, never queue/replay
```

A successful zero-row generation is a normal no-op.

Auto is Viewer-session-only: `Off | All | Top X`. Enabling/changing Auto affects only future successful Scanner generations and never retroactively captures the result already shown.

Auto mode/status remains visible across Current/Scanner/Demo Buy and can be turned off there. Turning it off does not cancel a capture already in flight.

Scanner recurring execution has a resumable Stop action. While stopped no new generations/Auto attempts occur; a later Activate resumes normal behavior.

## 10. Schema v4 facts

`demo_buy_captures` stores only:

```text
capture_id
captured_at_ms
source_query_id/name/sql
source_interval_ms
source_result_started_at_ms
source_result_completed_at_ms
source_result_row_count
source_result_context_json
selection_mode
is_automatic
top_x
```

`demo_buy_items` stores only:

```text
capture_id
result_rank
security_id
buy_cycle_id
```

No baseline/future Price, percentage, outcome or horizon status is persisted.

Fresh DB boots v4. Valid v3 migrates transactionally. v3 with suspicious partial Demo Buy structures fails closed. Migration failure leaves v3 semantically usable. v1/v2 remain unsupported.

No new history index is part of the initial contract.

## 11. Horizons

Fixed Phase-1 horizons:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m, 10m
```

For horizon H:

```text
target_at_ms = captured_at_ms + H
```

The future observation is the first row satisfying:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying row wins even if `Price` is NULL; do not skip it for a later priced row.

## 12. Percentage/outcome semantics

```text
changePercent = ((futurePrice / baselinePrice) - 1) * 100
```

Outcome:

```text
UP           > 0
DOWN         < 0
FLAT         = 0
UNAVAILABLE  percentage is null
```

Unavailable reason precedence:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

Missing immutable baseline **row** is an integrity/read error, not `UNAVAILABLE`.

For matched future rows expose target time, actual observed time and elapsed time. Timing anomalies are diagnostic only.

## 13. Trusted read operations

Viewer-role operations:

```text
demo.buy.capture
demo.buy.page
demo.buy.capture.get
demo.buy.observation.get
demo.buy.ai-pack.create
```

Keep protocol version 1 unless implementation proves incompatibility.

### `demo.buy.page`

- fixed 50-item page size;
- ordering `capture_id DESC, result_rank ASC`;
- opaque keyset cursor;
- one transactionally consistent DuckDB statement snapshot per page;
- new captures do not disturb an existing continuation walk;
- full SQL/context are not repeated per item.

### `demo.buy.capture.get`

Returns one immutable capture provenance record including exact SQL and source timing/mode/count details.

### `demo.buy.observation.get`

Payload:

```text
captureId
securityId
```

Returns exactly one browser-ready observation using the same trusted evaluator/authority-watermark semantics as `demo.buy.page`. It exists so a user can keep refreshing one older observation while Auto creates newer captures.

## 14. Viewer UX

Detailed interaction truth is owned by `docs/DEMO_BUY_UX.md`.

Required behavior includes:

- top-level `Current | Scanner | Demo Buy`;
- persistent Auto indicator/off action when enabled;
- accessible row selection that does not trigger row-to-Detail navigation;
- grouped capture presentation;
- sticky identity/baseline columns;
- one compact cell per horizon containing outcome + percentage + Price;
- `Pending / ממתין` presentation for `NO_FUTURE_OBSERVATION`;
- warning presentation for non-temporal unavailable reasons;
- `Refresh latest`, `Load more`, and per-item `Refresh observation`;
- scoped errors preserving already trustworthy data;
- on-demand provenance/SQL details.

## 15. AI Investigation integration

Every Demo Buy item can open an `Investigate with AI` panel and invoke local `demo.buy.ai-pack.create`.

AI Investigation is a read/export feature. It calls no external AI, accepts no AI key, changes no Scanner SQL and performs no DB mutation.

Evidence partitions use the same authority watermark:

```text
prediction-time: cycle_id <= buy_cycle_id
outcome-time:    cycle_id > buy_cycle_id
```

Pack contents/prompt/partial-complete semantics are owned by `AI_INVESTIGATION_PACK.md` and `DEMO_BUY_PROTOCOL_LIMITS.md`.

One Viewer-wide export slot prevents queued Generate/Regenerate requests. Lost export acknowledgement may be regenerated safely after reconnect because export is non-mutating and collision-safe.

## 16. Daily lifecycle

Demo Buy belongs to the active trading day's evidence.

New Trading Day accepts valid v3 or v4 source DBs, preserves saved queries, optionally archives source as-is, and creates a fresh v4 DB with empty Demo Buy state. Unsupported/corrupt/running states fail closed.

Horizon evaluation never bridges into a next-day active DB. A prior-day archived v4 remains self-contained; unresolved horizons stay unresolved if persisted evidence never reached them.

## 17. Diagnostics and performance

Stable concepts include:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.provenance_read
demo_buy.observation_read
demo_buy.ai_pack
demo_buy.viewer
```

Diagnostics are sanitized and never dump stored SQL, context/history rows, AI prompt/evidence or authenticated session material.

All new/materially changed SQL requires static SQL preflight before first execution, then deterministic fixture proof and bounded active-day measurement. Do not add precompute/index/background subsystems without evidence.

## 18. Verification ownership

`TEST_STRATEGY.md` must prove:

- source-row-first selection/dedupe/original rank;
- every exact protocol/context bound and limit+1 boundary;
- context↔item identity integrity;
- v3→v4 migration/rollback/partial-state rejection;
- writer-order baseline and authority watermark;
- lost-ACK unknown behavior without replay;
- one capture slot / Auto busy skip / resumable Scanner Stop;
- horizon `cycle_id > buy_cycle_id` and unavailable semantics;
- consistent 50-item paging and targeted `observation.get` refresh;
- capture-group/compact-horizon UX and Pending vs warning states;
- AI export anti-hindsight/atomicity/relative path/export-slot/clipboard fallback;
- v3/v4 new-day lifecycle and preserved saved queries.
