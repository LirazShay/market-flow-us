# Chat 28 — Final Target-Machine / Provider Acceptance

This file is the checkpoint/evidence ledger for task `7.4` only.

## Authority

- GitHub `main` remains product truth.
- `.planning/PLAN.md` leaf `7.4` and its success evidence remain the planning definition-of-done.
- `.planning/EXECUTION.md` owns task `7.4` owner/status/dependency/result truth.
- `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` is the authoritative Chat-28 execution wrapper and exact-candidate truth.
- `docs/FIRST_RUN_ACCEPTANCE.md` is the active detailed FR-0..FR-14 checkpoint procedure.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` is preserved as historical planning/provenance evidence; older TREE/HANDOFF/candidate wording there is not live authority.

## FR-0 — pinned final candidate

Final product under target-machine acceptance:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

Why this SHA:

- it contains the merged pre-acceptance audit production fixes from tasks `7.6.2` and `7.6.3`;
- it contains the later confirmed Replay Host stop-timer lifecycle fix from PR #73;
- deterministic regression now proves losing shutdown timers are cancelled for prompt SIGTERM exit and SIGKILL escalation;
- the PR head and resulting `main` candidate passed Fast CI and Replay CI, with the repository's existing Planning Docs CI also green;
- the prior `d1ff24abfe72e55302c4c008030174f8923a6d48` runtime candidate is superseded.

Do not substitute historical branch-8/post-branch-9/pre-audit candidates, the superseded `d1ff24abfe72e55302c4c008030174f8923a6d48`, or later metadata-only commits unless the final acceptance runbook explicitly pins a new candidate.

## Checkpoint ledger

| Checkpoint | State | Evidence |
|---|---|---|
| FR-0 exact final candidate | PASS | `682f8c8b01e9f68c7f8e159de8b0f233221f1878`; PR #73 Replay Host lifecycle fix squash-merged; resulting main Fast + Replay + existing Planning Docs CI green; open-PR audit clean |
| FR-1 host prerequisite preflight | PASS | Windows, Git `2.45.2.windows.1`, Node `v24.19.0`, npm availability, PowerShell availability, writable disk, loopback and Playwright Chromium are evidenced on the target machine; these host-only prerequisites are not invalidated by the Replay Host shutdown fix; competing-listener checks for ports `8765/8766/8770` remain runtime assertions when their respective product paths are exercised |
| FR-2 exact-SHA checkout | PENDING | target machine must be clean and pinned to `682f8c8b01e9f68c7f8e159de8b0f233221f1878` |
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
| FR-11C integrated Detail BUY DRY_RUN | PENDING | current Detail -> immutable ticket -> trusted confirmation -> order-service DRY_RUN |
| Real IBKR LIVE order | PENDING_EXTERNAL_PERMISSION | PASS only if actually permissioned and explicitly user-initiated |
| FR-12 authenticated static/pre-market | PENDING | user target machine/provider |
| FR-13 authenticated market-open movement | PENDING | real market movement required |
| FR-14 final evidence / handoff | PENDING | only after all required evidence above |

## Execution rule

Run one user-dependent checkpoint at a time and stop at the first failure. A blocking defect remains Chat 28 responsibility through root cause, fix, regression proof and affected verification. Reports/evidence must remain sanitized: no credentials, cookies, tokens, account identifiers, authenticated raw dumps or private browser state.
