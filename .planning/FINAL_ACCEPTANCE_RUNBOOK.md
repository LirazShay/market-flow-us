# Market Flow US — Unified Post-Merge Final Acceptance Runbook

This is the **single authoritative user/target-machine acceptance runbook** that remains after the final Branch-12 implementation merge.

It consolidates the still-relevant external acceptance scope from:

- active task `B-US-009` (AI Researcher target-machine + ChatGPT Desktop acceptance);
- historical backlog provenance `B-US-000` (final target-machine/provider acceptance);
- Branch-12/TREE `12.9` external Trading evidence (real live-market shadow and any explicitly user-initiated LIVE boundary evidence).

There must not be a second concurrent final user-acceptance task. `B-US-009` is the single execution identity for this post-merge run. `B-US-000` remains provenance only and must not be reactivated independently.

## Authority

- `.planning/EXECUTION.md` owns task/status/dependency/result truth.
- This file owns the unified acceptance order and PASS semantics.
- `.planning/FINAL_ACCEPTANCE_EXECUTION.md` owns the public-safe checkpoint/evidence ledger for the unified run.
- `docs/FIRST_RUN_ACCEPTANCE.md` remains the detailed procedure for the legacy/local/provider `FR-*` checks consumed below; old task-ID/authority wording inside that document is subordinate to this runbook.
- `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md` remains the detailed `W2T/W3` Research/Desktop procedure consumed below.
- `docs/AUTONOMOUS_AI_TRADING.md` remains the Branch-12 Trading authority, including the staged acceptance and explicit human-confirmed LIVE boundary.

## Activation boundary

Do **not** start this user acceptance before the final Branch-12 implementation/reclosure PR has been merged and repository reclosure proves:

1. the intended implementation is on `main`;
2. required `main` CI is green;
3. there is no open implementation PR that supersedes the candidate;
4. `.planning/EXECUTION.md` has advanced the current pointer from `12.9 / Chat 50` to `B-US-009`.

Until then, all external target-machine/provider/Desktop checks remain NOT PASS and non-blocking for the implementation merge.

## Candidate policy

At activation:

1. fetch fresh `main`;
2. select the latest intended merged runtime candidate;
3. record the exact SHA in `.planning/FINAL_ACCEPTANCE_EXECUTION.md`;
4. use one clean checkout of that SHA for all candidate-bound checks;
5. do not mix evidence from different SHAs;
6. if a fix changes runtime behavior, resume from the earliest acceptance gate invalidated by that fix.

Historical candidates such as `682f8c8b01e9f68c7f8e159de8b0f233221f1878` are provenance only and are never an automatic future target.

## State vocabulary

Use only explicit evidence states:

- `PASS` — actually executed and satisfied the gate;
- `FAIL` — actually executed and failed; stop and perform RCA;
- `BLOCKED_EXTERNAL` — cannot execute because the required external product/provider/machine condition is unavailable;
- `PENDING` — not executed yet;
- `PENDING_EXTERNAL_PERMISSION` — real-money order submission was not executed because external trading permission and/or explicit user initiation is absent.

Never translate deterministic/synthetic/controlled evidence into external PASS.

## Unified execution order

Run the gates serially. Stop on the first `FAIL`. A `BLOCKED_EXTERNAL` state blocks this acceptance task at that gate but does not retroactively invalidate already-green implementation evidence.

```text
U0 exact post-merge candidate
→ U1 host/setup/deterministic target sanity
→ U2 local product/workload/daily lifecycle
→ U3 Research actual-evidence + ChatGPT Desktop restart/resume
→ U4 real market-data provider static + movement acceptance
→ U5 IBKR/Trading real-session + live-shadow + DRY_RUN + LIVE-boundary evidence
→ U6 final evidence/reclosure
```

### U0 — Exact post-merge candidate

On repository truth first, then the target machine:

```text
git fetch origin
git status --short
git switch --detach <accepted-main-SHA>
git status --short
git rev-parse HEAD
```

PASS requires a clean checkout and exact SHA equality with the candidate recorded in the evidence ledger.

### U1 — Host, setup and deterministic target sanity

Follow `FR-1` through `FR-5` in `docs/FIRST_RUN_ACCEPTANCE.md`.

Core commands include:

```text
node --version
npm --version
git --version
powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"
SETUP.cmd
npm run test:unit
npm run test:service
npm run test:acceptance:replay
npm run test:acceptance:order
npm run build:browser
npm run build:replay
npm run test:e2e
```

Node must be `24.x`. Deterministic Replay/order acceptance is target-machine sanity evidence, not real-provider evidence.

### U2 — Local product, representative workload and daily lifecycle

Follow `FR-6` through `FR-10` in `docs/FIRST_RUN_ACCEPTANCE.md`.

Required product checks include:

```text
START_DEMO.cmd
RUN_LOCAL_ACCEPTANCE.cmd all
RUN_LOCAL_ACCEPTANCE.cmd isolated
RUN_LOCAL_ACCEPTANCE.cmd target
NEW_TRADING_DAY.cmd
```

PASS includes the maintained UI/Demo Buy/AI Investigation/recovery/restart semantics, the representative `4096 × 180` workload ceiling, clean shutdown and the daily archive/new-schema-v4 lifecycle. Replay/order databases must remain isolated from the normal active market database.

### U3 — Research actual-evidence + real ChatGPT Desktop path

Run the exact `W2T/W3` procedure in `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md` against the same accepted candidate.

Repository/machine gates:

```text
npm run research-target:workload
npm link
npm run research-desktop:preflight
```

`W2T` must use existing target-machine Market Flow US historical evidence with no synthetic fallback. The public-safe report must show `result = pass`, source immutability and the documented target resource/idempotency/reopen evidence.

Then perform the real ChatGPT Desktop plugin mission, followed by a full Desktop/MCP restart and a second fresh conversation that resumes the exact durable `researchRunId` without copying prior-chat state.

Direct Node/MCP scripts, web ChatGPT or historical CI do not substitute for `W3`. If the documented Desktop local-plugin surface is unavailable despite a green repository preflight, record `BLOCKED_EXTERNAL` with only public-safe product/build/error facts.

### U4 — Real market-data provider acceptance

Use the maintained `FR-11A`, `FR-12` and `FR-13` procedures in `docs/FIRST_RUN_ACCEPTANCE.md`.

The intended sequence is:

```text
START_MARKET_FLOW_US.cmd
→ authenticated provider page + generated bookmarklet
→ PREPARE_LIVE_VERIFICATION.cmd
→ closed/static or pre-market SHA-bound proof
→ market-open SHA-bound movement proof
```

`FR-12` may PASS with real cycles and no movement while the market is static. `FR-13` requires actual provider movement plus authoritative Current/History reflection. Do not manufacture movement from local timestamps.

### U5 — IBKR + Branch-12 Trading external evidence

Client Portal Gateway must be running and authenticated manually. The product never performs credential login.

#### U5.1 — Standalone order-service and real CPGW compatibility

Use the maintained `FR-11B` procedure:

```text
RUN_IBKR_ORDER_ACCEPTANCE.cmd
CHECK_IBKR_SESSION.cmd
```

If the documented loopback-only TLS fallback is required:

```text
CHECK_IBKR_SESSION.cmd INSECURE_LOCALHOST_TLS
```

The deterministic standalone acceptance remains synthetic-only. The session check is the real CPGW compatibility evidence and must remain sanitized.

#### U5.2 — Branch-12 live-market SHADOW observation

Run from the exact clean accepted candidate while CPGW is authenticated:

```text
npm run trading-live-shadow -- --symbol=AAPL
npm run trading-live-shadow:verify -- --expected-commit=<accepted-main-SHA>
```

