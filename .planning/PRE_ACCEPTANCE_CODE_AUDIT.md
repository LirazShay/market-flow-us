# Market Flow US — Pre-Acceptance Extension Code Audit

## Purpose

Before final target-machine/provider acceptance, perform one deliberate code-centric audit of the recently added capability extensions so acceptance is not the first place where integration defects, lifecycle races, security regressions or missing failure handling are discovered.

This is **not** a replacement for TREE `7.4` acceptance. It is a deterministic pre-acceptance reclosure step that must finish first.

The audit must not claim that software can be proven to contain literally zero bugs. Its completion claim is narrower and testable:

```text
no known material defect remains
+ no material code area in the scoped extension window is left unreviewed
+ every discovered blocking defect is root-caused, fixed and regression-proven
+ required deterministic gates are green
```

## Exact scope

Audit the product delta from the completed post-Demo-Buy/AI reclosure candidate:

```text
base: e0af9d105004f175a44ec33fa481fba0631773bf
```

to the current frozen runtime candidate entering final acceptance:

```text
head: 93a48c8b0a36433e58f09f6a607ec7cd366c9aea
```

That delta is 35 commits and includes the new/recent capability families:

- standalone IBKR order service (`8.1`–`8.4`);
- basic in-product Detail BUY (`8.5`);
- Market Recording + Replay (`9.1`–`9.5`);
- Replay adversarial hardening (`9.6`);
- shared Viewer/service/protocol/config/diagnostics seams changed by those features;
- Windows launchers, build scripts, focused acceptance scripts and CI/test wiring added or changed by those features.

Historical Demo Buy/AI implementation itself remains covered by completed `7.5`; this audit still checks any interaction seam where later order/Replay work could regress Demo Buy/AI, Scanner, Current, Detail or ordinary live runtime behavior.

## Audit rules

For every stage:

1. Read contracts before judging code.
2. Inspect implementation and tests together; a green test does not excuse an unreviewed material code path.
3. Review both success paths and failure/cleanup/restart paths.
4. Prefer proof of observable contracts over internal implementation preferences.
5. Do not invent speculative subsystems or rewrites; use the smallest sufficient root-cause fix.
6. Stop on the first blocking defect inside a stage, fix it, add deterministic regression proof, run affected verification, then resume the audit.
7. Any changed/new SQL must obey the `AGENTS.md` 10+ stage static SQL gate before execution.
8. Keep repository/evidence public-safe: no credentials, cookies, auth/session material, account identifiers, private browser state or raw authenticated dumps.
9. Record every reviewed material area and final disposition in `.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPORT.md`.

## Mandatory review dimensions

Every scoped implementation area is reviewed against these dimensions where applicable:

- contract/implementation drift;
- validation and boundary conditions;
- state-machine correctness;
- concurrency, stale callbacks and race windows;
- idempotency and duplicate/retry behavior;
- acknowledgement-unknown semantics;
- restart and persistence semantics;
- resource/process/port/DB ownership;
- error propagation, cleanup and partial-failure behavior;
- security boundaries, Origin/CORS/CSRF/token handling and fail-closed behavior;
- privacy/sanitization and diagnostic leakage;
- malformed/untrusted input handling;
- storage/quota/file/truncation behavior;
- browser/UI stale-state and double-action behavior;
- isolation between normal live runtime, Replay and execution paths;
- launcher/config defaults and explicit LIVE opt-in;
- missing or misleading tests;
- avoidable recurring test/runtime cost introduced by the new code.

## Stage 1 — Delta inventory and contract-to-code map (`7.6.1`)

Goal: prove the review covers the complete recent extension delta rather than sampling a few headline files.

Required work:

- inventory all production/runtime files changed between the exact base/head SHAs;
- classify each file into order service, Basic BUY, Replay/Recording/Host, shared integration or packaging/verification;
- map every production file to the governing contract and existing proof;
- identify cross-feature seams and any file with no meaningful direct regression proof;
- create the initial audit report matrix with `PENDING` disposition for every material review area.

PASS:

- no production/runtime file in scope is unmapped;
- no material shared seam is omitted merely because it is small;
- the next audit stages have explicit file/risk/proof routes.

## Stage 2 — IBKR order service + Basic BUY deep audit (`7.6.2`)

Review:

