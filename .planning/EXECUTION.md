# Market Flow US — Execution

`.planning/EXECUTION.md` is the authoritative ST Planner 2.0 execution map.

Authority:

- `.planning/PLAN.md` owns planning / S&T reasoning and leaf success evidence.
- `.planning/EXECUTION.md` owns task, owner, status, real execution dependency and result/evidence truth.
- root `STATUS.yaml` is a non-authoritative projection/navigation compatibility file only.
- Numbered executor identity changes only through explicit activation such as `אני צאט 35 תתחיל`; a generic `continue` must never silently switch owners.
- `backlog/` is future work only. `B-US-008` is historical provenance for completed Branch 11; `B-US-009` is active blocked external acceptance execution; `B-US-010` is promoted to active Branch 12 planning/execution provenance; `B-US-000` remains non-blocking future provider acceptance work at `backlog/B-US-000-final-target-machine-provider-acceptance.md`.

Status vocabulary: `pending | in_progress | done | blocked`.

## Current execution boundary

Branches 1–10 are complete. Branch 11 — Autonomous AI Researcher — completed all eight implementation leaves `11.1`–`11.8` and repository reclosure in PR #110. Its separate target-machine/Desktop acceptance task `B-US-009` remains `blocked` at W2T because the required evidence can only be produced on the user's target machine; W2T/W3 remain NOT PASS.

That external acceptance blocker is not a dependency of Branch 12. Branch 12 — Autonomous AI Trading & Strategy Distillation — has nine implementation leaves `12.1`–`12.9`. `12.1 / Chat 43` is complete: PR #116 was squash-merged as `fb0b6230`, with post-merge `main` Planning, Fast, Chromium E2E and bounded Local Fake verification green. `12.2 / Chat 44` is complete: PR #118 was squash-merged as `b3821170`, and post-merge `main` Planning #1328 and Fast #1116 are green. `12.3 / Chat 45` is explicitly activated and in progress on `chat-45-targeted-quote-watch`; bounded quote authority, controlled CPGW-seam cadence/resource measurement and restart/no-fabricated-continuity proof are green, while final affected verification and reclosure remain.

Allocation follows natural feature/context boundaries and real prerequisites only. Waiting for user/target-machine/provider acceptance elsewhere does not freeze unrelated work unless this table records a real dependency.

All correctness-critical handoff context lives in GitHub: `.planning/PLAN.md`, this file, `.planning/DECISIONS.md`, `docs/EXECUTOR_ROUTING.md` and the routed durable contracts. A fresh executor must not require previous-chat memory.

Historical detailed result narratives for completed tasks remain preserved in Git history and linked PRs/durable contracts. The concise rows below preserve current status, ownership, dependencies and evidence routing.

## Execution map

