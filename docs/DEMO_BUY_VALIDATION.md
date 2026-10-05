# Demo Buy Strategy Validation — Phase 1 Contract

## 1. Purpose

Demo Buy answers one practical question before real order execution exists:

> When a Scanner result selects a security and we virtually buy it when the Demo Buy capture is accepted, what does persisted source `Price` do afterward over the requested short horizons?

This is analytical validation only. It is not an order simulator, portfolio, P&L engine, fill simulator, sell engine or liquidity model.

Phase 2 may later investigate traded volume/liquidity and whether a theoretical higher price was realistically sellable. Phase 1 deliberately excludes that work.

## 2. Responsibility architecture

Demo Buy has three explicit layers:

```text
Persistence facts
→ Evaluation / trusted read model
→ Viewer UX
```

### Persistence — what happened

DuckDB stores only durable facts required to reconstruct the observation:

- one capture event;
- immutable Scanner-generation provenance;
- ordered selected canonical IDs with their original Scanner result rank;
- each item's exact `buy_cycle_id` link to authoritative `history`.

It does **not** store calculated horizon prices, percentages, outcome labels or periodically updated outcome columns.

### Evaluation — what happened afterward

The localhost Node service owns analytical interpretation. It loads the exact baseline row, finds each future observation, calculates percentage change and derives `UP` / `DOWN` / `FLAT` / `UNAVAILABLE` plus an explicit unavailable reason.

The browser does not query DuckDB directly and does not independently reconstruct horizon semantics.

### Viewer — what the user sees

The Viewer owns capture interaction and presentation. The user sees, per virtual buy, the source query, original result rank, signal/capture timing and whether the candidate subsequently went up, down, stayed flat or still lacks usable evidence.

## 3. Scanner generation provenance

Every successful Scanner execution already has Node-produced execution timing. The browser freezes one immutable generation snapshot containing:

```text
queryId: built-in/user ID or null
name: active display label or null
sql: exact activated SQL text
intervalMs: active Scanner interval
startedAtMs: Scanner result startedAtMs
completedAtMs: Scanner result completedAtMs
rowCount
columns
rows
```

Editing/selecting/saving another draft never rewrites the provenance of an already-produced result generation.

`completedAtMs` is the **signal/result-ready time**. `captured_at_ms` is the later **virtual-buy acceptance time**. They are intentionally distinct.

The read model exposes:

```text
captureLatencyMs = capturedAtMs - sourceResultCompletedAtMs
baselineAgeMs = capturedAtMs - baselineCollectedAtMs
```

when the timestamps permit a non-negative local calculation. These are diagnostics for staleness/latency, not broker execution claims.

## 4. Identity and selection semantics

A Scanner result is Demo-Buy-capable only when it contains exactly one recognized identity column named:

```text
securityId
or
security_id
```

Identity is never guessed from `Symbol`.

Capture modes:

```text
manual selected rows
all result rows
first X result rows (Top X)
automatic all
automatic Top X
```

Selection order is defined before dedupe:

1. `manual` chooses the checked source rows.
2. `all` chooses every source row.
3. `top_x` chooses exactly the first X source rows in Scanner SQL result order.
4. every chosen row must contain a valid non-blank canonical identity string;
5. duplicate canonical IDs inside the chosen set reduce to the **first chosen occurrence**;
6. each remaining item retains its original 1-based Scanner `resultRank`.

Therefore duplicate rows never cause Top X to pull in a later row beyond X. A Top-10 result may legitimately produce fewer than ten Demo Buy items when duplicates existed inside the first ten rows.

For manual selection, original ranks may contain gaps (for example 2, 7, 20). Those gaps are meaningful strategy provenance and are preserved.

## 5. Capture bounds and malformed rows

One capture contains at most `5000` unique canonical security IDs.

Rules:

- `Top X` is limited to 1..5000 source rows;
- manual empty selection does not submit a capture;
- automatic successful generation with zero chosen rows is a no-op;
- manual invalid-identity rows are visibly non-selectable;
- `All`, `Top X` and automatic selections whose chosen source range contains an invalid identity are refused visibly rather than silently skipping it;
- `All` / auto-All never silently truncate: if first-occurrence dedupe still produces more than 5000 unique IDs, the action is refused with guidance to use `Top X` or narrower SQL;
- the browser sends only already-deduped ordered items;
- Node independently validates the request and **rejects duplicate `securityId` or duplicate `resultRank` values** rather than silently repairing malformed protocol input;
- every `resultRank` must be a positive safe integer no greater than `sourceResultRowCount`;
- submitted ranks are strictly increasing in Scanner result order;
- for `top_x`, every submitted `resultRank` must be `<= topX`.

