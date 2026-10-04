# Market Flow US — Product Direction

## Current decision

Market Flow US is **not** a new trading-platform architecture.

It is a controlled conversion of the proven MarketScope product to the U.S. equity market while preserving the product model that already worked in Israel:

```text
authenticated provider page
→ browser market acquisition
→ validated complete market snapshot
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB
→ Current
→ Security Detail / History
→ Dynamic SQL Scanner
```

The current project goal is market acquisition, durable history, analysis and SQL scanning. Automated order execution through IBKR is a possible later project and is not part of this migration plan.

## Strategy boundary

The earlier `trading-us` documents described a fixed multi-horizon Survivor Filter as if it were the architecture of the product. That is no longer the product contract.

Market Flow US keeps the same general analysis model as MarketScope:

- collect the broad U.S. universe;
- preserve every successful market snapshot;
- expose Current and per-security History;
- allow arbitrary safe read-only SQL through Scanner;
- keep query definitions/saved queries easy to change.

A staged filter such as:

```text
10s positive
→ 20s positive
→ 30s positive
→ ...
```

is a **Scanner query**, not a special strategy engine and not a hard-coded product pipeline.

The user may create, change or remove such SQL without replacing infrastructure.

## Temporal-history capability

The database will support fast historical comparisons without repeated timestamp searches in every Scanner query.

Configured historical horizons are expressed canonically as **whole seconds**.

Initial requested set:

```text
10, 20, 30, 45, 60, 90, 120
```

The set is configuration, not a permanent code constant.

For every configured horizon `N`, the physical historical row owns one real nullable column:

```text
prev_<N>s_snapshot_id
```

Examples:

```text
prev_10s_snapshot_id
prev_20s_snapshot_id
prev_30s_snapshot_id
prev_45s_snapshot_id
prev_60s_snapshot_id
prev_90s_snapshot_id
prev_120s_snapshot_id
```

Each column stores only the ID of the selected prior snapshot. It does **not** duplicate price, BID, ASK, percentage change or another metric.

The selected predecessor is:

```text
latest snapshot of the same security
where previous.collected_at_ms <= current.collected_at_ms - horizon_seconds*1000
```

If none exists, the link is `NULL`.

Scanner joins the linked snapshot only when a query needs its values.

## Configuration and physical schema

Logical configuration may change over time while the hot analytical path remains wide/physical.

Adding a new horizon means:

```text
validate whole-second horizon
→ add prev_<N>s_snapshot_id column if missing
→ backfill links from existing history
→ activate the horizon
→ populate it for future commits
```

Removing/deactivating a horizon does not immediately drop its physical column. This avoids destructive migrations and permits inexpensive reactivation.

Horizon configuration controls historical link columns only. Derived trading metrics remain SQL expressions unless a later measured bottleneck proves materialization necessary.

## Data principles

- Preserve the complete raw provider row.
- Promote commonly used verified fields to real typed columns.
- Preserve `missing != null != 0 != ""`.
- Every successful market poll is one coherent cycle/snapshot authority boundary.
- Failed/incomplete cycles never become current authority.
- Every historical row receives a stable `snapshot_id`.
- Current/latest state points to authoritative history rather than duplicating the full row.
- History is retained unless an explicit future retention policy is approved.
- Provider semantics that are not yet proven remain source-named rather than being renamed into stronger claims.

## U.S. provider direction

Current proven source evidence comes from Bank Leumi's authenticated U.S. screener endpoint:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

On 2026-10-04 a request with `pageCount=5000` returned the complete observed result set of 4015 rows.

`4015` is evidence, not a constant.

Unlike the Israeli MapHeat2 + GetSecuritiesData path, the observed U.S. screener response currently contains both universe identity/metadata and quote-like market fields in one response. The final U.S. collector therefore treats one validated full screener response as one market snapshot.

## Explicit non-goals for this migration

- IBKR order placement.
- Automated buying/selling.
- Portfolio/risk engine.
- Score/ranking engine.
- Hard-coded Survivor Filter engine.
- TradingView dependency.
- Replacing DuckDB/Node/WebSocket without evidence.
- Rewriting the proven MarketScope infrastructure from scratch.

## Governing rule

When choosing between reuse and replacement:

```text
preserve proven MarketScope behavior
→ change only what U.S. evidence requires
→ prove the replacement
→ remove the old Israeli path only after the U.S. path is green
```
