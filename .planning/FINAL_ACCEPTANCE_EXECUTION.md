# Market Flow US — Unified Final Acceptance Evidence Ledger

This file is the public-safe checkpoint ledger for the **single** user/target-machine acceptance task `B-US-009`.

## Current state

- Execution task: `B-US-009`
- Status: `blocked` on user target-machine/Desktop/provider prerequisites only
- Current repository pointer: `B-US-009`
- Unified runbook: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`
- Candidate: `NOT_SELECTED_UNTIL_U0_START`
- Blocking implementation merge: **No**
- Development/repository completion: **Yes**
- External PASS fabricated: **No**

Branch-12 implementation/repository work is complete. PR #131 squash-merged as `348405a96ffb6ddf86ca7bb267eb124afc5bbb1f`; post-merge `main` Planning #1445, Fast #1219, Browser #760, Replay #277 and Workload #733 are green, and the open-PR audit is clean.

`B-US-009` consolidates the still-relevant external scope from the former Research-only target-machine task, historical `B-US-000` final provider acceptance, and Branch-12 external Trading evidence. There must not be a second active final user-acceptance task.

The exact acceptance candidate is intentionally selected only when the user starts `U0`. At that time fetch fresh intended `main`, record the exact SHA, and use a clean checkout of that SHA for all candidate-bound evidence. This avoids pinning a stale candidate while the user performs acceptance later at their convenience.

## Historical provenance — not current PASS

The old deferred `B-US-000` attempt selected:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

It historically recorded `FR-0` PASS and a then-current host preflight PASS before deferral. Those facts are provenance only and do not pin or prove a future target-machine run.

Branch-11 `W2T/W3` remain **NOT PASS** until executed against the U0-selected candidate on the user's target machine.

Branch-12 real live-market shadow remains **NOT PASS** until the clean candidate-bound runner and verifier pass against the user's authenticated CPGW session.

A real-money LIVE order remains **NOT RUN** unless external permission exists and the user explicitly initiates a bounded verification. If permission and/or explicit initiation is absent during the final run, record exactly `PENDING_EXTERNAL_PERMISSION` rather than fabricating PASS.

## Unified checkpoint ledger

| Gate | Current state | Required evidence |
|---|---|---|
| `U0` exact post-merge candidate | `READY_FOR_USER_START` | User starts final acceptance; fetch fresh intended `main`; confirm no superseding implementation PR; record exact clean target-machine checkout SHA. |
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
