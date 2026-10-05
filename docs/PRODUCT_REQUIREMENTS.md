# Market Flow US Product Requirements

## Ownership

This document owns what the user needs and why. Technical mechanism belongs in TECHNICAL_SPEC, provider/data truth in DATA_CONTRACT, and verification in TEST_STRATEGY.

## 1. Product problem

Market Flow US is a local, single-user U.S.-market analysis product.

Its core value chain is:

```text
continuous validated U.S. market snapshots
→ trustworthy Current view
→ trustworthy per-security history
→ arbitrary safe analytical SQL
→ short-horizon validation of Scanner selections through Demo Buy
```

The product is a controlled U.S. conversion of the proven MarketScope product. The goal is to preserve the product model that already worked in Israel and change only what the U.S. provider/data contract or an explicitly requested new product capability requires.

Demo Buy exists to test whether a Scanner query is directionally useful before any real order-execution work: when the query selects a security and the user treats that moment as a virtual buy, the product must later show whether observed `Price` rose or fell over short future horizons.

## 2. Primary user outcomes

The user must be able to:

1. start continuous collection from an already-authenticated Bank Leumi browser page;
2. persist every successful complete U.S. market snapshot;
3. see the latest committed row for every security in the current authoritative universe;
4. open a security and inspect paged persisted history;
5. keep historical-only securities inspectable even after they leave Current;
6. run editable recurring SQL over trusted Current/history data;
7. save, rename, update, delete and reuse Scanner queries;
8. use built-in Scanner examples as starting points;
9. rank/filter candidates entirely in SQL without changing application code;
10. create Demo Buy observations manually from selected Scanner result rows;
11. create Demo Buy observations from all Scanner results or the first X ordered results;
12. optionally enable automatic Demo Buy capture so each successful Scanner result generation captures all results or its first X results without another click;
13. inspect each captured security on a separate Demo Buy surface using the exact authoritative market row linked as the virtual-buy baseline;
14. see observed future `Price` and percentage change from that baseline at 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m;
15. see `NULL` for a horizon whose future observation is not yet available rather than a fabricated result;
16. understand which Scanner query/draft produced a Demo Buy observation well enough that later query edits do not silently rewrite the meaning of old observations;
17. understand collection/service health and the last committed authority;
18. restart the local service without losing committed active-day history or active-day Demo Buy observations;
19. run the whole product offline against one deterministic Fake Market;
20. perform one bounded real-provider verification without placing credentials in the repository.

## 3. Product surfaces

### 3.1 Current

Current shows exactly one latest committed row per currently authoritative security.

It preserves the MarketScope behavior model:

- BOOTING / EMPTY / MAIN / ERROR states;
- deterministic sorting;
- explicit null/zero/missing rendering;
- click/keyboard Detail navigation;
- refresh without losing user sort/scroll state;
- visible operational diagnostics.

### 3.2 Security Detail / History

Detail shows:

- canonical security identity;
- current summary when the security is still current;
- persisted historical rows ordered newest first;
- 500-row keyset pagination;
- historical-only security support;
- continuation retry without losing already loaded rows;
- return to Current with prior view state restored.

### 3.3 Dynamic SQL Scanner

Scanner remains a general read-only SQL surface.

The application must not secretly add ranking, filters, sorting or LIMIT beyond the user's SQL.

Scanner also provides:

- explicit Activate/Stop;
- repeat interval;
- saved-query CRUD;
- immutable built-ins that can be copied;
- Detail navigation only when SQL returns canonical `security_id AS securityId`;
- exact result-table reflection of SQL output;
- Demo Buy capture controls only when exactly one canonical `securityId`/`security_id` result column is available.

Strategy logic belongs here.

The staged candidate idea is a normal editable SQL query that calculates the highest contiguous stage a security passes and sorts by that value. It is not a dedicated strategy engine.

Demo Buy does not change Scanner result ordering. “Top X” means the first X rows in the exact order returned by the active SQL result.

### 3.4 Demo Buy validation

Demo Buy is a dedicated analytical surface, not an order-entry or portfolio screen.

For each captured observation it shows at least:

```text
source query label
capture time
Symbol / display name
securityId
baseline Price from the linked buy history row
10s Price / change %
20s Price / change %
30s Price / change %
45s Price / change %
60s Price / change %
90s Price / change %
120s Price / change %
3m Price / change %
5m Price / change %
10m Price / change %
```

The surface is allowed to be horizontally scrollable. Phase 1 prioritizes direct inspectability over dashboards, scores or aggregate strategy analytics.

The baseline is never user-entered. A Demo Buy must reference one exact authoritative `history` row for the same canonical security. The displayed baseline price is read from that row.

Percentage change for a horizon is:

```text
((future Price / baseline Price) - 1) * 100
```

