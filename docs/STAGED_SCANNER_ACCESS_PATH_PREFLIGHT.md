# Staged Scanner — Access Path Static Preflight

Status: **APPROVED FOR ONE SMALLEST DETERMINISTIC PROBE ONLY — no representative workload yet**

Scope: choose the smallest exact-semantics replacement candidate after `docs/STAGED_SCANNER_SQL_PREFLIGHT.md` rejected the lifetime-growing aggregate rewrite and R-US-EXEC-REOPEN-003 preserved unlimited same-security nearest-prior semantics.

No SQL in this document has been executed. No benchmark, Fast suite, service query, `EXPLAIN ANALYZE`, or representative workload was run while producing this review.

## Static platform facts

The project currently uses:

```text
@duckdb/node-api 1.5.5-r.5
schema v3
history PRIMARY KEY (cycle_id, security_id)
latest PRIMARY KEY (security_id)
```

Relevant DuckDB access-path facts from the current official documentation:

- general-purpose columns automatically receive zonemaps/min-max metadata;
- zonemap pruning becomes more useful when stored values are ordered;
- explicit ART indexes add write/update/delete maintenance cost;
- index scans are eligible for a single plain indexed column, primarily equality/`IN` predicates;
- a multi-column ART index is not eligible for an index scan;
- ART indexes do not generally accelerate joins, aggregation or sorting;
- `ASOF LEFT JOIN` expresses nearest-prior matching directly and returns at most one right row per left row.

These facts matter because U.S. `history` is appended cycle-by-cycle and `collected_at_ms` is therefore naturally time-ordered/nondecreasing in the normal producer path.

## Access-path candidates

### A. Composite ART `(security_id, collected_at_ms, cycle_id)`

Reject.

It looks semantically aligned but DuckDB does not use a multi-column ART as a normal index-scan access path. It would add storage and maintenance to every 4,096-row commit without static evidence that the staged query can use it.

### B. Single-column ART on `security_id`

Reject for the recurring hot path.

The normal staged query evaluates essentially the entire current universe, so `security_id` is not selective for that path. A single-security index might eventually help an exceptional fallback lookup, but paying its write amplification on every history insert is not justified before focused evidence demonstrates that fallback is the real bottleneck.

### C. Single-column ART on `collected_at_ms`

Reject.

The candidate needs temporal range/ASOF work rather than a highly selective equality/`IN` lookup. The existing time ordering plus automatic zonemap pruning is a better first mechanism and adds no write amplification.

### D. Packed/expression lookup key

Reject.

An expression or encoded timestamp/security/cycle key increases complexity, introduces overflow/encoding/tie-break concerns, and expression indexes are not eligible for the desired ordinary index scan. It is not KISS.

## Selected candidate — bounded recent hot path + exact exceptional fallback

Preserve the exact product semantics while making the normal recurring path independent of total retained history.

Logical shape:

```text
latest
→ expand 7 target ages per current security
→ 4,096 × 7 = 28,672 target rows

history recent band only
→ collected_at_ms within roughly current-150s .. current-10s
→ deduplicate equal (security_id, collected_at_ms) by highest cycle_id

28,672 targets
ASOF LEFT JOIN
bounded recent history
→ at most 28,672 recent matches

recently unmatched targets only
→ exact fallback lookup in full history
   same security
   collected_at_ms <= target
   ORDER BY collected_at_ms DESC, cycle_id DESC
   LIMIT 1

recent matches + fallback matches
→ pivot 7 anchor prices/security
→ contiguous stage_reached
→ deterministic ranking
→ LIMIT 100
```

The `150s` recent band is an implementation-performance window, **not** a semantic tolerance. It covers the maximum 120-second anchor plus a 30-second performance pad. If the correct predecessor is older, the exact fallback remains responsible for returning it. Therefore changing the pad changes only the likelihood of entering the fallback path, not query meaning.

The candidate must detect a recent match by matched row identity (`cycle_id`), not by `Price`, because a valid matched row may legitimately have `Price IS NULL`; a NULL price must stop staged progression rather than cause the query to search for an older non-NULL value.

---

# 12-stage static gate

## 1. Purpose / observable contract

Required output remains unchanged:

- seven nearest-prior prices for 10/20/30/45/60/90/120 seconds;
- nearest row is per `security_id`;
- `collected_at_ms DESC, cycle_id DESC` decides the predecessor;
- NULL/missing prior data stops contiguous progression;
- final ranking remains `stage_reached`, `ChangePercent`, `DailyVolume`, `securityId`;
- output remains top 100.

Result: **PASS**.

## 2. Schema and type validation

The candidate needs only existing schema-v3 columns:

```text
latest.security_id
latest.collected_at_ms
latest.Price
latest.ChangePercent
latest.DailyVolume
history.security_id
history.collected_at_ms
history.cycle_id
history.Price
```

No schema migration is necessary for the first probe.

Result: **PASS**.

## 3. Cardinality estimate

Representative scale:

```text
latest = 4,096
history = 737,280
logical cadence = 3s
```

Target rows are fixed:

```text
4,096 × 7 = 28,672
```

A conservative 150-second band contains at most about 50 representative cycles:

```text
50 × 4,096 = 204,800 recent history rows
```

The recent ASOF result cannot exceed 28,672 rows. This replaces the rejected aggregate shape whose final-cycle intermediate was about 720,896 rows and grew with DB lifetime.

