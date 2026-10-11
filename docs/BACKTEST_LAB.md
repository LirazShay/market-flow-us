# Market Flow US — Backtest Lab Contract

## Purpose

Backtest Lab is a deliberately small offline research surface for answering one question reliably:

> If this exact Scanner SQL had been run at a selected historical point, which securities would it have returned, and what happened to those returned securities afterward?

The initial product optimizes for clarity and repeatable investigation, not for building a general-purpose quant/backtesting platform.

## User workflow

Backtest Lab runs one Query at a time.

Two modes exist:

```text
Single point
→ choose data day
→ choose historical time
→ choose one saved/built-in/edited Query
→ choose Top X / All
→ choose outcome horizons
→ Run
→ summary + full security rows

Sweep
→ choose data day
→ choose from/to
→ choose every X seconds or minutes
→ choose one saved/built-in/edited Query
→ choose Top X / All
→ choose outcome horizons
→ Run
→ compact baseline table
→ open any baseline
→ same full security result as Single point
```

No multi-query comparison engine, score, heatmap, optimizer, portfolio simulator or automated strategy selection is part of the initial scope.

## Independent offline boundary

Backtest Lab is a separate opt-in local launcher/process.

It MUST NOT require:

```text
provider page
provider authentication
bookmarklet
browser Collector / Recorder
live producer
Replay Host / Player
IBKR order service
market being open
```

The intended operator path is approximately:

```text
START_BACKTEST_LAB.cmd
→ loopback Backtest Lab process
→ local Backtest Lab page
→ existing Market Flow US active/archive DuckDB as read-only input
```

Backtest Lab never becomes a producer and never places orders.

## Read-only data-source authority

Allowed market inputs are product-owned database files only:

```text
data/market-flow-us.duckdb
data/archive/market-flow-us-*.duckdb
```

The browser never supplies an arbitrary filesystem path. The local process enumerates and validates available sources, gives the browser bounded source IDs/metadata, and opens the selected source read-only.

A selected source is evidence only. Backtest Lab MUST NOT:

```text
migrate it
repair it
bootstrap missing schema
write Scanner queries into it
write backtest results into it
change Demo Buy facts
change latest/history/universe/cycles/sessions
rename/move/delete it
```

Locked/in-use/incompatible/corrupt data fails visibly. The Lab never stops another process or forces access to a file owned by another running process.

Valid historical market sources may be schema v3 or v4 when the market tables needed by the Backtest contract are structurally valid. A Query that depends on a table not exposed by the Backtest historical surface fails clearly rather than weakening isolation.

## Query source

Backtest Lab may offer:

- current saved Scanner queries;
- current built-in Scanner queries;
- an editable SQL draft for the run.

The exact SQL selected at Run time is frozen for that run.

Backtest does not create a second saved-query authority. Saved-query CRUD remains owned by the normal Scanner product.

## Historical baseline resolution

The user selects human time. Market authority is resolved to one committed market cycle.

For requested historical time `T`:

```text
baseline = latest successful complete cycle whose committed_at_ms <= T
baselineCycleId = baseline.cycle_id
```

If no committed cycle exists at-or-before `T`, that requested point is unavailable.

The UI exposes at least:

```text
requested time
resolved cycle_id
resolved commit/collection timing needed to explain the match
```

A wall-clock timestamp selects the candidate point; once resolved, cycle ordering is the authority boundary.

## Anti-lookahead historical SQL surface

Initial Backtest SQL intentionally exposes only the market surfaces required for Scanner strategy research:

```text
latest
history
```

For one resolved baseline cycle `B`:

```text
latest  = source history rows belonging to cycle B
history = source history rows with cycle_id <= B
```

User SQL executes unchanged against those historical names. Backtest does not text-rewrite the user's SQL to inject time predicates.

The Query execution boundary MUST prevent bypassing these names to read the underlying source catalog, future cycles, future history, `cycles`, `sessions`, current/future `universe`, Demo Buy evidence or other non-exposed source objects.

A saved Scanner query that references objects outside the Backtest historical surface is unsupported in the initial scope and fails with a clear error. This is preferable to silently exposing future facts.

Existing Scanner safety remains the baseline:

```text
one SELECT
zero parameters
side-effecting functions forbidden
query/query_table forbidden
hardened DuckDB settings
```

Backtest adds the narrower historical-object boundary; it does not weaken Scanner admission.

## Returned-position semantics

A Backtest result preserves the exact row order returned by the SQL.

```text
position = original 1-based returned position
```

`Top X` means the first X returned rows. It does not claim that a row is financially better unless the Query itself defines meaningful deterministic ordering.

To evaluate a security, the result must expose exactly one recognized canonical identity column:

```text
securityId
or
security_id
```

Rows without a usable canonical identity are not silently repaired.

## Historical baseline price

For a returned canonical security at baseline cycle `B`, baseline market facts come from:

```text
history(cycle_id = B, security_id)
```

No browser-supplied buy price is authoritative.

A missing baseline row for a supposedly evaluable returned identity is an integrity/error condition, not a guessed price.

## Outcome horizons

Default beginner horizons are:

```text
10s, 20s, 30s, 45s, 60s, 90s, 120s
```

Optional existing longer horizons may remain available:

```text
3m, 5m, 10m
```

Backtest reuses one shared outcome-calculation contract with Demo Buy wherever the semantics are identical.

For baseline cycle `B`, baseline time `T0` and horizon `H`, future evidence must be post-baseline:

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

Existing explicit unavailable semantics for missing/zero baseline price, missing future observation and missing future price are preserved rather than converted to zero.

The implementation must define one exact `T0` that corresponds to what the live Query could have known at the resolved baseline; this must be shared by Single and Sweep and regression-proven before implementation closure.

