import { collectCompleteCycle } from "../collector/cycle.js";
import { loadValidatedUniverse } from "../provider/universe.js";
import { createRecorderConfig } from "../recorder/config.js";
import { createProducerBridge } from "../runtime/producer-bridge.js";
import { createViewerClient } from "../viewer/client.js";

const DEFAULT_SERVICE_URL = "ws://127.0.0.1:8765";
const DEFAULT_PRODUCT_VERSION = "0.1.0";
const DEFAULT_RECORDER_CONFIG = createRecorderConfig({ snapshotIntervalMs: 0 });

const SAFE_FAILURE_MESSAGES = Object.freeze({
  "producer.start": "Producer hello/session start did not complete.",
  "provider.universe": "Provider universe acquisition or validation did not complete.",
  "producer.universe": "Validated universe was not acknowledged by local authority.",
  "provider.cycle": "Exactly one complete provider cycle did not validate.",
  "producer.commit": "Complete cycle was not durably acknowledged by local authority.",
  "viewer.current": "Trusted Current proof did not match the committed cycle.",
  "viewer.security": "Trusted Security proof did not match the selected security.",
  "viewer.history": "Trusted History proof did not contain the committed cycle.",
  "scanner.execute": "Bounded Scanner proof did not match committed authority.",
  "producer.ownership": "Producer ownership was not valid during the live gate.",
  "producer.stop": "Verification producer did not stop cleanly.",
  "harness.input": "Live verification input is invalid."
});

class LiveVerificationError extends Error {
  constructor(checkpoint, code = "LIVE_ASSERTION_FAILED") {
    super(SAFE_FAILURE_MESSAGES[checkpoint] ?? "Live verification failed.");
    this.name = "LiveVerificationError";
    this.checkpoint = checkpoint;
    this.code = code;
  }
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertAt(condition, checkpoint, code = "LIVE_ASSERTION_FAILED") {
  if (!condition) throw new LiveVerificationError(checkpoint, code);
}

function checkpointError(error, checkpoint) {
  if (error instanceof LiveVerificationError) return error;
  return new LiveVerificationError(checkpoint, "LIVE_STEP_FAILED");
}

function normalizeCandidateCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{7,40}$/i.test(value)) {
    throw new TypeError("candidateCommit must be a 7-40 character hexadecimal Git commit.");
  }
  return value.toLowerCase();
}

export function providerOriginHost(origin) {
  assertNonEmptyString(origin, "providerOrigin");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("providerOrigin must be an HTTP(S) origin.");
  }
  return url.host;
}

