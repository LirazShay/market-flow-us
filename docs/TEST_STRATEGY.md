# Market Flow US Test Strategy

## 1. Core principles

Verification protects observable contracts, not implementation trivia.

The U.S. conversion follows:

```text
reuse proven MarketScope tests where behavior is unchanged
→ replace only provider/data-specific fixtures/assertions
→ keep Fast feedback fast
→ use Chromium for browser composition
→ use representative workload for scale/performance
→ use deterministic local Fake Leumi acceptance before external checks
→ defer authenticated target-machine checks to the final acceptance leaf
```

No credentialed provider access belongs in CI.

### Automation-performance invariant

Verification speed is part of the verification contract. Slow recurring automation is not harmless merely because it is correct or green.

Measure the complete wall-clock path, including checkout, dependency installation/cache restore, build, fixture creation, service/DB startup, tests, browser setup, cleanup and report generation. Optimizing only the body of a test while leaving repeated setup expensive does not satisfy this rule.

When a test, harness or workflow becomes materially slow, first prefer refactoring the repeated work itself:

```text
remove duplication
→ share/reuse setup safely
→ reduce unnecessary fixture/data size
→ replace polling/sleeps with deterministic synchronization
→ improve algorithm/query/test architecture
→ improve cache/job topology
→ remeasure end-to-end
```

Do not normalize slow tests. An individually slow test or setup path must be investigated even when the overall suite still passes. Do not increase timeouts/retries as the normal response to avoidable slowness. Do not delete meaningful coverage merely to make CI appear faster.

The expected steady state is that the overwhelming majority of repeated development verification completes in seconds. Hard ceilings are failure bounds, not acceptable targets.

Long waits are treated as feedback/performance defects, not as permission to increase timeouts. Normal Fast/Browser jobs have a 3-minute hard ceiling while their normal target remains seconds. The representative 4096 × 180 workload has a 5-minute hard ceiling. Hitting a hard ceiling is a blocker to investigate and optimize.

## 2. Layer 1 — Unit tests

Unit tests cover pure/local behavior.

Required U.S. unit proof includes:

### Provider adapter

- exact ScreenerHulPaging3 URL/query construction;
- response extraction;
- non-2xx rejection;
- malformed JSON/shape rejection;
- positive safe `recordCount`;
- `records.length === recordCount`;
- missing/empty `PaperId` rejection;
- duplicate canonical `PaperId` rejection;
- row reordering does not alter canonical membership;
- `Symbol` missing is tolerated/diagnosed rather than used as identity;
- null/zero/missing quote-like fields are preserved correctly;
- source envelope metadata is retained safely.

### Cycle shaping

- one full response -> one segment with `chunkIndex=0`;
- exact counters;
- timing ordering;
- exact membership;
- source metadata attached;
- raw row preserved.

### Recorder

- 3000 ms default remains a timing config, not a history-schema input;
- no overlapping cycles;
- stop prevents new cycles;
- membership change routes through universe replace before cycle commit;
- same membership reuses accepted universe revision;
- failures are reported fail-closed.

### Viewer models

- U.S. Current columns;
- default `DailyVolume DESC`;
- deterministic null/zero/missing formatting;
- Detail summary/history columns;
- sort/state preservation.

### Scanner built-ins

- built-ins parse/execute against current schema;
- staged-ranking SQL exposes `securityId`;
- staged ranking is contiguous and deterministic;
- missing historical stage stops progression;
- tie-break order is deterministic.

Any new or materially changed SQL must pass the AGENTS 10+ stage static SQL preflight before first execution. Regression execution of unchanged already-reviewed SQL remains normal.

### Branding/build

- Market Flow US generated filenames/global keys;
- Windows launchers remain thin wrappers.

## 3. Layer 2 — Real service integration

Use real temporary DuckDB + real `ws`.

Preserve imported service proof families:

- DB bootstrap/close/restart;
- unsupported schema rejection;
- producer/session ownership;
- heartbeat/stale recovery;
- universe replacement;
- complete cycle commit;
- failed cycle persistence;
- fault-injected rollback;
- Current/status trusted reads;
- Security/history paging;
- Scanner admission/execution;
- saved-query CRUD;
- Support Snapshot.

U.S.-specific assertions replace Israeli fields.

## 4. Schema v3 tests

Required:

- fresh empty DB bootstraps as v3;
- v3 contains exactly required tables;
- v3 U.S. columns exist with expected types;
- raw_data remains JSON;
- old MarketScope v1/v2 DB is rejected without mutation;
- default Market Flow US DB filename differs from old MarketScope filename;
- saved-query library works in fresh v3;
- restart preserves history/latest/query library.

