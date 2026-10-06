# Demo Buy Evaluation / Trusted Reads SQL Preflight

Scope: TREE `4.3.3` only.

This preflight is required by `AGENTS.md` before the first execution of the new/materially changed Demo Buy evaluation/read SQL. It covers the shared evaluator used by `demo.buy.page` and `demo.buy.observation.get`, plus the bounded `demo.buy.capture.get` provenance read.

No query in this document has been executed yet.

## 1. Purpose and observable contract

The trusted Node read model must answer what happened after an immutable Demo Buy item without changing persisted authority.

For every item:

- baseline authority is the exact `history(cycle_id = buy_cycle_id, security_id)` row;
- each fixed horizon targets `captured_at_ms + horizon_ms`;
- a future observation must satisfy the same `security_id`, `cycle_id > buy_cycle_id`, and `collected_at_ms >= target_at_ms`;
- first `collected_at_ms`, then lowest `cycle_id`, wins even when that row has `Price = NULL`;
- browser code performs no market arithmetic;
- no baseline/future/outcome facts are persisted.

`demo.buy.page` returns a fixed 50-item keyset page ordered by `capture_id DESC, result_rank ASC` from one DuckDB statement snapshot. `demo.buy.observation.get` evaluates exactly one persisted item with identical semantics. `demo.buy.capture.get` returns immutable capture provenance on demand and does not repeat full SQL/context per page item.

## 2. Schema / data-source validation

Authoritative sources are existing schema-v4 tables only:

- `demo_buy_captures`
  - `capture_id BIGINT PRIMARY KEY`
  - `captured_at_ms BIGINT NOT NULL`
  - immutable source query/timing/mode/provenance fields
- `demo_buy_items`
  - `(capture_id, security_id)` primary key
  - unique `(capture_id, result_rank)`
  - `buy_cycle_id BIGINT NOT NULL`
- `history`
  - primary key `(cycle_id, security_id)`
  - `collected_at_ms BIGINT NOT NULL`
  - `Price DOUBLE NULL`
  - U.S. identity/display fields used for compact observation metadata

No `latest` row is evaluation authority. `buy_cycle_id` is the persisted writer-order watermark.

Baseline absence is impossible for a healthy capture but must be detectable because the schema intentionally uses semantic rather than physical foreign keys.

## 3. Cardinality estimate

Phase-1 fixed horizons: `10`.

`demo.buy.page` bounds the selected item set before horizon expansion:

```text
page items                    <= 50
expanded item/horizon rows    <= 500
```

At the final target-machine day profile (`4096 x 180`), one security has at most roughly 180 same-day history rows in the normal synthetic workload. A conservative page join therefore considers approximately:

```text
50 items x 10 horizons x 180 same-security rows = 90,000 candidate comparisons
```

before first-row selection, plus the initial scan/filter cost over the active-day `history` table.

`demo.buy.observation.get` is bounded to one persisted item:

```text
1 item x 10 horizons x ~180 rows = ~1,800 candidate comparisons
```

`demo.buy.capture.get` returns one capture header plus one item count.

There is no unbounded result set: page evaluation returns at most 500 evaluator rows before Node groups them into 50 browser observations.

## 4. Access-path inventory

Planned page statement:

1. keyset-select at most 50 ordered `demo_buy_items` joined to `demo_buy_captures`;
2. left join `history` once for each item's exact baseline key;
3. cross join a 10-row constant horizon relation;
4. left join post-watermark `history` candidates by `security_id`, `cycle_id > buy_cycle_id`, `collected_at_ms >= target_at_ms`;
5. rank candidate future rows per `(capture_id, security_id, horizon_ms)` by `collected_at_ms ASC, cycle_id ASC`;
6. retain rank 1 and return compact evaluator rows.

The browser/service performs one read operation, not 10 horizon calls per item.

Planned targeted observation statement uses the same evaluator shape with one exact `(capture_id, security_id)` item selection.

Planned capture-detail statement reads one `demo_buy_captures` row and derives `capturedItemCount` with a bounded aggregate over matching `demo_buy_items`.

## 5. Predicate / selectivity review

Selection must happen before horizon expansion.

For page reads:

```text
cursor == null:
  ORDER BY capture_id DESC, result_rank ASC
  LIMIT 50

cursor != null:
  capture_id < cursor.capture_id
  OR (capture_id = cursor.capture_id AND result_rank > cursor.result_rank)
  ORDER BY capture_id DESC, result_rank ASC
  LIMIT 50
```

The continuation predicate naturally excludes captures newer than the cursor's capture ID, so new Auto captures cannot perturb an in-progress continuation walk.

Future-history predicates are applied in the join itself:

```text
h.security_id = item.security_id
AND h.cycle_id > item.buy_cycle_id
AND h.collected_at_ms >= target_at_ms
```

No timestamp-only path is allowed.

## 6. Join / row-explosion review

Uniqueness assumptions are explicit:

- one capture row per `capture_id`;
- one item per `(capture_id, security_id)`;
- one item per `(capture_id, result_rank)`;
- one baseline history row per `(buy_cycle_id, security_id)`.

Baseline uses `LEFT JOIN`, not `INNER JOIN`, so corruption is surfaced instead of silently deleting the item.

The only intentional one-to-many expansion is:

```text
selected item
→ 10 horizons
→ qualifying future history candidates
```

The item set is bounded to 50 first. Candidate ranking then collapses each item/horizon to exactly one row (or the left-join no-match row). No many-to-many relation outside this bounded evaluator is introduced.

## 7. Sort / window / grouping review

Required sorts are contract-driven:

- page items: `capture_id DESC, result_rank ASC`;
- future tie-break: `collected_at_ms ASC, cycle_id ASC` within one item/horizon.

