# Demo Buy Strategy Validation — Phase 1 Contract

## 1. Purpose

Demo Buy answers one practical question before real order execution exists:

> When a Scanner query selects a security as a candidate now, does the persisted market `Price` actually rise, fall or remain flat over the following short time windows?

This is analytical validation only. It is not an order simulator, portfolio, P&L engine, fill simulator, sell engine or liquidity model.

Phase 2 may later investigate traded volume/liquidity and whether a theoretical higher price was realistically sellable. Phase 1 deliberately excludes that work.

## 2. Responsibility architecture

Demo Buy has three explicit layers:

```text
Persistence
→ Evaluation / trusted read model
→ Viewer UX
```

### Persistence — what happened

DuckDB stores only durable facts required to reconstruct the virtual-buy observation:

- one capture event;
- immutable Scanner provenance;
- ordered selected canonical IDs;
- each item's exact `buy_cycle_id` link to authoritative `history`.

It does **not** store calculated horizon prices, percentages, direction labels or periodically updated outcome columns.

### Evaluation — what happened afterward

The localhost Node service owns analytical interpretation. It loads the exact baseline row, finds each future observation, calculates percentage change and derives `UP` / `DOWN` / `FLAT` / `UNAVAILABLE`.

The browser does not query DuckDB directly and does not independently reconstruct horizon semantics.

### Viewer — what the user sees

The Viewer owns capture interaction and presentation. The user sees, per virtual buy, whether the candidate subsequently went up, down, stayed flat or still lacks enough evidence.

## 3. User model

The Scanner result must contain exactly one recognized canonical identity column:

```text
securityId
or
security_id
```

Result order remains entirely controlled by SQL.

Capture modes:

```text
manual selected rows
all result rows
first X result rows (Top X)
automatic all
automatic Top X
```

`Top X` means the first X rows in exact SQL result order. No hidden ranking/sorting is added.

## 4. Capture bounds, invalid identities and empty results

One capture contains at most `5000` unique canonical security IDs.

Rules:

- duplicate IDs reduce to first occurrence while preserving rank;
- `Top X` is limited to 1..5000;
- manual empty selection does not submit a capture;
- automatic successful result generation with zero selected rows is a no-op;
- a recognized identity cell is valid only when it is a non-blank canonical string;
- manual invalid-identity rows are not selectable;
- `All`, `Top X` and automatic selections that would include an invalid identity are refused visibly rather than silently skipping the row;
- `All` / auto-All never silently truncate an oversized result: after first-occurrence dedupe, more than 5000 unique IDs is refused with a clear instruction to use `Top X` or narrower SQL;
- oversized or malformed capture input fails validation before persistence.

The 5000 bound matches the currently proven provider request envelope and keeps Viewer→Node requests bounded. It is not a permanent claim about U.S. market size.

## 5. Virtual-buy moment and baseline authority

The browser never sends a buy price.

It sends selected canonical IDs plus source-query provenance. Node performs authoritative capture through the existing serialized writer.

Inside that serialized operation:

```text
validate / dedupe IDs preserving first rank
→ BEGIN
→ record Node captured_at_ms
→ resolve every selected security from authoritative latest
→ require every selected security to resolve
→ store exact latest.cycle_id as buy_cycle_id
→ persist capture + items
→ COMMIT
```

Any unresolved security causes complete rollback.

Baseline identity:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

Baseline `Price`, Symbol, names and baseline collection time come from the linked history row and are not copied as separate market facts into Demo Buy items.

The horizon clock starts at `captured_at_ms`, not at the possibly earlier baseline `collected_at_ms`. Both timestamps are exposed by the read model so collection delay/staleness is visible.

## 6. Schema version and migration

Demo Buy advances Market Flow US from schema v3 to additive schema v4.

v3→v4 preserves all existing U.S. authority and saved Scanner queries.

Migration:

```text
schema v3
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info to v4
→ COMMIT
```

Failure leaves the original v3 database recoverable without a partial v4 contract. Fresh DBs bootstrap directly as v4.

## 7. `demo_buy_captures`

Logical columns:

```text
capture_id BIGINT PRIMARY KEY
captured_at_ms BIGINT NOT NULL
source_query_id VARCHAR NULL
source_query_name VARCHAR NULL
source_query_sql VARCHAR NOT NULL
selection_mode VARCHAR NOT NULL
is_automatic BOOLEAN NOT NULL
top_x BIGINT NULL
result_row_count BIGINT NOT NULL
```

