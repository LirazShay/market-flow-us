# Market Flow US — Plan

`.planning/PLAN.md` is the authoritative ST Planner 2.0 planning / S&T document for Market Flow US.

Execution ownership, live status, real execution dependencies and result/evidence truth live only in `.planning/EXECUTION.md`. Root `STATUS.yaml` may project navigation state for compatibility, but it is not an authority. This document intentionally contains no freeze, authorization, allocation, handoff, review-cycle or planner-runtime state.

## Desired outcome

Market Flow US is a locally runnable U.S.-market product with five deliberately separated capability lanes:

1. **Market analysis and strategy validation** — authenticated U.S. provider snapshots → exact validation → normal ProducerBridge → localhost Node.js service → active-day DuckDB → Current / Detail-History / editable Scanner SQL → Demo Buy → deterministic local AI Investigation evidence.
2. **Order execution** — a standalone local Interactive Brokers order-service sidecar with authenticated localhost caller protection, DRY_RUN by default, fail-closed LIVE gates, restart-safe idempotency and explicit BUY/SELL lifecycle; the product has one deliberately narrow current-Detail BUY consumer through a trusted local confirmation boundary.
3. **Market Recording + Replay** — validated browser snapshots → IndexedDB and/or portable recording → 1x Player → unchanged normal ProducerBridge/service path → isolated replay-only DuckDB → the same analytical surfaces.
4. **Historical Backtest Lab** — existing active/archive Market Flow US DuckDB evidence → isolated read-only historical query context → unchanged Scanner SQL → post-decision outcome evaluation → Inspect / Compare / Sweep investigation, without requiring a provider page, Collector, Replay, order service or open market.
5. **Autonomous AI Researcher** — desktop ChatGPT → project-owned Plugin/Skill + thin local MCP adapter → dedicated local Research Server → durable Research Ledger → authoritative historical Scanner experiments + bounded read-only research SQL → Development / Validation / Sealed Holdout → copy/paste Scanner SQL or explicit `NO_RECOMMENDATION` with reproducible evidence.

These lanes remain intentionally separated. Scanner, Demo Buy, AI Investigation, Backtest and the Autonomous AI Researcher never automatically place orders. Replay never turns the normal market service into a replay-aware service. Backtest and AI research never mutate market authority or become broker/fill/portfolio simulators.

## Current reality and completion boundary

Branches 1–10 are completed and deterministically reclosed. Their exact historical S&T before Branch-11 promotion remains available in Git history at `market-flow-us` commit `b37a6c4a9e8491d359bb3c7879255a42a8491fcf`; their durable product semantics remain in the domain contracts and `.planning/DECISIONS.md`, and their execution result/evidence truth remains in `.planning/EXECUTION.md`.

Backlog `B-US-008` has now completed discovery and Final Planning Review and is promoted here as **Branch 11 — Autonomous AI Researcher**. Branch 11 is implementation-ready at the planning level; implementation begins only through explicitly activated pending rows in `.planning/EXECUTION.md` and normal repository branch/PR/CI discipline.

Former target-machine/provider acceptance `B-US-000` remains separate non-blocking backlog work. It is not a prerequisite for Branch 11.

## Constraints and non-goals

