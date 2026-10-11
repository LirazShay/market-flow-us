# Backtest 10.3 Outcome Evaluation SQL Preflight

Scope: PLAN / execution task `10.3` only.

This preflight is required by `AGENTS.md` before the first execution of new Backtest post-decision evaluation SQL. It reviews the smallest set-wise read needed to evaluate one historical Scanner decision point from immutable Market Flow US evidence.

No SQL introduced by task `10.3` has been executed yet.

## 1. Purpose and observable contract

For one historical Scanner decision point, Backtest already resolves:

```text
B  = exact complete baseline cycle selected by requested historical time
T0 = requested historical time
```

The historical Scanner executes against a detached `history <= B` / `latest = B` sandbox and returns ordered result rows. Task `10.3` must evaluate selected returned rows against the original read-only evidence source without creating Demo Buy captures/items or any other Backtest persistence.

Each decision item is identified by:

```text
(B, T0, returnedPosition, securityId)
```

For every selected `securityId`:

- baseline authority is exactly `history(cycle_id = B, security_id = securityId)`;
- horizon target is `T0 + horizonMs`, not baseline collection time and not Scanner completion time;
- future evidence must have the same `security_id`, `cycle_id > B`, and `collected_at_ms >= T0 + horizonMs`;
- first `collected_at_ms`, then lowest `cycle_id`, wins, including when that row has `Price = NULL`;
- percentage/outcome/unavailable shaping must reuse the established Demo Buy semantics rather than fork a second formula;
- baseline age and resolved timing remain inspectable diagnostics;
- missing baseline row is an integrity failure, not an unavailable horizon;
- evaluation mutates nothing.

Default horizons are ordered:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

Optional ordered horizons are:

```text
3m, 5m, 10m
```

The evaluator must preserve caller order only when it is the canonical ascending subset/order accepted by the task contract; it must not silently invent, duplicate or reorder arbitrary horizons.

## 2. Schema / data-source validation

The evaluator reads only existing product evidence:

### `history`

Required authority fields already used by product reads / historical Scanner:

```text
cycle_id        BIGINT authority / writer order
security_id     VARCHAR canonical identity
collected_at_ms BIGINT wall-clock evidence timestamp
Price           DOUBLE NULL
Symbol          display metadata
PaperNameEng    display metadata
PaperNameHeb    display metadata
ExchangeName    display metadata
```

The existing schema authority guarantees one history row per `(cycle_id, security_id)`.

### `cycles`

Task `10.2` already resolves `B` from complete cycles using `committed_at_ms <= requestedAtMs`, ordered by `committed_at_ms DESC, cycle_id DESC`. Task `10.3` must consume that resolved baseline; it must not resolve a second baseline independently.

### selected decision rows

Selected rows are transient Backtest input derived from the exact historical Scanner result, not a database table. The SQL receives only the bounded identity/rank facts required for evaluation:

```text
returned_position
security_id
```

`B`, `T0` and horizons are evaluator inputs. Scanner display/value payload is not future-outcome authority.

No `latest`, Demo Buy table, Replay table, order table or provider source participates in evaluation.

## 3. Cardinality estimate

The product universe target is approximately 4,096 securities. A Scanner query may legitimately return many or all of them, so correctness must not assume a tiny Top-X set.

With all ten supported horizons:

```text
selected items                 <= historical Scanner rowCount (target width ~4,096)
item/horizon targets           <= ~40,960
normal same-security day rows  ~180 in the representative workload shape
worst normal candidate pairs   ~4,096 x 10 x 180 = 7,372,800
returned evaluator rows        <= selected items x requested horizons
```

The default seven horizons reduce the target count to approximately 28,672 for a full-universe result.

This is materially larger than the 50-item Demo Buy page evaluator, so the Backtest implementation must avoid per-item/per-horizon service round trips and repeated reopening/copying of the source. The query remains bounded by one selected Scanner result, the fixed canonical horizon set and one product-owned day evidence file.

Task `10.6` owns representative Inspect/Compare/Sweep measurement and any evidence-driven optimization. Task `10.3` must keep the initial mechanism simple and set-wise while avoiding obviously multiplicative application-level work.

## 4. Access-path inventory

Planned evaluator statement shape:

1. materialize transient selected decision rows from bound values;
2. materialize the requested small canonical horizon relation;
3. join each selected item to the exact baseline history key `(B, security_id)`;
4. cross the baseline item with requested horizons;
5. left join only future rows matching:
   - same `security_id`;
   - `cycle_id > B`;
   - `collected_at_ms >= target_at_ms`;
6. rank qualifying future candidates per `(returned_position, security_id, horizon_ms)` by `collected_at_ms ASC, cycle_id ASC`;
7. retain rank 1;
8. return compact baseline/future facts to Node for shared Demo Buy outcome shaping.

The original evidence connection is already `READ_ONLY`; no table copy is needed for outcome evaluation because future evidence is intentionally required here.

