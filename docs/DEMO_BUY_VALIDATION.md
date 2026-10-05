# Demo Buy Strategy Validation — Phase 1 Contract

## 1. Purpose

Demo Buy answers one practical question before real order execution exists:

> When a Scanner query selects a security as a candidate now, does the persisted market `Price` actually rise or fall over the following short time windows?

This is an analytical validation feature only. It is not an order simulator, portfolio, P&L engine, fill simulator, sell engine or liquidity model.

Phase 2 may later investigate traded volume/liquidity and whether a theoretical high price was realistically sellable. Phase 1 deliberately excludes that work.

## 2. Responsibility architecture

Demo Buy has three explicit responsibility layers. No layer may silently absorb another layer's job.

```text
Persistence
→ Evaluation / Read Model
→ Viewer UX
```

### 2.1 Persistence — what happened

DuckDB stores only durable facts needed to reconstruct the observation:

- the Demo Buy capture event;
- immutable Scanner provenance for that event;
- ordered selected `security_id` values;
- each item's exact `buy_cycle_id` link to authoritative `history`.

The database does **not** store calculated 10s/20s/... results, direction labels, percentages or periodically updated outcome columns.

### 2.2 Evaluation / Read Model — what happened afterward

The localhost Node service owns the analytical interpretation of persisted facts.

For every requested Demo Buy page it:

1. loads the capture/item and exact linked baseline `history` row;
2. finds the first authoritative same-security `history` observation at or after each fixed target horizon;
3. calculates future `Price`, actual observation time, elapsed time and percentage change;
4. classifies the result as `up`, `down`, `flat` or `unavailable`;
5. returns one bounded browser-ready read model.

The browser does not run its own DuckDB SQL and does not independently reconstruct horizon semantics.

### 2.3 Viewer UX — what the user sees

The Viewer owns interaction and presentation:

- creating Demo Buys from Scanner results;
- navigating to a dedicated Demo Buy screen;
- showing what would have happened after each virtual buy;
- rendering every horizon as price + percent + explicit direction;
- refreshing so previously unavailable horizons become available as new `history` arrives;
- paging through the day's observations;
- exposing the source query/provenance without forcing the user to inspect database rows.

The primary user experience is therefore not “a DB record exists”; it is “I can immediately see whether the candidate I would have bought went up, down or stayed flat afterward.”

## 3. User model

The user runs any Scanner SQL that returns exactly one recognized canonical identity column:

```text
securityId
or
security_id
```

The Scanner result order remains entirely controlled by the SQL.

The user may create Demo Buy observations by:

```text
manual selected rows
all result rows
first X result rows (Top X)
```

Automatic capture is intentionally limited to:

```text
auto all
auto Top X
```

Manual checkbox selection is inherently interactive and therefore is not an automatic mode.

`Top X` always means the first X rows in the exact result order returned by the active Scanner SQL. Demo Buy adds no hidden ranking or sorting.

## 4. Virtual-buy moment and baseline authority

The browser never sends a buy price.

The browser sends the selected canonical security IDs plus source-query provenance. The localhost Node service performs the authoritative capture through the existing serialized writer boundary.

Inside that serialized operation, Node:

```text
receives ordered selected security IDs
→ removes duplicate IDs while preserving first occurrence/rank
→ BEGIN
→ records server-side captured_at_ms
→ resolves every selected security from the current authoritative latest table
→ requires every selected security to resolve
→ stores the exact latest.cycle_id for each security as buy_cycle_id
→ persists the capture and its items
→ COMMIT
```

If any selected security cannot be resolved from authoritative `latest`, the entire capture fails. Partial Demo Buy events are not created.

The baseline market row is identified by the existing history primary key:

```text
(buy_cycle_id, security_id)
→ history(cycle_id, security_id)
```

The baseline `Price`, `Symbol`, names, exchange and collection time are read from that linked `history` row. They are not copied into the Demo Buy item as independent market facts.

The virtual-buy time used for future horizons is `captured_at_ms`, not the historical row's `collected_at_ms`. The linked row is the most recent authoritative market observation available at the serialized virtual-buy moment.

## 5. Schema version and migration

Demo Buy is a persistent product capability, so the Market Flow US schema advances from v3 to v4.

Unlike the old MarketScope-to-U.S. semantic break, v3 → v4 is a safe additive migration and must preserve the current active-day market authority and saved Scanner queries.

