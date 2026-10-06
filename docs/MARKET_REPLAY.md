# Market Recording + Replay Contract

## Purpose

Market Recording + Replay lets the user capture validated U.S. market snapshots from the authenticated provider page while the local Market Flow US service may be stopped, keep recordings in browser storage, export them to a portable file, and later replay them interactively through the normal producer/service/persistence/read path.

The product goal is a market-media-player experience:

```text
provider snapshots
→ validated browser frames
→ IndexedDB recording and/or portable file
→ Market Player
→ normal ProducerBridge protocol
→ unchanged Market Flow US service
→ isolated replay DuckDB
→ Current / Detail-History / Scanner / Demo Buy / AI Investigation
```

Replay is an external producer/orchestration capability. The Market Flow US server and shared producer protocol remain replay-unaware.

## Hard boundaries

The replay feature MUST NOT add any of the following concepts to the existing Market Flow US service or shared producer protocol:

```text
replayMode
virtualClock
seek
playbackSpeed
fastForward
recordingId
loadRecording
resetReplay
```

The service continues to receive only normal producer messages and persists normal market authority.

A generic defect found by replay may be fixed only when the same defect is valid for normal live acquisition. Such a fix remains generic; it must not special-case replay.

The normal production DB path is never used for replay and is never reset/deleted by replay tooling.

## Recording boundary

Recording authority is the already-validated U.S. browser snapshot boundary, before Node/DuckDB authority.

A committed recording frame contains enough information to reconstruct the same U.S. collection candidate later without storing derived database state:

```text
sequence
validated snapshot timing
recordCount
records
canonical identity/membership evidence
source metadata required by the existing candidate contract
HTTP status / validation facts needed for deterministic reconstruction
```

Only complete validated snapshots become frames. Provider acquisition/validation failure must never create an apparently valid frame.

Recordings MUST NOT contain:

```text
cookies
authentication/session tokens
request auth headers
account identifiers
private DOM/page state
Viewer state
Scanner result state
Demo Buy state
Node-assigned cycle_id/session_id/producer ids
DuckDB dumps
```

Provider market fields remain source-shaped and immutable inside a recording.

## Browser recording library

The recorder uses IndexedDB on the authenticated provider origin and does not require the localhost Market Flow US service to be running.

For each recording the UI exposes at least:

```text
user-visible name
a recording identifier local to the replay feature
original first/last frame time
market duration
frame count
approximate bytes
complete/incomplete status
```

The UI shows browser storage usage/quota when the platform exposes it. Quota estimates are informational, not guarantees.

A storage/quota failure stops further recording safely. Previously committed frames remain readable; older recordings are never silently deleted.

A closed complete recording is immutable except for user-controlled naming metadata.

## Portable file format

The portable format is versioned, UTF-8 and streaming-friendly. Initial format is line-oriented JSON, not one giant JSON document.

Version 1 logical records:

```text
manifest line
frame line 0
frame line 1
...
frame line N-1
footer line
```

### Manifest

The manifest identifies at least:

```text
format = market-flow-us-replay
version = 1
recordingId
frameCount
originalStartedAtMs
originalCompletedAtMs
originalDurationMs
```

### Frame

Each frame line has a strictly increasing zero-based sequence and one complete validated snapshot payload.

### Footer

The footer repeats the format/version/recording identity and expected terminal frame count/sequence. Playback becomes available only after the parser proves manifest/frame/footer agreement.

A malformed JSON line, wrong version/type, sequence gap/duplicate, frame validation failure, manifest/footer disagreement or truncated file fails closed. No partial prefix may masquerade as a complete recording.

Cryptographic signing is not required for the local-only initial format. Structural validation and exact snapshot validation are required.

## Large recording behavior

Export and playback must not require the whole recording to be held in memory.

Preferred export path:

```text
IndexedDB cursor
→ streaming serializer
→ user-selected writable file
```

When browser capability permits direct streaming file creation, use it. A fallback that buffers data may exist only with an explicit safe size bound; oversized recordings must fail visibly rather than exhaust memory.

Selecting an existing portable recording file does not require importing it into IndexedDB first. The file source may build a lightweight frame-position/byte-offset index while validating the file, then read individual frame ranges on demand.

The Player consumes one common source contract implemented by both IndexedDB recordings and validated portable files.

## Playback rate and source timing

Initial playback speed is `1x` only.

The authoritative delay between consecutive replay frames is the recorded difference between their original validated snapshot completion times.

Example:

```text
original frame completion
00:00.000
00:10.140
00:20.082
00:33.401

replay delays
10.140s
9.942s
13.319s
```

Do not replace observed spacing with the configured/nominal polling cadence.

Playback ordering is frame sequence order. Frames are ACK-gated through the normal ProducerBridge path; the next frame must not overtake an unresolved prior producer commit.

## Provider time versus local replay time

Provider/source market values are preserved exactly as recorded, including fields such as:

```text
TradeDateTime
Price
BidRate
AskRate
DailyVolume
ChangePercent
raw provider row
```

Local browser timing that the live path would normally stamp from the current clock is rebased before emission.

