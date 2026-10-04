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
```

The product is a controlled U.S. conversion of the proven MarketScope product. The goal is to preserve the product model that already worked in Israel and change only what the U.S. provider/data contract requires.

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
10. understand collection/service health and the last committed authority;
11. restart the local service without losing committed history;
12. run the whole product offline against one deterministic Fake Market;
13. perform one bounded real-provider verification without placing credentials in the repository.

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
- exact result-table reflection of SQL output.

Strategy logic belongs here.

The staged candidate idea is a normal editable SQL query that calculates the highest contiguous stage a security passes and sorts by that value. It is not a dedicated strategy engine.

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
- canonical product identity is `String(PaperId)`;
- a complete-response acquisition must validate exact row count and unique canonical IDs;
- incomplete, duplicate, malformed or failed snapshots never replace Current and never append authoritative history;
- Node commit acknowledgement is required before the browser treats a cycle as committed;
- prior committed authority survives acquisition, transport, validation or persistence failure;
- raw provider rows are retained;
- `null`, numeric `0`, empty string and missing property remain distinguishable;
- unproven provider semantics remain explicitly unproven.

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

History must preserve every successful committed cycle row.

The initial U.S. conversion deliberately does not add:

- predecessor-ID columns;
- dynamic horizon schema;
- materialized short-window deltas;
- a dedicated temporal-feature engine.

Scanner SQL reads `history` directly. If representative workload proves a real bottleneck, optimize only that measured area later.

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

## 9. Locality, privacy and authority

- Provider authentication/session state stays in the browser.
- Node receives market data plus minimal protocol metadata only.
- Durable authority belongs to one localhost Node-owned DuckDB.
- Browsers never open the production DuckDB directly.
- No cloud backend is required.
- Loopback bind/origin restrictions remain enforced.
- Repository/test artifacts remain public-safe.

## 10. Failure and recovery

Preserve MarketScope fail-closed behavior:

- local service unavailable at launch is visible;
- transport loss stops producer work instead of creating an offline authority queue;
- pending authority-dependent work fails visibly;
- already committed data remains readable;
- recovery is explicit;
- stale sessions are recovered on service restart.

Automatic reconnect/replay is not required.

## 11. Offline development

One deterministic local Fake Market must exercise the normal browser runtime, Node service, DuckDB, Current, Detail/History and Scanner without real login.

The fake must cover changing U.S. screener rows, dynamic membership, null/zero/missing values, malformed/incomplete responses, HTTP errors and delays.

## 12. Operational visibility and diagnosability

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

## 13. Performance requirement

Correctness comes first.

Representative workload must prove an approximately-4k-security U.S. shape and include the staged-ranking SQL. Do not invent hard millisecond SLOs before measurement.

If the staged SQL or persistence is materially too slow for practical use, that measured bottleneck becomes a focused optimization/replan. It does not justify preemptively redesigning the DB.

## 14. Non-goals

This migration does not include:

- IBKR/order execution;
- automatic buy/sell logic;
- portfolio/risk management;
- Strategy Engine;
- score/ranking service outside SQL;
- dynamic horizon schema;
- cloud backend;
- replacing Node/DuckDB/WebSocket without evidence;
- TradingView dependency.

## 15. Completion condition

The U.S. conversion is complete only when:

- U.S. provider acquisition and exact validation are implemented;
- Current/Detail/History use the U.S. contract;
- Scanner and saved-query behavior remain intact;
- staged-ranking SQL is executable and measured;
- Fake Market, Fast, Browser and representative workload gates are green;
- bounded real-provider verification passes locally on the authenticated provider page;
- docs/launchers/branding match Market Flow US;
- no Israel-only runtime path remains authoritative.