and is `NULL` when the required future observation, baseline `Price`, future `Price`, or valid non-zero denominator is unavailable.

## 4. U.S. source requirement

The current provider source is Bank Leumi's authenticated U.S. screener endpoint:

```text
/lti/lti-app/api/Market/ScreenerHulPaging3
```

The product must treat the provider response as empirical external input, not an official immutable API contract.

The browser owns authentication. No cookie, token, account identifier or browser-session material is persisted or sent to the local service.

## 5. Data-integrity requirements

Market Flow US must prefer no new authority over uncertain authority.

Therefore:

- universe size is provider-derived, never hard-coded;
- `4015` is evidence from one observation, not a product constant;
- canonical product identity is `String(PaperId)` only after `PaperId` is validated as a non-blank string or JavaScript safe integer; malformed object/array/boolean/non-safe numeric identities fail closed at both Browser and Node authority boundaries;
- a complete-response acquisition must validate exact row count and unique canonical IDs;
- incomplete, duplicate, malformed or failed snapshots never replace Current and never append authoritative history;
- Node commit acknowledgement is required before the browser treats a cycle as committed;
- prior committed authority survives acquisition, transport, validation or persistence failure;
- raw provider rows are retained;
- `null`, numeric `0`, empty string and missing property remain distinguishable;
- unproven provider semantics remain explicitly unproven;
- Demo Buy never creates market authority and never mutates `history`/`latest`;
- a Demo Buy capture succeeds only for canonical security IDs that can be linked to an authoritative current/history row at capture time;
- the exact linked `(buy_cycle_id, security_id)` remains immutable for that observation even as `latest` advances;
- repeated Scanner captures are observations, not positions; the same security may appear in later captures again.

## 6. Current U.S. visible-data requirement

The first U.S. Current surface uses source-shaped fields rather than inventing stronger semantics.

Required visible columns:

```text
PaperNameEng/display name
Symbol
ExchangeName
securityId
Price
ChangePercent
BidRate
AskRate
DailyVolume
DailyLow
DailyHigh
YesterdayRate
PaperMarketCap
TradeDateTime
collectedAtMs
```

Default sort is `DailyVolume DESC`, with deterministic identity tie-breakers.

`Price`, `DailyVolume`, `PaperMarketCap` and `TradeDateTime` retain source naming while their exact external semantics remain empirical.

## 7. History requirement

History must preserve every successful committed cycle row within the active trading day.

The U.S. product deliberately does not add:

- predecessor-ID columns;
- dynamic horizon schema;
- materialized short-window deltas;
- a dedicated temporal-feature engine;
- background jobs that update Demo Buy horizon columns.

Scanner SQL and Demo Buy evaluation read `history` directly. If representative workload proves a real bottleneck, optimize only that measured area later.

## 8. Staged candidate SQL requirement

Market Flow US ships at least one editable staged-ranking query.

The initial example uses sequential time comparisons such as 10s, 20s, 30s, 45s, 60s, 90s and 120s only as SQL text.

For each current security the query:

1. locates the latest available historical row at or before each target time;
2. evaluates stages in order;
3. stops credit at the first failed or unavailable stage;
4. returns `stage_reached`;
5. sorts highest stage first;
6. may use explicit SQL tie-breakers such as current `ChangePercent` or `DailyVolume`.

These durations are not product infrastructure and can be edited later without schema changes.

## 9. Demo Buy capture requirement

A successful Demo Buy capture has these semantics:

```text
Scanner result security IDs
→ choose manual selected rows OR all rows OR first X rows
→ resolve each chosen security against current authoritative latest at capture commit time
→ persist a Demo Buy observation linked to that exact history key
```

The capture does not accept a user-supplied buy price.

For manual capture, the click/command is the virtual-buy moment. For automatic capture, the automatic action triggered by each successful Scanner result generation is the virtual-buy moment.

Within one capture event, duplicate result rows for the same canonical security are reduced to the first occurrence so the result ranking remains meaningful without inserting duplicate observations for the same security in the same event.

If the Scanner result does not expose exactly one recognized canonical security column, Demo Buy capture is unavailable for that result rather than guessing identity from `Symbol` or another field.

The feature stores enough source-query snapshot information to distinguish observations created before and after a Scanner query is edited. It does not create a Strategy Engine or parse strategy meaning from SQL.

## 10. Demo Buy future-observation requirement

The fixed Phase-1 horizons are:

```text
10s
20s
30s
45s
60s
90s
120s
180s
300s
600s
```

For each horizon, evaluation uses persisted `history` for the same canonical security and selects the first authoritative observation at or after:

```text
baseline collected_at_ms + horizon
```

No future row means `NULL`. A target whose wall-clock duration has passed but for which no authoritative future history row exists is still `NULL`; elapsed wall time alone is never evidence.

