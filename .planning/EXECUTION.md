# Market Flow US — Execution

`.planning/EXECUTION.md` is the authoritative ST Planner 2.0 execution map.

Authority:

- `.planning/PLAN.md` owns planning / S&T reasoning and leaf success evidence.
- `.planning/EXECUTION.md` owns task, owner, status, real execution dependency and result/evidence truth.
- root `STATUS.yaml` is a non-authoritative projection/navigation compatibility file only.
- Numbered executor identity changes only through explicit activation such as `אני צאט 35 תתחיל`; a generic `continue` must never silently switch owners.
- `backlog/` is future/provenance context only. `B-US-009` is the single active blocked external acceptance execution row; `B-US-000` is historical provider-acceptance provenance consolidated into `B-US-009`; `B-US-010` is promoted Branch-12 provenance.

Status vocabulary: `pending | in_progress | done | blocked`.

## Current execution boundary

Branches 1–10 are complete. Branch 11 — Autonomous AI Researcher — completed all eight implementation leaves `11.1`–`11.8` and repository reclosure in PR #110. Its real target-machine/Desktop acceptance was deferred into `B-US-009` and remains NOT PASS until actually executed.

Branch 12 — Autonomous AI Trading & Strategy Distillation — has nine implementation leaves `12.1`–`12.9`. `12.1`–`12.8` are merged and complete. `12.9 / Chat 50` remains active and `in_progress` in PR #131. Historical/replay, live-shadow tooling/verifier, synthetic-broker, DRY_RUN/provider-what-if and adversarial/fault/security/workload reclosure are executor-owned green. Actual authenticated provider shadow, real Desktop/target-machine evidence and any explicitly user-initiated LIVE evidence remain external and have not been fabricated.

The durable final user-acceptance consolidation is complete: `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` and `.planning/FINAL_ACCEPTANCE_EXECUTION.md` define one unified post-merge `U0..U6` sequence under the existing `B-US-009` task. That single task incorporates the still-relevant original Research `W2T/W3`, historical `B-US-000` FR/provider scope and Branch-12 external Trading evidence. `B-US-000` must not be activated as a second acceptance task. `B-US-009` depends on `12.9`, so it cannot become the current pointer until Branch-12 implementation/repository reclosure is merged and `main` is green/open-PR-clean.

Final diff/repository reclosure for PR #131 is now complete. The full PR was reviewed against fresh unchanged `main`, including production, evidence tooling, tests, workflows and planning. Review found one latent truth-model defect: `scripts/validate-status-projection.mjs` rejected a `blocked` current pointer, which would have made the honest post-merge `B-US-009` state impossible to project. RCA fixed the model so `blocked` is a legal current pointer with `chat=null` and `activation_required=false`, while `done` remains invalid; `tests/unit/status-projection-validator.test.mjs` provides direct regression proof. Current-head Planning #1443, Fast #1217, Browser #758, Replay #275 and Workload #731 are green. No other blocking defect or authority/security bypass was found.

The next executor-owned boundary for `12.9 / Chat 50` is therefore PR/CI/merge and post-merge `main` verification only. After the merge is accepted on green/open-PR-clean `main`, mark `12.9` done and project the single downstream `B-US-009` task honestly as blocked until its target-machine prerequisites are available.

