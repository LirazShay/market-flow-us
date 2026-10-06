import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let replayBundle;

async function openProviderOrigin(page) {
  await page.route("https://provider.test/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><body><main>provider</main></body>" });
  });
  await page.goto("https://provider.test/");
  await page.addScriptTag({ content: replayBundle });
}

test.beforeAll(async () => {
  const storePath = path.join(ROOT, "browser/replay/recording-store.js");
  const recorderPath = path.join(ROOT, "browser/replay/market-recorder.js");
  const surfacePath = path.join(ROOT, "browser/replay/recording-surface.js");
  const modelPath = path.join(ROOT, "browser/replay/recording-model.js");
  const providerPath = path.join(ROOT, "browser/provider/us-screener.js");
  const result = await build({
    stdin: {
      contents: `
        import { openReplayRecordingStore } from ${JSON.stringify(storePath)};
        import { createMarketReplayRecorder } from ${JSON.stringify(recorderPath)};
        import { createReplayRecordingSurface } from ${JSON.stringify(surfacePath)};
        import { createRecordingFrame } from ${JSON.stringify(modelPath)};
        import { buildValidatedSnapshot } from ${JSON.stringify(providerPath)};
        globalThis.__ReplayTest = { openReplayRecordingStore, createMarketReplayRecorder, createReplayRecordingSurface, createRecordingFrame, buildValidatedSnapshot };
      `,
      resolveDir: ROOT,
      sourcefile: "replay-recording-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  replayBundle = result.outputFiles[0].text;
});

test("IndexedDB recording survives reopen with exact order/timing/membership and explicit delete", async ({ page }) => {
  await openProviderOrigin(page);

  const persisted = await page.evaluate(async () => {
    const dbName = `replay-e2e-${crypto.randomUUID()}`;
    const { openReplayRecordingStore, createRecordingFrame, buildValidatedSnapshot } = globalThis.__ReplayTest;
    const makeRow = (id) => ({ PaperId: id, Symbol: `SYM${id}`, Price: Number(id) * 10 });
    const makeSnapshot = (ids, completedAtMs) => buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: ids.length, records: ids.map(makeRow) } },
        resultCode: 0,
        rtUsa: true,
        serverId: "public-provider-node"
      },
      timing: { startedAtMs: completedAtMs - 8, responseReceivedAtMs: completedAtMs - 3, completedAtMs },
      httpStatus: 200
    });

    const store = await openReplayRecordingStore({ dbName });
    await store.createRecording({ id: "r1", name: "Browser recording", createdAtMs: 900 });
    const snapshots = [
      makeSnapshot([2, 1], 1_000),
      makeSnapshot([1, 2], 1_151),
      makeSnapshot([1, 2, 3], 1_907),
      makeSnapshot([3, 1], 3_111)
    ];
    for (let sequence = 0; sequence < snapshots.length; sequence += 1) {
      await store.appendFrame(createRecordingFrame({ recordingId: "r1", sequence, snapshot: snapshots[sequence] }));
    }
    await store.completeRecording("r1");
    store.close();

    const reopened = await openReplayRecordingStore({ dbName });
    const library = await reopened.listRecordings();
    const frames = await reopened.readFrames("r1");
    await reopened.deleteRecording("r1");
    const afterDelete = await reopened.listRecordings();
    reopened.close();

    return {
      library,
      frames: frames.map((frame) => ({
        sequence: frame.sequence,
        completedAtMs: frame.timing.completedAtMs,
        responseIds: frame.responseIds,
        membership: frame.membership
      })),
      afterDelete
    };
  });

  expect(persisted.library).toHaveLength(1);
  expect(persisted.library[0]).toMatchObject({
    id: "r1",
    name: "Browser recording",
    status: "complete",
    firstFrameAtMs: 1_000,
    lastFrameAtMs: 3_111,
    durationMs: 2_111,
    frameCount: 4
  });
  expect(persisted.library[0].approximateBytes).toBeGreaterThan(0);
  expect(persisted.frames).toEqual([
    { sequence: 0, completedAtMs: 1_000, responseIds: ["2", "1"], membership: ["1", "2"] },
    { sequence: 1, completedAtMs: 1_151, responseIds: ["1", "2"], membership: ["1", "2"] },
    { sequence: 2, completedAtMs: 1_907, responseIds: ["1", "2", "3"], membership: ["1", "2", "3"] },
    { sequence: 3, completedAtMs: 3_111, responseIds: ["3", "1"], membership: ["1", "3"] }
  ]);
  expect(persisted.afterDelete).toEqual([]);
});

