# Replay Perfection Reclosure — Planning Handoff

Status: READY_FOR_FOCUSED_REPLAN

Branch: `plan/replay-perfection-reclosure`
Base main SHA: `f956cc9b7f294066ef1e75d08c99c04abc97e3fb`

## Why this focused replan exists

The user explicitly paused the broader test-system hardening replan and requested that immediate work focus only on Market Recording + Replay until that component is made as strong as practical. The broader test-system work is preserved separately on `plan/test-system-hardening-replan` and must not be resumed during this focused Replay work.

The prior Replay implementation/hardening is strong historical evidence and must be reused, not repeated mechanically:

- TREE `9.1`–`9.5` implemented Recording + Replay.
- TREE `9.6` completed an adversarial hardening audit.
- `.planning/REPLAY_HARDENING_AUDIT.md` is PASS and records the earlier races/cleanup defects that were already found and fixed.
- TREE `7.6.3` later performed an independent Recording/Replay/Host deep audit and found/fixed an additional Host-owned-run cleanup defect.

Do **not** reopen or rewrite `9.6` history. New findings discovered after those PASS records require a new reclosure extension.

## Current planning decision

Create a new focused Replay reclosure leaf under branch `9`, provisionally:

```text
9.7 — Replay final perfection reclosure
```

This is not yet authoritative TREE truth. The next chat must complete a focused S&T review, promote the smallest correct TREE/contract/status changes, freeze/re-authorize according to framework rules, then implement.

The intent is one focused implementation leaf unless review proves decomposition is necessary. Avoid creating a new subsystem or replay rewrite.

## Mandatory newly discovered finding

`replay-host/host.js` currently contains:

```js
const exited = once(child, "exit").then(() => true);
child.kill("SIGTERM");
if (await Promise.race([exited, delay(CHILD_STOP_TIMEOUT_MS).then(() => false)])) return;

child.kill("SIGKILL");
if (await Promise.race([exited, delay(CHILD_STOP_TIMEOUT_MS).then(() => false)])) return;
```

Root problem: if `exited` wins, the losing `delay(5000)` timer remains referenced and can keep the Node process alive for roughly five seconds. This is a production lifecycle defect, not merely a slow test.

Required closure:

```text
root cause
→ smallest production fix
→ deterministic regression that fails old behavior without a long real sleep
→ analogous timer/process-lifecycle sweep
→ affected Replay unit/service/build/acceptance verification
→ runtime before/after evidence
```

Do not solve it by increasing timeouts/retries or by test-only bypasses.

## Replay-focused verification/topology finding

Current `package.json`:

```text
test:acceptance:replay
= Replay unit + Replay service + four Replay Playwright specs
```

Current Replay CI runs `build:replay` then `test:acceptance:replay`.

Current Fast CI path filters include `browser/**`, `shared/**`, `local-service/**`, `tests/unit/**`, `tests/service/**`, etc., but **do not include `replay-host/**`**. Therefore Replay lower-layer unit/service proof must not simply be removed from Replay CI unless authoritative lower-layer ownership/path routing is first made complete and same-candidate release evidence remains fail-closed.

Within this Replay-focused reclosure, improve Replay-specific recurring proof only where safe. Do not absorb the broader non-Replay test-system project.

## Replay-focused audit scope

Re-read the current implementation/tests on fresh main for:

```text
validated Screener snapshot boundary
→ Recorder
→ IndexedDB store/library
→ portable format/export/parser/file source
→ source abstraction / seek
→ Player scheduler / generation / ACK / timestamp projection
→ ProducerBridge
→ Replay UI / controller / coordinator
→ Replay Host security / child lifecycle / replay DB ownership
→ unchanged market service boundary
→ arbitrary-start Current / Detail-History / Scanner / Demo Buy behavior
→ build / launcher / diagnostics
→ Replay-specific tests/helpers/CI routing
```

Audit normal, failure, restart/recovery, lifecycle, race/concurrency, security/privacy, malformed input, cleanup, missing-history and diagnosability paths.

Also audit Replay test code itself for:

- duplicate/stale tests or helpers;
- unowned `skip`, `todo`, `.only`;
- retry-based flake masking;
- arbitrary real sleeps when deterministic gates/fake time are possible;
- weak assertions;
- cleanup/resource leaks;
- oversized/non-deterministic fixtures;
- over-mocking where real service/process/storage integration is authoritative;
- poor failure diagnostics.

## Explicit non-goals

Do not pull in unrelated broad-test-system work unless Replay correctness strictly requires it:

- general Browser FR-7/FR-8 Local Acceptance deduplication;
- non-Replay service-suite-wide profiling;
- non-Replay product coverage audit;
- IBKR/Order/Demo Buy/AI general test refactors;
- speculative Replay features such as new speeds, preroll, server replay mode, cloud sync, new Replay DB authority.

`docs/MARKET_REPLAY.md` remains the product behavior contract. `docs/REPLAY_HARDENING.md` remains the established hardening contract and should be extended only if a newly discovered risk needs durable wording.

## Required historical evidence to read before changing code

- `AGENTS.md`
- `STATUS.yaml`
- `.planning/STATUS.yaml`
- `.planning/TREE.yaml` branch `9`, especially `9.1`–`9.6`
- `docs/MARKET_REPLAY.md`
- `docs/REPLAY_HARDENING.md`
- `.planning/REPLAY_HARDENING_AUDIT.md`
- `.planning/PRE_ACCEPTANCE_CODE_AUDIT_REPORT.md` section for `7.6.3`
- `package.json`
- `.github/workflows/replay-ci.yml`
- `.github/workflows/fast-ci.yml`
- current Replay implementation/tests only as routed by the review

## Broad test-system work is paused elsewhere

The broader replan is preserved on:

```text
plan/test-system-hardening-replan
```

with durable checkpoint:

```text
.planning/TEST_SYSTEM_HARDENING_PAUSE.md
.planning/REPLAY_PERFECTION_REPLAN.md
```

When Replay work is eventually merged, the broader replan must reconcile and reuse that merged Replay evidence rather than repeat already-closed work.

## Next action for the next chat

1. Fetch fresh `main` and verify its SHA.
2. Read this handoff and the mandatory historical Replay evidence above.
3. Perform a focused coherent-slice + outside-in S&T review for the new Replay reclosure.
4. Decide whether one new leaf `9.7` is sufficient; prefer one leaf unless evidence proves multiple independent outcome boundaries are required.
5. Update the smallest planning artifacts/TREE/status/contracts needed; do not erase completed historical nodes.
6. Run final planning review/freeze/no-drift/allocation/handoff simulation as required by the installed framework.
7. Only after implementation authorization, implement the timer lifecycle fix plus any additional Replay defects/gaps discovered by the audit.
8. Run focused Replay proof, affected CI, full RCA for every warning/error, PR review/merge/main-green/open-PR audit, and pin exact candidate.

The user wants the Replay/Recording component completed first; all unrelated broad test-system work stays paused until they explicitly return to it.
