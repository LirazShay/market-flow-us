# Market Flow US — Plan

`.planning/PLAN.md` is the authoritative ST Planner 2.0 planning / S&T document for Market Flow US.

Execution ownership, live status, real execution dependencies and result/evidence truth live only in `.planning/EXECUTION.md`. Root `STATUS.yaml` may project navigation state for compatibility, but it is not an authority. This document intentionally contains no freeze, authorization, allocation, handoff, review-cycle or planner-runtime state.

## Desired outcome

Market Flow US is a locally runnable U.S.-market product with six deliberately separated capability lanes:

1. **Market analysis and strategy validation** — authenticated U.S. provider snapshots → exact validation → normal ProducerBridge → localhost Node.js service → active-day DuckDB → Current / Detail-History / editable Scanner SQL → Demo Buy → deterministic local AI Investigation evidence.
2. **Order execution** — a standalone local Interactive Brokers order-service sidecar with authenticated localhost caller protection, DRY_RUN by default, fail-closed LIVE gates, restart-safe idempotency and explicit BUY/SELL lifecycle; the product has one deliberately narrow current-Detail BUY consumer through a trusted local confirmation boundary.
3. **Market Recording + Replay** — validated browser snapshots → IndexedDB and/or portable recording → 1x Player → unchanged normal ProducerBridge/service path → isolated replay-only DuckDB → the same analytical surfaces.
4. **Historical Backtest Lab** — existing active/archive Market Flow US DuckDB evidence → isolated read-only historical query context → unchanged Scanner SQL → post-decision outcome evaluation → Inspect / Compare / Sweep investigation, without requiring a provider page, Collector, Replay, order service or open market.
5. **Autonomous AI Researcher** — desktop ChatGPT → project-owned Plugin/Skill + thin local MCP adapter → dedicated local Research Server → durable Research Ledger → authoritative historical Scanner experiments + bounded read-only research SQL → Development / Validation / Sealed Holdout → copy/paste Scanner SQL or explicit `NO_RECOMMENDATION` with reproducible evidence.
6. **Autonomous AI Trading & Strategy Distillation** — Scanner shortlist → targeted quote watch → deterministic Trading Supervisor with bounded AI Decision Proposals → independent Hard Risk Authority → existing IBKR Order Service → human-confirmed LIVE boundary, with durable Trade Episodes used to learn and distill deterministic policies.

These lanes remain intentionally separated. Scanner, Demo Buy, AI Investigation, Backtest and the Autonomous AI Researcher never automatically place orders. Replay never turns the normal market service into a replay-aware service. Backtest and AI research never mutate market authority or become broker/fill/portfolio simulators. Branch 12 may fully automate shadow/synthetic/DRY_RUN behavior, but real-money LIVE submission remains explicit operator confirmation through the protected order boundary.

## Current reality and completion boundary

Branches 1–10 are completed and deterministically reclosed. Their exact historical S&T before Branch-11 promotion remains available in Git history at `market-flow-us` commit `b37a6c4a9e8491d359bb3c7879255a42a8491fcf`; their durable product semantics remain in the domain contracts and `.planning/DECISIONS.md`, and their execution result/evidence truth remains in `.planning/EXECUTION.md`.

Branch 11 — Autonomous AI Researcher — completed all implementation leaves `11.1`–`11.8` and repository reclosure. Its real target-machine workload/Desktop acceptance remains separately active as `B-US-009`, currently blocked only on evidence that must be produced on the user's target machine. That external acceptance blocker does not create a technical dependency for unrelated work.

Backlog `B-US-010` completed discovery and Final Planning Review and is promoted here as **Branch 12 — Autonomous AI Trading & Strategy Distillation**. Branch 12 is implementation-ready at the planning level; implementation begins only through explicitly activated pending rows in `.planning/EXECUTION.md` and normal repository branch/PR/CI discipline.

Former target-machine/provider acceptance `B-US-000` remains separate non-blocking backlog work. It is not a prerequisite for Branch 12.

## Constraints and non-goals