The evaluator may use `ROW_NUMBER() OVER (PARTITION BY capture_id, security_id, horizon_ms ORDER BY collected_at_ms, cycle_id)` and retain `rn = 1`.

This is preferred over price-dependent aggregates because the first qualifying row must win even when `Price` is `NULL`.

Node groups at most 500 compact evaluator rows into at most 50 observation objects. No SQL `DISTINCT` or global materialization is required.

## 8. Repeated-work elimination

One shared evaluator SQL builder/statement shape will serve both:

- `demo.buy.page` (50 selected items);
- `demo.buy.observation.get` (one exact selected item).

Only the item-selection CTE differs. Horizon logic, baseline join, watermark predicates, future tie-break and returned evaluator fields remain identical.

This avoids:

- separate browser arithmetic;
- 10 queries per item;
- 50 item queries per page;
- duplicated evaluator semantics between page and targeted refresh;
- persisted horizon columns or a background updater.

`demo.buy.capture.get` is intentionally separate because it is provenance retrieval, not outcome evaluation.

## 9. Boundedness / resource / transaction review

`demo.buy.page` uses one SQL statement, so all baseline/future rows in that page are read from one transactionally consistent DuckDB statement snapshot.

No write transaction is opened and no authority table is mutated.

Maximum browser-facing page items remain 50. Maximum intermediate evaluator rows returned to Node remain 500 before grouping.

The page response omits full `source_query_sql` and `source_result_context_json`; these are loaded only by `demo.buy.capture.get` / later AI export.

The implementation adds no cache, materialized outcome table, background horizon worker or speculative history index.

## 10. Architecture / schema / code alternative review

Alternatives rejected for this node:

- persisted horizon/outcome columns: violates reconstructable-facts-only contract;
- background updater: adds lifecycle/race authority with no evidence of need;
- browser-side evaluation: duplicates authority and permits semantic drift;
- N x 10 service calls: violates bounded set-wise read requirement;
- new DB/index by default: no representative evidence yet;
- second read subsystem: existing `createViewerReads` is the proven trusted-read seam.

Smallest sufficient change:

```text
existing Viewer read connection
→ shared Demo Buy evaluator
→ page / targeted observation / capture-detail methods
→ existing service/protocol routing
```

## 11. Null / zero / integrity semantics review

Baseline row missing:

```text
stable Demo Buy baseline-integrity read error
```

It is not an `UNAVAILABLE` horizon.

For each horizon, unavailable reason precedence is exactly:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

The first qualifying future row is retained even when `Price` is null.

When both prices are usable:

```text
changePercent = ((futurePrice / baselinePrice) - 1) * 100
UP   > 0
DOWN < 0
FLAT = 0
```

A zero baseline never divides; it yields `BASELINE_PRICE_ZERO`.

## 12. Timing-anomaly review

Writer/cycle ordering remains authority. Wall-clock fields are diagnostics only.

Returned diagnostics derive only when non-negative:

```text
baselineAgeMs     = capturedAtMs - baselineCollectedAtMs
actualElapsedMs   = observedAtMs - capturedAtMs
```

A negative derived value becomes `null` plus bounded timing-anomaly state. It never changes candidate ordering, rejects an otherwise valid persisted item, or clamps to zero.

`targetAtMs = capturedAtMs + horizonMs` remains the horizon target even when diagnostic wall-clock relationships are anomalous.

## 13. Cursor validation / stability review

The page cursor is opaque protocol data and must encode exactly versioned last-item identity:

```text
v
captureId
resultRank
```

Validation requires positive safe integers and exact keys/version.

Continuation uses the last returned pair and the canonical ordering predicate. It does not encode SQL/context or browser state.

Because continuation only walks rows strictly after that pair in `capture_id DESC, result_rank ASC` order, later higher capture IDs are excluded and cannot shift previously reachable continuation rows.

## 14. Failure / diagnosability review

Stable concepts remain:

```text
demo_buy.evaluate
demo_buy.read
demo_buy.provenance_read
demo_buy.observation_read
```

Errors must be sanitized and bounded. Diagnostics never emit stored SQL, context JSON, history rows or raw authenticated/provider state.

Protocol validation errors are distinct from baseline-integrity corruption and ordinary not-found/membership mismatch.

No read failure mutates DB state.

## 15. First-execution plan

After this preflight is committed, the first execution must be the smallest deterministic real-DuckDB fixture that can falsify the evaluator:

1. one capture item with exact baseline;
2. two qualifying future rows at the same `collected_at_ms` but different cycle IDs to prove tie-break;
3. one anomalous pre-watermark row whose timestamp would otherwise qualify, proving `cycle_id > buy_cycle_id` blocks hindsight;
4. one horizon with no qualifying future row;
5. one qualifying future row with `Price = NULL` proving it is not skipped.

Only after that fixture is green may tests scale to null/zero/reason precedence, delayed observation, 50-item paging, stable continuation, targeted refresh parity, restart/new-day behavior and representative active-day timing.

## 16. Representative measurement decision

Initial implementation intentionally has no new `history` index.

Measure the shared evaluator after correctness is proven using the repository's bounded active-day workload shape, including:

- one 50-item page;
- one targeted observation refresh;
- Scanner + Demo Buy coexistence.

If timing is acceptable, stop. If materially slow, inspect actual dominant cost first; only measured evidence may justify an index/precompute/schema change.

## Preflight result

`PASS_FOR_SMALLEST_FIXTURE_EXECUTION`

The proposed query shape is bounded, authority-correct, set-wise, compatible with existing schema-v4 facts and existing trusted-read architecture, and does not justify new persistence/index/background infrastructure before measurement.
