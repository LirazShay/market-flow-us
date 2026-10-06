import { createReplayFrame } from "./recording-model.js";
import { createRecordingSource } from "./recording-source.js";

export const REPLAY_PORTABLE_FORMAT = "market-flow-us-replay";
export const REPLAY_PORTABLE_VERSION = 1;
export const DEFAULT_PORTABLE_READ_CHUNK_BYTES = 64 * 1024;
export const MAX_PORTABLE_LINE_BYTES = 32 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const SOURCE_METADATA_KEYS = Object.freeze([
  "logtm",
  "maxDateChange",
  "reqtm",
  "responsetm",
  "resultCode",
  "rsCount",
  "rtIsr",
  "rtUsa",
  "serverId",
  "version"
]);
const SNAPSHOT_KEYS = Object.freeze([
  "httpStatus",
  "membership",
  "recordCount",
  "records",
  "responseIds",
  "sourceMetadata",
  "timing"
]);
const TIMING_KEYS = Object.freeze([
  "completedAtMs",
  "durationMs",
  "parseDurationMs",
  "requestDurationMs",
  "responseReceivedAtMs",
  "startedAtMs"
]);

export class ReplayPortableFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReplayPortableFormatError";
    this.code = code;
  }
}

function formatError(code, message) {
  return new ReplayPortableFormatError(code, message);
}

function assertPlainObject(value, code, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw formatError(code, `${name} must be an object.`);
  }
}

function assertExactKeys(value, expected, code, name) {
  assertPlainObject(value, code, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw formatError(code, `${name} has unsupported or missing fields.`);
  }
}

