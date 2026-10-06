import { createReplayFrame } from "./recording-model.js";
import {
  createIndexedDbRecordingSource,
  createRecordingSource
} from "./recording-source.js";

export const PORTABLE_REPLAY_FORMAT = "market-flow-us-replay";
export const PORTABLE_REPLAY_VERSION = 1;
export const MAX_BLOB_FALLBACK_BYTES = 32 * 1024 * 1024;

const encoder = new TextEncoder();
const SNAPSHOT_KEYS = Object.freeze([
  "httpStatus",
  "membership",
  "recordCount",
  "records",
  "responseIds",
  "sourceMetadata",
  "timing"
]);

export class ReplayPortableError extends Error {
  constructor(code, message, options = undefined) {
    super(message, options);
    this.name = "ReplayPortableError";
    this.code = code;
  }
}

function fail(code, message, cause = undefined) {
  throw new ReplayPortableError(code, message, cause === undefined ? undefined : { cause });
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("REPLAY_FILE_INVALID", `${label} must be an object.`);
  }
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("REPLAY_FILE_INVALID", `${label} contains unexpected or missing fields.`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("REPLAY_FILE_INVALID", `${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertNonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("REPLAY_FILE_INVALID", `${label} must be a non-negative safe integer.`);
  }
}

function assertNonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    fail("REPLAY_FILE_INVALID", `${label} must be a non-negative finite number.`);
  }
}

function parseJsonLine(text, lineNumber) {
  if (typeof text !== "string" || text.length === 0) {
    fail("REPLAY_FILE_INVALID", `Replay file line ${lineNumber} is empty.`);
  }
  try {
    const value = JSON.parse(text);
    assertObject(value, `Replay file line ${lineNumber}`);
    return value;
  } catch (error) {
    if (error instanceof ReplayPortableError) throw error;
    fail("REPLAY_FILE_INVALID", `Replay file line ${lineNumber} is not valid JSON.`, error);
  }
}

function validateManifest(record) {
  assertExactKeys(record, [
    "type",
    "format",
    "version",
    "recordingId",
    "name",
    "frameCount",
    "originalStartedAtMs",
    "originalCompletedAtMs",
    "originalDurationMs"
  ], "Replay manifest");
  if (record.type !== "manifest") fail("REPLAY_FILE_INVALID", "Replay file must start with a manifest line.");
  if (record.format !== PORTABLE_REPLAY_FORMAT) fail("REPLAY_FILE_UNSUPPORTED", "Replay file format is unsupported.");
  if (record.version !== PORTABLE_REPLAY_VERSION) fail("REPLAY_FILE_UNSUPPORTED", "Replay file version is unsupported.");
  const recordingId = assertNonEmptyString(record.recordingId, "manifest.recordingId");
  const name = assertNonEmptyString(record.name, "manifest.name");
  if (name.length > 120) fail("REPLAY_FILE_INVALID", "manifest.name is too long.");
  assertNonNegativeSafeInteger(record.frameCount, "manifest.frameCount");
  assertNonNegativeFinite(record.originalDurationMs, "manifest.originalDurationMs");

  if (record.frameCount === 0) {
    if (record.originalStartedAtMs !== null || record.originalCompletedAtMs !== null || record.originalDurationMs !== 0) {
      fail("REPLAY_FILE_INVALID", "Empty Replay manifest timing is inconsistent.");
    }
  } else {
    assertNonNegativeFinite(record.originalStartedAtMs, "manifest.originalStartedAtMs");
    assertNonNegativeFinite(record.originalCompletedAtMs, "manifest.originalCompletedAtMs");
    if (record.originalCompletedAtMs < record.originalStartedAtMs) {
      fail("REPLAY_FILE_INVALID", "Replay manifest completion time precedes its start time.");
    }
    if (record.originalDurationMs !== record.originalCompletedAtMs - record.originalStartedAtMs) {
      fail("REPLAY_FILE_INVALID", "Replay manifest duration does not match start/end timing.");
    }
  }

  return Object.freeze({ ...record, recordingId, name });
}

function validateFrameRecord(record, manifest, expectedSequence) {
  assertExactKeys(record, ["type", "sequence", "snapshot"], `Replay frame ${expectedSequence}`);
  if (record.type !== "frame") fail("REPLAY_FILE_INVALID", `Replay frame ${expectedSequence} has the wrong line type.`);
  if (record.sequence !== expectedSequence) {
    fail("REPLAY_FILE_INVALID", `Replay frame sequence expected ${expectedSequence} but received ${record.sequence}.`);
  }
  assertObject(record.snapshot, `Replay frame ${expectedSequence}.snapshot`);
  assertExactKeys(record.snapshot, SNAPSHOT_KEYS, `Replay frame ${expectedSequence}.snapshot`);

  try {
    return createReplayFrame({
      recordingId: manifest.recordingId,
      sequence: expectedSequence,
      snapshot: record.snapshot
    });
  } catch (error) {
    fail("REPLAY_FILE_INVALID", `Replay frame ${expectedSequence} failed validated snapshot checks.`, error);
  }
}

function validateFooter(record, manifest, observedFrameCount) {
  assertExactKeys(record, [
    "type",
    "format",
    "version",
    "recordingId",
    "frameCount",
    "terminalSequence"
  ], "Replay footer");
  if (record.type !== "footer") fail("REPLAY_FILE_INVALID", "Replay file is missing its terminal footer.");
  if (record.format !== manifest.format || record.version !== manifest.version || record.recordingId !== manifest.recordingId) {
    fail("REPLAY_FILE_INVALID", "Replay footer does not agree with the manifest identity/version.");
  }
  if (record.frameCount !== manifest.frameCount || record.frameCount !== observedFrameCount) {
    fail("REPLAY_FILE_INVALID", "Replay footer frame count does not agree with the manifest/file.");
  }
  const expectedTerminalSequence = observedFrameCount === 0 ? -1 : observedFrameCount - 1;
  if (record.terminalSequence !== expectedTerminalSequence) {
    fail("REPLAY_FILE_INVALID", "Replay footer terminal sequence is invalid.");
  }
  return Object.freeze({ ...record });
}

function concatBytes(left, right) {
  if (left.byteLength === 0) return right;
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function* readUtf8Lines(file) {
  if (!file || typeof file.stream !== "function" || typeof file.slice !== "function") {
    throw new TypeError("Portable Replay source must be a File/Blob-like object.");
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = new Uint8Array(0);
  let pendingStart = 0;
  let absoluteRead = 0;
  let lineNumber = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const dataStart = pending.byteLength > 0 ? pendingStart : absoluteRead;
      const data = concatBytes(pending, chunk);
      absoluteRead += chunk.byteLength;
      let segmentStart = 0;

      for (let index = 0; index < data.byteLength; index += 1) {
        if (data[index] !== 0x0A) continue;
        let text;
        try {
          text = decoder.decode(data.subarray(segmentStart, index));
        } catch (error) {
          fail("REPLAY_FILE_INVALID", `Replay file line ${lineNumber + 1} is not valid UTF-8.`, error);
        }
        if (text.endsWith("\r")) text = text.slice(0, -1);
        lineNumber += 1;
        yield Object.freeze({
          lineNumber,
          start: dataStart + segmentStart,
          end: dataStart + index,
          text
        });
        segmentStart = index + 1;
      }

      if (segmentStart < data.byteLength) {
        pending = data.slice(segmentStart);
        pendingStart = dataStart + segmentStart;
      } else {
        pending = new Uint8Array(0);
        pendingStart = absoluteRead;
      }
    }

    if (pending.byteLength > 0) {
      let text;
      try {
        text = decoder.decode(pending);
      } catch (error) {
        fail("REPLAY_FILE_INVALID", `Replay file line ${lineNumber + 1} is not valid UTF-8.`, error);
      }
      if (text.endsWith("\r")) text = text.slice(0, -1);
      lineNumber += 1;
      yield Object.freeze({
        lineNumber,
        start: pendingStart,
        end: pendingStart + pending.byteLength,
        text
      });
    }
  } finally {
    reader.releaseLock();
  }
}

function manifestFromSummary(summary) {
  return Object.freeze({
    type: "manifest",
    format: PORTABLE_REPLAY_FORMAT,
    version: PORTABLE_REPLAY_VERSION,
    recordingId: summary.id,
    name: summary.name,
    frameCount: summary.frameCount,
    originalStartedAtMs: summary.firstFrameAtMs,
    originalCompletedAtMs: summary.lastFrameAtMs,
    originalDurationMs: summary.durationMs
  });
}

function footerFromSummary(summary) {
  return Object.freeze({
    type: "footer",
    format: PORTABLE_REPLAY_FORMAT,
    version: PORTABLE_REPLAY_VERSION,
    recordingId: summary.id,
    frameCount: summary.frameCount,
    terminalSequence: summary.frameCount === 0 ? -1 : summary.frameCount - 1
  });
}

function lineFor(value) {
  return `${JSON.stringify(value)}\n`;
}

function asWriter(writable) {
  if (!writable) throw new TypeError("writable is required.");
  if (typeof writable.write === "function") {
    return { writer: writable, release: null };
  }
  if (typeof writable.getWriter === "function") {
    const writer = writable.getWriter();
    return { writer, release: () => writer.releaseLock() };
  }
  throw new TypeError("writable must expose write() or getWriter().");
}

export async function writePortableRecording({ source, writable, close = true }) {
  if (!source || typeof source.getSummary !== "function" || typeof source.getFrame !== "function") {
    throw new TypeError("source must implement the Replay recording source contract.");
  }
  const summary = source.getSummary();
  const manifest = validateManifest(manifestFromSummary(summary));
  const { writer, release } = asWriter(writable);
  let bytesWritten = 0;
  let completed = false;

  async function writeLine(value) {
    const line = lineFor(value);
    bytesWritten += encoder.encode(line).byteLength;
    await writer.write(line);
  }

  try {
    await writeLine(manifest);
    for (let sequence = 0; sequence < summary.frameCount; sequence += 1) {
      const frame = await source.getFrame(sequence);
      await writeLine({
        type: "frame",
        sequence,
        snapshot: frame.snapshot
      });
    }
    await writeLine(footerFromSummary(summary));
    if (close && typeof writer.close === "function") await writer.close();
    completed = true;
    return Object.freeze({
      format: PORTABLE_REPLAY_FORMAT,
      version: PORTABLE_REPLAY_VERSION,
      recordingId: summary.id,
      frameCount: summary.frameCount,
      bytesWritten
    });
  } catch (error) {
    if (!completed && typeof writer.abort === "function") {
      try {
        await writer.abort(error);
      } catch {
        // Preserve the original export failure.
      }
    }
    throw error;
  } finally {
    release?.();
  }
}

export async function validatePortableRecordingFile(file) {
  let manifest = null;
  let footer = null;
  const frameIndex = [];
  let expectedSequence = 0;
  let previousCompletedAtMs = null;

  for await (const line of readUtf8Lines(file)) {
    const record = parseJsonLine(line.text, line.lineNumber);
    if (footer) fail("REPLAY_FILE_INVALID", "Replay file contains data after its footer.");

    if (!manifest) {
      manifest = validateManifest(record);
      continue;
    }

    if (record.type === "footer") {
      footer = validateFooter(record, manifest, expectedSequence);
      continue;
    }

    const frame = validateFrameRecord(record, manifest, expectedSequence);
    const completedAtMs = frame.snapshot.timing.completedAtMs;
    if (previousCompletedAtMs !== null && completedAtMs < previousCompletedAtMs) {
      fail("REPLAY_FILE_INVALID", "Replay frame completion timing moves backwards.");
    }
    previousCompletedAtMs = completedAtMs;
    frameIndex.push(Object.freeze({
      sequence: expectedSequence,
      completedAtMs,
      byteStart: line.start,
      byteEnd: line.end
    }));
    expectedSequence += 1;
  }

  if (!manifest) fail("REPLAY_FILE_INVALID", "Replay file is empty or missing its manifest.");
  if (!footer) fail("REPLAY_FILE_INVALID", "Replay file is truncated or missing its footer.");
  if (expectedSequence !== manifest.frameCount) {
    fail("REPLAY_FILE_INVALID", "Replay manifest frame count does not match the file.");
  }

  if (frameIndex.length === 0) {
    if (manifest.originalStartedAtMs !== null || manifest.originalCompletedAtMs !== null) {
      fail("REPLAY_FILE_INVALID", "Empty Replay file timing does not match its frames.");
    }
  } else {
    const first = frameIndex[0].completedAtMs;
    const last = frameIndex.at(-1).completedAtMs;
    if (first !== manifest.originalStartedAtMs || last !== manifest.originalCompletedAtMs || last - first !== manifest.originalDurationMs) {
      fail("REPLAY_FILE_INVALID", "Replay manifest timing does not match the validated frame sequence.");
    }
  }

  const summary = Object.freeze({
    id: manifest.recordingId,
    name: manifest.name,
    status: "complete",
    createdAtMs: null,
    firstFrameAtMs: manifest.originalStartedAtMs,
    lastFrameAtMs: manifest.originalCompletedAtMs,
    durationMs: manifest.originalDurationMs,
    frameCount: manifest.frameCount,
    approximateBytes: Number.isFinite(file.size) ? file.size : 0,
    lastErrorCode: null
  });

  return Object.freeze({
    manifest,
    footer,
    summary,
    frameIndex: Object.freeze(frameIndex)
  });
}

async function readPortableFrame(file, manifest, entry) {
  let text;
  try {
    text = await file.slice(entry.byteStart, entry.byteEnd).text();
  } catch (error) {
    fail("REPLAY_FILE_INVALID", `Replay frame ${entry.sequence} could not be read.`, error);
  }
  if (text.endsWith("\r")) text = text.slice(0, -1);
  const record = parseJsonLine(text, entry.sequence + 2);
  const frame = validateFrameRecord(record, manifest, entry.sequence);
  return {
    recordingId: manifest.recordingId,
    sequence: entry.sequence,
    snapshot: frame.snapshot
  };
}

export async function openPortableFileRecordingSource({ file }) {
  const validated = await validatePortableRecordingFile(file);
  return createRecordingSource({
    kind: "file",
    summary: validated.summary,
    frameIndex: validated.frameIndex,
    readFrame: (sequence, entry) => readPortableFrame(file, validated.manifest, entry)
  });
}

export async function createPortableIndexedDbSource({ store, recordingId }) {
  return createIndexedDbRecordingSource({ store, recordingId });
}

export async function exportIndexedDbRecording({ store, recordingId, writable, close = true }) {
  const source = await createIndexedDbRecordingSource({ store, recordingId });
  return writePortableRecording({ source, writable, close });
}

function safeSuggestedFileName(name) {
  const base = String(name ?? "Market Replay")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_")
    .slice(0, 80) || "Market Replay";
  return `${base}.market-flow-us-replay.jsonl`;
}

function createBoundedBlobSink({ maxBytes }) {
  const chunks = [];
  let bytes = 0;
  return {
    chunks,
    async write(chunk) {
      const nextBytes = encoder.encode(String(chunk)).byteLength;
      if (bytes + nextBytes > maxBytes) {
        fail("REPLAY_EXPORT_STREAMING_REQUIRED", "Portable Replay is too large for the bounded download fallback.");
      }
      chunks.push(String(chunk));
      bytes += nextBytes;
    },
    async close() {},
    async abort() {
      chunks.length = 0;
      bytes = 0;
    }
  };
}

export async function exportRecordingToUserFile({
  store,
  recordingId,
  recordingName,
  globalRef = globalThis,
  documentRef = globalThis.document,
  maxBlobFallbackBytes = MAX_BLOB_FALLBACK_BYTES
}) {
  if (!Number.isSafeInteger(maxBlobFallbackBytes) || maxBlobFallbackBytes <= 0) {
    throw new TypeError("maxBlobFallbackBytes must be a positive safe integer.");
  }
  const suggestedName = safeSuggestedFileName(recordingName);
  const picker = globalRef?.showSaveFilePicker;
  let handle = null;

  // Invoke the picker before any unrelated await so browser user-activation remains valid.
  if (typeof picker === "function") {
    handle = await picker.call(globalRef, {
      suggestedName,
      types: [{
        description: "Market Flow US Replay",
        accept: { "application/x-ndjson": [".jsonl"] }
      }]
    });
  }

  const source = await createIndexedDbRecordingSource({ store, recordingId });

  if (handle) {
    const writable = await handle.createWritable();
    const result = await writePortableRecording({ source, writable, close: true });
    const exportedFile = await handle.getFile();
    await validatePortableRecordingFile(exportedFile);
    return Object.freeze({ ...result, method: "file-system", fileName: exportedFile.name ?? suggestedName });
  }

  if (source.getSummary().approximateBytes > maxBlobFallbackBytes) {
    fail("REPLAY_EXPORT_STREAMING_REQUIRED", "This recording requires streaming file export, which is unavailable in this browser.");
  }
  const sink = createBoundedBlobSink({ maxBytes: maxBlobFallbackBytes });
  const result = await writePortableRecording({ source, writable: sink, close: true });
  const blob = new Blob(sink.chunks, { type: "application/x-ndjson;charset=utf-8" });
  await validatePortableRecordingFile(blob);

  if (!documentRef?.body || !globalRef?.URL?.createObjectURL) {
    fail("REPLAY_EXPORT_DOWNLOAD_UNAVAILABLE", "Browser download fallback is unavailable.");
  }
  const url = globalRef.URL.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.style.display = "none";
    documentRef.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    globalRef.setTimeout?.(() => globalRef.URL.revokeObjectURL(url), 0);
  }

  return Object.freeze({ ...result, method: "blob-download", fileName: suggestedName });
}
