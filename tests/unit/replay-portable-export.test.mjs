import assert from "node:assert/strict";
import test from "node:test";

import {
  ReplayPortableError,
  exportRecordingToUserFile
} from "../../browser/replay/portable-recording.js";

function oversizedStore() {
  let frameRead = false;
  return {
    get frameRead() { return frameRead; },
    async getRecording() {
      return {
        id: "oversized-r1",
        name: "Oversized",
        status: "complete",
        createdAtMs: 1,
        firstFrameAtMs: 1_000,
        lastFrameAtMs: 1_000,
        durationMs: 0,
        frameCount: 1,
        approximateBytes: 10_000,
        lastErrorCode: null
      };
    },
    async readFrameIndex() {
      return [{ sequence: 0, completedAtMs: 1_000 }];
    },
    async getFrame() {
      frameRead = true;
      throw new Error("frame should not be read when fallback bound is already exceeded");
    }
  };
}

test("large Replay export fails visibly before buffering when direct file streaming is unavailable", async () => {
  const store = oversizedStore();

  await assert.rejects(
    () => exportRecordingToUserFile({
      store,
      recordingId: "oversized-r1",
      recordingName: "Oversized",
      globalRef: {},
      documentRef: null,
      maxBlobFallbackBytes: 1_024
    }),
    (error) => error instanceof ReplayPortableError && error.code === "REPLAY_EXPORT_STREAMING_REQUIRED"
  );

  assert.equal(store.frameRead, false);
});
