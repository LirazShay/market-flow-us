import { collectUsCollectionCandidate } from "../collector/us-cycle.js";
import {
  createDiagnosticTracker
} from "../../shared/diagnostics/index.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";
import {
  buildBrowserSupportSnapshot,
  supportSnapshotJson
} from "../diagnostics/support-snapshot.js";
import { fetchValidatedSnapshot } from "../provider/us-screener.js";
import { createRecorder } from "../recorder/recorder.js";
import { createUsRecorderConfig } from "../recorder/config.js";
import { US_CURRENT_PROFILE } from "../viewer/current-model.js";
import { createCurrentSurface } from "../viewer/current-surface.js";
import { US_DETAIL_PROFILE } from "../viewer/detail-model.js";
import { createDetailSurface } from "../viewer/detail-surface.js";
import { createViewerClient } from "../viewer/client.js";
import {
  createDemoBuyCaptureController,
  DEMO_BUY_AUTO_MODE
} from "../viewer/demo-buy-capture-controller.js";
import { createViewerRefreshController } from "../viewer/refresh-controller.js";
import { createScannerSurface } from "../viewer/scanner-surface.js";
import { createProducerBridge } from "./producer-bridge.js";

export const RUNTIME_KEY = "__MARKET_FLOW_US_RUNTIME_V1__";
export const VIEWER_SHELL_KEY = "__MARKET_FLOW_US_VIEWER_SHELL_V1__";
export const VIEWER_WINDOW_NAME = "market-flow-us-viewer-v1";

const DEFAULT_PRODUCT_VERSION = "0.1.0";
const DEFAULT_SERVICE_URL = "ws://127.0.0.1:8765";

function normalizeError(error, fallback = "Market Flow US runtime failed.") {
  if (error instanceof Error) return error;
  return new Error(error === undefined || error === null ? fallback : String(error));
}

function isBrowserTarget(target) {
  return Boolean(
    target
    && target.document
    && typeof target.open === "function"
    && typeof target.fetch === "function"
  );
}

function delay(target, delayMs) {
  return new Promise((resolve) => target.setTimeout(resolve, delayMs));
}

function createShellDocument(viewerWindow) {
  const document = viewerWindow.document;
  document.title = "Market Flow US";
  document.documentElement.lang = "he";
  document.documentElement.dir = "rtl";

  const style = document.createElement("style");
  style.textContent = `
    :root { font-family: Arial, sans-serif; color-scheme: light; }
    body { margin: 0; background: #f6f7f9; color: #1b1f24; }
    .market-flow-us-shell { max-width: 1600px; margin: 0 auto; padding: 16px; }
    .market-flow-us-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .market-flow-us-toolbar button { padding: 8px 12px; cursor: pointer; }
    .market-flow-us-auto-demo-buy { display: inline-flex; gap: 6px; align-items: center; }
    .market-flow-us-runtime-status { margin: 12px 0; }
    .market-flow-us-view { margin-top: 12px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d7dce2; padding: 6px 8px; text-align: right; white-space: nowrap; }
    th { background: #eef1f4; }
    .market-flow-us-diagnostics { display: flex; gap: 12px; flex-wrap: wrap; }
    .market-flow-us-diagnostics div { display: flex; gap: 4px; }
    textarea { width: min(100%, 900px); }
  `;

  const shell = document.createElement("main");
  shell.className = "market-flow-us-shell";

  const title = document.createElement("h1");
  title.textContent = "Market Flow US";

  const runtimeStatus = document.createElement("p");
  runtimeStatus.className = "market-flow-us-runtime-status";
  runtimeStatus.setAttribute("aria-live", "polite");

  const toolbar = document.createElement("nav");
  toolbar.className = "market-flow-us-toolbar";
  toolbar.setAttribute("aria-label", "Market Flow US");

  const currentButton = document.createElement("button");
  currentButton.type = "button";
  currentButton.textContent = "Current";

  const scannerButton = document.createElement("button");
  scannerButton.type = "button";
  scannerButton.textContent = "Scanner";

  const refreshControls = document.createElement("span");
  refreshControls.className = "market-flow-us-refresh-controls";

  const autoDemoBuyIndicator = document.createElement("span");
  autoDemoBuyIndicator.className = "market-flow-us-auto-demo-buy";
  autoDemoBuyIndicator.setAttribute("aria-live", "polite");

  toolbar.append(currentButton, scannerButton, refreshControls, autoDemoBuyIndicator);

  const diagnostics = document.createElement("section");
  diagnostics.setAttribute("aria-label", "אבחון תפעולי");

  const operationalDiagnostics = document.createElement("div");
  operationalDiagnostics.className = "market-flow-us-operational-diagnostics";

  const supportDiagnostics = document.createElement("section");
  supportDiagnostics.className = "market-flow-us-support-diagnostics";
  supportDiagnostics.setAttribute("aria-label", "Support Snapshot");

  diagnostics.append(operationalDiagnostics, supportDiagnostics);

  const currentRoot = document.createElement("section");
  currentRoot.className = "market-flow-us-view";

  const detailRoot = document.createElement("section");
  detailRoot.className = "market-flow-us-view";
  detailRoot.hidden = true;

  const scannerRoot = document.createElement("section");
  scannerRoot.className = "market-flow-us-view";
  scannerRoot.hidden = true;

  shell.append(
    title,
    runtimeStatus,
    toolbar,
    diagnostics,
    currentRoot,
    detailRoot,
    scannerRoot
  );

  document.head.replaceChildren(style);
  document.body.replaceChildren(shell);

  return {
    document,
    runtimeStatus,
    currentButton,
    scannerButton,
    refreshControls,
    autoDemoBuyIndicator,
    diagnostics,
    operationalDiagnostics,
    supportDiagnostics,
    currentRoot,
    detailRoot,
    scannerRoot
  };
}

