import { createRecorderConfig, createUsRecorderConfig } from "./config.js";

const VALID_PROVIDER_FAILURE_PHASES = new Set([
  "universe",
  "chunk-fetch",
  "provider-fetch",
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

function canonicalMembership(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name} must be a non-empty array.`);
  }
  const normalized = values.map((value, index) => {
    if (value === null || value === undefined || value === "") {
      throw new Error(`${name} contains invalid securityId at index ${index}.`);
    }
    const securityId = String(value);
    if (securityId.trim().length === 0) {
      throw new Error(`${name} contains invalid securityId at index ${index}.`);
    }
    return securityId;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${name} contains duplicate securityIds.`);
  }
  return normalized.sort();
}

function sameMembership(left, right) {
  const a = canonicalMembership(left, "left membership");
  const b = canonicalMembership(right, "right membership");
  return a.length === b.length && a.every((securityId, index) => securityId === b[index]);
}

function validateUsCandidate(candidate) {
  const universe = candidate?.universe;
  const cycle = candidate?.cycle;
  if (!universe || typeof universe !== "object" || !cycle || typeof cycle !== "object") {
    throw new Error("U.S. collection candidate must contain universe and cycle.");
  }
  if (!Number.isSafeInteger(universe.recordCount) || universe.recordCount <= 0) {
    throw new Error("U.S. candidate universe recordCount is invalid.");
  }
  if (!Array.isArray(universe.membership) || universe.membership.length !== universe.recordCount) {
    throw new Error("U.S. candidate universe membership does not match recordCount.");
  }
  if (!Array.isArray(cycle.securities) || cycle.securities.length !== universe.recordCount) {
    throw new Error("U.S. candidate cycle securities do not match universe recordCount.");
  }
  if (cycle.status !== "complete" || cycle.requested !== universe.recordCount || cycle.unique !== universe.recordCount) {
    throw new Error("U.S. candidate cycle is not an exact complete universe cycle.");
  }
  if (!Array.isArray(cycle.chunks) || cycle.chunks.length !== 1 || cycle.chunks[0]?.chunkIndex !== 0) {
    throw new Error("U.S. candidate cycle must contain exactly one segment at chunkIndex 0.");
  }
  if (cycle.securities.some((item) => item?.chunkIndex !== 0)) {
    throw new Error("U.S. candidate cycle securities must use chunkIndex 0.");
  }

  const universeMembership = canonicalMembership(universe.membership, "U.S. candidate universe membership");
  const cycleMembership = canonicalMembership(
    cycle.securities.map((item) => item?.securityId),
    "U.S. candidate cycle membership"
  );
  if (!sameMembership(universeMembership, cycleMembership)) {
    throw new Error("U.S. candidate universe and cycle membership differ.");
  }
  return candidate;
}

export function createRecorder({
  loadUniverse = null,
  acceptUniverse,
  collectCycle = null,
  collectCandidate = null,
  onCycle,
  onFailure = async () => {},
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (handle) => clearTimeout(handle),
  now = () => Date.now()
}) {
  const usesUsCandidate = collectCandidate !== null;

  for (const [name, value] of Object.entries({
    acceptUniverse,
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

  if (usesUsCandidate) {
    if (typeof collectCandidate !== "function") {
      throw new TypeError("collectCandidate must be a function.");
    }
    if (loadUniverse !== null || collectCycle !== null) {
      throw new TypeError("collectCandidate cannot be combined with legacy loadUniverse/collectCycle dependencies.");
    }
  } else {
    if (typeof loadUniverse !== "function") {
      throw new TypeError("loadUniverse must be a function.");
    }
    if (typeof collectCycle !== "function") {
      throw new TypeError("collectCycle must be a function.");
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
      (phase === "chunk-fetch" || phase === "provider-fetch") && currentUniverse
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

  async function runLegacyCycle(cycleStartedAtMs) {
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
      await onCycle(cycle, { universe: currentUniverse, config });
      return cycle;
    } catch (error) {
      let providerPhase = null;
      if (stage === "universe-load") {
        providerPhase = "universe";
      } else if (stage === "collect") {
        const taggedPhase = error?.marketScopePhase;
        providerPhase = VALID_PROVIDER_FAILURE_PHASES.has(taggedPhase) ? taggedPhase : "chunk-fetch";
      }
      if (providerPhase) {
        await onFailure(makeProviderFailure(providerPhase, cycleStartedAtMs, error));
      }
      throw error;
    }
  }

  async function runUsCycle(cycleStartedAtMs) {
    let stage = "collect";
    try {
      const candidate = validateUsCandidate(await collectCandidate({ config }));
      const membershipChanged = !currentUniverse
        || !sameMembership(currentUniverse.membership, candidate.universe.membership);

      if (membershipChanged) {
        stage = "universe-accept";
        await acceptUniverse(candidate.universe, config);
        currentUniverse = candidate.universe;
      }

      stage = "authority-commit";
      await onCycle(candidate.cycle, { universe: currentUniverse, config });
      return candidate.cycle;
    } catch (error) {
      if (stage === "collect") {
        const taggedPhase = error?.marketFlowUsPhase;
        const providerPhase = VALID_PROVIDER_FAILURE_PHASES.has(taggedPhase)
          ? taggedPhase
          : "provider-fetch";
        await onFailure(makeProviderFailure(providerPhase, cycleStartedAtMs, error));
      }
      throw error;
    }
  }

  async function runCycle() {
    if (!state.isRunning || state.cycleInFlight) return;

    state.cycleInFlight = true;
    state.status = "running";
    const cycleStartedAtMs = getNow();
    state.currentCycleStartedAtMs = cycleStartedAtMs;

    try {
      const cycle = usesUsCandidate
        ? await runUsCycle(cycleStartedAtMs)
        : await runLegacyCycle(cycleStartedAtMs);
      state.completedCycles++;
      state.latestCycle = cycle;
      state.latestError = null;
    } catch (error) {
      state.failedCycles++;
      state.latestError = normalizeError(error);
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

    config = usesUsCandidate
      ? createUsRecorderConfig(configOverrides)
      : createRecorderConfig(configOverrides);
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
    if (!state.isRunning) return snapshotState(state);

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