Allocation follows natural feature/context boundaries and real prerequisites only. Waiting for user/target-machine/provider acceptance elsewhere does not freeze unrelated implementation unless this table records a real dependency.

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
| `3.1` | Chat 3 | `done` | — | Trusted U.S. reads completed; historical evidence preserved. |
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
| `11.8` | Chat 42 | `done` | `11.7` | PR #110 merged; representative synthetic workload, acceptance tooling and repository reclosure green; real external Research/Desktop evidence is now part of unified `B-US-009`. |
| `B-US-009` | Target-machine acceptance executor | `blocked` | `11.8`, `12.9` | Single unified post-merge user acceptance task. `.planning/FINAL_ACCEPTANCE_RUNBOOK.md` consolidates original Research `W2T/W3`, still-relevant historical `B-US-000` FR/provider checks and Branch-12 external Trading evidence into serial `U0..U6`. It intentionally cannot start until `12.9` is merged/main-green/open-PR-clean and then requires the user's target machine/Desktop/provider sessions. No external PASS is fabricated; real-money placement may remain exactly `PENDING_EXTERNAL_PERMISSION` under the runbook rules. |
| `12.1` | Chat 43 | `done` | — | PR #116 squash-merged as `fb0b6230`; durable Trading ledger authority, bounded restart run discovery, explicit raw authenticated/provider dump rejection, seven focused authority proofs and Fast-CI `trading-server/**` coverage are green. Fast, Planning, Chromium E2E and bounded Local Fake verification are green both before merge and on post-merge `main`. |
| `12.2` | Chat 44 | `done` | `12.1` | PR #118 squash-merged as `b3821170`; immutable Scanner generation/query/result-rank handoff, bounded row evidence, durable TradeEpisode admission/reopen and fail-closed identity/provenance-persistence bounds are complete. Pre-merge Planning #1327 and Fast #1115 were green; post-merge `main` Planning #1328 and Fast #1116 are green. |
| `12.3` | Chat 45 | `done` | `12.1` | PR #120 squash-merged as `aeab832a`. Bounded one-shot quote authority reuses CPGW exact-resolution/snapshot seams and fails closed on stale/missing/ambiguous evidence. Restart proof establishes fresh provider work after watch restart and no fabricated quote continuity. Final RCA corrected the workload to cover the real first-snapshot-unready retry path. Pre-merge done-state Planning #1342, Workload #688 and Fast #1128 are green; post-merge `main` Planning #1343, Workload #689 and Fast #1129 are green. Real provider latency remains external live-shadow/target-machine evidence. |
| `12.5` | Chat 46 | `done` | `12.1` | PR #122 squash-merged as `b9f722ab`. Independent Hard Risk Authority requires explicit operator/project-owned hard limits, permits policy/AI only to narrow them, gates every autonomous order intent before the downstream Order Bridge seam, preserves risk-reducing SELL behavior for entry-only ceilings, and durably records stable `HARD_RISK_REJECTED` reason codes fail-closed. Pre-merge Planning #1346 and Fast #1130 are green; post-merge `main` Planning #1347 and Fast #1131 are green. |
| `12.6` | Chat 46 | `done` | `12.5`, `8.4` | PR #124 squash-merged as `be462b7a`. Protected Order Bridge reuses the existing authenticated IBKR Order Service. DRY_RUN passes Hard Risk before the service path; LIVE requires explicit operator confirmation and then a final Hard Risk re-check immediately before mutation. Existing idempotency/reconciliation/no-short/security semantics remain authoritative. Pre-merge Planning #1355, Fast #1135, Browser #720, Replay #234 and Workload #693 are green; post-merge `main` Planning #1356, Fast #1136, Browser #721, Replay #235 and Workload #694 are green. |
| `12.4` | Chat 47 | `done` | `12.2`, `12.3`, `12.5`, `12.6` | PR #126 squash-merged as `49c516dd`. Deterministic continuous Supervisor + strict state/policy-bound DecisionProposal compose candidate/quote/risk/order seams. Durable decisions/state/order evidence, reconciliation, restart/crash-window no-duplicate behavior, AI fallback and shutdown are green. Final pre-merge Planning #1366/Fast #1144 and post-merge `main` Planning #1367/Fast #1145 are green. |
| `12.7` | Chat 48 | `done` | `12.4`, `12.6` | PR #127 squash-merged as `1eadb381`. Separate Trading Plugin/Skill/MCP expose bounded Trading Domain operations without raw provider, risk or LIVE-gate bypass. Local transport security and deterministic fallback on MCP loss are green. Reclosure Planning #1371, Workload #698, Replay #239, Fast #1149 and Browser #725 are green; post-merge main runs are green. |
| `12.8` | Chat 49 | `done` | `12.7` | PR #129 squash-merged as `3723573fe55f632b9e0d5a077685b3fa69551ee5`. Five-layer attribution, reproducible PolicyVersion comparison, typed candidates, Research-authority historical validation and explicit deterministic promotion boundaries are complete. Completion/final/post-merge Planning/Fast evidence is green. |
| `12.9` | Chat 50 | `in_progress` | `12.8` | PR #131 reclosure. Historical/replay, live-shadow tooling/verifier, synthetic broker, DRY_RUN/provider-what-if, adversarial/fault/security/workload proof and the unified external-acceptance guide are green. Full final diff/repository review against fresh `main` is complete. RCA found and fixed the blocked-current STATUS projection defect in commit `cfeaefb9`; direct regression proves blocked is a legal non-activatable current pointer while done remains illegal. Current-head Planning #1443, Fast #1217, Browser #758, Replay #275 and Workload #731 are green. No target-machine/provider/Desktop/LIVE PASS is claimed. Next executor-owned work is PR/CI/merge and post-merge main verification only. |

