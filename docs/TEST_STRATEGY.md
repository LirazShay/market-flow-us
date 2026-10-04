# MarketScope Test Strategy

## Ownership

This document owns **how MarketScope proves its contracts** and the canonical Fake Market / demo verification model.

For every layer it states:

- what the layer proves;
- what it deliberately does **not** prove;
- which scenarios belong there;
- which CI/manual gate owns it.

The commands, scenarios and workflows below are durable verification contracts. Current implementation/verification status belongs only in `STATUS.yaml`.

---

## 1. Core principles

### 1.1 Testing is part of implementation

For each implementation leaf:

```text
public/observable contract
→ cheapest meaningful proof
→ intended red first when practical
→ implementation
→ targeted green
→ required broader verification
→ only then close the leaf
```

### 1.2 Public behavior over internals

Prefer assertions against:

- protocol requests/responses;
- persisted/committed effects;
- trusted read results;
- browser UI/state;
- deterministic Fake Market call/state observations;
- documented schema/transaction invariants.

Do not make tests fragile by asserting private helper structure merely because it is easy.

A test-only setup/fault-injection seam is permitted where no public input can deterministically create the required failure. Assertions still target observable response and durable state.

### 1.3 Cheapest valid layer

```text
pure deterministic rule
→ Unit

service + WebSocket + real DuckDB behavior
→ Service Integration

browser/process/end-to-end wiring
→ Chromium E2E

human usability of the same local stack
→ Manual Demo

scale/performance evidence
→ Workload

authenticated external-provider facts
→ Real Provider
```

Do not use E2E to prove a pure comparator. Do not use unit tests to claim transaction durability.

### 1.4 Changed-test gate

Any added/modified test must run in its actual layer before the work can progress.

Browser test changes:

```text
new/changed exact Playwright test
→ run exact target
→ intended red if TDD
→ implementation
→ exact target green
→ broaden as required
```

Expected TDD red is not an incident.

Unexpected red blocks progression and requires diagnosis before moving on.

### 1.5 Product-code browser gate

Every final product-code change that can affect Browser↔Node product behavior receives Chromium E2E verification on that final code state.

The implementation plan may use targeted Chromium during the local red/green loop, but the full Browser CI suite is the merge/leaf-closure gate for product-code changes.

Documentation-only planning changes do not require Browser CI.

---

# 2. npm verification commands

Implementation test tooling is deliberately minimal: Node's built-in `node:test` runner owns unit/service/workload tests, and `@playwright/test` with Chromium owns browser E2E. Package versions are pinned in the implementation lockfile.

The root package exposes:

```text
npm run test:unit
npm run test:service
npm run test:fast
npm run test:e2e
npm run test:workload

npm run demo:fake-market
npm run demo:reset
```

Contract:

```text
test:fast
= unit + real service integration
```

Planning/docs structural guards remain a GitHub workflow concern. Fast CI runs `.planning/verify-handoff.mjs` for executor-handoff invariants.

No separate test implementation should exist solely for the manual demo.

---

# 3. Layer 1 — Unit tests

## 3.1 What Unit proves

Fast deterministic behavior with no real socket/DB/browser requirement.

Required areas:

### Provider / Data

- MapHeat response structure parsing;
- dynamic recordCount validation;
- PaperId canonicalization;
- Key canonicalization;
- duplicate/missing/unexpected accounting;
- requested/received/unique counters;
- response-order independence;
- chunk planning/remainder;
- cycle validation;
- raw zero/null/empty/missing preservation;
- timing validation.

### Protocol

- envelope validation;
- protocol version validation;
- requestId/type/payload validation;
- per-operation payload validation;
- safe response/error shaping;
- role→operation admission logic.

### Current / Detail

- Current join/model;
- exact 16-column contract where represented as pure data;
- deterministic sorting/tie-breakers;
- missing-value ordering;
- formatting logic;
- viewer state transitions where pure;
- history cursor encode/decode/validation;
- keyset continuation predicate/result slicing logic;
- historical-only model shaping.

### Scanner

- browser scheduler generation logic;
- positive interval validation;
- activate/draft semantics;
- no-overlap/no-catch-up state transitions;
- saved-query name normalization and collision keys;
- built-in/user library merge and deterministic ordering;
- built-in read-only flags and Save-As semantics;
- library selection changes draft only and never active generation;
- SQL function-call lexical extraction helper;
- admission decision helper given parsed statement/function metadata;
- result metadata/row shaping preserving duplicate column names/order.

### Browser build/runtime delivery

- deterministic browser bundle generation;
- bookmarklet begins with `javascript:`;
- one-line bookmarklet packaging;
- no whole-runtime percent-encoding inflation;
- no arbitrary absolute bookmarklet size ceiling;
- runtime/bookmarklet derive from the same source graph;
- repeated launch state machine does not create an in-page second producer.

### Diagnosability

Unit tests prove the pure diagnostic contract:

- stable component/checkpoint registry has no duplicate IDs;
- DiagnosticRecord shaping is deterministic and JSON-safe;
- process-local ring retains at most 32 records and drops oldest first;
- last-success / failed-checkpoint relationship is preserved;
- known machine error code survives wrapping;
- safe opaque protocol requestId can correlate Browser/Node evidence, while an unsafe/free-text requestId is replaced by a local safe alias and never leaked;
- sanitization rejects/removes forbidden raw fields rather than copying arbitrary objects;
- copied snapshot never includes Current/history/Scanner result rows or Scanner SQL text;
- snapshot remains constructible when Node evidence is unavailable;
- CLI diagnostic formatter emits one `MARKETSCOPE_DIAGNOSTIC` JSON line and no stack by default.

