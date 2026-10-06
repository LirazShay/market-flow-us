# Market Recording + Replay Mini-Project

## Purpose

Add an isolated Market Replay capability beside the normal Market Flow US live path so a real Bank Leumi U.S. market session can be recorded in the browser, saved locally or exported to disk, and later played back interactively against the unchanged Market Flow US producer/service boundary as if market data were arriving now.

The user goal is a market-media-player experience:

```text
real Leumi market
→ record
→ IndexedDB library
→ export portable recording
→ optionally delete browser copy
→ later select IndexedDB recording OR upload file
→ Play / Pause / Seek on a progress bar
→ normal producer protocol
→ normal Market Flow US service
→ isolated replay DuckDB
→ Current / Detail-History / Scanner / Demo Buy / AI Investigation
```

This is not a test-only fake market and not a database importer. The replay must exercise the same observable producer/service/persistence/read path used by live data while keeping the server unaware that the source is recorded.

## Hard architecture invariant — server is replay-unaware

Replay must not add any replay-specific behavior to the existing Market Flow US service or shared producer protocol.

Forbidden replay-specific server concepts include:

```text
replayMode
virtualClock
seek
playbackSpeed
fastForward
loadRecording
resetReplay
recordingId
```

The existing service continues to receive only its normal producer messages:

```text
client.hello
producer.session.start
producer.universe.replace
producer.cycle.commit
producer.cycle.failed
producer.heartbeat
producer.session.stop
```

The service already supports explicit `--db`, `--port`, loopback host and exact allowed Origin configuration. Replay isolation must use those existing process/configuration seams rather than changing service behavior.

A generic defect discovered by replay may be fixed in the existing product only when the same defect is valid for the normal live path (for example, starting acquisition with no prior history). Such a fix must remain generic and must not teach the service about replay.

## User journeys

### 1. Record while the local service is off

On the already-authenticated eligible Bank Leumi page, the user launches the dedicated Market Replay browser artifact and chooses Record.

Recording mode:

- uses the existing same-origin ScreenerHulPaging3 acquisition and validation contract;
- does not require or connect to the Market Flow US local service;
- writes only validated market snapshots plus recording metadata to IndexedDB;
- shows recording state, elapsed original-market duration, frame count, approximate bytes and browser storage/quota estimate;
- can stop cleanly while preserving all successfully committed frames;
- never stores cookies, auth headers, account identifiers, DOM dumps or browser session material.

A provider failure is recorded as a bounded diagnostic event or ends/pauses recording according to the final contract; it must never create an apparently valid market frame from incomplete data.

### 2. Keep recordings in the browser

The browser library shows recordings with at least:

```text
name/date
original start/end
market duration
frame count
approximate size
status: complete/incomplete
```

The user can play, export or delete a recording.

IndexedDB usage is explicit. `navigator.storage.estimate()` should be used when available to show current usage/quota without pretending the browser quota is an exact guarantee.

Quota/write failure must fail safely: previously committed frames stay usable and the UI explains that recording stopped because local storage could not accept the next frame. No automatic deletion of older recordings.

### 3. Export a portable recording

Export must not require loading a large recording fully into memory.

Preferred Chromium path:

```text
IndexedDB cursor
→ streaming writer
→ user-selected file
```

Use the File System Access API where available from the secure provider context. A bounded Blob/download fallback may exist for smaller recordings, but the primary large-recording path must stream.

A successful export is independently validated before the UI offers deletion of the browser copy. Export never deletes IndexedDB automatically.

### 4. Upload/select a file and replay without re-importing it

The user can select a portable recording file and replay it directly from the File object. The implementation must not require copying a large uploaded recording into IndexedDB first.

The file source may build a lightweight frame/byte-offset index so the progress bar can seek without holding all market rows in memory.

The same Player abstraction must work over:

```text
IndexedDB recording source
portable file recording source
```

### 5. Media-player playback

The Player UI includes at least:

```text
Play
Pause
Stop
seekable progress bar
current recording position
recording duration
current frame / total frames
producer/service connection state
replay DB reset/readiness state
```

Initial scope plays at `1x`. Playback speed controls are a non-goal unless later evidence justifies them.

## Recording authority and storage shape

The smallest durable recording authority is the validated browser snapshot boundary, before Node authority.