export function browserVersionSummary(userAgent) {
  const value = typeof userAgent === "string" ? userAgent : "";
  for (const pattern of [
    /\bEdg\/([0-9.]+)/,
    /\bChromium\/([0-9.]+)/,
    /\bChrome\/([0-9.]+)/,
    /\bFirefox\/([0-9.]+)/,
    /\bVersion\/([0-9.]+).*\bSafari\//
  ]) {
    const match = value.match(pattern);
    if (match) {
      const family = pattern.source.includes("Edg") ? "Edg"
        : pattern.source.includes("Chromium") ? "Chromium"
          : pattern.source.includes("Chrome") ? "Chrome"
            : pattern.source.includes("Firefox") ? "Firefox"
              : "Safari";
      return `${family}/${match[1]}`;
    }
  }
  return "unknown";
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function failureReport({
  candidateCommit,
  browserVersion,
  originHost,
  producer,
  error,
  startedAtMs,
  completedAtMs
}) {
  const state = producer?.getState?.();
  return Object.freeze({
    verification: "market-scope-real-provider",
    candidateCommit,
    browserVersion,
    providerOriginHost: originHost,
    transportCspLna: state?.state === "ready" || state?.state === "stopped" ? "PASS" : "FAIL",
    overall: "FAIL",
    failure: Object.freeze({
      checkpoint: error.checkpoint,
      code: error.code,
      message: error.message
    }),
    startedAtMs,
    completedAtMs
  });
}

export async function runBoundedLiveVerification({
  candidateCommit,
  serviceUrl = DEFAULT_SERVICE_URL,
  productVersion = DEFAULT_PRODUCT_VERSION,
  providerOrigin = globalThis.location?.origin ?? "",
  userAgent = globalThis.navigator?.userAgent ?? "",
  recorderConfig = DEFAULT_RECORDER_CONFIG,
  now = () => Date.now(),
  loadUniverse = () => loadValidatedUniverse(),
  collectCycle = ({ universe, config }) => collectCompleteCycle({
    universe,
    chunkSize: config.chunkSize,
    chunkDelayMs: config.chunkDelayMs
  }),
  producerBridgeFactory = createProducerBridge,
  viewerClientFactory = createViewerClient
} = {}) {
  const clock = typeof now === "function" ? now : () => Date.now();
  const startedAtMs = clock();
  let originHost;
  let safeCandidateCommit = "unknown";
  let producer = null;
  let viewer = null;
  let failure = null;
  let proof = null;
  let sessionStarted = false;

  try {
    safeCandidateCommit = normalizeCandidateCommit(candidateCommit);
    assertNonEmptyString(serviceUrl, "serviceUrl");
    assertNonEmptyString(productVersion, "productVersion");
    if (typeof now !== "function") throw new TypeError("now must be a function.");
    if (typeof loadUniverse !== "function") throw new TypeError("loadUniverse must be a function.");
    if (typeof collectCycle !== "function") throw new TypeError("collectCycle must be a function.");
    if (typeof producerBridgeFactory !== "function") {
      throw new TypeError("producerBridgeFactory must be a function.");
    }
    if (typeof viewerClientFactory !== "function") {
      throw new TypeError("viewerClientFactory must be a function.");
    }

    originHost = providerOriginHost(providerOrigin);
  } catch {
    const completedAtMs = clock();
    return Object.freeze({
      verification: "market-scope-real-provider",
      candidateCommit: safeCandidateCommit,
      browserVersion: browserVersionSummary(userAgent),
      providerOriginHost: null,
      transportCspLna: "FAIL",
      overall: "FAIL",
      failure: Object.freeze({
        checkpoint: "harness.input",
        code: "LIVE_INPUT_INVALID",
        message: SAFE_FAILURE_MESSAGES["harness.input"]
      }),
      startedAtMs,
      completedAtMs
    });
  }

  const browserVersion = browserVersionSummary(userAgent);

  try {
    producer = producerBridgeFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-scope-live-producer-${startedAtMs}`,
      now
    });

    try {
      await producer.startSession(recorderConfig);
      sessionStarted = true;
    } catch (error) {
      throw checkpointError(error, "producer.start");
    }

    let universe;
    try {
      universe = await loadUniverse();
      assertAt(
        Number.isInteger(universe?.recordCount)
          && universe.recordCount > 0
          && Array.isArray(universe?.securities)
          && universe.securities.length === universe.recordCount,
        "provider.universe"
      );
    } catch (error) {
      throw checkpointError(error, "provider.universe");
    }

    let universeAck;
    try {
      universeAck = await producer.acceptUniverse(universe);
      assertAt(
        Number.isSafeInteger(universeAck?.universeRevision)
          && universeAck.universeRevision > 0
          && universeAck.recordCount === universe.recordCount,
        "producer.universe"
      );
    } catch (error) {
      throw checkpointError(error, "producer.universe");
    }

    let cycle;
    try {
      cycle = await collectCycle({ universe, config: recorderConfig });
      assertAt(
        cycle?.status === "complete"
          && cycle.requested === universe.recordCount
          && cycle.received === universe.recordCount
          && cycle.unique === universe.recordCount
          && cycle.missing === 0
          && cycle.duplicates === 0
          && cycle.unexpected === 0,
        "provider.cycle"
      );
    } catch (error) {
      throw checkpointError(error, "provider.cycle");
    }

    let commit;
    try {
      commit = await producer.commitCycle(cycle);
      assertAt(Number.isSafeInteger(commit?.cycleId) && commit.cycleId > 0, "producer.commit");
    } catch (error) {
      throw checkpointError(error, "producer.commit");
    }

    const selectedSecurityId = String(universe.securities[0].securityId);
    viewer = viewerClientFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-scope-live-viewer-${startedAtMs}`
    });

    let current;
    try {
      current = await viewer.getCurrent();
      assertAt(
        current?.summary?.rowCount === universe.recordCount
          && current?.summary?.lastCycleId === commit.cycleId
          && Array.isArray(current?.rows)
          && current.rows.length === universe.recordCount
          && current.rows.some((row) => String(row?.securityId) === selectedSecurityId),
        "viewer.current"
      );
    } catch (error) {
      throw checkpointError(error, "viewer.current");
    }

    let security;
    try {
      security = await viewer.getSecurity(selectedSecurityId);
      assertAt(
        security?.found === true
          && security?.isCurrent === true
          && String(security?.securityId) === selectedSecurityId
          && String(security?.currentRow?.securityId) === selectedSecurityId,
        "viewer.security"
      );
    } catch (error) {
      throw checkpointError(error, "viewer.security");
    }

    let history;
    try {
      history = await viewer.getHistoryPage(selectedSecurityId, null);
      assertAt(
        Array.isArray(history?.rows)
          && history.rows.some((row) => row?.cycleId === commit.cycleId),
        "viewer.history"
      );
    } catch (error) {
      throw checkpointError(error, "viewer.history");
    }

    let scanner;
    try {
      scanner = await viewer.executeScanner(
        `SELECT security_id, cycle_id FROM latest WHERE security_id = ${sqlStringLiteral(selectedSecurityId)} LIMIT 2`
      );
      assertAt(
        scanner?.rowCount === 1
          && Array.isArray(scanner?.rows)
          && scanner.rows.length === 1
          && String(scanner.rows[0]?.[0]) === selectedSecurityId
          && String(scanner.rows[0]?.[1]) === String(commit.cycleId),
        "scanner.execute"
      );
    } catch (error) {
      throw checkpointError(error, "scanner.execute");
    }

    try {
      const status = await viewer.getStatus();
      const producerState = producer.getState();
      assertAt(
        status?.recorderHealth === "RUNNING"
          && status?.lastCompletedCycleId === commit.cycleId
          && producerState?.state === "ready"
          && typeof producerState?.sessionId === "string"
          && producerState.sessionId.length > 0
          && producerState?.acknowledgedUniverseRevision === universeAck.universeRevision,
        "producer.ownership"
      );
    } catch (error) {
      throw checkpointError(error, "producer.ownership");
    }

    proof = {
      universeCount: universe.recordCount,
      cycleRequested: cycle.requested,
      cycleReceived: cycle.received,
      cycleUnique: cycle.unique,
      cycleId: commit.cycleId,
      currentRowCount: current.summary.rowCount,
      selectedSecurityId,
      historyProofCount: history.rows.filter((row) => row?.cycleId === commit.cycleId).length,
      historyCycleId: commit.cycleId,
      scannerRowCount: scanner.rowCount
    };
  } catch (error) {
    failure = error instanceof LiveVerificationError
      ? error
      : checkpointError(error, "harness.input");
  } finally {
    try {
      viewer?.close?.();
    } catch {
      // Viewer close is best-effort; producer clean stop is the authoritative live-gate cleanup.
    }

    if (sessionStarted && producer) {
      try {
        await producer.stopSession("live_verification_complete");
      } catch (error) {
        if (!failure) failure = checkpointError(error, "producer.stop");
      }
    }
  }

  const completedAtMs = now();
  if (failure) {
    return failureReport({
      candidateCommit: safeCandidateCommit,
      browserVersion,
      originHost,
      producer,
      error: failure,
      startedAtMs,
      completedAtMs
    });
  }

  return Object.freeze({
    verification: "market-scope-real-provider",
    candidateCommit: safeCandidateCommit,
    browserVersion,
    providerOriginHost: originHost,
    universeCount: proof.universeCount,
    cycle: Object.freeze({
      requested: proof.cycleRequested,
      received: proof.cycleReceived,
      unique: proof.cycleUnique
    }),
    cycleId: proof.cycleId,
    currentRowCount: proof.currentRowCount,
    selectedSecurityId: proof.selectedSecurityId,
    historyProofCount: proof.historyProofCount,
    historyCycleId: proof.historyCycleId,
    scannerProof: Object.freeze({
      rowCount: proof.scannerRowCount,
      securityIdMatched: true,
      cycleIdMatched: true
    }),
    transportCspLna: "PASS",
    producerOwnership: "PASS",
    cleanStop: true,
    overall: "PASS",
    startedAtMs,
    completedAtMs
  });
}