The evaluator must issue one set-wise statement for the selected item set, not N item queries or N x H horizon queries.

## 5. Predicate / selectivity review

The strongest safe predicates belong in joins before ranking:

```text
baseline:
  b.cycle_id = B
  AND b.security_id = selected.security_id

future:
  f.security_id = selected.security_id
  AND f.cycle_id > B
  AND f.collected_at_ms >= T0 + horizon_ms
```

`cycle_id > B` is mandatory even if a later wall-clock timestamp appears to qualify. Writer/cycle order prevents pre-watermark/hindsight leakage.

`collected_at_ms >= target_at_ms` is mandatory even if `cycle_id` is later. The horizon contract is first-at-or-after the requested decision-time target.

No timestamp-only or cycle-only shortcut is allowed.

## 6. Join / row-explosion review

Uniqueness assumptions:

- selected decision input contains one row per returned position and one canonical `securityId` per selected row;
- `history(B, securityId)` is unique;
- canonical horizons are unique;
- qualifying future history is one-to-many until deterministic first-row selection.

Baseline must use `LEFT JOIN`, not `INNER JOIN`, so a missing exact baseline row remains observable and can fail integrity instead of silently deleting a selected Scanner result.

The intentional expansion is only:

```text
selected item
→ requested canonical horizons
→ qualifying same-security future candidates
```

Ranking collapses each item/horizon back to one row, including a left-join no-match row.

The implementation must reject duplicate returned positions / invalid selected identities before SQL rather than allowing accidental partition collisions or many-to-many amplification.

## 7. Sort / window / grouping review

The only contract-required future sort is:

```text
ORDER BY f.collected_at_ms ASC, f.cycle_id ASC
```

inside each exact item/horizon partition.

A `ROW_NUMBER()` window is acceptable because it preserves the first qualifying row even when its price is null. Price-dependent aggregates such as `MIN(Price)` are forbidden because they would change evidence semantics.

Final returned rows should be deterministically ordered by:

```text
returned_position ASC, horizon_ms ASC
```

No global `DISTINCT`, price sort or unnecessary grouping is required.

## 8. Repeated-work elimination

The implementation must deliberately reuse existing authority rather than recreate it:

- consume task `10.2` baseline `B`; do not re-run baseline resolution;
- consume exact historical Scanner result positions/identities; do not re-run Scanner SQL inside the evaluator;
- reuse shared Demo Buy horizon/outcome shaping for null/zero/changePercent/UP/DOWN/FLAT semantics;
- keep one evidence source open for one evaluation call;
- issue one set-wise SQL statement for all selected items and horizons;
- do not create Demo Buy captures/items as an adapter;
- do not persist derived Backtest outcomes.

A second independent percentage implementation is specifically rejected because semantic drift would violate PLAN `10.3`.

## 9. Boundedness / resource / transaction review

The evaluator is read-only and single-statement with respect to outcome evidence.

Bounds:

```text
items     <= exact historical Scanner result rows selected by caller
horizons  <= 10 fixed supported horizons
output    <= items x horizons
```

Application code must validate the selected rows and supported horizon set before constructing SQL values.

No write transaction, temp file, persistent temp table, cache, outcome table, Demo Buy row or background worker is introduced.

The source connection is already hardened `READ_ONLY` by `openBacktestEvidenceSource` and remains owned/closed by the Backtest call path.

If full-universe evaluation proves materially slow under representative measurement, the executor must inspect measured dominant cost before adding an index, precomputation or more complex query. Performance speculation is not authority to expand architecture.

## 10. Architecture / schema / code alternative review

Rejected alternatives:

- **Create fake Demo Buy captures/items** — violates the no-Backtest-persistence contract and creates lifecycle authority that does not exist.
- **Copy future rows into the historical Scanner sandbox** — weakens the sandbox's no-lookahead invariant and duplicates evidence unnecessarily.
- **Evaluate each row/horizon separately** — application-level N x H work is avoidable and scales badly at full-universe width.
- **Browser-side outcome arithmetic** — duplicates trusted semantics and creates drift.
- **Persist outcome columns/table** — derived facts are reconstructable from immutable history and are intentionally not authority.
- **New index/schema by default** — no representative Backtest measurement yet justifies it.
- **New strategy engine** — Scanner SQL remains strategy authority; `10.3` evaluates decisions only.

Smallest sufficient architecture:

```text
historical Scanner point from 10.2
→ exact selected (returnedPosition, securityId)
→ one read-only set-wise history evaluator on original evidence
→ shared Demo Buy-equivalent outcome shaping
→ immutable Backtest evaluation result
```

## 11. Null / zero / unavailable / integrity semantics

Missing exact baseline row:

```text
BACKTEST_BASELINE_INTEGRITY (or the final stable Backtest integrity error selected by implementation)
```

It is a whole-item/evaluation integrity failure, not an `UNAVAILABLE` horizon.

