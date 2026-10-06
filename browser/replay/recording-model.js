import { buildUsCollectionCandidate } from "../collector/us-cycle.js";

export const REPLAY_RECORDING_FORMAT = "market-flow-us-recording";
export const REPLAY_RECORDING_VERSION = 1;

const encoder = new TextEncoder();

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function assertNonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertSnapshotIdentity(snapshot) {
  if (!Array.isArray(snapshot?.responseIds) || !Array.isArray(snapshot?.membership)) {
    throw new Error("Validated replay snapshot identity evidence is missing.");
  }
  if (snapshot.responseIds.length !== snapshot.recordCount || snapshot.membership.length !== snapshot.recordCount) {
    throw new Error("Validated replay snapshot identity evidence does not match recordCount.");
  }
  const expectedMembership = [...snapshot.responseIds].sort();
  if (!expectedMembership.every((securityId, index) => securityId === snapshot.membership[index])) {
    throw new Error("Validated replay snapshot membership does not match responseIds.");
  }
}

function assertSnapshotTiming(snapshot) {
  const timing = snapshot?.timing;
  for (const key of ["startedAtMs", "responseReceivedAtMs", "completedAtMs"]) {
    if (!Number.isFinite(timing?.[key]) || timing[key] < 0) {
      throw new Error(`Validated replay snapshot timing.${key} is invalid.`);
    }
  }
  if (timing.responseReceivedAtMs < timing.startedAtMs || timing.completedAtMs < timing.responseReceivedAtMs) {
    throw new Error("Validated replay snapshot timing order is invalid.");
  }
}

export function normalizeRecordingName(value, fallback = "Market Replay recording") {
  const candidate = typeof value === "string" ? value.trim() : "";
  const normalized = candidate.length > 0 ? candidate : fallback;
  if (normalized.length > 120) {
    throw new Error("Recording name must be at most 120 characters.");
  }
  return normalized;
}

export function createReplayFrame({ recordingId, sequence, snapshot }) {
  assertNonEmptyString(recordingId, "recordingId");
  assertNonNegativeSafeInteger(sequence, "sequence");

  // Reuse the normal U.S. candidate contract before any snapshot becomes recording evidence.
  buildUsCollectionCandidate(snapshot);
  assertSnapshotIdentity(snapshot);
  assertSnapshotTiming(snapshot);

  if (!Number.isInteger(snapshot.httpStatus) || snapshot.httpStatus < 200 || snapshot.httpStatus >= 300) {
    throw new Error("Validated replay snapshot httpStatus is invalid.");
  }

  return Object.freeze({
    recordingId,
    sequence,
    snapshot: Object.freeze({
      recordCount: snapshot.recordCount,
      records: Object.freeze(cloneJson(snapshot.records)),
      responseIds: Object.freeze([...snapshot.responseIds]),
      membership: Object.freeze([...snapshot.membership]),
      sourceMetadata: Object.freeze(cloneJson(snapshot.sourceMetadata ?? {})),
      httpStatus: snapshot.httpStatus,
      timing: Object.freeze(cloneJson(snapshot.timing))
    })
  });
}

export function approximateJsonBytes(value) {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function createRecordingMetadata({ recordingId, name, createdAtMs }) {
  assertNonEmptyString(recordingId, "recordingId");
  assertNonNegativeSafeInteger(createdAtMs, "createdAtMs");

  return Object.freeze({
    recordingId,
    name: normalizeRecordingName(name),
    format: REPLAY_RECORDING_FORMAT,
    version: REPLAY_RECORDING_VERSION,
    status: "recording",
    terminalReason: null,
    createdAtMs,
    updatedAtMs: createdAtMs,
    originalStartedAtMs: null,
    originalCompletedAtMs: null,
    originalDurationMs: 0,
    frameCount: 0,
    approximateBytes: 0
  });
}
