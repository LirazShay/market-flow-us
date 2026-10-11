# Market Flow US — Backtest Lab Contract

## Purpose

Backtest Lab is a dedicated offline research surface for one core goal:

> Test and compare Scanner SQL strategies deterministically on historical market data, then inspect exactly what each strategy selected and what happened afterward.

It is deliberately separate from the normal live product surface. It is not a general-purpose quant platform, optimizer or trading simulator.

The feature must make serious investigation easy for a beginner without hiding the underlying evidence from an advanced user.

## Product shape

Backtest Lab has three modes:

```text
Inspect
Compare
Sweep
```

They are three views over the same historical authority/evaluator, not three separate engines.

### Inspect

Use when learning or debugging one Query at one historical point.

```text
choose day + time
→ choose one saved/built-in/edited Query
→ choose Top X / All
→ choose horizons
→ Run
→ small summary
→ full per-security outcome rows
```

### Compare

This is the primary strategy-comparison workflow.

```text
choose day + time
→ choose Query A + Query B
→ optional Query C
→ same Top X / horizons for all
→ Run
→ compact comparison summary
→ full Side-by-Side evidence
→ drill into differences
```

Compare MUST NOT reduce the result to aggregates only.

The default comparison result has two layers:

1. **Summary** — quick orientation: count, average, median, positive rate, overlap and representative horizon values.
2. **Side by Side** — every selected security from each Query with returned position, baseline price and each selected future horizon percentage/price/unavailable state.

The user can visually inspect:

```text
same security in both Queries
different returned positions
security only in A
security only in B
security only in C
positive/negative divergence
```

Where practical, side-by-side lists remain aligned by returned position and support filtering to differences/common rows without changing the underlying result.

Summary assists investigation; it never replaces the security rows and never automatically declares a strategy globally superior.

### Sweep

Use when the user wants to know whether behavior seen at one moment repeats across historical time.

Sweep accepts:

```text
day
from time
to time
every positive integer X seconds or minutes
one Query OR the current Compare set
Top X / All
horizons
```

Examples:

```text
every 1 second
every 5 seconds
every 10 seconds
every 30 seconds
every 2 minutes
```

Sweep uses layered reporting so second-level runs remain understandable instead of producing one giant unreadable result matrix.

Top level contains:

1. a small run summary;
2. compact aggregate cards/table per Query when comparing;
3. a paged/virtualized timeline with one row per requested historical point.

Each timeline row shows enough to decide whether to inspect it, for example:

```text
requested time
resolved cycle
returned/evaluated count
average/median at selected summary horizon
positive count/rate
overlap/delta when comparing
```

Every timeline row has `Open`.

`Open` enters the exact same detailed evidence used by Inspect/Compare at that historical point:

- one Query → full security table;
- multiple Queries → full Side-by-Side comparison.

This gives a deterministic navigation path:

```text
Sweep overview
→ interesting time point
→ Open
→ exact Query result(s)
→ every security
→ every selected horizon
```

The Lab may also expose simple presentation filters such as positive/negative/threshold/differences-only. Filters never alter the underlying run.

## Beginner-first UX without reducing capability

The feature is powerful, but the default path must remain simple.

Default landing mode is `Compare` because comparing strategy Queries is the central user goal.

The first screen exposes only the minimum controls:

```text
1. choose Inspect / Compare / Sweep + historical time
2. choose Query/Queries + Top X
3. choose horizons + Run
```

Defaults:

```text
Compare
2 Queries
Top 10
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

Advanced controls such as Query C, longer horizons, SQL editing and detailed timing/cycle metadata stay available through progressive disclosure rather than cluttering the default path.

Plain-language inline help explains:

- historical decision time;
- resolved market cycle;
- no-lookahead;
- Top X;
- returned position versus semantic ranking;
- repeated baseline cycles in fast Sweep;
- Pending/Unavailable;
- why Summary and Side-by-Side answer different questions.

## Independent offline boundary

The Lab has its own opt-in local launcher/process:

```text
START_BACKTEST_LAB.cmd
→ loopback Backtest Lab process
→ local Backtest Lab page
→ existing Market Flow US DuckDB files as read-only evidence
```

It does not require or start:

```text
provider page / authentication
bookmarklet
Collector / Recorder
live producer
Replay Host / Player
IBKR order service
open market
```

The Lab never becomes a producer and never places orders.

This explicitly supports research when the market is closed.

## Read-only data sources

The process may enumerate only product-owned inputs:

```text
data/market-flow-us.duckdb
data/archive/market-flow-us-*.duckdb
```

The browser never supplies an arbitrary filesystem path.

A selected source is evidence only. The Lab MUST NOT migrate, repair, bootstrap, rename, move, delete or write to it. It must not write saved queries, backtest results, Demo Buy facts or market rows into the source.

Locked/in-use/incompatible/corrupt data fails visibly. The Lab never kills/stops another process to gain access.

Valid schema-v3/v4 market sources may be read when the market tables required by this contract are structurally valid. Unsupported Query objects fail clearly rather than weakening isolation.

The existing normal database opener is not the Lab opener because it bootstraps/migrates and recovers stale sessions. Backtest requires a dedicated read-only open/validation path.

## Query source and run immutability

The Lab may offer:

- current saved Scanner queries;
- current built-in Scanner queries;
- an editable SQL draft.

The exact SQL for every Query is frozen for one run.

Saved-query CRUD remains owned by normal Scanner; Backtest does not create a second query library.

For Compare/Sweep-Compare, every Query uses the same selected source, requested historical point(s), Top-X policy and horizon set so differences are attributable to Query behavior rather than different test settings.

Initial Compare supports two Queries by default and may support a third Query through an advanced control. More is intentionally out of scope until real use proves it is necessary.

## Historical time and baseline

The requested timestamp is the simulated decision/buy time.

For requested time `T`:

```text
baseline = last successful complete committed cycle with committed_at_ms <= T
B = baseline.cycle_id
T0 = T
```

If no cycle was committed at-or-before `T`, the point is unavailable.

The UI exposes requested time, resolved cycle and enough resolved timing metadata to explain the match.

After resolution, `B` is the anti-lookahead market-authority watermark. `T0` remains the simulated decision time used for outcome horizons.

For Compare, all Queries at that point use the exact same `B` and `T0`.

## Anti-lookahead SQL surface

Initial Backtest SQL exposes only:

```text
latest
history
```

For baseline cycle `B`:

```text
latest  = source history rows with cycle_id = B
history = source history rows with cycle_id <= B
```

The user's SQL executes unchanged against those names. Backtest does not rewrite SQL text to inject historical predicates.

The execution boundary MUST prevent bypassing those views to reach the underlying source catalog, future `history`, later cycles, `cycles`, `sessions`, `universe`, Demo Buy tables or other non-exposed objects.

A Scanner query that references objects outside the Backtest historical surface is unsupported in the initial version and fails clearly.

Existing Scanner safety remains the base contract:

```text
one SELECT
zero parameters
side-effecting functions forbidden
query/query_table forbidden
hardened DuckDB configuration
```

Backtest adds the narrower object boundary; it does not weaken Scanner admission.

## Returned rows / Top X

Result order is exactly the order returned by the Query.

`Top X` means the first X returned rows. Position is neutral 1-based returned position unless the SQL itself defines meaningful ranking semantics.

Outcome evaluation requires exactly one recognized canonical identity column:

```text
securityId
or
security_id
```

Invalid/missing identities are not silently repaired.

For comparison, the same security may occur at a different returned position in each Query; the UI preserves and shows that difference.

## Baseline and future outcomes

For returned security `S` at baseline cycle `B`, baseline market facts come from:

```text
history(cycle_id = B, security_id = S)
```

No browser-supplied buy price is authoritative.

Default horizons are:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

The existing optional longer horizons may also be offered:

```text
3m, 5m, 10m
```

For horizon `H`, future evidence is the first row satisfying:

```text
same security_id
AND cycle_id > B
AND collected_at_ms >= T0 + H
ORDER BY collected_at_ms ASC, cycle_id ASC
LIMIT 1
```

Percentage when prices are usable:

```text
((futurePrice / baselinePrice) - 1) * 100
```

Reuse the existing Demo Buy outcome shaping/calculation where semantics are identical; do not create two drifting percentage/unavailable implementations.

Missing baseline row is an integrity error. Missing/zero baseline price, missing future observation and missing future price remain explicit unavailable states rather than zero.

## Inspect result

Inspect shows a deliberately small summary, then the evidence that matters: the actual securities.

Small summary may include:

```text
returned/evaluated count
average at selected/default horizon
median at selected/default horizon
positive count/rate
```

The full table shows at least:

```text
returned position
Symbol/display identity when available
securityId
baseline Price
one cell per selected horizon: percentage + future Price/unavailable state
```

## Compare result

Compare uses the same per-Query evidence as Inspect, then adds comparison-only presentation.

Summary may include per Query:

```text
returned/evaluated count
average/median per representative horizon
positive count/rate
best/worst descriptive observation
```

Cross-Query summary may include:

```text
overlap count/rate
only-in-A / only-in-B / only-in-C counts
returned-position changes for common securities
```

The primary evidence view is `Side by Side`.

For every Query it displays the complete selected rows with:

```text
returned position
security identity
baseline Price
10s..selected horizons percentage
future Price/unavailable details on demand
```

Common securities are visibly linkable across Query columns. Query-exclusive securities and meaningful returned-position changes are visually distinguishable.

A difference-only view is presentation only; it does not discard the full result.

## Sweep time semantics

Sweep generates requested timestamps deterministically:

```text
from, from+interval, from+2*interval, ... <= to
```

The interval is any positive integer X seconds or minutes within product bounds.

Each requested timestamp is a real backtest point and keeps its own `T0`.

Two requested times may legitimately resolve to the same baseline cycle when requested cadence is faster than recorded market updates. Those points are **not automatically deduplicated**, because their simulated decision times differ and therefore their future horizon targets differ.

The UI shows the resolved cycle so repeated-baseline points are visible rather than hidden.

Sweep never synthesizes/interpolates market cycles.

## Sweep result

Sweep is layered and drillable, not a giant dashboard.

### Layer 1 — run overview

For one Query: small aggregate orientation for the whole Sweep.

For Compare: one compact aggregate row/card per Query plus cross-Query overlap/delta orientation.

This layer does not choose a winner automatically.

### Layer 2 — timeline

A paged/virtualized table contains one row per requested point.

For one Query, each row exposes the compact selected summary.

For Compare, each row exposes compact A/B(/C) values and overlap/delta so the user can spot interesting moments without rendering all securities immediately.

### Layer 3 — Open point

Opening one point produces the same detailed view as a normal historical run:

```text
one Query  → Inspect evidence
2–3 Queries → Compare Summary + full Side by Side
```

The user can therefore move from thousands of requested times to one exact decision point without losing traceability.

## Persistence

Initial Backtest run state/results are ephemeral.

Do not add a results database, experiment warehouse, cross-day strategy store or background materialization for the first version. Saved experiments require separate later planning if real use proves they are needed.

The UI may keep the current in-memory run while navigating between Summary, Side-by-Side and Sweep drill-down.

## Performance

Second-level Sweep and Compare must be practical, but performance is solved from measurement rather than a speculative temporal subsystem.

```text
static SQL preflight
→ tiny deterministic fixture
→ Inspect measurement
→ Compare measurement
→ bounded second-level Sweep measurement
→ bounded Sweep-Compare measurement
→ eliminate measurable repeated work
→ only then consider index/precompute if evidence requires it
```

Implementation should share/set-wise work where safe, especially when:

- multiple Queries use the same baseline point;
- many requested points resolve near the same cycles;
- the same selected security/horizon evidence is needed by multiple views.

It must not default to an avoidable browser-driven `points × queries × securities × horizons` request loop.

Ordinary Fast/Browser verification must not inherit a giant Backtest workload.

## Material alternatives and selected decisions

### One Query only vs Compare-first

A one-Query-only Lab is simpler technically but fails the central user outcome: efficiently deciding how strategy Queries differ. Therefore Compare is first-class rather than deferred.

### Aggregate-only comparison vs full evidence

Aggregate-only is compact but can hide that one Query merely replaced a few losing securities or reordered common securities. Therefore Summary is retained only as orientation; full Side-by-Side evidence is mandatory.

### Separate engines per mode vs one historical authority

Separate Inspect/Compare/Sweep engines would drift. All modes therefore reuse one historical resolution, one anti-lookahead execution boundary and one outcome evaluator.

### Rewrite arbitrary Scanner SQL vs historical execution context

Automatic SQL predicate injection is rejected because Scanner SQL may use CTEs, windows, joins and more complex history logic. The selected tactic is to execute unchanged SQL against a restricted historical `latest/history` context.

### Replay as Backtest engine vs independent read-only Lab

Replay answers whether the live product behaves correctly when fed historical snapshots over time. Backtest answers what a Query would have selected at historical decision points and what happened afterward. The Lab therefore remains a separate read-only analytical boundary and does not add virtual-clock/seek semantics to the normal service.

## Non-goals

Initial Backtest Lab does not include:

```text
automatic winner/strategy recommendation
strategy Score
parameter optimizer
portfolio/capital/position simulation
fees/slippage/fill simulation
orders / IBKR
provider acquisition
Replay playback
server virtual clock
cross-day warehouse
saved result database
background outcome jobs
new temporal-feature engine
SQL text rewriting for time predicates
more than three simultaneous comparison Queries
```

## Deterministic acceptance

### Source isolation

Prove controlled source enumeration, no arbitrary browser path, no source mutation/migration, safe locked/corrupt/incompatible behavior and no interference with live/Replay/order ownership.

### Anti-lookahead

Use future canaries to prove historical Query execution can reach only bounded historical `latest`/`history`, including attempts using catalog/schema qualification or other supported SQL paths. Prove baseline is the last committed cycle at-or-before `T`, never a later cycle.

### Query fidelity

Prove representative built-in/saved `latest`/`history` SQL executes unchanged with existing Scanner safety and exact returned order. Unsupported table references fail explicitly.

### Outcome fidelity

Prove `T0 = requested time`, exact baseline linkage, post-baseline cycle requirement, first-at/after horizon matching, deterministic tie-break, percentage math and all unavailable cases. Focused equivalence proof prevents drift from reused Demo Buy outcome semantics.

### Inspect

Prove one Query at one point exposes summary plus every selected security/horizon result and exact SQL/timing provenance on demand.

### Compare

Prove two Queries and optional Query C execute against the exact same `B/T0`, preserve each returned order independently, produce correct per-Query outcomes, correct overlap/exclusive/position-change presentation and complete Side-by-Side drillable evidence without aggregate-only loss.

### Sweep

Prove seconds/minutes cadence, inclusive deterministic timestamp generation, unavailable early points, multiple requested times legitimately sharing one baseline cycle while retaining different `T0`, stable ordering/paging and `Open` drill-down.

### Sweep Compare

Prove the same Query set/config is frozen across the run, compact timeline summaries map exactly to their underlying point results, and opening any point reproduces the full Compare evidence for that timestamp.

### Offline UX

From a fresh Windows operator path, prove Lab startup with no provider/Collector/Replay/order dependency, controlled day/query selection, Inspect, Compare, Sweep and beginner guidance.

### Performance

Measure bounded representative Inspect, Compare, second-level Sweep and second-level Sweep-Compare. Remove avoidable repeated work before adding new index/precompute. Keep ordinary verification bounded.

## Completion

Backtest Lab is complete when a user can start the isolated offline Lab, choose active/archive historical evidence, run one existing/editable Scanner Query or compare two/three Queries at one historical time, see exactly which securities each Query selected and how every selected security moved afterward, Sweep the same test every X seconds/minutes over a range, and open any Sweep point into the same complete Inspect/Compare evidence—while knowing the Query could not see future market facts and without source DB mutation, provider/Replay/order dependencies, a Strategy Engine, optimizer or results warehouse.