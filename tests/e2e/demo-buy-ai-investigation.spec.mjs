import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HORIZONS = [10000, 20000, 30000, 45000, 60000, 90000, 120000, 180000, 300000, 600000];
let viewerBundle;

function horizon(horizonMs, index) {
  const observed = index < 4;
  return {
    horizonMs,
    targetAtMs: 200000 + horizonMs,
    observedAtMs: observed ? 200500 + horizonMs : null,
    actualElapsedMs: observed ? 10500 + horizonMs : null,
    price: observed ? 101 : null,
    changePercent: observed ? 1 : null,
    outcome: observed ? "UP" : "UNAVAILABLE",
    unavailableReason: observed ? null : "NO_FUTURE_OBSERVATION",
    timingAnomaly: null
  };
}

function observation({ captureId, resultRank, securityId, symbol, sourceQueryName }) {
  return {
    capture: {
      captureId,
      capturedAtMs: 200000,
      sourceQueryId: `query-${captureId}`,
      sourceQueryName,
      sourceIntervalMs: 3000,
      sourceResultStartedAtMs: 199000,
      sourceResultCompletedAtMs: 199500,
      sourceResultRowCount: 60,
      selectionMode: "all",
      isAutomatic: false,
      topX: null,
      capturedItemCount: 1,
      scannerDurationMs: 500,
      captureLatencyMs: 500,
      timingAnomaly: null
    },
    resultRank,
    securityId,
    buyCycleId: 77,
    baseline: {
      cycleId: 77,
      collectedAtMs: 199000,
      price: 100,
      symbol,
      paperName: `${symbol} Incorporated`,
      exchangeName: "NASDAQ",
      ageMs: 1000
    },
    timing: {
      scannerDurationMs: 500,
      captureLatencyMs: 500,
      baselineAgeMs: 1000,
      anomaly: null
    },
    horizons: HORIZONS.map(horizon)
  };
}

const ITEMS = [
  observation({ captureId: 20, resultRank: 1, securityId: "1001", symbol: "UNORDERED", sourceQueryName: "Unordered query" }),
  observation({ captureId: 21, resultRank: 1, securityId: "1101", symbol: "ORDERED", sourceQueryName: "Ordered query" }),
  observation({ captureId: 22, resultRank: 51, securityId: "1051", symbol: "OUTSIDE", sourceQueryName: "Position 51 query" }),
  observation({ captureId: 23, resultRank: 2, securityId: "1002", symbol: "ERROR", sourceQueryName: "Export error query" }),
  observation({ captureId: 24, resultRank: 3, securityId: "1003", symbol: "UNKNOWN", sourceQueryName: "Lost ACK query" })
];

