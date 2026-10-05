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
→ evidence-driven AI-assisted forensic review of why a selection succeeded or failed
```

The product is a controlled U.S. conversion of the proven MarketScope product. The goal is to preserve the product model that already worked in Israel and change only what the U.S. provider/data contract or an explicitly requested new product capability requires.

Demo Buy exists to test whether a Scanner query is directionally useful before any real order-execution work: when a Scanner result selects a security and a Demo Buy capture is accepted, the product must later show what persisted source `Price` did after that virtual-buy moment.

The AI Investigation Pack extends that validation loop without turning the product into an AI trading agent. It lets the user export a disciplined local evidence bundle that separates prediction-time evidence from later outcome evidence and asks an external AI to propose testable Scanner-SQL improvements without hindsight leakage.

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
11. create Demo Buy observations from all Scanner results or the first X ordered result rows;
12. optionally enable automatic Demo Buy capture so successful Scanner generations attempt an All or Top-X capture without another click while remaining bounded and visibly reporting any skipped/busy generation;
13. preserve each captured item's original Scanner result rank rather than re-numbering the selected subset;
14. distinguish when the Scanner result became ready from when the virtual buy was actually accepted;
15. inspect each captured security on a separate Demo Buy surface using the exact authoritative market row linked as the virtual-buy baseline;
16. see observed future `Price`, percentage change and an explicit `UP` / `DOWN` / `FLAT` outcome at 10s, 20s, 30s, 45s, 60s, 90s, 120s, 3m, 5m and 10m;
17. see an explicit unavailable reason when a trustworthy percentage cannot be produced, instead of treating every unavailable cell as merely “wait longer”;
18. inspect immutable source-query provenance, including the activated SQL and Scanner timing, without later query edits rewriting old observations;
19. generate a local AI Investigation Pack for one Demo Buy observation containing the exact query, retained original Scanner comparison context, pre-buy history, baseline, post-buy history, trusted outcomes and a field guide;
20. copy a generated anti-hindsight AI prompt that asks for evidence-backed minimal SQL improvements, counterfactual peer checks and a validation plan instead of automatically editing the active query;
21. regenerate a previously partial investigation after more same-day outcome history arrives;
22. understand collection/service health and the last committed authority;
23. restart the local service without losing committed active-day history or active-day Demo Buy observations/provenance;
24. run the whole product offline against one deterministic Fake Market;
25. perform one bounded real-provider verification without placing credentials in the repository.

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

Demo Buy does not change Scanner result ordering. `Top X` means the first X **source rows** in exact SQL result order. Duplicate identities are reduced only after that source-row range is chosen, so duplicate rows inside Top X never cause a later row outside X to be pulled in.

### 3.4 Demo Buy validation

Demo Buy is a dedicated analytical surface, not an order-entry or portfolio screen.

For each captured observation it shows at least:

```text
source query label
Scanner result-ready time / capture latency
capture time
original Scanner result rank
Symbol / display name
securityId
baseline collection time / baseline age
baseline Price from the linked buy history row
10s Price / change % / outcome
20s Price / change % / outcome
30s Price / change % / outcome
45s Price / change % / outcome
60s Price / change % / outcome
90s Price / change % / outcome
120s Price / change % / outcome
3m Price / change % / outcome
5m Price / change % / outcome
10m Price / change % / outcome
```

Outcome values are:

```text
UP          changePercent > 0
DOWN        changePercent < 0
FLAT        changePercent = 0
UNAVAILABLE no trustworthy percentage exists
```

When a horizon is `UNAVAILABLE`, the product preserves the reason category: no future observation yet, baseline price unavailable, baseline price zero, or matched future price unavailable. A missing baseline row is not a normal unavailable state; it is an integrity failure.

The UI must not rely on color alone to communicate direction.

The surface is allowed to be horizontally scrollable. Phase 1 prioritizes direct inspectability over dashboards, scores or aggregate strategy analytics.

The baseline is never user-entered. A Demo Buy must reference one exact authoritative `history` row for the same canonical security. The displayed baseline price is read from that row.

Percentage change for a horizon is:

```text
((future Price / baseline Price) - 1) * 100
```

and is `NULL` when no valid percentage can be produced.

The screen exposes both the Node-authoritative capture time and the baseline row's collection time. It also preserves the Scanner result completion time so the user can distinguish strategy-signal latency from baseline staleness.

Full SQL provenance is available on demand per capture rather than repeated in every visible item row.

### 3.5 AI Investigation Pack

Each Demo Buy observation exposes:

```text
Generate AI Investigation Pack
```

The product generates the pack locally. It does not call an AI provider, store an AI API key or transmit evidence automatically.

The pack contains:

```text
README.md
PROMPT.md
MANIFEST.json
QUERY.sql
SCANNER_CONTEXT.json
TARGET_BEFORE.jsonl
BASELINE.json
TARGET_AFTER.jsonl
OUTCOME.json
FIELD_GUIDE.md
```

The investigation contract is owned by `docs/AI_INVESTIGATION_PACK.md`.

The pack must make it impossible to confuse information that was available before the virtual buy with information observed afterward. The generated prompt labels facts, derived values and hypotheses separately and requires every proposed Scanner improvement to cite only prediction-time evidence.

A capture freezes the first 50 Scanner source-result rows, with exact SQL order/ranks and bounded deterministic JSON-safe values, as comparison provenance. This context is not market authority and never changes the Scanner ranking.

For a target inside the retained Top-50, the AI may compare its original Scanner output with nearby candidates. A target outside that retained context still produces a useful pack, but the manifest/prompt marks `targetInScannerContext=false` and forbids fabricated peer/rank reconstruction.

Default forensic history windows are:

```text
30 minutes before capturedAtMs through capturedAtMs
capturedAtMs through capturedAtMs + 10 minutes
```

A pack may be `PARTIAL_OUTCOME` before the full post-buy evidence boundary exists. Regeneration may later become `COMPLETE_OUTCOME`; immutable query/context/baseline evidence never changes.

The user decides whether any AI suggestion becomes experimental Scanner SQL. The product never activates or edits a query automatically from AI output.

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
- Node commit acknowledgement is required before the browser treats a market cycle as committed;
- prior committed authority survives acquisition, transport, validation or persistence failure;
- raw provider rows are retained;
- `null`, numeric `0`, empty string and missing property remain distinguishable;
- unproven provider semantics remain explicitly unproven;
- Demo Buy never creates market authority and never mutates `history`/`latest`;
- a Demo Buy capture succeeds only for canonical security IDs that can be linked to an authoritative current/history row at capture time;
- the exact linked `(buy_cycle_id, security_id)` remains immutable for that observation even as `latest` advances;
- a missing immutable Demo Buy baseline link is an integrity error, not a normal unavailable horizon;
- original Scanner `resultRank` is immutable capture provenance and may contain gaps for manual selections;
- the retained Top-50 Scanner comparison context is immutable capture provenance and is never recomputed from a later market state;
- repeated Scanner captures are observations, not positions; the same security may appear in later captures again;
- generated AI packs are derivative local export artifacts and never become DB authority.

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
- background jobs that update Demo Buy horizon columns;
- speculative new history indexes without measured need.

Scanner SQL, Demo Buy evaluation and AI Investigation Pack history exports read `history` directly. If representative workload proves a real bottleneck, optimize only that measured area later.

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
successful Scanner generation
→ freeze query/timing/result provenance + bounded first-50 comparison context
→ choose manual selected source rows OR all source rows OR first X source rows
→ validate every chosen identity cell
→ reduce duplicate canonical IDs to first chosen occurrence
→ retain each remaining row's original 1-based resultRank
→ submit one bounded immutable capture request
→ resolve each chosen security against authoritative latest at serialized capture time
→ persist one capture plus exact history links
```

