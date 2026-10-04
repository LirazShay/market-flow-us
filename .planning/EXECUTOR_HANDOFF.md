# Executor Handoff
This file is the compact GitHub-only bootstrap for numbered implementation chats.

It does not duplicate task descriptions. `.planning/TREE.yaml` owns Strategy, Tactic, dependencies and success evidence. `.planning/EXECUTION.yaml` owns chat allocation and execution state.

## Authorization gate

Production implementation is allowed only when both are true:

```text
.planning/STATUS.yaml -> plan_state: frozen
STATUS.yaml -> phase: implementation
```

If either condition is false, do not implement.

## Fresh executor read order

For a message such as `אני צאט N תתחיל`:

1. fetch current `main`;
2. read root `AGENTS.md`;
3. read root `STATUS.yaml`;
4. read `.planning/STATUS.yaml`;
5. read this file;
6. read `.planning/EXECUTION.yaml` and locate Chat N;
7. read only Chat N's assigned sections from `.planning/TREE.yaml`;
8. read assigned-node dependencies only as needed;
9. check dependency states in `.planning/EXECUTION.yaml`;
10. load only the routed contract sections below;
11. if the chat is not the current available chat, report the blocker and do not code;
12. if available, use one focused feature branch for the chat work unit and execute assigned nodes in listed order.

Do not ask the user to restate the plan.

## Context routing

| Node family | Primary durable contracts |
|---|---|
| `1.*` | `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md`, relevant resolved decisions only |
| `2.*` | `docs/DATA_CONTRACT.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md`; Source Extraction only for exact migration provenance |
| `3.*` | `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md` |
| `4.*` | `docs/PRODUCT_SPEC.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md` |
| `5.1`–`5.5` | Scanner sections of Product Spec, Technical Spec and Test Strategy |
| `5.6` | Scanner sections of Product Spec, Technical Spec and Test Strategy + `docs/SCANNER_SQL_GUIDE.md` |
| `6.1` | Fake Market section of Test Strategy + Data Contract + relevant runtime/provider Technical Spec sections |
| `6.2` | demo sections of Test Strategy + relevant runtime/product-flow contracts |
| `6.5` | Diagnosability sections of Product Spec, Technical Spec and Test Strategy + existing failure/error contracts reused by the matrix |
| `6.6` | `docs/TEST_STRATEGY.md` §15 + package/test scripts + current Fast/Browser tests/workflows + Actions baseline evidence |
| `6.3`, `6.4` | Test Strategy + contracts exercised by those suites |
| `7.1` | workload section of Test Strategy + relevant DB/read/Scanner contracts |
| `7.2` | real-provider section of Test Strategy + Data Contract + transport/ownership contracts |
| `7.3` | root STATUS, AGENTS, README and all verification owners required by its TREE success evidence |

For every node, TREE `success_evidence` is the final definition of done.

### Diagnosability routing rule

For every implementation node, also apply the diagnosability-by-design rules in `AGENTS.md` when the node introduces or changes an operational boundary or failure path. Do not add a generic logging framework by default; add only the smallest checkpoint/error/support evidence required to localize that capability's failures.

Node `6.5` is the dedicated cross-cutting convergence pass for the shared diagnostics contract. It owns consistent checkpoint/error semantics and support-snapshot proof across already-built Browser/Node/demo boundaries; later CI/release nodes must preserve and surface that evidence rather than inventing a parallel diagnostics mechanism.

## Market Flow usage

Do not preload `market-flow`.

MarketScope contracts are sufficient for normal implementation. Consult `LirazShay/market-flow` only when an assigned node explicitly benefits from source reuse/proven implementation evidence or a concrete contradiction is discovered. Then use `docs/SOURCE_EXTRACTION.md` to locate only the relevant provenance.

## Availability rule

A node is available only when every TREE `depends_on` node is `done` in `EXECUTION.yaml`.

Within one chat:

- execute nodes in listed order;
- same-chat dependencies become available as earlier nodes become `done`;
- do not skip a blocked earlier assigned node merely because a later independent node could run.

Across chats, root `STATUS.yaml` points to the current numbered chat.

## Branch and verification

One executor chat normally owns one focused branch/PR.

For each assigned node:

```text
set in_progress on the working branch
→ implement smallest sufficient contract
→ targeted proof
→ required broader verification
→ TREE success_evidence satisfied
→ set done + concise result
→ advance root/planning STATUS to the next available node/chat on the same branch
```

Before merge, the same work-unit PR must already contain its durable execution/status transition. After merge, verify green main CI and audit repository open PRs. Do not open a second evidence-only closure PR merely to record the merge SHA/main-CI run; GitHub is the canonical source for those facts. Under the serial executor, an unexpected open PR blocks handoff.

If a material planning defect is discovered, follow the reopening rule in `AGENTS.md`; do not code around a known-bad frozen plan.

## Handoff invariants

Historical initial implementation handoff had 28 pending leaves and began at Chat 1 / node `1.1`.

After the test-feedback replan is re-frozen:

- completed implementation nodes remain durable and are not reset;
- Chat 10 remains on `5.6`; no Scanner work is repeated;
- Chat 11 owns diagnosability convergence `6.5`; pre-replan seed work on `feat/chat-10-diagnosability-ci` remains reference-only until reconciled;
- Chat 12 owns the bounded Test Feedback Optimization mini-project `6.6`;
- Chat 13 owns final CI wiring `6.3 → 6.4` on the optimized test infrastructure;
- `6.3` and `6.4` depend on `6.6`, so final CI does not fossilize the measured slow proof shape;
- workload/live/final closure shift to Chats 14/15/16 respectively;
- root STATUS remains the operational pointer and the normal authorization gate is still `plan_state: frozen` + root `phase: implementation`.


## Test-feedback optimization handoff

Node `6.6` is a bounded mini-project between diagnosability and final CI wiring.

Baseline authority:

```text
Actions run 36348375187
job total ~79s
Chromium provisioning ~26s
full Fast ~15s
full Browser ~16s
```

Optimize measured waiting/setup/lifecycle causes first. Do not remove full-suite obligations or replace real service/Chromium proof with mocks merely to hit timing targets. Node 6.3/6.4 must consume the optimized commands/infrastructure after 6.6 is done.
