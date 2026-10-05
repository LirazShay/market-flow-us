# Market Flow US Technical Spec

## 1. Architecture

Preserve the proven MarketScope-derived topology and extend only existing boundaries:

```text
authenticated provider browser
  ├─ U.S. ScreenerHulPaging3 adapter
  ├─ Recorder / Producer Bridge
  └─ Viewer
       ├─ Current
       ├─ Detail / History
       ├─ Scanner
       └─ Demo Buy / AI Investigation
                     │
                     │ ws://127.0.0.1:8765
                     ▼
localhost Node.js
  ├─ WebSocket protocol/service
  ├─ producer/session authority
  ├─ one serialized writer
  ├─ native DuckDB
  ├─ trusted Viewer reads
  ├─ hardened Scanner
  ├─ saved-query library
  ├─ Demo Buy capture persistence
  ├─ Demo Buy evaluator/read model
  └─ deterministic local AI-pack exporter
```

Do not add a cloud backend, second transport, second DB authority, Strategy Engine, background horizon worker or automatic AI integration for this increment.

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

## 3. Canonical identity

```text
securityId = String(PaperId)
```

after fail-closed source-type validation. `Symbol`, row order, names and `PaperIdYatab` never become primary identity.

Demo Buy/AI targets use canonical `security_id` only.

## 4. Existing market authority remains unchanged

The proven U.S. acquisition/authority design remains:

```text
complete validated ScreenerHulPaging3 response
→ membership handling
→ one complete cycle
→ serialized transaction
→ history append
→ latest full replacement
→ ACK
```

`history` remains keyed by `(cycle_id, security_id)` and `latest` by `security_id`.

Demo Buy never mutates market authority.

## 5. Schema v4

After this feature ships the active schema is **schema v4**.

Tables:

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

Fresh DBs bootstrap directly as v4.

Valid v3 migration:

```text
validate exact v3 prerequisites
→ require neither Demo Buy table already exists
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info to v4/current product version
→ COMMIT
```

A v3 DB containing partial Demo Buy structures fails closed; do not normalize it with `IF NOT EXISTS`. Fault injection must prove migration rollback leaves the original v3 usable.

No speculative `history` index is introduced before representative measurement proves one necessary.

## 6. Demo Buy persisted schema

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

### `demo_buy_items`

```text
capture_id BIGINT NOT NULL
result_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, result_rank)
```

`result_rank` is the historical field name for the original 1-based returned Scanner row position. It does not itself establish semantic ranking; only the exact SQL ordering can do that.

Use simple DuckDB CHECK constraints for direct row-shape/mode invariants where they remain simple. Cross-field/context semantics stay in service validation.

A physical FK is not required in Phase 1; capture establishes the semantic baseline link and reads treat a missing link as corruption.

## 7. Protocol

Keep protocol version `1` unless implementation proves incompatibility.

Add Viewer-role operations:

```text
demo.buy.capture
demo.buy.page
demo.buy.observation.get
demo.buy.capture.get
demo.buy.ai-pack.create
```

No second API/transport is introduced.

## 8. `demo.buy.capture`

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
  context: bounded deterministic Scanner context