Each valid frame stores one validated U.S. market snapshot sufficient to reconstruct the existing U.S. universe/cycle candidate without duplicated DuckDB-derived state:

```text
frame sequence
original snapshot timing
recordCount
records
canonical responseIds / membership or equivalent validated identity evidence
sourceMetadata
httpStatus
```

The market rows remain source-shaped and preserve the original provider fields/raw values that are already permitted by the Market Flow US data contract.

Do not record:

```text
DuckDB tables
cycle_id assigned by Node
session_id
producer instance IDs
Viewer state
Scanner output
Demo Buy state
cookies/tokens/auth headers
account identifiers
private page DOM
```

A recording is immutable after it is closed, except for user-controlled naming metadata that does not alter frames.

## Original-time contract

The recording must preserve the original time relation between frames.

The authoritative playback spacing is the difference between successive validated snapshot completion times (or the final equivalent chosen by the durable contract). If frames originally became available at:

```text
00:00.000
00:10.140
00:20.082
00:33.401
```

then replay spacing is:

```text
10.140s
9.942s
13.319s
```

Do not force a nominal 10-second cadence when the recording proves different timing.

The original provider data itself is immutable. Provider/source fields such as:

```text
TradeDateTime
Price
BidRate
AskRate
DailyVolume
ChangePercent
sourceMetadata
raw market row
```

are not rewritten merely because replay happens on another day.

## Replay-time rebasing

The Player rewrites only local collection/cycle timing that the live browser would normally stamp with `Date.now()`.

For one continuous playback segment, define:

```text
selected original frame/position = R0
current wall-clock start          = W0
```

Every local replay timestamp is shifted by the same segment offset so relative timing remains exact while the service receives contemporary timestamps.

All related local timestamps must remain internally coherent, including as applicable:

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

Durations and ordering invariants must remain valid after rebasing.

The server is not given the original local collection timestamp as authority. Original timing remains recording metadata available to the Player/UI for fidelity and diagnostics.

## Pause / Resume clock semantics

Pause behaves like pausing media playback:

- no market frames are emitted while paused;
- the recording position does not advance;
- resume shifts the remaining replay wall-clock schedule by the pause duration;
- the remaining portion of any inter-frame delay is preserved;
- the service simply observes a legitimate gap with no replay awareness.

Pause does not reset the replay DB.

## Seek semantics — no preroll and no fast-forward

An explicit Seek starts a fresh replay market at the selected recorded point.

There is deliberately no hidden playback of earlier frames to warm history.

Flow:

```text
Pause Player
→ close current producer cleanly when possible
→ Replay Host stops the existing replay-owned service process
→ discard/reset only the isolated replay DB
→ start the unchanged Market Flow US service on a fresh replay DB
→ connect a new normal producer session
→ use the selected frame's universe as the first available universe
→ emit the selected frame as the first market frame
→ continue at original recorded intervals
```

The progress-bar target should snap deterministically to a recorded frame boundary (normally the frame at-or-before the chosen position) rather than inventing a market state between recorded frames.

### Missing history after Seek is normal product behavior

After seeking to the middle of a recording, 10s/20s/30s/2m history before that point does not exist in the fresh replay DB.

This is intentional and is equivalent to starting Market Flow US at that real market time.

Scanner/Current/History/Demo Buy must tolerate this exactly as they must tolerate the beginning of a normal live acquisition session. If replay discovers that a query or product surface crashes merely because prior history is absent, that is a generic product defect. Fix it generically with normal-live regression proof; do not hide it with replay preroll.

## Replay Host — external process lifecycle only

Smooth backward/forward seek requires a clean DB without giving the service a reset API. Therefore the mini-project may add a small local Replay Host/controller outside the service.

Responsibilities are strictly limited to orchestration:

```text
bind loopback only
validate the exact browser Origin
spawn the existing Market Flow US service entrypoint
pass existing --db / --port / --allowed-origin arguments
use a replay-only DB path
graciously stop/restart the child service
reset/delete only replay-owned DB artifacts after child exit
report bounded ready/reset/failure state to the Player
```

The Host does not:

```text
accept market frames for persistence
write DuckDB itself
translate producer messages
run Scanner SQL
modify live DBs
impersonate the provider
change the existing service protocol
```

Default design should keep the normal service data port `8765` for replay so the existing Viewer/Producer clients need no protocol change, while the Replay Host uses a separate loopback control port chosen during durable-contract planning.