The capture does not accept a user-supplied buy price.

For manual and automatic capture, the accepted Node capture operation defines the virtual-buy moment. Scanner `completedAtMs` is the result/signal-ready time and remains separate; the difference is capture latency, not market execution latency.

Within one capture event, duplicate result rows for the same canonical security are reduced by the browser to the first chosen occurrence. Node independently validates that the protocol payload is already unique and rejects duplicate `securityId` or duplicate `resultRank` rather than silently repairing it.

A recognized identity cell must be a non-blank canonical string. Manual invalid rows are non-selectable. `All`, `Top X` and automatic selections that would include an invalid identity are refused visibly rather than silently skipping the row.

A capture contains at most `5000` unique canonical security IDs. `Top X` is between `1` and `5000` **source rows**. `All` and auto-All never silently truncate a larger deduped selection. Manual empty selection is disabled/rejected; a successful automatic Scanner generation with zero chosen rows is a no-op and does not create an empty capture.

One Viewer-level Demo Buy capture slot covers both manual and automatic capture. While a request is in flight, manual capture controls cannot double-submit; an automatic generation is visibly skipped rather than queued. Success or confirmed rejection releases the slot and never stops Scanner scheduling.

If the Scanner result does not expose exactly one recognized canonical security column, Demo Buy capture is unavailable for that result rather than guessing identity from `Symbol` or another field.