Do not test or implement semantic conversion of Israeli market rows into U.S. rows.

## 5. Layer 3 — Canonical Fake Market

Fake Market is a real loopback HTTP server used by the normal browser runtime.

It serves the production U.S. path:

```text
/lti/lti-app/api/Market/ScreenerHulPaging3
```

Required deterministic scenarios:

1. complete moving U.S. response;
2. repeated identical complete response with unchanged membership and quote values;
3. same membership, different row order;
4. security added;
5. security removed;
6. duplicate PaperId;
7. missing PaperId;
8. recordCount mismatch;
9. null / numeric zero / missing fields;
10. malformed response shape;
11. HTTP error;
12. delayed response;
13. values advance across cycles;
14. provider recovery after failure;
15. service restart with persisted DB.

The repeated-identical scenario is important: a closed/static market is not a failure. Repeated equal values must still validate, commit, append history and preserve the same universe revision.

Normal scenarios should not rely on Playwright interception.

## 6. Layer 4 — Browser E2E

Chromium runs against Fake Market + real local service + normal built runtime.

Preserve current observable behavior:

- runtime composition;
- Current boot/empty/main/error;
- Current U.S. columns and sort;
- diagnostics;
- Detail open/back;
- history continuation/retry;
- refresh state preservation;
- Scanner execute/stop/repeat;
- saved-query library;
- Scanner-to-Detail navigation;
- producer survives Viewer close;
- explicit recovery after service interruption.

At least one browser scenario must prove membership change from one full U.S. response to the next.
At least one browser/service scenario must prove repeated identical complete responses remain valid authority rather than being misclassified as stale/failure solely because quote values do not move.

## 7. Fast CI contract

`npm run test:fast` remains:

```text
unit
+
real service integration
```

Keep the imported feedback-performance discipline.

Targets remain guidance, not permission to weaken proof:

```text
full test:fast command: <= 10s target
full Playwright execution: <= 12s target
ordinary workflow hard ceiling: 3 minutes
```

For every meaningful test/CI change, compare wall-clock cost with the prior shape. If a regression is avoidable, fix it before merge. Prefer reducing recurring setup and duplicate work before micro-optimizing assertion code.

If one test, fixture, bootstrap, browser setup or cleanup path dominates elapsed time, treat that path as the next optimization target even if the suite remains under the hard ceiling.

If U.S. fixture growth causes regression, remove avoidable setup/waiting before considering test deletion. Do not solve a slow test suite by simply increasing its timeout.

## 8. Browser CI contract

For product-code changes:

```text
npm ci
→ exact Chromium setup/cache
→ npm run build:browser
→ npm run test:e2e
```

Failure evidence remains sanitized.

## 9. Layer 5 — Representative U.S. workload

Manual/dispatch workload:

```text
4096 securities
180 cycles
737280 history rows
```

Synthetic rows use U.S. typed fields.

Required integrity:

- 180 completed cycles;
- zero failed cycles;
- latest count 4096;
- history count 737280;
- last completed cycle 180;
- restart preserves counts.

Measure:

- cycle commit latency distribution;
- Current read;
- History page;
- Scanner general JOIN;
- Scanner GROUP/HAVING;
- Scanner window;
- Scanner time predicate;
- staged candidate ranking;
- restart-to-ready;
- DB file size.

The staged query must exercise at least the 10/20/30/45/60/90/120-second example against logical 3-second cycle spacing.

Workload discipline:

- correctness/count integrity is mandatory;
- the complete representative workload has a 5-minute hard ceiling;
- timeout is a performance blocker, not a reason to allow a longer run;
- before the full workload, materially changed SQL must pass AGENTS static preflight and a small deterministic probe;
- if ordinary use or intended Scanner cadence is materially impractical, performance is a blocker and the smallest affected area is reopened.

## 10. Layer 6 — Local Fake Leumi acceptance kit

The product must ship a documented local acceptance path that the user can run without an authenticated bank session or active market.

The acceptance kit must reuse the normal product boundaries:

```text
Fake Leumi / ScreenerHulPaging3-shaped HTTP
→ normal browser runtime / Recorder
→ loopback WebSocket
→ normal local service
→ real DuckDB
→ Current / Detail-History / Scanner
```

Do not introduce a second product implementation just for acceptance.

The kit must provide deterministic coverage for:

### Static-market mode

- several complete responses with identical membership and identical market values;
- every response validates and receives durable COMMIT ACK;
- `history` grows once per security per committed cycle;
- `latest` remains the same values because the provider values are the same;
- unchanged membership does not create false universe revisions;
- Current/Security/History/ownership/clean stop remain correct.

