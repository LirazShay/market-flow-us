# Autonomous AI Researcher — S&T Consolidation / Promotion Record

Status: `promoted / historical planning provenance`

Scope: `B-US-008` → **Branch 11 — Autonomous AI Researcher**

This file records that the autonomous-research discovery was consolidated, reviewed outside-in and promoted into the repository's normal ST Planner authorities. It is no longer a planning/execution authority and must not compete with them.

## Authoritative result

The promoted truth is now:

- `.planning/PLAN.md` — Branch 11 Strategy/Tactic, assumptions, alternatives, invalidation conditions, necessity/sufficiency, leaves `11.1`–`11.8` and success evidence.
- `.planning/DECISIONS.md` — durable decisions `D-US-049`–`D-US-055`.
- `.planning/EXECUTION.md` — Chat 35–42 allocation, pending/done status and real dependencies.
- `docs/EXECUTOR_ROUTING.md` — exact durable context routing for each Branch-11 executor.
- `STATUS.yaml` — non-authoritative current projection/navigation compatibility file; the active projection is `11.8 / Chat 42` while TREE 11.8 remains in progress.

The original full promotion candidate and its detailed Final Planning Review remain available in Git history from this planning branch; the candidate was first committed as `cff0a44e58ac0568b5e1427abe3401ae28045f2e`.

## Discovery inputs preserved

- `.planning/AI_RESEARCHER_DISCOVERY.md`
- `.planning/AI_RESEARCHER_ARCHITECTURE_DISCOVERY.md`
- `.planning/AI_RESEARCHER_EXPERIMENT_MODEL.md`
- `.planning/AI_RESEARCHER_API_LEDGER_CONTRACT.md`
- `.planning/AI_RESEARCHER_DATA_SURFACE.md`
- `.planning/AI_RESEARCHER_OPERATING_CONTRACT.md`
- `.planning/AI_RESEARCHER_SECURITY_RESOURCE_MODEL.md`
- `.planning/POST_BACKTEST_AI_MCP_MANDATE.md`
- `.planning/POST_BACKTEST_AI_MCP_AUTONOMY_AMENDMENT.md`
- `docs/BACKTEST_LAB.md`
- `docs/DATA_CONTRACT.md`
- `docs/SCANNER_SQL_GUIDE.md`
- `AGENTS.md`

These files remain detailed implementation context where routed. Their discovery-era status lines such as `active discovery`, `not started` or `not implementation-authorized` are historical snapshot metadata from before promotion; they are **not current execution status** and must never override `.planning/PLAN.md`, `.planning/EXECUTION.md`, `.planning/DECISIONS.md` or the implementation/evidence produced by the promoted Branch-11 leaves. If any substantive detail conflicts with a current authoritative file or completed implementation contract, the current authoritative truth wins.

## Promotion decisions summarized

The selected architecture is a local dedicated Research Server with a separate durable Research Ledger, typed authoritative experiment capabilities and bounded general read-only `research_sql` in a physically separate research sandbox. Original market evidence remains immutable. Authoritative Scanner execution continues to reuse the proven Backtest `T0 → B`, no-lookahead, Scanner-admission and post-decision outcome semantics.

Research validity is enforced by server-owned Development / Validation / Sealed Holdout roles. Long work uses durable jobs/result handles, bounded resources, cancellation/restart semantics and measured performance limits. Desktop ChatGPT uses the project-owned Skill plus thin 46-tool MCP adapter implemented by TREE 11.6. The current same-machine acceptance path is the repo-local plugin marketplace plus bundled `stdio` MCP process in ChatGPT Desktop; remote HTTPS/tunnel transport is optional and is not a substitute for TREE 11.8 target-machine Desktop acceptance.

Research remains cadence-agnostic: actual timestamps/cycles are evidence. Capability gaps such as denser Collector cadence, additional typed fields or measured cache/index needs re-enter normal S&T/product work rather than being silently changed by an autonomous Research Run.

## Execution-shape rationale

Allocation follows feature/context cohesion, not a goal of maximizing or minimizing chat count:

| Owner | Leaf | Context |
|---|---|---|
| `Chat 35` | `11.1` | Research Server domain + ledger + run/resume foundation |
| `Chat 36` | `11.2` | authoritative experiments + Backtest authority reuse |
| `Chat 37` | `11.3` | general research SQL projection/sandbox |
| `Chat 38` | `11.4` | jobs/results/resources/cancellation/restart |
| `Chat 39` | `11.5` | Validation / Sealed Holdout / final recommendation |
| `Chat 40` | `11.6` | Plugin/Skill + MCP operating integration |
| `Chat 41` | `11.7` | adversarial security/failure hardening |
| `Chat 42` | `11.8` | representative workload + real desktop acceptance + reclosure |

`11.1`–`11.7` are complete. `11.8 / Chat 42` is the only active Branch-11 execution leaf: W1/W2 are green, while the real target-machine ChatGPT Desktop W3 mission, full Desktop/MCP restart and second-fresh-conversation durable resume proof remain required before final reclosure.

`11.2` and `11.3` are independent siblings after `11.1`; numbering is not dependency truth. Every fresh executor is expected to reconstruct correctness-critical context from GitHub rather than previous-chat memory.

## Planning-review conclusion

The eight leaves passed the removal/sufficiency review as independently necessary outcomes. No unresolved material architecture/product decision remains before implementation. Exact numeric budgets and local MCP integration details were intentionally execution-time measurement/integration choices governed by fixed invariants; their implemented/current truth now lives in the promoted contracts, execution evidence and TREE 11.6–11.8 artifacts rather than in pre-promotion discovery status labels.

If implementation discovers evidence that invalidates an assumption, apply the repository Planning Impact Test and reopen only the smallest affected PLAN/decision/contract area before coding forward.
