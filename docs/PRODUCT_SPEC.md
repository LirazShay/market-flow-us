# MarketScope Product Specification

## Surface A — Current Universe


This section owns the observable Current Universe behavior to preserve while the data authority changes from V1 IndexedDB to the MarketScope localhost Node/DuckDB service.

### A1. Row set and identity

Current Universe is a materialized view of the latest committed record per security.

Conceptually:

```text
authoritative latest rows
LEFT JOIN current universe metadata
  ON canonical SecurityId
```

Rules:

- one rendered row originates from one authoritative `latest` row;
- universe metadata enriches a latest row, primarily with `paperName`;
- a latest row **must remain visible** when its universe metadata is missing; in that case `paperName` is missing;
- a universe-only security with no authoritative latest row does not create a Current row;
- displayed/canonical `securityId` is a string;
- duplicate canonical SecurityIds in either latest or universe input are integrity errors, not silently collapsed rows;
- malformed current input is an error state, not successful emptiness.

The V1 model also retained source `latest` and `universe` objects internally. That is implementation detail, not a MarketScope UI requirement.

### A2. Stable columns

The Current table has these 16 columns, in this order:

| # | Key | Hebrew label | Value |
|---:|---|---|---|
| 1 | `paperName` | שם נייר | universe metadata |
| 2 | `securityId` | מספר נייר | canonical ID |
| 3 | `LastKnownRate` | שער אחרון | latest market data |
| 4 | `BaseRateChangePercentage` | שינוי יומי % | latest market data |
| 5 | `BuyLimit1` | BID1 | latest market data |
| 6 | `BuyVolume1` | כמות BID1 | latest market data |
| 7 | `SellLimit1` | ASK1 | latest market data |
| 8 | `SellVolume1` | כמות ASK1 | latest market data |
| 9 | `DailyDealsQuantity` | מס' עסקאות | latest market data |
| 10 | `LastDealVolume` | כמות עסקה אחרונה | latest market data |
| 11 | `DailyTurnover` | כמות יומית | latest market data |
| 12 | `DailyNISRevenue` | מחזור כספי | latest market data |
| 13 | `DailyLowestRate` | נמוך יומי | latest market data |
| 14 | `DailyHighestRate` | גבוה יומי | latest market data |
| 15 | `LastDealTimeOnly` | עסקה אחרונה | latest market data |
| 16 | `collectedAtMs` | נאסף בשעה | collection timestamp |

Do not add, remove, rename, reinterpret or silently derive Current columns during the first clean migration unless a later explicit product decision changes this contract.

### A3. Display semantics

Missing and zero remain semantically distinct:

```text
null / undefined / empty string
→ "—"

0
→ "0"
```

Formatting rules inherited from V1:

- finite numeric values are locale-formatted for `he-IL`, with at most 6 fractional digits;
- percentages use the same numeric formatting followed by `%`;
- `collectedAtMs` is displayed as a 24-hour `HH:mm:ss` local time;
- ordinary strings are displayed as strings;
- formatting must not invent unit conversions or provider-field meaning;
- numeric/percentage/timestamp cells are visually treated as numeric/LTR data;
- finite positive/negative `BaseRateChangePercentage` values may receive sign-specific presentation, but presentation must not change the numeric value.

### A4. Deterministic sorting

Every Current column is sortable by a real interactive header control.

Initial sort:

```text
DailyDealsQuantity DESC
```

Interaction:

- selecting a different string column first sorts ascending;
- selecting a different numeric or time column first sorts descending;
- selecting the already-active column toggles ASC/DESC;
- the active header exposes its direction through `aria-sort` and a visible ▲/▼ indicator;
- inactive headers expose no active sort direction.

Ordering rules:

1. compare the selected column;
2. equal selected-column values tie-break by `paperName ASC`;
3. remaining ties break by canonical `securityId ASC` using string ordering.

Missing-value ordering is deterministic and independent of ASC/DESC:

```text
present values
→ null
→ undefined
→ empty string
```

