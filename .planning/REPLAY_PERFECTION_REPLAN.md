# Replay Focus Extraction from Paused Test-System Replan

Status: extracted_for_separate_focused_replan

This file records exactly which findings from the paused broad test-system hardening replan belong to Market Recording + Replay and therefore must be carried into the separate Replay-focused reclosure.

Carry forward:

1. Replay Host lifecycle defect: `stopOwnedChild()` races child exit against `delay(CHILD_STOP_TIMEOUT_MS)`; when child exit wins, the losing referenced timeout remains alive and can retain the Node process for roughly five seconds. Fix the production lifecycle root cause, add a regression that fails the old behavior without a long real sleep, and perform an analogous timer/process-lifecycle sweep.
2. Replay recurring proof ownership: Replay CI currently reruns Replay unit/service proof through `test:acceptance:replay`; Fast CI does not include `replay-host/**` in its trigger paths. Any deduplication is legal only after lower-layer ownership is explicit and all relevant Replay/Host/shared/helper/config changes trigger the authoritative lower-layer proof.
3. Replay test-system hygiene: audit Replay-specific tests/helpers for stale/duplicate assertions, `skip`/`todo`/`.only`, retry-based flake masking, arbitrary sleeps, weak assertions, cleanup leaks, oversized/non-deterministic fixtures and poor failure diagnostics. Preserve real integration where it is the authority.
4. Replay runtime/performance: measure focused Replay acceptance before/after. Remove lifecycle waits/tails and avoidable duplicate lower-layer execution before considering concurrency. Do not increase timeouts/retries/workers as the first optimization.
5. Replay regression completeness: revalidate recorder, IndexedDB store/library, portable format/file source, Player timing/generation/ACK behavior, Host lifecycle/security/foreign-process isolation, arbitrary-start product surfaces, build/launcher/diagnostics and same-candidate CI routing against current `main`.
6. Replay work must remain public-safe and must not add speculative Replay features. `docs/MARKET_REPLAY.md` remains the product behavior contract; `docs/REPLAY_HARDENING.md` and `.planning/REPLAY_HARDENING_AUDIT.md` are strong historical evidence, not proof that newly discovered risks do not exist.

Do not carry into the Replay-focused reclosure unless a Replay-specific dependency proves it necessary:

- general Browser/Local Acceptance FR-7/FR-8 deduplication unrelated to Replay;
- service-suite-wide profiling outside Replay-owned service tests;
- product-wide test coverage audit for non-Replay capabilities;
- general Planning Docs node-count repair except where needed to plan/freeze the Replay-focused extension;
- non-Replay Workload/Order/IBKR/Demo Buy/AI test-system refactors.

When broader `7.7` work resumes, reconcile the merged Replay-focused result and mark already-closed Replay findings as satisfied by the merged evidence rather than reimplementing them.
