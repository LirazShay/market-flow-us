import { buildUsCollectionCandidate } from "../collector/us-cycle.js";
import { sameCanonicalMembership } from "../provider/us-universe.js";

const LOCAL_TIMING_KEYS = Object.freeze([
  "startedAtMs",
  "responseReceivedAtMs",
  "completedAtMs"
]);

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

function assertSequence(sequence, frameCount, name = "sequence") {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= frameCount) {
    throw new RangeError(`${name} is outside the Replay source.`);
  }
}

function cloneTimingWithDelta(timing, deltaMs) {
  if (!timing || typeof timing !== "object" || Array.isArray(timing)) {
    throw new TypeError("Replay frame timing is required.");
  }

  const projected = { ...timing };
  for (const key of LOCAL_TIMING_KEYS) {
    assertNonNegativeFinite(timing[key], `timing.${key}`);
    const value = timing[key] + deltaMs;
    assertNonNegativeFinite(value, `rebased timing.${key}`);
    projected[key] = value;
  }
  return Object.freeze(projected);
}

export function projectReplayFrameToSegment(frame, {
  originalReferenceMs,
  wallReferenceMs
}) {
  if (!frame || typeof frame !== "object" || !frame.snapshot) {
    throw new TypeError("Replay frame is required.");
  }
  assertNonNegativeFinite(originalReferenceMs, "originalReferenceMs");
  assertNonNegativeFinite(wallReferenceMs, "wallReferenceMs");

  const deltaMs = wallReferenceMs - originalReferenceMs;
  const projectedSnapshot = {
    ...frame.snapshot,
    timing: cloneTimingWithDelta(frame.snapshot.timing, deltaMs)
  };
  const candidate = buildUsCollectionCandidate(projectedSnapshot);

  return Object.freeze({
    sequence: frame.sequence,
    originalCompletedAtMs: frame.snapshot.timing.completedAtMs,
    deltaMs,
    universe: candidate.universe,
    cycle: candidate.cycle
  });
}

function assertDependencies(source, producerBridge) {
  for (const [name, value] of Object.entries({
    sourceGetSummary: source?.getSummary,
    sourceGetFrameIndex: source?.getFrameIndex,
    sourceGetFrame: source?.getFrame,
    producerStartSession: producerBridge?.startSession,
    producerAcceptUniverse: producerBridge?.acceptUniverse,
    producerCommitCycle: producerBridge?.commitCycle,
    producerStopSession: producerBridge?.stopSession
  })) {
    if (typeof value !== "function") {
      throw new TypeError(`${name} must be a function.`);
    }
  }
}

