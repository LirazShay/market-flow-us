# Replay Hardening Audit — TREE 9.6

Status: IN PROGRESS

This record is public-safe. It contains no credentials, private recordings, authenticated dumps, account identifiers, or browser/session data.

Baseline entering hardening: `243f4f2e78e434378ff2202ba95af7b8626a0369`
Execution branch: `chat-25-replay-hardening`
Current branch head at initial audit capture: `5960880789566b5c5cda1f5417ceb370a5bf2da2`

Final `PASS` is intentionally withheld until the executable gates in `docs/REPLAY_HARDENING.md` are green on the candidate SHA.

## 4.1 Recording boundary

- Files/boundary reviewed: validated Screener snapshot -> `recording-model.js` -> `market-recorder.js` -> store append/failure lifecycle.
- Material risks checked: partial/unvalidated frames, non-deterministic membership/order, provider/validation failure, sensitive metadata, false completion after stop/failure, overlapping recorder lifecycle requests.
- Proof used: existing Replay recording/unit coverage plus `tests/unit/replay-recorder-hardening.test.mjs`.
- Finding/fix: overlapping `start()` / `stop()` or concurrent `start()` calls could cross the asynchronous recording creation boundary. `market-recorder.js` now serializes recorder lifecycle operations so the second start fails closed and stop waits for the in-flight start before completing.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.2 IndexedDB store/library

- Files/boundary reviewed: `recording-store.js`, recorder append/error paths, library list/read/delete paths and existing quota/storage regressions.
- Material risks checked: atomic append metadata+frame, quota/transaction failure, preservation of prior committed frames, bounded delete, stale async mutation after lifecycle changes.
- Proof used: existing Replay recording/store tests including quota failure preservation, plus recorder lifecycle hardening proof.
- Findings/fixes: no store-format redesign required. Recorder lifecycle serialization closes the material caller-side stale-start race found during audit.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.3 Portable format / file source

- Files/boundary reviewed: `portable-recording.js`, `recording-source.js`, portable format/unit tests.
- Material risks checked: manifest/frame/footer/version/count/order agreement, malformed/truncated/duplicate/out-of-order input, streaming export, byte-slice file reads, seek boundaries, source replacement behavior.
- Proof used: existing portable recording tests covering malformed/truncated/wrong-version/count/order failures and seek/read slices.
- Findings/fixes: no format or parser defect found requiring product code changes.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.4 Player / time projection

- Files/boundary reviewed: `market-player.js`, `player-controller.js`, Player lifecycle/error tests and controller tests.
- Material risks checked: exact irregular 1x timing, contemporary local timestamp rebasing with provider facts unchanged, Pause/Resume timing, stale timers/promises/callbacks, ACK gating, terminal completion/error ownership.
- Proof used: existing Player timing/ACK/generation tests plus `tests/unit/replay-hardening-races.test.mjs`.
- Finding/fix 1: pausing while the final cycle ACK was in flight could leave the authoritative final frame committed while the Player remained paused. `market-player.js` now completes/closes the run on Resume when the final committed sequence has already reached the end.
- Finding/fix 2: an old Player callback could update controller state after the controller had rebuilt around a new Player. `player-controller.js` now generation-guards Player callbacks and invalidates old ownership on rebuild/detach.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.5 Replay Host / lifecycle / security

- Files/boundary reviewed: `replay-host/host.js`, Host security/client boundary, `replay-run-coordinator.js`, Host service tests.
- Material risks checked: loopback-only control, exact Origin, ephemeral credential, unauthorized mutation rejection, owned child/DB cleanup only, occupied foreign port fail-closed, Stop->Play/Seek fresh authority, live DB isolation, cleanup/startup races.
- Proof used: existing Host security/isolation/foreign-port tests plus `tests/service/replay-host-race.test.mjs` and coordinator race proof in `tests/unit/replay-hardening-races.test.mjs`.
- Finding/fix 1: concurrent Host start/stop requests could observe `activeRun === null` during child startup and allow a late-starting child to survive Stop. Host lifecycle mutations are now serialized.
- Finding/fix 2: a stale browser coordinator generation could execute cleanup after a newer generation had already created a run. Coordinator transitions are now serialized while preserving synchronous viewer opening for browser user activation.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.6 Shared service/protocol boundary

- Files/boundary reviewed: shared request types, ProducerBridge Replay proof, service entry/config seams, Replay composition/build.
- Material risks checked: `replayMode`, virtual clock, load-recording, seek/reset, hidden preroll/fast-forward leaking into shared authority.
- Proof used: existing shared-protocol and real ProducerBridge/service Replay tests.
- Findings/fixes: Replay remains an external producer lane; no Replay-specific shared protocol operation found or added.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.7 Product surfaces over arbitrary Replay start

- Files/boundary reviewed: Replay reclosure/service proof for Current, History, Scanner and Demo Buy over arbitrary/middle-frame start.
- Material risks checked: zero preroll, missing earlier anchors/history, progressive history, Detail/current coherence, Demo Buy baseline/future-horizon behavior from replayed authoritative cycles.
- Proof used: existing Replay reclosure/service tests.
- Findings/fixes: no Replay-specific synthesis or product-surface special mode required.
- Final result: `BLOCKED` — static review complete; executable gate pending.

## 4.8 Packaging / diagnostics / operator path

- Files/boundary reviewed: `scripts/build-replay-browser.mjs`, Replay launcher, Replay docs/build tests, package scripts and CI workflows.
- Material risks checked: dedicated Replay bundle/launcher, unchanged ordinary launch semantics, public-safe diagnostics, actionable lifecycle failures.
- Proof used: existing Replay build/package tests; `npm run build:replay` and browser/CI gates still pending for this candidate.
- Findings/fixes: no packaging subsystem change required by static audit.
- Final result: `BLOCKED` — executable build/CI proof pending.

## Executable verification required before PASS

Required by the hardening contract:

```text
npm run build:replay
npm run test:acceptance:replay
npm run test:unit
npm run test:service
```

Materially affected repository gates to verify through PR/main CI include Fast, Browser, Planning, Workload/local acceptance as selected by repository workflow/path rules and the changed files.

## Open status

- Static/adversarial audit: complete for all mandatory areas.
- Blocking defects found: recorder lifecycle overlap; final-ACK Pause completion; stale controller callback; coordinator stale cleanup race; Host start/stop startup race.
- Root-cause fixes: implemented on the execution branch.
- Deterministic regressions: added on the execution branch.
- Executable verification: pending.
- Final hardening candidate SHA: pending executable green + final evidence update.
- Overall result: `BLOCKED` until all required executable proof is green.