selectionMode: manual | all | top_x
isAutomatic: boolean
topX: integer | null
```

Rules:

- exact object keys;
- `items.length` is `1..5000`;
- IDs/returned positions are unique; positions positive, strictly increasing and `<= rowCount`;
- `top_x` positions are `<= topX`, with `1 <= topX <= 5000`;
- automatic is valid only for `all`/`top_x`;
- no buy-price field exists;
- exact SQL must satisfy the Demo Buy provenance bound;
- context must satisfy `docs/DEMO_BUY_PROTOCOL_LIMITS.md`;
- for every item whose `resultRank <= 50`, context row/position/identity must match exactly.

Browser selects source rows first, then first-occurrence dedupes canonical IDs and preserves original `resultRank` returned position. Node validates and never silently repairs protocol meaning.

Response:

```text
captureId
capturedAtMs
capturedItemCount
```

## 9. Scanner-context bounds

Concrete normative limits:

```text
selected unique items            <= 5000
securityId UTF-16 code units     <= 128
source SQL UTF-8 bytes           <= 1 MiB
Scanner source rows retained     <= 50
Scanner columns retained         <= 64 total
canonical identity column        always retained
textual/serialized cell          <= 128 UTF-8 bytes after deterministic clipping
serialized context JSON          <= 256 KiB UTF-8
```

Retain identity unconditionally, then fill remaining column budget from earliest source columns in original order. Preserve original column indexes/names and omission/truncation metadata.

Arrays/objects use deterministic canonical JSON representation for **persisted local provenance**. If shaping cannot produce a valid context within bounds, capture fails visibly before commit; it does not silently drop extra evidence beyond the documented shaping rules.

Persisted context is not automatically shareable; AI export derives the separate sharing-safe projection defined below and in `AI_INVESTIGATION_PACK.md`.

## 10. Capture execution and authority

Use the existing shared serialized writer:

```text
validate request/context
→ enqueue behind prior work
→ BEGIN
→ captured_at_ms = Node clock
→ resolve every selected security from latest
→ require all IDs to resolve
→ allocate positive monotonic capture_id
→ persist capture/context
→ persist each latest.cycle_id as buy_cycle_id
→ COMMIT
```

All-or-nothing failure.

Writer order determines virtual-buy authority:

```text
cycle commits first → capture may reference that cycle
capture commits first → capture references prior latest cycle
```

`buy_cycle_id` is therefore both baseline identity and the captured item's authority watermark.

## 11. Timing diagnostics

Scanner `startedAtMs`/`completedAtMs`, market `collectedAtMs` and Demo Buy `capturedAtMs` are wall-clock diagnostics, not authority ordering.

Do not reject an otherwise authoritative capture merely because wall clock moved backward.

Derived diagnostics:

```text
scannerDurationMs = completed-started when non-negative else null
captureLatencyMs  = captured-completed when non-negative else null
baselineAgeMs     = captured-baselineCollected when non-negative else null
```

Negative relationships set a bounded `timingAnomaly` indicator. Never clamp to zero or reorder authority using timestamps.

## 12. Capture acknowledgement semantics

Because a capture may commit before its response reaches the browser, client outcomes are:

```text
CONFIRMED_COMMITTED
CONFIRMED_REJECTED
ACKNOWLEDGEMENT_UNKNOWN
```

Transport loss after request dispatch before a conclusive response is `ACKNOWLEDGEMENT_UNKNOWN`.

Rules:

- never auto-replay the unknown capture;
- lock further capture submission for that Viewer instance;
- require explicit reconnect/relaunch and Demo Buy refresh before a new capture;
- do not label unknown as confirmed failure;
- do not add durable idempotency solely for this rare local race unless evidence reopens the plan.

## 13. Demo Buy evaluator

One trusted Node evaluator owns all horizon semantics. Browser performs no independent market arithmetic.

Fixed horizons in milliseconds:

```text
10000, 20000, 30000, 45000, 60000,
90000, 120000, 180000, 300000, 600000
```

For one item and horizon:

```text
targetAtMs = captured_at_ms + horizonMs
```

Future row:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= targetAtMs
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The first qualifying post-watermark row wins even if `Price` is NULL.

Baseline is the exact `(buy_cycle_id, security_id)` history row; absence is a stable integrity error.

Derived fields:

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

Outcome/reason semantics are defined by `DATA_CONTRACT` and `DEMO_BUY_VALIDATION`.

## 14. `demo.buy.page`

Payload:

```text
cursor: string | null
```

Fixed Phase-1 page size: **50 items**.

Ordering:

```text
capture_id DESC
result_rank ASC
```

Cursor is opaque and binds the last `(capture_id,result_rank)`. Newer captures do not perturb an already-started continuation walk; `Refresh latest` starts a new walk.

A page is evaluated from one transactionally consistent DuckDB read snapshot. Prefer one set-wise SQL statement/CTE on the existing Viewer read connection; do not implement N×10 timed queries.

Response contains enough compact capture metadata to render capture grouping even when a capture spans page boundaries, plus item baseline/timing and ten horizons. Full SQL/context are not repeated per item.

## 15. `demo.buy.observation.get`

Payload:

```text
captureId: positive safe integer
securityId: canonical bounded string
```

Return exactly one existing capture item using the **same evaluator and authority-watermark semantics** as `demo.buy.page`.

Purpose: `Refresh observation` updates an older observation in place while Auto capture continues adding newer captures. It must not reset list pagination or scroll state.

Not-found/membership mismatch is a stable read error. Targeted refresh mutates nothing.

## 16. `demo.buy.capture.get`

Payload:

```text
captureId: positive safe integer
```

Return immutable capture header/provenance once:

```text
captureId
capturedAtMs
sourceQueryId/name/sql
sourceIntervalMs
sourceResultStartedAtMs/completedAtMs/rowCount
selectionMode
isAutomatic
topX
capturedItemCount
timing anomaly summary when derivable
```

Do not repeat full first-50 context unless needed by the AI export path.

## 17. AI Investigation temporal partition

Prediction-time target history:

```text
same security_id
AND cycle_id <= buy_cycle_id
AND collected_at_ms >= captured_at_ms - 30 minutes
AND collected_at_ms <= captured_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
```

Outcome target history:

```text
same security_id
AND cycle_id > buy_cycle_id
AND collected_at_ms >= captured_at_ms
AND collected_at_ms <= captured_at_ms + 10 minutes
ORDER BY collected_at_ms ASC, cycle_id ASC
```

This prevents hindsight leakage from rows collected earlier but committed after capture.

## 18. AI Investigation completeness

```text
postWindowEndMs = captured_at_ms + 10 minutes
evidenceWatermarkMs = max collected_at_ms from committed cycles after buy_cycle_id
```

Then:

```text
COMPLETE_OUTCOME when evidenceWatermarkMs >= postWindowEndMs
PARTIAL_OUTCOME otherwise
```

No wall-clock-only or “day ended” shortcut.

## 19. `demo.buy.ai-pack.create`

Payload:

```text
captureId
securityId
```

Server:

1. validates target membership;
2. loads immutable query/context/timing provenance;
3. validates `targetInScannerContext` semantics;
4. loads exact baseline and authority-watermarked pre/post history;
5. reuses the trusted evaluator for `OUTCOME.json`;
6. derives the sharing-safe history/baseline and Scanner-context projections before any file write;
7. verifies forbidden operational/session fields and redacted-value contents are absent from all shareable files/prompt/README/manifest;
8. generates deterministic sanitized files under product-controlled export root;
9. atomically publishes the completed directory;
10. returns bounded metadata/path/prompt text.

The history/baseline projection is an explicit allowlist of authority keys plus documented U.S. provider/source market fields and provider `raw_data`; it excludes `session_id`, producer/session/config/error/request metadata, `source_metadata_json` and absolute paths.

The Scanner-context projection preserves structural metadata, canonical identity, numeric/null/boolean values and documented market text columns. Content of other string/array/object result values is not emitted; only bounded structural metadata plus `redactedForSharing: true` is written. Exact SQL is intentionally exported verbatim because it is user-authored content; UI/README must warn the user to review it before external sharing.

Response contains only bounded metadata:

```text
exportPathRelative
packFormatVersion
outcomeEvidenceStatus
targetInScannerContext
generatedAtMs
promptText
fileNames / recordCounts
preserved/redacted/omitted counts
```

`promptText` is capped at 256 KiB UTF-8. History/evidence files are not returned through WebSocket. Redacted content itself never enters response metadata or diagnostics.

## 20. AI export filesystem boundary

Root:

```text
exports/ai-investigations/
```

It is git-ignored. Browser never supplies a path.

Generate into a temporary product-owned directory and atomically rename to a collision-safe final directory only after all required files and sharing-safety checks are complete. Never overwrite an existing successful pack. Best-effort cleanup removes failed temporary output.

Return/display a repository/product-relative path, never a machine-specific absolute user path.

Transport loss after export request dispatch may leave a valid pack whose ACK was lost. Regeneration after reconnect is safe because export mutates no DB authority and creates a new collision-safe directory; this differs intentionally from capture lost-ACK handling.

## 21. Browser Scanner/Demo Buy workflow

The browser keeps one immutable rendered Scanner generation snapshot for capture:

```text
queryId/name/exact SQL
active interval
startedAtMs/completedAtMs
rowCount
columns/rows
```

Capture controls exist only with exactly one recognized canonical identity column.

Manual/Auto modes:

```text
Selected
All
Top X
Auto Off
Auto All
Auto Top X
```

One Viewer-wide capture slot prevents manual double-submit and unbounded auto queueing. Busy auto generation is visibly skipped. Zero-row generation is no-op.

Auto changes apply only to future successful Scanner generations. Enabling Auto never retroactively captures the currently rendered result.

A persistent top-level indicator exposes `Auto Demo Buy: All/Top X` and `Turn off` even while Scanner is hidden. Turn off prevents future generations; it does not pretend to cancel an already in-flight capture.

## 22. Resumable Scanner Stop

Scanner must expose a user-level **Stop recurring scan** distinct from terminal Viewer destruction.

Behavior:

```text
Stop recurring scan
→ cancel future scheduled timer
→ invalidate current generation token
→ ignore stale in-flight result when it returns
→ keep Viewer/query draft alive
→ later Activate starts a new generation normally
```

Auto mode may remain configured/armed but cannot produce captures while Scanner is stopped. Existing terminal scheduler destruction remains separate.

## 23. Demo Buy UX

Top-level destinations:

```text
Current | Scanner | Demo Buy
```

Demo Buy is capture-grouped. Capture header owns query/timing/mode/provenance actions. Item table uses sticky leading identity/baseline columns and one compact cell per horizon containing outcome + percentage + Price where available.

The UI labels `resultRank` as neutral returned `Position`/`Scanner position` unless it is explicitly explaining SQL ordering; position 1 must not be shown as “best/top-ranked” merely because it is first.

Presentation rule:

```text
NO_FUTURE_OBSERVATION → Pending / waiting presentation
other unavailable reasons → explicit UNAVAILABLE warning
```

Technical underlying outcome remains `UNAVAILABLE` in both cases.

Controls:

```text
Refresh latest
Load more
Refresh observation
View provenance / SQL
Investigate with AI
```

First-page refresh failure preserves previously rendered trustworthy data. Continuation/target/provenance/export errors are scoped to the affected sub-surface.

## 24. AI Investigation UX

One expandable item panel owns:

```text
context coverage
partial/complete evidence state
current horizon progress
Generate AI Investigation Pack
Regenerate
Copy AI Prompt
Copy folder path
```

Before Generate/Regenerate, show a concise pre-share reminder that the pack contains the user's exact Scanner SQL and market evidence, that Scanner SQL must not contain secrets, and that generated files should be reviewed before external sharing.

At most one Generate/Regenerate request is in flight per Viewer. Additional export actions are visibly disabled/refused rather than queued.

Clipboard follows existing support-snapshot behavior: `navigator.clipboard.writeText`, with visible/selectable fallback text when clipboard access is unavailable.

No automatic AI call/upload or SQL activation exists.

## 25. Viewer transport sequencing

Keep existing per-socket FIFO; do not redesign transport solely for Demo Buy.

Demo Buy/AI requests are bounded and application-level capture/export slots prevent a second unbounded queue. Workload/Browser proof must ensure bounded Demo Buy refresh/export does not materially starve intended recurring Scanner use.

## 26. Diagnostics

Reuse the existing diagnostic tracker. Stable concepts include:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.observation_read
demo_buy.provenance_read
demo_buy.ai_pack
demo_buy.viewer
```

