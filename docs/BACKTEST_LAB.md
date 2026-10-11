# Market Flow US — Backtest Lab Contract

## Purpose

Backtest Lab is a deliberately small offline research surface for one question:

> If this exact Scanner SQL had been run at historical time T, which securities would it have returned, and what happened to those securities afterward?

The initial product optimizes for simple trustworthy investigation. It is not a general-purpose quant platform.

## User workflow

Backtest Lab runs **one Query at a time**.

```text
Single
→ choose day + time
→ choose saved/built-in/edited Query
→ choose Top X / All
→ choose horizons
→ Run
→ small summary + full security rows

Sweep
→ choose day + from/to + every X seconds/minutes
→ choose one Query
→ choose Top X / All
→ choose horizons
→ Run
→ one compact row per requested time
→ Open any row
→ same full security rows as Single
```

Initial scope deliberately excludes multi-query Compare, scores, optimizer, portfolio simulation and automatic strategy recommendation.

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

## Query source

The Lab may offer:

- current saved Scanner queries;
- current built-in Scanner queries;
- an editable SQL draft.

The exact SQL is frozen for one run. Saved-query CRUD remains owned by normal Scanner; Backtest does not create a second query library.

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

## Single result

Single shows a deliberately small summary, then the evidence that matters: the actual securities.

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

Summary never replaces the rows.

## Sweep semantics

Sweep generates requested timestamps deterministically:

```text
from, from+interval, from+2*interval, ... <= to
```

The interval is any positive integer X seconds or minutes within product bounds.

Each requested timestamp is a real backtest point and keeps its own `T0`.

Two requested times may legitimately resolve to the same baseline cycle when the requested cadence is faster than recorded market updates. Those points are **not automatically deduplicated**, because their simulated decision times differ and therefore their future horizon targets differ.

The UI shows the resolved cycle so repeated-baseline points are visible rather than hidden.

Sweep never synthesizes/interpolates market cycles.

## Sweep result

Sweep is table-first and drillable, not a dashboard.

Top level shows a small run summary plus one row per requested point, paged/virtualized when needed. Each row includes enough to decide whether to inspect it, for example:

```text
requested time
resolved cycle
returned/evaluated count
average at selected representative horizons
positive count/rate at the selected summary horizon
```

Every row has `Open`.

`Open` shows the exact same full per-security/horizon evidence as Single for that requested timestamp.

Simple presentation filters such as positive/negative/threshold are allowed, but they do not alter the underlying run.

## Persistence

Initial Backtest run state/results are ephemeral.

Do not add a results database, experiment warehouse, cross-day strategy store or background materialization for the first version. Saved experiments require separate later planning if real use proves they are needed.

## Performance

Second-level Sweep must be practical, but performance is solved from measurement rather than a speculative temporal subsystem.

```text
static SQL preflight
→ tiny deterministic fixture
→ Single measurement
→ bounded second-level Sweep measurement
→ eliminate measurable repeated work
→ only then consider index/precompute if evidence requires it
```

Implementation should share/set-wise work where safe, especially when many requested points resolve near the same market cycles. It must not default to an avoidable browser-driven `points × securities × horizons` request loop.

Ordinary Fast/Browser verification must not inherit a giant Backtest workload.

## Beginner UX

Default screen is three steps:

```text
1. choose Single or Sweep + time
2. choose one Query + Top X/All
3. choose horizons + Run
```

Defaults:

```text
Single
Top 10
10s..120s
```

Plain-language help explains historical time, no-lookahead, Top X, repeated baseline cycles in fast Sweep, Pending/Unavailable, and that aggregate numbers are only summaries of drillable rows.

Exact SQL and cycle/timing metadata remain available on demand without cluttering the default path.

## Non-goals

Initial Backtest Lab does not include:

```text
multi-query Compare
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

### Sweep

Prove seconds/minutes cadence, inclusive deterministic timestamp generation, unavailable early points, multiple requested times legitimately sharing one baseline cycle while retaining different `T0`, stable ordering/paging and `Open` drill-down to exact full security/horizon rows.

### Offline UX

From a fresh Windows operator path, prove Lab startup with no provider/Collector/Replay/order dependency, controlled day/query selection, Single, Sweep and beginner guidance.

### Performance

Measure bounded representative Single and second-level Sweep. Remove avoidable repeated work before adding new index/precompute. Keep ordinary verification bounded.

## Completion

Backtest Lab is complete when a user can start the isolated offline Lab, choose one active/archive day and one existing/editable Scanner strategy Query, run it at one historical time or every X seconds/minutes over a range, know the Query could not see future market facts, inspect every selected security's post-time percentages, and open every Sweep point into the same full evidence—without source DB mutation, provider/Replay/order dependencies, a comparison engine, Strategy Engine or results warehouse.