The 5000 bound is a product/transport safety bound aligned with the current provider envelope; it is not a permanent claim about U.S. market size.

## 6. Virtual-buy moment and baseline authority

The browser never sends a buy price.

It sends ordered `{ securityId, resultRank }` items plus immutable Scanner-generation provenance. Node performs authoritative capture through the existing serialized writer.

Inside that serialized operation:

```text
validate bounded request
→ enqueue behind prior writer work
→ BEGIN
→ captured_at_ms = Node clock
→ resolve every selected security from authoritative latest
→ require every selected security to resolve
→ allocate capture_id
→ persist capture + ordered items
→ COMMIT
```

Any unresolved security causes complete rollback.

Baseline identity:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

Baseline `Price`, Symbol, names and baseline collection time come from the linked history row and are not copied as separate market facts into Demo Buy items.

Writer ordering defines “buy now”:

```text
cycle commit before capture in writer order
→ capture may link that cycle

capture before cycle commit in writer order
→ capture links the prior latest cycle
```

The horizon clock starts at `captured_at_ms`, not at Scanner completion time and not at the potentially older baseline `collected_at_ms`.

## 7. Schema version and migration

Demo Buy advances Market Flow US from schema v3 to additive schema v4.

A valid v3 database contains the established U.S. authority/saved-query tables and **neither** Demo Buy table.

Migration:

```text
validate v3 prerequisites
→ reject suspicious partial Demo Buy table state
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info to v4 + current product version
→ COMMIT
```

If a DB claims v3 while either Demo Buy table already exists, startup fails closed instead of silently completing a possibly partial prior migration. Do not use `CREATE TABLE IF NOT EXISTS` to normalize that state.

Migration fault tests must prove rollback at multiple phases. Failure leaves the original v3 database semantically usable as v3 with market authority and saved Scanner queries intact.

Fresh DBs bootstrap directly as v4. A reopened v4 DB requires both Demo Buy tables plus the established U.S. tables.

MarketScope v1/v2 remain unsupported and are rejected without mutation.

No new `history` index is part of the initial schema-v4 contract. Direct bounded evaluation is measured first; an evaluation index is added only if representative workload proves a real bottleneck and a focused replan approves it.

## 8. `demo_buy_captures`

Logical columns:

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

- `selection_mode ∈ {manual, all, top_x}`;
- `top_x` is non-null only for `top_x`;
- automatic capture is valid only for `all`/`top_x`;
- `source_interval_ms > 0`;
- source result times/count and query provenance are immutable snapshots;
- source SQL is stored once per capture;
- no baseline market price and no future horizon outcome is stored here.

Basic shape/mode constraints should be enforced in both protocol authority and schema CHECK constraints where DuckDB supports them simply.

## 9. `demo_buy_items`

Logical columns:

```text
capture_id BIGINT NOT NULL
result_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, result_rank)
```

`result_rank` is the original **1-based Scanner result row position**, not a re-numbered dense selection rank.

The stored `(buy_cycle_id, security_id)` must resolve to exactly one `history` row on normal active-day reads. A missing linked baseline row is an integrity failure, not a normal `UNAVAILABLE` horizon.

No copied baseline/future price, percentage or direction columns are persisted.

A physical foreign key is not required in Phase 1; the serialized capture transaction establishes the semantic link and trusted reads verify it. Do not add foreign-key/index complexity without evidence.

## 10. Capture request contract

`demo.buy.capture` payload:

```text
items: [
  { securityId: string, resultRank: positive integer }
]
sourceQuery:
  queryId: string | null
  name: string | null
  sql: string
  intervalMs: positive integer
sourceResult:
  startedAtMs: non-negative safe integer
  completedAtMs: non-negative safe integer
  rowCount: non-negative safe integer
selectionMode: manual | all | top_x
isAutomatic: boolean
topX: integer | null
```

Node validates exact keys, bounds, unique IDs/ranks, increasing rank order, rank range, mode/topX/automatic consistency and provenance shape. It does not accept a price and does not dedupe malformed protocol input.

Successful response returns only capture authority facts such as:

```text
captureId
capturedAtMs
capturedItemCount
```

## 11. Browser capture backpressure and double-submit prevention

The Viewer owns one small Demo Buy capture controller with **at most one capture request in flight across manual and automatic capture**.

Behavior:

```text
manual action while slot free
→ disable/refuse further capture actions until response
→ submit once
→ release slot on success/failure

auto generation while slot free
→ submit once
→ release slot on success/failure

auto generation while slot busy
→ visibly record that generation as skipped
→ never queue/replay it

manual action while slot busy
→ controls remain disabled / visible busy state
→ no hidden queue and no duplicate submission
```

