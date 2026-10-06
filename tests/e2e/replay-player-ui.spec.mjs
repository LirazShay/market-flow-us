import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let surfaceBundle;

test.beforeAll(async () => {
  const surfacePath = path.join(ROOT, "browser/replay/player-surface.js");
  const result = await build({
    stdin: {
      contents: `
        import { createReplayPlayerSurface } from ${JSON.stringify(surfacePath)};
        globalThis.__ReplayPlayerUiTest = { createReplayPlayerSurface };
      `,
      resolveDir: ROOT,
      sourcefile: "replay-player-ui-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  surfaceBundle = result.outputFiles[0].text;
});

test("Player UI exposes source/timeline/frame/readiness and keeps Play blocked until isolated producer is available", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  await page.addScriptTag({ content: surfaceBundle });
  await page.evaluate(() => {
    let state = {
      sourceReady: true,
      sourceKind: "indexeddb",
      sourceName: "Morning capture",
      frameCount: 4,
      durationMs: 20_000,
      playerAvailable: false,
      producerAvailable: false,
      status: "source_ready",
      selectedSequence: 0,
      nextSequence: 0,
      committedSequence: null,
      committedFrameCount: 0,
      positionMs: 0,
      remainingDelayMs: 0,
      sessionStarted: false,
      serviceReady: false,
      requiresFreshRun: false,
      latestError: null
    };
    const listeners = new Set();
    const publish = () => listeners.forEach((listener) => listener(structuredClone(state)));
    const controller = {
      getState: () => structuredClone(state),
      subscribe(listener) {
        listeners.add(listener);
        listener(structuredClone(state));
        return () => listeners.delete(listener);
      },
      async loadPortableFile() {},
      async seekPositionMs(positionMs) {
        state = { ...state, selectedSequence: 2, positionMs };
        publish();
      },
      async play() {},
      pause() {},
      async stop() {}
    };
    globalThis.__controller = controller;
    globalThis.__setReplayPlayerState = (patch) => {
      state = { ...state, ...patch };
      publish();
    };
    globalThis.__ReplayPlayerUiTest.createReplayPlayerSurface({
      controller,
      initiallyVisible: true
    });
  });

  const host = page.locator("#market-flow-us-replay-player");
  await expect(host.getByText("Morning capture", { exact: true })).toBeVisible();
  await expect(host.getByText("מקור: IndexedDB", { exact: true })).toBeVisible();
  await expect(host.getByRole("button", { name: "Play" })).toBeDisabled();
  await expect(host.getByText("0 / 4", { exact: true })).toBeVisible();
  await expect(host.getByText("המקור מוכן. Replay Host/producer מבודד עדיין לא מוכן; Play נשאר חסום כדי לא לגעת ב־DB הרגיל.", { exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setReplayPlayerState({
    playerAvailable: true,
    producerAvailable: true,
    status: "ready"
  }));
  await expect(host.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(host.getByText("מוגדר", { exact: true })).toBeVisible();

  const timeline = host.locator('input[type="range"]');
  await timeline.fill("12000");
  await timeline.dispatchEvent("change");
  await expect(host.getByText("3 / 4", { exact: true })).toBeVisible();
  await expect(host.getByText("00:00:12", { exact: true })).toBeVisible();

  await page.evaluate(() => globalThis.__setReplayPlayerState({
    status: "playing",
    committedSequence: 2,
    committedFrameCount: 3,
    positionMs: 12_500,
    serviceReady: true,
    sessionStarted: true
  }));
  await expect(host.getByRole("button", { name: "Pause" })).toBeEnabled();
  await expect(host.getByRole("button", { name: "Stop" })).toBeEnabled();
  await expect(host.getByText("מחובר", { exact: true })).toBeVisible();
  await expect(host.getByText("3 / 4", { exact: true })).toBeVisible();
});