| Task | Owner | Status | Depends on | Result/Evidence |
|---|---|---|---|---|
| `1.1` | Chat 1 | `done` | — | Exact U.S. provider acquisition/validation completed; historical evidence preserved at pre-Branch11 snapshot and durable provider contracts. |
| `1.2` | Chat 1 | `done` | `1.1` | Recorder/universe integration completed; historical evidence preserved. |
| `2.1` | Chat 2 | `done` | — | U.S. schema lifecycle completed; historical evidence preserved. |
| `2.2` | Chat 2 | `done` | `2.1` | Transactional cycle persistence completed; historical evidence preserved. |
| `2.3` | Chat 2 | `done` | `1.2`, `2.2` | End-to-end producer authority completed; historical evidence preserved. |
| `3.1` | Chat 3 | `done` | `2.2` | Trusted U.S. reads completed; historical evidence preserved. |
| `3.2` | Chat 3 | `done` | `3.1` | Current surface completed; historical evidence preserved. |
| `3.3` | Chat 3 | `done` | `3.1` | Detail/History completed; historical evidence preserved. |
| `4.1` | Chat 4 | `done` | `2.2` | U.S. Scanner built-ins/query authoring completed; historical evidence preserved. |
| `4.2` | Chat 4 | `done` | `4.1` | Scanner runtime/saved-query behavior completed; historical evidence preserved. |
| `4.3.1` | Chat 10 | `done` | `2.3` | Demo Buy schema v4/persistence completed; PR #19 and durable contracts preserve evidence. |
| `4.3.2` | Chat 10 | `done` | `4.3.1` | Demo Buy capture authority/protocol completed; PR #20 and durable contracts preserve evidence. |
| `4.3.3` | Chat 11 | `done` | `4.3.1` | Demo Buy evaluation/read model completed; PR #21 and workload evidence preserved. |
| `4.4.1` | Chat 12 | `done` | `4.3.2`, `4.2`, `5.2` | Scanner capture/Auto workflow completed; PR #22 evidence preserved. |
| `4.4.2` | Chat 13 | `done` | `4.3.3`, `4.4.1`, `5.2` | Demo Buy outcome UI completed; PR #23 evidence preserved. |
| `4.5.1` | Chat 14 | `done` | `4.3.2`, `4.3.3` | Deterministic sharing-safe AI Investigation exporter completed; PR #25 evidence preserved. |
| `4.5.2` | Chat 15 | `done` | `4.5.1`, `4.4.2`, `5.2` | AI Investigation Viewer workflow completed; PR #26 evidence preserved. |
| `5.1` | Chat 5 | `done` | `1.1` | U.S. Fake Market completed; historical evidence preserved. |
| `5.2` | Chat 5 | `done` | `1.2`, `2.3`, `5.1` | Normal U.S. runtime composition completed; historical evidence preserved. |
| `5.3` | Chat 5 | `done` | `3.2`, `3.3`, `4.2`, `5.2` | Full Chromium U.S. journey completed; historical evidence preserved. |
| `6.1` | Chat 6 | `done` | `2.1` | Packaging/branding completed; historical evidence preserved. |
| `6.2` | Chat 6 | `done` | `2.3`, `3.1`, `4.2`, `6.1` | Diagnostics/live verification completed; historical evidence preserved. |
| `6.3` | Chat 7 | `done` | `2.3`, `4.1` | Scalable workload tooling completed; historical evidence preserved. |
| `7.1` | Chat 7 | `done` | `5.3`, `6.2`, `6.3` | Deterministic release candidate proof completed; historical evidence preserved. |
| `7.2` | Chat 8 | `done` | `7.1` | Local Fake acceptance package completed; historical evidence preserved. |
| `7.3` | Chat 9 | `done` | `7.2`, `6.1` | Repository/release coherence completed; historical evidence preserved. |
| `7.5` | Chat 16 | `done` | `4.4.1`, `4.4.2`, `4.5.2`, `7.3` | Demo Buy/AI deterministic reclosure completed in PR #27; evidence preserved. |
| `7.6.1` | Chat 27 | `done` | `7.5`, `8.5`, `9.6` | Exact extension audit inventory completed; evidence preserved. |
| `7.6.2` | Chat 27 | `done` | `7.6.1` | Order/Basic BUY deep audit + RCA fixes completed; evidence preserved. |
| `7.6.3` | Chat 27 | `done` | `7.6.2` | Replay deep audit + lifecycle fix completed; evidence preserved. |
| `7.6.4` | Chat 27 | `done` | `7.6.3` | Shared integration audit completed; evidence preserved. |
| `7.6.5` | Chat 27 | `done` | `7.6.4` | Final deterministic code-audit reclosure completed; evidence preserved. |
| `8.1` | Chat 17 | `done` | `7.5` | Standalone order local authority completed; historical evidence preserved. |
| `8.2` | Chat 18 | `done` | `8.1` | Real CPGW lifecycle/LIVE gates completed; historical evidence preserved. |
| `8.3` | Chat 19 | `done` | `8.2` | Order operator/integration boundary completed; historical evidence preserved. |
| `8.4` | Chat 20 | `done` | `8.3` | Standalone order reclosure completed; historical evidence preserved. |
| `8.5` | Chat 26 | `done` | `3.3`, `8.4` | Basic current-Detail BUY completed; historical evidence preserved. |
| `9.1` | Chat 21 | `done` | `1.1` | Replay recorder/storage completed; historical evidence preserved. |
| `9.2` | Chat 21 | `done` | `9.1` | Portable Replay format/source completed; historical evidence preserved. |
| `9.3` | Chat 22 | `done` | `9.2`, `2.3` | 1x Player/ProducerBridge path completed; historical evidence preserved. |
| `9.4` | Chat 23 | `done` | `9.3` | Isolated Replay Host/fresh-run lifecycle completed; historical evidence preserved. |
| `9.5` | Chat 24 | `done` | `9.4`, `8.4` | Replay deterministic reclosure completed; PR #53 evidence preserved. |
| `9.6` | Chat 25 | `done` | `9.5` | Replay adversarial hardening completed; durable hardening audit/evidence preserved. |
| `10.1` | Chat 29 | `done` | `7.6.5` | Backtest safe offline evidence access completed; focused proof + Fast/Browser/Replay/Planning/Workload evidence preserved. |
| `10.2` | Chat 30 | `done` | `10.1` | Historical Scanner anti-lookahead sandbox completed; focused future/source escape proof and CI preserved. |
| `10.3` | Chat 31 | `done` | `10.2` | Shared post-decision outcome authority completed; PR #82 and equivalence/source-immutability proof preserved. |
| `10.4` | Chat 32 | `done` | `10.2`, `10.3` | Inspect/Compare complete point evidence completed; PRs #83–#86 and Chromium/service proof preserved. |
| `10.5` | Chat 33 | `done` | `10.4` | Deterministic seconds/minutes Sweep + exact drill-down completed; PR #88 and CI evidence preserved. |
| `10.6` | Chat 34 | `done` | `10.5` | Backtest productization/performance/reclosure completed through PRs #89–#95; final source-immutability/security review and green main evidence preserved. |
| `11.1` | Chat 35 | `done` | `10.6` | PR #98 squash-merged; durable Research Server/ledger foundation and restart proof green. |
| `11.2` | Chat 36 | `done` | `11.1` | Authoritative experiment engine/equivalence/source-immutability proof green. |
| `11.3` | Chat 37 | `done` | `11.1` | Phase-aware research SQL projection/sandbox and adversarial proof green. |
| `11.4` | Chat 38 | `done` | `11.2`, `11.3` | Durable jobs/results/resources/cancellation/restart proof green. |
| `11.5` | Chat 39 | `done` | `11.4` | Validation/Sealed Holdout/final recommendation authority green. |
| `11.6` | Chat 40 | `done` | `11.5` | Portable Plugin/Skill + thin MCP integration and fresh-chat resume proof green. |
| `11.7` | Chat 41 | `done` | `11.2`, `11.3`, `11.4`, `11.5`, `11.6` | Adversarial hardening reclosed with green affected verification. |
| `11.8` | Chat 42 | `done` | `11.7` | PR #110 merged; representative synthetic workload, acceptance tooling and repository reclosure green; real W2T/W3 deferred to `B-US-009`. |
| `B-US-009` | Target-machine acceptance executor | `blocked` | `11.8` | Current gate W2T requires actual user target-machine historical evidence. This blocker is not W2T failure evidence and does not block Branch 12. |
| `12.1` | Chat 43 | `done` | — | PR #116 squash-merged as `fb0b6230`; durable Trading ledger authority, bounded restart run discovery, explicit raw authenticated/provider dump rejection, seven focused authority proofs and Fast-CI `trading-server/**` coverage are green. Fast, Planning, Chromium E2E and bounded Local Fake verification are green both before merge and on post-merge `main`. |
| `12.2` | Chat 44 | `done` | `12.1` | PR #118 squash-merged as `b3821170`; immutable Scanner generation/query/result-rank handoff, bounded row evidence, durable TradeEpisode admission/reopen and fail-closed identity/provenance-persistence bounds are complete. Pre-merge Planning #1327 and Fast #1115 were green; post-merge `main` Planning #1328 and Fast #1116 are green. |
| `12.3` | Chat 45 | `in_progress` | `12.1` | Bounded one-shot quote authority reuses CPGW exact-resolution/snapshot seams and fails closed on stale/missing/ambiguous evidence. Workload #680 targeted job is green: shortlist 4, 12 provider requests/poll, zero-delay p95 0.82 ms, controlled 10 ms/request p95 122.12 ms vs 120 ms provider floor, 2.12 ms measured overhead and all 32 observations fresh. Decision: keep bounded polling; no streaming evidence. Restart proof commit `2b4056c8` is green on Planning #1337, Workload #683 and Fast #1123: a fresh watch instance preserves the explicit instrument identity, performs new resolution/snapshot work, consumes new provider timestamps/prices, and fails closed as `UNAVAILABLE` after restart when provider evidence disappears instead of recycling the prior quote. Real provider latency is not inferred here and remains for live-shadow/target-machine acceptance. Final affected verification and reclosure remain. |
| `12.5` | Chat 46 | `pending` | `12.1` | Independent Hard Risk Authority + pause/kill-switch boundary. |
| `12.6` | Chat 46 | `pending` | `12.5`, `8.4` | Protected bridge to existing IBKR Order Service; LIVE remains explicit operator confirmation. |
| `12.4` | Chat 47 | `pending` | `12.2`, `12.3`, `12.5`, `12.6` | Continuous deterministic Supervisor + state-aware AI Decision Proposal model. |
| `12.7` | Chat 48 | `pending` | `12.4`, `12.6` | Separate Trading Skill + Trading MCP over stable Trading Domain APIs. |
| `12.8` | Chat 49 | `pending` | `12.7` | Episode attribution + policy learning + deterministic distillation using existing Research/Backtest authority where needed. |
| `12.9` | Chat 50 | `pending` | `12.8` | Shadow/synthetic/DRY_RUN/human-confirmed-LIVE acceptance, adversarial hardening and deterministic reclosure. |