- Preserve proven mechanisms unless current evidence requires change; prefer composition/adaptation over rewrite.
- Canonical market identity remains `String(PaperId)` only after fail-closed source validation.
- Preserve raw provider evidence and source-shaped typed U.S. fields; do not invent stronger financial semantics than evidence supports.
- Scanner SQL remains strategy authority. The AI Researcher proposes/evaluates Scanner SQL; it does not introduce a hard-coded Strategy Engine.
- Existing active market authority remains one trading day. Multi-day research reads product-owned active/archive day evidence; it does not convert production into a cross-day writable warehouse.
- Backtest baseline resolution, no-lookahead Scanner execution, source-row/returned-position semantics and post-decision outcome evaluation remain the authoritative strategy-validation seams and should be reused, not reimplemented.
- `resultRank` / returned position is not semantic quality unless the exact Scanner SQL ordering proves that meaning.
- Actual evidence timestamps/cycles are authoritative for cadence. Approximately 10-second collection is not a permanent constant; denser future cadence may be evaluated only from evidence.
- No speculative feature store, temporal precompute, permanent multi-day warehouse, index subsystem, streaming subsystem or alternate transport before measured evidence proves the simpler mechanism insufficient.
- Research SQL is exploratory/analytical authority only. A research finding becomes a strategy candidate only after it is expressed as Scanner SQL and re-executed through authoritative historical Scanner semantics.
- Original market DuckDB files are immutable evidence: no bootstrap, migration, repair, writer ownership, saved-query/Demo-Buy writes, rename/move/delete or arbitrary client path access.
- The AI Researcher has no broker/order authority, no automatic Scanner activation/trading, no provider/browser credential/session authority and no permission to silently modify production code/config or Collector cadence.
- Branch 12 uses a separate Trading capability/MCP. It does not add broker authority to the Research MCP.
- The AI/Trading MCP/Trading Supervisor never call IBKR/CPGW directly; broker mutation remains behind the existing IBKR Order Service.
- The Trading Supervisor is the continuous deterministic runtime. AI participation is bounded state-aware Decision Proposals; an AI session may disappear without disabling deterministic safety/fallback behavior.
- Hard Risk Authority is independent and non-bypassable by AI, PolicyVersion, MCP or Supervisor decisions.
- Branch 12 may fully automate shadow/synthetic/DRY_RUN behavior. Real-money LIVE submission remains explicit operator confirmation and existing order-service/provider gates remain fail closed.
- Correctness-critical research/trading state lives in durable server-owned ledgers, not chat memory or hidden reasoning.
- AI-authored SQL/tool input is untrusted analytical input even on localhost; SQL/source/phase/resource boundaries are defense-in-depth and fail closed.
- All diagnostics, fixtures, research/trading artifacts and reports remain public-safe: no credentials, cookies, auth/session data, account identifiers or private browser state/dumps.
- A task blocked only on user/target-machine/provider acceptance does not freeze unrelated work unless `.planning/EXECUTION.md` records a real dependency.

## Root S&T

### Strategy

Deliver one complete local U.S.-market product that preserves proven acquisition/analysis/Replay/execution boundaries, supports trustworthy autonomous historical research, and adds a bounded AI-assisted trading/learning capability whose routine behavior can be distilled into deterministic policy without making an AI chat session a real-time safety dependency.

### Tactic

Preserve completed Branches 1–11, keep deferred external acceptance tasks independent, and add Branch 12 as a separate Trading domain: durable Trading Run/Policy/Trade Episode authority, immutable Scanner candidate handoff, bounded targeted quote watch, deterministic continuous Trading Supervisor, state-aware AI Decision Proposals, independent Hard Risk Authority, protected reuse of the existing IBKR Order Service, separate Trading Skill/MCP, evidence-based attribution/distillation and staged shadow/synthetic/DRY_RUN/human-confirmed-LIVE acceptance.

### Parallel assumptions