function createViewerShell({
  viewerWindow,
  serviceUrl,
  productVersion,
  diagnosticTracker,
  now,
  currentProfile,
  detailProfile,
  onDisposed = () => {}
}) {
  const existing = viewerWindow[VIEWER_SHELL_KEY];
  existing?.dispose?.();

  const elements = createShellDocument(viewerWindow);
  const client = createViewerClient({
    url: serviceUrl,
    productVersion,
    clientInstanceId: `market-flow-us-viewer-${Date.now()}`,
    diagnosticTracker
  });
  const demoBuyController = createDemoBuyCaptureController({ client, now });

  let refreshController;
  let disposed = false;
  let unsubscribeDemoBuy = null;

  const currentSurface = createCurrentSurface({
    root: elements.currentRoot,
    client,
    profile: currentProfile,
    onOpenSecurity(securityId) {
      elements.scannerRoot.hidden = true;
      void refreshController.openDetail(securityId);
    }
  });

  const detailSurface = createDetailSurface({
    root: elements.detailRoot,
    client,
    profile: detailProfile,
    captureReturnState: () => currentSurface.captureViewState(),
    onBack(returnState) {
      elements.scannerRoot.hidden = true;
      refreshController.backToCurrent(returnState);
    }
  });

  refreshController = createViewerRefreshController({
    currentSurface,
    detailSurface,
    currentRoot: elements.currentRoot,
    detailRoot: elements.detailRoot,
    controlsRoot: elements.refreshControls,
    diagnosticsRoot: elements.operationalDiagnostics
  });

  const scannerSurface = createScannerSurface({
    root: elements.scannerRoot,
    client,
    demoBuyController,
    onOpenSecurity(securityId) {
      elements.scannerRoot.hidden = true;
      void refreshController.openDetail(securityId);
    }
  });

  function renderAutoDemoBuyIndicator(state) {
    elements.autoDemoBuyIndicator.replaceChildren();
    if (state.autoMode === DEMO_BUY_AUTO_MODE.OFF) return;

    const label = elements.document.createElement("span");
    label.textContent = state.autoMode === DEMO_BUY_AUTO_MODE.ALL
      ? "Auto Demo Buy: All"
      : `Auto Demo Buy: Top ${state.autoTopX}`;
    elements.autoDemoBuyIndicator.append(label);

    if (state.autoBlockedReason) {
      const blocked = elements.document.createElement("span");
      blocked.textContent = `Blocked for current result: ${state.autoBlockedReason}`;
      elements.autoDemoBuyIndicator.append(blocked);
    } else if (state.captureBusy) {
      const busy = elements.document.createElement("span");
      busy.textContent = "capture in progress";
      elements.autoDemoBuyIndicator.append(busy);
    }

    const turnOffButton = elements.document.createElement("button");
    turnOffButton.type = "button";
    turnOffButton.textContent = "Turn off";
    turnOffButton.addEventListener("click", () => {
      demoBuyController.turnAutoOff();
    });
    elements.autoDemoBuyIndicator.append(turnOffButton);
  }

  unsubscribeDemoBuy = demoBuyController.subscribe(renderAutoDemoBuyIndicator);

  let runtimeState = "ready";

  const supportButton = elements.document.createElement("button");
  supportButton.type = "button";
  supportButton.textContent = "העתק אבחון / Copy Support Snapshot";

  const supportStatus = elements.document.createElement("span");
  supportStatus.setAttribute("aria-live", "polite");

  const supportFallback = elements.document.createElement("pre");
  supportFallback.hidden = true;
  supportFallback.tabIndex = 0;
  supportFallback.setAttribute("aria-label", "Support Snapshot JSON");

  elements.supportDiagnostics.append(supportButton, supportStatus, supportFallback);

  function visibleState() {
    const refreshState = refreshController.getState();
    const detailState = detailSurface.getState();
    const scannerState = scannerSurface.getState().scheduler;
    const demoBuyState = demoBuyController.getState();
    return {
      runtimeState,
      viewerSurface: elements.scannerRoot.hidden
        ? refreshState.activeSurface
        : "SCANNER",
      selectedSecurityIdPresent: detailState.selectedSecurityId !== null,
      scannerActive: scannerState.activeSql !== null && scannerState.stopped !== true,
      autoDemoBuyMode: demoBuyState.autoMode,
      autoDemoBuyBusySkippedCount: demoBuyState.autoBusySkippedCount,
      demoBuyCaptureBusy: demoBuyState.captureBusy,
      demoBuyCaptureLocked: demoBuyState.captureLocked,
      demoBuyLastCaptureStatus: demoBuyState.lastCapture?.status ?? null
    };
  }

  async function buildSupportSnapshot() {
    return await buildBrowserSupportSnapshot({
      productVersion,
      diagnosticTracker,
      getNodeSnapshot: () => client.getSupportSnapshot(),
      visibleState: visibleState(),
      now
    });
  }

  async function copySupportSnapshot() {
    const snapshot = await buildSupportSnapshot();
    const json = supportSnapshotJson(snapshot);
    supportFallback.textContent = json;

    try {
      if (typeof viewerWindow.navigator?.clipboard?.writeText !== "function") {
        throw new Error("Clipboard unavailable");
      }
      await viewerWindow.navigator.clipboard.writeText(json);
      supportFallback.hidden = true;
      supportStatus.textContent = "האבחון הועתק.";
      return Object.freeze({ copied: true, json });
    } catch {
      supportFallback.hidden = false;
      supportStatus.textContent = "העתקה אוטומטית לא זמינה; אפשר להעתיק מהטקסט.";
      supportFallback.focus?.();
      return Object.freeze({ copied: false, json });
    }
  }

  supportButton.addEventListener("click", () => {
    void copySupportSnapshot();
  });

  function showCurrent() {
    elements.scannerRoot.hidden = true;
    refreshController.backToCurrent(null);
    elements.currentButton.setAttribute("aria-current", "page");
    elements.scannerButton.removeAttribute("aria-current");
  }

  function showScanner() {
    refreshController.backToCurrent(null);
    elements.currentRoot.hidden = true;
    elements.detailRoot.hidden = true;
    elements.scannerRoot.hidden = false;
    elements.currentButton.removeAttribute("aria-current");
    elements.scannerButton.setAttribute("aria-current", "page");
  }

  elements.currentButton.addEventListener("click", showCurrent);
  elements.scannerButton.addEventListener("click", showScanner);

  refreshController.start();
  showCurrent();
  void currentSurface.refresh();

  function setRuntimeState(state, error = null) {
    runtimeState = state;
    elements.runtimeStatus.removeAttribute("role");
    elements.runtimeStatus.title = "";

    if (state === "running") {
      elements.runtimeStatus.textContent = "האיסוף פעיל.";
      return;
    }

    if (state === "stopping") {
      elements.runtimeStatus.textContent = "עוצר איסוף…";
      return;
    }

    if (state === "stopped") {
      elements.runtimeStatus.textContent = "האיסוף נעצר. התצוגה ממשיכה לקרוא את ה־Node המקומי.";
      return;
    }

    if (state === "starting") {
      elements.runtimeStatus.textContent = "מתחבר לשירות Market Flow US…";
      return;
    }

    if (state === "error") {
      elements.runtimeStatus.setAttribute("role", "alert");
      elements.runtimeStatus.textContent =
        "שירות Market Flow US אינו זמין. הפעלה מחדש נדרשת לאחר שהשירות זמין.";
      if (error?.message) elements.runtimeStatus.title = error.message;
      return;
    }

    elements.runtimeStatus.textContent = "Market Flow US מוכן.";
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribeDemoBuy?.();
    unsubscribeDemoBuy = null;
    refreshController.close();
    scannerSurface.destroy();
    client.close();
    if (viewerWindow[VIEWER_SHELL_KEY] === api) {
      try {
        delete viewerWindow[VIEWER_SHELL_KEY];
      } catch {
        // The Viewer is already closing; disposal is best-effort.
      }
    }
    onDisposed();
  }

  const api = Object.freeze({
    setRuntimeState,
    refresh: () => refreshController.manualRefresh(),
    buildSupportSnapshot,
    copySupportSnapshot,
    dispose
  });

  Object.defineProperty(viewerWindow, VIEWER_SHELL_KEY, {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false
  });

  viewerWindow.addEventListener("beforeunload", dispose, { once: true });

  return api;
}

