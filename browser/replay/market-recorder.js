import { fetchValidatedSnapshot } from "../provider/us-screener.js";
import { createRecordingId, createReplayFrame } from "./recording-model.js";

export const DEFAULT_REPLAY_RECORDING_CADENCE_MS = 3_000;

function assertPositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
}

function defaultRecordingName(nowMs) {
  return `Market Recording ${new Date(nowMs).toISOString()}`;
}

function safeStorageEstimate(storageManager) {
  if (!storageManager || typeof storageManager.estimate !== "function") {
    return Promise.resolve(Object.freeze({ available: false, usage: null, quota: null }));
  }

  return Promise.resolve()
    .then(() => storageManager.estimate())
    .then((estimate) => Object.freeze({
      available: true,
      usage: Number.isFinite(estimate?.usage) && estimate.usage >= 0 ? estimate.usage : null,
      quota: Number.isFinite(estimate?.quota) && estimate.quota >= 0 ? estimate.quota : null
    }))
    .catch(() => Object.freeze({ available: false, usage: null, quota: null }));
}

export function createMarketReplayRecorder({
  store,
  fetchSnapshot = fetchValidatedSnapshot,
  cadenceMs = DEFAULT_REPLAY_RECORDING_CADENCE_MS,
  now = () => Date.now(),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle),
  storageManager = globalThis.navigator?.storage,
  createId = ({ nowMs }) => createRecordingId({ nowMs })
}) {
  if (!store || typeof store.createRecording !== "function" || typeof store.appendFrame !== "function") {
    throw new TypeError("store must be a Replay recording store.");
  }
  if (typeof fetchSnapshot !== "function") throw new TypeError("fetchSnapshot must be a function.");
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  if (typeof setTimer !== "function" || typeof clearTimer !== "function") {
    throw new TypeError("timer functions are required.");
  }
  if (typeof createId !== "function") throw new TypeError("createId must be a function.");
  assertPositiveFinite(cadenceMs, "cadenceMs");

  const listeners = new Set();
  let state = Object.freeze({
    status: "idle",
    recordingId: null,
    name: null,
    frameCount: 0,
    durationMs: 0,
    approximateBytes: 0,
    providerFailureCount: 0,
    latestErrorCode: null,
    storageEstimate: Object.freeze({ available: false, usage: null, quota: null }),
    library: Object.freeze([])
  });
  let token = 0;
  let timerHandle = null;
  let activeAttempt = null;

  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    for (const listener of listeners) listener(state);
  }

  function applySummary(summary, patch = {}) {
    publish({
      recordingId: summary.id,
      name: summary.name,
      frameCount: summary.frameCount,
      durationMs: summary.durationMs,
      approximateBytes: summary.approximateBytes,
      ...patch
    });
  }

  async function refreshStorageEstimate() {
    const storageEstimate = await safeStorageEstimate(storageManager);
    publish({ storageEstimate });
    return storageEstimate;
  }

  async function refreshLibrary() {
    const library = Object.freeze(await store.listRecordings());
    publish({ library });
    return library;
  }

  function cancelTimer() {
    if (timerHandle !== null) {
      clearTimer(timerHandle);
      timerHandle = null;
    }
  }

  function scheduleNext(activeToken) {
    if (activeToken !== token || state.status !== "recording") return;
    timerHandle = setTimer(() => {
      timerHandle = null;
      activeAttempt = captureOnce(activeToken).finally(() => {
        activeAttempt = null;
      });
    }, cadenceMs);
  }

  function recordProviderFailure(activeToken) {
    if (activeToken !== token || state.status !== "recording") return;
    publish({
      providerFailureCount: state.providerFailureCount + 1,
      latestErrorCode: "PROVIDER_SNAPSHOT_FAILED"
    });
    scheduleNext(activeToken);
  }

  async function captureOnce(activeToken) {
    if (activeToken !== token || state.status !== "recording") return;

    let frame;
    try {
      const snapshot = await fetchSnapshot();
      if (activeToken !== token || state.status !== "recording") return;
      frame = createReplayFrame({
        recordingId: state.recordingId,
        sequence: state.frameCount,
        snapshot
      });
    } catch {
      recordProviderFailure(activeToken);
      return;
    }

    try {
      const summary = await store.appendFrame(frame);
      if (activeToken !== token || state.status !== "recording") return;
      applySummary(summary, { latestErrorCode: null });
      void refreshStorageEstimate();
      scheduleNext(activeToken);
    } catch {
      if (activeToken !== token) return;
      token += 1;
      cancelTimer();
      await store.tryRecordFailure?.(state.recordingId, "STORAGE_WRITE_FAILED");
      publish({
        status: "storage_error",
        latestErrorCode: "STORAGE_WRITE_FAILED"
      });
      await Promise.allSettled([refreshLibrary(), refreshStorageEstimate()]);
    }
  }

  async function start({ name } = {}) {
    if (state.status === "recording" || state.status === "stopping") {
      throw new Error("A Replay recording is already active.");
    }

    cancelTimer();
    const createdAtMs = now();
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
      throw new Error("now() must return a non-negative safe integer.");
    }
    const recordingId = createId({ nowMs: createdAtMs });
    const recordingName = typeof name === "string" && name.trim().length > 0
      ? name.trim()
      : defaultRecordingName(createdAtMs);
    const summary = await store.createRecording({ id: recordingId, name: recordingName, createdAtMs });

    token += 1;
    const activeToken = token;
    applySummary(summary, {
      status: "recording",
      providerFailureCount: 0,
      latestErrorCode: null
    });
    await Promise.allSettled([refreshLibrary(), refreshStorageEstimate()]);

    activeAttempt = captureOnce(activeToken).finally(() => {
      activeAttempt = null;
    });
    return summary;
  }

  async function stop() {
    if (state.status !== "recording" && state.status !== "stopping") return null;
    if (state.status === "recording") {
      publish({ status: "stopping" });
      token += 1;
      cancelTimer();
    }

    const attempt = activeAttempt;
    if (attempt) await attempt.catch(() => {});

    const recordingId = state.recordingId;
    try {
      const summary = await store.completeRecording(recordingId);
      applySummary(summary, { status: "idle", latestErrorCode: null });
      await Promise.allSettled([refreshLibrary(), refreshStorageEstimate()]);
      return summary;
    } catch {
      await store.tryRecordFailure?.(recordingId, "STORAGE_WRITE_FAILED");
      publish({ status: "storage_error", latestErrorCode: "STORAGE_WRITE_FAILED" });
      await Promise.allSettled([refreshLibrary(), refreshStorageEstimate()]);
      return null;
    }
  }

  async function renameRecording(recordingId, name) {
    const summary = await store.renameRecording(recordingId, name);
    if (recordingId === state.recordingId) applySummary(summary);
    await refreshLibrary();
    return summary;
  }

  async function deleteRecording(recordingId) {
    if (recordingId === state.recordingId && (state.status === "recording" || state.status === "stopping")) {
      throw new Error("Stop the active Replay recording before deleting it.");
    }
    await store.deleteRecording(recordingId);
    await Promise.allSettled([refreshLibrary(), refreshStorageEstimate()]);
  }

  return Object.freeze({
    start,
    stop,
    refreshLibrary,
    refreshStorageEstimate,
    renameRecording,
    deleteRecording,
    getState() {
      return state;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function.");
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }
  });
}
