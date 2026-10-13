# Market Flow US — ChatGPT Desktop Research Acceptance

Status: post-merge non-blocking target-machine/Desktop acceptance runbook for `B-US-009`.

This runbook preserves the exact real-machine acceptance that was originally inside TREE `11.8`. On 2026-10-13 the user explicitly changed the completion policy so this acceptance no longer blocks the Branch-11 implementation merge. `W2T` and `W3` remain pending until actually executed; this deferral must never be represented as PASS.

## Current OpenAI surface decision — 2026-10-13

Current official OpenAI Plugin documentation supports repo/local plugin marketplaces in the ChatGPT desktop app and permits a plugin to bundle a local MCP app that runs on the user's computer. Local MCP apps are desktop-only; saving such a plugin to the account does not make the local tools available on web or mobile.

The current OpenAI packaging documentation is more specific about repository discovery: repo/local marketplaces are exposed from a trusted repository in **Work mode or Codex inside the ChatGPT desktop app**. Use that Desktop surface to discover/install the local plugin. After installation, run the acceptance only in a Desktop conversation/surface where the installed plugin is actually available; do not treat ChatGPT web as an equivalent local-MCP client.

Official product references checked for this reclosure:

- `https://developers.openai.com/plugins/build/plugins`
- `https://help.openai.com/en/articles/20001256-plugins-in-chatgpt`

Therefore the `B-US-009` acceptance path is:

```text
fresh intended main candidate + existing Market Flow US evidence
→ target-machine actual-evidence Research workload
→ repo-local Desktop/MCP preflight
→ ChatGPT Desktop Work mode or Codex with trusted repo
→ repo marketplace `.agents/plugins/marketplace.json`
→ install local `market-flow-us-researcher` Agent Plugin
→ bundled `stdio` MCP declaration
→ `market-flow-us-research-mcp` executable on the target machine
→ Desktop conversation with installed plugin available
→ Research Server / Research Ledger
→ immutable Market Flow US historical evidence
→ full Desktop/MCP restart
→ second fresh Desktop conversation resumes exact durable Research Run
```

A public HTTPS MCP endpoint or Secure MCP Tunnel remains a valid remote/private-network connection option, but it is **not required** for the intended same-machine Desktop acceptance path.

This supersedes the earlier TREE `11.6` assumption that ChatGPT connectivity necessarily required HTTPS or Secure MCP Tunnel. The Research Domain, MCP tool registry and `stdio` transport remain valid; only the target-client installation/discovery path changed.

## Repository-owned installation surface

The repository exposes the plugin through:

```text
.agents/plugins/marketplace.json
plugins/market-flow-us-researcher/plugin.json
plugins/market-flow-us-researcher/mcp.json
```

The marketplace entry is intentionally `AVAILABLE`, not silently installed. The user must explicitly install the local plugin in ChatGPT Desktop.

The bundled MCP command is:

```text
market-flow-us-research-mcp
```

The repository `package.json` owns that executable through its `bin` mapping.

## Target-machine order

When `B-US-009` is activated, fetch fresh `main` and use the latest intended candidate unless repository truth explicitly says otherwise. Do not mix measurements from an older checkout with Desktop acceptance from a newer one.

Run in this order:

```bash
npm ci
npm run research-target:workload
npm link
npm run research-desktop:preflight
```

The two commands after `npm ci` are distinct acceptance gates:

1. `research-target:workload` measures the managed Research path against **existing target-machine Market Flow US historical evidence**.
2. `research-desktop:preflight` verifies the repository/machine/plugin/MCP prerequisites that ChatGPT Desktop will inherit.

Do not skip directly to Desktop because the synthetic `W2` workload passed in CI. `B-US-009` separately requires actual target-machine wall-clock/RAM/disk/concurrency/result-size evidence.

## W2T — actual-evidence workload

Run:

```bash
npm run research-target:workload
```

The runner must use already-existing product evidence. It intentionally has no synthetic fallback.

A passing report is written to:

```text
test-results/acceptance/research-target-evidence.json
```

The report is public-safe and must show `result = pass` before continuing to Desktop preflight. It records:

- selected source count/kinds/schema versions without filesystem paths;
- wall-clock duration;
- Strategy Sandbox and Research SQL durations;
- Result Handle row and serialized-byte sizes;
- Research Ledger/temp-directory disk bytes;
- RSS before/after/delta and max RSS;
- CPU user/system usage;
- effective managed concurrency policy;
- duplicate-pressure idempotency (`16` submissions -> one durable Job / one Experiment);
- durable Result Handle reads after managed-domain close/reopen;
- source fingerprint and byte-size equality before/after;
- `desktopAcceptance = STILL_REQUIRED`.

The source selection is cadence-agnostic: it derives an eligible real `T0` from complete-cycle chronology rather than assuming a fixed number of cycles inside the 10-second horizon.

If this workload fails, stop before Desktop acceptance and perform RCA on the real target-machine failure. Do not widen concurrency, timeouts, result budgets or DuckDB limits simply to make the gate pass. Any tuning must be justified by the measured report and then reverified.

Never paste source paths, raw market rows, provider/session material, credentials, environment dumps or private machine data into the acceptance ledger.

## Desktop/MCP repository preflight

After `W2T` passes, make the executable visible to the Desktop process with `npm link`, then run:

```bash
npm run research-desktop:preflight
```

The preflight is repository-owned and public-safe. It verifies before opening Desktop that:

- the repo marketplace resolves the intended local Plugin;
- Plugin/MCP/package manifests agree on the `stdio` executable;
- the intended data directory contains usable DuckDB market evidence;
- `market-flow-us-research-mcp` is actually visible through the inherited `PATH`;
- a real `stdio` initialize/tool-discovery call negotiates the expected MCP protocol, exposes the exact expected 46-tool registry and preserves the data/instruction boundary.

