import { collectUsCollectionCandidate } from "../collector/us-cycle.js";
import { sameCanonicalMembership } from "../provider/us-universe.js";
import { createUsRecorderConfig } from "../recorder/config.js";
import { createProducerBridge } from "../runtime/producer-bridge.js";
import { createViewerClient } from "../viewer/client.js";

const DEFAULT_SERVICE_URL = "ws://127.0.0.1:8765";
const DEFAULT_PRODUCT_VERSION = "0.1.0";
const DEFAULT_RECORDER_CONFIG = createUsRecorderConfig();

export const MIN_COMPLETE_CYCLES = 20;
export const MIN_RUN_DURATION_MS = 60_000;

const SAFE_FAILURE_MESSAGES = Object.freeze({
  "producer.start": "Producer hello/session start did not complete.",
  "provider.snapshot": "ScreenerHulPaging3 snapshot acquisition or validation did not complete.",
  "producer.universe": "Validated U.S. universe was not acknowledged by local authority.",
  "producer.commit": "Complete U.S. cycle was not durably acknowledged by local authority.",
  "sustained.run": "The bounded sustained U.S. provider run did not satisfy its minimum proof.",
  "viewer.current": "Trusted Current proof did not match the final committed cycle.",
  "viewer.security": "Trusted Security proof did not match the selected security.",
  "viewer.history": "Trusted History proof did not contain the committed live cycles.",
  "scanner.execute": "Bounded Scanner proof did not match final committed authority.",
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

function defaultWait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function validateCandidate(candidate) {
  const universe = candidate?.universe;
  const cycle = candidate?.cycle;
  assertAt(
    universe
      && cycle
      && Number.isSafeInteger(universe.recordCount)
      && universe.recordCount > 0
      && Array.isArray(universe.membership)
      && universe.membership.length === universe.recordCount
      && Array.isArray(universe.securities)
      && universe.securities.length === universe.recordCount,
    "provider.snapshot"
  );
  assertAt(
    cycle.status === "complete"
      && cycle.requested === universe.recordCount
      && cycle.received === universe.recordCount
      && cycle.unique === universe.recordCount
      && cycle.missing === 0
      && cycle.duplicates === 0
      && cycle.unexpected === 0
      && Array.isArray(cycle.chunks)
      && cycle.chunks.length === 1
      && cycle.chunks[0]?.chunkIndex === 0
      && Array.isArray(cycle.securities)
      && cycle.securities.length === universe.recordCount,
    "provider.snapshot"
  );
  return candidate;
}

function intersectMembership(existing, membership) {
  const current = new Set(membership.map(String));
  if (existing === null) return current;
  return new Set([...existing].filter((securityId) => current.has(securityId)));
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function progressSnapshot({
  completedCycles,
  commitAckCount,
  universeAckCount,
  lastCycleId,
  sustainedStartedAtMs,
  now
}) {
  return Object.freeze({
    completedCycles,
    commitAckCount,
    universeAckCount,
    lastCycleId,
    elapsedMs: sustainedStartedAtMs === null ? 0 : Math.max(0, now() - sustainedStartedAtMs)
  });
}

function failureReport({
  candidateCommit,
  browserVersion,
  originHost,
  producer,
  error,
  lastSuccessfulCheckpoint,
  progress,
  startedAtMs,
  completedAtMs
}) {
  const state = producer?.getState?.();
  return Object.freeze({
    verification: "market-flow-us-real-provider",
    candidateCommit,
    browserVersion,
    providerOriginHost: originHost,
    transportCspLna: state?.state === "ready" || state?.state === "stopped" ? "PASS" : "FAIL",
    lastSuccessfulCheckpoint,
    progress,
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

export async function runBoundedLiveVerification({
  candidateCommit,
  serviceUrl = DEFAULT_SERVICE_URL,
  productVersion = DEFAULT_PRODUCT_VERSION,
  providerOrigin = globalThis.location?.origin ?? "",
  userAgent = globalThis.navigator?.userAgent ?? "",
  recorderConfig = DEFAULT_RECORDER_CONFIG,
  now = () => Date.now(),
  wait = defaultWait,
  collectCandidate = () => collectUsCollectionCandidate(),
  producerBridgeFactory = createProducerBridge,
  viewerClientFactory = createViewerClient
} = {}) {
  const clock = typeof now === "function" ? now : () => Date.now();
  const startedAtMs = clock();
  let originHost;
  let safeCandidateCommit = "unknown";
  let safeRecorderConfig;
  let producer = null;
  let viewer = null;
  let failure = null;
  let proof = null;
  let sessionStarted = false;
  let lastSuccessfulCheckpoint = null;
  let sustainedStartedAtMs = null;
  let completedCycles = 0;
  let commitAckCount = 0;
  let universeAckCount = 0;
  let lastCycleId = null;

  try {
    safeCandidateCommit = normalizeCandidateCommit(candidateCommit);
    assertNonEmptyString(serviceUrl, "serviceUrl");
    assertNonEmptyString(productVersion, "productVersion");
    if (typeof now !== "function") throw new TypeError("now must be a function.");
    if (typeof wait !== "function") throw new TypeError("wait must be a function.");
    if (typeof collectCandidate !== "function") throw new TypeError("collectCandidate must be a function.");
    if (typeof producerBridgeFactory !== "function") {
      throw new TypeError("producerBridgeFactory must be a function.");
    }
    if (typeof viewerClientFactory !== "function") {
      throw new TypeError("viewerClientFactory must be a function.");
    }

    safeRecorderConfig = createUsRecorderConfig(recorderConfig);
    if (safeRecorderConfig.snapshotIntervalMs <= 0) {
      throw new TypeError("Live verification snapshotIntervalMs must be greater than zero.");
    }
    originHost = providerOriginHost(providerOrigin);
  } catch {
    const completedAtMs = clock();
    return Object.freeze({
      verification: "market-flow-us-real-provider",
      candidateCommit: safeCandidateCommit,
      browserVersion: browserVersionSummary(userAgent),
      providerOriginHost: null,
      transportCspLna: "FAIL",
      lastSuccessfulCheckpoint: null,
      progress: Object.freeze({
        completedCycles: 0,
        commitAckCount: 0,
        universeAckCount: 0,
        lastCycleId: null,
        elapsedMs: 0
      }),
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
  const committedCycleIds = [];
  const universeRevisions = new Set();
  let currentUniverse = null;
  let commonMembership = null;
  let finalCandidate = null;
  let firstCycleId = null;

  try {
    producer = producerBridgeFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-flow-us-live-producer-${startedAtMs}`,
      now
    });

    try {
      await producer.startSession(safeRecorderConfig);
      sessionStarted = true;
      lastSuccessfulCheckpoint = "producer.start";
    } catch (error) {
      throw checkpointError(error, "producer.start");
    }

    sustainedStartedAtMs = clock();

    while (true) {
      const cycleStartedAtMs = clock();
      let candidate;
      try {
        candidate = validateCandidate(await collectCandidate({ config: safeRecorderConfig }));
        lastSuccessfulCheckpoint = "provider.snapshot";
      } catch (error) {
        throw checkpointError(error, "provider.snapshot");
      }

      commonMembership = intersectMembership(commonMembership, candidate.universe.membership);

      const membershipChanged = currentUniverse === null
        || !sameCanonicalMembership(currentUniverse.membership, candidate.universe.membership);

      if (membershipChanged) {
        try {
          const universeAck = await producer.acceptUniverse(candidate.universe);
          assertAt(
            Number.isSafeInteger(universeAck?.universeRevision)
              && universeAck.universeRevision > 0
              && universeAck.recordCount === candidate.universe.recordCount,
            "producer.universe"
          );
          currentUniverse = candidate.universe;
          universeAckCount += 1;
          universeRevisions.add(universeAck.universeRevision);
          lastSuccessfulCheckpoint = "producer.universe";
        } catch (error) {
          throw checkpointError(error, "producer.universe");
        }
      }

      let commit;
      try {
        commit = await producer.commitCycle(candidate.cycle);
        assertAt(Number.isSafeInteger(commit?.cycleId) && commit.cycleId > 0, "producer.commit");
        commitAckCount += 1;
        completedCycles += 1;
        committedCycleIds.push(commit.cycleId);
        firstCycleId ??= commit.cycleId;
        lastCycleId = commit.cycleId;
        finalCandidate = candidate;
        lastSuccessfulCheckpoint = "producer.commit";
      } catch (error) {
        throw checkpointError(error, "producer.commit");
      }

      const elapsedMs = Math.max(0, clock() - sustainedStartedAtMs);
      if (completedCycles >= MIN_COMPLETE_CYCLES && elapsedMs >= MIN_RUN_DURATION_MS) {
        break;
      }

      const cycleElapsedMs = Math.max(0, clock() - cycleStartedAtMs);
      await wait(Math.max(0, safeRecorderConfig.snapshotIntervalMs - cycleElapsedMs));
    }

    const sustainedDurationMs = Math.max(0, clock() - sustainedStartedAtMs);
    assertAt(
      completedCycles >= MIN_COMPLETE_CYCLES
        && commitAckCount === completedCycles
        && sustainedDurationMs >= MIN_RUN_DURATION_MS
        && finalCandidate !== null,
      "sustained.run"
    );
    lastSuccessfulCheckpoint = "sustained.run";

    const selectedSecurityId = [...commonMembership].sort()[0] ?? null;
    assertAt(selectedSecurityId !== null, "viewer.history");

    viewer = viewerClientFactory({
      url: serviceUrl,
      productVersion,
      clientInstanceId: `market-flow-us-live-viewer-${startedAtMs}`
    });

    let current;
    try {
      current = await viewer.getCurrent();
      assertAt(
        current?.summary?.rowCount === finalCandidate.universe.recordCount
          && String(current?.summary?.lastCycleId) === String(lastCycleId)
          && Array.isArray(current?.rows)
          && current.rows.length === finalCandidate.universe.recordCount
          && current.rows.some((row) => String(row?.securityId) === selectedSecurityId),
        "viewer.current"
      );
      lastSuccessfulCheckpoint = "viewer.current";
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
      lastSuccessfulCheckpoint = "viewer.security";
    } catch (error) {
      throw checkpointError(error, "viewer.security");
    }

    let history;
    try {
      history = await viewer.getHistoryPage(selectedSecurityId, null);
      const historyCycleIds = new Set((history?.rows ?? []).map((row) => String(row?.cycleId)));
      assertAt(
        Array.isArray(history?.rows)
          && committedCycleIds.every((cycleId) => historyCycleIds.has(String(cycleId))),
        "viewer.history"
      );
      lastSuccessfulCheckpoint = "viewer.history";
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
          && String(scanner.rows[0]?.[1]) === String(lastCycleId),
        "scanner.execute"
      );
      lastSuccessfulCheckpoint = "scanner.execute";
    } catch (error) {
      throw checkpointError(error, "scanner.execute");
    }

    try {
      const status = await viewer.getStatus();
      const producerState = producer.getState();
      assertAt(
        status?.recorderHealth === "RUNNING"
          && String(status?.lastCompletedCycleId) === String(lastCycleId)
          && producerState?.state === "ready"
          && typeof producerState?.sessionId === "string"
          && producerState.sessionId.length > 0
          && Number.isSafeInteger(producerState?.acknowledgedUniverseRevision)
          && producerState.acknowledgedUniverseRevision > 0,
        "producer.ownership"
      );
      lastSuccessfulCheckpoint = "producer.ownership";
    } catch (error) {
      throw checkpointError(error, "producer.ownership");
    }

    proof = {
      finalUniverseCount: finalCandidate.universe.recordCount,
      finalCycle: finalCandidate.cycle,
      completedCycles,
      commitAckCount,
      sustainedDurationMs,
      firstCycleId,
      lastCycleId,
      universeAckCount,
      universeRevisionCount: universeRevisions.size,
      selectedSecurityId,
      historyProofCount: committedCycleIds.length,
      scannerRowCount: scanner.rowCount,
      snapshotIntervalMs: safeRecorderConfig.snapshotIntervalMs
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

  const completedAtMs = clock();
  if (failure) {
    return failureReport({
      candidateCommit: safeCandidateCommit,
      browserVersion,
      originHost,
      producer,
      error: failure,
      lastSuccessfulCheckpoint,
      progress: progressSnapshot({
        completedCycles,
        commitAckCount,
        universeAckCount,
        lastCycleId,
        sustainedStartedAtMs,
        now: clock
      }),
      startedAtMs,
      completedAtMs
    });
  }

  return Object.freeze({
    verification: "market-flow-us-real-provider",
    candidateCommit: safeCandidateCommit,
    browserVersion,
    providerOriginHost: originHost,
    universeCount: proof.finalUniverseCount,
    cycle: Object.freeze({
      requested: proof.finalCycle.requested,
      received: proof.finalCycle.received,
      unique: proof.finalCycle.unique
    }),
    cycleId: proof.lastCycleId,
    sustainedRun: Object.freeze({
      minimumCompleteCycles: MIN_COMPLETE_CYCLES,
      minimumDurationMs: MIN_RUN_DURATION_MS,
      snapshotIntervalMs: proof.snapshotIntervalMs,
      completedCycles: proof.completedCycles,
      commitAckCount: proof.commitAckCount,
      durationMs: proof.sustainedDurationMs,
      firstCycleId: proof.firstCycleId,
      lastCycleId: proof.lastCycleId,
      universeAckCount: proof.universeAckCount,
      universeRevisionCount: proof.universeRevisionCount
    }),
    currentRowCount: proof.finalUniverseCount,
    selectedSecurityId: proof.selectedSecurityId,
    historyProofCount: proof.historyProofCount,
    historyCycleId: proof.lastCycleId,
    scannerProof: Object.freeze({
      rowCount: proof.scannerRowCount,
      securityIdMatched: true,
      cycleIdMatched: true
    }),
    transportCspLna: "PASS",
    producerOwnership: "PASS",
    lastSuccessfulCheckpoint,
    cleanStop: true,
    overall: "PASS",
    startedAtMs,
    completedAtMs
  });
}
