# B-US-009 — AI Researcher target-machine + Desktop acceptance

Status: Promoted to active execution  
Blocking: No  
Current execution authority: `.planning/EXECUTION.md`

## Why this exists

On 2026-10-13 the user explicitly decided that the remaining real target-machine and ChatGPT Desktop acceptance for Branch 11 must not block the implementation merge.

Later on 2026-10-13 the user explicitly continued the deferred acceptance work. This record is therefore no longer an active backlog authority: `B-US-009` is allocated in `.planning/EXECUTION.md`, while this file remains provenance/supporting acceptance context. The authoritative `.planning/PLAN.md` already defines this exact post-merge acceptance boundary.

`W2T` and `W3` remain **NOT PASS** until they are actually executed on the user's machine against a fresh intended `main` candidate.

## Scope

Run the complete post-merge acceptance package already shipped by Branch 11:

1. Target-machine actual-evidence Research workload (`W2T`).
2. Local Plugin/MCP machine preflight.
3. Real ChatGPT Desktop plugin installation/discovery.
4. Fresh Desktop autonomous research mission through the shipped Plugin/MCP path.
5. Full Desktop/MCP restart and second-fresh-conversation resume of the exact durable Research Run.
6. Public-safe acceptance evidence capture and any evidence-driven RCA/fix/reverification.

## Candidate policy

Do **not** freeze this acceptance to PR #110's historical head. At every machine-local attempt, fetch fresh intended `main` and accept that current runtime candidate unless repository truth explicitly says otherwise.

## W2T — target-machine actual-evidence workload

Run from the intended checkout after dependency install:

```text
npm ci
npm run research-target:workload
```

Use the existing Market Flow US historical evidence. If the evidence directory is outside the default product location, use only the documented absolute `MARKET_FLOW_US_RESEARCH_MARKET_DATA_DIR` override.

Required evidence includes:

- `result = pass`;
- actual evidence only, with no synthetic fallback;
- wall-clock, RAM/RSS, CPU, disk/Ledger, concurrency and result-size measurements;
- duplicate submissions collapsing to one durable Job/Experiment according to the existing contract;
- durable Experiment and Research SQL Result reads after reopen;
- source fingerprint and bytes unchanged;
- `desktopAcceptance = STILL_REQUIRED`.

A failure requires RCA before changing concurrency, timeouts, memory/disk limits or result budgets.

## Desktop/MCP preflight

Only after W2T passes:

```text
npm link
npm run research-desktop:preflight
```

Require the repository-owned PASS contract including PATH-visible MCP, exact MCP identity/protocol, expected 46-tool surface, required tools, data/instruction boundary and usable Market Flow US evidence. A preflight PASS still does not equal Desktop acceptance.

## W3 — real ChatGPT Desktop acceptance

Using the current repository-owned runbook in `docs/CHATGPT_RESEARCH_DESKTOP_ACCEPTANCE.md`:

- fully restart ChatGPT Desktop after link/marketplace changes;
- open the trusted Market Flow US repository in the supported Desktop repo/local-marketplace surface;
- install `Market Flow US Local` -> `market-flow-us-researcher` explicitly;
- start a fresh Desktop conversation with the installed plugin available;
- bootstrap from durable state without depending on chat history;
- create or resume a Research Run;
- inspect evidence/coverage/cadence and machine-readable Research SQL schema;
- perform autonomous multi-step Development research using managed Research SQL plus authoritative Scanner experiments;
- exercise bounded Result Handle paging and experiment diagnostics;
- use server-enforced Validation and Sealed Holdout when authority permits;
- obtain durable final Scanner SQL or explicit `NO_RECOMMENDATION` with objective, denominators, robustness/phase state, limitations and reproduction references.

## Restart/resume proof

Before W3 can pass:

1. Record the public-safe `researchRunId` and required durable references.
2. End the first conversation and fully restart Desktop/MCP.
3. Open a second fresh Desktop conversation.
4. Resume the exact run by `researchRunId` without copying the previous chat transcript.
5. Verify Resume Capsule reconstruction from the Research Ledger.
6. Read at least one durable Analysis or Result Handle created before restart.
7. Verify final recommendation/reproduction references remain stable.

## Evidence and security

Record only public-safe facts. Never commit or paste credentials, cookies, authorization/session material, account identifiers, private browser state or authenticated dumps.

Completion/status truth now lives in `.planning/EXECUTION.md` and the public-safe evidence ledger. This supporting record must never be used to rewrite unexecuted W2T/W3 as historical PASS.