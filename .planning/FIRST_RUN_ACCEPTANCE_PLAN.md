# Market Flow US — First-Run Acceptance Mini-Project

## Purpose

This mini-project turns a Windows machine that has never run Market Flow US into a verified target-machine installation through one serial, diagnosable acceptance path.

It is broader than an installation guide and narrower than a new product subsystem. It combines:

```text
machine prerequisites
→ repository acquisition / exact accepted product SHA
→ deterministic dependency installation
→ local correctness
→ browser/runtime proof
→ Local Fake Leumi static/dynamic/recovery proof
→ Demo Buy + AI Investigation proof
→ target-machine workload proof
→ daily schema-v4 lifecycle proof
→ real-provider market-data deployment
→ IBKR Client Portal Gateway / standalone order-service compatibility
→ authenticated static/pre-market readiness
→ authenticated market-open movement
→ final release closure
```

Every user-dependent checkpoint has one bounded action, one explicit observable result, and one stop point. Do not batch several opaque actions and ask the user only whether "it worked".

## Scope / ownership

This is execution refinement of the existing frozen release path, not a new capability branch and not a new subsystem.

```text
7.2  reusable Local Fake Leumi acceptance tooling
7.3  release/docs/deployment + first-run + daily lifecycle
7.5  post-feature Demo Buy/AI deterministic reclosure
8.1..8.3  standalone IBKR order-service implementation
8.4  branch-8 deterministic reclosure + exact candidate pin
7.4  final target-machine/provider acceptance
```

TREE `7.4` remains incomplete until all required target-machine and authenticated evidence is green. The exact post-order-service product candidate remains the candidate pinned by completed TREE `8.4` in `.planning/EXECUTOR_HANDOFF.md`; later planning/docs-only commits do not silently replace it.

### What 7.2 / 7.5 / branch 8 already provide

Existing tooling must be reused rather than replaced:

- static repeated-identical Local Fake responses;
- moving values;
- add/remove membership;
- deterministic provider failure/recovery;
- service restart/persistence;
- Demo Buy capture/runtime proof;
- Demo Buy progressive outcome proof;
- AI Investigation UI proof;
- AI Pack sharing-safety and regeneration proof;
- isolated persistence/day-bounded probes;
- representative target-machine `4096 × 180` profile;
- deterministic standalone IBKR order-service acceptance;
- safe real CPGW session compatibility check;
- sanitized SHA-bound PASS/FAIL reports.

### What 7.4 owns

Chat 21 executes this runbook with the user on the target Windows machine, one checkpoint at a time:

- host/toolchain acceptance;
- heavy target-machine performance;
- daily DB lifecycle on the final product shape;
- authenticated real-provider market-data compatibility;
- real CPGW target-machine compatibility through the standalone order service;
- pre-market/static authenticated acceptance;
- market-open movement acceptance;
- optional bounded real-order verification only when external IBKR permission exists and the user explicitly initiates it;
- final evidence/operational handoff.

## Operating rules

1. **One checkpoint at a time.** Give only the current user-dependent action and the result needed back.
2. **Stop on first FAIL.** Do not continue downstream to collect unrelated failures.
3. **Root cause before retry.** A discovered blocking defect stays with Chat 21 until fix + regression proof + affected verification are green.
4. **Resume from last valid green checkpoint.** Do not restart the whole sequence unless a fix invalidates earlier evidence.
5. **Exact SHA matters.** FR-0 is a release-level checkpoint, not a local-checkout checkpoint. It freezes the exact post-order-service product SHA from fresh GitHub truth; FR-2 proves the target machine is actually checked out to that exact SHA. Heavy/authenticated evidence is valid only for that candidate.
6. **No secret evidence.** Never store credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.
7. **Existing launchers first.** Prefer `SETUP.cmd`, `RUN_TESTS.cmd`, `START_DEMO.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `NEW_TRADING_DAY.cmd`, `START_MARKET_FLOW_US.cmd`, `PREPARE_LIVE_VERIFICATION.cmd`, `RUN_IBKR_ORDER_ACCEPTANCE.cmd`, and `CHECK_IBKR_SESSION.cmd`.
8. **No silent assumptions.** Check prerequisites before the stage that depends on them.
9. **Static is valid.** Equal provider values are not a failure in Local Fake static or authenticated pre-market/static acceptance when new complete cycles keep committing.
10. **Movement is a separate fact.** Only FR-13 can satisfy real market-open movement.
11. **Two-pass first run is valid.** FR-0..FR-12 may complete before market hours; if candidate/runtime/environment remain materially unchanged, FR-13 may run later without replaying FR-0..FR-12.
12. **Do not weaken gates.** `PENDING` movement stays pending; it is never manually converted to PASS. Missing real IBKR trading permission is recorded exactly as `PENDING_EXTERNAL_PERMISSION`; synthetic success never replaces it.

## First-run tree

```text
FR-0  Freeze exact candidate
 |
