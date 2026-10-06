import assert from "node:assert/strict";
import test from "node:test";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import {
  createRecordingFrame,
  estimateFrameBytes,
  toRecordingSummary
} from "../../browser/replay/recording-model.js";
import { createMarketReplayRecorder } from "../../browser/replay/market-recorder.js";

function row(id, extra = {}) {
  return {
    PaperId: id,
    Symbol: `SYM${id}`,
    Price: 100 + Number(id),
    DailyVolume: 1_000,
    ...extra
  };
}

function snapshot(records, completedAtMs) {
  return buildValidatedSnapshot({
    responseJson: {
      data: { ScreenerHulPaging: { recordCount: records.length, records } },
      resultCode: 0,
      rtUsa: true,
      serverId: "public-provider-node"
    },
    timing: {
      startedAtMs: completedAtMs - 7,
      responseReceivedAtMs: completedAtMs - 2,
      completedAtMs
    },
    httpStatus: 200
  });
}

function createMemoryStore({ failAppendAt = null } = {}) {
  const recordings = new Map();
  const frames = [];

  function summary(recording) {
    return toRecordingSummary(recording);
  }

  return {
    frames,
    recordings,
    async createRecording({ id, name, createdAtMs }) {
      const recording = {
        id, name, createdAtMs, status: "incomplete",
        firstFrameAtMs: null, lastFrameAtMs: null,
        frameCount: 0, approximateBytes: 0, lastErrorCode: null
      };
      recordings.set(id, recording);
      return summary(recording);
    },
    async appendFrame(frame) {
      const recording = recordings.get(frame.recordingId);
      if (failAppendAt !== null && recording.frameCount === failAppendAt) {
        throw new Error("synthetic quota failure");
      }
      assert.equal(frame.sequence, recording.frameCount);
      frames.push(structuredClone(frame));
      recording.firstFrameAtMs ??= frame.timing.completedAtMs;
      recording.lastFrameAtMs = frame.timing.completedAtMs;
      recording.frameCount += 1;
      recording.approximateBytes += estimateFrameBytes(frame);
      recording.lastErrorCode = null;
      return summary(recording);
    },
    async completeRecording(id) {
      const recording = recordings.get(id);
      recording.status = "complete";
      return summary(recording);
    },
    async tryRecordFailure(id, code) {
      const recording = recordings.get(id);
      if (!recording || recording.status === "complete") return false;
      recording.lastErrorCode = code;
      return true;
    },
    async listRecordings() {
      return [...recordings.values()].map(summary);
    },
    async renameRecording(id, name) {
      recordings.get(id).name = name;
      return summary(recordings.get(id));
    },
    async deleteRecording(id) {
      recordings.delete(id);
    }
  };
}