## Branch-12 ownership and context boundaries

- `Chat 43 / 12.1` — durable TradingRun/PolicyVersion/TradeEpisode authority only; no quote/provider/order implementation yet.
- `Chat 44 / 12.2` — Scanner generation/candidate provenance handoff.
- `Chat 45 / 12.3` — targeted IBKR quote-watch/read-only provider seam and cadence/resource evidence.
- `Chat 46 / 12.5 + 12.6` — independent hard-risk authority followed by protected reuse of the existing order-service execution boundary.
- `Chat 47 / 12.4` — continuous Supervisor and state-aware AI DecisionProposal orchestration over completed handoff/quote/risk/order seams.
- `Chat 48 / 12.7` — separate Trading Skill/MCP packaging and operating integration; no broker/risk bypass.
- `Chat 49 / 12.8` — episode attribution, policy comparison and deterministic distillation; reuse Branch-10/11 research authority rather than duplicate it.
- `Chat 50 / 12.9` — composed adversarial/workload/acceptance/reclosure; blocking defects stay with this task through RCA/fix/regression/green.
- `B-US-009 / Target-machine acceptance executor` — independently blocked post-merge AI Researcher acceptance; it resumes only when its target-machine evidence is supplied and does not change numbered Chat ownership.

A chat may split its own assigned leaf at safe implementation checkpoints when the work is large, but it does not invent a new owner/task merely to shorten a conversation. Conversely, a new chat is appropriate when the feature/context boundary materially changes. Repository state remains sufficient for every fresh start.