Migration is transactional:

```text
schema v3
→ BEGIN
→ create demo_buy_captures
→ create demo_buy_items
→ update schema_info to v4
→ COMMIT
```

Failure rolls back and leaves the original v3 database usable as v3.

Fresh databases bootstrap directly as v4.

### 5.1 demo_buy_captures

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

`selection_mode` is one of:

```text
manual
all
top_x
```

Rules:

- `top_x` is non-null only when `selection_mode = top_x`;
- `is_automatic = true` is valid only with `all` or `top_x`;
- `source_query_id` may identify a built-in or saved user query and may be null for an unsaved draft;
- `source_query_name` is a display label snapshot and may be null/blank-normalized when the active source is an unnamed draft;
- `source_query_sql` is the exact active SQL snapshot that produced the result generation being evaluated;
- later edits to a saved query never rewrite old Demo Buy provenance.

The SQL snapshot is stored once per capture event, not once per security.

### 5.2 demo_buy_items

Logical columns:

```text
capture_id BIGINT NOT NULL
selection_rank BIGINT NOT NULL
security_id VARCHAR NOT NULL
buy_cycle_id BIGINT NOT NULL
PRIMARY KEY (capture_id, security_id)
UNIQUE (capture_id, selection_rank)
```

`selection_rank` is zero- or one-based consistently in implementation, but the observable contract is that it preserves chosen Scanner order after duplicate IDs are reduced to first occurrence.

The stored `(buy_cycle_id, security_id)` must resolve to exactly one `history` row at capture time and on normal active-day reads.

No future-horizon price, percent or direction columns are persisted.

## 6. Capture ID allocation and concurrency

Demo Buy writes share the same serialized writer used by market authority writes so the capture has a deterministic ordering relative to cycle commits.

`capture_id` is allocated monotonically inside that serialized write boundary. No new database service or independent writer is introduced.

Observable guarantee:

```text
cycle commit before capture in writer order
→ capture may link that cycle

capture before cycle commit in writer order
→ capture links the prior latest cycle
```

This is the precise meaning of “buy now” for Phase 1.

## 7. Source-query provenance

At Scanner activation time, the browser snapshots the active generation's provenance:

```text
queryId: built-in/user ID or null
name: active display label or null
sql: exact activated SQL text
```

The active-generation provenance remains stable even if the user subsequently edits another draft or selects another saved query while the previous generation is still running.

Each Demo Buy capture stores that active-generation snapshot.

Demo Buy does not interpret the SQL or attempt to infer strategy semantics.

## 8. Automatic capture

Automatic capture is Viewer-session UI state, not durable strategy configuration in Phase 1.

Supported states:

```text
off
auto all
auto Top X
```

For every successful Scanner result generation while automatic mode is enabled:

1. use that generation's exact result rows and active-generation provenance;
2. choose all rows or first X rows;
3. reduce duplicate canonical IDs to first occurrence;
4. issue one Demo Buy capture request;
5. report capture failure visibly without stopping Scanner execution.

The same security may be captured again by a later result generation. These are independent observations, not positions.

Automatic capture requests are serialized client-side or otherwise bounded so repeated Scanner ticks cannot create uncontrolled overlapping writes. Failure of one capture must not permanently poison later automatic captures.

## 9. Future horizons and evaluation engine

Phase-1 horizons are fixed product behavior:

```text
10 seconds
20 seconds
30 seconds
45 seconds
60 seconds
90 seconds
120 seconds
180 seconds (3 minutes)
300 seconds (5 minutes)
600 seconds (10 minutes)
```

For one Demo Buy item and horizon `H`:

```text
target_at_ms = captured_at_ms + H
```

The Node evaluation layer selects:

