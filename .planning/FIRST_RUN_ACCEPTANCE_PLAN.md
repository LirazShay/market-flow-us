# Market Flow US — First-Run Acceptance Mini-Project

## Purpose

This mini-project turns a Windows machine that has never run Market Flow US into a verified target-machine installation through one serial, diagnosable acceptance path.

It combines:

```text
machine prerequisites
→ exact accepted product SHA
→ deterministic dependency installation
→ local correctness
→ browser/runtime proof
→ Local Fake Leumi proof
→ Demo Buy + AI Investigation proof
→ target-machine workload proof
→ daily schema-v4 lifecycle proof
→ authenticated market-data provider proof
→ IBKR Client Portal Gateway / order-service compatibility proof
→ authenticated market-open movement
→ final release closure
```

Every user-dependent checkpoint has one bounded action, one explicit observable result, and one stop point.

## Scope / ownership

This is execution refinement of the frozen release path, not a new subsystem.

```text
7.2  reusable Local Fake Leumi acceptance tooling
7.3  release/docs/deployment + first-run + daily lifecycle
7.5  post-feature Demo Buy/AI deterministic reclosure
8.1..8.3  standalone IBKR order-service implementation
8.4  branch-8 deterministic reclosure and exact candidate pin
7.4  final target-machine/provider acceptance
```

TREE `7.4` remains incomplete until all required target-machine and authenticated evidence is green. The exact post-order-service product candidate is pinned by TREE `8.4` in `.planning/EXECUTOR_HANDOFF.md`; later planning/docs-only commits do not silently replace it.

### What earlier leaves already provide

Reuse existing tooling rather than replace it:

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
- safe CPGW session compatibility check;
- sanitized SHA-bound PASS/FAIL reports.

### What 7.4 owns

Chat 21 executes this runbook with the user on the target Windows machine, one checkpoint at a time:

- host/toolchain acceptance;
- heavy target-machine performance;
- daily DB lifecycle on the final product shape;
- authenticated market-data provider compatibility;
- pre-market/static authenticated acceptance;
- real IBKR CPGW session compatibility through the standalone order service;
- market-open movement acceptance;
- optional bounded real-order verification only when external IBKR permission exists and the user explicitly initiates it;
- final evidence/operational handoff.

## Operating rules

1. **One checkpoint at a time.** Give only the current user-dependent action and the result needed back.
2. **Stop on first FAIL.** Do not continue downstream to collect unrelated failures.
3. **Root cause before retry.** A discovered blocking defect stays with Chat 21 until fix + regression proof + affected verification are green.
4. **Resume from last valid green checkpoint.** Do not restart the whole sequence unless a fix invalidates earlier evidence.
5. **Exact SHA matters.** FR-0 freezes the exact post-order-service candidate pinned by TREE `8.4`; FR-2 proves the target machine is checked out to that SHA.
6. **No secret evidence.** Never store credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.
7. **Existing launchers first.** Prefer `SETUP.cmd`, `RUN_TESTS.cmd`, `START_DEMO.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `NEW_TRADING_DAY.cmd`, `START_MARKET_FLOW_US.cmd`, `PREPARE_LIVE_VERIFICATION.cmd`, `CHECK_IBKR_SESSION.cmd`, and `RUN_IBKR_ORDER_ACCEPTANCE.cmd`.
8. **No silent assumptions.** Check prerequisites before the stage that depends on them.
9. **Static is valid.** Equal provider values are not a failure while new complete cycles continue to commit.
10. **Movement is separate evidence.** Only FR-13 satisfies real market-open movement.
11. **Two-pass first run is valid.** FR-0..FR-12 may complete before market hours; if candidate/runtime/environment remain materially unchanged, FR-13 may run later without replaying them.
12. **Do not weaken gates.** `PENDING` movement stays pending. Missing IBKR trading permission is recorded exactly as `PENDING_EXTERNAL_PERMISSION`, never converted to synthetic success.

## First-run tree

```text
FR-0   Freeze exact post-order-service candidate
 |
FR-1   Host prerequisite preflight
 |