This avoids accidental double clicks, unbounded Promise queues and contention against the service's per-connection request sequencing while preserving Scanner scheduling.

A failed capture releases the slot; Scanner scheduling continues independently.

## 12. Future horizons

Fixed Phase-1 horizons:

```text
10s
20s
30s
45s
60s
90s
120s
180s (3m)
300s (5m)
600s (10m)
```

For horizon `H`:

```text
target_at_ms = captured_at_ms + H
```

Future observation:

```text
same security_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

The evaluator uses the first authoritative row at/after the target even if that row's `Price` is NULL. It does not skip unusable rows to cherry-pick a later price.

If no qualifying future history row exists, the horizon remains unavailable even if wall-clock time has passed.

The evaluator exposes:

```text
observedAtMs
actualElapsedMs = observedAtMs - capturedAtMs
```

so collection gaps are visible.

## 13. Percentage, outcome and unavailable reason

```text
changePercent = ((futurePrice / baselinePrice) - 1) * 100
```

Outcome:

```text
UP           changePercent > 0
DOWN         changePercent < 0
FLAT         changePercent = 0
UNAVAILABLE  changePercent is null
```

When outcome is `UNAVAILABLE`, the read model also returns exactly one reason:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

Precedence is:

1. no future row → `NO_FUTURE_OBSERVATION`;
2. baseline Price NULL → `BASELINE_PRICE_UNAVAILABLE`;
3. baseline Price zero → `BASELINE_PRICE_ZERO`;
4. matched future Price NULL → `FUTURE_PRICE_UNAVAILABLE`.

A missing baseline **row** is not one of these states; it is a stable integrity/read error because capture-time invariants promise the row exists.

No fees, spread, slippage, bid/ask fill or sellability assumptions belong to Phase 1.

## 14. Trusted read model and snapshot consistency

Ordering is:

```text
capture_id DESC
result_rank ASC
```

`demo.buy.page` uses a fixed Phase-1 page size of **50 items**. A page is intentionally smaller than 500-row History because each Demo Buy item contains ten derived horizons and is materially wider/heavier.

The opaque keyset cursor binds the last `(capture_id, result_rank)` and supports stable continuation while newer automatic captures are inserted. New captures appear only when the user refreshes from the first page; they do not cause gaps or duplicates in an existing continuation walk.

Each page's baseline/horizon evaluation must be produced from one transactionally consistent DuckDB read snapshot. Prefer one set-wise SQL statement/CTE on the existing Viewer read connection; do not issue ten independent browser requests or independently timed horizon queries, and do not open a multi-statement transaction on the shared Viewer read connection merely to create consistency.

Browser-ready item includes at least:

```text
captureId
capturedAtMs
sourceQueryId
sourceQueryName
sourceIntervalMs
sourceResultStartedAtMs
sourceResultCompletedAtMs
sourceResultRowCount
selectionMode
isAutomatic
topX
resultRank
securityId
Symbol
displayName
baselineCollectedAtMs
baselinePrice
baselineAgeMs
captureLatencyMs
horizons[]
```

Each horizon includes:

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

The page response does **not** repeat `sourceQuerySql` in every item.

## 15. Capture provenance detail read

Add Viewer-role operation:

```text
demo.buy.capture.get
```

Payload:

```text
captureId
```

It returns immutable capture-level provenance/details once:

```text
captureId
capturedAtMs
sourceQueryId
sourceQueryName
sourceQuerySql
sourceIntervalMs
sourceResultStartedAtMs
sourceResultCompletedAtMs
sourceResultRowCount
selectionMode
isAutomatic
topX
capturedItemCount
```

This operation backs the Viewer expand/details affordance and avoids repeating potentially large SQL text in every `demo.buy.page` item.

## 16. Protocol/service surface

Keep protocol version 1 unless implementation proves incompatibility.

Viewer-role operations are:

```text
demo.buy.capture
demo.buy.page
demo.buy.capture.get
```

Stable errors distinguish at least invalid Demo Buy input, Demo Buy integrity violation and generic DB/read failure. Browser-visible busy state is normally handled before transport by the single capture slot.

Missing future horizons are normal data. Missing immutable baseline linkage is an integrity error.

## 17. Viewer UX

Add a third top-level destination:

```text
Current | Scanner | Demo Buy
```

### Scanner capture controls

With exactly one canonical identity column:

```text
row checkboxes
Demo Buy selected
Demo Buy all
Top X + Demo Buy Top X
automatic: off / all / Top X
```

Without exactly one recognized identity column, controls are unavailable.

Selection belongs to the exact visible result generation and resets/rebuilds when a new generation replaces it.

The surface visibly reports successful, failed and busy-skipped captures. No manual price input exists.

### Demo Buy outcome screen

Base columns include:

```text
query/source label
capture time
signal/result-completed time or capture latency indicator
manual/automatic marker
original result rank
Symbol / display name
securityId
baseline collection time / baseline age
baseline Price
```

For every horizon show:

```text
Price
change %
UP / DOWN / FLAT / UNAVAILABLE
```

For `UNAVAILABLE`, the UI can keep the table compact while exposing the explicit unavailable reason via text/tooltip/details; it must not imply that every unavailable value simply means “wait longer”.

Direction may be styled visually but must also be textual/symbolic and not color-only.

A wide horizontally scrollable table is acceptable for Phase 1.

The screen includes loading/empty/error states, Refresh, Load more and on-demand capture provenance/SQL details through `demo.buy.capture.get`.

The current Viewer architecture keeps Scanner mounted while other top-level surfaces are shown, so Scanner scheduling/automatic capture may continue while Demo Buy is visible. Viewer disposal stops Scanner scheduling as it does today.

## 18. Daily lifecycle

Demo Buy observations belong to the active trading day's evidence because their baselines reference active-day history.

New day:

```text
optionally archive prior DB
→ create fresh schema-v4 authority
→ preserve scanner_saved_queries
→ start demo_buy_captures/demo_buy_items empty
```

An archived prior-day DB remains self-contained with its history and Demo Buy references.

Horizon evaluation does not bridge into the next active-day database. A late-day capture whose future horizon was never observed before rollover remains unavailable in that day's evidence.

## 19. Diagnostics and failure behavior

Stable checkpoints include:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.provenance_read
demo_buy.viewer
```