## Migration / current-state reconciliation

- Completed execution rows before Branch 12: **58** (`57 done`, `1 blocked`).
- Branch-12 implementation rows: **9** (`2 done`, `6 pending`, `1 in_progress`).
- Current execution rows: **67**.
- Done: **59**.
- Pending: **6**.
- In progress: **1** (`12.3 / Chat 45`).
- Blocked: **1** (`B-US-009`, external target-machine evidence).
- Current normal sequence pointer: `12.3 / Chat 45` is explicitly active and in progress on `chat-45-targeted-quote-watch`.
- `B-US-009 / W2T` remains separately blocked on target-machine evidence. It is not a dependency of `12.1`–`12.9`.
- `12.2`, `12.3` and `12.5` are parallel siblings after `12.1`; chat numbering is not dependency truth.
- `12.6` requires the risk boundary plus the already-completed order-service authority; `12.4` composes the candidate/quote/risk/order seams; later dependencies reflect actual composed prerequisites.
- Former `7.4` target-machine/provider acceptance remains non-blocking backlog `B-US-000` and is not invented as done.

Branch 11 implementation/repository reclosure remains complete. Branch 12 has completed `12.1` and `12.2`; `12.3 / Chat 45` is in progress while `B-US-009` remains independently blocked on user target-machine evidence.