For one uninterrupted playback segment:

```text
R0 = original local timestamp of selected first frame
W0 = current wall-clock timestamp when that segment starts
replayLocalTimestamp(x) = W0 + (originalLocalTimestamp(x) - R0)
```

The same offset is applied consistently to every local timestamp derived from the frame/candidate, including as applicable:

```text
universe.loadedAtMs
cycle.startedAtMs
cycle.completedAtMs
chunk.requestStartedAtMs
chunk.receivedAtMs
chunk.completedAtMs
security.chunkReceivedAtMs
security.collectedAtMs
```

Internal duration/order invariants must remain valid.

Original local timing remains recording metadata for fidelity/diagnostics only; it is not sent as current authority during replay.

## Pause and Resume

Pause is media-player pause:

- no new frames are emitted;
- recording position is frozen;
- any scheduled callback from the old player generation is invalidated;
- replay DB and already committed market history stay intact.

Resume begins a new timing segment at the current wall clock. The remaining delay from the paused inter-frame interval is preserved, then subsequent recorded frame gaps continue at `1x`.

Because replay-local timestamps are rebased to current wall time on resume, the service may observe a real gap corresponding to how long playback was paused. This is intentional and keeps Node-owned current timestamps such as Demo Buy `captured_at_ms` coherent without introducing a server virtual clock.

## Stop and later Play

Stop ends the current producer session and closes the current replay run. It does not delete the source recording and the current replay DB may remain readable for inspection after Stop.

A later Play after Stop is **not** an append into that closed replay DB. Before any selected frame is emitted again, Replay Host starts a fresh replay-owned service/DB run at the selected frame boundary. This prevents duplicate or contradictory history when the user restarts from an already-emitted position.

Use Pause/Resume when the user wants to continue the same replay run and retain its accumulated replay authority. Use Stop when the current run is finished; the next Play is a new run.

## Seek

Seek never fast-forwards or pre-rolls earlier market frames.

A seek target resolves deterministically to a real recorded frame boundary, normally the frame at-or-before the selected timeline position.

Seek workflow:

```text
pause/invalidate current Player generation
→ cleanly stop producer when possible
→ Replay Host stops only its replay-owned service child
→ discard/reset only replay-owned DB artifacts
→ restart the unchanged Market Flow US service against a fresh replay DB
→ establish a normal new producer session
→ send the selected frame as the first market frame
→ continue from there at recorded 1x intervals
```

The selected frame is authoritative frame 1 of that replay run. No hidden historical warm-up occurs.

## Missing history after start/seek

Starting replay from the middle of a recording intentionally has no prior replay history.

This must behave exactly like starting the live application in the middle of a real trading day:

- Current becomes available after the first committed cycle;
- History contains only frames actually replayed after the chosen start;
- Scanner anchors that require unavailable earlier observations remain missing/null according to the normal query contract;
- anchors become available naturally after enough replay time elapses;
- Demo Buy can capture only against committed replay authority and future horizons resolve only from later replay cycles.

If a normal surface/query crashes solely because earlier history is absent, classify it as a generic live-start defect and fix it generically. Do not hide it with replay-specific server behavior or fast-forward.

## Replay Host

A small local Replay Host may be added because browser seek/restart requires process/DB lifecycle orchestration without changing the Market Flow US service.

The Host is not a market-data server. Its responsibilities are limited to:

```text
loopback-only control boundary
exact allowed provider Origin
start the existing Market Flow US service entrypoint
pass existing --db / --port / --allowed-origin configuration
select a replay-only DB path
report readiness/failure
stop only the service child process that this Host instance started
reset only replay-owned DB artifacts after that child has exited
```

The Host MUST NOT:

```text
accept market frames for persistence
write DuckDB market tables
translate producer messages
execute Scanner SQL
modify shared producer protocol
attach to or stop a pre-existing/unrelated service process
open/reset/delete the normal live DB
```

The Host owns only child/process resources created by the current Host run. If the intended Market Flow US data port or another required runtime resource is already occupied by a process the Host did not start, startup/seek/reset fails closed with a diagnosable conflict. It must never kill/reuse an unknown process to make Replay work.

Control authorization is mandatory. The Host must reject browser origins other than the exact configured provider Origin and every state-changing control request must require a high-entropy per-run unguessable credential/nonce. The credential is ephemeral and must not be committed, persisted or logged.

The operator path must make that credential usable from a fresh start without weakening it: the dedicated Replay launcher/browser artifact must provide a bounded one-run bootstrap/pairing flow so the authorized Replay UI can obtain/use the credential without storing it in repository files, browser persistence, diagnostics or durable local configuration. The implementation may reuse an existing ephemeral-local-credential pattern; it must not require the user to edit source/config files with the secret. Focused acceptance must prove both successful pairing and rejection before/after the credential is valid.

The normal data service may continue to use its existing loopback port/configuration when run under the Host. The Host control endpoint uses a distinct loopback port/protocol and does not alter the service itself.

## Viewer and product surfaces

Replay uses the existing Viewer/service read surfaces, not a fake/replay-only read model.