test.beforeAll(async () => {
  const surfacePath = path.join(ROOT, "browser/viewer/demo-buy-surface.js");
  const controllerPath = path.join(ROOT, "browser/viewer/demo-buy-capture-controller.js");
  const result = await build({
    stdin: {
      contents: `
        import { createDemoBuySurface } from ${JSON.stringify(surfacePath)};
        import { createDemoBuyCaptureController } from ${JSON.stringify(controllerPath)};
        globalThis.__createDemoBuySurface = createDemoBuySurface;
        globalThis.__createDemoBuyCaptureController = createDemoBuyCaptureController;
      `,
      resolveDir: ROOT,
      sourcefile: "demo-buy-ai-investigation-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  viewerBundle = result.outputFiles[0].text;
});

async function mount(page) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: viewerBundle });
  await page.evaluate((items) => {
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: undefined
      });
    } catch {
      // about:blank commonly has no clipboard; fallback remains covered either way.
    }

    const calls = [];
    const observationCounts = new Map();
    let resolveFirstExport = null;
    let firstExportPending = true;
    let unorderedExportCount = 0;

    const client = {
      async captureDemoBuy() {
        throw new Error("capture must not be called by AI Investigation workflow");
      },
      async getDemoBuyPage(cursor) {
        calls.push(["page", cursor]);
        return { items, hasMore: false, nextCursor: null };
      },
      async getDemoBuyObservation(captureId, securityId) {
        calls.push(["observation", captureId, securityId]);
        const key = `${captureId}:${securityId}`;
        const count = (observationCounts.get(key) ?? 0) + 1;
        observationCounts.set(key, count);
        const item = items.find((candidate) => (
          candidate.capture.captureId === captureId && candidate.securityId === securityId
        ));
        if (!item) throw new Error("unexpected targeted observation");
        return {
          ...item,
          outcomeEvidenceStatus: securityId === "1001" && count >= 3
            ? "COMPLETE_OUTCOME"
            : "PARTIAL_OUTCOME"
        };
      },
      async getDemoBuyCapture(captureId) {
        calls.push(["capture-provenance", captureId]);
        const item = items.find((candidate) => candidate.capture.captureId === captureId);
        const sql = captureId === 20
          ? "SELECT security_id FROM latest"
          : "SELECT security_id FROM latest ORDER BY ChangePercent DESC, security_id";
        return { ...item.capture, sourceQuerySql: sql };
      },
      async createDemoBuyAiPack(captureId, securityId) {
        calls.push(["ai-pack", captureId, securityId]);
        if (securityId === "1002") throw new Error("synthetic export failure");
        if (securityId === "1003") return { status: "ACKNOWLEDGEMENT_UNKNOWN" };

        if (securityId === "1001") {
          unorderedExportCount += 1;
          if (unorderedExportCount === 1 && firstExportPending) {
            return await new Promise((resolve) => {
              resolveFirstExport = () => {
                firstExportPending = false;
                resolve({
                  status: "CONFIRMED_CREATED",
                  exportPathRelative: "exports/ai-investigations/capture-20-security-1001-partial",
                  outcomeEvidenceStatus: "PARTIAL_OUTCOME",
                  targetInScannerContext: true,
                  latestIncludedPostObservationMs: 200300,
                  fileCount: 10,
                  promptText: "UNORDERED PROMPT"
                });
              };
            });
          }
          return {
            status: "CONFIRMED_CREATED",
            exportPathRelative: "exports/ai-investigations/capture-20-security-1001-complete",
            outcomeEvidenceStatus: "COMPLETE_OUTCOME",
            targetInScannerContext: true,
            latestIncludedPostObservationMs: 800000,
            fileCount: 10,
            promptText: "UNORDERED COMPLETE PROMPT"
          };
        }

        if (securityId === "1051") {
          return {
            status: "CONFIRMED_CREATED",
            exportPathRelative: "exports/ai-investigations/capture-22-security-1051",
            outcomeEvidenceStatus: "PARTIAL_OUTCOME",
            targetInScannerContext: false,
            latestIncludedPostObservationMs: 200400,
            fileCount: 10,
            promptText: "OUTSIDE CONTEXT PROMPT"
          };
        }

        return {
          status: "CONFIRMED_CREATED",
          exportPathRelative: `exports/ai-investigations/capture-${captureId}-security-${securityId}`,
          outcomeEvidenceStatus: "PARTIAL_OUTCOME",
          targetInScannerContext: true,
          latestIncludedPostObservationMs: 200400,
          fileCount: 10,
          promptText: "ORDERED PROMPT"
        };
      }
    };

    const controller = globalThis.__createDemoBuyCaptureController({ client, now: () => 900000 });
    const surface = globalThis.__createDemoBuySurface({
      root: document.querySelector("#root"),
      client,
      demoBuyController: controller
    });

    globalThis.__demoBuyAiCalls = calls;
    globalThis.__resolveFirstAiExport = () => resolveFirstExport?.();
    globalThis.__demoBuyAiController = controller;
    globalThis.__demoBuyAiSurface = surface;
    surface.start();
  }, ITEMS);
}

async function openInvestigation(page, securityId) {
  const row = page.locator(`tr[data-security-id="${securityId}"]`);
  await row.getByText("Investigate with AI").click();
  return row;
}