### Fake Market

- deterministic synthetic cycle generation;
- logical-cycle advancement;
- scenario state transitions;
- reset;
- endpoint payload construction;
- query-membership matching.

## 3.2 What Unit does not prove

Unit tests do **not** prove:

- actual `ws` upgrade/origin behavior;
- real DuckDB SQL/transactions/recovery;
- actual Node Neo statement metadata;
- browser fetch/WebSocket/DOM behavior;
- Fake Market HTTP routing;
- current authenticated provider behavior.

Those claims belong to later layers.

---

# 4. Layer 2 — Real Service Integration

## 4.1 Topology

Every service integration test uses:

```text
real MarketScope Node service
+ real ws client/socket
+ real temporary native DuckDB file
```

Do not mock DuckDB.

Each test gets an isolated temp directory and DB path.

The service binds an ephemeral loopback port unless a fixed port is specifically part of the test.

## 4.2 What Service Integration proves

### Startup/schema

- fresh DB bootstrap creates current schema v2;
- all seven required tables exist;
- valid schema-v1 DB migrates transactionally to v2 before readiness;
- reopening schema v2 succeeds without reapplying migration;
- unsupported/invalid schema version fails closed with `DB_SCHEMA_UNSUPPORTED`;
- service reports ready only after DB/schema recovery/migration;
- stale `running` session becomes `interrupted` on restart;
- committed market state and saved-query configuration survive reopen.

### WebSocket/security/protocol

- correct allowed Origin upgrades;
- missing Origin rejected;
- wrong Origin rejected;
- oversized frame/message rejected;
- malformed JSON rejected;
- invalid envelope/version rejected;
- requestId correlation;
- first message must be hello;
- role violations rejected;
- one producer accepted;
- second producer rejected;
- multiple viewers accepted;
- socket close/session interruption;
- stale heartbeat handling.

### Session/universe

- start/duplicate-start/stop lifecycle;
- sanitized config persistence;
- universe replace persists all records/raw JSON;
- previous catalog metadata remains for inactive/historical-only securities;
- exact current-universe count;
- universeRevision increments;
- invalid universe rollback/no ACK.

### Successful cycle

- exact membership revalidation;
- universeRevision mismatch rejected;
- cycle ID allocated by Node;
- cycle row committed;
- history appended once per security;
- latest replaced as whole;
- session counters updated;
- ACK only after COMMIT;
- subsequent trusted reads observe the new committed state;
- after N successful cycles, exact history count grows as expected and remains unchanged across reopen/restart when no explicit delete operation occurred;
- no automatic retention/cleanup silently removes committed production history.

### Failed cycle

- failure diagnostic row/counters persisted;
- nullable counters stay NULL when unknown;
- session failed count advances;
- latest unchanged;
- history unchanged.

### Transaction rollback fault matrix

Use a **test-only persistence fault seam** available only to service integration construction/configuration, never through production WebSocket protocol.

Inject one throw at each meaningful successful-cycle transaction boundary:

```text
F1 after cycles row insert
F2 after partial history insert
F3 after DELETE latest
F4 after partial latest insert
F5 after session update, before COMMIT
```

For every F1..F5 assert after failure/reopen:

- no complete cycle row survived;
- no new history survived;
- previous latest is byte/logically unchanged;
- session completed count/last cycle unchanged;
- no success ACK was sent.

Universe transaction fault matrix:

```text
U1 after marking old universe inactive
U2 after partial incoming upsert
U3 before COMMIT
```

Assert previous universeRevision/current membership remains authoritative.

The seam creates failures; the proof is the public/durable outcome, not the seam's internals.

### Trusted reads

- Current starts from latest and LEFT JOINs metadata;
- missing metadata does not drop latest row;
- Current summary values;
- security lookup current;
- historical-only security lookup;
- completely unknown security;
- history newest-first;
- page size 500;
- >500 continuation;
- equal timestamps around boundary;
- invalid cursor;
- cursor for wrong SecurityId;
- no duplicate/skip across all pages;
- status metrics/health precedence.

### Scanner real DuckDB behavior

Prove against the pinned DuckDB build:

Allowed examples:

- simple SELECT;
- JOIN latest/history/universe;
- WHERE;
- GROUP BY + HAVING;
- ORDER BY + LIMIT;
- window/rank;
- time/history predicate;
- zero rows;
- duplicate result column names/order.

Rejected examples:

- empty SQL;
- multiple statements;
- INSERT/UPDATE/DELETE;
- CREATE/DROP/ALTER;
- parameterized statement;
- `query(...)`;
- `query_table(...)`;
- representative current `has_side_effects=true` function invocation.

### Saved Query Library persistence and migration

Prove against real temporary DuckDB:

- fresh bootstrap creates schema v2 with `scanner_saved_queries`;
- an existing valid schema-v1 DB migrates once to v2 without changing existing sessions/universe/cycles/history/latest facts;
- reopen of v2 does not rerun/destructively duplicate migration;
- unsupported/invalid schemas still fail closed;
- create/list/update/rename/delete persist across service restart;
- normalized duplicate names, including built-in-name collisions, fail with `SCANNER_QUERY_NAME_CONFLICT`;
- built-in update/delete fails with `SCANNER_QUERY_READ_ONLY`;
- unknown user IDs return `NOT_FOUND`;
- saved invalid SQL text may remain a saved draft, but Activate still passes through normal Scanner admission and reports the execution/admission error;
- CRUD failure leaves market authority unchanged;
- user query CRUD never changes an already-active Browser Scanner generation.

