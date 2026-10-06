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
  const [setup, demo, reset, tests, real, replay, live, newDay, order, sessionCheck, orderAcceptance] = await Promise.all([
    launcher("SETUP.cmd"),
    launcher("START_DEMO.cmd"),
    launcher("RESET_DEMO.cmd"),
    launcher("RUN_TESTS.cmd"),
    launcher("START_MARKET_FLOW_US.cmd"),
    launcher("START_MARKET_REPLAY.cmd"),
    launcher("PREPARE_LIVE_VERIFICATION.cmd"),
    launcher("NEW_TRADING_DAY.cmd"),
    launcher("START_IBKR_ORDER_SERVICE.cmd"),
    launcher("CHECK_IBKR_SESSION.cmd"),
    launcher("RUN_IBKR_ORDER_ACCEPTANCE.cmd")
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

  assert.match(replay, /npm run build:replay/);
  assert.match(replay, /call npm run replay-host -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%"/);
  assert.match(replay, /market-flow-us-replay\.bookmarklet\.txt/);
  assert.match(replay, /normal live DB is never opened or reset by Replay Host/i);
  assert.doesNotMatch(replay, /\b(?:del|erase|rd|rmdir)\b/i);
  assert.doesNotMatch(replay, /caller.?token|control.?token|cookie/i);
  assert.doesNotMatch(replay, /MARKET_FLOW_US_.*(?:TOKEN|SECRET)/i);

  assert.match(live, /npm run build:live-verification/);
  assert.match(live, /--allowed-origin "%MARKET_FLOW_US_ORIGIN%"/);
  assert.match(live, /--db data\/live-verification\.duckdb/);
  assert.match(live, /market-flow-us-live-verification\.bookmarklet\.txt/);
  assert.doesNotMatch(live, /MarketScope|MARKETSCOPE|market-scope/i);

  assert.match(newDay, /npm run db:new-day/);
  assert.match(newDay, /data\\archive\\/);
  assert.match(newDay, /Saved Scanner queries/);
  assert.match(newDay, /fresh schema-v4 active DB/);
  assert.match(newDay, /Demo Buy capture\/item state will start clean/);
  assert.doesNotMatch(newDay, /schema-v3 active DB/);
  assert.doesNotMatch(newDay, /\b(?:del|erase|rd|rmdir)\b/i);

  assert.match(order, /Starting standalone IBKR order service in DRY_RUN mode/);
  assert.match(order, /if \/I "%~1"=="LIVE"/);
  assert.match(order, /call npm run order-service -- --live/);
  assert.match(order, /call npm run order-service(?:\r?\n|\s)/);
  assert.match(order, /DRY_RUN cannot submit provider orders/);
  assert.doesNotMatch(order, /caller.?token|account.?id|password|cookie/i);
  assert.doesNotMatch(order, /npm run service(?:\s|$)/);

  assert.match(sessionCheck, /call npm run order-service:session-check/);
  assert.match(sessionCheck, /INSECURE_LOCALHOST_TLS/);
  assert.match(sessionCheck, /--allow-insecure-loopback-tls/);
  assert.doesNotMatch(sessionCheck, /--live/);

  assert.match(orderAcceptance, /call npm run test:acceptance:order/);
  assert.match(orderAcceptance, /synthetic-only/i);
  assert.match(orderAcceptance, /never requires or claims a real-money order/i);

  for (const content of [setup, demo, reset, tests, real, replay, live, newDay, order, sessionCheck, orderAcceptance]) {
    assert.match(content, /pushd "%~dp0"/);
    assert.doesNotMatch(content, /MarketScope|MARKETSCOPE|market-scope/i);
  }
});
