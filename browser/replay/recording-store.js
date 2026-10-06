import {
  approximateJsonBytes,
  createRecordingMetadata,
  normalizeRecordingName,
  toRecordingSummary
} from "./recording-model.js";

export const DEFAULT_REPLAY_DB_NAME = "market-flow-us-replay";
export const REPLAY_DB_VERSION = 1;

const RECORDINGS_STORE = "recordings";
const FRAMES_STORE = "frames";
const FRAMES_BY_RECORDING_INDEX = "byRecordingId";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => {};
  });
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertNonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
}

function openDatabase(indexedDb, dbName) {
  if (!indexedDb || typeof indexedDb.open !== "function") {
    throw new Error("IndexedDB is required for Market Replay recording storage.");
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(dbName, REPLAY_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDINGS_STORE)) {
        database.createObjectStore(RECORDINGS_STORE, { keyPath: "recordingId" });
      }
      if (!database.objectStoreNames.contains(FRAMES_STORE)) {
        const frames = database.createObjectStore(FRAMES_STORE, {
          keyPath: ["recordingId", "sequence"]
        });
        frames.createIndex(FRAMES_BY_RECORDING_INDEX, "recordingId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open Replay IndexedDB."));
    request.onblocked = () => reject(new Error("Replay IndexedDB upgrade is blocked by another page."));
  });
}

function cloneSummary(recording) {
  return { ...toRecordingSummary(recording) };
}

export async function openReplayRecordingStore({
  indexedDb = globalThis.indexedDB,
  dbName = DEFAULT_REPLAY_DB_NAME
} = {}) {
  assertNonEmptyString(dbName, "dbName");
  const database = await openDatabase(indexedDb, dbName);

  return Object.freeze({
    async createRecording({ id, name, createdAtMs }) {
      const recording = { ...createRecordingMetadata({ recordingId: id, name, createdAtMs }) };
      const transaction = database.transaction(RECORDINGS_STORE, "readwrite");
      transaction.objectStore(RECORDINGS_STORE).add(recording);
      await transactionDone(transaction);
      return cloneSummary(recording);
    },

    async appendFrame(frame) {
      if (!frame || typeof frame !== "object") throw new TypeError("frame is required.");
      assertNonEmptyString(frame.recordingId, "frame.recordingId");
      assertNonNegativeSafeInteger(frame.sequence, "frame.sequence");
      assertNonNegativeSafeInteger(frame.snapshot?.timing?.completedAtMs, "frame.snapshot.timing.completedAtMs");

      const transaction = database.transaction([RECORDINGS_STORE, FRAMES_STORE], "readwrite");
      const recordings = transaction.objectStore(RECORDINGS_STORE);
      const frames = transaction.objectStore(FRAMES_STORE);
      const recording = await requestResult(recordings.get(frame.recordingId));

      if (!recording) {
        transaction.abort();
        throw new Error("Replay recording does not exist.");
      }
      if (recording.status !== "incomplete") {
        transaction.abort();
        throw new Error("Completed Replay recordings are immutable.");
      }
      if (frame.sequence !== recording.frameCount) {
        transaction.abort();
        throw new Error(`Replay frame sequence must be ${recording.frameCount}.`);
      }

      const completedAtMs = frame.snapshot.timing.completedAtMs;
      frames.add(frame);
      recording.firstFrameAtMs ??= completedAtMs;
      recording.lastFrameAtMs = completedAtMs;
      recording.frameCount += 1;
      recording.approximateBytes += approximateJsonBytes(frame);
      recording.lastErrorCode = null;
      recordings.put(recording);

      await transactionDone(transaction);
      return cloneSummary(recording);
    },

    async completeRecording(recordingId) {
      assertNonEmptyString(recordingId, "recordingId");
      const transaction = database.transaction(RECORDINGS_STORE, "readwrite");
      const store = transaction.objectStore(RECORDINGS_STORE);
      const recording = await requestResult(store.get(recordingId));

      if (!recording) {
        transaction.abort();
        throw new Error("Replay recording does not exist.");
      }
      if (recording.status === "complete") {
        await transactionDone(transaction);
        return cloneSummary(recording);
      }

      recording.status = "complete";
      recording.lastErrorCode = null;
      store.put(recording);
      await transactionDone(transaction);
      return cloneSummary(recording);
    },

    async tryRecordFailure(recordingId, errorCode) {
      assertNonEmptyString(recordingId, "recordingId");
      assertNonEmptyString(errorCode, "errorCode");
      try {
        const transaction = database.transaction(RECORDINGS_STORE, "readwrite");
        const store = transaction.objectStore(RECORDINGS_STORE);
        const recording = await requestResult(store.get(recordingId));
        if (!recording || recording.status === "complete") {
          transaction.abort();
          return false;
        }
        recording.lastErrorCode = errorCode;
        store.put(recording);
        await transactionDone(transaction);
        return true;
      } catch {
        return false;
      }
    },

    async renameRecording(recordingId, name) {
      assertNonEmptyString(recordingId, "recordingId");
      const transaction = database.transaction(RECORDINGS_STORE, "readwrite");
      const store = transaction.objectStore(RECORDINGS_STORE);
      const recording = await requestResult(store.get(recordingId));

      if (!recording) {
        transaction.abort();
        throw new Error("Replay recording does not exist.");
      }

      recording.name = normalizeRecordingName(name);
      store.put(recording);
      await transactionDone(transaction);
      return cloneSummary(recording);
    },

    async getRecording(recordingId) {
      assertNonEmptyString(recordingId, "recordingId");
      const transaction = database.transaction(RECORDINGS_STORE, "readonly");
      const recording = await requestResult(transaction.objectStore(RECORDINGS_STORE).get(recordingId));
      await transactionDone(transaction);
      return recording ? cloneSummary(recording) : null;
    },

    async listRecordings() {
      const transaction = database.transaction(RECORDINGS_STORE, "readonly");
      const recordings = await requestResult(transaction.objectStore(RECORDINGS_STORE).getAll());
      await transactionDone(transaction);
      return recordings
        .sort((left, right) => right.createdAtMs - left.createdAtMs || left.recordingId.localeCompare(right.recordingId))
        .map(cloneSummary);
    },

    async readFrames(recordingId) {
      assertNonEmptyString(recordingId, "recordingId");
      const transaction = database.transaction(FRAMES_STORE, "readonly");
      const index = transaction.objectStore(FRAMES_STORE).index(FRAMES_BY_RECORDING_INDEX);
      const frames = await requestResult(index.getAll(recordingId));
      await transactionDone(transaction);
      return frames.sort((left, right) => left.sequence - right.sequence);
    },

    async deleteRecording(recordingId) {
      assertNonEmptyString(recordingId, "recordingId");
      const transaction = database.transaction([RECORDINGS_STORE, FRAMES_STORE], "readwrite");
      const recordings = transaction.objectStore(RECORDINGS_STORE);
      const frames = transaction.objectStore(FRAMES_STORE);
      recordings.delete(recordingId);

      const index = frames.index(FRAMES_BY_RECORDING_INDEX);
      await new Promise((resolve, reject) => {
        const keyRange = globalThis.IDBKeyRange?.only(recordingId);
        if (!keyRange) {
          reject(new Error("IDBKeyRange is required for Replay deletion."));
          return;
        }
        const request = index.openCursor(keyRange);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          cursor.delete();
          cursor.continue();
        };
        request.onerror = () => reject(request.error ?? new Error("Failed to delete Replay frames."));
      });

      await transactionDone(transaction);
    },

    close() {
      database.close();
    }
  });
}
