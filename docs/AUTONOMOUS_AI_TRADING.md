# Autonomous AI Trading & Strategy Distillation

## Purpose

Define the durable product/architecture boundary for Branch 12. The capability may observe Scanner candidates, monitor bounded live quote evidence, propose entry/hold/exit actions, preserve durable trade episodes and learn better policy candidates. It must not make an AI chat session a real-time safety dependency and it must not bypass the existing IBKR order authority.

## Authority model

```text
Scanner generation
→ Candidate Handoff
→ Targeted Quote Watch
→ Trading Supervisor
   ↕ bounded AI Decision Proposals
→ Hard Risk Authority
→ protected Order Bridge
→ existing IBKR Order Service
→ human-confirmed LIVE submission boundary
→ IBKR

Trade Episode Ledger
→ attribution / learning
→ Policy Candidate
→ validation
→ immutable deterministic PolicyVersion
```

The AI may reason about candidates and propose actions. The Trading Supervisor owns deterministic continuous state. Hard Risk Authority owns non-bypassable limits. The IBKR Order Service remains the only broker-mutation authority. Any real-money LIVE submission remains operator-confirmed; Branch 12 may fully automate shadow/synthetic/DRY_RUN behavior but does not add unattended autonomous LIVE order placement.

## Core invariants

1. **Separate capability:** Trading Skill/MCP is separate from the Autonomous AI Researcher. Research MCP has no broker/order authority.
2. **No direct broker path:** Trading MCP, AI and Trading Supervisor do not call CPGW/IBKR directly. Broker mutation goes through the existing IBKR Order Service.
3. **Continuous runtime is deterministic:** Losing, restarting or delaying the AI conversation must not leave a candidate/position state unmanaged.
4. **AI decisions are proposals:** Each proposal is bound to the exact observed state/version and expires when market/order/position state materially changes.
5. **Hard risk is independent:** AI, PolicyVersion, MCP and Supervisor cannot disable or widen risk limits during a run.
6. **Broad filter, narrow watch:** Scanner performs broad universe reduction. Only a bounded shortlist receives targeted broker quote observation.
7. **Polling first:** Start with bounded targeted snapshots. Streaming is a later tactic only if measured evidence proves polling insufficient.
8. **Durable evidence:** Every trading episode preserves enough facts to distinguish Scanner-selection quality from entry, fill, position-management and exit quality.
9. **No hidden reasoning persistence:** Persist reason codes, evidence references and explicit decision facts, not private chain-of-thought.
10. **Public-safe persistence:** Never persist credentials, cookies/session tokens, account identifiers or raw authenticated provider dumps.
11. **No self-modifying production runtime:** AI may produce Policy Candidates; promotion to a deterministic policy/code path is explicit and evidence-backed.
12. **External acceptance is non-blocking unless structurally required:** User/target-machine/provider acceptance that has no real dependency on Branch 12 does not freeze Branch 12 execution.

## Trading domain

### TradingRun

Durable restartable trading/research session. It references one immutable PolicyVersion at a time and records current mode, lifecycle and public-safe environment facts.

### PolicyVersion

Immutable after first use. It contains typed server-controlled configuration and known decision primitives, not arbitrary executable code or a universal strategy DSL.

Potential policy categories include entry predicates, entry timeout, candidate switching, profit/exit targets, adverse-move handling, trailing behavior, maximum hold duration, quote staleness and deterministic fallback behavior. Exact values are not architecture constants.

A promoted `DETERMINISTIC_TRADING_POLICY_V1` is sealed from creation, before any TradingRun uses it. The initial typed schema contains only server-known primitives: `enterOnUsableQuote`, `maxWatchMs`, `takeProfitBps`, `stopLossBps` and `maxHoldMs`. Arbitrary executable fields are rejected. Legacy pre-Branch-12 policy objects retain the existing replace-before-first-use behavior, but become immutable once referenced by a TradingRun.

### TradeEpisode

One candidate/trade attempt with complete provenance:

- Scanner generation/query/result position and candidate identity;
- watch admission and quote observations;
- AI/supervisor decision records with reason codes;
- order intent/reference/lifecycle and fills when applicable;
- favorable/adverse movement evidence;
- exit decision/reason and resulting outcome;
- exact PolicyVersion and risk envelope.

