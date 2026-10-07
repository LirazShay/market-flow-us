# Replay Hardening Audit — TREE 9.6

Status: PASS

This record is public-safe. It contains no credentials, private recordings, authenticated dumps, account identifiers, or browser/session data.

Baseline entering hardening: `243f4f2e78e434378ff2202ba95af7b8626a0369`
Execution branch: `chat-25-replay-hardening`
Verified hardening runtime/test candidate: `52becaaeaddde01457199d17c88dd6ce61c98d42`

## 4.1 Recording boundary

- Files/boundary reviewed: validated Screener snapshot -> `recording-model.js` -> `market-recorder.js` -> store append/failure lifecycle.
- Material risks checked: partial/unvalidated frames, non-deterministic membership/order, provider/validation failure, sensitive metadata, false completion after stop/failure, overlapping recorder lifecycle requests.
- Proof used: existing Replay recording/unit coverage plus `tests/unit/replay-recorder-hardening.test.mjs`.
- Finding/fix: overlapping `start()` / `stop()` or concurrent `start()` calls could cross the asynchronous recording creation boundary. `market-recorder.js` now serializes startup ownership: a second Start fails closed, while Stop requested during pending creation waits for that exact Start to settle, then stops/completes the created recording rather than allowing a late recording to survive the user's Stop.
- Final result: `PASS`.

## 4.2 IndexedDB store/library

- Files/boundary reviewed: `recording-store.js`, recorder append/error paths, library list/read/delete paths and existing quota/storage regressions.
- Material risks checked: atomic append metadata+frame, quota/transaction failure, preservation of prior committed frames, bounded delete, stale async mutation after lifecycle changes.
- Proof used: existing Replay recording/store tests including quota failure preservation, plus recorder lifecycle hardening proof.
- Findings/fixes: no store-format redesign required. Recorder lifecycle serialization closes the material caller-side stale-start/Stop race found during audit.
- Final result: `PASS`.

## 4.3 Portable format / file source

- Files/boundary reviewed: `portable-recording.js`, `recording-source.js`, `player-controller.js`, portable format/unit tests.
- Material risks checked: manifest/frame/footer/version/count/order agreement, malformed/truncated/duplicate/out-of-order input, streaming export, byte-slice file reads, seek boundaries, concurrent source replacement behavior.
- Proof used: existing portable recording tests covering malformed/truncated/wrong-version/count/order failures and seek/read slices, plus `tests/unit/replay-player-controller-source-hardening.test.mjs`.
- Finding/fix: two concurrent source loads could finish out of order and let an older slower load overwrite the newer selected source. Controller source loading is now generation-owned: only the latest load may publish source/error state, while a stale completion is rejected without replacing the current source.
- Final result: `PASS`.

## 4.4 Player / time projection

- Files/boundary reviewed: `market-player.js`, `player-controller.js`, Player lifecycle/error tests and controller tests.
- Material risks checked: exact irregular 1x timing, contemporary local timestamp rebasing with provider facts unchanged, Pause/Resume timing, stale timers/promises/callbacks, ACK gating, terminal completion/error ownership.
- Proof used: existing Player timing/ACK/generation tests plus `tests/unit/replay-hardening-races.test.mjs` and `tests/unit/replay-player-authority-hardening.test.mjs`.
- Finding/fix 1: pausing while the final cycle ACK was in flight could leave the authoritative final frame committed while the Player remained paused. Resume now reconciles that committed terminal frame exactly once.
- Finding/fix 2: an old Player callback could update controller state after the controller had rebuilt around a new Player. `player-controller.js` now generation-guards callbacks and invalidates old ownership on rebuild/detach.
- Finding/fix 3: Pause changed the scheduler generation, so an already-dispatched `acceptUniverse` / `commitCycle` failure could be mistaken for stale scheduling work and silently ignored; a quick Resume could also schedule duplicate authoritative emission while the prior ACK was unresolved. Player now separates scheduling generation from authority generation, tracks the in-flight authoritative boundary, preserves authoritative failures across Pause, prevents duplicate Resume emission, and still ignores source-read work cancelled before authority dispatch.
- Finding/fix 4: Stop/Seek now invalidate authority synchronously, and a late session-start completion performs bounded stale-session cleanup rather than reviving a terminal lifecycle. Direct regression proof covers Stop during pending `startSession`.
- Final result: `PASS`.

## 4.5 Replay Host / lifecycle / security