test("AI Investigation uses authoritative refresh, neutral returned-position wording, one Viewer export slot and partial-to-complete regeneration", async ({ page }) => {
  await mount(page);

  const unordered = await openInvestigation(page, "1001");
  await expect(unordered).toContainText("Scanner returned position 1");
  await expect(unordered).toContainText("PARTIAL_OUTCOME");
  await expect(unordered.getByRole("button", { name: "Generate AI Investigation Pack" })).toBeEnabled();
  await expect(page.getByText(/best|top-ranked/i)).toHaveCount(0);

  const ordered = await openInvestigation(page, "1101");
  await expect(ordered).toContainText("Scanner returned position 1");
  await expect(ordered).toContainText("PARTIAL_OUTCOME");
  await expect(page.getByText(/best|top-ranked/i)).toHaveCount(0);

  await unordered.getByRole("button", { name: "Generate AI Investigation Pack" }).click();
  await expect(unordered.getByRole("button", { name: "Generating AI Investigation Pack…" })).toBeDisabled();
  await expect(ordered.getByRole("button", { name: "Another AI export is in progress" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => globalThis.__demoBuyAiController.getState().aiExportBusy)).toBe(true);

  await page.evaluate(() => globalThis.__resolveFirstAiExport());
  await expect(unordered).toContainText("PARTIAL_OUTCOME");
  await expect(unordered).toContainText("exports/ai-investigations/capture-20-security-1001-partial");
  await expect(unordered).toContainText("Pack files10");
  await expect(unordered).toContainText("Latest included post-observation");
  await expect(unordered.getByRole("button", { name: "Regenerate" })).toBeEnabled();

  await unordered.getByRole("button", { name: "Copy AI Prompt" }).click();
  const promptFallback = unordered.getByRole("textbox", { name: "AI prompt manual copy" });
  await expect(promptFallback).toBeVisible();
  await expect(promptFallback).toHaveValue("UNORDERED PROMPT");
  await expect(promptFallback).toBeFocused();

  await unordered.getByRole("button", { name: "Copy folder path" }).click();
  const pathFallback = unordered.getByRole("textbox", { name: "AI folder path manual copy" });
  await expect(pathFallback).toBeVisible();
  await expect(pathFallback).toHaveValue("exports/ai-investigations/capture-20-security-1001-partial");
  await expect(pathFallback).toBeFocused();

  await unordered.getByRole("button", { name: "Regenerate" }).click();
  await expect(unordered).toContainText("COMPLETE_OUTCOME");
  await expect(unordered).toContainText("exports/ai-investigations/capture-20-security-1001-complete");
  await expect(unordered).toContainText("full ten-minute evidence boundary");

  const calls = await page.evaluate(() => globalThis.__demoBuyAiCalls);
  const targetCalls = calls.filter((call) => call[2] === "1001");
  const exportIndexes = targetCalls
    .map((call, index) => call[0] === "ai-pack" ? index : -1)
    .filter((index) => index >= 0);
  expect(exportIndexes).toHaveLength(2);
  for (const exportIndex of exportIndexes) {
    expect(targetCalls.slice(0, exportIndex).at(-1)?.[0]).toBe("observation");
  }
  expect(targetCalls.filter((call) => call[0] === "observation").length).toBeGreaterThanOrEqual(3);
  expect(calls.some((call) => !["page", "observation", "ai-pack"].includes(call[0]))).toBe(false);
});

test("position beyond retained context is explanatory and generated pack preserves reduced-context truth", async ({ page }) => {
  await mount(page);
  const outside = await openInvestigation(page, "1051");

  await expect(outside).toContainText("Scanner returned position 51");
  await expect(outside).toContainText("Target in retained Scanner contextNo");
  await expect(outside).toContainText("outside the retained Top-50 Scanner context");
  await outside.getByRole("button", { name: "Generate AI Investigation Pack" }).click();

  await expect(outside).toContainText("Target in Scanner contextNo");
  await expect(outside).toContainText("exports/ai-investigations/capture-22-security-1051");
  await expect(outside).toContainText("PARTIAL_OUTCOME");
});

test("export error is isolated and lost export acknowledgement gives safe relaunch guidance", async ({ page }) => {
  await mount(page);

  const failing = await openInvestigation(page, "1002");
  await failing.getByRole("button", { name: "Generate AI Investigation Pack" }).click();
  await expect(failing.getByRole("alert")).toContainText("synthetic export failure");
  await expect(failing).toContainText("ERROR Incorporated");
  await expect(page.locator('tr[data-security-id="1001"]')).toBeVisible();

  const unknown = await openInvestigation(page, "1003");
  await unknown.getByRole("button", { name: "Generate AI Investigation Pack" }).click();
  await expect(unknown.getByRole("status")).toContainText("may already have been generated locally");
  await expect(unknown.getByRole("status")).toContainText("safe to generate again");
  await expect(unknown.getByText(/Relative folder/)).toHaveCount(0);
});
