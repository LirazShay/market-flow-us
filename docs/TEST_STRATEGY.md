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
→ use authenticated live verification only for irreducible external facts
```

No credentialed provider access belongs in CI.

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
2. same membership, different row order;
3. security added;
4. security removed;
5. duplicate PaperId;
6. missing PaperId;
7. recordCount mismatch;
8. null / numeric zero / missing fields;
9. malformed response shape;
10. HTTP error;
11. delayed response;
12. values advance across cycles;
13. provider recovery after failure;
14. service restart with persisted DB.

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
```

If U.S. fixture growth causes regression, remove avoidable setup/waiting before considering test deletion.

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

First U.S. workload is measurement-first:

- correctness/count integrity is mandatory;
- no arbitrary millisecond failure threshold;
- if ordinary use or intended Scanner cadence is materially impractical, performance is a blocker and the smallest affected area is reopened.

## 10. Layer 6 — Real Provider Verification

This is a local authenticated-browser gate, never GitHub CI.

Preconditions:

- clean intended candidate;
- Fast green;
- Browser green;
- representative U.S. workload green;
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
→ Current on final committed cycle
→ Security
→ History containing the committed live cycles
→ bounded Scanner query
→ ownership/status
→ clean producer stop
```

The report is sanitized and SHA-bound.

Only this gate may declare real-provider PASS.

## 11. Live-only facts

The gate records rather than assumes:

- actual returned recordCount;
- actual browser/provider Origin;
- current response shape;
- CSP/LNA loopback compatibility;
- provider freshness indicators;
- repeated full-response completeness across the bounded sustained run;
- session/auth failure shape when encountered.

Long-run throttling/polling behavior may require a separate bounded observation if normal use reveals a problem.

## 12. Security verification

Tests/fixtures must not contain:

- credentials;
- cookies;
- bearer/auth headers;
- account IDs;
- raw authenticated response dumps;
- private browser state.

Provider fixtures are synthetic and schema-shaped only.

## 13. Completion evidence

A migration implementation node closes only with the verification routed by the future TREE.

Final product completion requires:

```text
Fast green
Browser green
U.S. workload green
real-provider gate PASS
main CI green
no blocking defect
```