- Proven Scanner generation/provenance, Backtest/Research evidence and IBKR order-service seams are reusable without semantic drift.
- A bounded Scanner shortlist is small enough for targeted quote monitoring without a broad broker-market-data subsystem.
- Existing targeted IBKR snapshots are a sufficient starting tactic; streaming is not required unless measured workload/cadence evidence proves otherwise.
- Typed deterministic policy primitives are sufficient to learn initial behavior; a universal trading DSL or arbitrary executable AI policy is unnecessary.
- Trade Episode evidence can separate Scanner-selection quality from entry/fill/position/exit quality sufficiently to guide later policy improvement.
- AI can be useful for bounded exploratory decisions and policy learning without becoming the continuous safety-critical loop.

### Necessity

Completed Branches 1–11 preserve the capabilities already delivered. Branch 12 is independently necessary because the desired outcome is not another Scanner/Backtest/Research surface: it requires durable trading state, live candidate observation, continuous deterministic supervision, non-bypassable hard risk, protected order-service reuse, a separate AI trading interface, episode-level attribution and a path from AI exploration to deterministic policy.

### Sufficiency

Leaves `12.1`–`12.9` jointly supply every independently necessary Branch-12 outcome: durable run/policy/episode truth, exact candidate handoff, live quote observation, continuous supervision/AI proposals, independent hard risk, protected order bridging, separate Trading Skill/MCP, attribution/distillation and staged adversarial acceptance. No second broker adapter, Research Server, Strategy Engine, permanent warehouse, universal DSL, speculative streaming subsystem or unattended autonomous LIVE submission is required.

### Root success evidence

- Completed Branches 1–11 remain valid and regression-safe under their durable contracts.
- `B-US-009` remains truthfully blocked/pending until actual target-machine evidence exists; its blocked status does not prevent independent Branch-12 work.
- Every Branch-12 leaf satisfies the success evidence below and the durable `docs/AUTONOMOUS_AI_TRADING.md` contract.
- A restartable shadow/synthetic/DRY_RUN trading journey can reproduce Scanner candidate provenance, targeted quote evidence, decisions, risk evaluations, order intents/lifecycles and final episode outcomes without chat-memory dependence or duplicate orders.
- AI/Trading MCP cannot bypass freshness, Hard Risk Authority, order-service idempotency/reconciliation or the human-confirmed LIVE boundary.
- Required focused security/workload/Planning/Fast/Browser evidence remains green, with target-machine/user acceptance left pending only where it is genuinely external rather than fabricated as PASS.

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

Without durable run/objective/evidence identity the AI cannot resume safely. Without authoritative experiments it cannot produce defensible Scanner SQL. Without expressive research analytics it cannot discover signals not predicted during implementation. Without jobs/results/resources long autonomous work is unreliable. Without Validation/Holdout authority results can overfit. Without Plugin/MCP bootstrap the intended user path does not exist. Without adversarial hardening, representative workload proof and a deterministic target-machine/Desktop acceptance package, the implementation would not be ready for responsible real-machine acceptance.

### Sufficiency

Leaves `11.1`–`11.8` together provide those implementation outcomes while preserving Scanner, Backtest, market, Replay and order authority boundaries. Actual target-machine/Desktop execution is an explicit non-blocking post-merge acceptance task in `B-US-009`.

### Branch success evidence

Branch 11 implementation is complete when the researcher architecture, durable authorities, security/resource boundaries, representative workload proof, local Plugin/MCP packaging, target-machine workload runner, Desktop preflight/runbook and deterministic repository reclosure are all green. Real target-machine `W2T` and Desktop `W3` remain required acceptance evidence when `B-US-009` is executed later, but are not claimed as Branch-11 implementation PASS.

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

**Success evidence:** Expensive work returns durable `jobId` plus compact progress; `SUCCEEDED` is written only after durable results/metrics/provenance commit; crash/restart distinguishes completed atomic units from interrupted work; cancel is idempotent and prevents new scheduling while attempting active DuckDB interruption; partial output cannot masquerade as complete; payload/page bounds are independent; request/job/run/global budgets bound CPU/memory/disk/result/concurrency growth; identical retry reuses created work while changed intent under the same idempotency key rejects; practical defaults come from workload evidence and hard timeouts remain failure ceilings.

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

### 11.8 — Representative workload, acceptance readiness and deterministic reclosure

**Strategy:** The complete autonomous researcher is coherent, representative-load verified, packaged for the intended Desktop path and ready for real-machine acceptance without requiring that acceptance to block the implementation merge.