Rules:

- `selection_mode ∈ {manual, all, top_x}`;
- `top_x` is non-null only for `top_x`;
- automatic capture is valid only for `all`/`top_x`;
- query provenance is immutable for the capture;
- source SQL is stored once per capture;
- no baseline market price and no future horizon outcome is stored here.

## 8. `demo_buy_items`

Logical columns:

```text
capture_id BIGINT NOT NULL
selection_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, selection_rank)
```

`selection_rank` preserves selected SQL-result order after first-occurrence dedupe.

The stored `(buy_cycle_id, security_id)` must resolve to exactly one `history` row on normal active-day reads. A missing linked baseline row is an integrity failure, not a normal `UNAVAILABLE` horizon.

No copied baseline/future price, percentage or direction columns are persisted.

## 9. Capture ordering and concurrency

Demo Buy writes share the same serialized writer as market authority writes.

`capture_id` is monotonic inside that boundary.

Observable ordering:

```text
cycle commit before capture in writer order
→ capture may link that cycle

capture before cycle commit in writer order
→ capture links the prior latest cycle
```

No second writer/database service is introduced.

## 10. Source-query provenance

For every successful Scanner result generation, the browser retains immutable generation provenance:

```text
queryId: built-in/user ID or null
name: active display label or null
sql: exact activated SQL text
```

Editing/selecting/saving another draft never rewrites the provenance attached to the already-produced result generation or to an old capture.

Demo Buy does not parse strategy meaning from SQL.

## 11. Automatic capture and backpressure

Automatic mode is Viewer-session state:

```text
off
auto all
auto Top X
```

For each successful Scanner generation:

1. use that generation's exact rows and provenance;
2. choose all or first X;
3. validate the selected identity cells;
4. dedupe canonical IDs;
5. if none remain, no-op;
6. if no previous automatic capture is still in flight, issue one capture request;
7. if the single automatic-capture slot is still busy, skip that generation visibly rather than queueing it indefinitely;
8. display capture failure without stopping Scanner scheduling.

There is at most one automatic Demo Buy capture request in flight. Phase 1 intentionally does not maintain an unbounded or replayable client queue. A busy-skipped generation is visible to the user/diagnostics and is not silently represented as captured.

A failed capture clears the slot so later generations may capture normally. Scanner scheduling remains independent and continues running.

The same security may appear in later captures; captures are observations, not positions.

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

If no qualifying future history row exists, the horizon remains unavailable/null even if wall-clock time has passed.

The evaluator exposes:

```text
observed_at_ms
actual_elapsed_ms = observed_at_ms - captured_at_ms
```

so collection gaps are visible.

## 13. Percentage and outcome

```text
change_percent = ((future_price / baseline_price) - 1) * 100
```

`change_percent` is null when:

- no future row exists;
- baseline `Price` is NULL;
- baseline `Price` is zero;
- future `Price` is NULL.

Outcome:

```text
UP           change_percent > 0
DOWN         change_percent < 0
FLAT         change_percent = 0
UNAVAILABLE  change_percent is NULL
```

No fees, spread, slippage, bid/ask fill or sellability assumptions belong to Phase 1.

## 14. Read model and pagination

Ordering:

```text
capture_id DESC
selection_rank ASC
```

Use bounded keyset pagination, normally 500 items per page unless measurement justifies a smaller bound.

Browser-ready item includes at least:

```text
captureId
capturedAtMs
sourceQueryId
sourceQueryName
sourceQuerySql or bounded/on-demand form
selectionMode
isAutomatic
selectionRank
securityId
Symbol
displayName
baselineCollectedAtMs
baselinePrice
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
```

Unavailable market values are null with `outcome=UNAVAILABLE`.

A missing baseline link is returned as a stable integrity/read error; it is never downgraded to `UNAVAILABLE` because capture-time invariants promise that baseline row exists.

The Node read model is the single authority for calculations; the Viewer formats it.

## 15. Protocol/service surface

Keep protocol version 1 unless implementation proves incompatibility.

Add Viewer-role operations:

```text
demo.buy.capture
demo.buy.page
```

`demo.buy.capture` validates the capture contract and returns capture identity/count only.

`demo.buy.page` loads persisted facts, evaluates horizons and returns one bounded browser-ready page plus continuation metadata.

Invalid Demo Buy input uses stable errors distinct from generic DB failure. Missing future horizons are normal data. Missing immutable baseline linkage is an integrity error.

## 16. Viewer UX

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

