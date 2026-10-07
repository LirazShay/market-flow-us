# Chat 27 — Final Target-Machine / Provider Acceptance

This file is the execution evidence ledger for TREE `7.4` only.

## Authority

- GitHub `main` remains product truth.
- TREE `7.4` and its `success_evidence` remain definition-of-done.
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` is the authoritative Chat-27 execution wrapper and candidate/ownership truth.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` remains the detailed FR-1..FR-14 checkpoint procedure, subject to the explicit authority corrections in the final runbook.

## FR-0 — frozen final candidate

Final accepted product under test:

```text
93a48c8b0a36433e58f09f6a607ec7cd366c9aea
```

Why this SHA:

- it is current runtime `main` after Chat 26 / TREE `8.5` squash merge;
- TREE `9.6` and `8.5` are both `done`;
- root STATUS points to Chat 27 / TREE `7.4`;
- no open PR superseded it at Chat-27 start;
- all five main workflows for this SHA completed successfully.

Later Chat-27 documentation/evidence-only commits do not replace this runtime SHA.

Do not substitute the historical post-branch-9 SHA `243f4f2e78e434378ff2202ba95af7b8626a0369` or the historical branch-8 candidate.

## Checkpoint ledger

| Checkpoint | State | Evidence |
|---|---|---|
| FR-0 exact final candidate | PASS | `93a48c8b0a36433e58f09f6a607ec7cd366c9aea`; dependencies done; runtime candidate CI green; opening open-PR audit clean |
| FR-1 host prerequisite preflight | PASS | Windows, Git `2.45.2.windows.1`, Node `v24.19.0`, npm availability, PowerShell availability, writable disk, loopback and Playwright Chromium are evidenced on the target machine; per the detailed FR-1 contract, competing-listener checks for ports `8765/8766/8770` remain runtime assertions when their respective product paths are exercised, not a blocker to FR-2 |
| FR-2 exact-SHA checkout | PENDING | user target machine |
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

Run one user-dependent checkpoint at a time and stop at the first failure. A blocking defect remains Chat 27 responsibility through root cause, fix, regression proof and affected verification. Reports/evidence must remain sanitized: no credentials, cookies, tokens, account identifiers, authenticated raw dumps or private browser state.