### Built-in queries and SQL-guide synchronization

Automated proof must:

1. execute every built-in through the real Scanner admission/execution path;
2. assert the broad built-in is bounded and exposes the real `latest` row schema;
3. assert the ranking example returns the canonical `securityId` result shape when fixtures contain rows;
4. create a fresh current-schema DB and read `information_schema.columns` for every public Scanner table;
5. verify `docs/SCANNER_SQL_GUIDE.md` documents every public table/column;
6. verify built-in IDs/names/SQL/intervals are represented in the guide;
7. verify the guide states supported/rejected SQL, identity/join guidance, null semantics, bounding guidance and an AI prompt template.

A schema or built-in change that leaves the guide stale must fail Fast CI.

### Scanner non-mutation snapshot

For every rejected hostile-to-authority sample:

1. capture schema/table counts and durable authority fingerprint;
2. attempt Scanner execution;
3. assert rejection;
4. recapture;
5. assert unchanged:

```text
schema
sessions
universe
cycles
history
latest
```

### Shutdown

- graceful shutdown stops upgrades;
- active producer session becomes interrupted unless cleanly stopped;
- current writer operation drains;
- DB reopens cleanly.

## 4.3 What Service Integration does not prove

It does not prove:

- browser CORS/fetch behavior;
- browser WebSocket API;
- DOM/UI;
- BroadcastChannel hint behavior;
- runtime bundle/bookmarklet;
- real HTTP Fake Market;
- real provider CSP/LNA/session behavior.

---

# 5. Canonical Fake Market contract

## 5.1 One fake, not multiple mocks

There is one reusable fake provider implementation under:

```text
tests/fake-market/
```

It powers:

- Chromium E2E;
- local manual demo;
- focused provider-adapter integration scenarios.

The old Playwright `page.route` mock helper is **not** the main fake.

## 5.2 Real HTTP routes

Required:

```text
GET /
GET /assets/market-scope.runtime.js
GET /lti/lti-app/api/MarketFast/MapHeat2
GET /lti/lti-app/api/SecuritiesFast/GetSecuritiesData
```

Test-control namespace:

```text
POST /_market-scope-test/reset
POST /_market-scope-test/scenario
GET  /_market-scope-test/state
```

These controls exist only in the fake server, bind loopback, and never ship as provider production endpoints.

## 5.3 Default deterministic market

Use four synthetic securities:

```text
1001 Fixture Alpha
1002 Fixture Beta
1003 Fixture Gamma
1004 Fixture Delta
```

Keep the old sanitized identities/names where useful, but extend data to cover the full Product Spec.

Each logical cycle deterministically changes selected market fields.

Required data diversity:

- positive values;
- negative daily-change values;
- explicit numeric zero;
- explicit null;
- missing optional property;
- stable paper names;
- changing Last/BID/ASK/deal counts;
- deterministic serverAsOfDate;
- enough fields to populate Current/Detail/Scanner typed projections.

No randomness.

No wall-clock-dependent market values.

Tests may use a fake clock or deterministic timestamps.

## 5.4 Complete logical-cycle advancement

The fake must not increment the synthetic market after every chunk request.

State:

```text
logicalCycleIndex
servedSecurityIdsForCurrentCycle
currentUniverse
scenario
requestLog
```

For a normal cycle:

1. first GetSecuritiesData chunk reads values for `logicalCycleIndex=N`;
2. every subsequent disjoint chunk for that same full universe also reads cycle N;
3. add returned requested IDs to `servedSecurityIdsForCurrentCycle`;
4. only when the set equals the current universe exactly:
   - clear the served set;
   - increment logicalCycleIndex to N+1.

This makes all chunks of one Browser cycle observe one deterministic synthetic logical market state while still preserving per-chunk timing.

A failed scenario does not silently advance to the next logical cycle unless that scenario explicitly defines the transition.

## 5.5 MapHeat behavior

The fake implements the real two-step shape:

```text
pageCount=1
→ recordCount + one record

pageCount=recordCount
→ complete records
```

It validates relevant query parameters sufficiently to catch accidental adapter drift.

## 5.6 GetSecuritiesData behavior

The fake:

- parses `securityIds`;
- returns exactly matching configured securities in normal mode;
- can intentionally return a different response order;
- records concurrent request count;
- exposes max concurrency through test state;
- returns one deterministic AsOfDate per logical cycle.

This allows E2E proof that Browser collection remains sequential without mocking fetch.

---

# 6. Fake Market scenario matrix

The canonical server supports named scenarios. One scenario implementation may parameterize several assertions; scenario names are stable test fixtures, not product API.

## FM-01 normal-moving

Purpose:

- default demo/happy path;
- four securities;
- deterministic moving values/history;
- response order intentionally differs from requested order at least once.

## FM-02 zero-null-missing

Purpose:

- explicit zero;
- explicit null;
- missing optional fields;
- validate display/raw fidelity.

May be part of default FM-01 data rather than a separate server mode; the test label still owns the assertion.

## FM-03 universe-duplicate-id

MapHeat contains duplicate canonical PaperId.

Expected: universe validation fails; no universe ACK/current cycle.

## FM-04 universe-missing-id

MapHeat record missing/empty PaperId.

Expected: fail closed.

## FM-05 universe-count-mismatch