For a structurally valid baseline row, horizon unavailable precedence must remain Demo Buy-equivalent:

```text
NO_FUTURE_OBSERVATION
BASELINE_PRICE_UNAVAILABLE
BASELINE_PRICE_ZERO
FUTURE_PRICE_UNAVAILABLE
```

The first qualifying future row wins even when `Price = NULL`; the evaluator must not skip it in search of a later non-null price.

When both prices are usable:

```text
changePercent = ((futurePrice / baselinePrice) - 1) * 100
UP   when changePercent > 0
DOWN when changePercent < 0
FLAT when changePercent = 0
```

This arithmetic must come from the shared Demo Buy outcome helper, not from Backtest-specific duplicate code.

## 12. Timing / inspectability review

`T0` is the decision request time and remains distinct from resolved baseline timing.

For every item, expose enough baseline information to inspect:

```text
baseline.cycleId        = B
baseline.collectedAtMs
baseline.price
baseline.ageMs          = T0 - baseline.collectedAtMs when non-negative
```

The resolved baseline cycle already carries `committedAtMs`; the Backtest point can therefore expose decision/baseline resolution timing without allowing timing diagnostics to change authority.

For every horizon:

```text
targetAtMs      = T0 + horizonMs
observedAtMs    = selected future collected_at_ms or null
actualElapsedMs = observedAtMs - T0 when non-negative
```

Wall-clock regressions become bounded diagnostics/null derived durations; they do not change candidate ordering or permit future-row substitution.

Safe-integer overflow of `T0 + horizonMs` is invalid input/integrity and must fail rather than wrap.

## 13. Input / identity validation review

Before SQL:

- `B` must be a positive safe integer and must equal the point's resolved baseline cycle;
- `T0` must be a non-negative safe integer and must equal the point's requested time;
- each `returnedPosition` must be a positive safe integer;
- returned positions must be unique and strictly represent the exact Scanner ordering supplied by the caller;
- each `securityId` must be non-empty canonical identity text;
- duplicate selected security identity is invalid for one Scanner result evaluation;
- horizons must be unique members of the fixed supported list and remain canonical ascending order;
- at least one selected item and one horizon are required for a material evaluation call; an empty Scanner result is handled without issuing outcome SQL.

Bound parameters carry values. Caller-provided identity text must never be concatenated as SQL literals.

## 14. Failure / diagnosability review

Failures must be bounded and public-safe. Do not include raw history rows, Scanner SQL, arbitrary source paths, account/provider data or authenticated browser state in errors.

Distinguish at minimum:

```text
invalid Backtest evaluation input
baseline integrity failure
source unavailable/incompatible/in-use failures inherited from 10.1
SQL/read execution failure
ordinary horizon unavailable reasons in successful results
```

A read/evaluation failure mutates nothing and must not manufacture partial successful outcomes unless the contract explicitly identifies per-horizon `UNAVAILABLE` from valid evidence.

## 15. First-execution plan

After this preflight is committed, the first new SQL execution must use the smallest deterministic real-DuckDB fixture that can falsify the contract quickly:

1. one selected security with exact baseline `(B,S)`;
2. one pre-watermark row whose timestamp would otherwise qualify, proving `cycle_id > B` blocks hindsight;
3. two qualifying future rows at identical `collected_at_ms` with different cycle IDs, proving lowest cycle tie-break;
4. one first qualifying future row with `Price = NULL`, proving it is retained rather than skipped;
5. one horizon with no qualifying future row;
6. exact assertion that no `demo_buy_*` row/table content changes because of evaluation.

Then extend focused proof to:

- all four unavailable reasons and their precedence;
- positive/negative/flat percentage math through the shared helper;
- default seven horizons and optional 3m/5m/10m order;
- missing baseline row integrity failure;
- baseline age / target / actual elapsed inspectability;
- multiple selected items with returned-position ordering;
- exact equivalence against established Demo Buy semantics for identical evidence facts;
- schema v3 and v4 evidence compatibility where `history` authority is identical;
- source immutability.

## 16. Performance / later measurement decision

Task `10.3` correctness proof should use the narrowest fixtures required to falsify semantics. Do not repeatedly run a 4k x 180 workload in hosted CI merely to prove arithmetic.

Task `10.6` owns representative Backtest measurement for Inspect/Compare/second-level Sweep. At that point measure wall-clock behavior and identify the dominant cost before changing SQL architecture.

If `10.3` focused proof exposes an obviously avoidable repeated scan or row explosion beyond the bounded design above, fix it before closure; otherwise keep the KISS set-wise evaluator and defer speculative optimization.

## Preflight result

`PASS_FOR_SMALLEST_FIXTURE_EXECUTION`

The proposed task `10.3` outcome query is read-only, bounded by one historical Scanner result and the fixed horizon contract, preserves the exact `(B,T0)` anti-lookahead boundary, reuses Demo Buy outcome semantics, introduces no Backtest persistence and is ready for the smallest deterministic first SQL execution.