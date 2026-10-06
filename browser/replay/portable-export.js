import { exportPortableReplay } from "./portable-format.js";
import { createIndexedDbRecordingSource } from "./recording-source.js";

export const MAX_BUFFERED_PORTABLE_EXPORT_BYTES = 32 * 1024 * 1024;

const encoder = new TextEncoder();

export class ReplayPortableExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReplayPortableExportError";
    this.code = code;
  }
}

function portableFilename(recordingId) {
  const safe = String(recordingId).replace(/[^a-zA-Z0-9._-]+/gu, "-").slice(0, 120) || "recording";
  return `market-flow-us-replay-${safe}.jsonl`;
}

function createBoundedMemoryWritable(maxBytes) {
  const chunks = [];
  let bytes = 0;
  let closed = false;

  return {
    chunks,
    get bytes() { return bytes; },
    async write(chunk) {
      if (closed) throw new ReplayPortableExportError("BUFFER_CLOSED", "Replay export buffer is already closed.");
      const text = String(chunk);
      const chunkBytes = encoder.encode(text).byteLength;
      if (bytes + chunkBytes > maxBytes) {
        throw new ReplayPortableExportError(
          "BUFFER_LIMIT_EXCEEDED",
          "Replay recording is too large for bounded in-memory export; direct file streaming is required."
        );
      }
      chunks.push(text);
      bytes += chunkBytes;
    },
    async close() {
      closed = true;
    },
    async abort() {
      closed = true;
      chunks.length = 0;
      bytes = 0;
    }
  };
}

export async function exportReplayRecordingToDisk({
  store,
  recordingId,
  showSaveFilePicker = globalThis.showSaveFilePicker,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  BlobCtor = globalThis.Blob,
  maxBufferedBytes = MAX_BUFFERED_PORTABLE_EXPORT_BYTES
}) {
  const source = await createIndexedDbRecordingSource({ store, recordingId });
  const filename = portableFilename(source.metadata.recordingId);

  if (typeof showSaveFilePicker === "function") {
    const handle = await showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: "Market Flow US Replay recording",
        accept: { "application/x-ndjson": [".jsonl"] }
      }]
    });
    if (!handle || typeof handle.createWritable !== "function") {
      throw new ReplayPortableExportError("FILE_HANDLE_INVALID", "Replay export did not receive a writable file handle.");
    }
    const writable = await handle.createWritable();
    const result = await exportPortableReplay({ source, writable, close: true });
    return Object.freeze({ ...result, mode: "streaming-file", filename });
  }

  if (!Number.isSafeInteger(maxBufferedBytes) || maxBufferedBytes <= 0) {
    throw new TypeError("maxBufferedBytes must be a positive safe integer.");
  }
  if (!documentRef?.createElement || !urlApi?.createObjectURL || !BlobCtor) {
    throw new ReplayPortableExportError(
      "DIRECT_STREAMING_REQUIRED",
      "Direct file streaming is unavailable and the bounded download fallback is unsupported."
    );
  }

  const writable = createBoundedMemoryWritable(maxBufferedBytes);
  const result = await exportPortableReplay({ source, writable, close: true });
  const blob = new BlobCtor(writable.chunks, { type: "application/x-ndjson;charset=utf-8" });
  const url = urlApi.createObjectURL(blob);
  try {
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    documentRef.body?.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    urlApi.revokeObjectURL?.(url);
  }

  return Object.freeze({ ...result, mode: "bounded-buffer", filename });
}