Count request/full request disagree or full list length disagrees.

Expected: fail closed.

## FM-06 mapheat-http-error

Return deterministic non-2xx.

Expected: provider failure; no authoritative advance.

## FM-07 mapheat-invalid-json-or-shape

Malformed/invalid body.

Expected: explicit failure.

## FM-08 securities-http-error

A configured chunk fails.

Expected:

- remaining chunks are not fetched for that Browser cycle;
- failed cycle report when service remains reachable;
- prior authority unchanged.

## FM-09 securities-invalid-shape

Expected: no complete cycle.

## FM-10 securities-missing-id

A requested security is absent.

Expected: no complete cycle.

## FM-11 securities-duplicate-key

Duplicate canonical Key.

Expected: no complete cycle.

## FM-12 securities-unexpected-key

Unrequested Key appears.

Expected: no complete cycle.

## FM-13 delayed-chunks

Deterministic response delay.

Proves:

- max active provider-security requests = 1;
- Recorder cycles do not overlap;
- no catch-up burst.

## FM-14 universe-change-historical-only

After a controlled number of committed cycles:

```text
remove 1004 from current universe
→ later complete cycles contain 1001..1003
```

Expected:

- Current no longer contains 1004 after the new-universe cycle commits;
- Detail for 1004 remains readable from persisted history;
- currentRow unavailable;
- paper metadata remains if previously known.

## FM-15 changing-values

Several deterministic cycles change fields enough to prove:

- Current refresh;
- history growth/newest-first;
- Scanner current/history query changes;
- diagnostics completed-cycle count.

## FM-16 provider-call-contract

Fake request log asserts:

- exact endpoint paths;
- MapHeat count/full call pattern;
- expected GetSecuritiesData query parameters;
- no Viewer/Scanner provider calls.

---

# 7. Layer 3 — Chromium E2E

## 7.1 Topology

Each main E2E uses:

```text
real Fake Market HTTP server
+ normal built browser runtime
+ Chromium
+ real browser fetch
+ native browser WebSocket
+ real MarketScope Node service
+ real temporary DuckDB
+ real Viewer
+ real Scanner
```

Main happy-path/provider-flow tests must not use `page.route`.

## 7.2 Canonical E2E flows

### E2E-01 Full happy path

```text
Fake page
→ producer session
→ universe
→ >=2 committed cycles
→ Current
→ sort
→ Detail
→ history
→ Back
→ Scanner query
→ result SecurityId
→ shared Detail
```

Assert persisted counts through trusted reads/Scanner where practical.

### E2E-02 Current fidelity/diagnostics

Using zero/null/missing synthetic data:

- exact Current rows/columns;
- formatting;
- operational health/last cycle/counts;
- manual refresh;
- no provider calls caused by Viewer refresh.

### E2E-03 Detail pagination and state preservation

Seed >500 history rows cheaply through the fake/service setup appropriate to the test, then:

- initial 500;
- Load More;
- equal timestamp boundary;
- Back;
- Current sort/scroll preserved.

The browser part proves UI behavior; service integration owns the deep cursor correctness matrix.

### E2E-04 Historical-only security

Use FM-14 and prove the full browser product behavior.

### E2E-05 Scanner schedule

Use a deliberately delayed Scanner query or test-controlled execution latency to prove:

- immediate activation;
- no overlap;
- wait-after-completion interval;
- no catch-up burst;
- draft change inactive until re-Activate;
- zero-row success;
- visible query error.

### E2E-05a Saved Query Library

Against the normal built Scanner UI:

- built-ins appear in deterministic source order and are visibly non-destructive/read-only;
- selecting a built-in loads SQL + interval into the draft and does not execute;
- Save As creates a user query;
- create a second named user query and select between them;
- edit SQL/interval/name and Save; reopen Viewer and prove persistence;
- rename remains selectable by the new name;
- duplicate normalized name shows explicit conflict and does not overwrite;
- Delete removes only the chosen user query;
- built-in delete/update cannot be performed;
- while one Scanner generation is active, selecting/editing/saving/deleting library entries does not change that active generation until Activate;
- a copied built-in can be activated and follows normal Scanner result/error semantics.

### E2E-06 No service at launch

Fake provider page is reachable; local service is absent.

Assert visible service-unavailable state and no false running/commit success.

### E2E-07 Service disconnect and explicit relaunch

During active operation:

- terminate service;
- pending operation fails;
- producer stops/fails closed;
- no offline authoritative queue;
- restart service;
- explicit browser runtime relaunch;
- previous committed state visible;
- new session/cycles resume.

### E2E-08 Multiple viewers / producer independence

Open multiple same-origin Viewer windows/tabs.

Assert:

- all viewers read the same committed Node authority and can independently refresh/navigate;
- closing one or all Viewer windows does not stop the active producer;
- reopening a Viewer reconstructs from Node authority;
- if the producer is explicitly stopped while Node remains ready, the Viewer continues to show/read the last committed Current/history without provider access.

### E2E-09 Second producer rejection

A second provider runtime/page attempts producer hello.

Assert explicit rejection and first producer remains authoritative.

### E2E-10 Browser reload

Reload/replace provider runtime while committed data exists.

Assert stale producer session is interrupted/replaced only through explicit valid ownership and data remains.

### E2E-11 Lost notification fallback

Suppress/drop BroadcastChannel hint only.

Assert manual refresh/reopen still reads latest committed Node state.

### E2E-12 Node restart persistence

