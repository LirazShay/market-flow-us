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

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

function normalizeSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new TypeError("Replay source summary is required.");
  }

  const id = assertNonEmptyString(summary.id, "summary.id");
  const name = assertNonEmptyString(summary.name, "summary.name");
  if (summary.status !== "complete") {
    throw new Error("Replay source must be a complete recording.");
  }
  assertNonNegativeSafeInteger(summary.frameCount, "summary.frameCount");
  assertNonNegativeFinite(summary.durationMs, "summary.durationMs");
  assertNonNegativeFinite(summary.approximateBytes ?? 0, "summary.approximateBytes");

  const firstFrameAtMs = summary.firstFrameAtMs ?? null;
  const lastFrameAtMs = summary.lastFrameAtMs ?? null;
  if (summary.frameCount === 0) {
    if (firstFrameAtMs !== null || lastFrameAtMs !== null || summary.durationMs !== 0) {
      throw new Error("Empty Replay source timing metadata is inconsistent.");
    }
  } else {
    assertNonNegativeFinite(firstFrameAtMs, "summary.firstFrameAtMs");
    assertNonNegativeFinite(lastFrameAtMs, "summary.lastFrameAtMs");
    if (lastFrameAtMs < firstFrameAtMs) {
      throw new Error("Replay source completion times must not move backwards.");
    }
    if (summary.durationMs !== lastFrameAtMs - firstFrameAtMs) {
      throw new Error("Replay source duration does not match first/last frame timing.");
    }
  }

  return Object.freeze({
    id,
    name,
    status: "complete",
    createdAtMs: summary.createdAtMs ?? null,
    firstFrameAtMs,
    lastFrameAtMs,
    durationMs: summary.durationMs,
    frameCount: summary.frameCount,
    approximateBytes: summary.approximateBytes ?? 0,
    lastErrorCode: null
  });
}

function normalizeFrameIndex(frameIndex, summary) {
  if (!Array.isArray(frameIndex)) throw new TypeError("frameIndex must be an array.");
  if (frameIndex.length !== summary.frameCount) {
    throw new Error("Replay source frame index count does not match recording summary.");
  }

  const normalized = [];
  let previousCompletedAtMs = null;
  for (let sequence = 0; sequence < frameIndex.length; sequence += 1) {
    const entry = frameIndex[sequence];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Replay source frame index ${sequence} is invalid.`);
    }
    if (entry.sequence !== sequence) {
      throw new Error(`Replay source frame index expected sequence ${sequence}.`);
    }
    assertNonNegativeFinite(entry.completedAtMs, `frameIndex[${sequence}].completedAtMs`);
    if (previousCompletedAtMs !== null && entry.completedAtMs < previousCompletedAtMs) {
      throw new Error("Replay source frame completion times must be monotonic.");
    }
    previousCompletedAtMs = entry.completedAtMs;
    normalized.push(Object.freeze({ ...entry, sequence, completedAtMs: entry.completedAtMs }));
  }

  if (normalized.length > 0) {
    if (normalized[0].completedAtMs !== summary.firstFrameAtMs) {
      throw new Error("Replay source first-frame timing does not match recording summary.");
    }
    if (normalized.at(-1).completedAtMs !== summary.lastFrameAtMs) {
      throw new Error("Replay source last-frame timing does not match recording summary.");
    }
  }

  return Object.freeze(normalized);
}

function assertSequence(sequence, frameCount) {
  assertNonNegativeSafeInteger(sequence, "sequence");
  if (sequence >= frameCount) {
    throw new RangeError(`Replay frame sequence ${sequence} is outside the source.`);
  }
}

export function resolveFrameIndexAtOrBefore(frameIndex, completedAtMs) {
  assertNonNegativeFinite(completedAtMs, "completedAtMs");
  if (frameIndex.length === 0 || completedAtMs < frameIndex[0].completedAtMs) return null;

  let low = 0;
  let high = frameIndex.length - 1;
  let resolved = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (frameIndex[middle].completedAtMs <= completedAtMs) {
      resolved = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return resolved;
}

export function createRecordingSource({ kind, summary, frameIndex, readFrame }) {
  const sourceKind = assertNonEmptyString(kind, "kind");
  if (typeof readFrame !== "function") throw new TypeError("readFrame must be a function.");
  const normalizedSummary = normalizeSummary(summary);
  const normalizedIndex = normalizeFrameIndex(frameIndex, normalizedSummary);

  return Object.freeze({
    kind: sourceKind,
    getSummary() {
      return normalizedSummary;
    },
    getFrameIndex() {
      return normalizedIndex;
    },
    async getFrame(sequence) {
      assertSequence(sequence, normalizedSummary.frameCount);
      const stored = await readFrame(sequence, normalizedIndex[sequence]);
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
        throw new Error(`Replay source frame ${sequence} is missing.`);
      }
      if (stored.recordingId !== normalizedSummary.id || stored.sequence !== sequence) {
        throw new Error(`Replay source frame ${sequence} identity/order is invalid.`);
      }
      const frame = createReplayFrame({
        recordingId: normalizedSummary.id,
        sequence,
        snapshot: stored.snapshot
      });
      if (frame.snapshot.timing.completedAtMs !== normalizedIndex[sequence].completedAtMs) {
        throw new Error(`Replay source frame ${sequence} timing differs from its validated index.`);
      }
      return frame;
    },
    resolveFrameAtOrBefore(completedAtMs) {
      return resolveFrameIndexAtOrBefore(normalizedIndex, completedAtMs);
    }
  });
}

export async function createIndexedDbRecordingSource({ store, recordingId }) {
  if (!store || typeof store.getRecording !== "function" || typeof store.getFrame !== "function" || typeof store.readFrameIndex !== "function") {
    throw new TypeError("Replay IndexedDB store does not expose source reads.");
  }
  const id = assertNonEmptyString(recordingId, "recordingId");
  const summary = await store.getRecording(id);
  if (!summary) throw new Error("Replay recording does not exist.");
  const frameIndex = await store.readFrameIndex(id);

  return createRecordingSource({
    kind: "indexeddb",
    summary,
    frameIndex,
    readFrame: (sequence) => store.getFrame(id, sequence)
  });
}
