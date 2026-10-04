# Market Flow US Source Extraction

## 1. Purpose

This document prevents migration work from depending on chat history or repeatedly rereading donor repositories.

Market Flow US is the product source of truth.

## 2. Source roles

### Product truth

```text
LirazShay/market-flow-us
```

### Exact implementation/test donor

```text
LirazShay/market-scope
commit d8bc770d292d328d7e89febb8ef4f450abe9458e
tree   c49cc5f691e6d27ad120e0a5395e6b190f1b5952
```

The imported baseline tree matched byte-for-byte.

### U.S. provider research donor

```text
LirazShay/trading-us
commit 51fa85a951728c117f1e345760971aef5fa3cec4
```

Use it as evidence for ScreenerHulPaging3 only where the evidence has been extracted into Market Flow US docs.

### Historical design donor

```text
LirazShay/market-flow
```

Reference/history only. Earlier temporal-precompute ideas are not active Market Flow US requirements.

### Planning framework

```text
LirazShay/st-planner
```

Framework reference only.

## 3. MarketScope behavior carried forward

The following imported capabilities are intentionally preserved:

**KEEP**

- Node 24 / native ESM project shape;
- loopback WebSocket transport;
- producer/session ownership;
- heartbeat/interruption/restart semantics;
- native DuckDB lifecycle/hardening;
- serialized writer;
- complete-cycle transaction and rollback;
- append-only history;
- full-row latest;
- trusted Current/status/security/history reads;
- 500-row history paging;
- browser Current/Detail/Scanner shell;
- refresh/state preservation;
- read-only Scanner admission;
- saved-query CRUD and browser draft/active separation;
- diagnostics/Support Snapshot;
- one-command demo/reset concept;
- Fast/Browser/Workload/live-verification layers.

These are no longer open architecture questions.

## 4. U.S. evidence extracted from trading-us

Proven/observed on 2026-10-04:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

With the extracted U.S. screener filters and `pageCount=5000`:

```text
recordCount = 4015
records.length = 4015
```

Observed payload path:

```text
data.ScreenerHulPaging
```

Observed identity:

```text
PaperId
Symbol
ExchangeName
PaperNameEng
PaperNameHeb
```

Observed market-like fields include:

```text
Price
ChangePercent
DailyHigh
DailyLow
YearHigh
YearLow
DailyVolume
BeginYearChangePercent
Month12ChangePercent
Month36ChangePercent
TradeDateTime
AskRate
BidRate
YesterdayRate
PaperMarketCap
```

Exact response/query contract is now owned by DATA_CONTRACT.

## 5. Superseded trading-us strategy direction

The earlier trading-us documents described a fixed Survivor Filter / fixed multi-horizon pipeline as the main product direction.

That direction is superseded for Market Flow US.

Current rule:

```text
MarketScope-style general product
+
Scanner SQL for strategy
```

A staged-candidate query is useful and ships as an editable example, but it does not own architecture.

## 6. U.S. unknowns intentionally retained

The migration does not claim proof for:

- permanent endpoint/page-size guarantees;
- safe sustained polling cadence;
- exact real-time SLA;
- consolidated-market coverage;
- pre/after-hours semantics;
- `Price` = consolidated LAST;
- `DailyVolume` units;
- `PaperMarketCap` units;
- `TradeDateTime` timezone/session semantics.

Those remain explicit evidence gaps.

## 7. File-audit result

The exhaustive migration audit classified all 124 branch files:

```text
KEEP              26
ADAPT             78
REPLACE            8
PLANNING_REPLACE  12
TOTAL             124
```

Canonical audit files:

- `docs/US_MIGRATION_AUDIT.md`
- `docs/US_MIGRATION_FILE_MAP.md`

## 8. Replacement hotspots

True provider-specific replacement is concentrated in:

```text
browser/provider/universe.js
browser/provider/securities.js
browser/collector/cycle.js
tests/fake-market/server.mjs
provider/cycle/fake tests
representative workload
```

The rest is mostly field/schema/branding/test adaptation around proven mechanisms.

## 9. Migration philosophy

```text
baseline green
→ adapt one boundary
→ prove it
→ preserve unaffected tests
→ remove Israel-only behavior only after U.S. replacement is green
```

Do not recreate the product from scratch.

## 10. No-normal-work dependency rule

After the U.S. contracts/TREE freeze, executor chats should not need donor repositories for ordinary work.

If a later contradiction requires donor evidence, extract the resolved fact back into Market Flow US durable docs before continuing.