For numeric columns, finite numbers sort as numbers. Present non-finite/non-numeric values are not converted into invented numbers.

Sorting is view-only and must not mutate authoritative/persisted data.

### A5. Loading, populated, empty and error states

Current participates in the Viewer state model:

```text
BOOTING
EMPTY
MAIN
DETAIL
ERROR
```

On initial open, the Viewer begins in `BOOTING` with an explicit loading indication.

A successful populated Current read:

- renders the table;
- enters `MAIN` unless the user is currently in `DETAIL`;
- displays the number of Current rows;
- displays the latest cycle identifier represented by the current model;
- exposes a successful loaded status.

V1 computed summary values as:

- `rowCount` = number of latest-derived rows;
- `lastCycleId` = greatest integer cycle ID present;
- `lastCollectedAtMs` = greatest finite collection timestamp present.

When there are no authoritative latest rows:

- render an explicit `EMPTY` state;
- render no Current table rows;
- show `0` securities;
- show no last-cycle value;
- V1 displayed the literal message `אין עדיין snapshot מלא.`.

A failed authoritative Current read or invalid Current model:

- enters an explicit `ERROR` state unless another scoped rule owns the visible state;
- must not be presented as `EMPTY`;
- must not fabricate rows;
- keeps technical error name/message available to diagnostics/logging.

V1 error/success text explicitly named IndexedDB. **That storage-engine wording is not preserved** in MarketScope because Node/DuckDB becomes the authority; the state semantics above are the product contract.

### A6. Refresh semantics

Current must refresh by **rereading authoritative committed state**. A notification is only a refresh hint and is never a source of market rows.

Automatic refresh contract:

```text
commit/change notification
→ authoritative reread
→ rerender Current
```

Manual refresh contract:

```text
user presses "רענן תצוגה"
→ authoritative reread only
→ no provider/market-data API call
```

Additional behavior to preserve:

- startup remains usable when the live-notification mechanism is unavailable;
- manual refresh remains usable in that degraded mode;
- the UI communicates whether live refresh is active or manual refresh is required;
- overlapping refresh work is not required: V1 permits one refresh in flight and coalesces an additional pending request rather than performing concurrent Current rereads.

The V1 transport for live hints was BroadcastChannel. **BroadcastChannel itself is not a MarketScope requirement**; the new architecture may use the simplest Node-backed notification mechanism while preserving the reread semantics.

### A7. UI state preservation across refresh

The selected Current sort must survive automatic refresh and be re-applied to the newly reread values.

The Current implementation also captures and restores horizontal/vertical table scroll position when a visible Current table is rerendered.

Evidence quality from the V1 extraction:

- sort preservation across live refresh is directly covered by V1 Chromium automation;
- horizontal Current-table scroll preservation across Current → Detail → live refresh → Back is also directly covered by V1 Chromium automation;
- the implementation captures/restores both horizontal and vertical table scroll coordinates.

MarketScope preserves sort and viewport state across the Detail round-trip. Verification targets the observable viewport behavior rather than depending on the exact V1 DOM mechanism.

A refresh while the user is in `DETAIL` must not force the Viewer back to `MAIN` or `EMPTY`. Detail refresh/navigation semantics are specified in Surface B.

### A8. Row activation and accessibility boundary

Each Current row is an actionable security row identified by canonical `securityId`.

V1 behavior to preserve:

- mouse click activates the row;
- keyboard `Enter` activates the focused row;
- keyboard `Space` activates the focused row and prevents the default page action;
- rows are keyboard-focusable;
- the accessible row label identifies the action as opening history for `paperName`, falling back to `securityId`;
- sortable headers are real buttons with keyboard focus and accessible sort state.

Activation delegates to the shared Security Detail / History surface. Exact Detail behavior, Back behavior and history semantics are owned by Surface B below.

### A9. Migration boundary

Preserve the behavior above, not V1's storage mechanism.

V1-specific mechanisms that are **not** part of the MarketScope Current product contract:

- direct IndexedDB reads;
- same-origin IndexedDB as authority;
- BroadcastChannel as the refresh transport;
- status text that says data came from IndexedDB.

MarketScope Current reads from the one trusted localhost Node/DuckDB authority and preserves the same observable table/state/sort/refresh/navigation behavior against that authority.

### A10. Evidence provenance

Primary V1 evidence used for this extraction:

- `viewer/current-table.js`;
- `viewer/pure/current-table-logic.js`;
- `viewer/bootstrap.js`;
- `viewer/pure/viewer-state.js`;
- `viewer/live-refresh.js`;
- `specs/viewer.spec.md`;
- `tests/unit/current-table-logic.test.js`;
- `tests/unit/viewer-state.test.js`;
- `tests/automation/specs/viewer-current-table.spec.js`;
- `tests/automation/specs/viewer-bootstrap.spec.js`;
- `tests/automation/specs/viewer-live-refresh.spec.js`.

Direct executable V1 evidence confirms the 16-column contract, latest+universe join behavior, no-drop behavior for missing universe metadata, zero/missing display semantics, duplicate-ID rejection, deterministic sorting, interactive accessible headers, populated/empty rendering, DB-only manual refresh, degraded manual fallback and sort preservation across live refresh.

### A11. Operational diagnostics

The Viewer exposes a compact operational diagnostic strip that remains visible in both `MAIN` and `DETAIL`.

The V1-extracted metrics are:

- recorder/collection health;
- age/time of the last committed update;
- last committed cycle ID;
- last cycle duration;
- current/latest security count;
- completed cycle count;
- failed cycle count;
- persisted history row count.

V1 also displayed browser storage usage/quota. That metric was tied to IndexedDB/browser quota and is **not** a MarketScope product requirement after authority moves to Node/DuckDB. A future Node database-size metric may be added only if the technical plan justifies it.

Health vocabulary extracted from V1:

```text
UNKNOWN  → לא ידוע
RUNNING  → רץ
STALE    → לא מעודכן
STOPPED  → נעצר
ERROR    → שגיאה
```

V1 health precedence was:

```text
STOPPED
→ STALE
→ ERROR
→ RUNNING
```

with `UNKNOWN` when no recorder state existed.

V1 used a 15-second heartbeat age as its stale threshold. MarketScope preserves the health semantics but does **not** freeze 15 seconds as a product law; heartbeat/stale timing belongs to the Technical Spec and must be coherent with the chosen heartbeat cadence.

Diagnostics refresh from the same trusted local authority as the Viewer:

```text
manual refresh or commit/change hint
→ authoritative diagnostics reread
→ rerender metrics
```

They must not be overwritten accidentally by Current-table rerender, and missing metrics remain visibly unknown rather than being coerced to zero.

### A12. Current-surface scope boundary

The initial Current surface preserves the V1 browsing contract: table + deterministic sorting + navigation.

It does **not** require a separate Current-side filter system or charting surface. Analytical filtering/ranking belongs to Scanner SQL unless a later explicit product requirement adds another UI capability.

## Surface B — Security Detail / History

This surface preserves the extracted V1 contract, with one explicit MarketScope continuity adaptation for historical-only securities.

This surface is keyed by canonical `SecurityId`. It is a read-only view over committed authority and never calls the provider.

### B1. Entry and identity

From Current Universe, activating a row opens Detail for that row's canonical string `securityId`.

V1 accepts Detail entry from the Current row model. MarketScope generalizes the entry key to canonical `SecurityId` because the accepted V2 product contract requires persisted history to remain viewable even when a security is no longer in Current.

Rules:

- Detail identity is canonical non-empty string `SecurityId`;
- Current-row activation and future Scanner navigation must converge on the same Detail surface;
- opening Detail captures the Current viewport before hiding Current;
- Detail enters an explicit loading state while authoritative data is read;
- a later/stale open response for a previously selected security must not overwrite a newer selection.

### B2. Current/detail summary