A passing report is written to `test-results/acceptance/research-desktop-preflight.json` and still contains `"desktopAcceptance": "STILL_REQUIRED"`. This preflight is not a substitute for ChatGPT Desktop acceptance.

Expected preflight indicators before opening Desktop:

```text
result = pass
mcp.pathVisible = true
mcp.toolCount = 46
mcp.requiredToolsPresent = true
mcp.dataBoundary = true
desktopAcceptance = STILL_REQUIRED
```

If it fails, use the stable `error.code` to diagnose the repository/machine prerequisite. Do not paste filesystem paths, environment dumps, credentials, browser state or session material into acceptance evidence.

After changing PATH-visible npm links or marketplace/plugin files, fully restart ChatGPT Desktop before testing so the desktop process sees the current executable and marketplace snapshot.

## W3 preflight

Only after both `W2T` and the repository Desktop/MCP preflight pass:

1. Confirm the checkout is still the exact candidate commit being accepted.
2. Fully restart ChatGPT Desktop.
3. In ChatGPT Desktop, open the trusted Market Flow US repository in **Work mode or Codex**, the current documented local-marketplace discovery surfaces.
4. Open the Plugins Directory, select the `Market Flow US Local` marketplace, and explicitly install `market-flow-us-researcher`.
5. Move to a fresh Desktop conversation/surface where the installed plugin is available and verify that it exposes its Research skill and local MCP tools. Do not use ChatGPT web as a substitute for this local-MCP gate.
6. Do not add credentials, provider sessions, browser data or broker/account data to the plugin.

If repository preflight passes but the plugin does not appear in the documented Desktop Work/Codex marketplace surface, the installed plugin is unavailable to a Desktop conversation, or its local MCP app cannot launch, record the exact Desktop build/surface, visible marketplace/install state and public-safe error code/text. That is a target-client acceptance failure. Do not work around it by exposing the Research Server to `0.0.0.0`, weakening localhost/source boundaries or copying private browser/auth data into diagnostics.

## W3 acceptance mission

Run the acceptance in a **fresh Desktop conversation** where the installed plugin is available. If the product requires explicitly selecting or mentioning the installed plugin for that conversation, do so through the normal Desktop plugin UI; do not copy tool output or hidden state from an earlier conversation.

The mission must demonstrate the actual shipped integration rather than direct Node scripts:

1. Ask the plugin to describe the Research environment and bootstrap from durable state without assuming chat history.
2. If no resumable Research Run exists, provide one explicit short-horizon U.S.-equity upward-momentum research objective and create the run through the plugin's managed tools.
3. Inspect evidence inventory/coverage/cadence and the machine-readable Research SQL schema on demand.
4. Perform autonomous multi-step Development research using both managed Research SQL and authoritative Scanner experiments.
5. Exercise bounded Result Handle paging and inspect at least one experiment drill-down/diagnostic path.
6. Use server-enforced Validation and, when the run reaches the required authority state, Sealed Holdout exactly through the shipped tools; never emulate those phases in prompt text.
7. Obtain a durable final recommendation artifact containing copy/paste Scanner SQL or explicit `NO_RECOMMENDATION`, with objective, denominators, robustness/phase state, limitations and reproduction references.

The model may choose hypotheses and investigation order. The acceptance must not prescribe a fixed strategy formula or score.

## Restart / fresh-context proof

Before declaring W3 complete:

1. Record the public-safe `researchRunId` and durable artifact/job/result references needed for verification.
2. End the first conversation and fully restart ChatGPT Desktop so the local MCP process is also recreated.
3. Start a second fresh Desktop conversation where the installed plugin is available.
4. Ask it to continue the exact run by `researchRunId`, with no copied chat transcript or hidden context.
5. Verify the Resume Capsule reconstructs the current objective/phase/artifacts/jobs from the Research Ledger.
6. Read at least one previously durable Analysis or Result Handle after restart.
7. Verify the final recommendation/reproduction references remain stable.

## Required evidence record

Record only public-safe acceptance facts in `.planning/AI_RESEARCHER_ACCEPTANCE_EVIDENCE.md`:

- candidate commit;
- actual-evidence workload result and target resource measurements;
- source fingerprint/byte-size immutability result;
- Desktop/MCP preflight result and stable failure code if any;
- ChatGPT Desktop build/surface used;
- plugin marketplace/install result;
- local MCP startup/tool-discovery result;
- Research Run ID and sanitized durable artifact/job/result IDs;
- fresh-chat bootstrap result;
- restart/resume result;
- final SQL vs `NO_RECOMMENDATION` disposition;
- any exact public-safe blocker.

Never record credentials, cookies, authorization headers, session/account identifiers, private browser state or raw authenticated dumps.

## Pass / blocked rules

`W2T = PASS` only after `npm run research-target:workload` passes on the intended target-machine candidate against existing intended historical evidence and its public-safe measurements/immutability evidence are reviewed.

`W3 = PASS` only when `W2T` is already green, the repository Desktop/MCP preflight passes, and the real Desktop plugin path completes the mission and restart/fresh-context proof above.

If the current Desktop product does not expose the documented local marketplace/plugin surface on the target account/build, or the installed local MCP app cannot launch despite a passing repository preflight, record the exact external-product blocker and leave `W3` open/blocked. Do not substitute direct MCP scripts, web ChatGPT, Codex-only execution or a synthetic adapter test for the required Desktop acceptance.

## Branch-11 relationship

This runbook is intentionally **post-merge and non-blocking** for Branch 11 implementation completion. Its criteria are not weakened; only their sequencing changed. The source of truth for activating this work later is `backlog/B-US-009-ai-researcher-target-machine-desktop-acceptance.md`.