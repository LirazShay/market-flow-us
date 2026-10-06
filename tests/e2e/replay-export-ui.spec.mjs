import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let surfaceBundle;

test.beforeAll(async () => {
  const surfacePath = path.join(ROOT, "browser/replay/recording-surface.js");
  const result = await build({
    stdin: {
      contents: `
        import { createReplayRecordingSurface } from ${JSON.stringify(surfacePath)};
        globalThis.__ReplayExportUiTest = { createReplayRecordingSurface };
      `,
      resolveDir: ROOT,
      sourcefile: "replay-export-ui-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  surfaceBundle = result.outputFiles[0].text;
});

test("oversized fallback export failure remains visibly actionable after busy-state rerender", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ content: surfaceBundle });
  await page.evaluate(() => {
    const state = {
      status: "idle",
      recordingId: null,
      durationMs: 0,
      frameCount: 0,
      approximateBytes: 0,
      latestErrorCode: null,
      providerFailureCount: 0,
      storageEstimate: { available: false, usage: null, quota: null },
      library: [{
        id: "large-r1",
        name: "Large recording",
        status: "complete",
        createdAtMs: 1,
        firstFrameAtMs: 1_000,
        lastFrameAtMs: 2_000,
        durationMs: 1_000,
        frameCount: 2,
        approximateBytes: 50_000_000,
        lastErrorCode: null
      }]
    };
    const recorder = {
      getState: () => structuredClone(state),
      subscribe(listener) {
        listener(structuredClone(state));
        return () => {};
      },
      async renameRecording() {},
      async deleteRecording() {},
      async start() {},
      async stop() {},
      async refreshLibrary() {},
      async refreshStorageEstimate() {}
    };
    globalThis.__ReplayExportUiTest.createReplayRecordingSurface({
      recorder,
      exportRecording: async () => {
        const error = new Error("streaming required");
        error.code = "REPLAY_EXPORT_STREAMING_REQUIRED";
        throw error;
      }
    });
  });

  const host = page.locator("#market-flow-us-replay-recorder");
  await host.getByRole("button", { name: "ייצוא" }).click();
  await expect(host.getByText("ההקלטה גדולה מדי לייצוא בזיכרון. נדרש דפדפן עם שמירה ישירה לקובץ.")).toBeVisible();
  await expect(host.getByText("Large recording", { exact: true })).toBeVisible();
});