- Preserve proven mechanisms unless current evidence requires change; prefer composition/adaptation over rewrite.
- Canonical market identity remains `String(PaperId)` only after fail-closed source validation.
- Preserve raw provider evidence and source-shaped typed U.S. fields; do not invent stronger financial semantics than evidence supports.
- Scanner SQL remains strategy authority. The AI Researcher proposes/evaluates Scanner SQL; it does not introduce a hard-coded Strategy Engine.
- Existing active market authority remains one trading day. Multi-day research reads product-owned active/archive day evidence; it does not convert production into a cross-day writable warehouse.
- Backtest baseline resolution, no-lookahead Scanner execution, source-row/returned-position semantics and post-decision outcome evaluation remain the authoritative strategy-validation seams and should be reused, not reimplemented.
- `resultRank` / returned position is not semantic quality unless the exact Scanner SQL ordering proves that meaning.
- Actual evidence timestamps/cycles are authoritative for cadence. Approximately 10-second collection is not a permanent constant; denser future cadence may be evaluated only from evidence.
- No speculative feature store, temporal precompute, permanent multi-day warehouse, index subsystem or alternate transport before measured evidence proves the simpler mechanism insufficient.
- Research SQL is exploratory/analytical authority only. A research finding becomes a strategy candidate only after it is expressed as Scanner SQL and re-executed through authoritative historical Scanner semantics.
- Original market DuckDB files are immutable evidence: no bootstrap, migration, repair, writer ownership, saved-query/Demo-Buy writes, rename/move/delete or arbitrary client path access.
- The AI Researcher has no broker/order authority, no automatic Scanner activation/trading, no provider/browser credential/session authority and no permission to silently modify production code/config or Collector cadence.
- Correctness-critical research state lives in the Research Server/Research Ledger, not chat memory or hidden reasoning.
- Development, Validation and Sealed Holdout are server-enforced evidence roles; final proof is not left to prompt discipline.
- AI-authored SQL/tool input is untrusted analytical input even on localhost; SQL/source/phase/resource boundaries are defense-in-depth and fail closed.
- Resource limits are bounded/configurable and tuned from workload evidence rather than guessed performance targets.
- All diagnostics, fixtures, research artifacts and reports remain public-safe: no credentials, cookies, auth/session data, account identifiers or private browser state/dumps.

## Root S&T

### Strategy

Deliver one complete local U.S.-market product that preserves proven acquisition/analysis/Replay/execution boundaries and adds a trustworthy autonomous AI research capability for short-horizon U.S.-equity momentum / buy-candidate Scanner SQL discovery.

### Tactic

Preserve completed Branches 1–10 and add Branch 11 as one local autonomous research layer using a project-owned Plugin/Skill, thin MCP adapter, dedicated Research Server, separate durable Research Ledger, typed authoritative experiment APIs, bounded general read-only research SQL, server-enforced evidence phases and target-machine end-to-end acceptance.

### Parallel assumptions

- Proven Backtest source/baseline/Scanner/outcome seams are reusable without semantic drift.
- Current historical evidence is useful immediately even if present cadence is roughly ten seconds; actual timestamps/cycles are authoritative.
- Typed tools alone are too restrictive for autonomous discovery, while unrestricted AI-owned DuckDB access is too permissive; a hybrid server-owned model is therefore required.
- A separate research-owned DuckDB is sufficient for durable research state unless workload/restart evidence proves otherwise.
- Desktop ChatGPT can consume a project-owned Skill plus approved MCP integration at implementation/acceptance time; exact current packaging/transport is reverified at that time.
- Server-enforced evidence separation materially reduces hindsight/overfitting risk compared with prompt-only discipline.

### Necessity

Completed Branches 1–10 preserve the product capabilities already delivered. Branch 11 is independently necessary because the requested outcome is not another human Backtest screen: it requires durable autonomous research state, machine-first experiment/analytics access, anti-overfitting evidence governance, ChatGPT integration, security/resource control and end-to-end autonomous acceptance.

### Sufficiency

Leaves `11.1`–`11.8` jointly supply every independently necessary new outcome: durable run identity/resume, authoritative experiments, open-ended research analytics, jobs/results/resources, Validation/Holdout authority, Plugin/MCP operation, adversarial hardening and representative/real acceptance. No broker automation, fixed optimizer, permanent warehouse or self-modifying research agent is required.

### Root success evidence

