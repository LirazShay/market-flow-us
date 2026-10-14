# B-US-000 — Historical final target-machine/provider acceptance provenance

## Backlog metadata

- Status: `Superseded / provenance only`
- Blocking: `No`
- Origin: former active PLAN/EXECUTION task `7.4`
- Unified successor: active execution task `B-US-009`
- Unified runbook: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`
- Unified evidence ledger: `.planning/FINAL_ACCEPTANCE_EXECUTION.md`

## Current rule

This file no longer represents an independently activatable final acceptance task.

Its still-relevant scope has been consolidated into the single post-merge target-machine/Desktop/provider acceptance task `B-US-009` together with Branch-11 Research/Desktop evidence and Branch-12 Trading external evidence.

Do **not** create or activate a second acceptance blocker from `B-US-000`. Use `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` and the `B-US-009` row in `.planning/EXECUTION.md`.

## Historical scope retained as provenance

This item originally covered the maintained `FR-*` target-machine/provider path:

- target-machine repository/candidate verification;
- deterministic dependency install and unit/service/Replay/order acceptance;
- browser + Replay build and Chromium E2E;
- local UI smoke;
- Local Fake static/dynamic/recovery/restart proof;
- Demo Buy and AI Investigation closure;
- isolated and representative target workload;
- daily DB lifecycle;
- authenticated market-data deployment smoke;
- standalone order-service + real CPGW session compatibility;
- integrated current-Detail `DRY_RUN`;
- authenticated static/pre-market and market-open movement proof.

All still-relevant items above are now consumed by the unified `U0..U6` runbook under `B-US-009` rather than by this backlog record.

## Historical candidate policy

An earlier deferred attempt selected:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

That SHA is historical provenance only. The unified acceptance selects a fresh intended post-merge `main` candidate when `B-US-009` becomes the current execution pointer.

## LIVE rule carried forward

Real IBKR LIVE submission is PASS only if real external trading permission exists and the user explicitly initiates it through the protected existing operator/order-service path. Otherwise the unified ledger records exactly:

```text
PENDING_EXTERNAL_PERMISSION
```

Synthetic/DRY_RUN evidence must never be relabeled as real LIVE success.

## Defect and security rules carried forward

Any deterministic defect discovered during the unified acceptance stays with that acceptance executor through root cause → smallest correct fix → regression proof → affected verification → merge/main-green → resume from the earliest invalidated gate.

Preserve only sanitized evidence. Never commit credentials, cookies, tokens, authorization/session material, caller tokens, account identifiers, private browser state or raw authenticated responses/dumps.