```text
same security_id
AND collected_at_ms >= target_at_ms
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

This is the first authoritative market observation available at or after the requested horizon.

If no such row exists, the outcome is unavailable and its market values remain `NULL`.

The read model exposes matched `observed_at_ms` and `actual_elapsed_ms` so a collection gap is distinguishable from an observation collected close to the target horizon.

### 9.1 Percentage change

For an available future row:

```text
change_percent = ((future_price / baseline_price) - 1) * 100
```

`change_percent` is `NULL` when:

```text
baseline Price is NULL
baseline Price is 0
future Price is NULL
no future row exists
```

### 9.2 Direction

Node derives one explicit presentation-safe direction per horizon:

```text
change_percent > 0  → up
change_percent < 0  → down
change_percent = 0  → flat
change_percent NULL → unavailable
```

The Viewer must not rely on color alone. It should render a textual/symbolic indication such as `↑`, `↓`, `=` or unavailable together with the price/percentage.

No fees, spread, slippage, bid/ask fill or sellability assumptions are included in Phase 1.

## 10. Read model and pagination

The Demo Buy evaluation/read service returns observations newest capture first while preserving Scanner selection rank inside each capture:

```text
capture_id DESC
selection_rank ASC
```

Use bounded keyset pagination rather than returning an unbounded trading day. The normal page size should reuse the established 500-row Viewer convention unless implementation evidence requires a smaller bound.

A browser-ready flattened item contains at least:

```text
captureId
capturedAtMs
sourceQueryId
sourceQueryName
sourceQuerySql or bounded display form
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

Each horizon entry contains at least:

```text
horizonMs
targetAtMs
observedAtMs
actualElapsedMs
price
changePercent
direction
```

Unavailable values are represented as `null` plus `direction = unavailable`, never zero or fabricated data.

The Node read model is the single authority for these calculations; the Viewer formats it but does not re-query or independently calculate market history.

## 11. Protocol/service surface

Keep protocol version 1 unless implementation proves an incompatibility. Add Viewer-role operations to the existing transport.

Conceptual operations:

```text
demo.buy.capture
demo.buy.page
```

### demo.buy.capture

Input contains:

```text
ordered securityIds
source-query provenance
selection mode
isAutomatic
topX when applicable
resultRowCount
```

Node independently validates identity strings, mode consistency, integer bounds and payload shape.

Output returns capture identity and captured item count. It does not echo copied market prices.

### demo.buy.page

Input contains a nullable keyset cursor.

Node loads persistence facts, performs the horizon evaluation, and returns one bounded browser-ready page plus continuation metadata.

Stable protocol errors distinguish invalid Demo Buy input from database/read failures. Normal absence of a future horizon is not an error.

## 12. Viewer UX

Add a third top-level Viewer destination beside Current and Scanner:

```text
Demo Buy
```

### 12.1 Scanner capture controls

When the current result contains exactly one recognized canonical security ID column, show compact controls for:

```text
row checkboxes
Demo Buy selected
Demo Buy all
Top X input + Demo Buy Top X
automatic: off / all / Top X
```

When identity is unavailable or ambiguous, capture controls are unavailable with a clear explanation. The product never guesses identity from `Symbol`.

A manual capture uses the currently rendered result generation. A Scanner refresh replaces the visible generation; stale checkbox selection does not silently migrate to new rows.

A successful capture gives immediate visible confirmation including how many observations were stored. A failed capture is visibly reported but does not stop Scanner scheduling.

### 12.2 Demo Buy screen

This is a real user-facing analysis screen, not a database inspector.

Each row answers:

```text
If I had bought this Scanner candidate at the captured moment,
what happened afterward?
```

Visible base columns include:

```text
query/source label
capture time
automatic/manual marker
selection rank
Symbol / display name
baseline Price
```

Then each fixed horizon is shown as a compact outcome cell containing:

```text
Price
change %
direction: ↑ up / ↓ down / = flat / unavailable
```

Required horizon columns:

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

Example conceptual cell:

```text
10s
101.25
+0.42% ↑
```

or, before enough future evidence exists:

```text
10s
—
not available yet
```

Positive/negative/flat state may receive visual styling, but direction must remain understandable without color.

A wide horizontally scrollable table is acceptable for Phase 1 because direct per-horizon inspection is the primary goal.

### 12.3 Refresh and progressive completion

A newly captured row begins with future horizons unavailable.

As normal market collection appends `history`, refreshing Demo Buy recomputes the page so horizons progressively transition:

```text
unavailable
→ observed Price + % + direction
```

No background job mutates the Demo Buy records.

The screen provides:

- explicit Refresh;
- Load more / keyset pagination;
- visible loading/empty/error states;
- access to the captured query SQL/provenance through a compact details affordance;
- stable rows while later horizons become available.

Automatic Scanner capture may continue while the user views Demo Buy because Scanner scheduling remains independent of the active top-level Viewer surface.