Commit data, restart Node against same temp DB, reconnect/relaunch and prove Current/history survive.

Service integration owns detailed recovery internals; E2E proves user-visible wiring.

## 7.3 Focused interception allowance

`page.route` may still be used for a **narrow malformed-browser-input proof** when reproducing it through the canonical fake would add disproportionate machinery.

Such a test must not be cited as proof of the main provider→Browser→Node happy path.

## 7.4 Browser failure diagnostics

Playwright config/CI retains on failure:

- trace;
- screenshot;
- HTML report;
- test-result artifacts;
- sanitized Fake Market request/state log;
- sanitized local-service log.

Do not upload DuckDB containing sensitive real data. CI uses synthetic temp DBs only.

## 7.5 Product Support Snapshot on failure

In addition to normal Playwright trace/screenshot/report artifacts, Browser CI should attempt to capture the product's own sanitized Support Snapshot when a failure occurs after enough runtime has started to produce one.

Rules:

- capture through the normal diagnostic contract, not by scraping private JS internals;
- attach as JSON;
- absence is itself explained when failure occurs before snapshot capability exists;
- never make diagnostic-artifact capture hide/replace the original test failure;
- sanitize before attachment;
- CI artifacts must remain safe for a public repository.

## 7.6 What Chromium E2E does not prove

It does not prove:

- authenticated provider response stability;
- real provider CSP/LNA behavior;
- exchange timing/availability;
- Windows/local machine environment outside CI's tested platform;
- performance at 561×hundreds scale.

---

# 8. Layer 4 — Local Manual Demo

## 8.1 Same infrastructure

`npm run demo:fake-market` uses:

- same browser build;
- same Fake Market implementation;
- same local-service modules;
- same DuckDB schema;
- same UI.

No manual-demo fork.

## 8.2 Manual smoke

The human smoke is intentionally short:

1. start demo command;
2. open printed URL;
3. observe Current changing after committed cycles;
4. open Detail and history;
5. run one Scanner query;
6. stop/restart demo and confirm history persists;
7. run explicit reset only when desired.

The automated E2E remains the correctness authority; manual demo proves usability/startability, not hidden correctness.

## 8.3 Reset safety

Automated test for `demo:reset` must prove:

- deletes demo DB/state;
- refuses path escape;
- leaves production `data/` sentinel/file untouched.

## 8.4 Diagnostic smoke

Manual demo usability also includes one short supportability check:

1. open the normal Viewer diagnostics;
2. use the copy Support Snapshot action;
3. confirm the JSON is readable and identifies current health/checkpoint state;
4. if exercising a safe synthetic failure, confirm the failed checkpoint/code is visible without DevTools.

This manual smoke is not the correctness proof; DGN automated tests own the contract.


---

# 8A. Cross-cutting Diagnosability Verification

This layer proves the requirement that ordinary failures are **self-localizing**. It does not merely assert that an error is visible.

For every representative failure below, proof must assert:

```text
owning component
+ failed checkpoint
+ last successful checkpoint (when one exists)
+ stable error code
+ sanitized technical cause
```

The proof must also assert that forbidden private/raw data is absent.

## DGN-01 — Browser service unavailable / transport lost

Prove both service boundaries.

**Unavailable at launch:**

```text
component                = browser.runtime
lastSuccessfulCheckpoint = browser.runtime.loaded
checkpoint               = browser.service.hello
code                     = SERVICE_UNAVAILABLE (or the frozen equivalent stable code)
```

**Transport lost after successful operation:**

```text
component  = browser.runtime
checkpoint = browser.service.connection
code       = SERVICE_DISCONNECTED (or the frozen equivalent stable code)
```

The last successful checkpoint must show that the product progressed beyond initial hello before the disconnect (for example a later producer/read/commit checkpoint when one was reached).

In both cases Browser Support Snapshot remains copyable without live Node evidence, and no offline authority queue is invented.

## DGN-02 — Node startup boundary localization

Run two deterministic isolated startup cases; never corrupt a real production DB.

**DB/schema case:** use an invalid/unopenable isolated test DB target.

Expected checkpoint:

```text
component  = node.database
checkpoint = node.database.ready
```

**Service-listen case:** allow DB/schema readiness, then deterministically make the loopback listen step fail (for example by occupying the isolated test port).

Expected:

```text
component                = node.service
lastSuccessfulCheckpoint = node.database.ready
checkpoint               = node.service.ready
```

For both cases:

- nonzero startup/demo process result;
- stderr includes exactly one parseable `MARKETSCOPE_DIAGNOSTIC {...}` line for the fatal failure;
- stable startup error code + sanitized cause present;
- no stack, credential, cookie, account data, absolute path or raw DB/provider content in the public diagnostic line.

## DGN-03 — Producer ownership/session failure

Create a second producer while one is authoritative.

Expected:

- component/checkpoint identifies producer session establishment;
- existing `PRODUCER_ALREADY_ACTIVE` machine code is preserved;
- first producer remains authoritative;
- diagnostics do not falsely claim universe/cycle/commit checkpoints succeeded for the rejected producer.

## DGN-04 — Universe acquisition versus Node acceptance

Prove the two boundaries separately.

**Provider acquisition/validation failure:** use canonical Fake Market HTTP/shape/duplicate/missing/count-mismatch scenarios.

Expected failed checkpoint:

```text
provider.universe.collected
```

and `producer.universe.accepted` must not be reported successful.

**Node acceptance/persistence failure:** provide a valid collected universe and deterministically fail/reject the Node replace/commit boundary.

