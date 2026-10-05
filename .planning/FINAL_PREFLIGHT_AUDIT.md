# Market Flow US — Final Adversarial Preflight Audit

## Purpose

Final code-level adversarial review under TREE `7.4`, before target-machine first-run acceptance.

This audit is not a new TREE node and does not replace the frozen contracts or `FR-0..FR-14` flow.

Baseline:

- repository: `LirazShay/market-flow-us`
- baseline `main`: `80d3bb7028051ced74e87088d8eb0cd716a4ed91`
- audit branch: `audit/final-preflight`
- draft PR: `#16`
- TREE node: `7.4` remains `in_progress`

## Audit rules

For each production/tooling boundary:

1. compare executable behavior to the routed durable contract;
2. inspect happy, malformed, null/empty, failure, restart and cleanup paths;
3. inspect state ownership, concurrency, ordering and lifecycle;
4. fail closed at Browser/Node/protocol/filesystem boundaries;
5. verify identity, cardinality, transaction and time assumptions;
6. inspect Windows quoting/process/port/runtime behavior;
7. keep diagnostics bounded and public-safe;
8. reject false-confidence tests, over-mocking, hidden retries and path-filter gaps;
9. reconcile code/docs/launchers/config;
10. fix root causes with the smallest sufficient change plus deterministic regression proof.

Any new/materially changed SQL must pass the AGENTS 10+ stage static preflight before first execution.

## Severity

- **BLOCKER** — authority corruption, wrong release path, acceptance invalidation or protected-data leakage.
- **HIGH** — credible production/acceptance failure or silent wrong result.
- **MEDIUM** — bounded correctness/diagnosability/operability defect with realistic trigger.
- **LOW** — non-blocking maintainability/readability concern; avoid release churn without concrete value.

No BLOCKER/HIGH finding may remain open before closure.

## Stage status

| Stage | Scope | Status |
|---|---|---|
| A0 | Baseline / authority / coverage map | done |
| A1 | Browser provider / Recorder / runtime / diagnostics | done |
| A2 | Local service / DuckDB / persistence / protocol / recovery | done |
| A3 | Trusted reads / Viewer / Scanner | done |
| A4 | Build / setup / Windows launchers | done |
| A5 | Fake Market / acceptance / workload / new-day lifecycle | done |
| A6 | Test-suite / CI adversarial review and critical data proofs | done |
| A7 | Repository-wide cross-cutting defect sweep | done |
| A8 | Contract / docs / runtime reconciliation | done |
| A9 | Integrated proof after all fixes | done |
| A10 | Closure / PR / merge / main-green / external-boundary handoff | pending |

Detailed findings, fixes, regressions and reviewed non-findings are authoritative in `.planning/FINAL_PREFLIGHT_PROGRESS.yaml`.

## Critical correctness facts already proven

The audit now has deterministic proof for the release-critical data path:

- every promoted U.S. provider field round-trips through the real Browser/service/DuckDB path into the correct `history` and `latest` column;
- `0`, `NULL`, missing and raw-source preservation remain distinct as contracted;
- staged Scanner anchors `10/20/30/45/60/90/120` seconds independently resolve the latest row at or before each target, including equal-timestamp cycle tie-break, missing-history stop, old fallback and recent-NULL preservation;
- canonical U.S. identity is fail-closed at both Browser and Node boundaries;
- successful cycle transaction authority, rollback, producer singleton and restart recovery remain mechanically guarded;
- Current/Security/History/Scanner read the committed authority rather than browser-owned state;
- FR-13 market-open evidence is now mechanical: base authenticated `overall=PASS` remains separate from `movement.status=PASS|PENDING|FAIL`; local collection timestamps cannot fabricate movement.

## SQL preflights created during audit

- `.planning/FINAL_PREFLIGHT_A7_SQL_PREFLIGHT.md` — durable running-producer singleton guard.
- `.planning/FINAL_PREFLIGHT_A8_SQL_PREFLIGHT.md` — bounded live movement witness.

Both were documented before first real DuckDB execution and subsequently passed deterministic regression proof.

## A9 integrated proof

Integrated candidate reviewed:

```text
fc5dda80c9b45a6430d8f61cfe0c2e4e2641d4c6
```

Results on that exact audit head / PR merge composition:

- Fast CI: green;
  - unit: `128/128`, zero skipped/todo;
  - service: `95/95`, zero skipped/todo;
  - longest layer about `26.5s`, within the documented ~30s recurring broad-suite target;
- Browser CI: green;
  - browser build succeeded;
  - Chromium E2E `22/22`, one worker, no retry/skip masking, about `25.0s`;
  - local static acceptance entry proof green;
- Workload CI: green;
  - isolated persistence/read/Scanner proof green;
  - `4096`-security width single-cycle sanity green;
  - bounded end-to-end `64 x 45 = 2880` history rows with exact authority counts green;
- Planning Docs CI: green.

Final PR diff review found no accidental subsystem/rewrite or unrelated product expansion. Changed files are confined to audit fixes, regression tests, CI routing, launchers and contract/runbook reconciliation.

Public-safe review found no committed credentials, cookies, authorization/session material, account identifiers, private browser dumps, private machine paths, DuckDB/data artifacts or generated `dist` outputs. `SENTINEL_*` values in tests are synthetic fixtures used to prove sanitization.

## External boundary

Heavy target-machine and authenticated-provider acceptance is **not** fabricated by this audit. The current user is unavailable for those physical/external checks, so after A10 they must remain explicitly:

```text
pending_external
```

This includes the Windows target-machine acceptance and authenticated closed/static and market-open provider evidence that cannot be truthfully produced from GitHub-hosted execution alone.

Already-green offline/CI evidence remains valid; `pending_external` is not a failure and is not a live PASS.

## A10 closure checklist

A10 must:

1. confirm the detailed ledger contains no open BLOCKER/HIGH finding;
2. confirm the final branch head has all required CI green;
3. update durable status truth for the post-audit state;
4. review PR #16 one final time;
5. make the PR merge-ready and squash merge it;
6. verify `main` CI green after merge;
7. verify open-PR state and record the exact new `main` SHA;
8. leave TREE `7.4` / target-machine + authenticated-provider acceptance accurately marked `pending_external`, not falsely complete.

## Current pointer

`A0` through `A9` are complete. Next stage is **A10 — closure, merge and main-green verification**.