Use `--allow-insecure-loopback-tls` only when the documented local CPGW certificate fallback is actually required.

The retained public-safe report at `tmp/trading-live-shadow-evidence.json` may PASS only when it is bound to the accepted commit and proves:

- `check = LIVE_MARKET_SHADOW_OBSERVATION`;
- `status = PASS`;
- `candidateCommit` equals the accepted SHA;
- `checkoutClean = true`;
- mode is `SHADOW`;
- instrument resolution is exact;
- quote is available, fresh and usable for a new decision;
- no order-intent build or broker mutation occurred;
- no durable order reference was created;
- `nextStageEnabled = false`.

This is read-only market-data evidence and never enables another mode automatically.

#### U5.3 — Real-session DRY_RUN compatibility

Run the maintained `FR-11C` current-Detail BUY `DRY_RUN` flow from `docs/FIRST_RUN_ACCEPTANCE.md` / `docs/BASIC_BUY_INTEGRATION.md`:

```text
current Detail
→ immutable BUY ticket
→ trusted local confirmation
→ existing order-service DRY_RUN path
```

PASS requires the established nonce/origin/confirmation/idempotency protections and zero provider LIVE submit.

The Branch-12 composed DRY_RUN/provider-what-if and synthetic-broker stages are already repository-controlled acceptance evidence and are rerun by the deterministic suites in U1. Do not relabel those controlled stages as real provider LIVE evidence.

#### U5.4 — Human-confirmed LIVE boundary

There is intentionally **no generic raw LIVE command** in this runbook and no direct Trading/MCP → CPGW shortcut may be invented for acceptance.

If real external trading permission is unavailable, or the user does not explicitly choose to initiate a bounded real-order verification, record exactly:

```text
PENDING_EXTERNAL_PERMISSION
```

That is an honest accepted external-permission disposition; it is not a real-order PASS.

If permission exists **and** the user explicitly initiates a real-order verification, it must use only the existing protected order-service/operator path on the exact candidate and preserve all current gates: explicit human confirmation, final Hard Risk re-evaluation immediately before mutation, provider preflight/permission checks, stable request ID/idempotency and acknowledgement-unknown reconciliation. Record only public-safe outcome facts. Never improvise raw provider calls or bypass a confirmation/risk boundary.

### U6 — Final evidence and handoff

Record in `.planning/FINAL_ACCEPTANCE_EXECUTION.md`:

- exact accepted `main` SHA;
- U0–U6 states;
- detailed `FR-*` results consumed by U1/U2/U4/U5;
- `W2T`, Desktop preflight and `W3` restart/resume states;
- live-shadow report verification state;
- real CPGW session state;
- current-Detail DRY_RUN state;
- real-order state (`PASS` only if actually executed, otherwise `PENDING_EXTERNAL_PERMISSION`);
- market-open movement evidence state;
- local sanitized report names/locations only;
- source immutability/replay isolation/daily rollover facts;
- any external blocker;
- confirmation that no blocking defect remains and required `main` CI is green after any acceptance-driven fix.

`B-US-009` may move to `done` only when every required gate is PASS or has the explicitly permitted `PENDING_EXTERNAL_PERMISSION` disposition for real-money placement, with no other `PENDING`, `FAIL` or `BLOCKED_EXTERNAL` checkpoint remaining.

## Defect ownership

A deterministic defect discovered during this acceptance stays with the acceptance executor:

```text
root cause
→ smallest correct fix
→ regression proof
→ affected verification
→ merge
→ main CI green
→ resume from earliest invalidated acceptance gate
```

Do not patch only the symptom and do not advance around a known failure.

## Security

Evidence must remain public-safe. Never commit or paste credentials, cookies, authorization headers, caller tokens, provider session material, account identifiers, private browser data, raw authenticated responses/dumps or environment dumps containing secrets.

Use only bounded/sanitized reports and durable public-safe IDs.