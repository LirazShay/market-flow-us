# Post-Backtest AI MCP — Autonomy / Data-Access Amendment

Status: `DEFERRED_UNTIL_BACKTEST_COMPLETE`

Supporting user-intent/design input for backlog authority `B-US-008` in `backlog/B-US-008-post-backtest-autonomous-ai-researcher-mcp.md`. This file does not activate execution and is not a second live backlog authority.

This amendment records the latest user intent for `.planning/POST_BACKTEST_AI_MCP_MANDATE.md`.

## Primary correction

The goal is not to prescribe a rigid ChatGPT workflow, state machine, hypothesis format or fixed sequence of tools. The goal is to build an environment in which the AI has enough trustworthy capabilities, context and data access to choose its own research approach and work autonomously until it finds the strongest query it can justify from the available evidence.

The future ST Planner cycle must optimize for capability and research freedom inside hard authority/security boundaries.

## Data-access architectures that must be compared

The future planner must explicitly evaluate, rather than assume:

1. only typed high-level research tools;
2. typed tools plus a general read-only analytical SQL tool;
3. typed tools plus a direct read-only DuckDB research sandbox/connection where technically appropriate;
4. a hybrid research database/view layer exposing raw and derived evidence while source DBs remain immutable.

General read-only SQL must be seriously evaluated because the AI may need ad-hoc profiling, aggregates, null/missing analysis, correlations, raw-number inspection, security/time-window debugging and hypothesis testing that no predesigned MCP tool anticipated.

## Strategy evaluation vs research/debug reads

Keep two concepts distinct:

- **Authoritative strategy execution at T0:** anti-lookahead remains mandatory (`latest = B`, `history <= B`).
- **Post-experiment research/debug analysis:** broader read-only evidence may be legitimate, including future observations, when clearly labeled and isolated from decision-time authority.

The architecture must prevent future/debug evidence from silently becoming Scanner decision input while still giving the AI enough visibility to understand and improve results.

## Minimum hard boundaries

Whatever access model is selected, preserve at least:

- source DB immutability;
- no broker/order authority;
- no provider/browser credentials or auth/session state;
- no unrestricted filesystem mutation;
- no arbitrary source-path access;
- bounded/cancellable expensive work;
- public-safe diagnostics;
- reproducible experiment/evidence references;
- explicit authority separation between decision-time and post-decision evidence.

## ChatGPT guidance

The future system should tell ChatGPT the mission, available tools/data, schema semantics, authority rules, research-state location and final deliverable. It should not unnecessarily dictate the exact search algorithm, experiment order or reasoning style. The later planning cycle must determine the minimum useful bootstrap guidance that preserves autonomy.

## End-to-end scope remains mandatory

After Backtest Branch 10 is complete, the new project must still plan and implement the whole usable path: local server lifecycle, MCP integration, schema/data introspection, evidence access, authoritative Backtest execution, optional/general analytical SQL if justified, exact numeric results, debugging/provenance, research persistence/resume, security/resource controls, ChatGPT connection/setup, and a final evidence-backed Scanner SQL recommendation artifact.