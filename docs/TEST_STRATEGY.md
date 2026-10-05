# Market Flow US Test Strategy

## 1. Core principles

Verification protects observable contracts, not implementation trivia.

The U.S. conversion follows:

```text
reuse proven MarketScope tests where behavior is unchanged
→ replace only provider/data-specific fixtures/assertions
→ keep Fast feedback fast
→ use Chromium for browser composition
→ use bounded workload smoke in CI for correctness/catastrophic regressions
→ use configurable synthetic generators for isolated load probes
→ use deterministic local Fake Leumi acceptance before external checks
→ defer heavy performance authority and authenticated target-machine checks to the final acceptance leaf
```

No credentialed provider access belongs in CI.

GitHub-hosted CI is **correctness-first**. It may record timing and run small performance sanity probes, but it is not the authority for heavy performance PASS/FAIL on the user's stronger intended machine.

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

Do not normalize avoidable slowness. An individually slow test or setup path must be investigated when it materially dominates feedback. Do not increase timeouts/retries as the normal response to avoidable slowness. Do not delete meaningful coverage merely to make CI appear faster.

A broad, high-value recurring suite that covers many real integration boundaries may legitimately take up to roughly **30 seconds wall-clock**. This is an acceptance ceiling, not a target. Before accepting that runtime, inspect the dominant costs for removable duplicated setup, unnecessary waiting/polling, oversized fixtures/bootstrap, avoidable I/O/serialization and other practical optimizations that preserve proof. If no meaningful improvement remains without weakening evidence or adding disproportionate complexity, document the measurement as the **best practical verified state** and stop micro-optimizing it.

The expected steady state is that focused checks remain very fast and broad recurring verification remains comfortably bounded. Hard ceilings are failure bounds, not performance targets.

Normal Fast/Browser jobs keep a 3-minute hard ceiling, but ordinary success should be much faster. Heavy target-machine performance profiles have their own acceptance ceilings and must not be forced through hosted CI merely to obtain a number.

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

### Configurable synthetic generation

Fake Market and load/performance tests must share one deterministic synthetic-data generator rather than maintain large duplicated fixture sets.

The generator is externally configurable through a small documented profile/config boundary for at least:

- universe size;
- cycle/history count or logical day shape;
- logical cadence/timestamps;
- static vs moving data pattern;
- deterministic membership changes;
- deterministic failure/recovery points;
- seed/reproducibility.

Tests may use the generator directly without starting Fake Market when HTTP/browser behavior is irrelevant to the component being measured.

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
focused checks: as fast as practical
broad full Fast/service verification: <= 30s acceptable steady-state ceiling after optimization review
full Playwright execution: <= 12s target where practical
ordinary workflow hard ceiling: 3 minutes
```

The 30-second broad-suite figure is not a goal. A suite in the 10–30 second range is accepted only after the dominant costs have been reviewed and no meaningful avoidable improvement remains while preserving the same proof. Record such a reviewed state as the **best practical verified state** so future chats do not repeatedly reopen pointless micro-optimization unless timing regresses or architecture changes.

For every meaningful test/CI change, compare wall-clock cost with the prior shape. If a regression is avoidable, fix it before merge. Prefer reducing recurring setup and duplicate work before micro-optimizing assertion code.

If one test, fixture, bootstrap, browser setup or cleanup path materially dominates elapsed time, investigate that path even if the suite remains under the broad-suite ceiling. If the cost is inherent to valuable real integration proof and no material optimization remains, document that conclusion and move on.

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

## 9. Layer 5 — Workload correctness and performance-smoke tooling

Workload tooling has two deliberately different responsibilities.

### A. Hosted-CI correctness/performance sanity

GitHub CI runs **small deterministic profiles only**. The goal is broad correctness and early catastrophic-regression detection, not hardware benchmarking.

Required CI coverage includes:

- generated U.S. row/schema correctness;
- exact completed/failed/latest/history counts;
- restart preservation;
- Current and History reads;
- general Scanner SQL families;
- staged Scanner correctness;
- sanitized report structure;
- at least one approximately-4096-security **single/few-cycle width sanity** so full-universe projection/serialization shape is exercised;
- small multi-cycle history profile sufficient to exercise history growth and staged-query semantics.

Timing from hosted CI is diagnostic. A materially surprising regression must be investigated, but a weak runner does not define release-performance PASS/FAIL.

Do not run `4096 × 45` or `4096 × 180` repeatedly in CI merely to discover a bottleneck that can be isolated with a smaller profile.

### B. Isolated performance probes

Performance tests should exercise only the layers relevant to the metric:

```text
persistence probe
→ generate validated cycle data directly
→ persistence/DuckDB only