**Tactic:** Extend the existing workload framework through bounded CI and synthetic 4,096-security profiles; ship a target-machine actual-evidence workload runner, repo-local Plugin/MCP packaging, deterministic Desktop preflight and exact acceptance runbook; remove measured repeated work; then reclose implementation by repository PR/CI policy. Execute the real target-machine workload and Desktop mission/restart later under non-blocking backlog `B-US-009` against fresh `main`.

**Success evidence:** Bounded CI proves correctness/security without turning ordinary feedback into heavy target-machine testing; 4,096-security synthetic profiles cover representative width/cadence/days and source immutability; `npm run research-target:workload` is deterministic, read-only, public-safe, measures wall-clock/RAM/disk/concurrency/result-size and refuses synthetic fallback; `npm run research-desktop:preflight` verifies repo marketplace/package/MCP coherence and local tool discovery without fabricating Desktop PASS; exact W2T/W3 criteria remain documented and explicitly `PENDING` in `B-US-009`; final artifacts/contracts/user guidance match implementation; focused security/workload/Plugin-MCP verification plus affected Fast/Browser/Planning/Workload gates are green; PR merges by repository policy, main CI is green and open-PR state is reconciled.

---

## Branch 12 — Autonomous AI Trading & Strategy Distillation

### Strategy

Enable Market Flow US to run bounded, restart-safe AI-assisted trading episodes from Scanner candidates, learn from execution evidence and progressively distill proven behavior into deterministic policy while preserving independent risk and broker authorities.

### Tactic

Compose existing Scanner, IBKR Order Service, Backtest/Research and MCP patterns behind one new Trading domain:

```text
Scanner generation
→ Candidate Handoff
→ Targeted Quote Watch
→ Trading Supervisor
   ↕ bounded AI Decision Proposals
→ Hard Risk Authority
→ protected Order Bridge
→ existing IBKR Order Service
→ human-confirmed LIVE boundary
→ IBKR

Trade Episode Ledger
→ attribution / learning
→ Policy Candidate
→ validation
→ deterministic PolicyVersion
```

### Tactic-validity assumptions

- Scanner can reduce the market universe to a bounded shortlist before broker quote monitoring.
- Existing IBKR contract-resolution/snapshot and order-service semantics can be reused rather than reimplemented.
- Snapshot polling is an adequate first quote-watch tactic until measurement proves otherwise.
- A durable episode ledger plus explicit reason/evidence records can support useful attribution without storing private model reasoning.
- Typed PolicyVersion configuration and server-owned decision primitives are sufficient to distill early successful behavior.
- Human-confirmed LIVE submission can remain the final mutation boundary while shadow/synthetic/DRY_RUN paths are automated end to end.

### Material alternatives considered

1. **Add broker authority to Research MCP** — rejected because research and trading have materially different authority/risk boundaries.
2. **AI/MCP calls IBKR/CPGW directly** — rejected because it would bypass the existing order-service validation, idempotency, reconciliation and security boundary.
3. **LLM as the real-time loop** — rejected because chat latency/restart must not determine position safety.
4. **Build a universal Strategy Engine/DSL first** — rejected because the winning policy is not yet known and typed primitives are simpler.
5. **Broad IBKR quote monitoring for the full universe** — rejected because Scanner already performs the broad reduction.
6. **Streaming from day one** — rejected until measured polling evidence proves it necessary.
7. **Second trading research/backtest engine** — rejected; reuse Branch-10/11 authorities for strategy-level validation.
8. **Unattended autonomous LIVE execution** — rejected; LIVE mutation remains an explicit operator-confirmed boundary.

### Invalidation conditions

Reopen the smallest affected tactic if measured quote cadence cannot support required decisions, the existing order-service contract cannot express required safe lifecycle/reconciliation behavior, episode evidence cannot distinguish candidate-vs-execution failure, typed policy primitives prove materially insufficient, or workload/restart evidence proves the proposed durable store/runtime shape inadequate.

### Necessity