Support Snapshot may include bounded operational state such as active top-level view, Auto mode, busy-skip count, capture/export slot state and last outcome category.

Never include SQL text, Scanner rows, history rows, AI prompt/evidence, redacted source values, credentials/session data or raw authenticated dumps.

## 27. Fake Market / workload

Reuse the shared configurable U.S. synthetic generator.

Deterministic Demo Buy/AI scenarios cover:

```text
UP
DOWN
FLAT
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
ordered position-1 candidate that later declines
unordered returned position 1
Top-50 peer differences
position>50 investigation target
wall-clock anomaly fixture
post-capture commit watermark fixture
AI-sharing fixture containing operational/session Scanner columns that must be redacted/omitted
```

Hosted CI remains correctness-first and bounded. Heavy target-machine profile remains:

```text
4096 synthetic securities
180 end-to-end cycles
737280 history rows
```

## 28. New-day lifecycle

Active DB = one trading day.

After schema v4 ships, new-day accepts valid v3 or valid v4 source DB and rejects v1/v2, running sessions and partial/corrupt states.

Flow:

```text
inspect source without mutation
→ read scanner_saved_queries
→ create temporary fresh schema-v4 DB
→ seed saved queries transactionally
→ optionally archive/move original source unchanged
→ atomically install fresh v4
```

