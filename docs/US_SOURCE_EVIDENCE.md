# U.S. Source Evidence and Donor Map

## Source roles

- `LirazShay/market-flow-us` — product source of truth.
- `LirazShay/market-scope@d8bc770d292d328d7e89febb8ef4f450abe9458e` — exact proven product/code/test donor.
- `LirazShay/trading-us@51fa85a951728c117f1e345760971aef5fa3cec4` — U.S. provider discovery/research donor.
- `LirazShay/market-flow@575da927362b97604213d6aca0aa3cfd13896117` — historical design evidence only, including earlier temporal-link design.
- `LirazShay/st-planner` — planning framework reference.

Normal implementation must not require rereading donor repos once the relevant contract has been extracted here.

## Proven MarketScope donor capabilities

The imported baseline already contains and tests:

- browser runtime/bookmarklet packaging;
- loopback WebSocket transport;
- single-producer ownership/session lifecycle;
- native DuckDB lifecycle and serialized writer;
- atomic successful/failed cycle persistence;
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
- timestamp timezone/market-session semantics of `TradeDateTime`.

These belong to bounded live verification or targeted evidence work.

## KEEP / ADAPT / DROP map

| MarketScope area | Disposition | U.S. migration |
|---|---|---|
| Node 24/npm/package baseline | KEEP | unchanged unless dependency evidence requires |
| loopback WebSocket | KEEP | same transport |
| producer/session ownership | KEEP | same lifecycle |
| DuckDB + serialized writer | KEEP | same authority |
| transaction/rollback discipline | KEEP | extend for U.S. snapshot + temporal links |
| raw JSON preservation | KEEP | raw U.S. screener row |
| Current trusted reads | ADAPT | U.S. typed fields |
| Security/History reads | ADAPT | stable snapshot_id + U.S. fields |
| Viewer shell/navigation/state | KEEP/ADAPT | retain behavior; replace columns/labels |
| Scanner admission/execution | KEEP | public schema changes |
| saved queries | KEEP/ADAPT | new examples/schema guide |
| diagnostics/support snapshot | KEEP/ADAPT | U.S. provider checkpoints/counts |
| Fake Market | ADAPT | emulate ScreenerHulPaging3 |
| workload harness | ADAPT | ~4k U.S. universe + temporal links |
| live verification harness | ADAPT | U.S. endpoint and semantics |
| MapHeat2 provider | DROP after cutover | Israeli-only |
| GetSecuritiesData provider | DROP after cutover | Israeli-only |
| Israel quote typed fields | DROP after schema cutover | replaced by U.S. projections |
| duplicate full `latest` fact | ADAPT | pointer to authoritative history |
| browser/Node/UI infrastructure | KEEP | no rewrite |
| trading/order execution | DROP from current scope | future project |

## Temporal-link evidence reused from market-flow

The earlier Browser-SQL design established a useful performance conclusion that was not carried into final MarketScope: repeated core historical comparisons are cheaper and more consistent when each snapshot resolves predecessor IDs once at ingest rather than performing temporal search repeatedly in every analytical query.

Market Flow US restores that conclusion in a configurable form:

- horizons are whole seconds;
- physical real columns hold predecessor snapshot IDs;
- no metric-value duplication;
- resolution is set-based and transactional;
- schema evolution/backfill makes the horizon set changeable.