## Single-point result

Single point is the simplest full-fidelity view.

It shows a small summary, then the actual returned/evaluated rows.

Required summary is intentionally small, for example:

```text
returned/evaluated count
average at selected/default horizon
median at selected/default horizon
positive count/rate
```

The full row table shows at least:

```text
returned position
Symbol/display identity when available
canonical securityId
baseline Price
one cell per selected horizon with percentage and future Price/unavailable state
```

The detailed rows are primary evidence. Aggregate summary never replaces them.

## Sweep semantics

Sweep repeats the same one-Query Single-point operation over a requested range.

The user may choose every positive integer X seconds or minutes.

Requested timestamps are resolved independently to authoritative baseline cycles, then deduplicated by `baselineCycleId` before statistical aggregation and presentation.

Therefore:

```text
many requested timestamps → same baseline cycle
= one evaluated baseline in the Sweep result
```

This prevents artificial weighting when requested cadence is faster than recorded market cycles.

Sweep does not synthesize missing cycles and does not interpolate market data.

## Sweep result

Sweep remains table-first and drillable rather than becoming a dashboard.

Top level shows a compact summary plus one row per unique resolved baseline, paged/virtualized when needed.

Each baseline row includes enough information to decide whether it is interesting, for example:

```text
requested/resolved time
baseline cycle
returned/evaluated count
average at selected representative horizons
positive count/rate at the selected summary horizon
```

Simple filters may help inspect large runs, e.g. positive/negative or threshold filtering, but they are presentation only and do not alter the run.

Every baseline row has `Open`.

`Open` displays the same full per-security table as Single point for that exact baseline, including every selected horizon. This drill-down is required; a Sweep aggregate with no path back to the securities is insufficient evidence.

## Persistence

Initial Backtest runs/results are ephemeral UI/process state.

Do not add a results database, experiment warehouse, cross-day strategy store or background materialization merely to ship the initial Lab.

If later usage proves saved experiments necessary, plan that separately.

## Performance discipline

The Lab must remain practical for second-level Sweep without solving this by precomputing a new temporal subsystem.

Implementation order is:

```text
static SQL preflight
→ tiny deterministic fixture
→ one Single-point measurement
→ bounded Sweep measurement
→ remove repeated scans/work where measurable
→ add index/precompute/materialization only if evidence proves necessary
```

Sweep should batch/set-wise work where practical. It must not naively execute an N-baselines × X-securities × H-horizons browser/SQL loop when a bounded set-wise operation can produce the same result.

Requested-cadence faster than available market cycles is deduplicated before expensive evaluation.

## UX / beginner guidance

The default screen is intentionally three steps:

```text
1. choose time/range
2. choose one Query + Top X/All
3. choose horizons and Run
```

Defaults favor:

```text
Single point
Top 10
10s..120s horizons
```

Sweep is a second mode, not a separate complex product.

The UI explains in plain language:

- what historical time means;
- that the Query cannot see the future;
- what Top X means;
- why requested Sweep timestamps can collapse to fewer unique cycles;
- what Pending/Unavailable means;
- that the summary is descriptive evidence and the rows/drill-down are the underlying facts.

Advanced detail such as exact SQL and resolved cycle metadata is available without blocking the beginner path.

## Isolation / non-goals

Initial Backtest Lab does not include:

```text
multi-query Compare
automatic winner/strategy recommendation
strategy Score
parameter optimizer
portfolio/capital/position simulation
fees/slippage/fill simulation
order submission
IBKR integration
provider acquisition
Replay playback
market virtual clock
cross-day warehouse
saved experiment/result database
background outcome jobs
new temporal-feature engine
query text rewriting for historical predicates
```

## Deterministic acceptance

### Source isolation

Prove active/archive catalog is bounded to product-owned paths, arbitrary browser paths are impossible, selected files are opened without mutation, incompatible/locked/corrupt sources fail safely and normal live/replay/order data/process ownership is untouched.

### Anti-lookahead

Use canary future facts to prove a historical Query can read only historical `latest`/`history` and cannot reach underlying/future source objects through qualification, schema/catalog tricks, functions or another supported SQL path.

Prove baseline resolution chooses the last visible committed cycle at-or-before the requested time and never a later cycle.

### Query fidelity

Prove representative existing built-in/saved SQL over `latest`/`history` executes unchanged with the same Scanner SELECT/function safety and exact returned order.

Unsupported table references fail clearly rather than being rewritten or exposed.

### Outcome fidelity

Prove baseline/future tie-breaks, price percentage, null/zero/unavailable cases and identical Single/Sweep evaluation semantics. Where Demo Buy semantics are reused, focused equivalence proof prevents drift between the two evaluators.

### Sweep

Prove seconds and minutes cadence, range boundaries, no-baseline points, many requested times collapsing to one cycle, deterministic cycle dedupe/order and drill-down from each displayed baseline to the exact full returned-security/horizon evidence.

### Offline UX

From a fresh Windows operator path, prove the Lab starts with no provider page/Collector/Replay/order sidecar, lists controlled day sources and queries, runs Single and Sweep, and exposes beginner guidance plus exact technical metadata on demand.

### Performance

Measure representative bounded Single and second-level Sweep fixtures. Repeated work must be inspected/removed before introducing indexes/precompute. Ordinary Fast/Browser verification must not inherit a large backtest workload.

## Completion

Backtest Lab is complete when a user can start the isolated offline Lab, select one active/archive market day, run one existing/editable Scanner strategy Query at one historical time or across an every-X-seconds/minutes range, know that the Query cannot see future market facts, inspect the exact securities and post-baseline horizon percentages, and drill from every Sweep baseline into the same full row evidence—without provider/Replay/order dependencies, source DB mutation, a new strategy engine or a results warehouse.