- Completed Branches 1–10 remain valid and regression-safe under their durable contracts.
- Every Branch-11 leaf satisfies its success evidence below.
- On the user's target machine, a fresh desktop ChatGPT conversation can connect through the shipped integration, discover or resume a durable Research Run, inspect real evidence/coverage/cadence, autonomously perform bounded authoritative experiments and general research analytics, preserve Development/Validation/Sealed-Holdout validity, survive chat/server restart, and return copy/paste Scanner SQL or explicit `NO_RECOMMENDATION` with objective, denominators, robustness, holdout state, limitations and reproduction references.
- Original market evidence fingerprints/bytes remain unchanged, and no broker/provider/auth/private-browser authority is exposed.
- Required Fast/Browser/Planning/focused security/workload gates remain green without turning ordinary hosted CI into target-machine heavy performance testing.

---

## Completed capability branches 1–10

Detailed historical S&T is intentionally not duplicated in the live current plan after Branch-11 promotion. Git history at `b37a6c4a9e8491d359bb3c7879255a42a8491fcf` preserves the exact prior PLAN; `.planning/EXECUTION.md` preserves completed task/result truth and the durable contracts below preserve current product behavior.

- **Branch 1 — Exact U.S. acquisition:** exact `ScreenerHulPaging3` validation and canonical universe/cycle shaping.
- **Branch 2 — Durable U.S. market authority:** schema/cycle/producer DuckDB authority.
- **Branch 3 — Trusted reads and Viewer:** Current plus Detail/History.
- **Branch 4 — Scanner / Demo Buy / deterministic AI Investigation:** editable Scanner authority, post-selection validation and sharing-safe forensic export.
- **Branch 5 — Deterministic offline full-product proof:** U.S. Fake Market and Chromium composition.
- **Branch 6 — Packaging / diagnostics / scalable verification:** launch, diagnostics/live proof and workload tooling.
- **Branch 7 — Reclosure / audits / deferred target-machine acceptance:** deterministic closure and historical audit evidence; `B-US-000` stays deferred.
- **Branch 8 — Standalone IBKR execution + Basic Detail BUY:** isolated authenticated order sidecar and narrow explicit BUY integration.
- **Branch 9 — Market Recording + Replay + hardening:** recording, portable source, 1x player, isolated Host and adversarial re-audit.
- **Branch 10 — Historical Backtest Lab:** immutable historical evidence, anti-lookahead Scanner sandbox, shared outcomes, Inspect/Compare/Sweep and offline reclosure.

Primary durable contracts for those branches include `docs/PRODUCT_REQUIREMENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/DATA_CONTRACT.md`, `docs/TECHNICAL_SPEC.md`, `docs/TEST_STRATEGY.md`, `docs/SCANNER_SQL_GUIDE.md`, `docs/DEMO_BUY_VALIDATION.md`, `docs/AI_INVESTIGATION_PACK.md`, `docs/IBKR_ORDER_SERVICE.md`, `docs/BASIC_BUY_INTEGRATION.md`, `docs/MARKET_REPLAY.md`, `docs/REPLAY_HARDENING.md` and `docs/BACKTEST_LAB.md`.

---

## Branch 11 — Autonomous AI Researcher

### Strategy

Enable desktop ChatGPT to autonomously research **short-horizon U.S.-equity upward momentum / buy-candidate selection** over Market Flow US historical evidence and return the strongest defensible copy/paste Scanner SQL for the exact objective supplied at research time, together with reproducible evidence and honest limitations.

### Tactic

Add one local autonomous research capability:

```text
ChatGPT Desktop
→ project-owned Plugin / research Skill
→ thin local MCP adapter
→ dedicated Research Server
→ durable Research Ledger
→ typed authoritative experiment capabilities
   + bounded general read-only research SQL
→ immutable active/archive Market Flow US evidence
→ server-enforced Development / Validation / Sealed Holdout
→ final Scanner SQL + reproducible recommendation artifact
```

The AI owns hypotheses, investigation order, experiment branching and stopping. The server owns authority, evidence access, immutable artifacts, resource limits, anti-lookahead, holdout sealing and durable state.

### Tactic-validity assumptions

