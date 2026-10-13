# B-US-010 — Autonomous AI Trading & Strategy Distillation

## Status

Backlog strategic future goal. This record does not authorize implementation by itself.

## Desired outcome

Extend Market Flow US so a local AI-assisted trading capability can take a bounded Scanner shortlist, observe a small candidate set through targeted live quotes, participate in entry/hold/exit decisions, execute only through the existing protected IBKR order authority, preserve complete durable trade evidence, learn from repeated episodes, and distill validated behavior into deterministic policy/code that does not require an AI response on every market tick.

The long-term operating shape is:

```text
Scanner shortlist
→ targeted live quote watch
→ AI exploratory decisions + deterministic supervisor
→ independent hard-risk authority
→ existing IBKR Order Service
→ IBKR

Trade Episode evidence
→ attribution / learning
→ policy candidates
→ deterministic strategy distillation
```

## Core boundaries

- Keep the existing Autonomous AI Researcher capability separate from trading authority. Do not add broker/order mutation to the Research MCP.
- Build a separate Trading capability / MCP that reuses proven MCP/runtime/package patterns where useful but does not duplicate Research-domain logic.
- The AI must not call IBKR/CPGW directly. All broker mutation remains behind the existing IBKR Order Service and its validation, idempotency, reconciliation and LIVE gates.
- A deterministic Trading Supervisor owns the continuous runtime loop. AI participation is expressed as bounded state-aware decision proposals; loss or delay of an AI session must not leave a position unmanaged.
- Hard risk limits are independent authority and cannot be bypassed by AI, Trading Policy, MCP or Supervisor decisions.
- Scanner remains the broad universe filter. Only a bounded shortlist receives targeted live quote monitoring.
- Start with bounded targeted snapshot polling; add streaming only if measured evidence proves polling insufficient.
- Preserve Trade Episode evidence that can distinguish Scanner-selection quality from entry, fill/execution, position-management and exit quality.
- AI exploration may generate Policy Candidates, but promotion to normal deterministic behavior is explicit and evidence-backed. Do not introduce self-modifying production code or a speculative universal strategy DSL.
- Treat the repository as public-safe; never persist or expose credentials, session material, account identifiers or raw authenticated provider dumps.

## Initial implementation-ready planning shape

When promoted into active planning, the expected Branch 12 scope is:

1. `12.1` Trading domain + durable Run / Policy / Episode authority.
2. `12.2` Scanner candidate handoff + immutable selection provenance.
3. `12.3` Targeted live quote watch.
4. `12.4` Continuous Trading Supervisor + state-aware AI Decision Proposal model.
5. `12.5` Independent Hard Risk Authority + pause / kill-switch boundary.
6. `12.6` Existing IBKR Order Service execution bridge.
7. `12.7` Separate Trading Skill + Trading MCP.
8. `12.8` Episode attribution + policy learning + deterministic distillation.
9. `12.9` Shadow / synthetic / DRY_RUN / controlled-LIVE acceptance and adversarial reclosure.

The active PLAN must perform fresh-main review, Final Planning Review and explicit success-evidence definition before these leaves become execution authority.

## Execution / acceptance independence

`B-US-009` currently represents AI Researcher target-machine/Desktop acceptance that requires real user/target-machine evidence. This trading goal has no technical dependency on that user acceptance result.

A task that is blocked only because it awaits user, target-machine, provider-window or other external acceptance evidence must not freeze unrelated planning or implementation. Independent work may continue when PLAN/EXECUTION shows no real dependency. If future evidence creates a genuine dependency, record that dependency explicitly in `.planning/EXECUTION.md` rather than inferring it from chronology, task numbering, or a blocked status elsewhere.

## Promotion rule

Before implementation:

- review against fresh `main` and current IBKR/Scanner/Research contracts;
- promote the selected S&T into `.planning/PLAN.md`;
- record only material durable decisions in `.planning/DECISIONS.md`;
- add explicit execution rows/dependencies/owners to `.planning/EXECUTION.md`;
- add only the minimal durable product/technical/test contract changes required;
- keep `B-US-009` acceptance state independent unless a real technical dependency is discovered.
