# Market Flow US — IBKR Order Service Planning Reviews

This file is the additive review record for branch `8`. Historical U.S./Demo Buy/AI planning reviews remain unchanged in `.planning/REVIEWS.md`.

## R-US-IBKR-ORDER-OPEN — Replan opened before final 7.4 acceptance

**Result:** REOPENED; IMPLEMENTATION UNAUTHORIZED.

The user requested a standalone Node.js BUY/SELL service for Interactive Brokers while the account does not yet have trading permission. Final target-machine/provider acceptance `7.4` had begun but was not complete.

Correct sequence:

```text
preserve completed branches 1–7 evidence
→ keep 7.4 not-done
→ define isolated branch 8
→ freeze/implement/reclose branch 8
→ resume 7.4 on the new candidate
```

## Review 1 — Product boundary / user intent

**Result:** PASS AFTER ALIGNMENT.

- Branch `8` is a separate local execution sidecar.
- Scanner, Demo Buy, AI Investigation and Current gain no automatic order authority.
- Initial scope is deliberately narrow: U.S. `STK`, `USD`, `SMART`, BUY/SELL, LMT/MKT, DAY/GTC.
- No short-opening, options/futures/FX, bracket/OCA/algo, leverage engine or portfolio strategy subsystem.
- Actual live submission may remain exactly `PENDING_EXTERNAL_PERMISSION` without blocking permission-independent software completion.

## Review 2 — Provider / lifecycle contract

**Result:** PASS AFTER ALIGNMENT.

Use the first-party Client Portal Web API through Client Portal Gateway. Manual gateway authentication remains user-owned. The service never automates credential login or bypasses IBKR permissions/confirmation requirements.

The adapter owns auth/session/accounts/instrument resolution/snapshot prerequisite/what-if/submit/reply/open-order/trade/cancel/keepalive.

Pre-submit failure may be conclusive. Transport loss after possible submit becomes `ACKNOWLEDGEMENT_UNKNOWN`; no blind resubmit occurs before reconciliation. Unknown provider reply questions fail closed.

## Review 3 — Localhost security / privacy threat model

**Result:** PASS AFTER MATERIAL CORRECTION.

Loopback alone is not authorization. Required boundary:

```text
127.0.0.1:8770 only
+ high-entropy per-run local caller token
+ protected reads/mutations require token
+ browser Origin rejected by default
+ no wildcard/credentialed CORS
+ bounded JSON-only mutations
+ unauthorized request performs zero provider calls/state mutation
```

`GET /health` may be unauthenticated only when strictly non-sensitive.

Caller token is never hard-coded, committed, persisted, logged, reported or sent to IBKR and expires with the process. Provider account identity may exist only in memory while required for provider calls; it is never persisted/reported. Credentials, cookies/session tokens, private browser state and raw authenticated provider dumps remain forbidden.

Any CPGW localhost TLS exception must be scoped only to that loopback client; process-global TLS disable is forbidden.

## Review 4 — Local authority / idempotency / failure safety

**Result:** PASS.

`DRY_RUN` is structurally unable to call provider submit. LIVE requires independent local caller, process LIVE, request LIVE, session, tradable account, provider permission, exact instrument, snapshot, what-if, local validation and SELL long-position coverage gates.

`requestId` is mandatory:

```text
same requestId + same normalized intent → reuse/reconcile
same requestId + different normalized intent → reject
```

The smallest separate DuckDB store owns restart-safe idempotency/reconciliation facts; the day-bounded market DB remains unchanged. No provider account/authentication/caller-token/raw authenticated state is persisted.

LIVE SELL fails closed when long-position authority is insufficient, unavailable or ambiguous.

## Review 5 — Verification / no fabricated evidence

**Result:** PASS.

