# B-US-008 — Post-Backtest Autonomous AI Researcher / Local MCP

Status: `Active discovery / requirements`
Priority: `Active planning`
Blocking: `No` for completed Branch 10.

## User outcome

Plan and implement a new end-to-end local AI research capability that lets ChatGPT (or another approved MCP-capable AI client) autonomously investigate Market Flow US historical evidence and produce the strongest evidence-backed Scanner SQL it can justify for the **research objective supplied by the user at run time**.

This is a **new project**, not unfinished Backtest UI work, not UI automation, and not a hard-coded optimizer for one fixed momentum/return objective.

The permanent product is the AI research infrastructure. Individual missions such as 30-second momentum continuation, 60/120-second continuation, a target move/threshold, false-positive reduction or another future Scanner-research question are run-time Research Run objectives rather than implementation-time constants.

## Activation state

The Branch-10 activation gate is satisfied on fresh `main`: tasks `10.1`–`10.6` are complete/reclosed and the follow-on project is now explicitly activated for discovery/requirements work.

Active discovery truth is recorded in:

- `.planning/AI_RESEARCHER_DISCOVERY.md`

Do not begin implementation or allocate implementation execution until discovery is mature enough to promote the selected architecture and complete S&T into the normal authoritative planning/contracts.

## Required planning scope

The project must plan the complete usable path, including:

- local research-server lifecycle and process boundary;
- MCP integration supported by the intended desktop ChatGPT client at implementation time;
- run-time Research Run objective definition rather than a fixed built-in trading mission;
- autonomous access to schema, field semantics, source coverage and exact numeric evidence;
- safe reuse of the proven Backtest baseline/no-lookahead/Scanner/outcome authority;
- explicit evaluation of typed MCP tools versus general read-only analytical SQL and/or a read-only DuckDB research sandbox;
- strict separation between authoritative decision-time data and broader post-experiment research/debug evidence;
- exact returned-row, non-return, tie-break, null/missing and horizon debugging/provenance;
- machine-first experiment/batch execution that is free to differ from the human Inspect/Compare/Sweep UX;
- comparison/validation, cancellation and resource governance;
- restart-safe research state/ledger and reproducibility;
- anti-overfitting/holdout methodology and an objective interpretation contract that works across future run-time goals;
- enough research freedom for the AI to choose its own investigation approach rather than following a rigid hard-coded reasoning workflow;
- final copy/paste-ready Scanner SQL plus a reproducible evidence report;
- target-machine desktop ChatGPT → MCP → local research server → Backtest/evidence → recommendation acceptance.

## Critical design principle

The completed Backtest Lab is a source of **proven authority semantics and reusable engines**, not the blueprint for the AI research interface.

Preserve/reuse baseline resolution, anti-lookahead, Scanner admission, identity/returned-position semantics, outcome semantics, source immutability and deterministic provenance. Redesign the machine research API freely around what an autonomous AI needs: profiling, batch work, analytical access, experiment abstractions, debugging, persistence/resume and resource governance.

## Hard boundaries

Research autonomy does not grant unrelated machine authority. The design must preserve source DB immutability, no broker/order authority, no provider/browser credentials/session data, no arbitrary source-path mutation, no automatic live Scanner activation/trading, bounded/cancellable expensive work, public-safe diagnostics and reproducible authority separation.

## Supporting requirement dossier

The detailed user-intent/design questions captured during Branch 10 remain supporting inputs:

- `.planning/POST_BACKTEST_AI_MCP_MANDATE.md`
- `.planning/POST_BACKTEST_AI_MCP_AUTONOMY_AMENDMENT.md`

The amendment is the later correction where it conflicts with earlier restrictive wording: the planner must **evaluate** general read-only SQL / direct read-only research access rather than assuming a typed-tools-only architecture, and must not unnecessarily prescribe ChatGPT's exact search algorithm or reasoning sequence.

The newer active discovery document further clarifies that the user supplies the research mission at run time; the implementation supplies a general AI-first research environment capable of supporting future objectives that were not predesigned.

## Completion boundary

This backlog item is complete only after the full future ST Planner project is planned, implemented, deterministically verified, merged/reclosed, and proven end-to-end on the intended local desktop ChatGPT/MCP setup. Merely exposing one `run_sql` tool, mirroring the human Backtest APIs, generating a prompt, or optimizing one fixed historical objective is insufficient.