Removing `12.1` loses durable run/policy/episode truth. Removing `12.2` loses reproducible Scanner-to-trading provenance. Removing `12.3` loses live candidate evidence. Removing `12.4` loses continuous deterministic management and bounded AI participation. Removing `12.5` leaves no independent non-bypassable portfolio/session risk envelope. Removing `12.6` leaves no protected broker bridge. Removing `12.7` removes the intended AI trading interface. Removing `12.8` removes attribution/learning/distillation. Removing `12.9` removes integrated adversarial/workload/acceptance proof.

### Sufficiency

Together `12.1`–`12.9` provide durable truth, candidate provenance, live observation, deterministic continuous behavior, independent risk, protected execution, AI interface, learning/distillation and staged end-to-end proof. Existing Scanner/Backtest/Research/order mechanisms supply the authorities that do not need to be rebuilt.

### Branch success evidence

Branch 12 implementation is complete when all nine leaves satisfy their success evidence, the durable trading contract is reconciled, shadow/synthetic/DRY_RUN flows are restart/idempotency/risk verified, the human-confirmed LIVE boundary cannot be bypassed, representative workload/adversarial proof is green, the final PR is merged, required main CI is green and open-PR state is clean. Any external user/target-machine/provider evidence that is not a real prerequisite may remain separately pending rather than blocking independent implementation.

### 12.1 — Trading domain + durable Run / Policy / Episode authority

**Strategy:** Create durable trading truth independent of chat/process lifetime.

**Tactic:** Add project-owned TradingRun, immutable PolicyVersion, TradeEpisode, CandidateObservation, DecisionRecord, OrderReference, PositionState and EpisodeOutcome persistence with stable IDs and transaction-safe restart semantics.

**Boundary:** No live quote polling or broker mutation in this leaf.

**Success evidence:** Fresh/reopened state deterministically restores runs/episodes without chat history; PolicyVersion is immutable after first use; cross-run/episode IDs fail closed; partial writes cannot fabricate a completed episode; reason codes/evidence are durable without chain-of-thought; persistence contains no credentials/account IDs/session data/raw authenticated dumps.

### 12.2 — Scanner candidate handoff + immutable selection provenance

**Strategy:** Transfer candidates from Scanner without changing their original analytical meaning.

**Tactic:** Freeze one successful Scanner generation into a bounded candidate handoff preserving canonical identity, exact query/generation provenance, returned position and bounded row evidence.

**Boundary:** No rewriting/reranking by the Trading layer; returned position is not semantic quality unless SQL proves it.

**Success evidence:** Same generation produces the same handoff; later Scanner generations cannot mutate an active episode; missing/ambiguous identity fails before watch admission; exact query/generation provenance is reproducible.

### 12.3 — Targeted live quote watch

**Strategy:** Observe only the bounded shortlist closely enough for state-aware trading decisions.

**Tactic:** Reuse proven IBKR resolution/snapshot seams behind a read-only bounded quote-watch API recording `last`, `bid`, `ask`, provider/update timestamp, local receive timestamp and explicit availability/staleness.

**Boundary:** Polling first; no whole-universe IBKR market-data subsystem or streaming unless measurement reopens the tactic.

**Success evidence:** Bounded shortlist monitoring is resource-limited; stale/missing/ambiguous quotes fail closed; restart preserves required watch identity without fabricating continuity; workload measurements show actual cadence/cost and determine whether polling remains sufficient.

### 12.4 — Continuous Trading Supervisor + AI Decision Proposal model

**Strategy:** Candidate/position management continues deterministically even when AI is slow, restarted or unavailable.

**Tactic:** Implement a deterministic Supervisor state machine over immutable PolicyVersion, current authoritative state and bounded AI DecisionProposal (`ENTER`, `SKIP`, `SWITCH`, `HOLD`, `EXIT`) validated against exact observed state/version.

**Boundary:** AI proposals never directly submit broker orders or change hard-risk configuration.

**Success evidence:** Same inputs/policy/broker outcomes yield the same Supervisor decision; stale proposals reject; restart does not duplicate actions; AI loss leaves deterministic fallback/risk behavior active; shutdown/recovery states are explicit and tested.

### 12.5 — Independent Hard Risk Authority

