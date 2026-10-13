# AI Researcher acceptance evidence

This file is the public-safe TREE `11.8` acceptance ledger for representative workload and current-desktop reclosure.

It records only synthetic/public-safe measurements and GitHub verification identifiers. It must never contain credentials, cookies, session material, account identifiers, private browser data or authenticated dumps.

## Gate disposition

| Gate | Status | Evidence |
|---|---|---|
| `W1` deterministic reduced CI workload | `PASS` | Workload CI run `38358501031`, job `115166877682`, `ci-256` Research resource probe. |
| `W2` representative 4,096-security synthetic workload | `PASS` | One-time PR verification run `38358501349`, job `115166878192`, artifact `11793616887`, `target-4096` Research resource probe. |
| `W3` current target-machine/Desktop acceptance | `PENDING` | Must be executed or an exact external-product blocker recorded in the next TREE `11.8` slice. |

## W1 — reduced deterministic CI

The existing Workload CI Research job ran the updated probe with `MARKET_FLOW_US_WORKLOAD_PROFILE=ci` and completed successfully.

- profile: `ci-256`
- result: `pass`
- successful real Strategy Sandbox experiment: yes
- duplicate pressure: `16` submissions -> `1` durable Job -> `1` deterministic Experiment -> `SUCCEEDED`
- queued cancellation: `203.853 ms` against the unchanged `1000 ms` hard ceiling
- active Research SQL cancellation: `281.912 ms` against the unchanged `2500 ms` hard ceiling
- active Strategy Sandbox cancellation: `464.784 ms` against the unchanged `2500 ms` hard ceiling
- Strategy Sandbox completion: `2865.78 ms`
- Strategy Sandbox bounded summary: `1` row, `232` serialized bytes, `1380` progress-envelope bytes
- successful Research SQL: `832.576 ms`
- post-restart Research SQL: `887.796 ms`
- source fingerprint before/after: equal
- tuning disposition: do **not** increase concurrency; do **not** widen timeouts; do **not** widen budgets

The rest of Workload CI run `38358501031` was also green: bounded end-to-end, isolated probes and Backtest Lab.

## W2 — representative 4,096-security synthetic workload

A PR-only verification workflow ran the exact Research resource probe with `MARKET_FLOW_US_WORKLOAD_PROFILE=target-e2e`. The workflow is intentionally temporary and is removed after capturing this evidence so normal CI does not permanently pay for target-scale verification.

- profile: `target-4096`
- universe size: `4096`
- test duration: `7318.571 ms` (`7510.192 ms` Node test-process duration)
- result: `pass`
- successful real Strategy Sandbox experiment: yes
- duplicate pressure: `16` submissions -> `1` durable Job -> `1` deterministic Experiment -> `SUCCEEDED`
- queued cancellation: `197.332 ms` against the unchanged `1000 ms` hard ceiling
- active Research SQL cancellation: `285.237 ms` against the unchanged `2500 ms` hard ceiling
- active Strategy Sandbox cancellation: `409.139 ms` against the unchanged `2500 ms` hard ceiling
- Strategy Sandbox completion: `2794.392 ms`
- Strategy Sandbox bounded summary: `1` row, `232` serialized bytes, `1380` progress-envelope bytes
- successful Research SQL: `826.806 ms`
- bounded result-page read: `29.723 ms`
- managed-domain close: `0.164 ms`
- managed-domain reopen: `278.713 ms`
- post-restart Research SQL: `838.562 ms`
- source fingerprint before/after: equal
- synthetic market DB bytes: `2371584`
- Research Ledger bytes: `12857344`
- temp-directory delta bytes: `12857344`
- RSS before/after: `90484736` / `164220928` bytes (`73736192` byte delta)
- max RSS observed by Node resource usage: `196124672` bytes
- CPU user/system: `7983010` / `1607628` microseconds
- target artifact SHA-256 reported by Actions upload: `3c47263f226731e7a23848cab07b28e26895bf0c2a4d343d2e8cfbc708b15212`
- tuning disposition: do **not** increase concurrency; do **not** widen timeouts; do **not** widen budgets

### Resource-policy conclusion

The representative path completed inside the existing conservative serial heavy-job/reader policy. No evidence justifies changing the current concurrency, cancellation ceilings, timeouts or result budgets. TREE `11.8` therefore preserves the existing resource policy unchanged.

The measured disk growth is the bounded Research Ledger created by the synthetic run; the authoritative market source fingerprint remains unchanged after cancellation, successful Research SQL, successful Strategy Sandbox execution, restart and result reads.

## Remaining acceptance

`W3` remains intentionally open. The next slice must verify the supported current ChatGPT Desktop/plugin/MCP bootstrap + fresh-context resume path on the target machine if the product surface permits it. If the external product surface does not expose a supported install/connect path, record the exact blocker without weakening the already-green local adapter, W1 or W2 proofs.
