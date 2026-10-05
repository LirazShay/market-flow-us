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
  const [setup, demo, reset, tests, real, live, newDay] = await Promise.all([
    launcher("SETUP.cmd"),
    launcher("START_DEMO.cmd"),
    launcher("RESET_DEMO.cmd"),
    launcher("RUN_TESTS.cmd"),
    launcher("START_MARKET_FLOW_US.cmd"),
    launcher("PREPARE_LIVE_VERIFICATION.cmd"),
    launcher("NEW_TRADING_DAY.cmd")
  ]);

  assert.match(setup, /npm ci/);
  assert.match(setup, /playwright install chromium/);
  assert.match(setup, /Node\.js 24\.x/);
  assert.match(setup, /START_MARKET_FLOW_US\.cmd/);

  assert.match(demo, /npm run demo:fake-market/);
  assert.match(demo, /http:\/\/127\.0\.0\.1:4173\//);

  assert.match(reset, /npm run demo:reset/);
  assert.doesNotMatch(reset, /\b(?:del|erase|rd|rmdir)\b/i);

  assert.match(tests, /npm run test:fast/);
  assert.match(tests, /npm run build:browser/);
  assert.match(tests, /npm run test:e2e/);

  assert.match(real, /npm run build:browser/);
  assert.match(real, /npm run service -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%"/);
  assert.match(real, /market-flow-us\.bookmarklet\.txt/);
  assert.doesNotMatch(real, /MarketScope|MARKETSCOPE|market-scope/i);

  assert.match(live, /npm run build:live-verification/);
  assert.match(live, /--allowed-origin "%MARKET_FLOW_US_ORIGIN%"/);
  assert.match(live, /--db data\/live-verification\.duckdb/);
  assert.match(live, /market-flow-us-live-verification\.bookmarklet\.txt/);
  assert.doesNotMatch(live, /MarketScope|MARKETSCOPE|market-scope/i);

  assert.match(newDay, /npm run db:new-day/);
  assert.match(newDay, /data\\archive\\/);
  assert.match(newDay, /Saved Scanner queries/);
  assert.doesNotMatch(newDay, /\b(?:del|erase|rd|rmdir)\b/i);

  for (const content of [setup, demo, reset, tests, real, live, newDay]) {
    assert.match(content, /pushd "%~dp0"/);
    assert.doesNotMatch(content, /MarketScope|MARKETSCOPE|market-scope/i);
  }
});
