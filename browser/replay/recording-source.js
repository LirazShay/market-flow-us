import { createReplayFrame } from "./recording-model.js";

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

function assertOptionalTimestamp(value, name) {
  if (value === null) return;
  assertNonNegativeSafeInteger(value, name);
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("Replay source metadata is required.");
  }

  const recordingId = assertNonEmptyString(metadata.recordingId, "metadata.recordingId");
  assertNonNegativeSafeInteger(metadata.frameCount, "metadata.frameCount");
  assertOptionalTimestamp(metadata.originalStartedAtMs, "metadata.originalStartedAtMs");
  assertOptionalTimestamp(metadata.originalCompletedAtMs, "metadata.originalCompletedAtMs");
  assertNonNegativeSafeInteger(metadata.originalDurationMs, "metadata.originalDurationMs");

  if (metadata.frameCount === 0) {
    if (metadata.originalStartedAtMs !== null || metadata.originalCompletedAtMs !== null || metadata.originalDurationMs !== 0) {
      throw new Error("Empty Replay source timing metadata is inconsistent.");
    }
  } else {
    if (metadata.originalStartedAtMs === null || metadata.originalCompletedAtMs === null) {
      throw new Error("Non-empty Replay source requires original start/end timing.");
    }
    if (metadata.originalCompletedAtMs < metadata.originalStartedAtMs) {
      throw new Error("Replay source original completion cannot precede start.");
    }
    if (metadata.originalDurationMs !== metadata.originalCompletedAtMs - metadata.originalStartedAtMs) {
      throw new Error("Replay source original duration does not match start/end timing.");
    }
  }

  return Object.freeze({
    recordingId,
    frameCount: metadata.frameCount,
    originalStartedAtMs: metadata.originalStartedAtMs,
    originalCompletedAtMs: metadata.originalCompletedAtMs,
    originalDurationMs: metadata.originalDurationMs
  });
}

function normalizeFrame(frame, metadata, sequence) {
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    throw new Error(`Replay source frame ${sequence} is missing.`);
  }
  if (frame.recordingId !== metadata.recordingId || frame.sequence !== sequence) {
    throw new Error(`Replay source frame ${sequence} identity/order is invalid.`);
  }
  return createReplayFrame({
    recordingId: metadata.recordingId,
    sequence,
    snapshot: frame.snapshot
  });
}

function normalizeFrameIndex(index, metadata) {
  if (!Array.isArray(index) || index.length !== metadata.frameCount) {
    throw new Error("Replay source frame index count does not match metadata.");
  }

  const normalized = index.map((entry, sequence) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Replay source frame index ${sequence} is invalid.`);
    }
    if (entry.sequence !== sequence) {
      throw new Error(`Replay source frame index sequence must be ${sequence}.`);
    }
    assertNonNegativeSafeInteger(entry.completedAtMs, `frameIndex[${sequence}].completedAtMs`);
    if (sequence > 0 && entry.completedAtMs < index[sequence - 1].completedAtMs) {
      throw new Error("Replay source frame completion times must be non-decreasing.");
    }
    return Object.freeze({ sequence, completedAtMs: entry.completedAtMs });
  });

  if (metadata.frameCount > 0) {
    if (normalized[0].completedAtMs !== metadata.originalStartedAtMs) {
      throw new Error("Replay source first frame timing does not match metadata.");
    }
    if (normalized.at(-1).completedAtMs !== metadata.originalCompletedAtMs) {
      throw new Error("Replay source last frame timing does not match metadata.");
    }
  }

  return Object.freeze(normalized);
}

export function createRecordingSource({
  kind,
  metadata,
  readFrame,
  loadFrameIndex = null
}) {
  const sourceKind = assertNonEmptyString(kind, "kind");
  const normalizedMetadata = normalizeMetadata(metadata);
  if (typeof readFrame !== "function") throw new TypeError("readFrame must be a function.");
  if (loadFrameIndex !== null && typeof loadFrameIndex !== "function") {
    throw new TypeError("loadFrameIndex must be a function when provided.");
  }

  let frameIndexPromise = null;

  async function readValidatedFrame(sequence) {
    assertNonNegativeSafeInteger(sequence, "sequence");
    if (sequence >= normalizedMetadata.frameCount) {
      throw new RangeError(`Replay frame sequence ${sequence} is outside the recording.`);
    }
    return normalizeFrame(await readFrame(sequence), normalizedMetadata, sequence);
  }

  async function buildDefaultIndex() {
    const entries = [];
    for (let sequence = 0; sequence < normalizedMetadata.frameCount; sequence += 1) {
      const frame = await readValidatedFrame(sequence);
      entries.push({ sequence, completedAtMs: frame.snapshot.timing.completedAtMs });
    }
    return entries;
  }

  async function getFrameIndex() {
    frameIndexPromise ??= Promise.resolve()
      .then(() => loadFrameIndex ? loadFrameIndex() : buildDefaultIndex())
      .then((index) => normalizeFrameIndex(index, normalizedMetadata));
    return frameIndexPromise;
  }

  async function resolveFrameAtOrBefore(offsetMs) {
    if (!Number.isFinite(offsetMs) || offsetMs < 0) {
      throw new TypeError("offsetMs must be a non-negative finite number.");
    }
    const index = await getFrameIndex();
    if (index.length === 0) return null;

    const startedAtMs = normalizedMetadata.originalStartedAtMs;
    let low = 0;
    let high = index.length - 1;
    let answer = 0;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const elapsedMs = index[middle].completedAtMs - startedAtMs;
      if (elapsedMs <= offsetMs) {
        answer = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return answer;
  }

  return Object.freeze({
    kind: sourceKind,
    metadata: normalizedMetadata,
    readFrame: readValidatedFrame,
    getFrameIndex,
    resolveFrameAtOrBefore
  });
}

export async function createIndexedDbRecordingSource({ store, recordingId }) {
  if (!store || typeof store.getRecording !== "function" || typeof store.readFrame !== "function") {
    throw new TypeError("Replay IndexedDB source requires getRecording/readFrame store methods.");
  }
  const id = assertNonEmptyString(recordingId, "recordingId");
  const summary = await store.getRecording(id);
  if (!summary) throw new Error("Replay recording does not exist.");
  if (summary.status !== "complete") {
    throw new Error("Only complete Replay recordings can become playback/export sources.");
  }

  return createRecordingSource({
    kind: "indexeddb",
    metadata: {
      recordingId: id,
      frameCount: summary.frameCount,
      originalStartedAtMs: summary.firstFrameAtMs,
      originalCompletedAtMs: summary.lastFrameAtMs,
      originalDurationMs: summary.durationMs
    },
    readFrame: (sequence) => store.readFrame(id, sequence)
  });
}
