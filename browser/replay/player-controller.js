import { createMarketReplayPlayer } from "./market-player.js";
import { openPortableFileRecordingSource } from "./portable-recording.js";
import { createIndexedDbRecordingSource } from "./recording-source.js";

function normalizeError(error) {
  return Object.freeze({
    code: typeof error?.code === "string" ? error.code : null,
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error)
  });
}

function assertFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function.`);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createReplayPlayerController({
  store,
  producerBridge = null,
  runCoordinator = null,
  openIndexedDbSource = ({ store: sourceStore, recordingId }) => createIndexedDbRecordingSource({
    store: sourceStore,
    recordingId
  }),
  openFileSource = ({ file }) => openPortableFileRecordingSource({ file }),
  createPlayer = (options) => createMarketReplayPlayer(options),
  now = () => Date.now(),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle)
} = {}) {
  if (!store) throw new TypeError("Replay recording store is required.");
  for (const [name, value] of Object.entries({
    openIndexedDbSource,
    openFileSource,
    createPlayer,
    now,
    setTimer,
    clearTimer
  })) {
    assertFunction(value, name);
  }
  if (runCoordinator !== null) {
    assertFunction(runCoordinator?.startFreshRun, "runCoordinator.startFreshRun");
  }

  let source = null;
  let summary = null;
  let bridge = producerBridge;
  let player = null;
  let playerState = null;
  let selectedSequence = 0;
  let latestError = null;
  const listeners = new Set();

  function selectedPositionMs() {
    if (!summary || summary.frameCount === 0) return 0;
    const frameIndex = source.getFrameIndex();
    return Math.max(0, frameIndex[selectedSequence].completedAtMs - summary.firstFrameAtMs);
  }

  function snapshotState() {
    const state = player?.getState?.() ?? playerState ?? {};
    return Object.freeze({
      sourceReady: source !== null,
      sourceKind: source?.kind ?? null,
      sourceName: summary?.name ?? null,
      sourceId: summary?.id ?? null,
      frameCount: summary?.frameCount ?? 0,
      durationMs: summary?.durationMs ?? 0,
      playerAvailable: player !== null,
      producerAvailable: bridge !== null,
      runCoordinatorAvailable: runCoordinator !== null,
      status: state.status ?? (source ? "source_ready" : "idle"),
      selectedSequence: state.selectedSequence ?? selectedSequence,
      nextSequence: state.nextSequence ?? selectedSequence,
      committedSequence: state.committedSequence ?? null,
      committedFrameCount: state.committedFrameCount ?? 0,
      positionMs: state.positionMs ?? selectedPositionMs(),
      remainingDelayMs: state.remainingDelayMs ?? 0,
      sessionStarted: state.sessionStarted === true,
      serviceReady: state.serviceReady === true,
      requiresFreshRun: state.requiresFreshRun === true,
      latestError: latestError ?? state.latestError ?? null
    });
  }

  function notify() {
    const state = snapshotState();
    for (const listener of listeners) listener(state);
  }

  function refreshPlayerState(state = player?.getState?.() ?? null) {
    playerState = state;
    if (state && Number.isSafeInteger(state.selectedSequence)) {
      selectedSequence = state.selectedSequence;
    }
    notify();
  }

  function rebuildPlayer() {
    player = null;
    playerState = null;
    if (!source || !bridge) {
      notify();
      return;
    }

    player = createPlayer({
      source,
      producerBridge: bridge,
      now,
      setTimer,
      clearTimer,
      onStateChange: (state) => refreshPlayerState(state)
    });
    if (summary.frameCount > 0 && selectedSequence > 0) {
      player.select(selectedSequence);
    }
    playerState = player.getState();
    notify();
  }

  async function provisionFreshRun(reason) {
    if (!source || !summary) throw new Error("Replay source is not selected.");
    if (runCoordinator === null) {
      const error = new Error("Replay service is not ready. Start an isolated replay run first.");
      error.code = "REPLAY_SERVICE_NOT_READY";
      throw error;
    }

    const nextBridge = await runCoordinator.startFreshRun({
      reason,
      selectedSequence,
      sourceKind: source.kind,
      sourceId: summary.id
    });
    if (!nextBridge) throw new Error("Replay run coordinator did not provide a producer bridge.");

    bridge = nextBridge;
    latestError = null;
    rebuildPlayer();
    if (!player) throw new Error("Replay Player could not attach to the fresh replay run.");
    return player;
  }

  function setSource(nextSource) {
    if (!nextSource || typeof nextSource.getSummary !== "function" || typeof nextSource.getFrameIndex !== "function") {
      throw new TypeError("Replay source is invalid.");
    }
    const current = snapshotState();
    if (current.sessionStarted || ["playing", "paused", "stopping"].includes(current.status)) {
      throw new Error("Cannot replace the Replay source while a run is active.");
    }
    source = nextSource;
    summary = source.getSummary();
    selectedSequence = 0;
    latestError = null;
    rebuildPlayer();
    return snapshotState();
  }

  async function withSourceLoad(operation) {
    try {
      const nextSource = await operation();
      return setSource(nextSource);
    } catch (error) {
      latestError = normalizeError(error);
      notify();
      throw error;
    }
  }

  async function loadIndexedDbRecording(recordingId) {
    return await withSourceLoad(() => openIndexedDbSource({ store, recordingId }));
  }

  async function loadPortableFile(file) {
    return await withSourceLoad(() => openFileSource({ file }));
  }

  function attachProducerBridge(nextBridge) {
    if (!nextBridge) throw new TypeError("producerBridge is required.");
    const current = snapshotState();
    if (current.sessionStarted || ["playing", "paused", "stopping"].includes(current.status)) {
      throw new Error("Cannot replace the Replay producer bridge while a run is active.");
    }
    bridge = nextBridge;
    latestError = null;
    rebuildPlayer();
    return snapshotState();
  }

  function detachProducerBridge() {
    const current = snapshotState();
    if (current.sessionStarted || ["playing", "paused", "stopping"].includes(current.status)) {
      throw new Error("Cannot detach the Replay producer bridge while a run is active.");
    }
    bridge = null;
    player = null;
    playerState = null;
    notify();
    return snapshotState();
  }

  async function seekPositionMs(positionMs) {
    if (!source || !summary) throw new Error("Replay source is not selected.");
    if (summary.frameCount === 0) throw new Error("Replay source has no frames.");
    if (!Number.isFinite(positionMs)) throw new TypeError("positionMs must be finite.");

    const bounded = clamp(positionMs, 0, summary.durationMs);
    const absolute = summary.firstFrameAtMs + bounded;
    const resolved = source.resolveFrameAtOrBefore(absolute);
    selectedSequence = resolved === null ? 0 : resolved;
    latestError = null;

    if (!player) {
      notify();
      return snapshotState();
    }

    try {
      if (player.getState().status === "ready") {
        refreshPlayerState(player.select(selectedSequence));
        return snapshotState();
      }

      const seekState = await player.seek(selectedSequence);
      playerState = seekState;
      selectedSequence = seekState.selectedSequence;
      notify();

      if (runCoordinator !== null) {
        bridge = null;
        player = null;
        await provisionFreshRun("seek");
      } else {
        refreshPlayerState(seekState);
      }
      return snapshotState();
    } catch (error) {
      latestError = normalizeError(error);
      notify();
      throw error;
    }
  }

  async function play() {
    try {
      if (!source || !summary) throw new Error("Replay source is not selected.");

      if (!player) {
        await provisionFreshRun("initial-play");
      } else {
        const current = player.getState();
        if (current.requiresFreshRun === true) {
          if (runCoordinator === null) {
            return await player.play();
          }
          if (Number.isSafeInteger(current.committedSequence)) {
            selectedSequence = current.committedSequence;
          }
          const reason = current.status === "stopped" ? "play-after-stop" : "fresh-run-required";
          bridge = null;
          player = null;
          playerState = current;
          await provisionFreshRun(reason);
        }
      }

      latestError = null;
      refreshPlayerState(await player.play());
      return snapshotState();
    } catch (error) {
      latestError = normalizeError(error);
      notify();
      throw error;
    }
  }

  function pause() {
    if (!player) return snapshotState();
    latestError = null;
    refreshPlayerState(player.pause());
    return snapshotState();
  }

  async function stop() {
    if (!player) return snapshotState();
    try {
      latestError = null;
      const state = await player.stop();
      refreshPlayerState(state);
      return snapshotState();
    } catch (error) {
      latestError = normalizeError(error);
      notify();
      throw error;
    }
  }

  return Object.freeze({
    loadIndexedDbRecording,
    loadPortableFile,
    attachProducerBridge,
    detachProducerBridge,
    seekPositionMs,
    play,
    pause,
    stop,
    getSource: () => source,
    getState: snapshotState,
    subscribe(listener) {
      assertFunction(listener, "listener");
      listeners.add(listener);
      listener(snapshotState());
      return () => listeners.delete(listener);
    }
  });
}
