import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function launcher(name) {
  return await readFile(path.join(ROOT, name), "utf8");
}

test("Windows launchers remain thin wrappers around canonical npm commands", async () => {
  const [setup, demo, reset, tests, real, live] = await Promise.all([
    launcher("SETUP.cmd"),
    launcher("START_DEMO.cmd"),
    launcher("RESET_DEMO.cmd"),
    launcher("RUN_TESTS.cmd"),
    launcher("START_MARKETSCOPE.cmd"),
    launcher("PREPARE_LIVE_VERIFICATION.cmd")
  ]);

  assert.match(setup, /npm ci/);
  assert.match(setup, /playwright install chromium/);
  assert.match(setup, /Node\.js 24\.x/);

  assert.match(demo, /npm run demo:fake-market/);
  assert.match(demo, /http:\/\/127\.0\.0\.1:4173\//);

  assert.match(reset, /npm run demo:reset/);
  assert.doesNotMatch(reset, /\b(?:del|erase|rd|rmdir)\b/i);

  assert.match(tests, /npm run test:fast/);
  assert.match(tests, /npm run build:browser/);
  assert.match(tests, /npm run test:e2e/);

  assert.match(real, /npm run build:browser/);
  assert.match(real, /npm run service -- --allowed-origin "%MARKETSCOPE_ORIGIN%"/);
  assert.match(real, /market-scope\.bookmarklet\.txt/);

  assert.match(live, /npm run build:live-verification/);
  assert.match(live, /--allowed-origin "%MARKETSCOPE_ORIGIN%"/);
  assert.match(live, /--db data\/live-verification\.duckdb/);
  assert.match(live, /market-scope-live-verification\.bookmarklet\.txt/);

  for (const content of [setup, demo, reset, tests, real, live]) {
    assert.match(content, /pushd "%~dp0"/);
  }
});
