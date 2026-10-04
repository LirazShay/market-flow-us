# Market Flow US Planning Decisions

These decisions govern the U.S. conversion until explicitly reopened by evidence.

## D-US-001 — Convert MarketScope incrementally; do not rewrite

**Status:** resolved

Market Flow US starts from the exact green MarketScope baseline and preserves proven architecture/behavior wherever the U.S. data contract does not require a change.

Implementation order must favor boundary replacement plus regression proof over greenfield reconstruction.

**Reopen only if:** a proven MarketScope mechanism is incompatible with the U.S. requirement.

## D-US-002 — Bank Leumi ScreenerHulPaging3 is the initial provider source

**Status:** resolved

Use:

```text
/lti/lti-app/api/Market/ScreenerHulPaging3
```

from the authenticated provider browser context with the extracted U.S. screener filters and current `pageCount=5000`.

Do not hard-code the observed `4015` result count.

If the provider returns fewer rows than `recordCount`, fail closed rather than inventing completeness.

**Reopen only if:** current provider evidence shows one-request full retrieval no longer works.

## D-US-003 — Canonical identity remains provider PaperId

**Status:** resolved

```text
securityId = String(PaperId)
```

`Symbol`, row order, names and `PaperIdYatab` are not canonical keys.

This preserves the existing product identity contract and Detail/Scanner navigation.

## D-US-004 — One U.S. response maps to one existing-style complete cycle

**Status:** resolved

Do not redesign the producer protocol/cycle authority.

Represent the one full U.S. response as:

```text
chunkIndex = 0
chunk_count = 1
```

and reuse the existing complete-cycle/ACK/transaction path.

The word `chunk` is retained physically in this migration to minimize risk; the U.S. provider is not claimed to be chunked.

## D-US-005 — Universe membership comes from every validated full response

**Status:** resolved

The response provides both membership and market rows.

Browser compares canonical membership with the accepted universe:

- same membership -> commit under current revision;
- changed membership -> replace universe, receive new revision, then commit that same response.

Row reordering does not create a new universe revision.

## D-US-006 — Keep history/latest mechanism; create incompatible U.S. schema v3

**Status:** resolved

Keep:

- append-only `history`;
- full-row `latest`;
- complete-cycle transaction;
- serialized writer;
- saved-query table.

U.S. market projection becomes schema v3.

Do not semantically convert old MarketScope v1/v2 Israeli DB rows into U.S. rows.

New default DB:

```text
data/market-flow-us.duckdb
```

Opening incompatible v1/v2 through Market Flow US fails without mutating that DB.

## D-US-007 — Typed U.S. projection remains source-shaped

**Status:** resolved

Promote the source fields listed in DATA_CONTRACT, including:

```text
Price
ChangePercent
BidRate
AskRate
DailyVolume
DailyHigh
DailyLow
YearHigh
YearLow
YesterdayRate
PaperMarketCap
TradeDateTime
Symbol
ExchangeName
PaperNameEng
PaperNameHeb
```

plus the other documented percentages/identity metadata.

Always retain `raw_data`.

Do not rename `Price` to LAST or claim units/timezone semantics not yet proven.

## D-US-008 — Current/Detail keep the same UX model with U.S. columns

**Status:** resolved

Current visible fields are the U.S. set documented in PRODUCT_SPEC.

Default sort:

```text
DailyVolume DESC
```

Detail/history keep the existing page/retry/navigation/state contracts with U.S. fields.

Display-name fallback:

```text
first non-empty:
PaperNameEng
→ PaperNameHeb
→ Symbol
→ securityId
```

## D-US-009 — Strategy remains editable Scanner SQL

**Status:** resolved

No Strategy Engine, ranking service or hard-coded survivor pipeline.

Ship an editable built-in staged-candidate query.

Initial example:

```text
10s → 20s → 30s → 45s → 60s → 90s → 120s
predicate: current Price > prior Price
result: highest contiguous stage_reached
sort: stage, ChangePercent, DailyVolume, securityId
```

Changing stages/conditions is a SQL edit, not an application/schema change.

## D-US-010 — No temporal precompute in the initial U.S. conversion

**Status:** resolved

Do not add:

- `prev_*_snapshot_id` columns;
- dynamic horizon schema;
- materialized short-window percentage columns;
- temporal feature engine.

Use direct `history` SQL first.

If representative workload proves staged SQL materially impractical, reopen the smallest performance area with measurement.

## D-US-011 — Representative U.S. workload is 4096 × 180

**Status:** resolved

```text
4096 synthetic securities
180 cycles
737280 history rows
```

This proves approximately-4k scale without hard-coding the observed provider count and avoids an unnecessarily long 4k × 600 first workload.

The workload includes the staged-ranking query.

No invented latency SLO is a correctness gate.

## D-US-012 — Keep 3000 ms as initial offline/demo cadence only

**Status:** resolved

The imported 3000 ms snapshot interval remains the initial deterministic demo/workload logical cadence.

It is not a provider SLA or proof that sustained 3-second live polling is safe.

Live behavior remains evidence-driven and configurable.

## D-US-013 — U.S. branding is complete product branding

**Status:** resolved

Target product/package/artifact naming uses `Market Flow US` / `market-flow-us`.

Target key names include:

```text
package: market-flow-us
DB: data/market-flow-us.duckdb
runtime: market-flow-us.runtime.js
bookmarklet: market-flow-us.bookmarklet.txt
Windows launcher: START_MARKET_FLOW_US.cmd
```

Donor MarketScope names may remain only in provenance/history documents.

## D-US-014 — Preserve Scanner security and saved-query ownership

**Status:** resolved

Keep DuckDB parser/type admission, zero parameters, side-effect rejection, hardened connection, Node-owned saved-query table, immutable built-ins and browser Draft/Persisted/Active separation.

Add the staged candidate built-in without changing these mechanisms.

## D-US-015 — Fake Market changes provider shape, not test architecture

**Status:** resolved

Replace MapHeat2/GetSecuritiesData behavior with stateful ScreenerHulPaging3 responses.

Keep the real loopback HTTP fake, normal runtime, deterministic scenarios and one-command demo.

## D-US-016 — Real-provider gate remains bounded and local

**Status:** resolved

No GitHub credentials/live bank CI.

The final authenticated-browser gate verifies **three consecutive complete U.S. cycles** at the candidate collection cadence through commit, Current, Detail/History, Scanner, ownership and clean stop. This is a bounded repeatability proof, not a long-running load test or provider SLA claim.

Only that gate may declare the external provider boundary PASS.

## D-US-017 — Planning order is audit → contracts → TREE → allocation

**Status:** resolved

Do not allocate implementation chats before:

1. exhaustive file audit;
2. coherent U.S. durable contracts;
3. new S&T tree;
4. necessity/sufficiency/KISS review;
5. Final Planning Review;
6. freeze.

The imported MarketScope execution history is not the U.S. execution plan.