**Strategy:** No AI/policy/supervisor action can exceed the operator-owned safety envelope.

**Tactic:** Add a separate server-side risk authority evaluated before protected order intent, with typed bounded configuration for order notional, concurrent positions, aggregate exposure, attempt rate, session loss, failed-entry attempts, quote staleness, new-entry pause and global kill switch categories.

**Boundary:** Exact numeric defaults are implementation/configuration decisions backed by evidence; AI may request stricter behavior but may not widen/disable the active envelope.

**Success evidence:** Every protected order intent receives deterministic allow/reject evidence; restart retains the active risk envelope; pause/kill switch fail closed; no MCP/PolicyVersion/Supervisor path bypasses risk; public-safe diagnostics explain rejection without account/private data.

### 12.6 — Existing IBKR Order Service execution bridge

**Strategy:** Reuse one broker mutation authority rather than create a second execution path.

**Tactic:** Add a narrow Trading-domain bridge to the existing IBKR Order Service preserving requestId/idempotency, DRY_RUN default, provider preflight/what-if, acknowledgement-unknown reconciliation, SELL/no-short guard, cancel/reply lifecycle and local authentication. LIVE submission remains explicit operator confirmation.

**Boundary:** No direct Trading Supervisor/MCP → CPGW/IBKR call and no unattended LIVE submission.

**Success evidence:** BUY/SELL intents flow only through the existing service; duplicate decisions do not create duplicate provider orders; acknowledgement-unknown never blind-retries; restart reconciliation is safe; DRY_RUN can execute automatically while LIVE cannot pass without the explicit confirmation boundary.

### 12.7 — Separate Trading Skill + Trading MCP

**Strategy:** A fresh AI session can inspect/resume bounded trading work without receiving raw broker authority.

**Tactic:** Ship a separate Trading Skill/MCP over stable Trading Domain APIs, reusing proven Branch-11 packaging/runtime patterns where useful.

**Boundary:** No raw CPGW requests, arbitrary provider orders, account-ID configuration, credential/session access, risk bypass or arbitrary executable policy code.

**Success evidence:** Fresh session can discover/resume a TradingRun from durable IDs; tools expose only bounded domain operations; MCP loss does not stop Supervisor safety behavior; data/instruction boundaries and local transport/security tests fail closed.

### 12.8 — Episode attribution + policy learning + deterministic distillation

**Strategy:** Learn whether outcomes came from candidate selection or execution behavior and turn proven patterns into deterministic policy.

**Tactic:** Build bounded episode analytics separating Scanner, entry, fill, position-management and exit attribution; let AI compare PolicyVersions and produce explicit Policy Candidates; reuse Backtest/Research authorities for strategy-level historical validation before explicit promotion.

**Boundary:** No automatic production-code mutation and no second Research Server/Backtest engine.

**Success evidence:** Episodes expose denominators and evidence for each attribution layer; candidate-vs-execution failure can be distinguished; policy comparisons are reproducible; a promoted policy is immutable/deterministic and executable without AI; insufficient evidence remains a valid no-promotion result.

### 12.9 — Shadow / synthetic / DRY_RUN / human-confirmed-LIVE acceptance and adversarial reclosure

**Strategy:** Prove the integrated trading capability is coherent, restart-safe, bounded and non-bypassable before relying on it operationally.

**Tactic:** Reclose through historical/replay proof, live-market shadow observation, synthetic broker, DRY_RUN/provider what-if, explicit human-confirmed LIVE-boundary verification, adversarial security/fault tests and representative workload measurement.

**Boundary:** Earlier stage success never silently enables a later stage; unattended autonomous LIVE execution is not part of Branch 12.

**Success evidence:** Representative Scanner→watch→decision→risk→order-intent→episode flows pass end to end; restart at material states is safe; stale/provider failures fail closed; duplicate/reordered events do not duplicate orders; Trading/Research/Replay boundaries remain isolated; AI/MCP cannot bypass risk/order-service/LIVE confirmation; focused Fast/Browser/Planning/Workload/security evidence is green; final PR/main/open-PR reclosure is complete.

---

## Material planning decisions carried forward