The normal live DB `data/market-flow-us.duckdb` is never opened, replaced or deleted by Replay Host.

## Viewer/Scanner behavior during replay

Replay must expose the real product surfaces, not a special fake viewer.

The dedicated replay browser composition should reuse the existing Viewer client/surfaces and connect them to the replay-owned normal service instance while replacing only the live provider producer with the Player producer.

Required replay-visible behavior includes:

```text
Current updates as frames arrive
Detail/History accumulates only replayed frames since the latest start/seek
Scanner executes normal saved/built-in/user SQL
staged anchors become available progressively as enough replay history exists
Demo Buy captures against the replay authority watermark
Demo Buy future observations become available as later replay frames arrive
AI Investigation uses the same normal replay DB facts if invoked
```

No Viewer/Scanner query may receive a hidden `isReplay` parameter.

## Portable file contract

Use a versioned, streaming-friendly format. Initial KISS target is line-oriented UTF-8 rather than one giant JSON document.

Conceptual shape:

```text
header/manifest line
frame line 1
frame line 2
...
frame line N
closing/footer line
```

The durable contract must define:

- format/version identifier;
- recording metadata and frame count;
- original first/last timing and duration;
- frame sequence and complete validated snapshot payload;
- deterministic truncation/incomplete-file detection through a required footer/count agreement;
- maximum supported line/frame/file constraints where needed for safe parsing;
- exact import validation before a file becomes playable.

A truncated or malformed file fails closed and must never partially masquerade as a complete recording.

Cryptographic signing is not required for the initial local-only format. Structural validation, exact identity/count validation and required footer agreement are required.

## Diagnostics

Replay uses the existing diagnosability model but keeps replay-specific diagnostics in the Player/Host boundary:

```text
component
checkpoint
stable error code
last successful checkpoint
sanitized causal message
```

Expected Player/Recorder failure families include:

- IndexedDB unavailable/open failure;
- quota/write failure;
- provider snapshot failure during recording;
- malformed/incomplete recording;
- unsupported recording format/version;
- file read/index failure;
- Replay Host unavailable;
- replay service reset/start failure;
- producer connection/ACK failure;
- stale seek generation attempting to emit after reset.

Diagnostics never include auth/session material, account identity or raw authenticated page state.

## Isolation from existing local tests and normal runtime

This mini-project must not silently expand the cost or behavior of the user's normal local verification path.

Default rules:

- existing `RUN_TESTS.cmd`, `RUN_LOCAL_ACCEPTANCE.cmd`, `START_DEMO.cmd` and `START_MARKET_FLOW_US.cmd` keep their current semantics;
- normal runtime does not auto-load Replay code;
- Replay has a separate browser build/entry artifact and separate operator launcher;
- Replay-specific deterministic tests use dedicated scripts/targets unless an existing tiny unit test is the natural contract owner;
- required CI may run Replay proof in a dedicated path/job, but existing broad local acceptance must not gain long recording/replay waits;
- no real-time multi-hour test is permitted; deterministic scheduler/fake-clock tests prove timing, while a short real-wall-clock smoke proves integration.

After implementation, the existing normal Fast/Browser/Planning/Workload proofs that are materially affected must remain green, but Replay does not become a hidden prerequisite for running the ordinary product locally.

## Required acceptance scenarios

Deterministic acceptance must cover at least:

### Recording

- multiple complete frames saved in order;
- original irregular frame gaps preserved;
- membership same/add/remove recording;
- provider failure cannot create a valid frame;
- stop/restart creates explicit recording boundaries;
- quota/write failure leaves prior frames readable;
- no auth/session/account data in recording structures.

### Export / file source

- streaming export of a multi-frame recording;
- complete footer/count validation;
- truncated/malformed/wrong-version file rejection;
- file can be selected and indexed without copying the full recording to IndexedDB;
- seek index resolves deterministic frame boundaries.

### Playback timing

- first frame rebased to contemporary local time;
- provider market fields remain unchanged;
- irregular original inter-frame intervals reproduced at `1x`;
- Pause freezes recording position and Resume preserves remaining interval timing;
- no stale scheduled frame emits after Pause/Seek/Stop generation change.

### Seek / isolation