### Moving-market mode

- synthetic values change across responses;
- Current advances to the final committed values;
- History preserves prior values;
- Scanner can observe the synthetic movement using already-reviewed bounded SQL;
- add/remove membership is handled through revision ACK before same-response commit.

### Failure/recovery mode

- deterministic provider failure occurs;
- failure remains fail-closed and sanitized;
- subsequent provider recovery commits normally;
- service restart preserves committed authority.

### Local scale/performance mode

The kit exposes the representative `4096 × 180` workload in a user-runnable form instead of duplicating a second benchmark implementation.

It emits a sanitized machine-readable report containing the required counts and latency measurements. The same 5-minute hard ceiling applies on the target machine; exceeding it is reported as a performance failure that requires investigation rather than silent continuation.

The implementation of this kit must itself be automatically exercised with smaller deterministic fixtures so development can finish without waiting for the user or market hours.

## 11. Layer 7 — Final target-machine acceptance bundle

All checks that depend on the user's machine or authenticated browser are deliberately deferred to the final execution leaf. They do not block development of earlier leaves, but overall product completion still requires their PASS results.

### A. User-run local Fake Leumi acceptance

On the intended local machine, run the documented acceptance kit and retain its sanitized report.

Required:

- static-market mode PASS;
- moving-market mode PASS;
- failure/recovery PASS;
- restart PASS;
- representative `4096 × 180` mock load/performance PASS within the 5-minute hard ceiling.

### B. Authenticated closed/static-market smoke

This is a lightweight local authenticated-browser check and may be performed while the market is not moving.

It must not require quote changes.

Required:

```text
producer hello/session
→ at least 5 consecutive complete ScreenerHulPaging3 responses
→ exact provider validation for every response
→ stable membership reuses its revision
→ COMMIT ACK for every cycle
→ Current reflects the repeated provider values
→ History contains every committed cycle even if values are identical
→ Security read
→ bounded already-reviewed Scanner query
→ ownership/status
→ clean producer stop
```

Repeated identical market values are an expected valid outcome for this smoke. This smoke proves current provider shape/transport/loopback/authority compatibility only; it does not prove real market movement.

The report is sanitized and SHA-bound.

### C. Authenticated market-open acceptance

Run on the same final SHA when the market is active.

Preconditions:

- final candidate/cleanup is complete;
- Fast green;
- Browser green;
- representative workload green;
- target-machine local Fake Leumi acceptance PASS;
- closed/static-market smoke PASS or repeated as part of the same final session;
- no legacy/competing producer;
- authenticated eligible provider page open;
- dedicated live-verification DB.

Gate:

```text
producer hello/session
→ at least 20 consecutive complete ScreenerHulPaging3 responses spanning at least 60 seconds at candidate cadence
→ exact validation for every cycle
→ universe ACK/revision handling
→ COMMIT ACK for every cycle
→ at least one observable provider market/freshness value changes across committed cycles
→ Current on final committed cycle reflects final provider values
→ Security
→ History contains the committed live cycles and observed change
→ bounded already-reviewed Scanner query
→ ownership/status
→ clean producer stop
```

The report is sanitized and SHA-bound.

Only this market-open gate may declare the moving real-provider boundary PASS.

If the market is genuinely open but the bounded run observes no market/freshness change, do not fabricate movement. Record the result as inconclusive for the movement-specific acceptance and rerun later rather than weakening the contract.

## 12. Live-only facts

Authenticated checks record rather than assume:

- actual returned recordCount;
- actual browser/provider Origin;
- current response shape;
- CSP/LNA loopback compatibility;
- provider freshness indicators;
- repeated full-response completeness across the bounded run;
- whether market/freshness values are static or changing;
- session/auth failure shape when encountered.

Long-run throttling/polling behavior may require a separate bounded observation if normal use reveals a problem.

## 13. Security verification

Tests/fixtures/reports must not contain:

- credentials;
- cookies;
- bearer/auth headers;
- account IDs;
- raw authenticated response dumps;
- private browser state.

Provider fixtures are synthetic and schema-shaped only.

## 14. Completion evidence

A migration implementation node closes only with the verification routed by TREE.

Development may proceed through local acceptance tooling and release cleanup without waiting for market movement.

Final product completion requires:

```text
Fast green
Browser green
U.S. representative workload green
local Fake Leumi target-machine acceptance PASS
closed/static authenticated smoke PASS
market-open authenticated acceptance PASS
main CI green
no blocking defect
```