test("browser UI exposes recording metrics, quota estimate, library and explicit deletion", async ({ page }) => {
  await openProviderOrigin(page);

  await page.evaluate(async () => {
    const dbName = `replay-ui-${crypto.randomUUID()}`;
    const { openReplayRecordingStore, createMarketReplayRecorder, createReplayRecordingSurface, buildValidatedSnapshot } = globalThis.__ReplayTest;
    const store = await openReplayRecordingStore({ dbName });
    const snapshots = [10_000, 10_650].map((completedAtMs, index) => buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: 1, records: [{ PaperId: 100 + index, Symbol: `SYM${index}` }] } },
        resultCode: 0,
        rtUsa: true
      },
      timing: { startedAtMs: completedAtMs - 5, responseReceivedAtMs: completedAtMs - 2, completedAtMs }
    }));
    const scheduled = [];
    const recorder = createMarketReplayRecorder({
      store,
      fetchSnapshot: async () => snapshots.shift(),
      now: () => 9_000,
      createId: () => "ui-recording",
      setTimer(callback) { scheduled.push(callback); return callback; },
      clearTimer(handle) { const index = scheduled.indexOf(handle); if (index >= 0) scheduled.splice(index, 1); },
      storageManager: { async estimate() { return { usage: 1_048_576, quota: 10_485_760 }; } }
    });
    const surface = createReplayRecordingSurface({ recorder });
    await Promise.all([recorder.refreshLibrary(), recorder.refreshStorageEstimate()]);
    globalThis.__replayUi = {
      recorder,
      store,
      surface,
      async fireNext() {
        const callback = scheduled.shift();
        callback();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
  });

  const host = page.locator("#market-flow-us-replay-recorder");
  await expect(host.getByText("Market Replay — הקלטה")).toBeVisible();
  await expect(host.getByText(/1\.0 MB בשימוש מתוך 10\.0 MB/)).toBeVisible();

  await host.locator("input.name").fill("UI recording");
  await host.getByRole("button", { name: "Record" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__replayUi.recorder.getState().frameCount)).toBe(1);
  await page.evaluate(() => globalThis.__replayUi.fireNext());
  await expect.poll(() => page.evaluate(() => globalThis.__replayUi.recorder.getState().frameCount)).toBe(2);
  await host.getByRole("button", { name: "Stop" }).click();

  await expect(host.getByText("UI recording", { exact: true })).toBeVisible();
  await expect(host.getByText("complete", { exact: true })).toBeVisible();
  await expect(host.getByText(/2 frames/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await host.getByRole("button", { name: "מחק" }).click();
  await expect(host.getByText("אין הקלטות עדיין.")).toBeVisible();
});

test("write failure keeps prior committed IndexedDB frames readable and recording incomplete", async ({ page }) => {
  await openProviderOrigin(page);

  const result = await page.evaluate(async () => {
    const dbName = `replay-quota-${crypto.randomUUID()}`;
    const { openReplayRecordingStore, createMarketReplayRecorder, buildValidatedSnapshot } = globalThis.__ReplayTest;
    const realStore = await openReplayRecordingStore({ dbName });
    let appendCalls = 0;
    const failingStore = {
      createRecording: (...args) => realStore.createRecording(...args),
      async appendFrame(frame) {
        appendCalls += 1;
        if (appendCalls === 2) throw new DOMException("Synthetic quota", "QuotaExceededError");
        return realStore.appendFrame(frame);
      },
      completeRecording: (...args) => realStore.completeRecording(...args),
      tryRecordFailure: (...args) => realStore.tryRecordFailure(...args),
      listRecordings: (...args) => realStore.listRecordings(...args),
      renameRecording: (...args) => realStore.renameRecording(...args),
      deleteRecording: (...args) => realStore.deleteRecording(...args)
    };
    const makeSnapshot = (id, completedAtMs) => buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: 1, records: [{ PaperId: id, Symbol: `SYM${id}` }] } },
        resultCode: 0,
        rtUsa: true
      },
      timing: { startedAtMs: completedAtMs - 4, responseReceivedAtMs: completedAtMs - 1, completedAtMs }
    });
    const snapshots = [makeSnapshot(1, 1_000), makeSnapshot(2, 1_500)];
    const scheduled = [];
    const recorder = createMarketReplayRecorder({
      store: failingStore,
      fetchSnapshot: async () => snapshots.shift(),
      now: () => 900,
      createId: () => "quota-recording",
      setTimer(callback) { scheduled.push(callback); return callback; },
      clearTimer(handle) { const index = scheduled.indexOf(handle); if (index >= 0) scheduled.splice(index, 1); },
      storageManager: null
    });

    await recorder.start({ name: "Quota recording" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const callback = scheduled.shift();
    callback();
    for (let index = 0; index < 4 && recorder.getState().status !== "storage_error"; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const failedState = recorder.getState();
    realStore.close();

    const reopened = await openReplayRecordingStore({ dbName });
    const library = await reopened.listRecordings();
    const frames = await reopened.readFrames("quota-recording");
    reopened.close();

    return {
      status: failedState.status,
      error: failedState.latestErrorCode,
      library,
      frameSequences: frames.map((frame) => frame.sequence)
    };
  });

  expect(result.status).toBe("storage_error");
  expect(result.error).toBe("STORAGE_WRITE_FAILED");
  expect(result.library).toHaveLength(1);
  expect(result.library[0]).toMatchObject({ status: "incomplete", frameCount: 1 });
  expect(result.frameSequences).toEqual([0]);
});