FR-2   Acquire/update repository
 |
FR-3   Install deterministic dependencies
 |
FR-4   Fast local correctness
 |
FR-5   Browser build + Chromium E2E
 |
FR-6   Local demo/UI smoke incl. Demo Buy + AI Investigation
 |
FR-7   Local Fake Leumi static acceptance
 |
FR-8   Local Fake dynamic/recovery/restart + Demo Buy/AI closure (A..H)
 |
FR-9   Target-machine isolated + 4096×180 load acceptance
 |
FR-10  Daily DB lifecycle / fresh schema-v4 acceptance
 |
FR-11A Market-data provider deployment smoke
 |
FR-11B IBKR CPGW + standalone order-service compatibility
 |
FR-12  Authenticated static/pre-market market-data acceptance
 |
PRE-MARKET READINESS checkpoint
 |
FR-13  Authenticated market-open movement acceptance
 |
FR-14  Final evidence + operational handoff
```

A later checkpoint never excuses an earlier failure.

---

## FR-0 — Freeze exact candidate

**Goal:** freeze the exact post-order-service product candidate from fresh GitHub release truth before target-machine work begins.

**Required state:** fresh `main` shows TREE `8.4` deterministic reclosure complete and TREE `7.4` current; `.planning/EXECUTOR_HANDOFF.md` records the exact accepted product SHA; no unexpected open product/release work supersedes it.

PASS evidence:

- exact accepted product SHA captured from the handoff;
- current `main`/status authorizes TREE `7.4`;
- later planning/docs-only commits are explicitly not substituted for the accepted product SHA;
- no unexpected open PR or unmerged product work replaces the candidate.

FAIL: candidate identity is ambiguous/missing, `8.4` is not closed, or current GitHub truth no longer authorizes `7.4`.

## FR-1 — Host prerequisite preflight

Verify before dependency installation:

- supported Windows environment;
- Git available;
- Node.js `24.x`;
- npm through that Node installation;
- PowerShell;
- writable local disk for dependencies/Chromium/DuckDB/reports;
- loopback networking;
- ports `8765` and `8770` not occupied by conflicting processes;
- Chromium-family browser for the authenticated market-data path;
- Client Portal Gateway available later for FR-11B if the user intends IBKR compatibility verification.

PASS is a concise sanitized version/capability report. Do not run `npm ci` before FR-1 is green.

## FR-2 — Acquire/update repository

Clone `LirazShay/market-flow-us` once or update the existing checkout, then pin the working tree to the exact accepted SHA frozen in FR-0. Fresh `main` remains release metadata/source-of-truth; it is not silently substituted for the product candidate when later metadata-only commits exist.

For an existing checkout, stop first if the working tree is dirty. Detached exact-SHA checkout is valid and preferred for acceptance.

PASS:

- repository path known;
- working tree clean before switching candidate and before generated outputs/tests;
- `HEAD` equals the exact FR-0 candidate;
- required lockfile, launchers and runtime files exist.

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

Run separately:

```text
npm run test:unit
npm run test:service
npm run test:acceptance:order
```

PASS: all three are green. The standalone order acceptance is synthetic/public-safe and proves the permission-independent IBKR order-service journey; it is not real-order evidence.

## FR-5 — Browser build + Chromium E2E

Run:

```text
npm run build:browser
npm run test:e2e
```

PASS: browser artifacts are generated under documented `dist` paths and full Chromium E2E is green without retry/timeout hiding a deterministic failure.

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
5. Demo Buy controls are available and a Demo Buy page opens;
6. progressive horizon outcomes and targeted `Refresh observation` are usable;
7. `Investigate with AI` is visible and makes no automatic external AI/network call;
8. Generate/Regenerate exposes only bounded product-relative pack metadata with clipboard fallback;
9. Support Snapshot exists;
10. `Ctrl+C` stops cleanly;
11. restart does not corrupt `.demo/market-flow-us.duckdb`.

This is human-visible smoke, not a substitute for FR-7/FR-8 formal acceptance.

## FR-7 — Local Fake Leumi static acceptance

Run:

```text
RUN_LOCAL_ACCEPTANCE.cmd static
```

PASS requires repeated identical complete responses with durable commit acknowledgement, History growth, stable Current when source values are equal, correct universe revision/reads/ownership/status, clean stop and sanitized candidate/profile report.

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

PASS semantics remain the durable Demo Buy/AI contracts: movement reaches Current/History, membership is revision-ACKed, failure/recovery is fail-closed and diagnosable, restart preserves committed authority, Demo Buy persists trusted provenance/outcomes, and AI packs remain sharing-safe/collision-safe without operational/session leakage.

## FR-9 — Target-machine isolated + end-to-end load acceptance

Run narrow-to-broad:

```text
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
```

Representative target profile:

```text
4096 securities
× 180 completed end-to-end cycles
= 737280 history rows
```

The target-machine end-to-end ceiling is five minutes. Preserve sanitized reports and candidate SHA.

## FR-10 — Daily DB lifecycle acceptance

Start with active-day market data, at least one Demo Buy capture/item and at least one saved Scanner query. Stop producer/service, ensure no process owns the DB, then run:

```text
NEW_TRADING_DAY.cmd
```

PASS:

- valid schema v3 or v4 source accepted;
- optional prior-day archive preserves source unchanged;
- fresh active DB is schema v4;
- market and Demo Buy state starts clean for the new day;
- saved Scanner queries are preserved;
- running session prevents rollover.

The separate IBKR execution DuckDB is not part of New Trading Day.

## FR-11A — Market-data provider deployment smoke

Use the already-authenticated eligible provider page and run:

```text
START_MARKET_FLOW_US.cmd
```

The user supplies the page URL; launcher reduces it to the exact allowed Origin, starts the local service, and the user executes the bookmarklet manually on the authenticated page.

PASS: runtime/service connect and reach a valid running state or a stable diagnosable provider error without copying authentication material. A provider error must be fixed before FR-12.

## FR-11B — IBKR CPGW + standalone order-service compatibility

This is a separate execution/provider boundary from Market Flow US market-data collection.

Prerequisite: Client Portal Gateway is already running and authenticated manually by the user. The product never automates CPGW credential login.

First run deterministic standalone proof on the exact accepted candidate:

```text
RUN_IBKR_ORDER_ACCEPTANCE.cmd
```

PASS requires a sanitized synthetic-only report proving auth/origin protection, BUY/SELL preview, DRY_RUN no-submit, restart/idempotency, explicit fake-LIVE reply confirmation, cancel/partial/full fill handling, acknowledgement-unknown reconciliation, no-short-opening guard and clean stop.

Then run safe real CPGW session compatibility:

```text
CHECK_IBKR_SESSION.cmd
```

If the local CPGW certificate is not trusted and the documented scoped localhost-only fallback is required:

```text
CHECK_IBKR_SESSION.cmd INSECURE_LOCALHOST_TLS
```

PASS requires a sanitized session-compatibility result through the protected local order-service path. The check must not submit an order and must not persist or print credentials, caller token, provider account identifier or authenticated response body.

Actual real-order submission is **not** required for FR-11B when external IBKR trading permission is unavailable. In that case record exactly:

```text
PENDING_EXTERNAL_PERMISSION
```

When permission exists, any real-order verification remains explicitly user-initiated, bounded, SHA-bound and provider-compliant; deterministic fake-provider success never masquerades as real-order success.

## FR-12 — Authenticated static / pre-market market-data acceptance

Run:

```text
PREPARE_LIVE_VERIFICATION.cmd
```

The gate requires at least 20 complete committed provider cycles spanning at least 60 seconds, plus validation, universe handling, Current/Security/History, bounded Scanner, ownership/status and clean stop.

PASS requires:

```text
overall = "PASS"
```

Before market movement a valid result may be:

```text
overall = "PASS"
movement.status = "PENDING"
movement.code = "NO_MARKET_MOVEMENT_OBSERVED"
```

Equal values are valid only while new complete cycles, commit ACKs and History continue advancing.

### PRE-MARKET READINESS

If FR-0 through FR-12, including FR-11A and FR-11B, are green, record:

```text
PRE-MARKET READINESS = PASS
FR-13 = PENDING MARKET MOVEMENT
```

`PENDING_EXTERNAL_PERMISSION` for optional real-order placement does not invalidate PRE-MARKET READINESS when deterministic order acceptance and real CPGW session compatibility are green.

If only market hours change and candidate/runtime/environment stay materially unchanged, do not replay FR-0..FR-12; resume at FR-13.

## FR-13 — Authenticated market-open movement acceptance

On the same accepted candidate, rerun the SHA-bound market-data gate during actual market movement.

The movement witness must come from the current run's committed cycle range. `collected_at_ms` is excluded. Eligible persisted provider fields include `Price`, `ChangePercent`, `BidRate`, `AskRate`, `DailyVolume` and `TradeDateTime`.

PASS requires:

```text
overall = "PASS"
movement.status = "PASS"
movement.observed = true
movement.currentReflected = true
movement.historyReflected = true
```

and at least 20 consecutive complete provider cycles spanning at least 60 seconds, with committed Current/History reflection, bounded Scanner, correct ownership/status and clean stop.

If no real provider-field change is observed, movement remains `PENDING`. If change is observed but Current/History reflection cannot be proven, movement is `FAIL` and must be fixed before FR-14.

## FR-14 — Final evidence and operational handoff

Record a compact final closure containing:

- exact accepted post-order-service product SHA;
- FR-0..FR-13 statuses, including FR-8A..FR-8H and FR-11A/FR-11B;
- deterministic IBKR order-service report status;
- real CPGW session compatibility status;
- real-order evidence status: `PASS` only when explicitly performed with permission, otherwise exactly `PENDING_EXTERNAL_PERMISSION`;
- if two-pass market-data acceptance: FR-12 pre-market report and FR-13 market-open report on the same SHA;
- sanitized local report names/paths;
- normal active DB path `data/market-flow-us.duckdb`;
- separate order execution DB handling as documented by the order-service operator guide;
- proven daily stop/archive/new-day procedure;
- normal start/stop commands for both processes;
- Demo Buy / AI Investigation recovery path;
- Support Snapshot path;
- no blocking defect;
- required CI/main closure green after any acceptance-discovered fix.

Only after TREE `7.4` success evidence is satisfied and final PR/merge/main-green/open-PR truth is clean may overall product completion be declared.

## Evidence / security rules

Prefer compact machine-readable sanitized reports. Reports may contain candidate SHA, profile/checkpoint names, bounded counters/timings and stable failure codes.

They must never contain credentials, cookies, caller tokens, auth headers, account identifiers, private browser/session state or raw authenticated provider responses. AI Investigation Packs remain separate user-created artifacts governed by their sharing-safety contract.

## Troubleshooting routing

```text
FR-0..FR-2   repository/release state
FR-3         toolchain/install
FR-4         unit/service/order deterministic correctness
FR-5         build/Chromium E2E
FR-6         local UI/runtime
FR-7..FR-8  Local Fake / Demo Buy / AI feature acceptance
FR-9         target-machine persistence/read/full-load performance
FR-10        DB lifecycle/new-day
FR-11A       market-data deployment/browser/provider startup
FR-11B       IBKR order-service / CPGW compatibility
FR-12        authenticated static market-data compatibility
FR-13        real market movement/reflection
FR-14        evidence/operational closure
```

## User-facing sources

- `docs/FIRST_RUN_ACCEPTANCE.md` — authoritative user execution runbook;
- `docs/IBKR_ORDER_SERVICE_OPERATOR.md` — order-service startup, token, CPGW and acceptance details;
- `START_HERE.md` — short operational entry point;
- `docs/LOCAL_FAKE_ACCEPTANCE.md` — Local Fake/workload profiles;
- `docs/LIVE_VERIFICATION.md` — authenticated market-data static + movement gate;
- `docs/USER_GUIDE.md` — normal product usage.