Fresh v4 starts with empty Demo Buy tables. Demo Buy horizons never cross into the new active DB. v4 archive remains self-contained with its history/provenance; v3 archive remains a valid pre-feature historical DB.

## 29. Build/local artifacts

Existing artifact names remain canonical Market Flow US names. Add only:

```text
AI exports: exports/ai-investigations/
```

`exports/` must be git-ignored.

## 30. Security boundary

Preserve loopback-only service, exact allowed Origin, hardened DuckDB, no credential/session persistence in market evidence, sanitized synthetic fixtures and no raw authenticated dumps.

Generated AI packs are explicit local user artifacts and are designed for optional sharing. Therefore they use the sharing-safe projection from `DATA_CONTRACT.md` / `AI_INVESTIGATION_PACK.md`, never raw `SELECT *` DB rows or raw persisted Scanner context. System-owned operational/session identifiers are excluded by construction; redacted contents are not copied into prompt/manifest/diagnostics. Exact user-authored SQL remains verbatim and requires the visible pre-share reminder.

Packs are never committed automatically and never placed in Support Snapshot.

## 31. Final acceptance

The post-feature deterministic candidate must pass Fast, Browser, Planning and bounded Workload gates plus deterministic local Fake Leumi Demo Buy/AI proof.

Final target-machine acceptance additionally proves:

```text
local Demo Buy progressive + targeted observation refresh
local AI pack generation/copy/regeneration
AI pack sharing-safe projection / no operational-session leakage
new-day v3/v4 → fresh-v4 lifecycle
4096x180 + isolated day-bounded probes
authenticated static smoke
authenticated market-open movement gate
```

All on the exact final candidate SHA.

## 32. Explicit non-goals

Do not add:

```text
real order placement
manual buy price
fill simulation
fees/slippage
sell rules
portfolio/risk state
trade quantity/liquidity proof
aggregate strategy scorecards
multi-day active analytics
background horizon materialization
speculative history index
capture replay queue
AI provider/API key integration
automatic AI SQL editing/activation
web enrichment inside pack generation
OS file-manager integration
```