Result: **PASS FOR NORMAL PATH BOUNDEDNESS**.

## 4. Access-path inventory

Normal path:

- one bounded time-range scan of `history`;
- automatic `collected_at_ms` zonemap pruning is eligible to skip older row groups because writes are time ordered;
- one ASOF nearest-match operation;
- one bounded pivot/ranking phase.

Exceptional path:

- exact full-history nearest-row lookup exists only for target rows not resolved in the recent band.

No new persistent index/table/precompute is introduced.

Result: **PASS WITH EXCEPTIONAL-PATH RISK TO MEASURE**.

## 5. Predicate/selectivity review

Recent history must apply both lower and upper time bounds before temporal matching:

```text
history.collected_at_ms >= current_lower_bound - 150000
history.collected_at_ms <= current_upper_bound - 10000
```

The exact implementation should derive safe min/max current timestamps from `latest` rather than rely on an undocumented single scalar constant, even though complete U.S. cycles normally share one `collectedAtMs`.

The fallback is gated by `matched_cycle_id IS NULL`, not `matched_price IS NULL`.

Result: **PASS**.

## 6. Join / row-explosion review

The normal temporal relation is intentionally `targets ASOF LEFT JOIN recent_history`.

An ASOF join yields at most one history row per target, so target/history many-to-many row explosion is eliminated from the normal path.

The old `latest × all older history` relation is forbidden in the replacement.

Result: **PASS**.

## 7. Equal-timestamp / deterministic tie-break review

ASOF timestamp matching alone must not choose arbitrarily when the same security has multiple rows at the same `collected_at_ms`.

Before recent ASOF matching, the bounded recent relation must keep exactly the row with highest `cycle_id` for every `(security_id, collected_at_ms)` pair.

The exceptional fallback must continue using:

```text
ORDER BY collected_at_ms DESC, cycle_id DESC
LIMIT 1
```

Result: **PASS IF IMPLEMENTED EXACTLY**.

## 8. Repeated-work elimination

The replacement must not contain seven independent full-history scans/lookups in the normal path.

All seven horizons are represented as rows in one target relation, then handled by one temporal match and one pivot.

The full-history fallback may repeat work only for unresolved targets. That repetition is explicitly exceptional and is not accepted as the normal recurring algorithm.

Result: **PASS**.

## 9. Sort / group / window review

Potential expensive operators are limited to bounded relations:

- recent equal-timestamp deduplication over at most the recent band;
- ASOF planning/matching over 28,672 targets plus the recent band;
- pivot/group over at most 28,672 resolved rows;
- final sort over roughly 4,096 candidate securities before `LIMIT 100`.

No ordered aggregate over all retained history remains in the normal path.

Result: **PASS FOR FIRST PROBE**.

## 10. Write amplification / commit-path review

Selected first candidate adds:

```text
new table        = none
new column       = none
new persistent index = none
new commit SQL   = none
```

Therefore the already-sensitive 4,096-row cycle commit path receives zero new index/precompute maintenance cost from this experiment.

This is preferable to adding an ART index whose usefulness for this query is statically doubtful while its write cost is certain.

Result: **PASS**.

## 11. Long-lived DB / exceptional fallback review

The normal continuous-membership path is bounded by the recent band and does not intentionally scan historical lifetime.

Exact semantics still require an arbitrarily old predecessor when a current security has a sufficiently long history/membership gap. Therefore the fallback can be lifetime-sensitive in that exceptional case.

This is accepted only for the smallest first probe because it is the irreducible exactness path. The probe must separately prove:

1. continuous-membership fixture resolves entirely through the bounded recent path;
2. remove/re-add or old-gap fixture still returns the exact older predecessor;
3. the fallback is not accidentally planned/executed as a full-history hot path when no targets are missing.

If the fallback is shown to dominate normal execution, stop and reopen the access-path decision again; only then consider a single-column lookup index or a rolling exact temporal structure.

Result: **PASS FOR TINY PROBE ONLY; NOT YET RELEASE-SCALE APPROVAL**.

## 12. Architecture / KISS review

Compared alternatives:

```text
composite ART index             → rejected: no useful ordinary index-scan path
single security ART             → deferred: write cost, not useful for all-current hot path
single time ART                 → rejected: zonemap/time ordering is the cheaper first mechanism
packed expression index         → rejected: complexity without access-path proof
temporal precompute/feature engine → rejected for now: larger subsystem than evidence requires
bounded recent ASOF + fallback  → selected
```

The selected candidate changes only one built-in query shape and preserves existing authority/schema/transaction behavior.

Result: **PASS / KISS**.

---

# Gate decision

The candidate is statically approved only for the first falsification step:

```text
bounded recent ASOF hot path
+ exact fallback for unresolved target rows
→ static gate PASS
→ allowed next: implement candidate + focused correctness fixture + smallest deterministic timing/plan probe
→ forbidden next: 4096 × 180 representative workload
```

The first execution must stop immediately if any of these occur:

- continuous-membership case still scans/processes all retained history;
- fallback runs for targets that already have a recent match;
- equal-timestamp highest-`cycle_id` semantics drift;
- NULL price incorrectly causes an older fallback value to be substituted;
- focused execution is unexpectedly slow;
- implementation requires a schema/precompute subsystem not justified above.

Only after the focused probe is green may this candidate be considered for the representative workload and canonical Scanner guide synchronization.