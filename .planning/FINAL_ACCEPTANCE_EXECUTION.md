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
| FR-2 exact-SHA checkout | PENDING | Chat 28 is active on branch `chat-28-final-acceptance`; repository-side runtime candidate is pinned and no later runtime change supersedes it. Target-machine evidence is still required: clean working tree before checkout, `HEAD=d1ff24abfe72e55302c4c008030174f8923a6d48`, and clean working tree after checkout. Do not advance to FR-3 until observed. |
| FR-3 deterministic dependency install | PENDING | user target machine |
| FR-4 unit/service/Replay/order deterministic acceptance | PENDING | user target machine |
| FR-5 normal + Replay build / Chromium E2E | PENDING | user target machine |
| FR-6 local UI smoke | PENDING | user target machine |
| FR-7 Local Fake static | PENDING | user target machine |
| FR-8A..H Local Fake / Demo Buy / AI closure | PENDING | user target machine |
| FR-9 isolated + 4096x180 target workload | PENDING | user target machine |
| FR-10 daily DB lifecycle | PENDING | user target machine |
| FR-11A authenticated market-data deployment smoke | PENDING | user target machine/provider |
| FR-11B standalone order service + real CPGW session compatibility | PENDING | user target machine/IBKR CPGW |
| Integrated Detail BUY DRY_RUN | PENDING | current Detail -> immutable ticket -> trusted confirmation -> order-service DRY_RUN |
| Real IBKR LIVE order | PENDING_EXTERNAL_PERMISSION | PASS only if actually permissioned and explicitly user-initiated |
| FR-12 authenticated static/pre-market | PENDING | user target machine/provider |
| FR-13 authenticated market-open movement | PENDING | real market movement required |
| FR-14 final evidence / handoff | PENDING | only after all required evidence above |

## Execution rule

Run one user-dependent checkpoint at a time and stop at the first failure. A blocking defect remains Chat 28 responsibility through root cause, fix, regression proof and affected verification. Reports/evidence must remain sanitized: no credentials, cookies, tokens, account identifiers, authenticated raw dumps or private browser state.