- The proven Backtest source opener, baseline resolver, historical Scanner sandbox, Scanner admission and outcome evaluator can be reused/adapted rather than reimplemented.
- Historical evidence is useful immediately even when cadence is currently around ten seconds; actual timestamps/cycles rather than a hard-coded cadence are authoritative.
- Hybrid access is required: typed tools alone constrain autonomous discovery; unrestricted direct DuckDB ownership weakens governance, sealed-evidence control and reproducibility.
- Desktop ChatGPT can consume the project Plugin/Skill plus approved MCP integration at implementation/acceptance time; exact transport/package mechanics are reverified against current OpenAI support then.
- A separate research-owned DuckDB is sufficient for ledger/state unless measured evidence invalidates that assumption.
- Server-enforced Development/Validation/Holdout separation materially reduces overfitting/hindsight risk compared with prompt discipline alone.

### Material alternatives considered

1. **Typed MCP tools only** — rejected as permanent architecture because they constrain unanticipated signal discovery.
2. **Direct AI-owned read-only DuckDB** — rejected because connection ownership can bypass source/phase/resource/provenance rules and makes holdout enforcement fragile.
3. **Permanent multi-day analytical warehouse** — rejected initially because it duplicates evidence and creates synchronization/authority cost before workload proves necessity.
4. **Mirror human Backtest Inspect/Compare/Sweep APIs** — rejected as the machine-interface blueprint; reuse semantics/engines, not human interaction constraints.
5. **Hard-coded optimizer / momentum score** — rejected because each Research Run may define a different short-horizon momentum objective/tradeoff.
6. **Prompt-only research discipline** — rejected because evidence access, holdout sealing, budgets and immutable experiment facts are correctness boundaries.

### Invalidation conditions

Reopen the smallest affected Branch-11 tactic if proof shows that the detached DuckDB sandbox cannot safely support the research surface, representative multi-day work remains impractical after removing repeated work, DuckDB is unsuitable for ledger restart/concurrency needs, current ChatGPT/MCP support cannot satisfy the local integration boundary, Backtest authority seams cannot be reused without drift, or actual evidence resolution proves a material need for denser Collector cadence.

Do not preemptively add a warehouse, feature store, temporal precompute/index subsystem or alternate transport merely because it might help.

### Necessity

Without durable run/objective/evidence identity the AI cannot resume safely. Without authoritative experiments it cannot produce defensible Scanner SQL. Without expressive research analytics it cannot discover signals not predicted by the implementation. Without jobs/results/resources long autonomous work is unreliable. Without Validation/Holdout authority results can overfit. Without Plugin/MCP bootstrap the intended user path does not exist. Without adversarial hardening and workload/desktop acceptance the system is not trustworthy or proven usable.

### Sufficiency

Leaves `11.1`–`11.8` together provide those outcomes while preserving Scanner, Backtest, market, Replay and order authority boundaries.

### Branch success evidence

A fresh target-machine desktop ChatGPT conversation can operate the complete researcher through the shipped integration, use current and future denser evidence without redesign, resume durable work without chat history, produce a reproducible Scanner SQL recommendation or `NO_RECOMMENDATION`, and prove source immutability plus phase/security/resource boundaries.

### 11.1 — Research Server domain foundation and durable ledger

**Strategy:** Create a durable machine-research authority that can start/resume research independently of chat history.

**Tactic:** Introduce the dedicated Research Server domain layer plus separate hardened research-owned DuckDB ledger implementing stable IDs, Research Run lifecycle, immutable user intent / Objective Versions, evidence inventory/plan/partition records, query artifacts, concise research notes, environment/version snapshots and compact Resume Capsule retrieval.

**Boundary:** No expensive experiment engine or arbitrary research SQL beyond minimum seams required to prove persistence and authorization structure.

**Success evidence:** Fresh ledger bootstrap/reopen is deterministic and separate from market DB lifecycle; `create/get/resume/list` Research Run behavior survives restart without chat history; stable IDs are run-scoped and cross-run IDs fail closed; Objective Versions and Query Artifacts are immutable/hash-bound; evidence uses logical IDs/fingerprints rather than client paths; transaction-fault proof prevents partial writes from fabricating completed state; Resume Capsule reconstructs objective/current phase/important artifacts/jobs/decisions from durable facts; no chain-of-thought, credentials, browser session data or account identifiers are persisted.

