# Market Flow US — Unified Final Acceptance Evidence Ledger

This file is the public-safe checkpoint ledger for the **single** post-merge user/target-machine acceptance task `B-US-009`.

## Current state

- Execution task: `B-US-009`
- Status before final Branch-12 merge: `blocked`
- Current repository pointer remains `12.9 / Chat 50` until implementation/repository reclosure is merged.
- Unified runbook: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`
- Candidate: `NOT_SELECTED_UNTIL_POST_MERGE`
- Blocking implementation merge: **No**
- External PASS fabricated: **No**

`B-US-009` now consolidates the still-relevant external scope from the former Research-only target-machine task, historical `B-US-000` final provider acceptance, and Branch-12 external Trading evidence. There must not be a second active final user-acceptance task.

## Historical provenance — not current PASS

The old deferred `B-US-000` attempt selected:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

It historically recorded `FR-0` PASS and a then-current host preflight PASS before deferral. Those facts are provenance only and do not pin or prove a future target-machine run.

Branch-11 `W2T/W3` remain **NOT PASS** until executed against the post-merge candidate on the user's target machine.

Branch-12 real live-market shadow remains **NOT PASS** until the clean candidate-bound runner and verifier pass against the user's authenticated CPGW session.

A real-money LIVE order remains **NOT RUN** unless external permission exists and the user explicitly initiates a bounded verification. If permission and/or explicit initiation is absent during the final run, record exactly `PENDING_EXTERNAL_PERMISSION` rather than fabricating PASS.

## Unified checkpoint ledger

| Gate | Current state | Required evidence |
|---|---|---|
| `U0` exact post-merge candidate | `BLOCKED_PRE_MERGE` | Final implementation PR merged; intended `main` CI green; no superseding implementation PR; exact clean target-machine checkout SHA recorded. |
| `U1` host/setup/deterministic target sanity | `PENDING` | `FR-1..FR-5`: Node 24/tooling, setup, unit/service, Replay/order acceptance, browser/Replay build and Chromium E2E on the accepted candidate. |
| `U2` local product/workload/daily lifecycle | `PENDING` | `FR-6..FR-10`: local UI/Demo Buy/AI, Local Fake dynamic/recovery/restart, representative `4096 × 180` target workload and daily schema-v4 rollover. |
| `U3` Research + Desktop | `PENDING` | `W2T` actual-evidence workload PASS; repository Desktop/MCP preflight PASS; real Desktop plugin mission and full restart/fresh-conversation resume of exact durable `researchRunId`. |
| `U4` real market-data provider | `PENDING` | `FR-11A`, `FR-12`, `FR-13`: real provider deployment path, static/pre-market SHA-bound proof and real market-movement + Current/History reflection. |
| `U5.1` standalone order + real CPGW | `PENDING` | Deterministic standalone order acceptance plus sanitized real CPGW session compatibility. |
| `U5.2` Branch-12 live SHADOW | `PENDING` | `trading-live-shadow` + verifier PASS bound to exact clean candidate; exact/fresh/usable quote; zero order build/mutation/order-reference; `nextStageEnabled=false`. |
| `U5.3` real-session DRY_RUN | `PENDING` | Current-Detail immutable ticket → trusted local confirmation → existing order-service DRY_RUN with no provider LIVE submit. |
| `U5.4` human-confirmed LIVE boundary | `PENDING` | Real-order PASS only if permission exists and user explicitly initiates protected bounded verification; otherwise exactly `PENDING_EXTERNAL_PERMISSION`. No raw provider shortcut. |
| `U6` final evidence/reclosure | `PENDING` | U0–U5 complete under runbook rules; no blocking defect; accepted SHA and sanitized evidence indexed; required `main` CI green after any acceptance-driven fix. |

## Evidence discipline

For every executed gate record only:

- candidate commit;
- gate/sub-check state;
- bounded public-safe measurements/reason codes;
- sanitized report name or local relative path where useful;
- durable public-safe IDs required for restart/resume proof;
- exact external blocker when a gate cannot execute.

Never record credentials, cookies, tokens, authorization/session data, account identifiers, raw authenticated responses/dumps, private browser state, sensitive filesystem paths or environment dumps.

## Failure rule

On the first deterministic `FAIL`:

1. stop the acceptance sequence;
2. perform RCA;
3. fix the root cause;
4. add regression proof;
5. run affected verification;
6. merge with required CI green;
7. select/reconfirm the candidate and resume from the earliest invalidated gate.

Do not skip around a known failure and do not preserve stale candidate-bound PASS after an invalidating runtime fix.