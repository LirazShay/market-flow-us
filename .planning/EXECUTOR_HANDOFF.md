# Market Flow US Executor Handoff

This is the compact GitHub-only bootstrap for numbered implementation chats.

`.planning/TREE.yaml` owns Strategy/Tactic/dependencies/success evidence. `.planning/EXECUTION.yaml` owns chat allocation/state. GitHub `main` is the source of truth between chats.

## Authorization gate

Production implementation is allowed only when all are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
.planning/STATUS.yaml -> implementation_authorized: true
STATUS.yaml -> phase: implementation
.planning/EXECUTION.yaml -> allocated
```

Otherwise do not code.

## Fresh executor read order

For `אני צאט N תתחיל`:

1. fetch fresh `main`;
2. read `AGENTS.md`;
3. read `STATUS.yaml`;
4. read `.planning/STATUS.yaml`;
5. read this file;
6. read `.planning/EXECUTION.yaml` and locate Chat N;
7. read only assigned TREE leaves + direct dependencies;
8. verify every dependency is `done` in EXECUTION;
9. load only the contracts/tests/code routed below;
10. if Chat N/current node/dependencies do not authorize work, report blocker and do not code;
11. otherwise create one focused feature branch and execute assigned leaves in order.

Do not ask the user to restate the plan.

## Current serial allocation

```text
Chats 1–24: completed historical implementation through 9.5
Chat 25: 9.6 Replay pre-user-run hardening
Chat 26: 8.5 basic in-product BUY
Chat 27: 7.4 final target-machine/provider acceptance
```

This is execution order, not a false S&T dependency between `9.6` and `8.5`.

Current dependency truth:

```text
9.6 depends on 9.5
8.5 depends on 3.3 + 8.4
7.4 depends on 7.5 + 8.5 + 9.6
```

Do not skip forward. `7.4` is final and must run on the exact candidate produced after both `9.6` and `8.5` are complete.

The completed post-Branch-9 historical product candidate entering `9.6` is:

```text
243f4f2e78e434378ff2202ba95af7b8626a0369
```

That SHA remains historical evidence only after later runtime changes.

## Contract routing

TREE `success_evidence` is always definition-of-done.

| Node | Primary durable truth |
|---|---|
| `1.*` acquisition | `docs/DATA_CONTRACT.md`, `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md` |
| `2.*` market authority | `docs/DATA_CONTRACT.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md` |
| `3.*` reads/Viewer | `docs/PRODUCT_REQUIREMENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md` |
| `4.*` Scanner/Demo Buy/AI | Demo Buy/AI contracts named by the assigned TREE leaf plus `docs/TEST_STRATEGY.md` |
| `5.*` Fake Market/E2E | `docs/TEST_STRATEGY.md`, `docs/DATA_CONTRACT.md`, `docs/PRODUCT_SPEC.md` |
| `6.*` packaging/diagnostics/workload | assigned TREE leaf + `docs/TECHNICAL_SPEC.md` + `docs/TEST_STRATEGY.md` |
| `7.1`–`7.5` historical release leaves | TREE evidence + release/local-acceptance contracts |
| `8.1`–`8.4` standalone order service | `docs/IBKR_ORDER_SERVICE.md`, `docs/IBKR_ORDER_SERVICE_SECURITY.md`, `.planning/IBKR_ORDER_MINI_PROJECT.md`, affected generic contracts |
| `9.1`–`9.5` Market Replay | `docs/MARKET_REPLAY.md`, `.planning/MARKET_REPLAY_MINI_PROJECT.md`, affected generic contracts |
| `9.6` Replay hardening | `docs/REPLAY_HARDENING.md`, `docs/MARKET_REPLAY.md`, `.planning/REPLAY_BUY_EXTENSION_REVIEW.md`, existing Replay tests/code only as routed by the hardening contract |
| `8.5` basic BUY | `docs/BASIC_BUY_INTEGRATION.md`, `docs/IBKR_ORDER_SERVICE.md`, `docs/IBKR_ORDER_SERVICE_SECURITY.md`, `.planning/REPLAY_BUY_EXTENSION_REVIEW.md`, current Detail/service/launcher/order-sidecar tests/code |
| `7.4` final acceptance | exact final candidate after `9.6` + `8.5`; first-run/target-machine contracts, heavy workload, authenticated market-data gates, standalone order service and integrated Detail BUY acceptance |

## Chat 25 — TREE 9.6

Goal: adversarially audit and, where evidence requires, repair the completed Replay implementation before relying on the user's serious target-machine Replay run.

Required flow:

```text
fresh main
→ mark 9.6 in_progress
→ static audit every area in docs/REPLAY_HARDENING.md
→ run/reuse focused proof
→ add smallest regression for each newly identified material risk
→ root-cause/fix blocking defects
→ full required replay/unit/service + materially affected broad gates
→ create/update .planning/REPLAY_HARDENING_AUDIT.md
→ exact candidate SHA
→ PR/CI/review/squash merge
→ main CI + open-PR audit
→ mark 9.6 done
→ advance to Chat 26 / 8.5
```

Hardening must not invent speculative Replay features. Shared market protocol/server remains replay-unaware. Replay Host owns only its child and replay-only DB artifacts. Missing earlier history remains ordinary startup state.

## Chat 26 — TREE 8.5

Goal: implement the smallest explicit in-product BUY while preserving Branch-8 security/idempotency/provider authority.

MVP:

```text
surface: current Detail only
side: BUY
quantity: positive finite run configuration
order: MKT / DAY
instrument: Node-owned STK / USD / SMART + authoritative current Symbol
mode: run-owned DRY_RUN by default; LIVE only by explicit operator opt-in
```

Mandatory trusted seam:

```text
provider-page Viewer
→ order.buy.prepare({securityId}) only
→ immutable short-lived ticket; zero sidecar/provider mutation
→ product-owned loopback confirmation page
→ explicit human confirmation + same-origin/anti-CSRF/ticket checks
→ Node calls existing ibkr-order-service with Node-held IPC caller token
```

Never expose the order-service caller token to browser JavaScript/DOM/storage/URL. Never relax sidecar browser-Origin rejection or CORS. Never add a generic Viewer order proxy. Stable server-generated `requestId` must survive double-click/retry; `ACKNOWLEDGEMENT_UNKNOWN` never blind-resubmits.

Normal launcher, Scanner, Demo Buy, AI Investigation and Replay remain execution-disabled.

## Chat 27 — TREE 7.4

Final acceptance starts only after `9.6` and `8.5` are `done` and repository truth points to the exact final product candidate.

Run the complete target-machine acceptance required by TREE/first-run contracts, including:

```text
Local Fake market + Demo Buy + AI Investigation
Replay usability/isolation on the final SHA
standalone order-service compatibility
integrated Detail BUY DRY_RUN confirmation path
real LIVE BUY only when external permission exists; otherwise PENDING_EXTERNAL_PERMISSION
4096 x 180 + isolated one-day probes
authenticated static market-data smoke
market-open movement gate
privacy/sanitization checks
```

Synthetic proof must never be mislabeled as real IBKR submission.

## Security invariants

Repository is public-safe. Never commit or report:

```text
credentials
cookies/session tokens
real account identifiers
private browser data
raw authenticated dumps
sidecar caller token
BUY confirmation ticket/anti-CSRF nonce
Replay Host control credential
```

Use sanitized/synthetic fixtures only. Do not bypass browser/provider security mechanisms.

## Completion discipline

For every assigned node:

```text
TREE strategy/tactic
→ contracts
→ success_evidence
→ focused proof
→ required broad gates
→ exact candidate
→ PR CI green
→ review diff
→ squash merge
→ main CI green
→ open-PR audit clean
→ STATUS + EXECUTION next truth
```

Only then mark the node `done`.