The replay composition replaces only the live acquisition producer with the Player producer while reusing normal product surfaces against the isolated replay service DB:

```text
Current
Security Detail / History
Dynamic SQL Scanner
Demo Buy
AI Investigation
```

No Viewer/Scanner SQL operation receives `isReplay` or recording metadata.

## Demo Buy timing contract during replay

The replay design must preserve the existing Demo Buy authority model:

- writer/cycle ordering remains authority;
- `captured_at_ms` is still assigned by the normal Node serialized writer at capture time;
- replayed future market rows use contemporary rebased local collection timestamps;
- future horizon selection therefore remains coherent with capture wall time;
- a pause may create a real wall-clock gap, but no replayed cycle is emitted with intentionally stale day-A local collection time after resume.

Provider/source fields may still describe the original recorded day. They are not used as local replay wall-clock authority.

## Isolation from normal runtime and tests

Replay is opt-in and separately packaged.

Existing ordinary commands retain their current semantics:

```text
RUN_TESTS.cmd
RUN_LOCAL_ACCEPTANCE.cmd
START_DEMO.cmd
START_MARKET_FLOW_US.cmd
```

Normal runtime must not auto-load replay storage/player/host code.

Replay gets its own browser build/entry artifact and operator launcher. Replay-focused deterministic proof may have dedicated npm/CI targets. Existing broad local acceptance must not silently acquire long real-time replay waits.

Timing logic is proved primarily with fake/deterministic clocks; only a short real-wall-clock integration smoke is justified.

## Required deterministic acceptance

### Recorder/storage

Prove:

- multiple complete frames persist in exact order;
- irregular original gaps are preserved;
- same/add/remove membership frames remain reconstructible;
- provider failure cannot create a valid frame;
- stop/restart makes explicit recording boundaries;
- quota/write failure preserves prior committed frames;
- recordings contain no auth/session/account/private-page state.

### Portable file

Prove:

- streaming export path writes a valid multi-frame file;
- manifest/frame/footer agreement is enforced;
- malformed/truncated/wrong-version input fails closed;
- validated file playback does not require IndexedDB re-import;
- seek index resolves deterministic frame boundaries.

### Player timing

Prove:

- first selected frame is rebased to contemporary local time;
- provider market fields remain byte/value-equivalent to the recording;
- irregular original inter-frame intervals reproduce at `1x`;
- Pause freezes recording position;
- Resume preserves the remaining delay and rebases future local timestamps to current wall time;
- stale scheduled frames cannot emit after pause/seek/stop generation change;
- commit ordering remains ACK-gated.

### Stop / restart / seek isolation

Prove:

- Pause/Resume continues the same replay DB/run;
- Stop closes the current replay run and a later Play starts a fresh replay DB before any frame can be re-emitted;
- seek starts from a fresh replay DB;
- no market history from the prior closed/seeked run survives into the new run;
- selected frame is the first committed frame in a new run;
- service/shared producer protocol receive no replay-specific messages;
- Host bootstrap/pairing makes the ephemeral control credential usable without persistence/logging and rejects unauthorized/stale control attempts;
- Host refuses to stop/reuse unrelated processes when the replay data port is occupied;
- the normal live DB path and bytes remain untouched.

### Mid-recording start

From an arbitrary middle frame with no preroll, prove Current, History, built-in staged Scanner and Demo Buy remain valid while earlier anchors are naturally unavailable until enough new replay history exists.

### Next-day replay

Record day-A data and replay under day-B/current wall clock. Prove:

- local collection/cycle timestamps are rebased to day B/current time;
- original provider market fields remain day-A values;
- Scanner temporal queries operate on replay-local `collected_at_ms`;
- Demo Buy capture/future-horizon timing remains coherent;
- no old local timestamp creates false stale/future behavior.

### Non-regression

Required affected Fast/Browser/Planning/Workload proof remains green and ordinary local verification runtime is not materially expanded by replay-only real-time waits.

## Non-goals

Initial replay scope does not include:

- server/shared-protocol replay awareness;
- server virtual clock;
- hidden fast-forward/preroll;
- playback speed other than `1x`;
- editing/merging recordings;
- reconstructing frames not recorded;
- cloud recording storage;
- browser auth/session recording;
- direct replay into the normal active live DB;
- replacing Local Fake Market acceptance;
- treating replay as proof of current provider availability/movement.

## Completion

Branch `9` is complete when a user can record validated market frames with the service off, manage/export them, later select an IndexedDB recording or portable file, start isolated replay, Play/Pause/Stop/Seek through the normal producer/service path at original `1x` spacing, run the normal product surfaces, start from an arbitrary middle frame with no warm-up, replay on another day with coherent local timing, and safely begin a new replay run after Stop without inheriting prior run history—while the existing service/protocol remain replay-unaware, Replay Host owns only its own child/DB resources, the normal live DB stays untouched, the Host control credential is usable through a non-persistent one-run bootstrap, dedicated acceptance is green, ordinary local test behavior remains bounded, and a new exact complete-product candidate is deterministically reclosed before final `7.4` target-machine/provider acceptance resumes.