For a security that is currently present, the Detail header/summary is derived from its authoritative Current row.

V1 summary fields are:

| Field | Display |
|---|---|
| title | `paperName`, fallback to identity |
| security ID | canonical `securityId` |
| last rate | `LastKnownRate` |
| daily change | `BaseRateChangePercentage` |
| BID1 / ASK1 | `BuyLimit1 / SellLimit1` |
| last deal time | `LastDealTimeOnly` |

These values use the same missing/zero/number/percentage formatting semantics as Current.

Historical-only continuity is resolved in MarketScope as follows:

- Detail can open by canonical SecurityId even when no Current row exists;
- persisted history remains readable;
- persisted `paperName` metadata may be shown when available; otherwise title falls back to SecurityId;
- missing Current-only summary values are shown as unavailable/missing;
- the newest history row must **not** be silently promoted to "current" merely to fill the summary.

This keeps current authority and historical evidence distinct.

### B3. History row contract

The V1 history table has these 15 columns in this order:

| # | Key | Hebrew label | Source |
|---:|---|---|---|
| 1 | `collectedAtMs` | זמן איסוף | history row |
| 2 | `cycleId` | Cycle | history row |
| 3 | `chunkIndex` | Chunk | history row |
| 4 | `LastKnownRate` | שער אחרון | `data.LastKnownRate` |
| 5 | `BaseRateChangePercentage` | שינוי יומי % | `data.BaseRateChangePercentage` |
| 6 | `BuyLimit1` | BID1 | `data.BuyLimit1` |
| 7 | `BuyVolume1` | כמות BID1 | `data.BuyVolume1` |
| 8 | `SellLimit1` | ASK1 | `data.SellLimit1` |
| 9 | `SellVolume1` | כמות ASK1 | `data.SellVolume1` |
| 10 | `DailyDealsQuantity` | מס' עסקאות | `data.DailyDealsQuantity` |
| 11 | `LastDealVolume` | כמות עסקה אחרונה | `data.LastDealVolume` |
| 12 | `DailyTurnover` | כמות יומית | `data.DailyTurnover` |
| 13 | `DailyNISRevenue` | מחזור כספי | `data.DailyNISRevenue` |
| 14 | `LastDealTimeOnly` | עסקה אחרונה | `data.LastDealTimeOnly` |
| 15 | `serverAsOfDate` | זמן שרת | history row |

History rows preserve source values and use the same display formatter family as Current. The table does not invent derived values.

### B4. Ordering and initial page

V1 directly verifies:

- history is isolated to exactly one canonical SecurityId;
- newest history is returned first;
- initial page size is exactly **500** rows;
- a security with no history returns an empty successful page;
- `hasMore` tells the UI whether older data exists.

The persisted V1 ordering source is an index equivalent to:

```text
(securityId, collectedAtMs)
direction = newest first
```

MarketScope is not required to reproduce the IndexedDB index mechanism, but must preserve the product result: deterministic newest-first history for one SecurityId.

### B5. Continuation and equal timestamps

When more than 500 history rows exist, the first page returns an opaque continuation.

The continuation must identify the exact last delivered position strongly enough to distinguish multiple rows having the same timestamp.

V1 achieved this with both:

- index key: `[securityId, collectedAtMs]`;
- unique primary key: `[cycleId, securityId]`.

MarketScope may use a DuckDB keyset cursor rather than this exact token shape, but the observable guarantees are mandatory:

- loading the next page starts strictly after the last delivered row in the chosen newest-first ordering;
- no duplicate rows across pages;
- no skipped rows across pages;
- equal timestamps do not cause duplicate/skip;
- a continuation belongs to one SecurityId and cannot be reused for another.

The V1 direct test proves a 502-row security with equal timestamps exactly at the 500/501 boundary returns all 502 unique cycle IDs with no duplicate or skip.

### B6. Load More

When `hasMore` and a continuation are present, Detail shows an explicit "טען ישנים יותר" action.

On activation:

1. prevent concurrent older-page loads for the same Detail session;
2. disable the control and show loading feedback;
3. fetch the next older page for the same SecurityId;
4. append rows after already loaded rows;
5. update continuation/hasMore;
6. remove the control when no more history exists;
7. otherwise re-enable it for the next page.

On continuation failure:

- already rendered history remains intact;
- the action becomes retryable rather than clearing the Detail;
- V1 changes the action text to "נסה שוב לטעון ישנים יותר";
- technical failure is logged/diagnosable.

### B7. Empty, loading, error and not-found semantics

Loading:

- Current is hidden and Detail is shown immediately;
- explicit "טוען היסטוריה..." feedback is rendered;
- Viewer state remains `DETAIL` with the selected SecurityId.

Known security with zero history:

- Detail still renders the security summary;
- an explicit empty-history message is shown;
- no history table is fabricated.

Initial history read failure:

- renders an explicit localized history error in Detail;
- must not be rendered as empty history;
- does not corrupt authoritative Current/history data;
- technical error remains diagnosable.

Unknown canonical SecurityId in MarketScope:

- is distinct from "known security with zero history";
- returns an explicit not-found result/state;
- must not fabricate Current or history data.

V1 had no first-class UI path for a completely unknown/historical-only ID because entry came from Current. The clean MarketScope distinction above is required by the accepted historical-only continuity requirement.

### B8. Refresh while Detail is open

A commit/change hint causes an authoritative reread. If the user is in Detail:

- Viewer remains in `DETAIL`;
- selected SecurityId remains selected;
- Current summary values refresh from authoritative Current data when the security is still current;
- history is reread from the newest row downward;
- newly committed history appears at the top;
- the previously loaded depth is preserved: if the user had loaded older pages, refresh reloads enough pages to keep at least that depth when the data exists;
- no provider call is made by Viewer refresh.

V1 directly proves a Detail that had loaded all 502 historical rows receives a new cycle and refreshes to 503 rows while remaining in Detail.

MarketScope adaptation for a historical-only selected security:

- refresh must not fail merely because the security is absent from Current;
- it rereads security metadata/history by canonical ID;
- Current-only summary remains unavailable if no Current row exists.

This deliberately fixes a V1 coupling where `refreshFromModel` threw when the selected security disappeared from the refreshed Current model.

### B9. Back to Current

The explicit "← חזרה לטבלה" action:

- shows Current;
- hides Detail;
- clears the active Detail session;
- returns Viewer state to `MAIN`;
- restores the Current status context;
- preserves the selected Current sort;
- restores the captured Current viewport.

Direct V1 Chromium evidence proves:

- sort survives Current → Detail → live refresh → Back;
- horizontal Current scroll is restored exactly after the round-trip.

The V1 implementation captures both `scrollLeft` and `scrollTop`; MarketScope E2E coverage targets the relevant observable viewport axes without preserving the V1 DOM mechanism.

### B10. Provider prohibition and authority migration

Detail/History is a consumer of committed local authority only.

It must not:

- call MapHeat2;
- call GetSecuritiesData;
- trigger recorder collection;
- treat notification payloads as authoritative rows.

V1 reads IndexedDB. MarketScope must instead use trusted localhost Node/DuckDB reads while preserving the observable behavior above.

### B11. Evidence provenance

Primary evidence:

- `viewer/history-data.js`;
- `viewer/security-detail.js`;
- `viewer/current-table.js` for shared viewport/format behavior;
- `viewer/live-refresh.js`;
- `storage/schema.js`;
- `storage/read.js` only for pagination/continuation semantics;
- `storage/pure/persistence-records.js` only for history-row identity/shape;
- `specs/viewer.spec.md`;
- `tests/automation/specs/viewer-history-data.spec.js`;
- `tests/automation/specs/viewer-security-detail.spec.js`;
- durable `docs/product/local-history-viewer-v2-product-shape.md` for historical-only continuity;
- D-043 for the preserved three-surface product boundary.