Phase 1 is intentionally approximate market-strategy validation. It assumes the source `Price` can be used as the virtual baseline and later comparison value. It does not claim that a real order could have filled at that value.

## 11. Locality, privacy and authority

- Provider authentication/session state stays in the browser.
- Node receives market data plus minimal protocol metadata only.
- Durable authority belongs to one localhost Node-owned DuckDB.
- Browsers never open the production DuckDB directly.
- No cloud backend is required.
- Loopback bind/origin restrictions remain enforced.
- Repository/test artifacts remain public-safe.

## 12. Failure and recovery

Preserve MarketScope fail-closed behavior:

- local service unavailable at launch is visible;
- transport loss stops producer work instead of creating an offline authority queue;
- pending authority-dependent work fails visibly;
- already committed data remains readable;
- recovery is explicit;
- stale sessions are recovered on service restart;
- failed Demo Buy capture does not partially create a capture event;
- restart preserves active-day Demo Buy observations together with the active-day market DB.

Automatic reconnect/replay is not required.

## 13. Offline development

One deterministic local Fake Market must exercise the normal browser runtime, Node service, DuckDB, Current, Detail/History, Scanner and Demo Buy without real login.

The fake must cover changing U.S. screener rows, dynamic membership, null/zero/missing values, malformed/incomplete responses, HTTP errors and delays, plus deterministic forward-price paths that make Demo Buy horizon assertions unambiguous.

## 14. Operational visibility and diagnosability

Keep the proven diagnostics model:

- collection/service health;
- last committed update;
- last committed cycle;
- cycle duration;
- Current count;
- completed/failed cycle counts;
- history row count;
- stable checkpoint/error identifiers;
- last successful checkpoint;
- copyable sanitized Support Snapshot;
- CLI fallback when the UI cannot start.

Demo Buy errors must remain ordinary local product errors and must not expose SQL secrets beyond the locally authored query text already visible to the user.

## 15. Performance requirement

Correctness comes first.

Representative workload must prove an approximately-4k-security U.S. shape and include staged-ranking SQL. Demo Buy evaluation must also be exercised at a representative but bounded active-day observation count.

Do not invent hard millisecond SLOs before measurement. Do not precompute every horizon or add a worker merely to avoid a query whose measured cost is already practical.

If staged SQL, Demo Buy reads or persistence are materially too slow for practical use, that measured bottleneck becomes a focused optimization/replan.

## 16. Active-day lifecycle

Demo Buy observations are part of the active trading day's analytical evidence.

The normal new-day operation may archive the prior DuckDB with its market history and Demo Buy observations, then create a fresh active-day market/Demo-Buy authority while preserving saved Scanner queries according to the existing new-day contract.

Phase 1 does not create a multi-day strategy warehouse or cross-day aggregate database.

## 17. Phase-2 deferred scope

Only after Phase 1 is completely implemented and verified may planning reopen for the requested stronger tradeability analysis, such as:

- how much volume/quantity traded after the virtual buy;
- whether enough trading occurred at or above a higher target price;
- stronger evidence that a theoretical sell could actually have been filled;
- spread/ask/bid-aware execution assumptions;
- fees or realized paper P/L.

Phase 2 is intentionally not required for Phase-1 completion.

## 18. Non-goals

This phase does not include:

- IBKR/order execution;
- automatic real buy/sell logic;
- broker-order simulation/fill engine;
- portfolio/risk management;
- Strategy Engine;
- score/ranking service outside SQL;
- dynamic horizon schema;
- background horizon materialization;
- cross-day strategy warehouse;
- liquidity/fillability proof from volume/trade data;
- cloud backend;
- replacing Node/DuckDB/WebSocket without evidence;
- TradingView dependency.

## 19. Completion condition

The current product increment is complete only when:

- U.S. provider acquisition and exact validation remain green;
- Current/Detail/History use the U.S. contract;
- Scanner and saved-query behavior remain intact;
- staged-ranking SQL remains executable and measured;
- Demo Buy manual/all/Top-X/automatic capture is executable against exact authoritative buy-history rows;
- Demo Buy displays the fixed Phase-1 future `Price`/percentage horizons with correct `NULL` behavior;
- Fake Market, Fast, Browser and representative workload gates are green for the post-feature candidate;
- target-machine local acceptance and one-day lifecycle evidence are green on that candidate;
- the SHA-bound authenticated boundary passes for closed/static compatibility;
- on the same accepted candidate, market-open acceptance mechanically observes at least one persisted provider market/freshness field change and proves its reflection in committed Current/History; a run with no observed change remains pending/inconclusive rather than becoming a fabricated PASS;
- docs/launchers/branding match Market Flow US;
- no Israel-only runtime path remains authoritative.