- seek causes a fresh replay DB through external Host process control;
- no earlier/later history from the previous playback survives the reset;
- selected frame is the first authoritative replay frame;
- service receives only the existing producer protocol;
- normal live DB is byte/path-isolated from replay reset operations.

### Start-without-history behavior

Start replay from a mid-recording frame with no previous replay history and prove:

- Current is valid after first commit;
- History contains only frames actually replayed after the selected start;
- built-in staged Scanner runs without crash and exposes missing anchors until enough replay history exists;
- later anchors become populated naturally as replay proceeds;
- Demo Buy can capture after replay start and resolve future horizons only from later replay cycles.

Any failure here must be classified as Replay defect versus generic live-start defect. Generic live-start defects receive normal product regression proof rather than replay-specific server behavior.

### Next-day replay

Record timestamps representing day A, then execute replay under a simulated/real wall clock on day B and prove:

- local collection/cycle timestamps are rebased to day B/current time;
- original market/provider values remain from day A;
- Scanner time-delta queries continue to work from replay-local collected timestamps;
- Demo Buy captured_at_ms/future horizon logic remains coherent with replay-local time;
- no day-A local timestamp causes false stale/future behavior in the replay DB.

## Planned S&T extension

The final TREE extension should add capability branch `9` while leaving existing completed branches valid and keeping `7.4` unfinished until replay is deterministically reclosed.

### `9.1` — browser recording authority + IndexedDB library

Dedicated Replay browser entry/build, reuse existing validated U.S. acquisition, IndexedDB recording store, record/stop/library/delete/quota UI, immutable complete-frame semantics and public-safe diagnostics.

### `9.2` — portable streaming recording format

Versioned streaming export, complete/truncated validation, direct File playback source with lightweight seek index, common recording-source abstraction and large-file behavior that does not require full memory or IndexedDB duplication.

### `9.3` — media Player + replay clock + normal producer

Play/Pause/Stop/progress/seek position model, exact original interval scheduling, local timestamp rebasing, source provider-data preservation, stale-generation cancellation and normal ProducerBridge ACK behavior at `1x`.

### `9.4` — isolated Replay Host + real product surfaces

Loopback Replay Host that only spawns/resets the unchanged existing service on a replay-only DB, exact Origin control boundary, clean seek restart, replay browser composition reusing Current/Detail/Scanner/Demo Buy/AI Viewer surfaces, and absolute protection of the normal live DB.

### `9.5` — replay acceptance + deterministic reclosure

Focused recording/file/player/host proof, arbitrary mid-recording start without preroll, next-day time rebasing, Scanner/Demo Buy correctness, normal-suite non-regression/performance review, public-safe review, documentation/operator flow, PR/CI/main-green closure, then re-pin the final product candidate before resuming `7.4`.

Expected execution dependency chain:

```text
9.1 → 9.2 → 9.3 → 9.4 → 9.5 → resume 7.4
```

Planning may refine leaf boundaries if Necessity/Sufficiency review shows a cleaner decomposition, but it must preserve the hard server-unaware and no-preroll contracts.

## Non-goals

Not part of the initial mini-project:

- changing the Market Flow US server protocol for Replay;
- replay-aware SQL functions or server virtual clock;
- fast-forward/preroll to warm history after seek;
- playback speed other than `1x`;
- merging multiple recordings into one timeline;
- editing individual market frames;
- reconstructing data that was not recorded;
- cloud upload/storage;
- recording browser authentication/session state;
- replaying directly into the normal live trading-day DB;
- using Replay as proof that a real provider is currently reachable or moving;
- replacing existing Local Fake Market acceptance.

## Completion definition

The mini-project is implementation-complete only when a user can:

```text
record real validated market frames with the service off
→ see/manage browser recordings
→ export a large recording safely
→ delete its browser copy if desired
→ later choose the file without re-importing it
→ start isolated Replay
→ Play/Pause/Seek with an MP3-like timeline
→ observe original frame spacing at 1x
→ run the normal product surfaces against the unchanged service
→ seek to an arbitrary point with a fresh replay DB and no hidden warm-up
→ replay on another day with coherent current local timing
```

and deterministic acceptance proves that the normal service/shared protocol remains replay-unaware, the normal live DB is untouched, no replay-specific slowdown is added to ordinary local verification, required CI is green, the replay branch is reclosed, and final target-machine/provider acceptance `7.4` can resume on the newly pinned complete product candidate.