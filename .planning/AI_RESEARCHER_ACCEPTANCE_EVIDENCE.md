# AI Researcher acceptance evidence

This file is the public-safe TREE `11.8` acceptance ledger for representative workload, target-machine actual-evidence measurement and current-desktop reclosure.

It records only synthetic/public-safe measurements and GitHub verification identifiers. It must never contain credentials, cookies, session material, account identifiers, private browser data or authenticated dumps.

## Gate disposition

| Gate | Status | Evidence |
|---|---|---|
| `W1` deterministic reduced CI workload | `PASS` | Workload CI run `38358501031`, job `115166877682`, `ci-256` Research resource probe. |
| `W2` representative 4,096-security synthetic workload | `PASS` | One-time PR verification run `38358501349`, job `115166878192`, artifact `11793616887`, `target-4096` Research resource probe. |
| `W2T` target-machine actual-evidence resource workload | `PENDING_TARGET_MACHINE` | Repository runner `npm run research-target:workload` is implemented and CI-proven to consume existing evidence only, preserve source bytes/fingerprint and refuse synthetic fallback. It still must run against the intended target machine's real historical evidence before target-machine wall-clock/RAM/disk/concurrency/result-size evidence can be accepted. |
| `W3` current target-machine/Desktop acceptance | `PENDING_TARGET_MACHINE` | Current official OpenAI Plugin docs support repo/local marketplaces and local MCP apps in ChatGPT Desktop. Repo/local marketplace discovery is specifically documented through Work mode or Codex inside ChatGPT Desktop; the repo ships the marketplace, deterministic target-machine preflight and exact Desktop runbook, but the real target-machine mission/restart proof still must be executed in Desktop after `W2T` passes. |

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

The representative path completed inside the existing conservative serial heavy-job/reader policy. No evidence justifies changing the current concurrency, cancellation ceilings, timeouts or result budgets. TREE `11.8` therefore preserves the existing resource policy unchanged unless the actual target-machine evidence demonstrates a concrete need to tune it.

The measured disk growth is the bounded Research Ledger created by the synthetic run; the authoritative market source fingerprint remains unchanged after cancellation, successful Research SQL, successful Strategy Sandbox execution, restart and result reads.

## W2T — target-machine actual-evidence resource workload

The repository now owns a dedicated target-machine command:

```text
npm run research-target:workload
```

The runner is intentionally separate from normal hosted Workload CI. Its purpose is to measure the existing managed Research path against the target machine's **already-existing Market Flow US historical evidence**, not to create another synthetic benchmark.

The runner:

- enumerates only product-owned Backtest evidence sources;
- opens source evidence read-only;
- chooses an eligible real `T0` from complete-cycle chronology without assuming a fixed collection cadence;
- creates a temporary Research Ledger outside the source evidence;
- runs the existing managed Strategy Sandbox path and managed Research SQL path;
- submits `16` duplicate experiment requests and requires one durable Job / one Experiment identity;
- reads bounded Result Handles;
- closes and reopens the managed Research Domain and re-reads durable results;
- records public-safe wall-clock/RSS/max-RSS/CPU/disk/concurrency/result-row/result-byte measurements;
- compares source fingerprint and source byte size before/after;
- refuses to seed/fabricate market data if no usable product evidence exists;
- emits `desktopAcceptance = STILL_REQUIRED`, because resource measurement is not Desktop acceptance.

Implementation proof before target execution:

- one-time full managed-path service proof passed in Fast CI `#1075` (`~7390.75 ms` for that explicit composition proof);
- the recurring regression was then reduced to source discovery/read-only/immutability/no-synthetic-fallback proof so ordinary Fast CI does not permanently pay for the target workload;
- the reduced regression passed in Fast CI `#1078` at approximately `102.83 ms`;
- Planning/Contract `#1276`, Workload `#664`, Replay `#216` and Browser `#688` were also green on implementation head `1dbff7e86863c15125879ed2bdaed5e2e67f27c0`.

These CI results prove the runner contract and composition, **not** the target machine's real resource measurements. `W2T` remains `PENDING_TARGET_MACHINE` until the intended candidate is run on the target machine against the intended historical evidence and the public-safe report is reviewed.

A passing target report is expected at:

```text
test-results/acceptance/research-target-evidence.json
```

Required target evidence to capture here after execution:

- exact candidate commit;
- `result = pass`;
- selected source count/kinds/schema versions without filesystem paths;
- wall-clock duration;
- experiment and Research SQL durations;
- result row/serialized-byte sizes;
- Research Ledger/temp-directory disk bytes;
- RSS before/after/delta and max RSS;
- CPU user/system microseconds;
- effective managed concurrency policy;
- duplicate submissions -> one Job / one Experiment;
- durable result reads after managed-domain reopen;
- source fingerprint equality and source byte-size equality;
- explicit tuning disposition based only on those measurements.

Do not copy source paths, raw rows, provider/session material, browser state or environment dumps into this ledger.

