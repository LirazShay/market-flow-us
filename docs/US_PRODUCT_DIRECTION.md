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

The current migration scope is market acquisition, durable history, analysis and SQL scanning. Automated order execution through IBKR is a possible later project and is not part of this conversion.

## Strategy boundary

The earlier `trading-us` documents over-specialized the product around one fixed multi-horizon Survivor Filter.

That is no longer the product architecture.

Market Flow US keeps the same general analysis model as MarketScope:

- collect the broad U.S. universe;
- preserve every successful complete snapshot in history;
- expose Current and per-security History;
- allow arbitrary safe read-only SQL through Scanner;
- keep built-in and saved queries easy to change.

The staged candidate idea belongs in SQL.

A query may, for example:

```text
compare current Price with the nearest prior sample around 10s
→ if passed, compare 20s
→ then 30s
→ 45s
→ ...
→ compute highest contiguous stage reached
→ sort candidates by stage reached
```

This is a Scanner query, not a special engine.

## No new temporal mechanism

The U.S. conversion does **not** add:

- predecessor-ID columns;
- dynamic schema;
- horizon configuration;
- materialized percentage columns;
- a dedicated Strategy Engine.

The existing `history` table remains the historical source. Scanner SQL performs the required temporal lookup.

If representative U.S. workload evidence later proves that this query is materially too slow, optimize only that measured bottleneck in a focused replan. Do not pre-optimize the architecture.

## Data principles

- Preserve the complete raw provider row.
- Promote useful observed fields to real typed columns.
- Preserve `missing != null != 0 != ""`.
- Every successful full-market response is one coherent cycle/snapshot authority boundary.
- Failed/incomplete responses never advance Current authority.
- Keep the imported MarketScope `history` + full-row `latest` mechanism unless evidence requires otherwise.
- History is retained unless an explicit future retention policy is approved.
- Provider semantics that are not independently proven remain source-named rather than being renamed into stronger claims.

## U.S. provider direction

Current proven source evidence comes from Bank Leumi's authenticated U.S. screener endpoint:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

On 2026-10-04 a request with `pageCount=5000` returned the complete observed result set of 4015 rows.

`4015` is evidence, not a constant.

Unlike the Israeli MapHeat2 + GetSecuritiesData path, the observed U.S. screener response currently contains identity/metadata and quote-like market fields together. One validated complete screener response therefore becomes one logical Market Flow US cycle.

## Explicit non-goals for this migration

- IBKR order placement.
- Automated buying/selling.
- Portfolio/risk engine.
- Hard-coded Survivor Filter engine.
- Dedicated ranking/strategy runtime.
- Dynamic horizon schema.
- TradingView dependency.
- Replacing DuckDB/Node/WebSocket without evidence.
- Rewriting the proven MarketScope infrastructure from scratch.

## Governing rule

```text
preserve proven MarketScope behavior
→ change only what U.S. evidence requires
→ prove the replacement
→ remove the old Israeli path only after the U.S. path is green
```
