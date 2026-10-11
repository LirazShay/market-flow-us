import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let appBundle;

test.beforeAll(async () => {
  const indexPath = path.join(ROOT, "browser/backtest-lab/index.js");
  const result = await build({
    stdin: {
      contents: `import ${JSON.stringify(indexPath)};`,
      resolveDir: ROOT,
      sourcefile: "backtest-beginner-guidance-test-entry.js"
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    write: false
  });
  appBundle = result.outputFiles[0].text;
});

test("Sweep explains repeated baselines without implying point deduplication", async ({ page }) => {
  await page.setContent("<!doctype html><body></body>");
  await page.evaluate(() => {
    const json = (body) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    globalThis.fetch = async (url) => {
      const pathname = String(url);
      if (pathname === "/api/sources") {
        return json({
          sources: [{ sourceId: "active", kind: "active", fileName: "market-flow-us.duckdb" }],
          count: 1
        });
      }
      if (pathname === "/api/queries") {
        return json({
          queries: [
            { id: "q-a", name: "A", sql: "SELECT security_id AS securityId FROM latest" },
            { id: "q-b", name: "B", sql: "SELECT security_id AS securityId FROM latest ORDER BY security_id" }
          ],
          count: 2
        });
      }
      throw new Error(`Unexpected request: ${pathname}`);
    };
  });

  await page.addScriptTag({ content: appBundle });
  const host = page.locator("#market-flow-us-backtest-lab");
  await expect(host.getByRole("button", { name: "Run Backtest" })).toBeEnabled();

  await host.getByRole("radio", { name: "Sweep", exact: true }).check();
  const guidance = host.locator(".sweep-baseline-help");
  await expect(guidance).toBeVisible();
  await expect(guidance).toHaveAttribute("aria-label", "Repeated baseline guidance");
  await expect(guidance).toContainText("כמה זמני T0 שונים יכולים להיפתר לאותו market cycle");
  await expect(guidance).toContainText("כל T0 נשאר נקודת החלטה נפרדת");
  await expect(guidance).toContainText("יעדי horizon ותוצאות משלו");
  await expect(guidance).toContainText("אינה מאחדת את הנקודות");
});