An episode may end without an order when the candidate is skipped or expires.

### DecisionProposal

Bounded AI proposal such as `ENTER`, `SKIP`, `SWITCH`, `HOLD` or `EXIT`. It carries the exact state/version it observed. The server rejects stale, unauthorized, malformed or risk-incompatible proposals. Proposal acceptance never bypasses order-service validation or explicit LIVE confirmation.

## Candidate handoff

A candidate admitted from Scanner preserves immutable provenance sufficient to reproduce why it was considered:

- canonical `securityId`;
- exact Scanner generation identity;
- source SQL/query identity/hash;
- returned `resultRank`/position without inferring quality unless SQL ordering proves it;
- generation timestamps and relevant bounded row evidence;
- candidate admission timestamp.

A later Scanner generation never mutates an already-started episode.

## Targeted quote authority

Reuse existing IBKR contract-resolution/market-data snapshot seams where correct. Quote observations are read-only and record at least `last`, `bid`, `ask`, provider/update timestamp, local receive timestamp and explicit availability/staleness state.

Missing/stale/ambiguous quote authority fails closed for new decisions. Resource and polling bounds are configurable and measured. Do not add a streaming subsystem until workload evidence proves snapshots insufficient.

## Trading Supervisor

The Supervisor continuously owns state transitions. A minimal conceptual lifecycle is:

```text
IDLE
→ WATCHING
→ ENTRY_PENDING
→ ENTRY_WORKING
→ POSITION_OPEN
→ EXIT_PENDING
→ EXIT_WORKING
→ CLOSED
```

Explicit reconciliation/failure states may be added only where the existing order lifecycle requires them.

Same inputs + same PolicyVersion + same authoritative broker outcomes should produce the same deterministic Supervisor decision. Restart must not create a second order merely because the process lost volatile state.

When AI is unavailable, a deterministic fallback policy and Hard Risk Authority remain active. The Supervisor must never depend on an LLM response for immediate safety behavior.

When the active PolicyVersion is `DETERMINISTIC_TRADING_POLICY_V1`, its server-known primitives are evaluated directly by the Supervisor runtime. The resulting decision is recorded as `DETERMINISTIC_POLICY`; an AI proposal cannot override that deterministic policy decision. Entry timeout, usable-quote entry, take-profit, stop-loss and maximum-hold decisions therefore remain executable without an AI session.

## Hard Risk Authority

Hard Risk Authority is a separate enforcement boundary evaluated before order intent may reach the Order Bridge. It is operator/project-owned, not AI-owned.

The initial model must support bounded configuration for categories such as maximum order notional, concurrent positions, aggregate exposure, order-attempt rate, session loss, failed-entry attempts, quote staleness, new-entry pause and global kill switch. Exact defaults require implementation-time contract evidence; they are not guessed here.

Risk rejection is explicit, durable and diagnosable. AI/PolicyVersion may request stricter behavior but may never widen or disable the active hard envelope.

## Order Bridge

Reuse the existing IBKR Order Service as sole broker mutation authority:

- stable request IDs and intent hashing;
- DRY_RUN default;
- provider preflight/what-if;
- acknowledgement-unknown reconciliation rather than blind retry;
- SELL position guard / no short opening;
- bounded cancel/reply lifecycle;
- existing local authentication and security boundaries.

Branch 12 does not create a second IBKR adapter. For real-money LIVE execution, an explicit operator confirmation remains required at the final submission boundary. Automated autonomous execution is limited to shadow/synthetic/DRY_RUN paths.

## Trading Skill + MCP

Provide a separate Trading Skill/MCP over stable Trading Domain APIs. Candidate operations may include environment/run inspection, start/resume run, get candidates/watch state, inspect episodes, submit bounded DecisionProposal, pause/resume new entries, request safe close intent and compare PolicyVersions.

The tool surface must not expose raw CPGW requests, arbitrary provider orders, account-ID configuration, credential/session material, risk bypasses or arbitrary executable policy code.

TREE 12.8 adds three bounded learning operations to the existing Trading Domain/MCP path:

- `get_trade_episode_attribution` derives attribution from one durable episode; the client cannot submit its own attribution result;
- `compare_policy_versions` accepts exact episode IDs for two durable TradingRuns, bounded to 25 episode IDs per run, and returns a reproducible compact comparison;
- `build_policy_candidate` constructs a typed Policy Candidate from server-derived comparison evidence and server-owned creation time/evidence references.

There is intentionally no MCP promotion operation. Policy promotion remains a separate explicit server-side action after required validation. The loopback HTTP transport remains the existing authenticated `/domain` boundary; the learning operations do not create a second transport or expose direct ledger access.

## Attribution and learning

Episode analytics must preserve separate attribution for:

1. Scanner candidate quality;
2. entry-decision quality;
3. fill/execution quality;
4. position-management quality;
5. exit quality.

Do not infer that a poor realized outcome automatically proves the Scanner SQL was poor. Conversely, a good candidate does not prove execution policy was good.

TREE 12.8 fixes the attribution vocabulary to `SUCCESS`, `FAILURE`, `INCONCLUSIVE` and `NOT_APPLICABLE`. Every applicable layer must carry durable evidence references. Policy summaries expose explicit totals, applicable/conclusive/success/failure/inconclusive/not-applicable counts plus success-rate and evidence-coverage numerator/denominator pairs. Duplicate TradeEpisode evidence is rejected so denominators cannot be silently inflated.

Policy comparison is layer-specific and deterministic under input reordering. It never invents an aggregate score or winner. A layer is `COMPARABLE` only when both policies satisfy the configured conclusive-evidence threshold with complete evidence coverage; otherwise the layer and overall comparison may remain `INSUFFICIENT_EVIDENCE` with a null delta. Exact selected episode IDs are part of the reproducible comparison identity.

AI may compare PolicyVersions and propose a Policy Candidate. Strategy-level claims that require historical proof reuse Branch-10/11 Backtest/Research authority rather than create a second research engine. The historical validation target is bound to an exact Research Run and Query Artifact. A strategy-level promotion requires both `EPISODE_ATTRIBUTION` PASS and `HISTORICAL_BACKTEST` PASS; historical PASS is derived server-side from the Research recommendation artifact and requires the bound query to be independently Holdout-supported. Caller-forged historical PASS is rejected. An execution-only candidate requires episode-attribution validation only and does not invent a strategy-level historical requirement.

## Strategy distillation

The intended long-term loop is:

```text
AI explores bounded decisions
→ Trade Episodes accumulate
→ failure/success families become measurable
→ Policy Candidate is proposed
→ historical/shadow validation
→ explicit promotion
→ deterministic PolicyVersion/code handles routine behavior
```

Do not generate or execute arbitrary AI-authored production code as the policy mechanism.

A Policy Candidate is a typed immutable proposal, not a runtime mutation. `NO_PROMOTION` is a first-class valid result when evidence is missing, insufficient, failed or when explicit promotion was not requested; that result must not create or replace a PolicyVersion. Strategy-level promotion resolves required historical evidence through the Research Domain authority. Only after all required authorities PASS and explicit promotion is requested may the Trading Ledger create the new deterministic PolicyVersion, which is then sealed from creation.

## Acceptance progression

Branch 12 acceptance progresses through:

```text
historical/replay proof
→ live-market shadow observation
→ synthetic broker
→ DRY_RUN / provider what-if
→ human-confirmed LIVE boundary verification
```

A green earlier stage never silently enables the next stage. LIVE remains opt-in, fail-closed and explicitly confirmed by the operator.

Acceptance must include restart/fault/idempotency/staleness/risk/adversarial proof and representative workload measurement. User/target-machine/provider evidence may remain separately pending when it is not a real prerequisite for independent development.

## Non-goals

- direct AI/MCP → IBKR/CPGW mutation;
- unattended autonomous real-money order placement;
- removing broker/order-service confirmation, permission or reconciliation controls;
- a universal trading DSL;
- self-modifying production code;
- a second Research Server/Backtest engine;
- broad IBKR quote polling for the entire market universe;
- speculative streaming/warehouse/cache infrastructure without measured need;
- short selling, leverage optimization or new instrument classes merely because Branch 12 exists.