export function createMarketScopeRuntime({
  target = globalThis,
  now = () => Date.now(),
  serviceUrl = target?.__MARKET_FLOW_US_CONFIG__?.serviceUrl ?? DEFAULT_SERVICE_URL,
  productVersion = DEFAULT_PRODUCT_VERSION,
  recorderConfig = target?.__MARKET_FLOW_US_CONFIG__?.recorder ?? {},
  openWindow = (...args) => target.open(...args),
  producerBridgeFactory = createProducerBridge,
  recorderFactory = createRecorder,
  currentProfile = US_CURRENT_PROFILE,
  detailProfile = US_DETAIL_PROFILE,
  loadUniverse = null,
  collectCycle = null,
  collectCandidate = null
} = {}) {
  if (!target || typeof target !== "object") {
    throw new TypeError("target must be a global-like object.");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");
  if (typeof serviceUrl !== "string" || serviceUrl.length === 0) {
    throw new TypeError("serviceUrl must be a non-empty string.");
  }
  if (typeof productVersion !== "string" || productVersion.length === 0) {
    throw new TypeError("productVersion must be a non-empty string.");
  }

  const usesLegacyCollection = loadUniverse !== null || collectCycle !== null;
  if (usesLegacyCollection) {
    if (typeof loadUniverse !== "function" || typeof collectCycle !== "function") {
      throw new TypeError("Legacy collection requires both loadUniverse and collectCycle functions.");
    }
    if (collectCandidate !== null) {
      throw new TypeError("collectCandidate cannot be combined with legacy loadUniverse/collectCycle dependencies.");
    }
  } else if (collectCandidate !== null && typeof collectCandidate !== "function") {
    throw new TypeError("collectCandidate must be a function when provided.");
  }

  const resolvedCollectCandidate = usesLegacyCollection
    ? null
    : collectCandidate ?? (() => collectUsCollectionCandidate({
      fetchSnapshot: () => fetchValidatedSnapshot({
        fetchImpl: target.fetch.bind(target),
        now
      })
    }));

  const startedAtMs = now();
  const diagnosticTracker = createDiagnosticTracker({ productVersion, now });
  diagnosticTracker.recordSuccess({
    component: "browser.runtime",
    operation: "runtime.load",
    operationId: "browser-runtime",
    checkpoint: "browser.runtime.loaded"
  });

  let state = "idle";
  let lastError = null;
  let bridge = null;
  let recorder = null;
  let launchPromise = null;
  let stopPromise = null;
  let viewerWindow = null;
  let viewerShell = null;
  let generation = 0;

  function snapshot() {
    return Object.freeze({
      productVersion,
      startedAtMs,
      state,
      lastError: lastError
        ? Object.freeze({ name: lastError.name, message: lastError.message })
        : null,
      producerState: bridge?.getState?.().state ?? null,
      recorderState: recorder?.getState?.().status ?? null,
      viewerOpen: Boolean(viewerWindow && viewerWindow.closed !== true)
    });
  }

  function publishState() {
    if (viewerWindow?.closed === true) {
      viewerWindow = null;
      viewerShell = null;
      return;
    }
    viewerShell?.setRuntimeState(state, lastError);
  }

  function openViewer({ rebuild = false } = {}) {
    if (!isBrowserTarget(target)) {
      return Object.freeze({ opened: false, reused: false });
    }

    if (!rebuild && viewerWindow && viewerWindow.closed !== true && viewerShell) {
      viewerWindow.focus?.();
      publishState();
      return Object.freeze({ opened: true, reused: true });
    }

    if (viewerShell) {
      viewerShell.dispose();
      viewerShell = null;
    }

    let candidate = viewerWindow;
    if (!candidate || candidate.closed === true) {
      candidate = openWindow("", VIEWER_WINDOW_NAME);
    }

    if (!candidate) {
      const error = new Error("Market Flow US Viewer popup was blocked.");
      lastError = error;
      return Object.freeze({ opened: false, reused: false });
    }

    viewerWindow = candidate;
    viewerShell = createViewerShell({
      viewerWindow,
      serviceUrl,
      productVersion,
      diagnosticTracker,
      now,
      currentProfile,
      detailProfile,
      onDisposed() {
        if (viewerWindow?.closed === true) {
          viewerWindow = null;
          viewerShell = null;
        }
      }
    });
    publishState();
    viewerWindow.focus?.();
    return Object.freeze({ opened: true, reused: false });
  }

  function stopRecorderForDisconnect(error, owningGeneration) {
    if (owningGeneration !== generation) return;
    recorder?.stop("service_disconnect");
    state = "error";
    lastError = normalizeError(error, "Market Flow US service disconnected.");
    publishState();
  }

  function recordCollectedCycle(cycle) {
    diagnosticTracker.recordSuccess({
      component: "provider",
      operation: "provider.cycle.collect",
      operationId: "provider-cycle",
      checkpoint: "provider.cycle.collected",
      context: {
        requested: cycle.requested,
        received: cycle.received,
        unique: cycle.unique,
        missing: cycle.missing,
        duplicates: cycle.duplicates,
        unexpected: cycle.unexpected
      }
    });
  }

  function recordCollectionFailure(error) {
    diagnosticTracker.recordError({
      component: "provider",
      operation: "provider.cycle.collect",
      operationId: "provider-cycle",
      checkpoint: "provider.cycle.collected",
      lastSuccessfulCheckpoint: diagnosticTracker.snapshot().lastSuccessfulCheckpoint,
      error: {
        code: ERROR_CODES.CYCLE_INVALID,
        name: "CycleCollectionError",
        message: "Provider cycle acquisition or validation failed.",
        retryable: false
      }
    });
    throw error;
  }

  function createProducerGeneration() {
    generation += 1;
    const owningGeneration = generation;

    bridge = producerBridgeFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-flow-us-browser-producer-${owningGeneration}`,
      now,
      diagnosticTracker,
      onDisconnect(error) {
        stopRecorderForDisconnect(error, owningGeneration);
      }
    });

    const callbacks = bridge.getRecorderCallbacks();
    const baseRecorderOptions = {
      acceptUniverse: callbacks.acceptUniverse,
      onCycle: callbacks.onCycle,
      onFailure: callbacks.onFailure,
      now
    };

    if (usesLegacyCollection) {
      recorder = recorderFactory({
        ...baseRecorderOptions,
        loadUniverse: async () => {
          try {
            const universe = await loadUniverse();
            diagnosticTracker.recordSuccess({
              component: "provider",
              operation: "provider.universe.collect",
              operationId: "provider-universe",
              checkpoint: "provider.universe.collected",
              context: {
                requested: universe.recordCount,
                received: universe.securities.length,
                unique: universe.securities.length
              }
            });
            return universe;
          } catch (error) {
            diagnosticTracker.recordError({
              component: "provider",
              operation: "provider.universe.collect",
              operationId: "provider-universe",
              checkpoint: "provider.universe.collected",
              error: {
                code: ERROR_CODES.UNIVERSE_INVALID,
                name: "UniverseCollectionError",
                message: "Provider universe acquisition or validation failed.",
                retryable: false
              }
            });
            throw error;
          }
        },
        collectCycle: async ({ universe, config }) => {
          try {
            const cycle = await collectCycle({ universe, config });
            recordCollectedCycle(cycle);
            return cycle;
          } catch (error) {
            return recordCollectionFailure(error);
          }
        }
      });
      return;
    }

    recorder = recorderFactory({
      ...baseRecorderOptions,
      collectCandidate: async ({ config }) => {
        try {
          const candidate = await resolvedCollectCandidate({ config });
          recordCollectedCycle(candidate.cycle);
          return candidate;
        } catch (error) {
          return recordCollectionFailure(error);
        }
      }
    });
  }

  async function launch() {
    if (launchPromise) return await launchPromise;
    if (stopPromise) await stopPromise;

    if (state === "running") {
      openViewer();
      return snapshot();
    }

    launchPromise = (async () => {
      const rebuildViewer = state === "error";
      state = "starting";
      lastError = null;
      publishState();
      createProducerGeneration();

      try {
        const activeRecorderConfig = usesLegacyCollection
          ? recorderConfig
          : createUsRecorderConfig(recorderConfig);
        await bridge.startSession(activeRecorderConfig);
        recorder.start(activeRecorderConfig);
        state = "running";
        lastError = null;
        openViewer({ rebuild: rebuildViewer });
        publishState();
        return snapshot();
      } catch (error) {
        const launchError = normalizeError(error, "Market Flow US launch failed.");
        const activeRecorder = recorder;
        const activeBridge = bridge;

        activeRecorder?.stop("launch_failed");
        await waitForRecorderIdle(activeRecorder);

        if (activeBridge?.getState?.().sessionId) {
          try {
            await activeBridge.stopSession("launch_failed");
          } catch {
            // stopSession fails closed and tears down its transport before rethrowing.
          }
        }

        state = "error";
        lastError = launchError;
        try {
          openViewer({ rebuild: true });
        } catch {
          // Preserve the original launch failure when the Viewer itself cannot be rebuilt.
        }
        publishState();
        throw lastError;
      }
    })();

    try {
      return await launchPromise;
    } finally {
      launchPromise = null;
    }
  }

  async function waitForRecorderIdle(activeRecorder) {
    while (activeRecorder?.getState?.().cycleInFlight === true) {
      await delay(target, 25);
    }
  }

  async function stop(reason = "manual") {
    if (stopPromise) return await stopPromise;
    if (launchPromise) {
      try {
        await launchPromise;
      } catch {
        // A failed launch has no authoritative producer session to stop cleanly.
      }
    }

    if (state !== "running" && state !== "starting") {
      publishState();
      return snapshot();
    }

    stopPromise = (async () => {
      const activeRecorder = recorder;
      const activeBridge = bridge;
      state = "stopping";
      publishState();

      activeRecorder?.stop(reason);
      await waitForRecorderIdle(activeRecorder);

      try {
        if (activeBridge?.getState?.().sessionId) {
          await activeBridge.stopSession(reason);
        }
        state = "stopped";
        lastError = null;
        publishState();
        return snapshot();
      } catch (error) {
        state = "error";
        lastError = normalizeError(error, "Market Flow US producer stop failed.");
        publishState();
        throw lastError;
      }
    })();

    try {
      return await stopPromise;
    } finally {
      stopPromise = null;
    }
  }

  async function relaunch() {
    if (state === "running" || state === "starting") {
      await stop("relaunch");
    }
    return await launch();
  }

  return Object.freeze({
    productVersion,
    startedAtMs,
    launch,
    relaunch,
    stop,
    openViewer,
    getState: snapshot
  });
}

export function startRuntime(target = globalThis, now = () => Date.now()) {
  const existing = target?.[RUNTIME_KEY];
  if (existing) {
    if (isBrowserTarget(target)) {
      void existing.launch().catch(() => {});
    }
    return { runtime: existing, reused: true };
  }

  const runtime = createMarketScopeRuntime({ target, now });

  Object.defineProperty(target, RUNTIME_KEY, {
    value: runtime,
    configurable: true,
    enumerable: false,
    writable: false
  });

  if (isBrowserTarget(target)) {
    void runtime.launch().catch(() => {});
  }

  return { runtime, reused: false };
}
