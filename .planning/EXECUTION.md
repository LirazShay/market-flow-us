# Market Flow US — Execution

`.planning/EXECUTION.md` is the authoritative ST Planner 2.0 execution map.

Authority:

- `.planning/PLAN.md` owns planning / S&T reasoning and leaf success evidence.
- `.planning/EXECUTION.md` owns task, owner, status, real execution dependency and result/evidence truth.
- root `STATUS.yaml` is a non-authoritative projection/navigation compatibility file only.
- Numbered executor identity changes only through explicit activation such as `אני צאט 35 תתחיל`; a generic `continue` must never silently switch owners.
- `backlog/` is future work only. `B-US-008` has been promoted out of backlog-only status into Branch-11 PLAN/EXECUTION truth; `B-US-000` remains non-blocking future work at `backlog/B-US-000-final-target-machine-provider-acceptance.md`.

Status vocabulary: `pending | in_progress | done | blocked`.

## Current execution boundary

Branches 1–10 are complete. Branch 11 — Autonomous AI Researcher — has completed foundation task `11.1`; `11.2` / `Chat 36` is now active after explicit numbered-chat activation.

`11.3` / `Chat 37` remains an independently dependency-unblocked sibling after completed `11.1`, but it starts only through explicit activation of its assigned numbered chat; a generic `תמשיך לשלב הבא` never changes numbered executor identity.

Allocation follows natural feature/context boundaries, not a target number of chats. `11.2` and `11.3` are intentionally independent after `11.1`; `11.4` joins both expensive execution families; later work depends only on real prerequisites.

All correctness-critical handoff context lives in GitHub: `.planning/PLAN.md`, this file, `.planning/DECISIONS.md`, `docs/EXECUTOR_ROUTING.md` and the routed domain contracts/discovery documents. A fresh executor must not require previous-chat memory.

Historical detailed result narratives for completed tasks remain preserved in Git history at the exact pre-Branch11 planning snapshot `b37a6c4a9e8491d359bb3c7879255a42a8491fcf` and in their linked PRs/durable contracts. The concise rows below preserve current status, ownership, dependencies and evidence routing without duplicating that history.

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
| `11.1` | Chat 35 | `done` | `10.6` | PR #98 squash-merged as `49be2f619871a7cbe049ed0970c970738850f013`; hardened separate Research Ledger, run/objective/query/evidence/note/resume authority, cross-run fail-closed IDs, immutable hashes, logical evidence fingerprints, transaction rollback proof, public-safe persistence and composed restart proof all reclosed with green Fast/Planning CI on branch and main. |
| `11.2` | Chat 36 | `in_progress` | `11.1` | Active on `chat36-11-2-experiment-authority`; first slice composes immutable Query Artifact provenance directly over proven Backtest point authority with exact-equivalence/source-immutability regression. |
| `11.3` | Chat 37 | `pending` | `11.1` | — |
| `11.4` | Chat 38 | `pending` | `11.2`, `11.3` | — |
| `11.5` | Chat 39 | `pending` | `11.4` | — |
| `11.6` | Chat 40 | `pending` | `11.5` | — |
| `11.7` | Chat 41 | `pending` | `11.2`, `11.3`, `11.4`, `11.5`, `11.6` | — |
| `11.8` | Chat 42 | `pending` | `11.7` | — |

## Branch-11 ownership and context boundaries

- `Chat 35 / 11.1` — Research Server domain + ledger + run/objective/evidence identity/resume foundation.
- `Chat 36 / 11.2` — Backtest-authority reuse + experiment engine + typed diagnostics/metrics.
- `Chat 37 / 11.3` — general research SQL projection/sandbox + field/raw-data discovery. It may proceed independently of Chat 36 once 11.1 is done.
- `Chat 38 / 11.4` — jobs/result handles/budgets/cancellation/restart around the completed expensive execution families.
- `Chat 39 / 11.5` — Validation/Sealed Holdout/final recommendation authority.
- `Chat 40 / 11.6` — Plugin/Skill + MCP operating integration over the stable Research Domain API.
- `Chat 41 / 11.7` — adversarial security/failure audit over the composed system; blocking defects stay with this audit through RCA/fix/regression/green.
- `Chat 42 / 11.8` — representative/target-machine workload, actual desktop ChatGPT end-to-end acceptance, durable-contract reconciliation and deterministic reclosure.

A chat may split its own assigned leaf at safe implementation checkpoints when the work is large, but it does not invent a new owner/task merely to shorten a conversation. Conversely, a new chat is appropriate when the feature/context boundary materially changes. Repository state remains sufficient for every fresh start.

## Migration / current-state reconciliation

- Pre-Branch11 authoritative execution snapshot: `market-flow-us@b37a6c4a9e8491d359bb3c7879255a42a8491fcf`.
- Completed execution rows from Branches 1–10: **49**.
- New Branch-11 implementation rows: **8**.
- Current execution rows: **57**.
- Done: **50**.
- Pending: **6**.
- In progress: **1**.
- Blocked: **0**.
- Active owner: **Chat 36**, task **11.2**.
- Current normal sequence pointer: `Chat 36`, task `11.2`; sibling `Chat 37`, task `11.3`, remains independently dependency-unblocked and may be activated independently in its own numbered chat.
- `11.2` and `11.3` are parallel siblings after `11.1`; chat numbering is not dependency truth.
- Every Branch-11 dependency references a real prerequisite and no Branch-11 dependency cycle exists.
- Former `7.4` target-machine/provider acceptance remains non-blocking backlog `B-US-000` at `backlog/B-US-000-final-target-machine-provider-acceptance.md` and is not invented as done.

`11.2` is active under explicit Chat 36 identity. Generic continuation in this conversation may continue only Chat 36 / `11.2`; it must not silently activate Chat 37 or any later owner.