Expected:

```text
lastSuccessfulCheckpoint = provider.universe.collected
checkpoint               = producer.universe.accepted
```

Both cases preserve the specific existing provider/data/DB code or safe cause and never place raw provider payload in Support Snapshot.

## DGN-05 — Complete cycle persistence failure

Use the existing transaction fault seam at a representative pre-COMMIT boundary.

Expected:

```text
lastSuccessfulCheckpoint = provider.cycle.collected
checkpoint               = producer.cycle.committed
code                     = DB_ERROR or narrower frozen stable code
```

Also assert existing rollback authority guarantees remain unchanged.

## DGN-06 — Trusted Viewer read failure

Inject a deterministic service/read failure without provider calls.

Expected:

- `viewer.current.read` or `viewer.detail.read` identifies the exact failing read;
- visible UI remains explicit ERROR, not EMPTY;
- Support Snapshot carries the sanitized cause;
- committed authority remains unchanged.

## DGN-07 — Scanner execution and saved-query library failures

Use one rejected SQL case and one real DuckDB execution error case if both map to materially different stable codes.

Expected:

- rejected/execution SQL uses checkpoint = `scanner.execute`;
- injected saved-query list/create/update/delete persistence failure uses checkpoint = `scanner.query_library`;
- stable Scanner/protocol/query-library code is preserved;
- schema-v1→v2 migration failure remains `node.database.ready`;
- Scanner/query-library failure does not mark producer/collector failed;
- SQL text, saved SQL and result rows are absent from the Support Snapshot.

## DGN-08 — Demo startup boundary

For the real `npm run demo:fake-market` command, prove representative startup boundaries rather than one generic demo failure:

- browser build failure → `demo.runtime.built`;
- Fake Market listen failure → `demo.fake_market.ready`;
- Node DB/listen failure preserves the underlying `node.database.ready` / `node.service.ready` cause while the outer demo operation has not reached `demo.stack.ready`.

Expected:

- success path still prints one useful URL to stdout and no diagnostic noise;
- each failure path exits nonzero and stderr identifies the specific failed component/checkpoint;
- wrapping by demo preserves the safe underlying code/cause;
- no ambiguous hang/process leak remains after failure.

## DGN-09 — Copyable Support Snapshot

Chromium E2E on the normal built runtime must:

1. cause at least one representative failure;
2. activate the normal copy/export diagnostic action;
3. prove clipboard success when available and selectable-text fallback when clipboard access is denied/unavailable;
4. parse the produced JSON;
5. assert schema version/component/checkpoint/last-success/code/cause;
6. assert trusted aggregate context is present when known;
7. assert snapshot size/history is bounded;
8. assert forbidden fields/content are absent.

The test must use the same normal product surface; do not create a test-only diagnostic UI.

## DGN-10 — CI failure artifact usefulness

A deliberately failing diagnostic-fixture test or equivalent harness proof verifies Browser CI attachment behavior:

- `support-snapshot.json` (or equivalently named sanitized JSON artifact) is attached on browser failure when obtainable;
- service/Fake Market logs remain sanitized;
- the first relevant failure output includes component/checkpoint/code rather than only a generic Playwright assertion;
- artifacts contain no synthetic sentinel values representing credentials/cookies/auth/account/private raw data.

This proof is about artifact construction/sanitization, not about intentionally keeping main CI red.

## DGN-11 — Security sentinel audit

Inject unique synthetic sentinel strings into test-only forbidden sources such as:

```text
Cookie
Authorization
account-id-like field
requestId containing a forbidden sentinel
raw provider body field
Scanner SQL/result value
absolute temp path
raw Error.message sentinel
```

Then generate Browser/Node/CLI diagnostic outputs and CI-style artifacts.

Assert every forbidden sentinel is absent from the public Support Snapshot/CLI diagnostic/browser artifact set.

Synthetic sentinels only; never use real session/account data.

## Acceptance rule

Node `6.5` cannot close from “logs look useful” manual inspection.

It closes only when the representative matrix above proves:

```text
failure injected
→ exact boundary reported
→ specific safe cause preserved
→ support evidence copyable
→ no authority mutation beyond the existing failure contract
→ no forbidden data leakage
```

---

# 9. Layer 5 — Representative Workload

## 9.1 Separate from correctness Fake Market

Do not inflate ordinary E2E to hundreds of thousands of rows.

Use a deterministic synthetic workload generator directly against the service/protocol/data contract.

Initial baseline:

```text
universe = 561
cycles = 600
history rows = 336,600
```

This is a representative starting point, not an eternal product constant.

## 9.2 Workload sequence

At minimum:

1. create fresh DB/service;
2. start one producer session;
3. replace 561-security universe;
4. commit 600 complete cycles;
5. interleave during ingest:
   - Current reads;
   - history first-page reads;
   - continuation reads;
   - Scanner JOIN;
   - GROUP BY/HAVING;
   - window/rank;
   - historical predicate;
6. graceful restart/reopen during or after representative state;
7. rerun representative reads/queries;
8. record DB file size.

## 9.3 Measurements

Record at minimum:

```text
DB file size
cycle commit latency: min / median / p95 / max
Current read latency: median / p95 / max
history page latency: median / p95 / max
representative Scanner query latency: median / p95 / max
restart-to-ready duration
```

Also verify:

- no data-integrity errors;
- expected final counts;
- no failed writes;
- query results remain correct;
- restart preserves authority.

## 9.4 Initial acceptance policy