function assertNonEmptyString(value, code, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw formatError(code, `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function assertNonNegativeSafeInteger(value, code, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw formatError(code, `${name} must be a non-negative safe integer.`);
  }
}

function validateManifest(record) {
  assertExactKeys(record, [
    "type",
    "format",
    "version",
    "recordingId",
    "frameCount",
    "originalStartedAtMs",
    "originalCompletedAtMs",
    "originalDurationMs"
  ], "MANIFEST_INVALID", "Replay manifest");

  if (record.type !== "manifest") throw formatError("MANIFEST_INVALID", "Replay manifest type is invalid.");
  if (record.format !== REPLAY_PORTABLE_FORMAT) throw formatError("FORMAT_UNSUPPORTED", "Replay portable format is unsupported.");
  if (record.version !== REPLAY_PORTABLE_VERSION) throw formatError("VERSION_UNSUPPORTED", "Replay portable version is unsupported.");

  const recordingId = assertNonEmptyString(record.recordingId, "MANIFEST_INVALID", "manifest.recordingId");
  assertNonNegativeSafeInteger(record.frameCount, "MANIFEST_INVALID", "manifest.frameCount");
  assertNonNegativeSafeInteger(record.originalDurationMs, "MANIFEST_INVALID", "manifest.originalDurationMs");

  if (record.frameCount === 0) {
    if (record.originalStartedAtMs !== null || record.originalCompletedAtMs !== null || record.originalDurationMs !== 0) {
      throw formatError("MANIFEST_INVALID", "Empty Replay manifest timing is inconsistent.");
    }
  } else {
    assertNonNegativeSafeInteger(record.originalStartedAtMs, "MANIFEST_INVALID", "manifest.originalStartedAtMs");
    assertNonNegativeSafeInteger(record.originalCompletedAtMs, "MANIFEST_INVALID", "manifest.originalCompletedAtMs");
    if (record.originalCompletedAtMs < record.originalStartedAtMs) {
      throw formatError("MANIFEST_INVALID", "Replay manifest completion precedes start.");
    }
    if (record.originalDurationMs !== record.originalCompletedAtMs - record.originalStartedAtMs) {
      throw formatError("MANIFEST_INVALID", "Replay manifest duration does not match start/end timing.");
    }
  }

  return Object.freeze({
    recordingId,
    frameCount: record.frameCount,
    originalStartedAtMs: record.originalStartedAtMs,
    originalCompletedAtMs: record.originalCompletedAtMs,
    originalDurationMs: record.originalDurationMs
  });
}

function validateSourceMetadata(value) {
  assertExactKeys(value, SOURCE_METADATA_KEYS, "FRAME_INVALID", "Replay frame sourceMetadata");
  for (const key of SOURCE_METADATA_KEYS) {
    const field = value[key];
    if (field !== null && !["string", "number", "boolean"].includes(typeof field)) {
      throw formatError("FRAME_INVALID", `Replay frame sourceMetadata.${key} has an invalid type.`);
    }
  }
}

function validateSnapshotShape(snapshot) {
  assertExactKeys(snapshot, SNAPSHOT_KEYS, "FRAME_INVALID", "Replay frame snapshot");
  assertExactKeys(snapshot.timing, TIMING_KEYS, "FRAME_INVALID", "Replay frame timing");
  validateSourceMetadata(snapshot.sourceMetadata);
}

function validateFrameRecord(record, manifest, expectedSequence) {
  assertExactKeys(record, ["type", "recordingId", "sequence", "snapshot"], "FRAME_INVALID", "Replay frame record");
  if (record.type !== "frame") throw formatError("FRAME_INVALID", "Replay frame type is invalid.");
  if (record.recordingId !== manifest.recordingId) {
    throw formatError("FRAME_ID_MISMATCH", "Replay frame recording identity does not match manifest.");
  }
  if (record.sequence !== expectedSequence) {
    throw formatError("FRAME_ORDER_INVALID", `Replay frame sequence must be ${expectedSequence}.`);
  }
  validateSnapshotShape(record.snapshot);

  try {
    return createReplayFrame({
      recordingId: manifest.recordingId,
      sequence: expectedSequence,
      snapshot: record.snapshot
    });
  } catch {
    throw formatError("FRAME_INVALID", `Replay frame ${expectedSequence} failed validated snapshot checks.`);
  }
}

function validateFooter(record, manifest) {
  assertExactKeys(record, ["type", "format", "version", "recordingId", "frameCount", "lastSequence"], "FOOTER_INVALID", "Replay footer");
  if (record.type !== "footer") throw formatError("FOOTER_INVALID", "Replay footer type is invalid.");
  if (record.format !== REPLAY_PORTABLE_FORMAT || record.version !== REPLAY_PORTABLE_VERSION) {
    throw formatError("FOOTER_MISMATCH", "Replay footer format/version does not match manifest.");
  }
  if (record.recordingId !== manifest.recordingId || record.frameCount !== manifest.frameCount) {
    throw formatError("FOOTER_MISMATCH", "Replay footer identity/count does not match manifest.");
  }
  const expectedLastSequence = manifest.frameCount === 0 ? null : manifest.frameCount - 1;
  if (record.lastSequence !== expectedLastSequence) {
    throw formatError("FOOTER_MISMATCH", "Replay footer terminal sequence does not match manifest.");
  }
}

function parseJson(text, code) {
  try {
    return JSON.parse(text);
  } catch {
    throw formatError(code, "Replay portable file contains malformed JSON.");
  }
}

function stripLineEnding(bytes) {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end -= 1;
  if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
  return bytes.subarray(0, end);
}

function decodeLine(bytes) {
  try {
    return decoder.decode(stripLineEnding(bytes));
  } catch {
    throw formatError("UTF8_INVALID", "Replay portable file is not valid UTF-8.");
  }
}

async function* scanLines(file, { chunkSize, maxLineBytes }) {
  let offset = 0;
  let pending = new Uint8Array(0);
  let pendingStartOffset = 0;

  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunkSize);
    const next = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    let data;
    let dataStartOffset;

    if (pending.length === 0) {
      data = next;
      dataStartOffset = offset;
    } else {
      data = new Uint8Array(pending.length + next.length);
      data.set(pending, 0);
      data.set(next, pending.length);
      dataStartOffset = pendingStartOffset;
    }

    let lineStart = 0;
    for (let index = 0; index < data.length; index += 1) {
      if (data[index] !== 0x0a) continue;
      const lineBytes = data.subarray(lineStart, index + 1);
      if (lineBytes.length > maxLineBytes) throw formatError("LINE_TOO_LARGE", "Replay portable line exceeds the safe bound.");
      yield Object.freeze({
        text: decodeLine(lineBytes),
        startOffset: dataStartOffset + lineStart,
        endOffset: dataStartOffset + index + 1
      });
      lineStart = index + 1;
    }

    pending = data.slice(lineStart);
    pendingStartOffset = dataStartOffset + lineStart;
    if (pending.length > maxLineBytes) throw formatError("LINE_TOO_LARGE", "Replay portable line exceeds the safe bound.");
    offset = end;
  }

  if (pending.length > 0) {
    yield Object.freeze({
      text: decodeLine(pending),
      startOffset: pendingStartOffset,
      endOffset: file.size
    });
  }
}

function normalizeFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || typeof file.slice !== "function") {
    throw formatError("FILE_INVALID", "Replay portable file must be a non-empty Blob/File.");
  }
  return file;
}

function normalizeReadOptions(options = {}) {
  const chunkSize = options.chunkSize ?? DEFAULT_PORTABLE_READ_CHUNK_BYTES;
  const maxLineBytes = options.maxLineBytes ?? MAX_PORTABLE_LINE_BYTES;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new TypeError("chunkSize must be a positive safe integer.");
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) throw new TypeError("maxLineBytes must be a positive safe integer.");
  return { chunkSize, maxLineBytes };
}

async function readRecordAt(file, entry) {
  const bytes = new Uint8Array(await file.slice(entry.startOffset, entry.endOffset).arrayBuffer());
  return parseJson(decodeLine(bytes), "FRAME_INVALID");
}

export async function openPortableReplayFile(fileInput, options = {}) {
  const file = normalizeFile(fileInput);
  const readOptions = normalizeReadOptions(options);
  let manifest = null;
  let footerSeen = false;
  let expectedSequence = 0;
  let firstCompletedAtMs = null;
  let lastCompletedAtMs = null;
  const frameOffsets = [];
  const frameIndex = [];
  let lineNumber = 0;

  for await (const line of scanLines(file, readOptions)) {
    lineNumber += 1;
    if (line.text.length === 0) throw formatError("EMPTY_LINE", `Replay portable line ${lineNumber} is empty.`);
    if (footerSeen) throw formatError("TRAILING_DATA", "Replay portable file contains records after its footer.");
    const record = parseJson(line.text, "JSON_INVALID");

    if (manifest === null) {
      manifest = validateManifest(record);
      continue;
    }

    if (expectedSequence < manifest.frameCount) {
      const frame = validateFrameRecord(record, manifest, expectedSequence);
      const completedAtMs = frame.snapshot.timing.completedAtMs;
      if (lastCompletedAtMs !== null && completedAtMs < lastCompletedAtMs) {
        throw formatError("FRAME_TIMING_INVALID", "Replay frame completion times are out of order.");
      }
      firstCompletedAtMs ??= completedAtMs;
      lastCompletedAtMs = completedAtMs;
      frameOffsets.push(Object.freeze({ startOffset: line.startOffset, endOffset: line.endOffset }));
      frameIndex.push(Object.freeze({ sequence: expectedSequence, completedAtMs }));
      expectedSequence += 1;
      continue;
    }

    validateFooter(record, manifest);
    footerSeen = true;
  }

  if (manifest === null) throw formatError("MANIFEST_MISSING", "Replay portable manifest is missing.");
  if (expectedSequence !== manifest.frameCount) throw formatError("FILE_TRUNCATED", "Replay portable file ended before all manifest frames were present.");
  if (!footerSeen) throw formatError("FOOTER_MISSING", "Replay portable footer is missing.");

  if (manifest.frameCount > 0) {
    if (firstCompletedAtMs !== manifest.originalStartedAtMs || lastCompletedAtMs !== manifest.originalCompletedAtMs) {
      throw formatError("MANIFEST_TIMING_MISMATCH", "Replay manifest timing does not match validated frames.");
    }
  }

  return createRecordingSource({
    kind: "file",
    metadata: manifest,
    loadFrameIndex: async () => frameIndex,
    readFrame: async (sequence) => {
      const record = await readRecordAt(file, frameOffsets[sequence]);
      return validateFrameRecord(record, manifest, sequence);
    }
  });
}

function makeManifest(metadata) {
  return {
    type: "manifest",
    format: REPLAY_PORTABLE_FORMAT,
    version: REPLAY_PORTABLE_VERSION,
    recordingId: metadata.recordingId,
    frameCount: metadata.frameCount,
    originalStartedAtMs: metadata.originalStartedAtMs,
    originalCompletedAtMs: metadata.originalCompletedAtMs,
    originalDurationMs: metadata.originalDurationMs
  };
}

function makeFooter(metadata) {
  return {
    type: "footer",
    format: REPLAY_PORTABLE_FORMAT,
    version: REPLAY_PORTABLE_VERSION,
    recordingId: metadata.recordingId,
    frameCount: metadata.frameCount,
    lastSequence: metadata.frameCount === 0 ? null : metadata.frameCount - 1
  };
}

function resolveWriter(writable) {
  if (writable && typeof writable.write === "function") return { writer: writable, release: null };
  if (writable && typeof writable.getWriter === "function") {
    const writer = writable.getWriter();
    return { writer, release: () => writer.releaseLock?.() };
  }
  throw new TypeError("writable must expose write() or getWriter().");
}

async function writeLine(writer, record) {
  const line = `${JSON.stringify(record)}\n`;
  await writer.write(line);
  return encoder.encode(line).byteLength;
}

export async function exportPortableReplay({ source, writable, close = true }) {
  if (!source || !source.metadata || typeof source.readFrame !== "function") {
    throw new TypeError("A Replay recording source is required for export.");
  }
  const { writer, release } = resolveWriter(writable);
  const metadata = source.metadata;
  let bytesWritten = 0;

  try {
    bytesWritten += await writeLine(writer, makeManifest(metadata));
    for (let sequence = 0; sequence < metadata.frameCount; sequence += 1) {
      const frame = await source.readFrame(sequence);
      bytesWritten += await writeLine(writer, {
        type: "frame",
        recordingId: metadata.recordingId,
        sequence,
        snapshot: frame.snapshot
      });
    }
    bytesWritten += await writeLine(writer, makeFooter(metadata));
    if (close && typeof writer.close === "function") await writer.close();
    return Object.freeze({ recordingId: metadata.recordingId, frameCount: metadata.frameCount, bytesWritten });
  } catch (error) {
    try {
      if (typeof writer.abort === "function") await writer.abort(error);
    } catch {
      // The original export failure remains authoritative.
    }
    throw error;
  } finally {
    release?.();
  }
}