function manualScheduler() {
  const pending = [];
  return {
    pending,
    setTimer(callback) {
      pending.push(callback);
      return callback;
    },
    clearTimer(handle) {
      const index = pending.indexOf(handle);
      if (index >= 0) pending.splice(index, 1);
    },
    async fireNext() {
      const callback = pending.shift();
      assert.ok(callback, "expected a scheduled Replay capture");
      callback();
      await settle();
    }
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function recorderFor({ store, snapshots, scheduler, storageManager }) {
  let nextId = 1;
  return createMarketReplayRecorder({
    store,
    cadenceMs: 3_000,
    fetchSnapshot: async () => {
      const next = snapshots.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    now: () => 1_000,
    createId: () => `recording-${nextId++}`,
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    storageManager
  });
}

test("Replay frames preserve deterministic order, exact membership and irregular provider timing", () => {
  const frames = [
    createRecordingFrame({ recordingId: "r1", sequence: 0, snapshot: snapshot([row(2), row(1)], 1_000) }),
    createRecordingFrame({ recordingId: "r1", sequence: 1, snapshot: snapshot([row(1), row(2)], 1_137) }),
    createRecordingFrame({ recordingId: "r1", sequence: 2, snapshot: snapshot([row(1), row(2), row(3)], 1_911) }),
    createRecordingFrame({ recordingId: "r1", sequence: 3, snapshot: snapshot([row(3), row(1)], 3_006) })
  ];

  assert.deepEqual(frames.map((item) => item.sequence), [0, 1, 2, 3]);
  assert.deepEqual(frames.map((item) => item.timing.completedAtMs), [1_000, 1_137, 1_911, 3_006]);
  assert.deepEqual(frames.map((item) => item.responseIds), [["2", "1"], ["1", "2"], ["1", "2", "3"], ["3", "1"]]);
  assert.deepEqual(frames.map((item) => item.membership), [["1", "2"], ["1", "2"], ["1", "2", "3"], ["1", "3"]]);
});

test("Replay frame projection is bounded and excludes unrelated sensitive/private fields", () => {
  const validated = snapshot([row(1)], 2_000);
  const decorated = {
    ...validated,
    cookie: "SECRET_COOKIE",
    authorization: "SECRET_AUTH",
    accountId: "SECRET_ACCOUNT",
    requestHeaders: { Authorization: "SECRET_HEADER" },
    privateDom: "SECRET_DOM",
    browserStorageDump: "SECRET_STORAGE"
  };
  const frame = createRecordingFrame({ recordingId: "r1", sequence: 0, snapshot: decorated });
  const serialized = JSON.stringify(frame);

  for (const canary of ["SECRET_COOKIE", "SECRET_AUTH", "SECRET_ACCOUNT", "SECRET_HEADER", "SECRET_DOM", "SECRET_STORAGE"]) {
    assert.equal(serialized.includes(canary), false);
  }
  assert.deepEqual(Object.keys(frame).sort(), [
    "httpStatus", "membership", "recordCount", "recordingId", "records",
    "responseIds", "sequence", "sourceMetadata", "timing"
  ]);
});

test("provider failure creates no frame and the next complete snapshot can recover", async () => {
  const store = createMemoryStore();
  const scheduler = manualScheduler();
  const recorder = recorderFor({
    store,
    scheduler,
    snapshots: [new Error("provider response incomplete"), snapshot([row(1)], 5_000)]
  });

  await recorder.start({ name: "Provider recovery" });
  await settle();
  assert.equal(store.frames.length, 0);
  assert.equal(recorder.getState().providerFailureCount, 1);
  assert.equal(recorder.getState().latestErrorCode, "PROVIDER_SNAPSHOT_FAILED");
  assert.equal(scheduler.pending.length, 1);

  await scheduler.fireNext();
  assert.equal(store.frames.length, 1);
  assert.equal(store.frames[0].sequence, 0);
  assert.equal(recorder.getState().latestErrorCode, null);

  const completed = await recorder.stop();
  assert.equal(completed.status, "complete");
  assert.equal(completed.frameCount, 1);
});

test("quota/write failure preserves committed frames, leaves recording incomplete and stops scheduling", async () => {
  const store = createMemoryStore({ failAppendAt: 1 });
  const scheduler = manualScheduler();
  const recorder = recorderFor({
    store,
    scheduler,
    snapshots: [snapshot([row(1)], 10_000), snapshot([row(1), row(2)], 10_511)]
  });

  await recorder.start({ name: "Quota proof" });
  await settle();
  assert.equal(store.frames.length, 1);
  assert.equal(scheduler.pending.length, 1);

  await scheduler.fireNext();
  assert.equal(store.frames.length, 1);
  assert.equal(recorder.getState().status, "storage_error");
  assert.equal(recorder.getState().latestErrorCode, "STORAGE_WRITE_FAILED");
  assert.equal(scheduler.pending.length, 0);
  assert.equal([...store.recordings.values()][0].status, "incomplete");
});

test("clean Stop invalidates an in-flight fetch so no post-stop frame can commit", async () => {
  const store = createMemoryStore();
  const scheduler = manualScheduler();
  let resolveFetch;
  const inFlight = new Promise((resolve) => { resolveFetch = resolve; });
  const recorder = createMarketReplayRecorder({
    store,
    fetchSnapshot: () => inFlight,
    now: () => 2_000,
    createId: () => "recording-stop",
    setTimer: scheduler.setTimer,
    clearTimer: scheduler.clearTimer,
    storageManager: null
  });

  await recorder.start({ name: "Stop proof" });
  const stopping = recorder.stop();
  resolveFetch(snapshot([row(1)], 2_200));
  const completed = await stopping;

  assert.equal(store.frames.length, 0);
  assert.equal(completed.status, "complete");
  assert.equal(completed.frameCount, 0);
  assert.equal(recorder.getState().status, "idle");
});

test("storage estimate is informational and honest when unavailable", async () => {
  const store = createMemoryStore();
  const scheduler = manualScheduler();
  const unavailable = recorderFor({ store, scheduler, snapshots: [snapshot([row(1)], 4_000)], storageManager: null });
  const missing = await unavailable.refreshStorageEstimate();
  assert.deepEqual(missing, { available: false, usage: null, quota: null });

  const available = recorderFor({
    store: createMemoryStore(),
    scheduler: manualScheduler(),
    snapshots: [snapshot([row(1)], 4_000)],
    storageManager: { async estimate() { return { usage: 1234, quota: 5678 }; } }
  });
  assert.deepEqual(await available.refreshStorageEstimate(), { available: true, usage: 1234, quota: 5678 });
});
