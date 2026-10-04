import { fetchValidatedSnapshot } from "../provider/us-screener.js";

function tagCollectionPhase(error, phase) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (!Object.hasOwn(normalized, "marketFlowUsPhase")) {
    Object.defineProperty(normalized, "marketFlowUsPhase", {
      value: phase,
      configurable: true,
      enumerable: false
    });
  }
  return normalized;
}

function assertValidatedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Validated U.S. snapshot is required.");
  if (!Number.isSafeInteger(snapshot.recordCount) || snapshot.recordCount <= 0) {
    throw new Error("Validated U.S. snapshot recordCount is invalid.");
  }
  if (!Array.isArray(snapshot.records) || snapshot.records.length !== snapshot.recordCount) {
    throw new Error("Validated U.S. snapshot records do not match recordCount.");
  }
  if (!Array.isArray(snapshot.responseIds) || snapshot.responseIds.length !== snapshot.recordCount) {
    throw new Error("Validated U.S. snapshot responseIds do not match recordCount.");
  }
  if (!snapshot.timing || typeof snapshot.timing !== "object") {
    throw new Error("Validated U.S. snapshot timing is missing.");
  }
}

export function buildUsCompleteCycle({ snapshot }) {
  assertValidatedSnapshot(snapshot);

  const securities = snapshot.records.map((rawSecurity, index) => {
    const securityId = String(rawSecurity.PaperId);
    if (securityId !== snapshot.responseIds[index]) {
      throw new Error(`Validated U.S. snapshot identity mismatch at index ${index}.`);
    }
    return Object.freeze({
      securityId,
      chunkIndex: 0,
      chunkReceivedAtMs: snapshot.timing.responseReceivedAtMs,
      collectedAtMs: snapshot.timing.completedAtMs,
      sourceMetadata: snapshot.sourceMetadata,
      data: rawSecurity
    });
  });

  const chunk = Object.freeze({
    chunkIndex: 0,
    requested: snapshot.recordCount,
    received: snapshot.records.length,
    unique: snapshot.responseIds.length,
    requestStartedAtMs: snapshot.timing.startedAtMs,
    receivedAtMs: snapshot.timing.responseReceivedAtMs,
    completedAtMs: snapshot.timing.completedAtMs,
    durationMs: snapshot.timing.durationMs,
    httpStatus: snapshot.httpStatus,
    sourceMetadata: snapshot.sourceMetadata
  });

  return Object.freeze({
    status: "complete",
    startedAtMs: snapshot.timing.startedAtMs,
    completedAtMs: snapshot.timing.completedAtMs,
    durationMs: snapshot.timing.durationMs,
    requested: snapshot.recordCount,
    received: snapshot.records.length,
    unique: snapshot.responseIds.length,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: Object.freeze([chunk]),
    securities: Object.freeze(securities)
  });
}

export async function collectUsCompleteCycle({
  fetchSnapshot = () => fetchValidatedSnapshot()
} = {}) {
  if (typeof fetchSnapshot !== "function") throw new TypeError("fetchSnapshot must be a function.");

  let snapshot;
  try {
    snapshot = await fetchSnapshot();
  } catch (error) {
    throw tagCollectionPhase(error, "provider-fetch");
  }

  try {
    return buildUsCompleteCycle({ snapshot });
  } catch (error) {
    throw tagCollectionPhase(error, "cycle-validation");
  }
}
