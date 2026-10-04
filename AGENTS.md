# AGENTS.md — Market Flow US Operating Rules

GitHub `main` in `LirazShay/market-flow-us` is the product source of truth.

Default repository language is Hebrew. Code, identifiers, filenames and technical terms may remain in English.

## Repository roles

- `market-flow-us` — THE PRODUCT and current truth.
- `market-scope@d8bc770d292d328d7e89febb8ef4f450abe9458e` — exact imported implementation/test donor.
- `trading-us@51fa85a951728c117f1e345760971aef5fa3cec4` — U.S. provider-discovery evidence donor.
- `market-flow` — historical design evidence only.
- `st-planner` — planning-framework reference.

Normal implementation must not require donor-repo history once the relevant fact is extracted here.

## Product migration rule

Market Flow US is a controlled U.S. conversion of the proven MarketScope product, not a rewrite.

```text
preserve proven MarketScope behavior
→ replace only Israel-specific provider/data assumptions
→ keep tests green
→ prove U.S. replacement
→ remove superseded Israel path only after cutover proof
```

Do not introduce a Strategy Engine, temporal-link engine, dynamic schema, new database architecture or new transport unless measured evidence proves the current mechanism insufficient.

The staged candidate idea is Scanner SQL. Strategy logic belongs in editable/saved SQL unless a later measured bottleneck justifies a narrower implementation optimization.

## Fresh-chat read order

Planning/review:

```text
AGENTS.md
→ STATUS.yaml
→ .planning/STATUS.yaml
→ .planning/GOAL.md
→ only current TREE nodes + routed contracts/evidence
```

Execution after freeze:

```text
AGENTS.md
→ STATUS.yaml
→ .planning/STATUS.yaml
→ .planning/EXECUTOR_HANDOFF.md
→ .planning/EXECUTION.yaml
→ assigned TREE nodes + dependencies
→ only routed contracts/tests/code
```

GitHub `main` overrides chat history.

## Branch and PR workflow

Every meaningful planning or engineering work unit uses:

```text
fresh main
→ focused branch
→ work + focused proof
→ update STATUS/EXECUTION on same branch
→ PR
→ required CI green
→ review diff
→ squash merge
→ verify main CI
→ audit open PRs
```

Rules:

- one coherent outcome per PR;
- no independent next unit before the current PR merges and required main CI is green;
- an unexpected open PR is a blocker until adopted, merged or closed;
- `main` is accepted truth; an open PR is work in progress;
- blocking defects remain with the chat that discovers them;
- fix root cause + regression proof, not only the symptom;
- if implementation proves the frozen plan materially wrong, reopen the smallest affected planning area before coding forward.

## Planning boundary

Production implementation is forbidden while:

```text
STATUS.yaml -> phase: planning
```

Implementation is authorized only when:

```text
.planning/STATUS.yaml -> plan_state: frozen
AND
STATUS.yaml -> phase: implementation
```

The planner must finish contracts, S&T review, coverage audit, freeze, allocation and handoff verification before authorizing execution.

## Serial executor protocol

When the user says `אני צאט N תתחיל` or equivalent:

1. read `.planning/EXECUTOR_HANDOFF.md`;
2. read `.planning/EXECUTION.yaml`;
3. verify root STATUS points to chat N and its first non-done node;
4. load only assigned TREE nodes/dependencies and routed contracts;
5. verify dependencies are `done`;
6. set the active node `in_progress` before implementation;
7. implement/test only assigned unblocked work;
8. mark `done` only after success evidence is green;
9. merge the PR and verify main before advancing STATUS.

A chat may own several nodes; execute them in listed order.

## Engineering defaults

KISS:

```text
current verified requirement
→ smallest sufficient mechanism
→ prove it
→ stop
```

Tests protect observable/public contracts. Reuse the imported tests wherever behavior is unchanged; adapt tests only where the U.S. contract intentionally changes.

### Diagnosability-by-design

Preserve MarketScope's diagnosability model:

- stable component/checkpoint;
- stable error code;
- last successful checkpoint;
- sanitized causal message;
- bounded Support Snapshot / CLI fallback;
- no secrets, cookies, auth/session material, account identifiers, raw authenticated dumps or private browser state.

The target boundary remains:

```text
authenticated provider page
→ validated complete U.S. snapshot
→ loopback WebSocket
→ localhost Node.js service
→ native DuckDB
→ Current / Detail-History / Scanner
```

## Security

Treat the repository as public-safe regardless of visibility.

Never commit credentials, cookies, authorization/session data, account identifiers, private browser state or raw authenticated captures. Use sanitized/synthetic fixtures only. Do not bypass browser/provider security mechanisms.

## Durable ownership

- `STATUS.yaml` — operational phase/current execution pointer.
- `.planning/STATUS.yaml` — plan state.
- `.planning/GOAL.md` — stable U.S. migration goal.
- `.planning/TREE.yaml` — S&T logic/dependencies/evidence.
- `.planning/DECISIONS.md` — material decisions.
- `.planning/REVIEWS.md` — plan reviews.
- `.planning/MASTER_COVERAGE.md` + `COVERAGE_MAP.yaml` — U.S. migration anti-forgetting coverage.
- `.planning/EXECUTION.yaml` — numbered execution allocation.
- `.planning/EXECUTOR_HANDOFF.md` — executor routing.
- `docs/PRODUCT_REQUIREMENTS.md` — what/why.
- `docs/PRODUCT_SPEC.md` — observable behavior.
- `docs/DATA_CONTRACT.md` — provider/data truth.
- `docs/TECHNICAL_SPEC.md` — architecture/schema contract.
- `docs/TEST_STRATEGY.md` — verification contract.
- `docs/SOURCE_EXTRACTION.md` / `docs/US_SOURCE_EVIDENCE.md` — migration provenance/evidence.

Do not duplicate live operational status in durable specs.
