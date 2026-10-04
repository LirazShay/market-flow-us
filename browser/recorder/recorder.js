import { createRecorderConfig } from "./config.js";

const VALID_PROVIDER_FAILURE_PHASES = new Set([
  "universe",
  "chunk-fetch",
  "cycle-validation"
]);

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

function normalizeError(error) {
  const value = error instanceof Error ? error : new Error(String(error));
  return Object.freeze({
    name: value.name || "Error",
    message: String(value.message ?? "")
  });
}

function snapshotState(state) {
  return Object.freeze({
    isRunning: state.isRunning,
    status: state.status,
    startedAtMs: state.startedAtMs,
    stoppedAtMs: state.stoppedAtMs,
    stopReason: state.stopReason,
    cycleInFlight: state.cycleInFlight,
    currentCycleStartedAtMs: state.currentCycleStartedAtMs,
    nextScheduledAtMs: state.nextScheduledAtMs,
    completedCycles: state.completedCycles,
    failedCycles: state.failedCycles,
    latestCycle: state.latestCycle,
    latestError: state.latestError
  });
}

export function createRecorder({
  loadUniverse,
  acceptUniverse,
  collectCycle,
  onCycle,
  onFailure = async () => {},
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (handle) => clearTimeout(handle),
  now = () => Date.now()
}) {
  for (const [name, value] of Object.entries({
    loadUniverse,
    acceptUniverse,
    collectCycle,
    onCycle,
    onFailure,
    schedule,
    cancelSchedule,
    now
  })) {
    if (typeof value !== "function") {
      throw new TypeError(`${name} must be a function.`);
    }
  }

  let config = null;
  let timerHandle = null;
  let currentUniverse = null;

  const state = {
    isRunning: false,
    status: "idle",
    startedAtMs: null,
    stoppedAtMs: null,
    stopReason: null,
    cycleInFlight: false,
    currentCycleStartedAtMs: null,
    nextScheduledAtMs: null,
    completedCycles: 0,
    failedCycles: 0,
    latestCycle: null,
    latestError: null
  };

  function getNow() {
    const value = now();
    assertNonNegativeFinite(value, "now()");
    return value;
  }

  function scheduleNext(delayMs) {
    if (!state.isRunning) return;

    state.nextScheduledAtMs = getNow() + delayMs;
    timerHandle = schedule(async () => {
      timerHandle = null;
      state.nextScheduledAtMs = null;
      await runCycle();
    }, delayMs);
  }

  function makeProviderFailure(phase, cycleStartedAtMs, error) {
    const failedAtMs = getNow();
    const requested =
      phase === "chunk-fetch" && currentUniverse
        ? currentUniverse.recordCount
        : null;

    return Object.freeze({
      phase,
      startedAtMs: cycleStartedAtMs,
      failedAtMs,
      requested,
      received: null,
      unique: null,
      missing: null,
      duplicates: null,
      unexpected: null,
      error: normalizeError(error)
    });
  }

  async function runCycle() {
    if (!state.isRunning || state.cycleInFlight) return;

    state.cycleInFlight = true;
    state.status = "running";
    const cycleStartedAtMs = getNow();
    state.currentCycleStartedAtMs = cycleStartedAtMs;
    let stage = "universe-load";

    try {
      if (!currentUniverse || config.refreshUniverseEveryCycle) {
        const candidateUniverse = await loadUniverse(config);
        stage = "universe-accept";
        await acceptUniverse(candidateUniverse, config);
        currentUniverse = candidateUniverse;
      }

      stage = "collect";
      const cycle = await collectCycle({
        universe: currentUniverse,
        config,
        chunkSize: config.chunkSize,
        chunkDelayMs: config.chunkDelayMs
      });

      stage = "authority-commit";
      await onCycle(cycle, {
        universe: currentUniverse,
        config
      });

      state.completedCycles++;
      state.latestCycle = cycle;
      state.latestError = null;
    } catch (error) {
      state.failedCycles++;
      state.latestError = normalizeError(error);

      let providerPhase = null;
      if (stage === "universe-load") {
        providerPhase = "universe";
      } else if (stage === "collect") {
        const taggedPhase = error?.marketScopePhase;
        providerPhase = VALID_PROVIDER_FAILURE_PHASES.has(taggedPhase)
          ? taggedPhase
          : "chunk-fetch";
      }

      if (providerPhase) {
        await onFailure(makeProviderFailure(providerPhase, cycleStartedAtMs, error));
      }
    } finally {
      state.cycleInFlight = false;
      state.currentCycleStartedAtMs = null;

      if (!state.isRunning) {
        state.status = "stopped";
        return;
      }

      state.status = "scheduled";
      const elapsedMs = Math.max(0, getNow() - cycleStartedAtMs);
      scheduleNext(Math.max(0, config.snapshotIntervalMs - elapsedMs));
    }
  }

  function start(configOverrides = {}) {
    if (state.isRunning || state.cycleInFlight) {
      throw new Error("Recorder is already running.");
    }

    config = createRecorderConfig(configOverrides);
    currentUniverse = null;

    state.isRunning = true;
    state.status = "scheduled";
    state.startedAtMs = getNow();
    state.stoppedAtMs = null;
    state.stopReason = null;
    state.cycleInFlight = false;
    state.currentCycleStartedAtMs = null;
    state.nextScheduledAtMs = null;
    state.completedCycles = 0;
    state.failedCycles = 0;
    state.latestCycle = null;
    state.latestError = null;

    scheduleNext(0);
    return snapshotState(state);
  }

  function stop(reason = "manual") {
    if (!state.isRunning) {
      return snapshotState(state);
    }

    state.isRunning = false;
    state.stoppedAtMs = getNow();
    state.stopReason = String(reason);
    state.nextScheduledAtMs = null;

    if (timerHandle !== null) {
      cancelSchedule(timerHandle);
      timerHandle = null;
    }

    state.status = state.cycleInFlight ? "stopping" : "stopped";
    return snapshotState(state);
  }

  return Object.freeze({
    start,
    stop,
    getState: () => snapshotState(state)
  });
}