Direct executable evidence verifies page size 500, newest-first isolation, empty history, equal-timestamp no-duplicate/no-skip continuation, keyboard/mouse entry, summary values, Load More, live Detail refresh, loaded-depth preservation, Back, Current sort preservation and horizontal scroll restoration.

## Surface C — Dynamic SQL Scanner

Scanner is a third first-class surface over trusted committed Node/DuckDB data.

### C1. User controls

The user controls:

- SQL text;
- a repeat interval;
- explicit `Activate`.

The repeat interval must represent a positive duration and the UI must label its unit unambiguously. Storage/transport units are technical details.

### C1a. Saved Query Library

The Scanner includes a persistent library of reusable query configurations.

A user-saved entry has, at minimum:

- stable internal identity;
- non-empty user-visible name;
- SQL text;
- positive repeat interval.

Observable operations:

```text
Create
→ save current draft as a new named user query

Read/select
→ list saved queries
→ choose one
→ load its SQL + interval into the editable draft
→ do not Activate automatically

Update
→ explicitly save draft changes back to the selected user query
→ allow rename

Delete
→ explicitly remove the selected user query
→ do not alter an already-active Scanner generation merely because its saved source was deleted
```

Saved user queries survive ordinary Viewer/browser/service restarts. Draft edits remain separate from persisted values until an explicit save/update action.

Names must be usable for human selection; exact uniqueness/collision behavior belongs to the technical contract and must produce an explicit user-visible validation result rather than silently overwriting another query.

### C1b. Built-in examples

MarketScope ships a small built-in query set that is distinguishable from user-saved queries.

Built-ins:

- remain available after restart/reset of user query preferences unless the whole product/data environment is intentionally reset under its normal reset contract;
- cannot be destructively updated or deleted;
- can be loaded as drafts;
- can be copied/saved as a new user query and then edited normally.

Required initial examples include:

1. **All current fields** — a visible bounded `SELECT * FROM latest ... LIMIT ...`-style query intended for discovery of available latest-row data.
2. **Practical analytical example** — a useful ranking/filtering example over canonical Scanner fields that demonstrates real analytical composition without inventing unsupported market semantics.

The exact example SQL is frozen with the SQL guide/technical schema so examples cannot silently drift from the executable public schema.

### C1c. AI-friendly SQL authoring guide

The repository/product documentation owns one canonical Scanner SQL guide suitable for direct use with an AI assistant.

A user should be able to provide that guide (or the relevant compact section) and ask for a new query without reading implementation source.

The guide must include:

- every public Scanner table and its public columns;
- canonical identity/join guidance;
- field meaning/source where known and explicit Unknown where semantics are not verified;
- `null`/zero/missing distinctions that matter to SQL;
- supported analytical constructs and prohibited Scanner operations;
- practical bounded examples;
- how Scanner result `securityId` enables Detail navigation;
- performance guidance such as deliberate `WHERE`/time bounds/`LIMIT` where appropriate;
- a copyable prompt template for asking AI to generate or modify a query;
- a maintenance/version note tying the guide and built-in examples to the current Scanner schema contract.

Any change to public Scanner schema/semantics must update the guide and affected built-ins/tests in the same coherent work unit.

### C2. Activation and active draft semantics

```text
Activate
→ adopt the current SQL + interval as the active configuration
→ execute immediately
→ wait for completion
→ wait the configured interval
→ execute again
```

Rules:

- one active Scanner configuration is sufficient;
- edits after activation are drafts and do not alter the active run until the next Activate;
- activating a replacement configuration advances to the new generation/configuration;
- at most one Scanner execution is active;
- no overlapping execution;
- no catch-up burst when one execution or the browser is delayed;
- Scanner cadence is independent from collector cadence.

### C3. Result semantics

On success:

- display exactly the result columns returned by SQL;
- preserve returned column order;
- preserve returned row order;
- zero rows is a successful empty result;
- the Scanner UI adds no hidden ranking, sort, filter or LIMIT.

