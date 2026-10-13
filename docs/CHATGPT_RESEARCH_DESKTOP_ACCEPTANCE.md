# Market Flow US — ChatGPT Desktop Research Acceptance

Status: TREE `11.8` target-machine acceptance runbook.

## Current OpenAI surface decision — 2026-10-13

Current official OpenAI Plugin documentation supports repo/local plugin marketplaces in the ChatGPT desktop app and permits a plugin to bundle a local MCP app that runs on the user's computer. Local MCP apps are desktop-only; saving such a plugin to the account does not make the local tools available on web or mobile.

The current OpenAI packaging documentation is more specific about repository discovery: repo/local marketplaces are exposed from a trusted repository in **Work mode or Codex inside the ChatGPT desktop app**. Use that Desktop surface to discover/install the local plugin. After installation, run the acceptance only in a Desktop conversation/surface where the installed plugin is actually available; do not treat ChatGPT web as an equivalent local-MCP client.

Official product references checked for this reclosure:

- `https://developers.openai.com/plugins/build/plugins`
- `https://help.openai.com/en/articles/20001256-plugins-in-chatgpt`

Therefore the preferred TREE `11.8` acceptance path is now:

```text
ChatGPT Desktop Work mode or Codex with trusted repo
→ repo marketplace `.agents/plugins/marketplace.json`
→ install local `market-flow-us-researcher` Agent Plugin
→ bundled `stdio` MCP declaration
→ `market-flow-us-research-mcp` executable on the target machine
→ Desktop conversation with installed plugin available
→ Research Server / Research Ledger
→ immutable Market Flow US historical evidence
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

The repository `package.json` owns that executable through its `bin` mapping. On a development checkout, make the executable available to the desktop process before acceptance:

```bash
npm ci
npm link
npm run research-desktop:preflight
```

The preflight is repository-owned and public-safe. It verifies before opening Desktop that:

- the repo marketplace resolves the intended local Plugin;
- Plugin/MCP/package manifests agree on the `stdio` executable;
- the intended data directory contains DuckDB market evidence;
- `market-flow-us-research-mcp` is actually visible through the inherited `PATH`;
- a real `stdio` initialize/tool-discovery call exposes the expected 46-tool registry and data/instruction boundary.

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

On the target machine and intended repository checkout:

1. Use the exact candidate commit/branch being accepted.
2. Run `npm ci`.
3. Run `npm link` so `market-flow-us-research-mcp` is available on `PATH`.
4. Confirm the intended Market Flow US historical evidence is present in the repository-owned/default data location, or set only the supported absolute-path overrides documented in `docs/CHATGPT_RESEARCH_PLUGIN.md`.
5. Run `npm run research-desktop:preflight` and require a `pass` report with 46 tools. Fix any repository/machine prerequisite failure before blaming Desktop.
6. Fully restart ChatGPT Desktop.
7. In ChatGPT Desktop, open the trusted Market Flow US repository in **Work mode or Codex**, the current documented local-marketplace discovery surfaces.
8. Open the Plugins Directory, select the `Market Flow US Local` marketplace, and explicitly install `market-flow-us-researcher`.
9. Move to a fresh Desktop conversation/surface where the installed plugin is available and verify that it exposes its Research skill and local MCP tools. Do not use ChatGPT web as a substitute for this local-MCP gate.
10. Do not add credentials, provider sessions, browser data or broker/account data to the plugin.

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
- preflight result and stable failure code if any;
- ChatGPT Desktop build/surface used;
- plugin marketplace/install result;
- local MCP startup/tool-discovery result;
- Research Run ID and sanitized durable artifact/job/result IDs;
- fresh-chat bootstrap result;
- restart/resume result;
- representative wall-clock/RAM/disk/result-size observations if available from the target-machine workload;
- source fingerprint/immutability result;
- final SQL vs `NO_RECOMMENDATION` disposition;
- any exact public-safe blocker.

Never record credentials, cookies, authorization headers, session/account identifiers, private browser state or raw authenticated dumps.

## Pass / blocked rules

`W3 = PASS` only when the repository preflight passes and the real Desktop plugin path completes the mission and restart/fresh-context proof above.

If the current Desktop product does not expose the documented local marketplace/plugin surface on the target account/build, or the installed local MCP app cannot launch despite a passing repository preflight, record the exact external-product blocker and leave `W3` open/blocked. Do not substitute direct MCP scripts, web ChatGPT, Codex-only execution or a synthetic adapter test for the required Desktop acceptance.
