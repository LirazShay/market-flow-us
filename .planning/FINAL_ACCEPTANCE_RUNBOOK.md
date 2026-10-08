# Chat 28 — Final Acceptance Runbook

This is the authoritative execution wrapper for task `7.4` final target-machine/provider acceptance.

## Authority

- GitHub `main` is repository truth.
- `.planning/PLAN.md` leaf `7.4` and its success evidence are the planning definition-of-done.
- `.planning/EXECUTION.md` owns task `7.4` owner/status/dependency/result truth.
- `.planning/FINAL_ACCEPTANCE_EXECUTION.md` is the checkpoint/evidence ledger.
- `docs/FIRST_RUN_ACCEPTANCE.md` is the active detailed FR-0..FR-14 procedure.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` is preserved as historical planning/provenance evidence only; any older candidate/owner/TREE/HANDOFF wording there is superseded by this runbook and the active guide.
- This runbook is the authority for the current acceptance candidate. Historical acceptance text that points FR-0/FR-2 at old TREE state, `.planning/EXECUTOR_HANDOFF.md`, Chat 25/27 or an older SHA is not live authority.

## Current owner and exact runtime candidate

Current owner:

```text
Chat 28 / task 7.4
```

Exact product SHA under acceptance:

```text
682f8c8b01e9f68c7f8e159de8b0f233221f1878
```

Why this SHA:

- it contains the completed pre-acceptance audit runtime fixes from tasks `7.6.2` and `7.6.3`;
- it also contains the later confirmed Replay Host stop-timer lifecycle root fix from PR #73, including deterministic SIGTERM/SIGKILL regression proof;
- PR #73 was squash-merged to `main`, and the resulting `main` candidate passed Fast CI, Replay CI and the repository's existing Planning Docs CI;
- no open PR remained after the merge audit;
- the previously pinned runtime candidate `d1ff24abfe72e55302c4c008030174f8923a6d48` is therefore superseded.

Do not substitute:

- superseded candidate `d1ff24abfe72e55302c4c008030174f8923a6d48`;
- pre-audit candidate `93a48c8b0a36433e58f09f6a607ec7cd366c9aea`;
- historical post-branch-9 candidate `243f4f2e78e434378ff2202ba95af7b8626a0369`;
- historical branch-8 candidates;
- later metadata-only `main` commits unless this runbook explicitly pins a replacement acceptance candidate.

## Execution order

Use the active detailed procedures and PASS semantics in `docs/FIRST_RUN_ACCEPTANCE.md` in this order:

```text
FR-0 exact final candidate
→ FR-1 host prerequisite preflight
→ FR-2 exact-SHA checkout
→ FR-3 dependency install
→ FR-4 deterministic unit/service/Replay/order acceptance
→ FR-5 browser + Replay build/E2E
→ FR-6 local UI smoke
→ FR-7 Local Fake static
→ FR-8A..H dynamic/recovery/Demo Buy/AI
→ FR-9 isolated + 4096x180 target workload
→ FR-10 daily DB lifecycle
→ FR-11A real market-data deployment smoke
→ FR-11B standalone order service + real CPGW session compatibility
→ FR-11C integrated Detail BUY DRY_RUN
→ FR-12 authenticated static/pre-market
→ FR-13 authenticated market-open movement
→ FR-14 final evidence/handoff
```

For FR-0 and FR-2 specifically, the exact candidate comes from this runbook and `.planning/FINAL_ACCEPTANCE_EXECUTION.md`.

Real IBKR LIVE submission is PASS only if real external trading permission exists and the user explicitly initiates it. Otherwise record exactly `PENDING_EXTERNAL_PERMISSION`; deterministic/synthetic proof must never be relabeled as live success.

## Reused evidence after the Replay Host fix

FR-1 host prerequisite evidence remains valid because PR #73 changed Replay Host shutdown lifecycle behavior, not the machine prerequisites it proves. FR-2 and all later candidate-bound checkpoints remain pending against `682f8c8b01e9f68c7f8e159de8b0f233221f1878` unless their detailed contract explicitly permits reuse and the runtime change cannot invalidate them.

## Execution discipline

- One user-dependent checkpoint at a time.
- Stop on first FAIL.
- Root-cause a blocking defect before retry; the defect remains Chat 28 responsibility through regression proof and affected verification.
- Resume from the earliest checkpoint invalidated by a fix; do not rerun unrelated green checkpoints.
- Do not advance machine/provider checkpoints from assumptions. Machine-specific evidence must be observed.
- Preserve sanitized evidence only: no credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.
- Replay must leave the normal live DB untouched.
- BUY browser surfaces must never expose the order-service caller token or create a generic execution proxy.