The user controls analytical ordering/filtering through SQL.

### C4. Query error

A rejected or failed query:

- is visibly reported as an error for the active Scanner run;
- does not replace the error with successful empty output;
- does not mutate committed market authority;
- does not make the collector fail merely because an analytical query failed.

Exact admission/security rules are owned by the Technical Spec/Test Strategy.

### C5. Required analytical capability

The intended supported read-only analytical use includes:

- `SELECT`;
- `JOIN`;
- `WHERE`;
- `GROUP BY`;
- `HAVING`;
- `ORDER BY`;
- `LIMIT`;
- window functions;
- predicates over historical time/data;
- cross-security comparisons/ranking.

This is an analytical capability requirement, not permission to execute mutating or side-effecting SQL.

### C6. Detail navigation

When a Scanner result exposes a canonical SecurityId in the product-recognized result shape, the corresponding row may open the same Security Detail / History surface used by Current.

Navigation must not create a second Detail implementation.

## Product-wide operational behavior

### D1. Trusted-read rule

Current, Detail/History, operational diagnostics and Scanner results are derived from trusted Node/DuckDB authority after cutover.

Viewer/Scanner read paths never call the market-data provider.

### D2. Notifications are hints

Any browser-side refresh notification is metadata-only.

```text
hint received
→ reread trusted authority
```

A missed notification does not lose committed data. Manual refresh/reopen recovers from authority.

### D3. Producer/viewer ownership

The initial product model is:

- one active producer/collector;
- multiple read-only viewers are allowed;
- a second producer ownership attempt is rejected or otherwise made explicitly non-authoritative;
- opening/reloading additional viewers must not silently create additional producers;
- closing a Viewer does not stop an active producer;
- a Viewer opened/reopened while the producer is stopped still reads the last committed Node authority;
- Viewer recovery does not depend on provider availability or opener-memory state.

Exact connection/session mechanics belong to Technical Spec.

### D4. Local service unavailable or disconnected

At launch, if the localhost authority is unavailable:

- show a clear service-unavailable/error state;
- do not claim collection is running successfully;
- do not fabricate Current/history/Scanner results.

If service/transport is lost during use:

- outstanding authority-dependent operations fail visibly;
- producer collection stops/fails closed;
- no offline market-state queue is treated as authority;
- already committed state remains safe;
- recovery requires explicit product relaunch/restart after the service is available.

### D5. Node restart

A normal Node restart:

- preserves previously committed universe/current/history;
- recovers stale previously-running session state so it is not shown as actively running;
- makes reads available only after the service is ready;
- does not require provider replay to read already committed history.

Exact startup/schema/session recovery mechanics belong to Technical Spec.

### D6. Fake Market mode

The product has one canonical local Fake Market mode that exercises the normal runtime path.

Observable expectations:

- one local provider page URL;
- no provider login;
- no DevTools/manual request interception;
- deterministic synthetic moving market;
- Current/Detail/Scanner behave as normal product surfaces;
- restarting the demo service preserves demo history;
- an explicit reset clears demo-only state and cannot touch production state.

Server/process/package details belong to Technical Spec/Test Strategy.

### D7. Failure localization and support snapshot

MarketScope failures must be observable as a **specific failing boundary**, not only as a generic error state.

For a diagnosable operation the observable diagnostic model includes, when applicable:

- product version;
- timestamp;
- owning component;
- current operation;
- stable checkpoint/stage ID;
- last successful checkpoint/stage ID;
- stable error code when failed;
- sanitized technical error name/message;
- compact relevant state such as service/runtime health, producer state, last committed cycle identity/time and aggregate counts when known.

The exact internal representation belongs to Technical Spec, but the user-facing behavior is fixed:

- visible failure wording may be localized/friendly, but the specific technical code/checkpoint remains available;
- a failure must not be reported only as "something went wrong" when the system knows the failing boundary;
- wrapping an error must preserve the useful causal failure rather than erase it;
- a bounded copyable **Support Snapshot** is available from the normal product when Viewer/runtime state exists;
- a fatal startup/launcher failure emits the same essential component/checkpoint/code/cause information through the local command output when the UI cannot be opened;
- the snapshot is diagnostic evidence only and is never treated as market authority;
- the snapshot contains no credentials, cookies, authorization/session data, account identifiers, private browser state or raw authenticated/provider payloads.

The initial checkpoint coverage must make these boundaries distinguishable:

```text
browser runtime loaded
→ localhost service reachable / hello accepted
→ database + schema ready
→ producer ownership/session established
→ universe/provider acquisition accepted
→ complete cycle collected
→ durable cycle COMMIT acknowledged
→ trusted Current/Detail read succeeds
→ Scanner execution succeeds
```

A failure between two checkpoints reports both the last successful checkpoint and the failed checkpoint. This is the primary troubleshooting boundary a user should paste into a maintenance report.

## Required end-to-end product flows

### Flow 1 — Start daily collection

Precondition: authenticated provider page in production, or canonical Fake Market page in demo; local Node authority is ready.

Observable flow:

```text
start/launch collection runtime
→ establish producer session
→ obtain/acknowledge validated universe
→ start first complete-cycle collection without waiting for a full interval
→ successful Node commit
→ health/current diagnostics reflect committed progress
```

If provider validation or Node commit fails, no new Current/history authority appears.

The exact production launch UI/mechanism is decided by Technical Spec/package planning; the product outcome above is mandatory.

### Flow 2 — Browse Current Universe

```text
open Viewer
→ explicit loading
→ authoritative Current read
→ MAIN with deterministic table
   or EMPTY
   or explicit ERROR
```

The user can sort, refresh and inspect operational health without causing provider calls.

### Flow 3 — Current → Detail → Load More → Back

```text
activate Current security
→ Detail loading
→ current summary + newest history page
→ Load More older pages
→ optional live refresh while remaining in Detail
→ Back
→ Current sort/viewport restored
```

### Flow 4 — Persisted historical-only security

```text
open canonical SecurityId that is known in persisted history but absent from Current
→ Detail opens
→ history remains readable
→ current-only values remain unavailable
→ no historical row is mislabeled as Current
```

Completely unknown SecurityId remains distinct and returns explicit not-found behavior.

### Flow 5 — Scanner

```text
enter SQL + positive interval
→ Activate
→ immediate trusted execution
→ exact result grid
→ wait after completion
→ repeat
```

Zero rows is successful empty. Errors are visible. No overlap/catch-up occurs. A recognized canonical SecurityId can navigate to shared Detail.

### Flow 6 — Node/service failure and recovery

```text
service unavailable/disconnect
→ visible failure
→ pending authority operations fail
→ producer stops/fails closed
→ no offline authoritative queue
→ service restored
→ explicit relaunch
→ authoritative reads resume from committed state
```

### Flow 7 — Complete product against Fake Market

```text
launch canonical local demo
→ fake provider page loads normal browser runtime
→ universe + several deterministic cycles
→ Node/DuckDB commits
→ Current
→ Detail/History
→ Back
→ Scanner
→ optional SecurityId navigation
```

The same product logic is used rather than a separate demo implementation.

### Flow 8 — Restart Node and preserve committed history

```text
commit several cycles
→ stop/restart Node
→ recover DB/schema/session state
→ report ready
→ Current/history remain readable
→ stale prior running session is not reported as running
→ new producer session can start explicitly
```

## Product-spec completeness boundary

This document owns the observable product contract for:

- Current;
- Detail/History;
- operational diagnostics;
- Scanner;
- service failure/recovery;
- Fake Market product mode;
- restart/persistence behavior;
- the eight mandatory end-to-end flows.

Technical mechanisms and proof design belong to `TECHNICAL_SPEC.md` and `TEST_STRATEGY.md`. Any later implementation or planning correction that changes observable behavior must update this Product Spec deliberately rather than changing behavior silently.