Capture failure leaves both Demo Buy tables unchanged. Read/evaluation failure mutates nothing. Scanner execution remains independent of Demo Buy failure or capture backpressure.

Diagnostics remain sanitized and never dump stored SQL, authenticated session material or raw provider dumps.

## 20. SQL/performance discipline

All new/materially changed Demo Buy SQL requires the repository's mandatory static SQL preflight before first execution.

Then:

```text
tiny deterministic fixture
→ bounded representative active-day measurement
→ optimize only on evidence
```

Use set-wise bounded evaluation. Because Viewer requests on one socket are serialized by the existing service, workload/browser proof must verify that a 50-item Demo Buy refresh does not materially starve recurring Scanner use under the intended bounded workload.

Do not add background horizon updates, materialized horizon columns, a temporal feature engine, a speculative history index, new DB/transport or Strategy Engine unless measured evidence proves direct bounded reads insufficient.

## 21. Verification contract

### Unit

Prove identity gating, source-row-first Top-X semantics, original result-rank preservation, invalid-row refusal, browser dedupe + Node duplicate rejection, no silent truncation, immutable generation provenance/timing, one shared in-flight capture slot, manual double-submit prevention, auto busy-skip/recovery, horizon/outcome/reason model and Viewer formatting.

### Real DuckDB/service

Prove fresh v4, strict partial-v3 rejection, transactional v3→v4, migration rollback, exact writer-order baseline linkage, all-or-nothing capture, provenance persistence, original ranks, repeated security across captures, baseline-link integrity failure, one-snapshot set-wise future evaluation, nearest-at-or-after semantics, unavailable reasons, 50-item cursor paging, continuation stability while newer captures are inserted, on-demand provenance read, restart persistence and new-day clearing with saved queries preserved.

### Browser E2E

Prove selected capture with non-contiguous original ranks, Top-X-before-dedupe semantics, oversized-All refusal, invalid-row refusal, automatic Top-X across generations, global capture busy state, busy-auto visible skip/recovery, unavailable→observed transitions, UP/DOWN/FLAT/UNAVAILABLE reasons, provenance immutability/details, identity-column refusal, recoverable capture failure and existing Viewer regressions through normal runtime + Fake Market + real service/DuckDB.

### Workload

Add bounded Demo Buy capture/evaluation correctness and timing over directly seeded active-day history. Include Scanner + Demo Buy refresh coexistence on the existing single Viewer transport. Do not create an unnecessarily huge full-day Demo Buy matrix.

## 22. Explicit Phase-1 non-goals

Not included:

```text
real order placement
manual buy-price entry
fill simulation
bid/ask execution modeling
fees/slippage
sell rules
profit-taking automation
portfolio position state
capital allocation
trade quantity
volume-after-buy validation
liquidity/sellability proof
strategy aggregate statistics/scorecards
multi-day active analytics
background horizon materialization
auto-capture replay queue
```

Phase 2 may revisit volume/liquidity/fillability only after Phase 1 is complete and verified.