### 11.2 — Authoritative experiment engine and research diagnostics

**Strategy:** Let the AI evaluate arbitrary Scanner SQL candidates over historical decision points with exactly the proven anti-lookahead/outcome authority and enough deterministic diagnosis to understand results.

**Tactic:** Compose existing Backtest source/baseline/Scanner/outcome seams behind machine-first experiment operations: immutable candidate SQL artifacts, frozen T0 schedules, Top-X/horizons, batch execution, metric sets with denominators, experiment summaries/points/candidates, returned/non-return diagnosis and exact evidence references.

**Boundary:** Do not fork baseline resolution, Scanner admission, percentage arithmetic or future-row selection. Returned position is not semantic rank unless SQL proves it.

**Success evidence:** Representative Scanner SQL matches Backtest B/T0/returned order/outcomes; multi-query/batch experiments freeze schedule/config/fingerprints and reproduce; metrics expose denominators/exclusions/zero-result/unavailable and relevant per-day/time breakdowns; duplicate identities preserve source-row-first Top-X; typed returned/non-return diagnostics never rewrite the Query as authority; drill-down is bounded/stable-ID based; source DB fingerprint/bytes remain unchanged.

### 11.3 — Phase-aware research SQL data surface

**Strategy:** Give the AI enough expressive numeric/raw evidence to discover signals not predicted during implementation without granting source-catalog or strategy-authority ownership.

**Tactic:** Build a server-owned isolated research projection and `research_sql` surface over explicit research relations such as sources, partitions, cycles, history, universe, controlled decision/outcome relations and explicitly referenced experiment-result relations.

**Boundary:** Research names deliberately differ from Scanner `latest/history`; original sources are detached/unreachable during AI SQL; future-dependent data is never silently inserted into decision-time predictor rows.

**Success evidence:** Typed market fields, canonical identity/timing and bounded provider `raw_data` are researchable across one/multiple authorized day sources using `source_id`; operational session/config/error/path/auth fields are absent; schema metadata labels raw/typed/derived, null/missing caveats, decision-time eligibility and future dependence; raw-field key/type/coverage discovery is bounded; Development SQL supports joins/windows/aggregates/correlations/cross-security analysis under SELECT-only admission; Validation/Holdout cannot be bypassed via SQL or result handles; strategy candidates must re-enter 11.2 as Scanner SQL; adversarial SQL escape/admission tests cover external/file/network/catalog/config/extension/side-effect/query-table attempts.

### 11.4 — Durable jobs, result handles and resource governance

**Strategy:** Long autonomous research remains bounded, cancellable, restart-safe and efficient without one giant MCP call or model-context warehouse.

**Tactic:** Implement persistent `QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED` jobs, retry-safe `clientRequestId`, result handles/pagination, hierarchical budgets, cancellation propagation, deterministic restart recovery and measured optional partition-cache reuse only when workload proves useful.

**Success evidence:** Expensive work returns durable `jobId` plus compact progress; `SUCCEEDED` is written only after durable results/metrics/provenance; crash/restart distinguishes completed atomic units from interrupted work; cancel is idempotent and prevents new scheduling while attempting active DuckDB interruption; partial output cannot masquerade as complete; payload/page bounds are independent; request/job/run/global budgets bound CPU/memory/disk/result/concurrency growth; identical retry reuses created work while changed intent under the same idempotency key rejects; practical defaults come from workload evidence and hard timeouts remain failure ceilings.

### 11.5 — Validation, sealed holdout and final recommendation authority

**Strategy:** Research may adapt aggressively during discovery while final evidence remains independently meaningful rather than silently optimized on the same outcomes.

