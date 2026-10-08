# B-US-000 — Deferred final target-machine/provider acceptance

## Backlog metadata

- Status: `Backlog`
- Priority: `Unprioritized`
- Blocking: `No`
- Origin: former active PLAN/EXECUTION task `7.4`
- Historical evidence: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`, `.planning/FINAL_ACCEPTANCE_EXECUTION.md`, `docs/FIRST_RUN_ACCEPTANCE.md`

## Non-blocking rule

This task must **not** block unrelated planning, development, pull requests, CI, or future execution.

Its position as the first item in `backlog/README.md` is an organizational preference only. It creates no dependency edge and gives the task no authority over other work.

If new product/runtime development is merged before this task is executed, development continues normally. The acceptance candidate is selected again when this backlog item is explicitly planned and allocated.

## Candidate policy

Do not keep an old runtime SHA permanently pinned while development moves forward.

When this task is activated in the future:

1. fetch fresh `main`;
2. review merged product/runtime changes since the last acceptance evidence;
3. select the **latest intended runtime candidate** that includes the development meant to be accepted;
4. record that exact SHA for that acceptance run;
5. invalidate/rerun candidate-bound evidence affected by later runtime changes;
6. reuse older evidence only where the current contract explicitly proves it cannot have been invalidated.

A later metadata/docs-only commit does not need to become the runtime candidate merely because it is newer, but a newer merged product/runtime change must not be silently ignored in favor of a stale acceptance SHA.

## Goal

Accept the then-current intended Market Flow US runtime on the user's target machine through local day-bounded market proof, Replay usability/isolation, AI Investigation usability, Basic Detail BUY compatibility, standalone IBKR compatibility, authenticated static compatibility and market-open movement.

## Required scope

When explicitly activated and planned, cover the maintained FR acceptance procedure, including:

- target-machine repository/candidate verification;
- deterministic dependency install;
- unit/service/Replay/order deterministic acceptance;
- browser + Replay build and Chromium E2E;
- local UI smoke;
- Local Fake static/dynamic/recovery/restart proof;
- Demo Buy and AI Investigation closure;
- isolated and representative target workload;
- daily DB lifecycle;
- authenticated market-data deployment smoke;
- standalone order-service + real CPGW session compatibility;
- integrated Detail BUY `DRY_RUN`;
- authenticated static/pre-market and market-open movement proof.

Real IBKR LIVE submission is required only if real external trading permission exists **and** the user explicitly initiates it. Otherwise record exactly `PENDING_EXTERNAL_PERMISSION`; synthetic/DRY_RUN proof must never be relabeled as LIVE success.

## Defect rule

If this acceptance work discovers a deterministic defect, the executing work unit owns it through:

```text
root cause
→ smallest correct fix
→ regression proof
→ affected verification
→ green
```

That defect may block the acceptance run itself, but the backlog task does not automatically become a global blocker for unrelated development.

## Security

Preserve only sanitized evidence. Never commit credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.

## Activation requirement

This file is backlog intent only. Before execution, re-plan from fresh `main`, reconcile the maintained acceptance procedure with current product contracts, create/repair the necessary PLAN leaf(s), and explicitly allocate the work in `.planning/EXECUTION.md`.