- intent normalization and validation;
- local caller security and browser-Origin rejection;
- operator/config parsing and DRY_RUN/LIVE separation;
- DuckDB request/idempotency/provider-state persistence;
- CPGW request lifecycle and scoped localhost TLS behavior;
- LIVE gate conjunction and SELL long-position guard;
- submit/reply/cancel/fill/reconciliation and acknowledgement-unknown handling;
- service shutdown/restart and token invalidation;
- Basic BUY ticket immutability/expiry/reuse;
- confirmation listener Origin/CSRF/custom-header protections;
- Node-only sidecar caller token boundary;
- stable `requestId` reuse under double-click/retry;
- child-process ownership/startup/failure/cleanup;
- normal runtime, Scanner, Demo Buy, AI and Replay remaining unable to execute orders.

Executable proof must include existing focused order acceptance plus the smallest new deterministic regressions for any material gap discovered by review.

PASS only when no known material order/BUY defect or materially unproved risk remains.

## Stage 3 — Recording/Replay/Host deep audit (`7.6.3`)

Review:

- recorder start/stop ownership and frame commit ordering;
- IndexedDB lifecycle, quota/write failure and prior-commit preservation;
- portable manifest/frame/footer validation and streaming behavior;
- direct file source/indexing and malformed/truncated input handling;
- Player irregular scheduling and contemporary timestamp rebasing;
- Pause/Resume/Stop/Seek generation cancellation and stale callbacks;
- ProducerBridge ACK/error sequencing;
- Replay Host Origin/ephemeral credential/one-run pairing;
- process/port/path ownership, child teardown and foreign-process refusal;
- fresh DB semantics for Stop→Play and Seek; same DB for Pause/Resume;
- zero hidden preroll/fast-forward;
- ordinary live DB/process isolation;
- progressive missing-history behavior across Current/Detail/Scanner/Demo Buy/AI;
- UI/controller stale source/load/play races;
- launcher/build/cleanup behavior.

Reuse completed `9.6` evidence where it proves the exact risk, but independently inspect the code rather than treating the earlier audit report as proof by assertion.

PASS only when no known material Replay defect or materially unproved risk remains.

## Stage 4 — Shared integration and regression audit (`7.6.4`)

Review all shared seams changed by the extension window, including:

- `local-service/server/config.js`;
- `local-service/server/index.js`;
- `local-service/server/service.js`;
- `browser/viewer/client.js`;
- `browser/viewer/detail-surface.js`;
- shared protocol/diagnostics additions;
- affected launchers/build scripts/package scripts;
- New Trading Day ownership boundaries;
- CI/test routing introduced by the new features.

Cross-feature invariants to prove:

- ordinary `START_MARKET_FLOW_US.cmd` remains execution-disabled;
- Replay remains external and shared server/protocol remain replay-unaware;
- BUY-enabled composition does not grant generic Viewer execution authority;
- normal live market DB is not owned/reset by Replay or order tooling;
- separate order DuckDB is not owned by New Trading Day;
- Detail BUY additions do not regress ordinary Detail/History behavior;
- Replay and order additions do not break Scanner/Demo Buy/AI/current ordinary behavior;
- diagnostics remain sanitized;
- no test-only bypass exists in production composition.

PASS only when affected ordinary-product regression proof is green and no material integration gap remains.

## Stage 5 — Adversarial verification and deterministic reclosure (`7.6.5`)

After all static/deep review stages are PASS:

- run focused tests for every changed/fixed area;
- run `npm run test:unit`;
- run `npm run test:service`;
- run `npm run test:acceptance:replay`;
- run `npm run test:acceptance:order`;
- run `npm run build:browser`;
- run `npm run build:replay`;
- run full Chromium E2E;
- run bounded Local Fake/feature acceptance materially covering the affected integration seams;
- run Planning Docs CI and bounded Workload sanity;
- inspect recurring runtime for newly introduced avoidable cost;
- review the complete final diff from the audit work;
- require PR CI green, squash merge, main CI green and clean open-PR audit.

The final audit report must record:

- exact base/head reviewed;
- exact final runtime candidate after any fixes;
- every material area and disposition;
- every defect found, root cause, fix and regression proof;
- required deterministic verification results;
- any genuinely external/user-dependent evidence left only for `7.4`.

If no runtime fix is required, the existing runtime SHA may remain the candidate, but the audit still requires fresh deterministic reclosure evidence. If a runtime fix is merged, the resulting main runtime SHA supersedes `93a48...` as the candidate for `7.4`.

## Final acceptance gate

TREE `7.4` is blocked until `7.6.5` is `done`.

Once this audit closes, final target-machine/provider acceptance resumes against the exact audited/reclosed runtime candidate. FR-level evidence already gathered may be reused only when the audited runtime changes cannot invalidate it; otherwise rerun the affected checkpoint.
