import { DIAGNOSTIC_CODES } from "../../shared/diagnostics/index.js";

function normalizeVisibleState(value = {}) {
  return Object.freeze({
    runtimeState: typeof value.runtimeState === "string" ? value.runtimeState.slice(0, 64) : "unknown",
    viewerSurface: typeof value.viewerSurface === "string" ? value.viewerSurface.slice(0, 64) : "unknown",
    selectedSecurityIdPresent: value.selectedSecurityIdPresent === true,
    scannerActive: value.scannerActive === true
  });
}

function unavailableNodeEvidence(browserDiagnostics) {
  const source = browserDiagnostics.lastError;
  const checkpoint = source?.checkpoint === "browser.service.hello"
    ? "browser.service.hello"
    : "browser.service.connection";
  const code = source?.error?.code === DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE
    ? DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE
    : DIAGNOSTIC_CODES.SERVICE_DISCONNECTED;

  return Object.freeze({
    unavailable: true,
    diagnostic: Object.freeze({
      component: "browser.runtime",
      checkpoint,
      code,
      message: code === DIAGNOSTIC_CODES.SERVICE_UNAVAILABLE
        ? "Local Market Flow US service is unavailable."
        : "Local Market Flow US service connection is unavailable."
    })
  });
}

export async function buildBrowserSupportSnapshot({
  productVersion,
  diagnosticTracker,
  getNodeSnapshot,
  visibleState,
  now = () => Date.now()
}) {
  if (!diagnosticTracker || typeof diagnosticTracker.snapshot !== "function") {
    throw new TypeError("diagnosticTracker is required.");
  }
  if (typeof getNodeSnapshot !== "function") {
    throw new TypeError("getNodeSnapshot must be a function.");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function.");

  const browserDiagnostics = diagnosticTracker.snapshot();
  let node;
  try {
    node = await getNodeSnapshot();
  } catch {
    node = unavailableNodeEvidence(browserDiagnostics);
  }

  return Object.freeze({
    schemaVersion: 1,
    generatedAtMs: now(),
    browser: Object.freeze({
      productVersion,
      diagnostics: browserDiagnostics
    }),
    node,
    visibleState: normalizeVisibleState(visibleState)
  });
}

export function supportSnapshotJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}
