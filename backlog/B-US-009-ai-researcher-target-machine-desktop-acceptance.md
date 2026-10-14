# B-US-009 — Unified final target-machine / Desktop / provider acceptance

Status: Active execution, currently blocked until final implementation merge + target-machine execution  
Blocking Branch-12 implementation merge: No  
Current execution authority: `.planning/EXECUTION.md`  
Unified runbook: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`  
Evidence ledger: `.planning/FINAL_ACCEPTANCE_EXECUTION.md`

## Why this now owns all remaining user acceptance

`B-US-009` originally preserved only the Branch-11 AI Researcher target-machine + ChatGPT Desktop checks. Final Branch-12 reclosure later required all still-pending user/target-machine checks to be consolidated into exactly one post-merge acceptance task rather than leaving multiple active/deferred blockers.

Therefore `B-US-009` is now the **single** final external acceptance identity. It incorporates the still-relevant scope from:

- the original Research `W2T/W3` target-machine/Desktop acceptance;
- historical backlog `B-US-000` final target-machine/provider acceptance;
- Branch-12/TREE `12.9` external Trading evidence, including real live-market shadow and any explicitly user-initiated LIVE-boundary evidence.

`B-US-000` is provenance only and must not be activated as a second final acceptance task.

## Activation boundary

This task must not become the current execution pointer until the final Branch-12 implementation/reclosure PR is merged, required `main` CI is green and no open implementation PR supersedes the accepted candidate.

Until then the missing external evidence remains truthful NOT PASS/PENDING and does not block the implementation merge.

After implementation reclosure, select a fresh intended `main` candidate exactly as defined by `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` and execute the unified gates `U0` through `U6` serially.

## Scope

The unified acceptance includes:

1. exact clean post-merge candidate selection and target-machine setup;
2. maintained deterministic target-machine sanity, local UI, workload and daily-lifecycle checks;
3. Research actual-evidence workload (`W2T`), repository Desktop/MCP preflight and real ChatGPT Desktop mission + restart/fresh-context resume (`W3`);
4. real market-data deployment, static/pre-market and market-open movement acceptance;
5. real CPGW session compatibility;
6. Branch-12 clean-commit live-market SHADOW evidence and verifier;
7. trusted real-session current-Detail `DRY_RUN` compatibility;
8. optional real-money LIVE verification only when external permission exists and the user explicitly initiates it;
9. one public-safe final evidence/handoff record.

## Detailed subprocedures

The unified runbook is the sequencing authority. It consumes, without creating independent execution tasks:

- `docs/FIRST_RUN_ACCEPTANCE.md` for maintained `FR-*` local/provider procedures;
- `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md` for detailed `W2T/W3` Research/Desktop steps;
- `docs/AUTONOMOUS_AI_TRADING.md` for Branch-12 Trading authority and LIVE-boundary invariants;
- `docs/IBKR_ORDER_SERVICE_OPERATOR.md` and `docs/BASIC_BUY_INTEGRATION.md` for existing order-service/operator trust boundaries.

Old wording in those documents that refers to separate historical task IDs does not override the unified runbook.

## Candidate policy

At each acceptance attempt:

1. fetch fresh intended `main`;
2. select the latest merged runtime candidate meant to be accepted;
3. record the exact SHA;
4. use a clean checkout of that SHA for candidate-bound evidence;
5. never mix measurements from different runtime SHAs;
6. after a runtime fix, invalidate and rerun the earliest affected gate.

## PASS / blocker discipline

No external stage passes by inference from CI, synthetic data or an older checkout.

`B-US-009` may become `done` only when every required unified gate is PASS, except that real-money order placement may remain exactly `PENDING_EXTERNAL_PERMISSION` when external trading permission and/or explicit user initiation is absent. That exception never means a real order passed.

If the Desktop product surface, provider state or another external prerequisite prevents a required non-optional gate from running, preserve the exact public-safe blocker and keep `B-US-009` blocked.

## Security

Record only public-safe facts. Never commit or paste credentials, cookies, authorization/session material, caller tokens, account identifiers, private browser state, raw authenticated responses/dumps, sensitive environment dumps or private machine data.

A deterministic defect discovered during this acceptance remains owned by the acceptance executor through RCA → smallest correct fix → regression → affected verification → merge/main-green → resume from the earliest invalidated gate.