Do **not** invent numeric latency SLOs before the first real baseline.

The representative workload produces a durable benchmark report; the reviewed baseline is kept in `docs/benchmarks/REPRESENTATIVE_WORKLOAD_BASELINE.md`.

If measured latency materially prevents the selected collector/Scanner cadence or makes ordinary interactive reads unusable, the current implementation owner must address it or reopen the relevant design decision before release.

Do not optimize merely because another design might be theoretically faster.

The old ~3000ms V1 snapshot interval remains historical evidence, not a workload pass/fail threshold.

## 9.5 What Workload does not prove

It does not prove provider limits, browser UI correctness, or authenticated-market behavior.

---

# 10. Layer 6 — Real Provider Verification

## 10.1 Scope

Only irreducible external facts belong here:

- current authenticated provider endpoint accessibility/shape;
- current provider Origin;
- Browser CSP/Local Network Access compatibility with loopback WebSocket;
- real universe acquisition against current provider;
- real sequential security acquisition;
- one real complete cycle;
- final Node commit/read path.

Everything else should already be green offline.

## 10.2 Preconditions

Before live verification:

- final candidate commit identified;
- Fast CI green;
- Browser CI green;
- required workload verification green/reviewed;
- old Market Flow/legacy recorder authority stopped;
- final local Node candidate uses a dedicated sanitized real-use DB path;
- no test fake is running on the provider origin.

## 10.3 Bounded self-verifying gate

Use a browser-side verification harness that reuses the production provider adapters and production protocol.

It must programmatically assert:

```text
1. loopback hello succeeds from authenticated provider page
2. MapHeat universe validates
3. Node universe ACK succeeds
4. exactly one complete provider cycle validates
5. Node cycle COMMIT ACK succeeds
6. viewer.current.get returns expected committed row count
7. choose one canonical SecurityId
8. viewer.security.get finds it
9. viewer.history.page contains the committed cycle
10. scanner.execute on a bounded read-only query returns consistent authority
11. no browser/IndexedDB authority is involved
12. one producer ownership remains valid
```

Then stop the verification producer/session cleanly.

Output a compact sanitized report:

```text
candidate commit
browser/version
provider Origin host (no path/query)
universe count
cycle requested/received/unique
cycleId
Current row count
selected SecurityId
history proof count/cycleId
Scanner proof summary
transport/CSP-LNA PASS
overall PASS/FAIL
timestamps
```

Do not include cookies, auth headers, account identifiers, raw provider dumps, or private session data.

No visual correctness checklist is accepted where code can assert.

## 10.4 Unavailable market/session

If authenticated session/provider/market conditions are unavailable:

```text
live verification = pending
reason = factual external boundary
```

Never fabricate PASS.

Offline/Fake/service/workload work remains independently complete.

## 10.5 What live verification does not prove

It is not the place to exhaustively retest:

- sorting;
- 500-row pagination;
- rollback matrix;
- hostile Scanner SQL;
- Fake Market failures;
- UI edge cases.

Those are deterministic offline proofs.

---

# 11. CI ownership

## 11.1 Planning Docs CI

Exists during planning and remains useful after implementation.

Proves:

- required durable artifacts exist;
- planning/status/freeze structural rules;
- anti-forgetting guards.

Does not prove product code.

## 11.2 Fast CI

Workflow:

```text
MarketScope Fast CI
```

Runs on push/PR changes to:

- production JS;
- shared protocol;
- unit/service tests;
- package.json / package-lock.json;
- relevant docs/contracts;
- `.planning/**`;
- CI configuration.

Jobs:

```text
planning/static guards
unit tests
real service integration tests
```

Node line: 24.

Use `npm ci`, never unpinned `npm install` in CI.

Fast CI is required before an implementation leaf can close.

## 11.3 Browser CI

Workflow:

```text
MarketScope Browser CI
```

Runs automatically on push/PR whenever product/runtime/browser/service/protocol/Fake-Market/E2E/package changes can affect the end-to-end product.

It:

1. `npm ci`;
2. restores the exact Playwright Chromium cache, installing Chromium + system dependencies on a cache miss and verifying the cached binary on a hit;
3. builds the normal browser runtime;
4. runs the full Chromium E2E suite;
5. uploads sanitized Playwright failure evidence on failure.

For product-code changes, Browser CI is a required final-state gate, not an optional manual workflow.

Docs-only planning edits do not run it.

Browser CI failure handling additionally attempts to attach the product's own sanitized Support Snapshot, and DGN-10/DGN-11 prove that diagnostic artifacts are useful and public-safe.

## 11.4 Workload CI

Separate workflow:

```text
MarketScope Workload
```

Current trigger contract:

- `workflow_dispatch`;
- callable through `workflow_call`;
- not on every push.

It uploads the sanitized benchmark report.

If later measured runtime is cheap enough, cadence may increase deliberately.

## 11.5 Live verification

Never ordinary hosted CI.

No provider credentials/session state is stored as GitHub secrets for this purpose.

Run in the authenticated local browser environment at the explicit live gate.

---

# 12. Verification ownership matrix

