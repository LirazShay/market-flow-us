import { createMarketReplayRecorder } from "./market-recorder.js";
import { createReplayPlayerController } from "./player-controller.js";
import { createReplayPlayerSurface } from "./player-surface.js";
import { exportRecordingToUserFile } from "./portable-recording.js";
import { openReplayRecordingStore } from "./recording-store.js";
import { createReplayRecordingSurface } from "./recording-surface.js";

export const REPLAY_RUNTIME_KEY = "__MARKET_FLOW_US_REPLAY_V1__";

function showStartupFailure(documentRef = globalThis.document) {
  if (!documentRef?.body) return;
  const id = "market-flow-us-replay-startup-error";
  documentRef.getElementById(id)?.remove();
  const element = documentRef.createElement("div");
  element.id = id;
  element.dir = "rtl";
  element.textContent = "Market Replay לא הצליח לפתוח אחסון דפדפן. לא התחילה הקלטה ולא נמחק מידע קיים.";
  Object.assign(element.style, {
    position: "fixed",
    zIndex: "2147483647",
    top: "16px",
    right: "16px",
    maxWidth: "430px",
    padding: "12px",
    borderRadius: "8px",
    background: "#450a0a",
    color: "#ffffff",
    font: "14px Arial, sans-serif"
  });
  documentRef.body.append(element);
}

export async function startReplayRecordingRuntime({
  indexedDb = globalThis.indexedDB,
  documentRef = globalThis.document,
  storageManager = globalThis.navigator?.storage,
  globalRef = globalThis
} = {}) {
  const existing = globalThis[REPLAY_RUNTIME_KEY];
  if (existing) {
    existing.surface.show();
    await Promise.allSettled([
      existing.recorder.refreshLibrary(),
      existing.recorder.refreshStorageEstimate()
    ]);
    return existing;
  }

  const store = await openReplayRecordingStore({ indexedDb });
  const recorder = createMarketReplayRecorder({ store, storageManager });

  // 9.3 deliberately does not attach the ordinary localhost ProducerBridge here.
  // 9.4 will provide an isolated replay-owned service/bridge after Host readiness.
  const playerController = createReplayPlayerController({ store });
  const playerSurface = createReplayPlayerSurface({
    controller: playerController,
    documentRef,
    initiallyVisible: false
  });

  const surface = createReplayRecordingSurface({
    recorder,
    documentRef,
    exportRecording: ({ id, name }) => exportRecordingToUserFile({
      store,
      recordingId: id,
      recordingName: name,
      globalRef,
      documentRef
    }),
    playRecording: async ({ id }) => {
      await playerController.loadIndexedDbRecording(id);
      playerSurface.show();
    },
    openPlayer: () => playerSurface.show()
  });

  const runtime = Object.freeze({
    store,
    recorder,
    surface,
    playerController,
    playerSurface
  });
  globalThis[REPLAY_RUNTIME_KEY] = runtime;

  await Promise.allSettled([
    recorder.refreshLibrary(),
    recorder.refreshStorageEstimate()
  ]);
  return runtime;
}

if (globalThis.document?.body) {
  void startReplayRecordingRuntime().catch(() => showStartupFailure());
}