Immutable source-generation provenance includes query ID/name/exact SQL, active interval, Scanner started/completed timestamps, source row count and bounded first-50 comparison context. It does not create a Strategy Engine or parse strategy meaning from SQL.

### Capture acknowledgement uncertainty

A transport error does not prove that a capture was rolled back. If the request may already have reached the service and the connection closes before the browser receives the response, the UI classifies the attempt as:

```text
ACKNOWLEDGEMENT_UNKNOWN
```

rather than `FAILED`.

The capture slot is not blindly retried. The user must recover/reconnect and refresh Demo Buy before another capture action so already-committed evidence can be observed without silently creating a duplicate. A stable server rejection/rollback is `CONFIRMED_REJECTED`; a received success ACK is `CONFIRMED_COMMITTED`.

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
captured_at_ms + horizon
```

The baseline `Price` still comes from the immutable linked buy-history row. The horizon clock starts at the Node-authoritative virtual-buy moment, not at Scanner completion time and not at the possibly earlier baseline `collected_at_ms`.

The first qualifying future row remains the horizon observation even if its `Price` is NULL; evaluation must not skip it to cherry-pick a later usable price.

No future row means `UNAVAILABLE / NO_FUTURE_OBSERVATION`. Other unavailable reasons distinguish unusable baseline/future prices. Elapsed wall time alone is never evidence.

For each matched future row the read model also exposes `observed_at_ms` and `actual_elapsed_ms = observed_at_ms - captured_at_ms`, so delayed collection is visible instead of being silently treated as an exact-timing sample.

Phase 1 is intentionally approximate market-strategy validation. It assumes the source `Price` can be used as the virtual baseline and later comparison value. It does not claim that a real order could have filled at that value.

## 11. Locality, privacy and authority

- Provider authentication/session state stays in the browser.
- Node receives market data plus minimal protocol metadata only.
- Durable authority belongs to one localhost Node-owned DuckDB.
- Browsers never open the production DuckDB directly.
- No cloud backend is required.
- AI Investigation Pack generation is local; no AI provider is contacted automatically.
- No AI credential/API key is required or persisted.
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
- lost capture acknowledgement is surfaced as unknown rather than falsely claiming rollback or automatically replaying;
- restart preserves active-day Demo Buy observations together with their immutable capture/query/context provenance;
- Demo Buy read failure never mutates stored observations;
- Demo Buy capture failure/busy backpressure never stops or corrupts Scanner scheduling;
- AI pack generation failure mutates neither DB authority nor the Demo Buy observation and is independently retryable;
- a database marked schema v3 but already containing only part of the Demo Buy v4 structures is treated as inconsistent and fails closed rather than being silently accepted as a resumable migration.

Automatic reconnect/replay is not required.

## 13. Offline development

One deterministic local Fake Market must exercise the normal browser runtime, Node service, DuckDB, Current, Detail/History, Scanner, Demo Buy and AI Investigation Pack generation without real login.

The fake must cover changing U.S. screener rows, dynamic membership, null/zero/missing values, malformed/incomplete responses, HTTP errors and delays, plus deterministic forward-price paths that make Demo Buy horizon assertions and AI-pack before/after evidence unambiguous.

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

Demo Buy errors/busy skips/acknowledgement-unknown states and AI-pack generation errors must remain ordinary local product diagnostics. Support snapshots must not dump stored SQL, full AI-pack evidence or authenticated/provider-private material; SQL provenance and pack contents are shown only through their explicit local user workflows.

## 15. Performance requirement

Correctness comes first.

Representative workload must prove an approximately-4k-security U.S. shape and include staged-ranking SQL. Demo Buy evaluation must also be exercised at a representative but bounded active-day observation count.

Demo Buy pages are intentionally bounded more tightly than History because one item carries ten horizon results. Phase 1 uses 50-item keyset pages and one transactionally consistent trusted read snapshot per page.

AI pack generation is an explicit user-triggered export, not a recurring background workload. Its 30-minute pre-window, 10-minute post-window and Top-50 Scanner context are bounded and must not stall recurring Scanner/collection work materially on representative data.

Do not invent hard millisecond SLOs before measurement. Do not precompute every horizon, add a worker or add a new `history` index merely to avoid a query whose measured cost is already practical.

If staged SQL, Demo Buy reads, AI-pack export or persistence are materially too slow for practical use, that measured bottleneck becomes a focused optimization/replan.

## 16. Active-day lifecycle

Demo Buy observations and their retained Scanner context are part of the active trading day's analytical evidence.

The normal new-day operation may archive the prior DuckDB with its market history and Demo Buy observations/context, then create a fresh schema-v4 active-day market/Demo-Buy authority while preserving saved Scanner queries according to the existing new-day contract.

Demo Buy horizon evaluation does not bridge into the next active-day database. If a late-day horizon was never observed before rollover, it remains unavailable in that day's self-contained evidence.

AI packs already exported remain local files. New packs are generated only from the DB currently opened by the local product/service; no multi-day warehouse is introduced.

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
- automatic call to an AI provider;
- storage of AI credentials;
- automatic AI modification/activation of Scanner SQL;
- internet/web enrichment inside the AI pack builder;
- cloud backend;
- replacing Node/DuckDB/WebSocket without evidence;
- TradingView dependency.

## 19. Completion condition

The current product increment is complete only when:

- U.S. provider acquisition and exact validation remain green;
- Current/Detail/History use the U.S. contract;
- Scanner and saved-query behavior remain intact;
- staged-ranking SQL remains executable and measured;
- Demo Buy manual/all/Top-X/automatic capture behavior is executable against exact authoritative buy-history rows with source-row-first Top-X semantics, original result-rank provenance, bounded/visible invalid/oversized/busy handling and no double-submit;
- capture acknowledgement uncertainty is handled without false rollback claims or automatic duplicate retries;
- immutable Scanner query/interval/result timing plus bounded Top-50 comparison provenance survive later query edits and can be inspected/exported;
- Demo Buy displays the fixed Phase-1 future `Price`/percentage/outcome horizons with explicit unavailable reasons and correct signal/capture/baseline timing;
- bounded Demo Buy continuation is stable while newer automatic captures are inserted and each page is evaluated from one consistent DB snapshot;
- AI Investigation Pack generation produces the documented local deterministic evidence bundle and anti-hindsight prompt, including honest `targetInScannerContext` and partial/complete outcome status;
- AI pack regeneration changes only later outcome-dependent evidence and never edits Scanner SQL or DB authority;
- Fake Market, Fast, Browser and representative workload gates are green for the post-feature candidate;
- target-machine local acceptance and one-day lifecycle evidence are green on that candidate;
- the SHA-bound authenticated boundary passes for closed/static compatibility;
- on the same accepted candidate, market-open acceptance mechanically observes at least one persisted provider market/freshness field change and proves its reflection in committed Current/History; a run with no observed change remains pending/inconclusive rather than becoming a fabricated PASS;
- docs/launchers/branding match Market Flow US;
- no Israel-only runtime path remains authoritative.