## Branch-12 ownership and context boundaries

- `Chat 43 / 12.1` — durable TradingRun/PolicyVersion/TradeEpisode authority only; no quote/provider/order implementation yet.
- `Chat 44 / 12.2` — Scanner generation/candidate provenance handoff.
- `Chat 45 / 12.3` — targeted IBKR quote-watch/read-only provider seam and cadence/resource evidence.
- `Chat 46 / 12.5 + 12.6` — independent hard-risk authority followed by protected reuse of the existing order-service execution boundary.
- `Chat 47 / 12.4` — continuous Supervisor and state-aware AI DecisionProposal orchestration over completed handoff/quote/risk/order seams.
- `Chat 48 / 12.7` — separate Trading Skill/MCP packaging and operating integration; no broker/risk bypass.
- `Chat 49 / 12.8` — episode attribution, policy comparison and deterministic distillation; reuse Branch-10/11 research authority rather than duplicate it.
- `Chat 50 / 12.9` — composed adversarial/workload/acceptance/reclosure; blocking defects stay with this task through RCA/fix/regression/green. External acceptance remains post-merge.
- `B-US-009 / Target-machine acceptance executor` — the single unified post-merge user acceptance task. It depends on `12.9` and owns all remaining target-machine/Desktop/provider evidence through `.planning/FINAL_ACCEPTANCE_RUNBOOK.md`.

A chat may split its own assigned leaf at safe implementation checkpoints when the work is large, but it does not invent a new owner/task merely to shorten a conversation. Conversely, a new chat is appropriate when the feature/context boundary materially changes. Repository state remains sufficient for every fresh start.

## Migration / current-state reconciliation

- Completed execution rows before Branch 12: **58** (`57 done`, `1 blocked`).
- Branch-12 implementation rows: **9** (`8 done`, `0 pending`, `1 in progress`).
- Current execution rows: **67**.
- Done: **65**.
- Pending: **0**.
- In progress: **1** (`12.9 / Chat 50`).
- Blocked: **1** (`B-US-009`, unified post-merge target-machine/Desktop/provider acceptance).
- Current normal sequence pointer: `12.9 / Chat 50` remains `in_progress` on branch `chat-50-tree-12-9-reclosure`. Final diff/repository reclosure is complete and current-head Planning #1443, Fast #1217, Browser #758, Replay #275 and Workload #731 are green. The only remaining executor-owned boundary is PR/CI/merge plus post-merge `main` verification. After accepted merge/main-green/open-PR-clean, mark `12.9` done and project `B-US-009` as the current blocked task with `chat=null` and `activation_required=false`; then execute unified `U0..U6` only when the target-machine prerequisites are available. Never invent external PASS.
- `B-US-009` depends on `12.9` and therefore cannot become current before Branch-12 implementation/repository reclosure is complete.
- `B-US-000` must not be activated independently; its still-relevant FR/provider scope is already consumed by the unified `B-US-009` runbook.
- `12.2`, `12.3` and `12.5` are parallel siblings after `12.1`; chat numbering is not dependency truth.
- `12.6` requires the risk boundary plus the already-completed order-service authority; `12.4` composes the candidate/quote/risk/order seams; later dependencies reflect actual composed prerequisites.

Branch 11 implementation/repository reclosure remains complete. Branch 12 has completed `12.1`, `12.2`, `12.3`, `12.4`, `12.5`, `12.6`, `12.7` and `12.8`; `12.9 / Chat 50` is active and `in_progress` with final diff/repository reclosure complete. External user/target-machine acceptance remains unproven and is represented by the single blocked downstream task `B-US-009`.
