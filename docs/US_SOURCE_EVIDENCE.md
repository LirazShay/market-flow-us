# U.S. Source Evidence and Donor Map

## Source roles

- `LirazShay/market-flow-us` — product source of truth.
- `LirazShay/market-scope@d8bc770d292d328d7e89febb8ef4f450abe9458e` — exact proven product/code/test donor.
- `LirazShay/trading-us@51fa85a951728c117f1e345760971aef5fa3cec4` — U.S. provider discovery/research donor.
- `LirazShay/market-flow` — historical evidence only.
- `LirazShay/st-planner` — planning framework reference.

Normal implementation must not require rereading donor repos once the relevant fact is extracted here.

## Proven MarketScope donor capabilities

The imported baseline already contains and tests:

- browser runtime/bookmarklet packaging;
- loopback WebSocket transport;
- single-producer ownership/session lifecycle;
- native DuckDB lifecycle and serialized writer;
- atomic successful/failed cycle persistence;
- append-only `history` plus full-row `latest`;
- raw provider JSON preservation;
- Current trusted reads;
- Security/History trusted reads with pagination;
- Current/Detail/History browser UI;
- Dynamic read-only SQL Scanner;
- saved-query CRUD and built-in queries;
- diagnosability/support snapshot;
- deterministic Fake Market;
- one-command demo/reset;
- Windows helpers;
- Fast CI, Browser CI and workload harness;
- bounded real-provider verification harness.

These are migration assets, not requirements to rewrite.

## Proven U.S. provider facts from trading-us

Observed/proven on 2026-10-04:

```text
GET /lti/lti-app/api/Market/ScreenerHulPaging3
```

A browser-side authenticated request with:

```text
page=1
pageCount=5000
Country=2
paperType=1
rt=true
```

returned:

```text
recordCount = 4015
records.length = 4015
```

The count is dynamic and must never be hard-coded.

Observed row fields include:

```text
PaperId
PaperNameEng
PaperNameHeb
Symbol
ExchangeName
PaperMarketCap
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
PaperIdYatab
CountryId
CountryName
CountryNameEng
PaperType
ESGRatingId
ESGScope
```

Observed envelope metadata includes:

```text
recordCount
maxDateChange
resultCode
rsCount
rtIsr
rtUsa
logtm
reqtm
responsetm
serverId
version
```

## Facts that remain unproven

Do not silently promote these into contracts:

- safe continuous polling cadence;
- throttling/rate-limit behavior;
- long-running authenticated session behavior;
- exact semantics/SLA of `rt=true`;
- whether every field is refreshed atomically;
- active-market-hours behavior;
- pre-market/after-hours behavior;
- maximum permanent `pageCount`;
- exact definition of the returned U.S. universe;
- exact semantics/units of `DailyVolume` and `PaperMarketCap`;
- whether `Price` is contractually equivalent to a consolidated LAST;
- timestamp timezone/session semantics of `TradeDateTime`.

These belong to bounded live verification or targeted evidence work.

## KEEP / ADAPT / DROP map

| MarketScope area | Disposition | U.S. migration |
|---|---|---|
| Node 24/npm/package baseline | KEEP | unchanged initially |
| loopback WebSocket | KEEP | same transport |
| producer/session ownership | KEEP | same lifecycle |
| DuckDB + serialized writer | KEEP | same authority |
| transaction/rollback discipline | KEEP | same atomicity |
| history + full-row latest | KEEP | same mechanism |
| raw JSON preservation | KEEP | raw U.S. screener row |
| Current trusted reads | ADAPT | U.S. typed fields |
| Security/History reads | ADAPT | U.S. typed fields |
| Viewer shell/navigation/state | KEEP/ADAPT | retain behavior; replace labels/columns |
| Scanner admission/execution | KEEP | same read-only engine |
| saved queries | KEEP/ADAPT | U.S. examples/schema guide |
| staged candidate selection | NEW SQL ONLY | built-in/editable Scanner query |
| diagnostics/support snapshot | KEEP/ADAPT | U.S. provider checkpoints/counts |
| Fake Market | ADAPT | emulate ScreenerHulPaging3 |
| workload harness | ADAPT | U.S.-scale rows + staged SQL |
| live verification harness | ADAPT | U.S. endpoint and semantics |
| MapHeat2 provider | DROP after cutover | Israeli-only |
| GetSecuritiesData provider | DROP after cutover | Israeli-only |
| Israel quote typed fields | DROP after schema cutover | replaced by U.S. projections |
| temporal predecessor-link design | DROP | not needed unless workload proves bottleneck |
| browser/Node/UI infrastructure | KEEP | no rewrite |
| trading/order execution | DROP from current scope | future project |
