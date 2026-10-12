# B-US-008 — Post-Backtest Autonomous AI Researcher / Local MCP

Status: `Active discovery / requirements`
Priority: `Active planning`
Blocking: `No` for completed Branch 10.

## User outcome

Plan and implement a new end-to-end local AI research capability that lets desktop ChatGPT (or another approved MCP-capable AI client) autonomously investigate Market Flow US historical evidence and produce the strongest evidence-backed Scanner SQL it can justify for the **short-horizon momentum / stock-selection objective supplied by the user at run time**.

This is a **new project**, not unfinished Backtest UI work, not UI automation, not a general-purpose finance research platform, and not a hard-coded optimizer for one fixed momentum/return objective.

The permanent product is the AI research infrastructure for this domain:

```text
Market Flow US universe
→ identify/rank the strongest near-term upward-momentum continuation candidate(s)
→ produce Scanner SQL suitable for selecting the best current buy candidate(s)
```

Individual missions such as 30-second continuation, 60/120-second continuation, a target positive move, false-positive reduction, selectivity or another short-horizon momentum criterion are run-time Research Run objectives rather than implementation-time constants.

## Activation state

The Branch-10 activation gate is satisfied on fresh `main`: tasks `10.1`–`10.6` are complete/reclosed and the follow-on project is now explicitly activated for discovery/requirements work.

Active discovery truth is recorded in:

- `.planning/AI_RESEARCHER_DISCOVERY.md`
- `.planning/AI_RESEARCHER_ARCHITECTURE_DISCOVERY.md` — selected architecture direction and rejected alternatives; still pre-implementation.
- `.planning/AI_RESEARCHER_EXPERIMENT_MODEL.md` — selected Research Run / evidence-partition / validation / sealed-holdout methodology direction; still pre-implementation.
- `.planning/AI_RESEARCHER_API_LEDGER_CONTRACT.md` — selected machine API, jobs/results, resume, immutable query-artifact and research-ledger contract direction; still pre-implementation.
- `.planning/AI_RESEARCHER_DATA_SURFACE.md` — selected phase-aware research projection, SQL sandbox, raw/typed evidence and multi-day data-surface direction; still pre-implementation.
- `.planning/AI_RESEARCHER_OPERATING_CONTRACT.md` — selected Plugin/Skill + MCP bootstrap, progressive-disclosure, autonomy, resume and final-output operating contract; still pre-implementation.
- `.planning/AI_RESEARCHER_SECURITY_RESOURCE_MODEL.md` — selected threat model, SQL/sandbox defense-in-depth, resource/cancellation/restart governance and required workload/security proof; still pre-implementation.

Do not begin implementation or allocate implementation execution until discovery is mature enough to promote the selected architecture and complete S&T into the normal authoritative planning/contracts.

## Required planning scope

The project must plan the complete usable path, including:

- local research-server lifecycle and process boundary;
- MCP integration supported by the intended desktop ChatGPT client at implementation time;
- run-time Research Run objective definition within the short-horizon momentum/stock-selection domain;
- autonomous access to schema, field semantics, source coverage, actual cadence/gaps and exact numeric evidence;
- safe reuse of the proven Backtest baseline/no-lookahead/Scanner/outcome authority;
- explicit evaluation of typed MCP tools versus general read-only analytical SQL and/or a read-only DuckDB research sandbox;
- strict separation between authoritative decision-time data and broader post-experiment research/debug evidence;
- exact returned-row, non-return, tie-break, null/missing and horizon debugging/provenance;
- machine-first experiment/batch execution that is free to differ from the human Inspect/Compare/Sweep UX;
- comparison/validation, cancellation and resource governance;
- restart-safe research state/ledger and reproducibility;
- anti-overfitting/holdout methodology and an objective interpretation contract that works across future momentum-run goals;
- enough research freedom for the AI to choose its own investigation approach rather than following a rigid hard-coded reasoning workflow;
- plugin/Skill bootstrap and progressive disclosure so a fresh AI conversation can operate correctly without a giant static prompt or prior chat history;
- defense-in-depth SQL/source/holdout isolation plus measured CPU/memory/disk/time/concurrency governance and crash/cancellation proof;
- final copy/paste-ready Scanner SQL plus a reproducible evidence report;
- target-machine desktop ChatGPT → Plugin/Skill + MCP → local research server → Backtest/evidence → recommendation acceptance.

## Critical design principles

### Human Backtest is evidence/engine authority, not the AI interface blueprint

The completed Backtest Lab is a source of **proven authority semantics and reusable engines**, not the blueprint for the AI research interface.

Preserve/reuse baseline resolution, anti-lookahead, Scanner admission, identity/returned-position semantics, outcome semantics, source immutability and deterministic provenance. Redesign the machine research API freely around what an autonomous AI needs: profiling, batch work, analytical access, experiment abstractions, debugging, persistence/resume and resource governance.

### Existing product is a proven baseline, not a ceiling

