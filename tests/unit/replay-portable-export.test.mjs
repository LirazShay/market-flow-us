import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import {
  ReplayPortableExportError,
  exportReplayRecordingToDisk
} from "../../browser/replay/portable-export.js";

function makeFrame(sequence, completedAtMs) {
  const snapshot = buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: 1,
          records: [{ PaperId: sequence + 1, Symbol: `SYM${sequence + 1}`, Price: 100 + sequence }]
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-provider-node"
    },
    timing: {
      startedAtMs: completedAtMs - 5,
      responseReceivedAtMs: completedAtMs - 2,
      completedAtMs
    },
    httpStatus: 200
  });
  return createReplayFrame({ recordingId: "r-export", sequence, snapshot });
}

function createStore() {
  const frameList = [makeFrame(0, 1_000), makeFrame(1, 1_250), makeFrame(2, 2_100)];
  const readCalls = [];
  return {
    readCalls,
    async getRecording(id) {
      assert.equal(id, "r-export");
      return {
        id,
        name: "Export proof",
        status: "complete",
        firstFrameAtMs: 1_000,
        lastFrameAtMs: 2_100,
        durationMs: 1_100,
        frameCount: frameList.length,
        approximateBytes: 2_000
      };
    },
    async readFrame(id, sequence) {
      assert.equal(id, "r-export");
      readCalls.push(sequence);
      return structuredClone(frameList[sequence]);
    }
  };
}

test("direct File System Access export streams IndexedDB frames and never deletes the browser copy", async () => {
  const store = createStore();
  const writes = [];
  let closed = false;
  let pickerOptions = null;

  const result = await exportReplayRecordingToDisk({
    store,
    recordingId: "r-export",
    showSaveFilePicker: async (options) => {
      pickerOptions = options;
      return {
        async createWritable() {
          return {
            async write(chunk) { writes.push(String(chunk)); },
            async close() { closed = true; }
          };
        }
      };
    }
  });

  assert.equal(result.mode, "streaming-file");
  assert.equal(result.frameCount, 3);
  assert.deepEqual(store.readCalls, [0, 1, 2]);
  assert.equal(writes.length, 5);
  assert.equal(closed, true);
  assert.match(pickerOptions.suggestedName, /^market-flow-us-replay-r-export\.jsonl$/u);
  assert.equal(Object.hasOwn(store, "deleteRecording"), false, "export must not require or invoke deletion");
});

test("bounded download fallback fails visibly instead of buffering an oversized recording", async () => {
  const store = createStore();
  let anchorClicked = false;
  const documentRef = {
    body: { append() {} },
    createElement() {
      return {
        style: {},
        click() { anchorClicked = true; },
        remove() {}
      };
    }
  };
  const urlApi = {
    createObjectURL() { return "blob:test"; },
    revokeObjectURL() {}
  };

  await assert.rejects(
    () => exportReplayRecordingToDisk({
      store,
      recordingId: "r-export",
      showSaveFilePicker: null,
      documentRef,
      urlApi,
      BlobCtor: Blob,
      maxBufferedBytes: 64
    }),
    (error) => error instanceof ReplayPortableExportError && error.code === "BUFFER_LIMIT_EXCEEDED"
  );
  assert.equal(anchorClicked, false);
});

test("incomplete browser recordings cannot be exported as apparently valid portable files", async () => {
  const store = createStore();
  store.getRecording = async () => ({
    id: "r-export",
    name: "Incomplete",
    status: "incomplete",
    firstFrameAtMs: 1_000,
    lastFrameAtMs: 1_000,
    durationMs: 0,
    frameCount: 1,
    approximateBytes: 100
  });

  await assert.rejects(
    () => exportReplayRecordingToDisk({
      store,
      recordingId: "r-export",
      showSaveFilePicker: async () => {
        throw new Error("picker must not open");
      }
    }),
    /Only complete Replay recordings/u
  );
});
