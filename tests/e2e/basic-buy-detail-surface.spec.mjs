import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let detailBundle;

test.beforeAll(async () => {
  const modulePath = path.join(ROOT, "browser/viewer/detail-surface.js");
  const result = await build({
    stdin: {
      contents: `import { createDetailSurface } from ${JSON.stringify(modulePath)}; globalThis.__createDetailSurface = createDetailSurface;`,
      resolveDir: ROOT,
      sourcefile: "basic-buy-detail-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  detailBundle = result.outputFiles[0].text;
});

async function mount(page, {
  isCurrent = true,
  confirmationUrl = "http://127.0.0.1:8765/buy/confirm#ticket-1",
  blockPopup = false,
  prepareFailure = false
} = {}) {
  await page.setContent('<main id="root"></main>');
  await page.addScriptTag({ content: detailBundle });
  await page.evaluate(({ isCurrent, confirmationUrl, blockPopup, prepareFailure }) => {
    globalThis.__buyEvents = [];
    const client = {
      async getSecurity(securityId) {
        return {
          found: true,
          securityId,
          paperName: "Fixture Alpha",
          isCurrent,
          currentRow: isCurrent
            ? {
                securityId,
                Symbol: "AAA",
                paperName: "Fixture Alpha",
                LastKnownRate: 10
              }
            : null
        };
      },
      async getHistoryPage() {
        return { rows: [], hasMore: false, nextCursor: null };
      },
      async prepareBuy(securityId) {
        globalThis.__buyEvents.push(["prepare", securityId]);
        if (prepareFailure) throw new Error("synthetic prepare failure");
        return { confirmationUrl };
      }
    };

    globalThis.__detail = globalThis.__createDetailSurface({
      root: document.querySelector("#root"),
      client,
      reserveConfirmationWindow() {
        globalThis.__buyEvents.push("reserve");
        if (blockPopup) return null;
        return {
          navigate(url) {
            globalThis.__buyEvents.push(["navigate", url]);
          },
          close() {
            globalThis.__buyEvents.push("close");
          }
        };
      }
    });
  }, { isCurrent, confirmationUrl, blockPopup, prepareFailure });

  await page.evaluate(() => globalThis.__detail.open("101"));
}

test("current Detail exposes explicit BUY and reserves the confirmation window before preparing the immutable ticket", async ({ page }) => {
  await mount(page);

  const buy = page.getByTestId("detail-buy-button");
  await expect(buy).toBeVisible();
  await expect(buy).toHaveText("BUY / קנייה");

  await buy.click();
  await expect(page.getByTestId("detail-buy-status")).toHaveText("חלון אישור BUY נפתח.");
  await expect.poll(() => page.evaluate(() => globalThis.__buyEvents)).toEqual([
    "reserve",
    ["prepare", "101"],
    ["navigate", "http://127.0.0.1:8765/buy/confirm#ticket-1"]
  ]);
});

test("historical-only Detail never exposes BUY", async ({ page }) => {
  await mount(page, { isCurrent: false });

  await expect(page.getByTestId("detail-buy-button")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => globalThis.__buyEvents)).toEqual([]);
});

test("blocked popup fails before ticket preparation", async ({ page }) => {
  await mount(page, { blockPopup: true });

  await page.getByTestId("detail-buy-button").click();
  await expect(page.getByTestId("detail-buy-status")).toHaveText("הכנת BUY נכשלה.");
  await expect.poll(() => page.evaluate(() => globalThis.__buyEvents)).toEqual([
    "reserve"
  ]);
});

test("non-loopback confirmation URL is rejected and the reserved window closes without navigation", async ({ page }) => {
  await mount(page, {
    confirmationUrl: "https://provider.example/buy/confirm#ticket-1"
  });

  await page.getByTestId("detail-buy-button").click();
  await expect(page.getByTestId("detail-buy-status")).toHaveText("הכנת BUY נכשלה.");
  await expect.poll(() => page.evaluate(() => globalThis.__buyEvents)).toEqual([
    "reserve",
    ["prepare", "101"],
    "close"
  ]);
});