If discovery, implementation measurement or later AI research produces evidence that an additional Market Flow US capability would materially improve research quality, efficiency, observability or reproducibility, the project may plan and implement the required additive/adaptive change. Candidate areas may include Collector cadence, timing metadata, derived features, service APIs, batch operations, profiling, provenance, research-only persistence, caches or indexes.

Such changes are not preapproved merely because they may help. Each must be justified by the relevant S&T/measurement, preserve existing proven behavior unless intentionally superseded, receive focused regression proof and pass all affected verification before the AI researcher relies on it.

The AI Research Run itself does not receive authority to self-modify production code/configuration or silently change live collection cadence.

### Current evidence must be useful immediately

Research begins with the historical evidence that already exists. If collection is currently approximately every 10 seconds, the AI must use the actual recorded timestamps/cycles, quantify cadence/gaps/horizon feasibility, and return the best defensible result supported by that evidence.

Future denser collection such as approximately 5s or 3s may later be evaluated if evidence shows a material resolution limitation. That possibility does not block this project and should not force a redesign: the research environment must be cadence-agnostic and able to rerun comparable research when denser evidence becomes available.

### Research validity is enforced by the server, not prompt discipline alone

Development, Validation and Sealed Holdout evidence are distinct server-enforced roles. Development is open for broad exploration; Validation exposures are frozen/comparable and counted; Holdout outcome/detail access remains sealed until a bounded Finalist Set and Objective Version are frozen for final evaluation.

If SQL is changed in response to holdout results, that holdout is no longer independent proof for the revised lineage. Final reporting must expose search breadth, validation exposure, exact denominators and insufficient-evidence conditions rather than always declaring a winner.

### Research continuity is durable server state, not chat memory

Correctness-critical research state lives in the local Research Server / Research Ledger and is referenced through stable IDs. A fresh desktop ChatGPT conversation must be able to resume from `researchRunId` and retrieve objective/evidence/query/experiment/job/validation/finalist state without depending on prior chat history or stored chain-of-thought.

MCP is a thin adapter over this durable domain contract. Large results use bounded result handles/pages; expensive work uses durable jobs with progress/cancellation rather than one giant synchronous model call.

### AI autonomy is constraint-based, not workflow-scripted

The AI may choose its own hypotheses, experiment order, research SQL, ablations, candidate branching and stopping behavior inside the user's objective and server-enforced evidence/resource boundaries. The reusable Skill teaches a small set of invariants and final-output requirements rather than a fixed momentum formula or mandatory search sequence.

Bootstrap is progressive: small Skill instructions + live `describe_research_environment`/resume state first, then schema/evidence/results on demand. Context is not used as a warehouse; summaries and stable result handles precede raw-row drill-down.

### Security and workload validity are proven, not assumed

AI-authored SQL/tool input is treated as untrusted analytical input even on localhost. Original evidence is reachable only through allowlisted read-only server code; AI SQL runs in an isolated hardened sandbox with unauthorized evidence physically absent. Resource limits are nested, observable, cancellable and configurable rather than unbounded.

Do not freeze performance limits from intuition. Extend the existing Market Flow US workload framework with deterministic CI, representative 4,096-security synthetic research profiles and final target-machine real-evidence acceptance. Security acceptance includes adversarial SQL, holdout isolation, cancellation/restart integrity and before/after source fingerprint/hash equality.

## Hard boundaries

Research autonomy does not grant unrelated machine authority. The design must preserve source DB immutability, no broker/order authority, no provider/browser credentials/session data, no arbitrary source-path mutation, no automatic live Scanner activation/trading, bounded/cancellable expensive work, public-safe diagnostics and reproducible authority separation.

## Supporting requirement dossier

The detailed user-intent/design questions captured during Branch 10 remain supporting inputs:

- `.planning/POST_BACKTEST_AI_MCP_MANDATE.md`
- `.planning/POST_BACKTEST_AI_MCP_AUTONOMY_AMENDMENT.md`

The amendment is the later correction where it conflicts with earlier restrictive wording: the planner must **evaluate** general read-only SQL / direct read-only research access rather than assuming a typed-tools-only architecture, and must not unnecessarily prescribe ChatGPT's exact search algorithm or reasoning sequence.

The newer active discovery documents further clarify the short-horizon momentum/stock-selection domain, runtime objective semantics, cadence handling, permission to evolve Market Flow US itself when evidence proves a necessary AI-research capability gap, the selected hybrid `typed authority + bounded research SQL` / two-sandbox architecture direction, the selected Development/Validation/Sealed-Holdout research-validity model, the durable machine API / jobs / result-handle / research-ledger model required for autonomous resumable work, the research projection/data-surface design, the Plugin/Skill + MCP operating contract for fresh/resumed AI sessions, and the defense-in-depth security/resource/workload proof model.

## Completion boundary

This backlog item is complete only after the full future ST Planner project is planned, implemented, deterministically verified, merged/reclosed, and proven end-to-end on the intended local desktop ChatGPT/MCP setup. Merely exposing one `run_sql` tool, mirroring the human Backtest APIs, generating a prompt, optimizing one fixed historical objective, or forcing research to remain within today's human-oriented product surfaces is insufficient.
