# B-US-008 — Post-Backtest Autonomous AI Researcher / Local MCP

Status: `Backlog`
Priority: `Unprioritized`
Blocking: `No` for Branch 10; activation is explicitly gated on complete Branch 10 closure.

## User outcome

After Historical Backtest Lab Branch 10 is fully complete, plan and implement a new end-to-end local AI research capability that lets ChatGPT (or another approved MCP-capable AI client) autonomously investigate Market Flow US historical evidence and produce the strongest evidence-backed Scanner SQL it can justify under an explicit objective and validation protocol.

This is a **new project**, not unfinished Backtest UI work and not UI automation.

## Activation gate

Do not start implementation-authorized planning or implementation until all of `10.1`–`10.6` are done, required verification is green, Backtest PRs are merged, `main` is green and open-PR state is clean.

When that gate is satisfied, start a fresh ST Planner cycle from fresh `main`. The new cycle must design/freeze the complete S&T, contracts, security model, success evidence and execution allocation before coding.

## Required planning scope

The later project must plan the complete usable path, including:

- local research-server lifecycle and process boundary;
- MCP integration supported by the intended ChatGPT client at implementation time;
- autonomous access to schema, field semantics, source coverage and exact numeric evidence;
- safe reuse of the proven Backtest baseline/no-lookahead/Scanner/outcome authority;
- explicit evaluation of typed MCP tools versus general read-only analytical SQL and/or a read-only DuckDB research sandbox;
- strict separation between authoritative decision-time data and broader post-experiment research/debug evidence;
- exact returned-row, non-return, tie-break, null/missing and horizon debugging/provenance;
- experiment execution, comparison, sweep/validation, cancellation and resource governance;
- restart-safe research state/ledger and reproducibility;
- anti-overfitting/holdout methodology and definition of what “best” means;
- enough research freedom for the AI to choose its own investigation approach rather than following a rigid hard-coded reasoning workflow;
- final copy/paste-ready Scanner SQL plus a reproducible evidence report;
- target-machine ChatGPT → MCP → local server → Backtest/evidence → recommendation acceptance.

## Hard boundaries

Research autonomy does not grant unrelated machine authority. The later design must preserve source DB immutability, no broker/order authority, no provider/browser credentials/session data, no arbitrary source-path mutation, bounded/cancellable expensive work, public-safe diagnostics and reproducible authority separation.

## Supporting requirement dossier

The detailed user-intent/design questions captured during Branch 10 are supporting inputs, not active execution authority:

- `.planning/POST_BACKTEST_AI_MCP_MANDATE.md`
- `.planning/POST_BACKTEST_AI_MCP_AUTONOMY_AMENDMENT.md`

The amendment is the later correction where it conflicts with earlier restrictive wording: the future planner must **evaluate** general read-only SQL / direct read-only research access rather than assuming a typed-tools-only architecture, and must not unnecessarily prescribe ChatGPT's exact search algorithm or reasoning sequence.

## Completion boundary

This backlog item is complete only after the future ST Planner project is planned, implemented, deterministically verified, merged/reclosed, and proven end-to-end on the intended local ChatGPT/MCP setup. Merely exposing one `run_sql` tool or generating a prompt is insufficient.