| Contract / failure | Unit | Service | Chromium | Workload | Live |
|---|---:|---:|---:|---:|---:|
| provider pure validation | primary | secondary | integration | no | spot/external |
| exact DB transaction | no | **primary** | happy-path | stress | one real commit |
| Current sorting/formatting | **primary logic** | data shape | **UI integration** | no | no |
| history cursor correctness | pure helper | **primary** | UI Load More | stress | bounded read |
| Browser↔Node protocol | validation | **primary** | **real browser wiring** | stress | external transport |
| Scanner admission | helper | **primary real DuckDB** | visible behavior | analytical scale | bounded read |
| Fake provider HTTP | helper | no | **primary** | no | N/A |
| service failure/relaunch | no | service mechanics | **user flow** | no | no |
| restart durability | service primary | **primary** | user-flow proof | stress | optional bounded |
| performance/DB growth | no | micro evidence only | no | **primary** | no |
| real provider/CSP/LNA | no | no | Fake only | no | **primary** |

---

# 13. Failure-review rule

A meaningful unexpected test/CI/live failure is not closed only because it later turns green.

Before closing that work unit capture in the narrowest durable owner:

```text
technical root cause
reasoning/process cause
escape cause
what would be done differently
smallest reusable prevention
whether the lesson should be promoted
```

Do not turn every isolated failure into permanent process ceremony.

Expected TDD red is exempt unless it reveals an unexpected defect.

---



# 14. Saved Query Library review matrix

## QL-01 — Schema v1→v2 preservation

Seed representative v1 authority, migrate, and byte/logically compare all pre-existing market/session facts after v2 readiness.

## QL-02 — Durable CRUD

Create/read/update/rename/delete multiple named user queries through the real Viewer-role protocol and prove restart persistence.

## QL-03 — Draft versus active isolation

Library selection and CRUD mutate only draft/persisted configuration; an already-active Scanner generation remains unchanged until explicit Activate.

## QL-04 — Built-in immutability/copy

Built-ins are always listed, cannot be updated/deleted, and can be copied into a normal user query.

## QL-05 — Name collision semantics

Unicode/whitespace/case-normalized collisions are explicit and never overwrite an existing user or built-in query.

## QL-06 — Failure isolation

Inject a query-library writer failure and prove no sessions/universe/cycles/history/latest authority mutation and no false Scanner activation.

## QL-07 — Demo/reset boundary

Demo user queries live inside the demo DuckDB and are cleared by the existing path-safe demo reset; production DB/query-library state remains untouched.

## QL-08 — Built-in executable proof

Every built-in passes current Scanner admission and executes against deterministic fixtures with its documented bounded behavior.

## QL-09 — AI guide completeness

Fresh-schema metadata proves every public Scanner table/column is documented; the guide includes identity/joins, known-vs-unknown semantics, null rules, safety limits, bounding guidance, examples and the AI prompt template.

## QL-10 — Schema/guide/built-in drift guard

Changing public Scanner schema or a built-in without updating the canonical guide causes automated verification to fail.


# 15. Test feedback performance contract

Verification speed is part of maintainability, but never overrides correctness.

Measured execution evidence is maintained in `docs/TEST_FEEDBACK_PERFORMANCE.md`.

## 15.1 Measured baseline

Reference Actions run: `36348375187`.

Approximate job-step wall time:

| Step | Baseline |
|---|---:|
| npm ci | 2s |
| Chromium install with dependencies | 26s |
| focused unit/service | 1s |
| focused Chromium | 11s |
| full Fast | 15s |
| full Browser | 16s |
| total job | 79s |

The baseline demonstrates two primary avoidable costs:

1. browser provisioning dominates setup;
2. focused suites are immediately followed by the same layer's full suite in one serial final-proof job.

The service suite must also be profiled by file/process lifetime, not only summed assertion duration, because process-exit/open-handle delay can dominate otherwise short tests.

## 15.2 Development versus final-gate semantics

Development proof may run the smallest affected focused tests first.

Before a leaf closes, the required **full** gate still runs.

Permanent CI must not routinely execute:

```text
focused layer
→ same full layer
```

serially merely to prove the same final commit twice.

Instead:

```text
development/focused proof
→ final commit
→ one full required CI gate per layer
```

## 15.3 Optimization order

Node 6.6 uses this order:

1. instrument/profile command, test-file and setup durations;
2. replace arbitrary waits/open-handle shutdown delays with deterministic event/control boundaries where possible;
3. avoid redundant process/bootstrap work when fixture sharing preserves isolation;
4. prove Chromium can use safe version-keyed cached/preinstalled browser binaries without weakening browser fidelity;
5. preserve full-suite behavior and test counts;
6. only then consider safe parallel execution/sharding.

Do not make timing assertions about normal product behavior tighter merely to make tests faster.

## 15.4 Targets

Runner queue time is excluded.

- `npm run test:fast`: target <=10 seconds.
- full `npm run test:e2e` execution after browser availability: target <=12 seconds.
- warm required product-code CI wall clock: target <=45 seconds.
- cold required product-code CI wall clock: target <=60 seconds.
- hard improvement requirement: representative final proof is at least 35% faster than the 79-second baseline.

A numeric target may be missed only when the node records measured irreducible cause and demonstrates that meeting it would weaken correctness. No test may be deleted or converted into a weaker mock solely to hit the budget.

## 15.5 Final CI orchestration requirements

Nodes 6.3/6.4 consume the optimized test infrastructure.

When both Fast and Browser gates apply, they should execute independently/in parallel rather than one serial mega-job.

Browser setup should reuse a safe cache/equivalent keyed to the exact Playwright/browser version when measured proof shows it is reliable.

Path filters must prevent documentation/planning-only changes from paying full Browser cost while still gating every product-code path that can affect end-to-end behavior.

Failure artifacts/diagnostics remain required; optimization must not hide the failing boundary.
