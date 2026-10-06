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
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("not serializable");
    return JSON.parse(serialized);
  } catch {
    throw new TypeError("Replay recording values must be JSON serializable.");
  }
}

function assertSnapshotIdentity(snapshot) {
  if (!Array.isArray(snapshot?.responseIds) || !Array.isArray(snapshot?.membership)) {
    throw new Error("Validated Replay snapshot identity evidence is missing.");
  }
  if (snapshot.responseIds.length !== snapshot.recordCount || snapshot.membership.length !== snapshot.recordCount) {
    throw new Error("Validated Replay snapshot identity evidence does not match recordCount.");
  }
  const expectedMembership = [...snapshot.responseIds].sort();
  if (!expectedMembership.every((securityId, index) => securityId === snapshot.membership[index])) {
    throw new Error("Validated Replay snapshot membership does not match responseIds.");
  }
}

function assertSnapshotTiming(snapshot) {
  const timing = snapshot?.timing;
  for (const key of ["startedAtMs", "responseReceivedAtMs", "completedAtMs"]) {
    if (!Number.isFinite(timing?.[key]) || timing[key] < 0) {
      throw new Error(`Validated Replay snapshot timing.${key} is invalid.`);
    }
  }
  if (timing.responseReceivedAtMs < timing.startedAtMs || timing.completedAtMs < timing.responseReceivedAtMs) {
    throw new Error("Validated Replay snapshot timing order is invalid.");
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

export function createRecordingId({
  nowMs,
  random = () => globalThis.crypto.getRandomValues(new Uint32Array(2))
}) {
  assertNonNegativeSafeInteger(nowMs, "nowMs");
  const values = random();
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError("random() must return iterable numeric values.");
  }
  const suffix = [...values]
    .map((value) => Number(value).toString(16).padStart(8, "0"))
    .join("");
  if (!/^[0-9a-f]{16,}$/u.test(suffix)) {
    throw new Error("random() must provide at least 64 bits of numeric entropy.");
  }
  return `replay-${nowMs.toString(36)}-${suffix}`;
}

export function createReplayFrame({ recordingId, sequence, snapshot }) {
  assertNonEmptyString(recordingId, "recordingId");
  assertNonNegativeSafeInteger(sequence, "sequence");

  // The normal U.S. candidate contract remains the validation authority.
  buildUsCollectionCandidate(snapshot);
  assertSnapshotIdentity(snapshot);
  assertSnapshotTiming(snapshot);

  if (!Number.isInteger(snapshot.httpStatus) || snapshot.httpStatus < 200 || snapshot.httpStatus >= 300) {
    throw new Error("Validated Replay snapshot httpStatus is invalid.");
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
  const id = assertNonEmptyString(recordingId, "recordingId");
  assertNonNegativeSafeInteger(createdAtMs, "createdAtMs");

  return Object.freeze({
    recordingId: id,
    name: normalizeRecordingName(name),
    format: REPLAY_RECORDING_FORMAT,
    version: REPLAY_RECORDING_VERSION,
    // Persist incomplete until a clean Stop commits completion. A storage failure therefore fails safe.
    status: "incomplete",
    createdAtMs,
    firstFrameAtMs: null,
    lastFrameAtMs: null,
    frameCount: 0,
    approximateBytes: 0,
    lastErrorCode: null
  });
}

export function toRecordingSummary(recording) {
  if (!recording || typeof recording !== "object") throw new TypeError("recording is required.");
  const firstFrameAtMs = recording.firstFrameAtMs ?? null;
  const lastFrameAtMs = recording.lastFrameAtMs ?? null;
  return Object.freeze({
    id: recording.recordingId,
    name: recording.name,
    status: recording.status,
    createdAtMs: recording.createdAtMs,
    firstFrameAtMs,
    lastFrameAtMs,
    durationMs: firstFrameAtMs === null || lastFrameAtMs === null
      ? 0
      : Math.max(0, lastFrameAtMs - firstFrameAtMs),
    frameCount: recording.frameCount,
    approximateBytes: recording.approximateBytes,
    lastErrorCode: recording.lastErrorCode ?? null
  });
}