FR-1  Host prerequisite preflight
 |
FR-2  Acquire/update repository
 |
FR-3  Install deterministic dependencies
 |
FR-4  Fast local correctness + deterministic order-service acceptance
 |
FR-5  Browser build + Chromium E2E
 |
FR-6  Local demo/UI smoke incl. Demo Buy + AI Investigation
 |
FR-7  Local Fake Leumi static acceptance
 |
FR-8  Local Fake dynamic/recovery/restart + Demo Buy/AI closure (A..H)
 |
FR-9  Target-machine isolated + 4096×180 load acceptance
 |
FR-10 Daily DB lifecycle / fresh schema-v4 acceptance
 |
FR-11A Real-provider market-data deployment smoke
 |
FR-11B IBKR CPGW + standalone order-service compatibility
 |
FR-12 Authenticated static/pre-market acceptance
 |
PRE-MARKET READINESS checkpoint
 |
FR-13 Authenticated market-open movement acceptance
 |
FR-14 Final evidence + operational handoff
```

A later checkpoint never excuses an earlier failure.

---

## FR-0 — Freeze exact candidate

**Goal:** freeze the exact product candidate from fresh GitHub release truth before asking the target machine to install or test anything. FR-0 is a release-level checkpoint, not a local-checkout checkpoint.

**Required state:** fresh `main` shows TREE `8.4` deterministic reclosure complete and TREE `7.4` current; the accepted post-order-service candidate SHA is recorded in `.planning/EXECUTOR_HANDOFF.md`; no unexpected release PR or unmerged product work replaces it.

**PASS evidence:**

- exact accepted product SHA captured from the handoff;
- current `main`/status still authorizes TREE `7.4`;
- later planning/docs-only commits, if any, are explicitly not substituted for the accepted product SHA;
- no unexpected open PR or unmerged product work replaces the candidate.

**FAIL:** candidate identity is ambiguous/missing, TREE `8.4` is not closed, current GitHub truth no longer authorizes `7.4`, or unexpected product/release work supersedes the candidate. Stop before target-machine preflight.

## FR-1 — Host prerequisite preflight

Verify before dependency installation:

- supported Windows environment;
- Git available;
- Node.js `24.x`;
- npm through that Node installation;
- PowerShell;
- writable local disk for dependencies/Chromium/DuckDB/reports;
- loopback networking;
- ports `8765` and `8770` not occupied by a competing process;
- Chromium-family browser for the authenticated market-data bookmarklet path;
- Client Portal Gateway available later for FR-11B when IBKR compatibility is tested.

PASS is a concise sanitized version/capability report. Do not run `npm ci` before FR-1 is green.

## FR-2 — Acquire/update repository

Clone `LirazShay/market-flow-us` once or update the existing checkout, then pin the working tree to the exact accepted SHA frozen in FR-0. Fresh `main` remains release metadata/source-of-truth; it is not silently substituted as the product under test when later metadata-only commits exist.

For an existing checkout, stop first if the working tree is dirty. After fetch/update, use an exact-SHA checkout (a detached checkout is valid and preferred for acceptance) rather than requiring the branch name `main`.

PASS:

- repository path known;
- working tree was clean before switching candidate and remains clean before generated outputs/tests;
- `HEAD` equals the exact FR-0 candidate;
- the checkout is not silently using a later metadata-only `main` SHA;
- lockfile, launchers and runtime files required by that candidate are present.

FR-2 proves the target machine is actually checked out to that exact SHA.

## FR-3 — Deterministic dependency install

Run:

```text
SETUP.cmd
```

Expected:

```text
Node 24 preflight
→ npm ci
→ pinned Playwright Chromium install
→ setup complete
```

No global DuckDB installation is required.

## FR-4 — Fast local correctness

Run separately for diagnosability:

```text
npm run test:unit
npm run test:service
npm run test:acceptance:order
```

PASS: all three green. Unit failures stay in logic/contract; service failures stay in Node/WebSocket/DuckDB/persistence/read boundaries. `test:acceptance:order` is synthetic/public-safe proof of the permission-independent standalone IBKR order-service journey and is not real-order evidence.

## FR-5 — Browser build + Chromium E2E

Run:

```text
npm run build:browser
npm run test:e2e
```

PASS:

- browser artifacts generated under documented `dist` paths;
- full Chromium E2E green;
- no retry/timeout hiding a deterministic failure.

## FR-6 — Local demo/UI smoke

Run:

```text
START_DEMO.cmd
```

Manual observable checks:

1. demo opens and runtime reaches `running`;
2. Current shows synthetic U.S. rows;
3. Detail/History opens from a row;
4. Scanner executes the documented safe built-in;
5. Demo Buy controls are available from Scanner and a real Demo Buy page opens;
6. progressive horizon outcomes and targeted `Refresh observation` are usable;
7. `Investigate with AI` is visible for an observation and makes no automatic external AI/network call;
8. Generate/Regenerate exposes only bounded product-relative pack metadata and clipboard has manual fallback;
9. Support Snapshot exists;
10. `Ctrl+C` stops cleanly;
11. restart does not corrupt `.demo/market-flow-us.duckdb`.

This is human-visible usability smoke, not a substitute for FR-7/FR-8 formal acceptance.

## FR-7 — Local Fake Leumi static acceptance

Run:

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

PASS requires repeated identical complete responses where:

- every response validates;
- each complete cycle receives durable commit acknowledgement;
- History grows per committed cycle;
- Latest/Current may remain equal because source values are equal;
- stable membership reuses the universe revision;
- Current/Security/History and ownership/status are correct;
- clean stop succeeds;
- report is sanitized and identifies candidate/profile.

No movement assertion is allowed.

## FR-8 — Local Fake dynamic/recovery/restart + post-feature closure

Run distinct sub-checkpoints:

```text
FR-8A  RUN_LOCAL_ACCEPTANCE.cmd moving
FR-8B  RUN_LOCAL_ACCEPTANCE.cmd membership
FR-8C  RUN_LOCAL_ACCEPTANCE.cmd provider-recovery
FR-8D  RUN_LOCAL_ACCEPTANCE.cmd restart
FR-8E  RUN_LOCAL_ACCEPTANCE.cmd demo-buy-runtime
FR-8F  RUN_LOCAL_ACCEPTANCE.cmd demo-buy-outcomes
FR-8G  RUN_LOCAL_ACCEPTANCE.cmd ai-investigation-ui
FR-8H  RUN_LOCAL_ACCEPTANCE.cmd ai-pack-safety
```

Convenience aggregates:

```text
RUN_LOCAL_ACCEPTANCE.cmd feature
RUN_LOCAL_ACCEPTANCE.cmd all
```

PASS semantics:

- **8A:** moving provider values reach Current and prior values remain in History;
- **8B:** membership change is revision-ACKed before same-response commit;
- **8C:** provider failure is fail-closed/sanitized, then recovery returns to normal commit and Scanner observes deterministic movement;
- **8D:** service restart preserves committed authority;
- **8E:** Scanner generation creates a real Demo Buy capture Browser → Service → DuckDB with trusted baseline/provenance;
- **8F:** Demo Buy shows progressive outcomes, stable paging, `Refresh latest`, and targeted `Refresh observation`;
- **8G:** Investigate with AI proves returned-position/context semantics, Generate/Regenerate and clipboard/manual fallback;
- **8H:** AI Pack proves sharing-safe projection, PARTIAL→COMPLETE regeneration, collision-safe no-overwrite publication and no operational/session canary leakage.

`feature`/`all` do not replace the heavy FR-9 target-machine profile.

## FR-9 — Target-machine isolated + end-to-end load acceptance

Run narrow-to-broad:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

`isolated` must prove persistence plus one-trading-day Current/History/Scanner behavior without irrelevant browser/HTTP overhead.

Representative target profile:

```text
4096 securities
× 180 completed end-to-end cycles
= 737280 history rows
```

The target-machine end-to-end ceiling is five minutes. Preserve sanitized reports and candidate SHA.

## FR-10 — Daily DB lifecycle acceptance

Start with:

- active-day market data;
- at least one Demo Buy capture/item;
- at least one saved Scanner query.

Stop producer/service, ensure no process owns the DB, then run:

```text
NEW_TRADING_DAY.cmd
```

PASS:

- valid schema v3 or v4 source accepted;
- prior-day source archived unchanged when archive requested;
- fresh active DB is schema v4;
- active market tables are clean;
- Demo Buy capture/item state is clean for the new day;
- saved Scanner queries are preserved;
- running session prevents rollover rather than replacing an in-use DB.

The separate IBKR execution DuckDB is not owned by New Trading Day.

## FR-11A — Real-provider market-data deployment smoke

Use the already-authenticated eligible provider page and run:

```text
START_MARKET_FLOW_US.cmd
```

The user supplies the page URL; launcher reduces it to exact allowed Origin, builds/copies the current bookmarklet, starts the local service, and the user executes the bookmarklet manually on the authenticated page.

PASS: runtime/service connect and reach a valid running state or a stable diagnosable provider error without copying authentication material. A provider error must be fixed before FR-12.

## FR-11B — IBKR CPGW + standalone order-service compatibility

This is a separate boundary from the market-data provider path. Client Portal Gateway must already be running and manually authenticated; the product does not automate credential login.

### FR-11B.1 — Deterministic standalone proof

Run:

```text
RUN_IBKR_ORDER_ACCEPTANCE.cmd
```

PASS: a sanitized `SYNTHETIC_ONLY` report proves caller auth, browser-Origin rejection, BUY/SELL preview, DRY_RUN zero submit, restart/idempotency, reply confirmation, partial/full fills, cancellation, acknowledgement-unknown reconciliation without blind resubmit, no-short SELL guard and clean stop.

### FR-11B.2 — Real CPGW session compatibility

Run:

```text
CHECK_IBKR_SESSION.cmd
```

If the localhost CPGW certificate requires the documented loopback-only fallback:

```text
CHECK_IBKR_SESSION.cmd INSECURE_LOCALHOST_TLS
```

PASS: sanitized CPGW session compatibility succeeds through the protected local order-service path without submitting an order or recording caller token, account identifier, credentials or raw authenticated provider data.

### FR-11B.3 — External permission outcome

If real IBKR trading permission is not available, record exactly:

```text
PENDING_EXTERNAL_PERMISSION
```

Synthetic proof does not replace this external status. If permission exists, any real-order verification remains user-initiated, bounded, SHA-bound and provider-compliant.

## FR-12 — Authenticated static / pre-market acceptance

Run the SHA-bound real-provider gate:

```text
PREPARE_LIVE_VERIFICATION.cmd
```

The current gate is stricter than the original TREE static minimum: it requires at least 20 complete committed provider cycles spanning at least 60 seconds, plus validation, universe handling, Current/Security/History, bounded Scanner, ownership/status, and clean stop.

FR-12 requires:

```text
overall = "PASS"
```

Before market movement, a fully valid result may be:

```text
overall = "PASS"
movement.status = "PENDING"
movement.code = "NO_MARKET_MOVEMENT_OBSERVED"
```

This is **not a partial failure**. It proves authenticated provider compatibility and committed authority while movement remains unproven.

### Static-versus-stuck invariant

Equal values are valid only while new authority continues to advance:

```text
new complete provider response
→ validation PASS
→ new committed cycle / COMMIT ACK
→ History gains committed evidence
→ Current remains equal because source values remain equal
```

If cycles/ACK/History stop advancing, treat that as a failure rather than "static market".

### PRE-MARKET READINESS

If FR-0 through FR-12 are green, including FR-11A and FR-11B, record:

```text
PRE-MARKET READINESS = PASS
FR-13 = PENDING MARKET MOVEMENT
```

`PENDING_EXTERNAL_PERMISSION` for optional real-order placement does not invalidate PRE-MARKET READINESS when deterministic order acceptance and real CPGW session compatibility are green.

Preserve the sanitized FR-12 report and accepted candidate SHA.

If time passes and the market opens while candidate SHA, runtime code, dependencies and relevant machine configuration remain unchanged, **do not replay FR-0..FR-12**. Resume directly at FR-13.

If a defect is fixed meanwhile, resume from the earliest checkpoint whose evidence the fix could invalidate.

## FR-13 — Authenticated market-open movement acceptance

On the same accepted product candidate, rerun the same SHA-bound gate during actual market movement.

The gate must derive the movement witness from the **current run's committed cycle range**, not an earlier static run and not local polling time.

`collected_at_ms` is excluded. Eligible persisted provider fields include:

```text
Price / ChangePercent / BidRate / AskRate / DailyVolume / TradeDateTime
```

PASS requires:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

and therefore also:

```text
at least 20 consecutive complete ScreenerHulPaging3 cycles
spanning at least 60 seconds
+ real provider market/freshness change
+ committed Current/History reflection
+ bounded Scanner
+ correct ownership/status
+ clean stop
```

If no provider-field change is observed, `movement.status = "PENDING"`; rerun later. Never convert it manually to PASS.

If a change is observed but Current/History reflection cannot be proven, `movement.status = "FAIL"`; investigate before FR-14.

## FR-14 — Final evidence and operational handoff

Record a compact final closure containing:

- exact accepted product SHA;
- FR-0..FR-13 statuses, including FR-8A..FR-8H and FR-11A/FR-11B;
- deterministic standalone IBKR order-service acceptance status;
- real CPGW session compatibility status;
- real-order evidence `PASS` only if actually executed with permission and explicit user initiation, otherwise exactly `PENDING_EXTERNAL_PERMISSION`;
- if two-pass: FR-12 pre-market report and FR-13 market-open report on the same accepted SHA;
- sanitized local report names/paths;
- normal active DB path `data/market-flow-us.duckdb`;
- separate order execution DB per `docs/IBKR_ORDER_SERVICE_OPERATOR.md`;
- proven daily stop/archive/new-day procedure;
- normal start/stop commands;
- Demo Buy / AI Investigation recovery path;
- Support Snapshot path;
- no blocking defect;
- required CI/main closure green after any acceptance-discovered fix.

Only after TREE `7.4` success evidence is satisfied and final PR/merge/main-green/open-PR truth is clean may overall product completion be declared.

## Evidence / security rules

Prefer one compact machine-readable sanitized report per automated acceptance profile. Reports may contain candidate SHA, profile/checkpoint names, bounded counters/timings and failure codes.

They must never contain:

- credentials/cookies/tokens/auth headers;
- account identifiers;
- private browser/session state;
- raw authenticated response dumps;
- stored Scanner SQL or AI prompt content in support/live reports.

AI Investigation Packs are separate user-created local evidence artifacts and remain governed by their own sharing-safety contract.

## Troubleshooting routing

Return only the current checkpoint plus its sanitized error/report.

```text
FR-0..FR-2  repository/release state
FR-3        toolchain/install
FR-4        unit/service/DuckDB/order deterministic proof
FR-5        build/Chromium E2E
FR-6        local UI/runtime
FR-7..FR-8 Local Fake / Demo Buy / AI feature acceptance
FR-9        target-machine persistence/read/full-load performance
FR-10       DB lifecycle/new-day
FR-11A      real market-data deployment/browser/provider startup
FR-11B      IBKR order-service / CPGW compatibility
FR-12       authenticated static/provider compatibility
FR-13       real market movement/reflection
FR-14       evidence/operational closure
```

## User-facing sources

- `docs/FIRST_RUN_ACCEPTANCE.md` — authoritative user execution runbook;
- `START_HERE.md` — short operational entry point;
- `docs/IBKR_ORDER_SERVICE_OPERATOR.md` — standalone order-service startup/CPGW/acceptance;
- `docs/LOCAL_FAKE_ACCEPTANCE.md` — Local Fake/workload profiles;
- `docs/LIVE_VERIFICATION.md` — authenticated SHA-bound static + movement gate;
- `docs/USER_GUIDE.md` — normal product usage.
