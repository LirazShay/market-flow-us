const COMMIT_CHANNEL = "market-scope:v1";

function assertSurface(surface, requiredMethods, name) {
  if (!surface || typeof surface !== "object") {
    throw new TypeError(`${name} is required.`);
  }
  for (const method of requiredMethods) {
    if (typeof surface[method] !== "function") {
      throw new TypeError(`${name} must expose ${method}().`);
    }
  }
}

function assertRoot(root, name) {
  if (!root || typeof root !== "object" || !("hidden" in root)) {
    throw new TypeError(`${name} must be a hideable element.`);
  }
}

function assertControlsRoot(root) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("controlsRoot must be a DOM element.");
  }
}

function defaultCreateBroadcastChannel(name) {
  if (typeof globalThis.BroadcastChannel !== "function") return null;
  return new globalThis.BroadcastChannel(name);
}

export function createViewerRefreshController({
  currentSurface,
  detailSurface,
  currentRoot,
  detailRoot,
  controlsRoot,
  diagnosticsRoot,
  createBroadcastChannel = defaultCreateBroadcastChannel,
  channelName = COMMIT_CHANNEL
} = {}) {
  assertSurface(
    currentSurface,
    ["refresh", "mountDiagnostics", "captureViewState", "restoreViewState"],
    "currentSurface"
  );
  assertSurface(
    detailSurface,
    ["open", "refresh", "getState"],
    "detailSurface"
  );
  assertRoot(currentRoot, "currentRoot");
  assertRoot(detailRoot, "detailRoot");
  assertControlsRoot(controlsRoot);
  if (!diagnosticsRoot || typeof diagnosticsRoot.replaceChildren !== "function") {
    throw new TypeError("diagnosticsRoot must be a DOM element.");
  }
  currentSurface.mountDiagnostics(diagnosticsRoot);
  if (typeof createBroadcastChannel !== "function") {
    throw new TypeError("createBroadcastChannel must be a function.");
  }
  if (typeof channelName !== "string" || channelName.length === 0) {
    throw new TypeError("channelName must be a non-empty string.");
  }

  const document = controlsRoot.ownerDocument;
  let activeSurface = "MAIN";
  let channel = null;
  let started = false;
  let liveRefreshAvailable = false;
  let refreshInFlight = false;
  let refreshPending = false;
  let refreshLoopPromise = null;

  function snapshot() {
    return Object.freeze({
      activeSurface,
      liveRefreshAvailable,
      refreshInFlight,
      refreshPending
    });
  }

  function renderControls() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = refreshInFlight ? "מרענן תצוגה…" : "רענן תצוגה";
    button.disabled = refreshInFlight;
    button.addEventListener("click", () => {
      void manualRefresh();
    });

    const liveStatus = document.createElement("span");
    liveStatus.textContent = liveRefreshAvailable
      ? "רענון חי פעיל"
      : "רענון ידני בלבד";
    liveStatus.dataset.liveRefresh = liveRefreshAvailable ? "active" : "manual";

    controlsRoot.replaceChildren(button, liveStatus);
  }

  async function runAuthoritativeRefresh() {
    await currentSurface.refresh();

    if (activeSurface === "DETAIL") {
      await detailSurface.refresh();
    }
  }

  function requestRefresh() {
    if (refreshLoopPromise) {
      refreshPending = true;
      renderControls();
      return refreshLoopPromise;
    }

    refreshLoopPromise = (async () => {
      do {
        refreshPending = false;
        refreshInFlight = true;
        renderControls();
        try {
          await runAuthoritativeRefresh();
        } finally {
          refreshInFlight = false;
          renderControls();
        }
      } while (refreshPending);
    })().finally(() => {
      refreshLoopPromise = null;
      refreshInFlight = false;
      refreshPending = false;
      renderControls();
    });

    return refreshLoopPromise;
  }

  function handleHint(event) {
    if (event?.data?.type !== "CYCLE_COMMITTED") return;
    void requestRefresh();
  }

  function start() {
    if (started) return snapshot();
    started = true;

    currentRoot.hidden = false;
    detailRoot.hidden = true;

    try {
      channel = createBroadcastChannel(channelName);
    } catch {
      channel = null;
    }

    if (channel && typeof channel.addEventListener === "function") {
      channel.addEventListener("message", handleHint);
      liveRefreshAvailable = true;
    } else {
      channel = null;
      liveRefreshAvailable = false;
    }

    renderControls();
    return snapshot();
  }

  async function manualRefresh() {
    return await requestRefresh();
  }

  async function openDetail(securityId) {
    const returnState = currentSurface.captureViewState();
    activeSurface = "DETAIL";
    currentRoot.hidden = true;
    detailRoot.hidden = false;

    return await detailSurface.open(securityId, { returnState });
  }

  function backToCurrent(returnState) {
    activeSurface = "MAIN";
    detailRoot.hidden = true;
    currentRoot.hidden = false;
    currentSurface.restoreViewState(returnState);
    return snapshot();
  }

  function close() {
    if (channel) {
      try {
        channel.removeEventListener?.("message", handleHint);
        channel.close?.();
      } catch {
        // Live refresh transport is only a hint path.
      }
    }
    channel = null;
    liveRefreshAvailable = false;
    started = false;
    renderControls();
  }

  return Object.freeze({
    start,
    manualRefresh,
    openDetail,
    backToCurrent,
    close,
    getState: snapshot
  });
}