Without exactly one recognized identity column, controls are unavailable and identity is never guessed from `Symbol`.

Rows with invalid canonical identity cells are visibly non-selectable. Any All/Top-X/automatic operation whose chosen range includes such a row is refused rather than silently changing the meaning of the requested selection.

Selection belongs to the exact visible result generation and resets/rebuilds when a new generation replaces it.

Oversized All/auto-All is visibly refused; the user can choose `Top X` or narrow the SQL. No hidden truncation occurs.

Successful, failed and busy-skipped automatic captures receive visible feedback without requiring the user to inspect the database.

### Demo Buy outcome screen

Each item answers:

```text
If I had bought this Scanner candidate at the captured moment,
what happened afterward?
```

Base columns:

```text
query/source label
capture time
automatic/manual marker
selection rank
Symbol / display name
securityId
baseline collection time
baseline Price
```

For every horizon show:

```text
Price
change %
UP / DOWN / FLAT / UNAVAILABLE
```

Direction may be styled visually but must also be textual/symbolic and not color-only.

A wide horizontally scrollable table is acceptable for Phase 1.

### Refresh / progressive completion

New captures initially have unavailable future horizons. As normal collection appends `history`, explicit Refresh recomputes them:

```text
UNAVAILABLE
→ Price + % + outcome
```

No background job updates Demo Buy rows.

The surface includes loading/empty/error states, Refresh, Load more/keyset pagination and an on-demand provenance/SQL detail affordance.

The current Viewer architecture keeps the Scanner surface alive while other top-level surfaces are shown, so Scanner scheduling/automatic capture may continue while Demo Buy is visible. Closing/disposal of the Viewer stops the Scanner scheduler as it does today.

## 17. Daily lifecycle

Demo Buy observations belong to the active trading day's evidence because their baselines reference active-day history.

New day:

```text
optionally archive prior DB
→ create fresh schema-v4 authority
→ preserve scanner_saved_queries
→ start demo_buy_captures/demo_buy_items empty
```

An archived prior-day DB remains self-contained with its history and Demo Buy references.

Horizon evaluation does not bridge into the next active-day database. A late-day capture whose future horizon was never observed before the active day ended remains unavailable in that day's self-contained evidence; Phase 1 does not invent cross-day market observations.

## 18. Diagnostics and failure behavior

Stable checkpoints include:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.viewer
```

Capture failure leaves both Demo Buy tables unchanged. Read/evaluation failure mutates nothing. Scanner execution remains independent of Demo Buy failure or auto-capture backpressure.

Diagnostics remain sanitized and never include authenticated session material or raw provider dumps.

## 19. SQL/performance discipline

All new/materially changed Demo Buy SQL requires the repository's mandatory static SQL preflight before first execution.

Then:

```text
tiny deterministic fixture
→ bounded representative active-day measurement
→ optimize only on evidence
```

Do not add background horizon updates, materialized horizon columns, temporal feature engines, a new DB/transport or a Strategy Engine unless measured evidence proves direct bounded reads insufficient.

Use a set-wise bounded read shape rather than N browser calls × ten horizons.

## 20. Verification contract

### Unit

Prove identity gating, invalid-identity refusal, selected/all/Top-X order, duplicate reduction, no silent truncation, 5000 bound, zero-result no-op, immutable provenance, one-in-flight auto backpressure/recovery, horizon/null/outcome model and Viewer state/formatting.

### Real DuckDB/service

Prove fresh v4, transactional v3→v4, migration rollback, exact writer-order baseline linkage, all-or-nothing capture, repeated security across captures, baseline-link integrity failure, future nearest-at-or-after semantics, actual elapsed time, percentage/outcome edge cases, bounded keyset paging, restart persistence and new-day clearing with saved queries preserved.

### Browser E2E

Prove selected capture, Top-X order, oversized-All refusal, invalid-row refusal, automatic Top-X over later generations, busy-auto visible skip/recovery, unavailable→observed transitions, UP/DOWN/FLAT/UNAVAILABLE display, provenance immutability, identity-column refusal, recoverable capture failure and existing Viewer regressions through normal runtime + Fake Market + real service/DuckDB.

### Workload

Add bounded Demo Buy capture/evaluation correctness and timing over directly seeded active-day history. Do not create an unnecessarily huge full-day Demo Buy matrix.

## 21. Explicit Phase-1 non-goals

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
```

Phase 2 may revisit volume/liquidity/fillability only after Phase 1 is complete and verified.
