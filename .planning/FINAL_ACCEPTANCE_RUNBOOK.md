# Chat 28 — Final Acceptance Runbook

This is the authoritative execution wrapper for TREE `7.4` final target-machine/provider acceptance.

## Authority

- GitHub `main` is repository truth.
- TREE `7.4` `success_evidence` is definition-of-done.
- `.planning/FINAL_ACCEPTANCE_EXECUTION.md` is the checkpoint/evidence ledger.
- `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` remains the detailed FR-1..FR-14 procedure only.
- Where historical acceptance material names Chat 25/27 or freezes an older runtime candidate, this runbook overrides that stale ownership/candidate wording.

## Current owner and exact runtime candidate

Current owner:

```text
Chat 28 / TREE 7.4
```

Exact runtime product SHA under acceptance:

```text
d1ff24abfe72e55302c4c008030174f8923a6d48
```

This is the merged runtime after the user-requested pre-acceptance code audit fixed the material Order/Basic-BUY and Replay lifecycle defects in TREE `7.6.2` and `7.6.3`. TREE `7.6.4` required no runtime change. TREE `7.6.5` adds test/CI/evidence-only reclosure changes, so those later commits do not replace this runtime SHA.

Do not substitute:

- pre-audit candidate `93a48c8b0a36433e58f09f6a607ec7cd366c9aea`;
- historical post-branch-9 candidate `243f4f2e78e434378ff2202ba95af7b8626a0369`;
- historical branch-8 candidate;
- later test/metadata-only `main` commits.

## Execution order

Use the existing detailed procedures and PASS semantics in `.planning/FIRST_RUN_ACCEPTANCE_PLAN.md` in this order:

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
→ integrated Detail BUY DRY_RUN
→ FR-12 authenticated static/pre-market
→ FR-13 authenticated market-open movement
→ FR-14 final evidence/handoff
```

Real IBKR LIVE submission is PASS only if real external trading permission exists and the user explicitly initiates it. Otherwise record exactly `PENDING_EXTERNAL_PERMISSION`; deterministic/synthetic proof must never be relabeled as live success.

## Reused evidence after the audit

FR-1 host prerequisite evidence remains valid because the audit changed product runtime behavior, not the machine prerequisites it proves. FR-2 and all later candidate-bound checkpoints remain pending against `d1ff24abfe72e55302c4c008030174f8923a6d48` unless their detailed contract explicitly permits reuse and the runtime changes cannot invalidate them.

## Execution discipline

- One user-dependent checkpoint at a time.
- Stop on first FAIL.
- Root-cause a blocking defect before retry; the defect remains Chat 28 responsibility through regression proof and affected verification.
- Resume from the earliest checkpoint invalidated by a fix; do not rerun unrelated green checkpoints.
- Do not advance machine/provider checkpoints from assumptions. Machine-specific evidence must be observed.
- Preserve sanitized evidence only: no credentials, cookies, tokens, auth/session data, account identifiers, raw authenticated dumps or private browser state.
- Replay must leave the normal live DB untouched.
- BUY browser surfaces must never expose the order-service caller token or create a generic execution proxy.
