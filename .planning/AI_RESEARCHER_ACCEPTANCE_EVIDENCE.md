# AI Researcher acceptance evidence

This file is the public-safe TREE `11.8` acceptance ledger for representative workload and current-desktop reclosure.

It records only synthetic/public-safe measurements and GitHub verification identifiers. It must never contain credentials, cookies, session material, account identifiers, private browser data or authenticated dumps.

## Gate disposition

| Gate | Status | Evidence |
|---|---|---|
| `W1` deterministic reduced CI workload | `PASS` | Workload CI run `38358501031`, job `115166877682`, `ci-256` Research resource probe. |
| `W2` representative 4,096-security synthetic workload | `PASS` | One-time PR verification run `38358501349`, job `115166878192`, artifact `11793616887`, `target-4096` Research resource probe. |
| `W3` current target-machine/Desktop acceptance | `PENDING_TARGET_MACHINE` | Current official OpenAI Plugin docs support repo/local marketplaces and local MCP apps in ChatGPT Desktop. Repo/local marketplace discovery is specifically documented through Work mode or Codex inside ChatGPT Desktop; the repo ships the marketplace, deterministic target-machine preflight and exact Desktop runbook, but the real target-machine mission/restart proof still must be executed in Desktop. |

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
- added `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md` with the exact current target-machine preflight, Work/Codex marketplace discovery path, fresh-chat mission, Desktop/server restart proof and public-safe evidence rules;
- added `npm run research-desktop:preflight`, backed by `scripts/check-research-desktop-preflight.mjs`, to prove the actual target-machine prerequisites that Desktop inherits: repo marketplace/package coherence, real market evidence presence, PATH-visible `market-flow-us-research-mcp`, real `stdio` initialization, 46-tool discovery and the data/instruction boundary;
- added deterministic unit and real-process integration regressions for the preflight contract.

### Executor boundary for the real Desktop gate

The GitHub/web execution surface used to implement PR `#110` cannot inspect or control the user's local ChatGPT Desktop process, its local repository workspace, inherited Windows `PATH`, Desktop Work/Codex repository context, Plugin Directory UI, plugin installation state, Desktop restart, or a second fresh local conversation. That is an execution-environment boundary, **not** evidence that the Desktop product path is broken.

The current web Plugin Directory visible to this executor does not expose the repo-local `market-flow-us-researcher`; that is expected because local marketplaces are separate Desktop sources rather than universal public-directory entries. It must not be interpreted as a plugin-discovery failure on the target Desktop machine.

Accordingly, this executor must not fabricate `W3 = PASS`. The repository now makes the first target-machine step deterministic:

```text
npm ci
npm link
npm run research-desktop:preflight
```

A passing preflight proves the repository/machine MCP prerequisites before the real Desktop run and intentionally reports `desktopAcceptance = STILL_REQUIRED`. Only after that pass should a Desktop-specific failure be classified as a target-client blocker.

The real W3 acceptance remains intentionally **not** marked passed from this web/GitHub executor surface. `W3 = PASS` requires the target-machine ChatGPT Desktop app to discover/install the local plugin through the documented Work/Codex repo marketplace surface, run the complete mission through the shipped plugin/MCP path in a fresh Desktop conversation, restart, resume the exact durable run from a second fresh conversation and preserve final reproduction references.

## Remaining acceptance

Next, on the target machine run the three-command repository preflight from `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md`, then in ChatGPT Desktop open the trusted repository in Work mode or Codex, install `Market Flow US Local` -> `market-flow-us-researcher`, and execute the real fresh-chat Desktop mission plus restart/resume proof. If repository preflight passes but the documented Desktop marketplace/plugin surface is absent or the local MCP app cannot launch on the actual Desktop build/account, record the exact public-safe external-product blocker without weakening source, phase, transport or security boundaries.
