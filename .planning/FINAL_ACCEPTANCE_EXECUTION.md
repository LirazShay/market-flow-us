# Chat 28 — Final Target-Machine / Provider Acceptance

This file is the execution evidence ledger for TREE `7.4` only.

## Authority

- GitHub `main` remains product truth.
- TREE `7.4` and its `success_evidence` remain definition-of-done.
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` is the authoritative Chat-28 execution wrapper and candidate/ownership truth.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` remains the detailed FR-1..FR-14 checkpoint procedure, subject to the explicit authority corrections in the final runbook.

## FR-0 — frozen final candidate

Final product under target-machine acceptance:

```text
d1ff24abfe72e55302c4c008030174f8923a6d48
```

Why this SHA:

- it is the merged production runtime after the pre-acceptance audit fixes from TREE `7.6.2` and `7.6.3`;
- TREE `7.6.4` found no additional runtime defect and changed no production code;
- TREE `7.6.5` fresh deterministic reclosure changes are test/CI/evidence-only and therefore do not replace this runtime SHA;
- the pre-audit `93a48c8b0a36433e58f09f6a607ec7cd366c9aea` candidate is superseded.

Do not substitute historical branch-8/post-branch-9/pre-audit candidates or later test/metadata-only commits.

## Checkpoint ledger

| Checkpoint | State | Evidence |
|---|---|---|
| FR-0 exact final candidate | PASS | `d1ff24abfe72e55302c4c008030174f8923a6d48`; post-audit production runtime pinned; deterministic reclosure fresh green before Chat-28 handoff |
| FR-1 host prerequisite preflight | PASS | Windows, Git `2.45.2.windows.1`, Node `v24.19.0`, npm availability, PowerShell availability, writable disk, loopback and Playwright Chromium are evidenced on the target machine; these host-only prerequisites are not invalidated by the audit runtime fixes; competing-listener checks for ports `8765/8766/8770` remain runtime assertions when their respective product paths are exercised |
| FR-2 exact-SHA checkout | PENDING | Chat 28 is active on branch `chat-28-final-acceptance`; repository-side runtime candidate is pinned and no later runtime change supersedes it. Exact-SHA repository inspection confirms `package-lock.json`, `SETUP.cmd`, `START_DEMO.cmd`, `START_MARKET_FLOW_US.cmd`, `START_MARKET_REPLAY.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `NEW_TRADING_DAY.cmd`, `PREPARE_LIVE_VERIFICATION.cmd`, `RUN_IBKR_ORDER_ACCEPTANCE.cmd`, `CHECK_IBKR_SESSION.cmd`, and the `local-service/server`, `replay-host`, and `ibkr-order-service` runtime entrypoints are present. Acceptance-branch comparison against `main` is ahead only by execution/evidence metadata in `STATUS.yaml`, `.planning/EXECUTION.yaml`, and this ledger; no production/test/runtime file is changed. Remaining target-machine evidence only: clean working tree before checkout, `HEAD=d1ff24abfe72e55302c4c008030174f8923a6d48`, and clean working tree after checkout. Do not advance to FR-3 until observed. |
| FR-3 deterministic dependency install | PENDING | Procedure preverified against exact runtime SHA: `SETUP.cmd` requires Node 24.x, runs pinned `npm ci`, then `npx playwright install chromium`, failing closed on any error. Target-machine execution remains blocked on FR-2 PASS. |
| FR-4 unit/service/Replay/order deterministic acceptance | PENDING | Exact runtime SHA exposes the documented `test:unit`, `test:service`, `test:acceptance:replay` and `test:acceptance:order` scripts; target-machine execution remains pending. |
| FR-5 normal + Replay build / Chromium E2E | PENDING | Exact runtime SHA exposes `build:browser`, `build:replay` and `test:e2e`; target-machine execution remains pending. |
| FR-6 local UI smoke | PENDING | Exact-SHA procedure preverified: `START_DEMO.cmd` is the human-visible smoke launcher; target-machine usability evidence remains required. |
| FR-7 Local Fake static | PENDING | Exact-SHA procedure preverified: `RUN_LOCAL_ACCEPTANCE.cmd static`; target-machine execution remains required. |
| FR-8A..H Local Fake / Demo Buy / AI closure | PENDING | Exact-SHA procedure preverified for `moving`, `membership`, `provider-recovery`, `restart`, `demo-buy-runtime`, `demo-buy-outcomes`, `ai-investigation-ui`, and `ai-pack-safety`; target-machine execution remains required. |
| FR-9 isolated + 4096x180 target workload | PENDING | Exact-SHA procedure preverified: run `RUN_LOCAL_ACCEPTANCE.cmd isolated` then `RUN_LOCAL_ACCEPTANCE.cmd target`; target profile is 4096 securities × 180 completed cycles with a five-minute target-machine ceiling. |
| FR-10 daily DB lifecycle | PENDING | Exact-SHA procedure preverified: with active market data + Demo Buy state + saved Scanner query and all DB owners stopped, run `NEW_TRADING_DAY.cmd`; target-machine archive/fresh-v4/preservation evidence remains required. |
| FR-11A authenticated market-data deployment smoke | PENDING | Exact-SHA procedure preverified: `START_MARKET_FLOW_US.cmd` consumes only the user-supplied authenticated page URL/origin and must not copy authentication material; target-machine/provider evidence remains required. |
| FR-11B standalone order service + real CPGW session compatibility | PENDING | Exact-SHA procedure preverified: `RUN_IBKR_ORDER_ACCEPTANCE.cmd`, then `CHECK_IBKR_SESSION.cmd` (or documented `INSECURE_LOCALHOST_TLS` loopback-only fallback if required). Real CPGW must already be running and manually authenticated; no real order is submitted by this compatibility check. |
| Integrated Detail BUY DRY_RUN | PENDING | current Detail -> immutable ticket -> trusted confirmation -> order-service DRY_RUN |
| Real IBKR LIVE order | PENDING_EXTERNAL_PERMISSION | PASS only if actually permissioned and explicitly user-initiated |
| FR-12 authenticated static/pre-market | PENDING | Exact-SHA procedure preverified: `PREPARE_LIVE_VERIFICATION.cmd`; requires overall PASS with >=20 complete committed cycles spanning >=60s. `movement=PENDING/NO_MARKET_MOVEMENT_OBSERVED` is valid pre-market only while authority continues advancing. |
| FR-13 authenticated market-open movement | PENDING | Exact-SHA procedure preverified: rerun the same SHA-bound gate during real movement; PASS requires observed provider-field change reflected in committed Current and History. No movement remains PENDING, never manually promoted. |
| FR-14 final evidence / handoff | PENDING | Final closure procedure preverified; may close only after all required target-machine/provider evidence is green and final PR/merge/main-green/open-PR truth is clean. |

## Repository-side execution state

- Draft PR `#70` (`chat-28-final-acceptance` -> `main`) is open for execution/evidence metadata only; it must remain unmerged until final acceptance closure is complete.
- Planning Docs CI run `37606241234` passed on PR head `d395e8584c739f9da4108f8eea209f313314dc8c` before this ledger-only follow-up commit.
- The PR diff contains only `STATUS.yaml`, `.planning/EXECUTION.yaml`, and this ledger; no production/test/runtime file is part of the acceptance branch.
- This repository-side CI is not target-machine evidence and does not alter any FR checkpoint state.

## Execution rule

Run one user-dependent checkpoint at a time and stop at the first failure. A blocking defect remains Chat 28 responsibility through root cause, fix, regression proof and affected verification. Reports/evidence must remain sanitized: no credentials, cookies, tokens, account identifiers, authenticated raw dumps or private browser state.