export function createMarketReplayPlayer({
  source,
  producerBridge,
  now = () => Date.now(),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle),
  onStateChange = () => {}
}) {
  assertDependencies(source, producerBridge);
  for (const [name, value] of Object.entries({ now, setTimer, clearTimer, onStateChange })) {
    if (typeof value !== "function") throw new TypeError(`${name} must be a function.`);
  }

  const summary = source.getSummary();
  const frameIndex = source.getFrameIndex();
  if (summary.frameCount !== frameIndex.length) {
    throw new Error("Replay Player source summary/index mismatch.");
  }

  let status = summary.frameCount === 0 ? "empty" : "ready";
  let generation = 0;
  let authorityGeneration = 0;
  let authorityInFlight = false;
  let timerHandle = null;
  let sessionStarted = false;
  let selectedSequence = 0;
  let nextSequence = 0;
  let committedSequence = null;
  let committedFrameCount = 0;
  let currentMembership = null;
  let segment = null;
  let pausedOriginalPositionMs = null;
  let scheduledDueAtMs = null;
  let latestError = null;
  let requiresFreshRun = false;

  function getNow() {
    const value = now();
    assertNonNegativeFinite(value, "now()");
    return value;
  }

  function originalAt(sequence) {
    return frameIndex[sequence].completedAtMs;
  }

  function firstOriginalAt() {
    return summary.frameCount === 0 ? 0 : originalAt(0);
  }

  function recordingPositionOriginalMs(atMs = getNow()) {
    if (summary.frameCount === 0) return 0;
    if (status === "paused" && pausedOriginalPositionMs !== null) {
      return pausedOriginalPositionMs;
    }
    if (status === "playing" && segment) {
      const projected = segment.originalReferenceMs + Math.max(0, atMs - segment.wallReferenceMs);
      const ceiling = nextSequence < summary.frameCount
        ? originalAt(nextSequence)
        : originalAt(summary.frameCount - 1);
      return Math.min(projected, ceiling);
    }
    if (committedSequence !== null) return originalAt(committedSequence);
    return originalAt(selectedSequence);
  }

  function snapshotState() {
    const positionOriginalMs = recordingPositionOriginalMs();
    const producerState = typeof producerBridge.getState === "function"
      ? producerBridge.getState()
      : null;
    return Object.freeze({
      status,
      selectedSequence,
      nextSequence,
      committedSequence,
      committedFrameCount,
      frameCount: summary.frameCount,
      positionMs: Math.max(0, positionOriginalMs - firstOriginalAt()),
      durationMs: summary.durationMs,
      remainingDelayMs: status === "paused" && nextSequence < summary.frameCount
        ? Math.max(0, originalAt(nextSequence) - positionOriginalMs)
        : scheduledDueAtMs === null
          ? 0
          : Math.max(0, scheduledDueAtMs - getNow()),
      sessionStarted,
      serviceReady: producerState?.state === "ready",
      requiresFreshRun,
      latestError
    });
  }

  function notify() {
    onStateChange(snapshotState());
  }

  function cancelScheduled() {
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
    scheduledDueAtMs = null;
  }

  function invalidateGeneration() {
    generation += 1;
    cancelScheduled();
    return generation;
  }

  function invalidateAuthority() {
    authorityGeneration += 1;
    return invalidateGeneration();
  }

  async function closeCompletedSession(expectedAuthorityGeneration) {
    if (!sessionStarted || expectedAuthorityGeneration !== authorityGeneration) return;
    await producerBridge.stopSession("replay-complete");
    if (expectedAuthorityGeneration === authorityGeneration) sessionStarted = false;
  }

  async function closeErroredSession() {
    if (!sessionStarted) return;
    try {
      await producerBridge.stopSession("replay-error");
    } catch {
      // Preserve the original Replay failure. ProducerBridge itself fails closed on stop transport loss.
    } finally {
      sessionStarted = false;
    }
  }

  function scheduleNext(expectedGeneration) {
    if (status !== "playing" || nextSequence >= summary.frameCount || expectedGeneration !== generation) {
      return;
    }

    const dueAtMs = segment.wallReferenceMs
      + (originalAt(nextSequence) - segment.originalReferenceMs);
    scheduledDueAtMs = dueAtMs;
    const delayMs = Math.max(0, dueAtMs - getNow());
    timerHandle = setTimer(async () => {
      timerHandle = null;
      scheduledDueAtMs = null;
      await emitSequence(expectedGeneration, nextSequence);
    }, delayMs);
    notify();
  }

  async function emitSequence(expectedGeneration, sequence) {
    if (status !== "playing" || expectedGeneration !== generation) return;
    assertSequence(sequence, summary.frameCount);

    const expectedAuthorityGeneration = authorityGeneration;
    let ownsAuthorityBoundary = false;

    try {
      const frame = await source.getFrame(sequence);
      if (
        status !== "playing"
        || expectedGeneration !== generation
        || expectedAuthorityGeneration !== authorityGeneration
      ) return;

      const projected = projectReplayFrameToSegment(frame, segment);
      const membership = projected.universe.membership;
      const membershipChanged = currentMembership === null
        || !sameCanonicalMembership(currentMembership, membership);

      if (membershipChanged) {
        authorityInFlight = true;
        ownsAuthorityBoundary = true;
        await producerBridge.acceptUniverse(projected.universe);
        if (expectedAuthorityGeneration !== authorityGeneration) return;
        currentMembership = [...membership];
        if (status !== "playing" || expectedGeneration !== generation) return;
      }

      if (!ownsAuthorityBoundary) {
        authorityInFlight = true;
        ownsAuthorityBoundary = true;
      }
      await producerBridge.commitCycle(projected.cycle);
      if (expectedAuthorityGeneration !== authorityGeneration) return;

      committedSequence = sequence;
      committedFrameCount += 1;
      nextSequence = sequence + 1;
      latestError = null;
      notify();

      if (nextSequence >= summary.frameCount) {
        if (status === "playing") {
          status = "completed";
          scheduledDueAtMs = null;
          notify();
          await closeCompletedSession(expectedAuthorityGeneration);
          notify();
        }
        return;
      }

      if (status !== "playing") return;
      scheduleNext(expectedGeneration === generation ? expectedGeneration : generation);
    } catch (error) {
      if (expectedAuthorityGeneration !== authorityGeneration) return;
      if (!ownsAuthorityBoundary && expectedGeneration !== generation) return;
      invalidateGeneration();
      status = "error";
      requiresFreshRun = true;
      latestError = Object.freeze({
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error)
      });
      notify();
      await closeErroredSession();
      notify();
    } finally {
      if (ownsAuthorityBoundary) {
        authorityInFlight = false;
        if (
          expectedAuthorityGeneration === authorityGeneration
          && status === "playing"
          && expectedGeneration !== generation
          && nextSequence === sequence
          && timerHandle === null
        ) {
          scheduleNext(generation);
        }
      }
    }
  }

  function select(sequence) {
    if (status === "empty") throw new Error("Replay source has no frames.");
    if (status !== "ready" || sessionStarted || committedFrameCount !== 0 || requiresFreshRun) {
      throw new Error("Replay start position can only change before the run starts.");
    }
    assertSequence(sequence, summary.frameCount, "selected sequence");
    selectedSequence = sequence;
    nextSequence = sequence;
    committedSequence = null;
    currentMembership = null;
    segment = null;
    pausedOriginalPositionMs = originalAt(sequence);
    latestError = null;
    notify();
    return snapshotState();
  }

  async function play() {
    if (status === "empty") throw new Error("Replay source has no frames.");
    if (status === "paused") return await resume();
    if (requiresFreshRun || status === "stopped" || status === "seek_pending") {
      throw new Error("Replay Player requires a fresh replay run before Play.");
    }
    if (status === "playing") return snapshotState();
    if (status === "completed") {
      throw new Error("Replay Player has completed; start a fresh replay run to play again.");
    }
    if (status === "error") {
      throw new Error("Replay Player requires a fresh replay run after error.");
    }

    if (!sessionStarted) {
      const expectedAuthorityGeneration = authorityGeneration;
      await producerBridge.startSession();
      if (expectedAuthorityGeneration !== authorityGeneration) {
        try {
          await producerBridge.stopSession("replay-stale-start");
        } catch {
          // A later lifecycle boundary owns the visible state; cleanup remains best-effort and bounded.
        }
        return snapshotState();
      }
      sessionStarted = true;
    }

    segment = Object.freeze({
      originalReferenceMs: originalAt(nextSequence),
      wallReferenceMs: getNow()
    });
    pausedOriginalPositionMs = null;
    status = "playing";
    latestError = null;
    const expectedGeneration = invalidateGeneration();
    notify();
    await emitSequence(expectedGeneration, nextSequence);
    return snapshotState();
  }

  function pause() {
    if (status !== "playing") return snapshotState();
    pausedOriginalPositionMs = recordingPositionOriginalMs(getNow());
    invalidateGeneration();
    status = "paused";
    notify();
    return snapshotState();
  }

  async function resume() {
    if (status !== "paused") throw new Error("Replay Player is not paused.");
    if (nextSequence >= summary.frameCount) {
      pausedOriginalPositionMs = null;
      status = "completed";
      invalidateGeneration();
      notify();
      await closeCompletedSession(authorityGeneration);
      notify();
      return snapshotState();
    }

    segment = Object.freeze({
      originalReferenceMs: pausedOriginalPositionMs ?? originalAt(nextSequence),
      wallReferenceMs: getNow()
    });
    pausedOriginalPositionMs = null;
    status = "playing";
    const expectedGeneration = invalidateGeneration();
    notify();
    if (!authorityInFlight) scheduleNext(expectedGeneration);
    return snapshotState();
  }

  async function stop(reason = "replay-stop") {
    if (status === "stopped") return snapshotState();
    invalidateAuthority();
    status = "stopping";
    notify();

    let stopError = null;
    if (sessionStarted) {
      try {
        await producerBridge.stopSession(String(reason));
      } catch (error) {
        stopError = error;
        latestError = Object.freeze({
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        sessionStarted = false;
      }
    }

    status = "stopped";
    requiresFreshRun = true;
    notify();
    if (stopError) throw stopError;
    return snapshotState();
  }

  async function seek(sequence) {
    assertSequence(sequence, summary.frameCount, "seek sequence");
    invalidateAuthority();

    let stopError = null;
    if (sessionStarted) {
      try {
        await producerBridge.stopSession("replay-seek");
      } catch (error) {
        stopError = error;
      } finally {
        sessionStarted = false;
      }
    }

    selectedSequence = sequence;
    nextSequence = sequence;
    committedSequence = null;
    committedFrameCount = 0;
    currentMembership = null;
    segment = null;
    pausedOriginalPositionMs = originalAt(sequence);
    status = "seek_pending";
    requiresFreshRun = true;
    latestError = stopError === null
      ? null
      : Object.freeze({
          name: stopError instanceof Error ? stopError.name : "Error",
          message: stopError instanceof Error ? stopError.message : String(stopError)
        });
    notify();
    return snapshotState();
  }

  return Object.freeze({
    play,
    pause,
    resume,
    stop,
    select,
    seek,
    getState: snapshotState
  });
}
