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
  const modelPath = path.join(ROOT, "browser/replay/recording-model.js");
  const sourcePath = path.join(ROOT, "browser/replay/recording-source.js");
  const portablePath = path.join(ROOT, "browser/replay/portable-recording.js");
  const providerPath = path.join(ROOT, "browser/provider/us-screener.js");
  const result = await build({
    stdin: {
      contents: `
        import { openReplayRecordingStore } from ${JSON.stringify(storePath)};
        import { createReplayFrame } from ${JSON.stringify(modelPath)};
        import { createIndexedDbRecordingSource } from ${JSON.stringify(sourcePath)};
        import { exportIndexedDbRecording, openPortableFileRecordingSource, validatePortableRecordingFile } from ${JSON.stringify(portablePath)};
        import { buildValidatedSnapshot } from ${JSON.stringify(providerPath)};
        globalThis.__ReplayPortableTest = {
          openReplayRecordingStore,
          createReplayFrame,
          createIndexedDbRecordingSource,
          exportIndexedDbRecording,
          openPortableFileRecordingSource,
          validatePortableRecordingFile,
          buildValidatedSnapshot
        };
      `,
      resolveDir: ROOT,
      sourcefile: "replay-portable-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  replayBundle = result.outputFiles[0].text;
});

test("IndexedDB streams to portable File and direct File source stays equivalent without re-import or auto-delete", async ({ page }) => {
  await openProviderOrigin(page);

  const result = await page.evaluate(async () => {
    const {
      openReplayRecordingStore,
      createReplayFrame,
      createIndexedDbRecordingSource,
      exportIndexedDbRecording,
      openPortableFileRecordingSource,
      validatePortableRecordingFile,
      buildValidatedSnapshot
    } = globalThis.__ReplayPortableTest;

    const dbName = `replay-portable-${crypto.randomUUID()}`;
    const store = await openReplayRecordingStore({ dbName });
    const recordingId = "portable-browser-r1";
    const makeRow = (id, price = Number(id) * 10) => ({ PaperId: id, Symbol: `SYM${id}`, Price: price, DailyVolume: 1_000 + Number(id) });
    const makeSnapshot = (records, completedAtMs) => buildValidatedSnapshot({
      responseJson: {
        data: { ScreenerHulPaging: { recordCount: records.length, records } },
        resultCode: 0,
        rtUsa: true,
        serverId: "public-provider-node"
      },
      timing: { startedAtMs: completedAtMs - 8, responseReceivedAtMs: completedAtMs - 3, completedAtMs },
      httpStatus: 200
    });
    const snapshots = [
      makeSnapshot([makeRow(2), makeRow(1)], 1_000),
      makeSnapshot([makeRow(1), makeRow(2)], 1_151),
      makeSnapshot([makeRow(1), makeRow(2), makeRow(3, 222.5)], 1_907),
      makeSnapshot([makeRow(3), makeRow(1)], 3_111)
    ];

    await store.createRecording({ id: recordingId, name: "Portable browser proof", createdAtMs: 900 });
    for (let sequence = 0; sequence < snapshots.length; sequence += 1) {
      await store.appendFrame(createReplayFrame({ recordingId, sequence, snapshot: snapshots[sequence] }));
    }
    await store.completeRecording(recordingId);

    const indexedSource = await createIndexedDbRecordingSource({ store, recordingId });
    const indexedFrame2 = await indexedSource.getFrame(2);
    const chunks = [];
    const exportResult = await exportIndexedDbRecording({
      store,
      recordingId,
      writable: {
        async write(chunk) { chunks.push(chunk); },
        async close() {}
      }
    });
    const libraryAfterExport = await store.listRecordings();
    const file = new File(chunks, "portable.market-flow-us-replay.jsonl", { type: "application/x-ndjson" });
    const validated = await validatePortableRecordingFile(file);
    store.close();

    // The file source is opened only from the File after IndexedDB has been closed.
    const fileSource = await openPortableFileRecordingSource({ file });
    const fileFrame0 = await fileSource.getFrame(0);
    const fileFrame2 = await fileSource.getFrame(2);

    return {
      exportResult,
      writeCount: chunks.length,
      libraryAfterExport,
      validatedSummary: validated.summary,
      indexedFrame2,
      fileFrame0,
      fileFrame2,
      seek: [999, 1_000, 1_150, 1_151, 1_906, 1_907, 99_999].map((time) => fileSource.resolveFrameAtOrBefore(time))
    };
  });

  expect(result.exportResult).toMatchObject({
    format: "market-flow-us-replay",
    version: 1,
    recordingId: "portable-browser-r1",
    frameCount: 4
  });
  expect(result.writeCount).toBe(6);
  expect(result.libraryAfterExport).toHaveLength(1);
  expect(result.libraryAfterExport[0]).toMatchObject({
    id: "portable-browser-r1",
    status: "complete",
    frameCount: 4
  });
  expect(result.validatedSummary).toMatchObject({
    id: "portable-browser-r1",
    firstFrameAtMs: 1_000,
    lastFrameAtMs: 3_111,
    durationMs: 2_111,
    frameCount: 4
  });
  expect(result.fileFrame0.snapshot.responseIds).toEqual(["2", "1"]);
  expect(result.fileFrame2).toEqual(result.indexedFrame2);
  expect(result.fileFrame2.snapshot.records[2].Price).toBe(222.5);
  expect(result.seek).toEqual([null, 0, 0, 1, 1, 2, 3]);
});

test("portable File validation rejects truncation before a source becomes playable", async ({ page }) => {
  await openProviderOrigin(page);

  const errorCode = await page.evaluate(async () => {
    const { openPortableFileRecordingSource } = globalThis.__ReplayPortableTest;
    const manifest = {
      type: "manifest",
      format: "market-flow-us-replay",
      version: 1,
      recordingId: "truncated",
      name: "Truncated",
      frameCount: 1,
      originalStartedAtMs: 1_000,
      originalCompletedAtMs: 1_000,
      originalDurationMs: 0
    };
    const file = new File([`${JSON.stringify(manifest)}\n`], "truncated.jsonl", { type: "application/x-ndjson" });
    try {
      await openPortableFileRecordingSource({ file });
      return null;
    } catch (error) {
      return error.code ?? error.name;
    }
  });

  expect(errorCode).toBe("REPLAY_FILE_INVALID");
});