**Tactic:** Implement server-enforced Development / Validation / Sealed Holdout partitions, temporal split/purge rules, frozen T0 schedules, validation-exposure accounting, immutable Finalist Sets, controlled holdout evaluation, contamination tracking and deterministic final recommendation artifacts.

**Success evidence:** Development supports broad drill-down; Validation exposure is explicit/countable; Holdout rows/outcomes are physically absent from general research before authorized evaluation; deterministic partitions prefer whole-day units and otherwise chronological blocks with horizon-aware purge/embargo; validation/holdout schedules do not depend on Query output; Finalist Set freezes exact `queryArtifactId`, Objective Version and evaluation profile; post-holdout SQL changes create new lineage and invalidate that holdout as independent proof; final artifact supports selected Query or `NO_RECOMMENDATION` with exact SQL/objective/partitions/search breadth/denominators/validation/holdout/robustness/failures/cadence limitations/reproduction references; sealed details cannot leak through metadata/errors/debug/cache/cross-run handles.

### 11.6 — ChatGPT Plugin / Skill + MCP operating integration

**Strategy:** A fresh desktop ChatGPT conversation can bootstrap, operate and resume the researcher without a giant prompt or hidden chat-only state.

**Tactic:** Ship a project-owned Plugin containing a compact research Skill plus thin local MCP adapter over the Research Domain API. The Skill teaches mission, authority boundaries, progressive disclosure, durable-state discipline, autonomy invariants, holdout rules, capability-gap reporting and final-output requirements; heavy schema/evidence/results remain on-demand server data.

**Success evidence:** Current OpenAI Plugin/MCP support is reverified at implementation time and selected packaging/transport documented without changing domain semantics; bootstrap starts from compact environment/run summaries and loads detail on demand; zero/one/multiple resumable-run behavior is deterministic and never guesses among multiple runs; model tools map thinly to server domain operations with no duplicate ledger/experiment/holdout logic; a new conversation resumes from `researchRunId`; raw market strings remain data rather than dynamic instructions; Skill does not prescribe a fixed hypothesis sequence, formula or optimizer.

### 11.7 — Adversarial security and failure hardening

**Strategy:** No known material SQL/MCP/evidence/phase/restart failure can mutate source authority, reveal sealed evidence, escape local boundaries or corrupt research truth before autonomous use.

**Tactic:** Execute a dedicated adversarial audit across Research Server APIs, logical-ID authorization, SQL admission/sandbox, source attachment lifecycle, DuckDB hardening, ledger transactions, jobs/cancellation/restart, phase/result-handle isolation, caches, local transport and public-safe diagnostics; every blocker stays owned through RCA → fix → regression → affected verification.

**Success evidence:** Source bytes/fingerprints remain identical across hostile sequences; `ATTACH/COPY`, external readers, file/network paths, extensions, secrets/config mutation, side-effecting functions, `query/query_table`, obfuscation/multi-statement and equivalent catalog escapes fail closed; cross-run IDs/handles/cursors and phase-confused requests cannot expose unauthorized evidence; Holdout is absent from lower-phase sandboxes and result/cache/error side channels; local transport rejects unapproved exposure/origin/body/path use; crash/fault injection cannot create false `SUCCEEDED`, false validation exposure or half-created finalist/holdout authority; diagnostics/artifacts remain bounded/public-safe; every material finding receives regression proof and analogous-area review.

### 11.8 — Representative workload, desktop acceptance and deterministic reclosure

**Strategy:** The complete autonomous researcher is practical on the intended machine, coherent in durable contracts and proven end-to-end rather than only as isolated APIs.

**Tactic:** Extend the existing workload framework from bounded CI through synthetic 4,096-security profiles to real target-machine evidence; measure bootstrap, single/multi-day projection, experiment batches, research SQL, result paging, cancellation/restart and holdout; remove measured repeated work; then run real Desktop ChatGPT → Plugin/Skill + MCP → Research Server → historical evidence → recommendation acceptance and reclose by repository PR/CI policy.