read/Scanner probe
→ seed deterministic day-bounded history efficiently
→ Current/History/Scanner only

end-to-end probe
→ Fake Market HTTP
→ browser/Recorder
→ WebSocket/service
→ DuckDB
```

Do not require browser/HTTP/WebSocket work when measuring only DuckDB reads or Scanner SQL. Do not replay thousands of real commits merely to create a Scanner dataset if deterministic direct seeding preserves the same schema/data invariants for that measurement.

All materially changed SQL still requires the AGENTS static preflight and a tiny deterministic execution before any larger probe.

### C. Heavy target-machine profile

The acceptance kit exposes at least:

```text
4096 securities
180 end-to-end cycles
737280 history rows
```

for the final target machine.

Required integrity remains:

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

The staged query must exercise at least the 10/20/30/45/60/90/120-second example against configured logical timestamps.

The 5-minute end-to-end ceiling is a **target-machine acceptance ceiling**, not a hosted-CI requirement.

### D. One-trading-day data horizon

The active market-data DB is designed for one trading day, not for continuously accumulated month/year history.

Performance reasoning and synthetic datasets therefore use a configurable **one-day-bounded** history shape. A read/Scanner performance profile may seed the amount of history implied by the configured trading-day duration and cadence directly, without waiting through a literal day of runtime.

At day rollover, prior market data may be archived and the active market-data authority starts fresh for the new day. Saved-query state must survive the new-day operation. Long-term multi-day analysis inside the active DB is not a performance requirement for this release.

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

The kit uses the configurable synthetic generator from Layer 5 so the same profile mechanism can drive tiny automated fixtures, isolated load probes and heavy target-machine runs.

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

### Local scale/performance modes

The kit exposes:

- isolated persistence profile;
- isolated day-bounded read/Scanner profile;
- representative `4096 × 180` end-to-end profile.

Each emits a sanitized machine-readable report. The implementation of the kit itself is automatically exercised with smaller deterministic fixtures so development can finish without waiting for the user or market hours.

## 11. Layer 7 — Final target-machine acceptance bundle

All checks that depend on the user's machine or authenticated browser are deliberately deferred to the final execution leaf. They do not block development of earlier leaves, but overall product completion still requires their PASS results.

### A. User-run local Fake Leumi acceptance

On the intended local machine, run the documented acceptance kit and retain its sanitized report.

Required:

- static-market mode PASS;
- moving-market mode PASS;
- failure/recovery PASS;
- restart PASS;
- isolated persistence profile PASS;
- isolated one-trading-day read/Scanner profile PASS;
- representative `4096 × 180` end-to-end mock load/performance PASS within the 5-minute target-machine ceiling;
- new-day archive/reset lifecycle PASS with fresh market tables and saved queries preserved.

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
- bounded CI workload correctness/sanity green;
- target-machine local Fake Leumi/performance acceptance PASS;
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

Development may proceed through local acceptance tooling and release cleanup without waiting for market movement or the user's target-machine benchmark.

Final product completion requires:

```text
Fast green
Browser green
bounded CI workload correctness/performance-smoke green
local Fake Leumi target-machine acceptance PASS
isolated one-day persistence/read/Scanner performance PASS
4096 × 180 target-machine end-to-end performance PASS
new-day archive/reset lifecycle PASS
closed/static authenticated smoke PASS
market-open authenticated acceptance PASS
main CI green
no blocking defect
```