- Files/boundary reviewed: `replay-host/host.js`, Host security/client boundary, `replay-run-coordinator.js`, Host service tests.
- Material risks checked: loopback-only control, exact Origin, ephemeral credential, unauthorized mutation rejection, owned child/DB cleanup only, occupied foreign port fail-closed, Stop->Play/Seek fresh authority, live DB isolation, cleanup/startup races.
- Proof used: existing Host security/isolation/foreign-port tests plus `tests/service/replay-host-race.test.mjs` and coordinator race proof in `tests/unit/replay-hardening-races.test.mjs`.
- Finding/fix 1: concurrent Host start/stop requests could observe `activeRun === null` during child startup and allow a late-starting child to survive Stop. Host lifecycle mutations are now serialized.
- Finding/fix 2: a stale browser coordinator generation could execute cleanup after a newer generation had already created a run. Coordinator transitions are now serialized while preserving synchronous viewer opening for browser user activation.
- Verification correction: the first Host race regression used two event-loop turns as a startup assumption and was itself nondeterministic. It was corrected to wait on the exact fake-child spawn boundary before asserting Stop ordering; the runtime Host fix was unchanged.
- Final result: `PASS`.

## 4.6 Shared service/protocol boundary

- Files/boundary reviewed: shared request types, ProducerBridge Replay proof, service entry/config seams, Replay composition/build.
- Material risks checked: `replayMode`, virtual clock, load-recording, seek/reset, hidden preroll/fast-forward leaking into shared authority.
- Proof used: existing shared-protocol and real ProducerBridge/service Replay tests.
- Findings/fixes: Replay remains an external producer lane; no Replay-specific shared protocol operation was found or added.
- Final result: `PASS`.

## 4.7 Product surfaces over arbitrary Replay start

- Files/boundary reviewed: Replay reclosure/service proof for Current, History, Scanner and Demo Buy over arbitrary/middle-frame start.
- Material risks checked: zero preroll, missing earlier anchors/history, progressive history, Detail/current coherence, Demo Buy baseline/future-horizon behavior from replayed authoritative cycles.
- Proof used: existing Replay reclosure/service tests and Replay acceptance contract.
- Findings/fixes: no Replay-specific synthesis or product-surface special mode required.
- Final result: `PASS`.

## 4.8 Packaging / diagnostics / operator path

- Files/boundary reviewed: `scripts/build-replay-browser.mjs`, Replay launcher, Replay docs/build tests, package scripts and CI workflows.
- Material risks checked: dedicated Replay bundle/launcher, unchanged ordinary launch semantics, public-safe diagnostics, actionable lifecycle failures, explicit execution of the hardening contract commands.
- Proof used: existing Replay build/package tests plus new `.github/workflows/replay-ci.yml` running `npm run build:replay` and `npm run test:acceptance:replay` directly.
- Findings/fixes: the existing repository CI covered unit/service/full Browser behavior but did not run the two Replay contract commands as exact named gates. A focused Replay CI workflow was added instead of overloading Fast CI.
- Final result: `PASS`.

## Verification evidence

Exact runtime/test candidate:

```text
52becaaeaddde01457199d17c88dd6ce61c98d42
```

Green PR runs on that SHA:

```text
Planning Docs #625  — success
Workload #269       — success
Fast CI #483        — success
Replay CI #12       — success
Browser CI #441     — success
```

The required hardening commands are therefore covered explicitly:

```text
npm run build:replay             -> Replay CI #12
npm run test:acceptance:replay   -> Replay CI #12
npm run test:unit                -> Fast CI #483
npm run test:service             -> Fast CI #483
```

Browser CI #441 also passed full Chromium E2E plus bounded Local Fake acceptance. Workload #269 and Planning Docs #625 passed on the same candidate.

## Additional verification defect repaired

Planning Docs initially exposed a parser defect in `.planning/verify-handoff.mjs`: the allocated execution regex required a trailing newline after the final node line, so a valid EOF after Chat 27 made node `7.4` appear unallocated. The validator now accepts either newline or EOF for the final node. No allocation, dependency, authorization or execution semantics were changed.

## Final review findings

Final PR diff review before closure found and repaired two additional material lifecycle gaps rather than accepting earlier green CI as sufficient:

1. Stop during Recorder creation was rejected instead of owning the pending Start; this could allow the old Start to finish as a live recording after the user's Stop. The lifecycle and regression were corrected.
2. Concurrent source loads could publish out of order; latest-load generation ownership now prevents stale source replacement.

The same review also identified missing direct proof for late Player `startSession` completion after Stop; deterministic regression coverage was added. All five repository gates then passed again on the exact final runtime/test candidate above.

## Final status

- Mandatory static/adversarial audit areas: all `PASS`.
- Blocking Replay defects found: recorder lifecycle overlap/Stop-during-startup; final-ACK Pause completion; stale controller callback; stale concurrent source load; coordinator stale cleanup race; Host start/stop startup race; Pause/in-flight authority failure/duplicate-emission race; late Player session-start ownership.
- Root-cause fixes: implemented.
- Deterministic regressions: implemented and green.
- Shared protocol/server: remains Replay-unaware.
- Arbitrary-start / next-day / product-surface closure: green through Replay acceptance and existing service proof.
- Required executable proof: green on `52becaaeaddde01457199d17c88dd6ce61c98d42`.
- Known material untested Replay risk: none remaining from this hardening audit.
- Overall result: `PASS`.