**Success evidence:** Bounded CI proves correctness/security without turning ordinary feedback into heavy target-machine testing; 4,096-security synthetic profiles cover representative width/cadence/days and source immutability; target-machine work measures wall-clock/RAM/disk/concurrency/result-size on actual evidence and tunes configurable limits from evidence; a fresh desktop ChatGPT mission creates/resumes a run, performs autonomous multi-step research, survives chat/server restart and produces reproducible final SQL/report through the actual shipped integration; final artifacts/contracts/user guidance match implementation; focused security/workload/Plugin-MCP acceptance plus affected Fast/Browser/Planning/Workload gates are green; PR merges by repository policy, main CI is green and open-PR state is reconciled.

---

## Material planning decisions carried forward

Durable decisions `D-US-001`–`D-US-048` continue to constrain completed product behavior. Branch 11 additionally depends on `D-US-049`–`D-US-055` in `.planning/DECISIONS.md` covering the hybrid Research Server architecture, durable ledger/chat independence, strategy-vs-research authority separation, server-enforced evidence phases, bounded jobs/resources, Plugin/MCP operating boundary and cadence/capability-gap policy.

## Final Planning Review — Branch 11

Outside-in review found the outcome boundary correctly limited to autonomous short-horizon momentum / buy-candidate Scanner research rather than general quantitative finance or automatic trading. Each Branch-11 leaf passes the removal test: remove 11.1 and durable identity/resume disappears; remove 11.2 and Scanner recommendations lose authoritative evidence; remove 11.3 and autonomous discovery is limited to implementation-predicted questions; remove 11.4 and long work is not durably bounded/cancellable; remove 11.5 and final evidence can silently overfit; remove 11.6 and the intended fresh desktop ChatGPT path does not exist; remove 11.7 and the new attack/failure surface is not trustworthy; remove 11.8 and the integrated target-machine outcome is unproven.

The sibling set is sufficient without a permanent warehouse, hard-coded optimizer, broker automation, model chain-of-thought storage or self-modifying product. Remaining choices such as exact local transport and numeric budgets are deliberately implementation/measurement details because the governing invariants are fixed and those values can be selected without reopening product semantics.

The implementation leaves are decision-complete at planning level. Any executor discovering evidence that invalidates one of the stated assumptions must use the Planning Impact Test and repair only the smallest affected area before coding forward.

## Contract precedence and Branch-11 context

For planning/S&T questions this file is authoritative. Branch-11 implementation must also obey, in order of relevance:

```text
.planning/PLAN.md
→ .planning/AI_RESEARCHER_* domain discovery/contracts as routed context
→ docs/BACKTEST_LAB.md / docs/SCANNER_SQL_GUIDE.md / docs/DATA_CONTRACT.md
→ .planning/DECISIONS.md supporting rationale
→ generic PRODUCT / TECHNICAL / TEST contracts
→ implementation/tests
```

The AI-research discovery files remain detailed implementation context; after this promotion they are not separate planning authorities.

Execution truth remains separate:

```text
.planning/EXECUTION.md = task / owner / status / real dependency / result-evidence truth
STATUS.yaml            = non-authoritative projection only
```

## Current implementation-leaf coverage

Active Branch-11 implementation leaves are:

```text
11.1  11.2  11.3  11.4  11.5  11.6  11.7  11.8
```

Their execution owners/dependencies live only in `.planning/EXECUTION.md`. Allocation follows feature/context boundaries rather than a goal of maximizing or minimizing chat count. Every fresh executor must be able to recover completely from repository truth without prior-chat memory.

## Program completion condition

Branch 11 is complete only when all eight leaves are `done` with their success evidence verified, the integrated target-machine Desktop ChatGPT path satisfies Branch-11/root success evidence, durable contracts are reconciled, no blocking defect remains, the final implementation/reclosure PR is merged, main CI is green and open-PR state is clean. `B-US-000` remains a separate non-blocking backlog item unless explicitly activated later.