## 13. Daily lifecycle

Demo Buy observations are active-trading-day analytical state because their baseline links point into active-day `history`.

The new-day operation therefore:

```text
archives prior DB optionally
→ creates/resets fresh market authority
→ preserves scanner_saved_queries
→ does NOT copy demo_buy_captures or demo_buy_items into the fresh active DB
```

The archived prior-day DB, when retained, remains self-contained and can preserve its own Demo Buy observations together with the history rows they reference.

## 14. Diagnostics and failure behavior

Demo Buy follows the existing diagnosability model.

Useful stable checkpoints distinguish at least:

```text
demo_buy.capture
demo_buy.evaluate
demo_buy.read
demo_buy.viewer
```

Failures expose sanitized stable codes/messages. They must not include raw authenticated provider data or private browser/session material.

Capture failure leaves both Demo Buy tables unchanged for that event.

Evaluation/read failure does not mutate observations.

Scanner execution remains independent: Demo Buy persistence/evaluation failure must not stop or corrupt the active Scanner generation.

## 15. SQL/performance discipline

Demo Buy introduces materially new SQL for capture resolution and horizon reads. Before first execution, each new/materially changed query must pass the repository's mandatory 10+ stage static SQL preflight.

The implementation should first prove correctness on a tiny deterministic fixture, then measure a representative active-day page shape.

Do not add:

```text
background horizon updater
materialized 10s/20s/... columns
temporal feature engine
new database
new transport
strategy engine
```

unless measured evidence proves direct `history` reads materially insufficient.

The intended read shape is one bounded Viewer page × ten horizons, not every Demo Buy observation for the whole day at once.

## 16. Verification contract

### Unit

Prove:

- recognized identity-column gating;
- manual selected/all/Top-X row selection;
- duplicate-ID first-occurrence reduction;
- active-generation provenance stability;
- auto off/all/Top-X behavior and failure recovery;
- evaluation horizon selection semantics;
- percentage and `up/down/flat/unavailable` classification edge cases;
- Viewer outcome formatting and missing-value behavior;
- Demo Buy screen state and pagination controls.

### Real DuckDB/service

Prove:

- fresh v4 bootstrap;
- transactional v3 → v4 migration preserving market authority and saved queries;
- failed migration rollback;
- serialized capture links exact `latest.cycle_id` visible at its writer-order point;
- all-or-nothing capture when one requested security is unavailable;
- exact baseline join through `(buy_cycle_id, security_id)`;
- same security may exist in multiple later captures;
- nearest-at-or-after horizon semantics;
- percentage and direction calculation;
- unavailable horizons return null/unavailable;
- delayed observations expose actual observation/elapsed time;
- 500-row keyset pagination and deterministic ordering;
- restart preserves active-day Demo Buy observations;
- new-day reset clears Demo Buy state while preserving saved queries.

### Browser E2E

Using normal runtime + Fake Market + real service/DuckDB, prove at least:

1. activate a Scanner query returning ordered canonical security IDs;
2. capture selected rows and open the Demo Buy screen;
3. capture Top X and prove SQL order is respected;
4. enable automatic Top X and prove later Scanner generations create later independent captures;
5. initially see future horizons as unavailable;
6. advance deterministic market cycles, refresh, and see those horizons become price + percentage + up/down/flat outcomes;
7. prove both positive and negative outcomes from deterministic prices;
8. prove query editing after capture does not alter old provenance;
9. prove Scanner without one canonical ID column cannot create Demo Buys;
10. prove capture/evaluation service error is visible and Scanner can continue;
11. prove Load more and refresh preserve coherent display state.

### Workload

Add bounded correctness/performance coverage for Demo Buy evaluation reads using directly seeded active-day history and a realistic bounded number of capture items. Hosted CI records timing diagnostically and must not run an unnecessarily huge full-day Demo Buy matrix merely to establish correctness.

The final target-machine acceptance bundle is rerun only after this feature is implemented, merged and all deterministic gates are green, so the accepted SHA includes Demo Buy.

## 17. Explicit Phase-1 non-goals

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
strategy aggregate statistics or scorecards
multi-day active analytics
```

The next logical Phase 2, only after Phase 1 is complete, is to evaluate whether enough subsequent trading/volume occurred around favorable prices to make the theoretical exit plausible.