One configurable fake IBKR adapter/gateway covers disconnected/unauthenticated/authenticated, account states, exact/missing/ambiguous instrument, snapshot, what-if, BUY/SELL translation, immediate submit, reply-required flows, unknown reply rejection, pre-submit failure, post-submit transport loss, reconciliation, cancel, partial/full fill, session timeout/keepalive, SELL guard, caller auth/origin rejection and restart-safe idempotency.

All fixtures are synthetic/public-safe. Fake-LIVE proves software lifecycle correctness but is never represented as real-money success.

## Review 6 — S&T necessity / sufficiency / KISS

**Result:** PASS.

Final structure:

```text
root capability branches: 8
TREE nodes:              44
implementation leaves:   32
new leaves:              8.1, 8.2, 8.3, 8.4
final leaf:              7.4
```

Necessary responsibilities:

- `8.1` — safe local service, normalized intent, caller security, DRY_RUN, persistence/idempotency;
- `8.2` — CPGW adapter, LIVE gates, reply/cancel/fills/reconciliation/SELL guard;
- `8.3` — operator packaging, deterministic standalone acceptance and stable future-integration boundary;
- `8.4` — deterministic reclosure and new exact candidate truth.

The plan reuses Node 24/native ESM, existing DuckDB dependency, diagnosability pattern and repo CI/release discipline. It does not add Strategy Engine, automatic Scanner-to-order, portfolio/risk engine, cloud execution, credential store, automated gateway login, new DB technology or second market-data authority.

## Review 7 — Allocation / dependency order / handoff

**Result:** PASS.

```text
Chats 1–16: completed historical prefix through 7.5
Chat 17: 8.1
Chat 18: 8.2
Chat 19: 8.3
Chat 20: 8.4
Chat 21: 7.4
```

Dependency order:

```text
7.5 → 8.1 → 8.2 → 8.3 → 8.4 → 7.4
```

`verify-handoff.mjs` remains dynamic and sufficient; no new allocation framework is introduced.

## R-US-IBKR-ORDER-FINAL — Formal final branch-8 planning review

**Result:** PASS AFTER CORRECTIONS; IMPLEMENTATION UNAUTHORIZED UNTIL PLANNING PR/MAIN GATES.

Whole-goal review found no unresolved contradiction after alignment of GOAL/DECISIONS/TREE/EXECUTION/handoff/status, generic product/technical/test contracts, both IBKR order contracts and Planning CI.

`DATA_CONTRACT.md` intentionally remains unchanged because the isolated order sidecar does not change provider market-data schema/authority.

## R-US-IBKR-ORDER-EXTERNAL — External-user-from-zero adversarial review

**Result:** PASS — READY TO FREEZE; IMPLEMENTATION STILL REQUIRES PLANNING PR MERGE + MAIN CI/OPEN-PR GATES.

Walkthrough from a user with an IBKR account but no trading permission covered:

```text
fresh checkout
→ DRY_RUN startup
→ local caller authorization
→ valid/invalid BUY/SELL intent
→ preview/what-if without submit
→ idempotent replay + restart
→ manual CPGW authentication
→ clean missing-permission diagnosis
→ deliberate later LIVE enablement
→ reply-required handling
→ post-submit transport-loss reconciliation
→ cancel / partial / fill states
→ no-short-opening rejection
→ sanitized diagnostics
→ independent stop/restart
→ future central integration through the same API
```

No remaining material gap was found in localhost/browser threat handling, caller-token lifecycle, credential/account privacy, DRY_RUN accidental-submit prevention, LIVE double opt-in, provider permission/session/account failures, instrument ambiguity, snapshot/what-if prerequisites, idempotency, post-submit uncertainty, reply handling, cancel/fill semantics, SELL safety, restart, packaging, integration seam, synthetic-vs-real evidence labeling or final candidate sequencing.

Final truth:

```text
root capability branches: 8
TREE nodes:              44
implementation leaves:   32
implementation sequence: 8.1 → 8.2 → 8.3 → 8.4 → 7.4
actual live order proof: permission-dependent only
```