Durable decisions `D-US-001`–`D-US-055` continue to constrain completed product behavior. Branch 12 adds the durable architecture/security decisions embodied in `docs/AUTONOMOUS_AI_TRADING.md`; the next planning-reconciliation unit will record the concise material decision entries in `.planning/DECISIONS.md` without duplicating the full contract.

## Final Planning Review — Branch 11

Outside-in review found the outcome boundary correctly limited to autonomous short-horizon momentum / buy-candidate Scanner research rather than general quantitative finance or automatic trading. Each Branch-11 leaf passes the removal test: remove 11.1 and durable identity/resume disappears; remove 11.2 and Scanner recommendations lose authoritative evidence; remove 11.3 and autonomous discovery is limited to implementation-predicted questions; remove 11.4 and long work is not durably bounded/cancellable; remove 11.5 and final evidence can silently overfit; remove 11.6 and the intended desktop ChatGPT integration surface does not exist; remove 11.7 and the new attack/failure surface is not trustworthy; remove 11.8 and representative workload proof, target-machine/Desktop acceptance tooling and deterministic implementation reclosure disappear.

The sibling set is sufficient without a permanent warehouse, hard-coded optimizer, broker automation, model chain-of-thought storage or self-modifying product. Actual target-machine/Desktop acceptance is intentionally deferred rather than deleted; `B-US-009` preserves the exact remaining proof against fresh `main`.

The implementation leaves are decision-complete at planning level. Any executor discovering evidence that invalidates one of the stated assumptions must use the Planning Impact Test and repair only the smallest affected area before coding forward.

## Final Planning Review — Branch 12

Outside-in review confirms the scope is trading orchestration/learning, not a replacement Scanner, broker adapter, research engine or universal strategy framework. Each leaf `12.1`–`12.9` passes the removal test and the sibling set is sufficient together. The selected tactic is simpler than direct AI broker access, an LLM real-time loop, whole-universe broker polling, a new Strategy Engine or speculative streaming/warehouse infrastructure. Material uncertainty is isolated behind measurement-driven invalidation conditions rather than guessed subsystems.

The leaves are decision-complete at planning level. Implementation may choose local class/file/config details but must not invent new authority boundaries. Any evidence that materially invalidates polling sufficiency, order-service reuse, typed policy expressiveness, durable state shape or episode attribution must reopen only the smallest affected Branch-12 area.

## Contract precedence and active context

For planning/S&T questions this file is authoritative. Branch-12 implementation must also obey, in order of relevance:

```text
.planning/PLAN.md
→ docs/AUTONOMOUS_AI_TRADING.md
→ docs/IBKR_ORDER_SERVICE.md / docs/IBKR_ORDER_SERVICE_SECURITY.md
→ Scanner / Backtest / Research contracts as routed context
→ .planning/DECISIONS.md supporting rationale
→ generic PRODUCT / TECHNICAL / TEST contracts
→ implementation/tests
```

Execution truth remains separate:

```text
.planning/EXECUTION.md = task / owner / status / real dependency / result-evidence truth
STATUS.yaml            = non-authoritative projection only
```

## Current implementation-leaf coverage

Completed Branch-11 implementation leaves:

```text
11.1  11.2  11.3  11.4  11.5  11.6  11.7  11.8
```

Active Branch-12 implementation leaves:

```text
12.1  12.2  12.3  12.4  12.5  12.6  12.7  12.8  12.9
```

Their execution owners/dependencies live only in `.planning/EXECUTION.md`. Allocation follows feature/context boundaries rather than a goal of maximizing or minimizing chat count. `B-US-009` remains separately blocked on target-machine evidence and is not a dependency of Branch 12 unless future evidence establishes a real prerequisite.

## Program completion condition

Branch 12 implementation is complete when all nine leaves are `done` with success evidence verified, durable contracts are reconciled, no blocking implementation defect remains, the final implementation/reclosure PR is merged, required main CI is green and open-PR state is clean. Real target-machine Research workload/Desktop acceptance remains truthfully blocked/pending in `B-US-009` until the user supplies that evidence; its external acceptance status does not freeze independent Branch-12 work.