## W3 — current Desktop surface re-verification

TREE `11.6` recorded an earlier assumption that ChatGPT access to the local `stdio` MCP required a public HTTPS endpoint or Secure MCP Tunnel. Current official OpenAI Plugin documentation now explicitly supports local/repo plugin marketplaces in ChatGPT Desktop and local MCP apps that run on the user's computer.

Current product-surface refinement verified on 2026-10-13:

- the OpenAI plugin packaging documentation says repo/local marketplaces are exposed from a trusted repository in **Work mode or Codex inside the ChatGPT desktop app**;
- the OpenAI ChatGPT plugin help documentation says local MCP apps run on the user's computer and are Desktop-only; saving/installing the plugin does not make those local tools available on web or mobile;
- therefore ChatGPT web cannot satisfy or emulate W3, and the target-machine install/discovery step must use the documented Desktop Work/Codex marketplace surface before the actual fresh Desktop conversation mission.

Official product references used for this disposition:

- `https://developers.openai.com/plugins/build/plugins`
- `https://help.openai.com/en/articles/20001256-plugins-in-chatgpt`

RCA disposition:

- Research Domain/API authority remains correct.
- The 46-tool thin MCP registry remains correct.
- The shipped `stdio` server remains the correct same-machine transport.
- The stale assumption was in target-client installation/discovery guidance, not research semantics.
- Do **not** add a public listener or tunnel merely to satisfy Desktop acceptance.

Repository repair on PR `#110`:

- added `.agents/plugins/marketplace.json` exposing `market-flow-us-researcher` as an explicitly installable repo-local plugin;
- preserved portable `plugin.json` + `mcp.json` Agent Plugins packaging;
- preserved the `market-flow-us-research-mcp` `stdio` executable and server-owned resource/security policy;
- added `tests/unit/research-plugin-packaging.test.mjs` to lock marketplace -> plugin -> MCP command -> `package.json.bin` coherence and reject accidental network-endpoint substitution;
- added `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md` with the exact target-machine actual-evidence workload, current preflight, Work/Codex marketplace discovery path, fresh-chat mission, Desktop/server restart proof and public-safe evidence rules;
- added `npm run research-desktop:preflight`, backed by `scripts/check-research-desktop-preflight.mjs`, to prove the actual target-machine prerequisites that Desktop inherits: repo marketplace/package coherence, real market evidence presence, PATH-visible `market-flow-us-research-mcp`, real `stdio` initialization, 46-tool discovery and the data/instruction boundary;
- added deterministic unit and real-process integration regressions for the preflight contract.

### Executor boundary for the real Desktop gate

The GitHub/web execution surface used to implement PR `#110` cannot inspect or control the user's local ChatGPT Desktop process, its local repository workspace, inherited Windows `PATH`, Desktop Work/Codex repository context, Plugin Directory UI, plugin installation state, Desktop restart, or a second fresh local conversation. That is an execution-environment boundary, **not** evidence that the Desktop product path is broken.

The current web Plugin Directory visible to this executor does not expose the repo-local `market-flow-us-researcher`; that is expected because local marketplaces are separate Desktop sources rather than universal public-directory entries. It must not be interpreted as a plugin-discovery failure on the target Desktop machine.

Accordingly, this executor must not fabricate `W2T = PASS` or `W3 = PASS`. The target-machine order is deterministic:

```text
npm ci
npm run research-target:workload
npm link
npm run research-desktop:preflight
```

Require the actual-evidence workload to pass before Desktop preflight. A passing Desktop preflight proves the repository/machine MCP prerequisites and intentionally reports `desktopAcceptance = STILL_REQUIRED`. Only after both target-machine prerequisites pass should a Desktop-specific failure be classified as a target-client blocker.

The real W3 acceptance remains intentionally **not** marked passed from this web/GitHub executor surface. `W3 = PASS` requires the target-machine ChatGPT Desktop app to discover/install the local plugin through the documented Work/Codex repo marketplace surface, run the complete mission through the shipped plugin/MCP path in a fresh Desktop conversation, restart, resume the exact durable run from a second fresh conversation and preserve final reproduction references.

## Remaining acceptance

Next, on the exact target-machine candidate run the actual-evidence workload and review its public-safe resource/immutability report. If and only if that passes, run the Desktop repository preflight from `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md`. Then fully restart ChatGPT Desktop, open the trusted repository in Work mode or Codex, install `Market Flow US Local` -> `market-flow-us-researcher`, and execute the real fresh-chat Desktop mission plus restart/resume proof.

If the actual-evidence workload fails, perform RCA against the real measurement before changing resource policy; do not widen concurrency/timeouts/budgets merely to make the gate pass. If repository preflight passes but the documented Desktop marketplace/plugin surface is absent or the local MCP app cannot launch on the actual Desktop build/account, record the exact public-safe external-product blocker without weakening source, phase, transport or security boundaries.
