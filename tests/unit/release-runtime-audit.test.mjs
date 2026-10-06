import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildBrowser } from "../../scripts/build-browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function rootFile(relativePath) {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

test("superseded Israel acquisition implementation is absent from the release tree", async () => {
  for (const relativePath of [
    "browser/provider/universe.js",
    "browser/provider/securities.js",
    "browser/collector/cycle.js",
    "tests/unit/provider-data.test.mjs"
  ]) {
    await assert.rejects(access(path.join(ROOT, relativePath)));
  }

  await access(path.join(ROOT, "browser/provider/us-screener.js"));
  await access(path.join(ROOT, "browser/provider/us-universe.js"));
  await access(path.join(ROOT, "browser/collector/us-cycle.js"));
  await access(path.join(ROOT, "tests/unit/us-provider-data.test.mjs"));
});

test("normal browser artifact and default composition use only the U.S. acquisition authority", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-release-audit-"));
  try {
    const result = await buildBrowser({ outDir: tempDir });
    const runtime = await readFile(result.runtimePath, "utf8");
    const application = await rootFile("browser/runtime/application.js");

    assert.match(runtime, /ScreenerHulPaging3/);
    assert.doesNotMatch(runtime, /MapHeat2|GetSecuritiesData/);

    assert.match(application, /collectUsCollectionCandidate/);
    assert.match(application, /US_CURRENT_PROFILE/);
    assert.match(application, /US_DETAIL_PROFILE/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("normal service command boots the Market Flow US schema-v4 database path", async () => {
  const [packageJson, serverEntry, schema] = await Promise.all([
    rootFile("package.json").then(JSON.parse),
    rootFile("local-service/server/index.js"),
    rootFile("local-service/database/schema.js")
  ]);

  assert.equal(packageJson.scripts.service, "node local-service/server/index.js");
  assert.match(serverEntry, /openMarketFlowUsDatabase/);
  assert.doesNotMatch(serverEntry, /openMarketScopeDatabase/);
  assert.match(schema, /MARKET_FLOW_US_SCHEMA_VERSION\s*=\s*4/);
  assert.match(schema, /demo_buy_captures/);
  assert.match(schema, /demo_buy_items/);
});

test("Scanner authoring guide is reclosed against the complete schema-v4 contract", async () => {
  const guide = await rootFile("docs/SCANNER_SQL_GUIDE.md");

  assert.match(guide, /active Market Flow US contract is \*\*schema v4\*\*/);
  assert.match(guide, /ScreenerHulPaging3/);
  assert.match(guide, /SCANNER_US_SCHEMA_MANIFEST_V4/);
  assert.match(guide, /SCANNER_US_SCHEMA_TYPES_V4/);
  assert.match(guide, /demo_buy_captures/);
  assert.match(guide, /demo_buy_items/);
  assert.match(guide, /no persisted Demo Buy outcome table/i);
  assert.doesNotMatch(
    guide,
    /active Market Flow US contract is \*\*schema v3\*\*|pre-cutover|schema v2|SCANNER_SCHEMA_MANIFEST_V2|SCANNER_SCHEMA_TYPES_V2|MapHeat2|GetSecuritiesData/
  );
  assert.doesNotMatch(
    guide,
    /LastKnownRate|BaseRateChangePercentage|BuyLimit1|SellLimit1|DailyDealsQuantity|DailyNISRevenue/
  );
});

test("first-run acceptance plan and user runbook stay reclosed through branch-8 and final provider proof", async () => {
  const [startHere, plan, runbook, liveVerification] = await Promise.all([
    rootFile("START_HERE.md"),
    rootFile(".planning/FIRST_RUN_ACCEPTANCE_PLAN.md"),
    rootFile("docs/FIRST_RUN_ACCEPTANCE.md"),
    rootFile("docs/LIVE_VERIFICATION.md")
  ]);

  assert.match(startHere, /docs\/FIRST_RUN_ACCEPTANCE\.md/);
  assert.match(startHere, /PRE-MARKET|לפני שעות המסחר/);
  assert.match(startHere, /NO_MARKET_MOVEMENT_OBSERVED/);

  for (const checkpoint of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14]) {
    assert.match(plan, new RegExp(`FR-${checkpoint}\\b`));
    assert.match(runbook, new RegExp(`## FR-${checkpoint}\\b`));
  }
  for (const checkpoint of ["11A", "11B"]) {
    assert.match(plan, new RegExp(`FR-${checkpoint}\\b`));
    assert.match(runbook, new RegExp(`## FR-${checkpoint}\\b`));
  }

  for (const subCheckpoint of ["8A", "8B", "8C", "8D", "8E", "8F", "8G", "8H"]) {
    assert.match(plan, new RegExp(`FR-${subCheckpoint}\\b`));
    assert.match(runbook, new RegExp(`FR-${subCheckpoint}\\b`));
  }

  const acceptedCandidate = "28e950afc1c4bfe4322d0593f483d05d92553e2d";
  assert.match(plan, /post-order-service candidate/i);
  assert.match(plan, /FR-2 proves the target machine is checked out to that SHA/);
  assert.match(runbook, new RegExp(acceptedCandidate));
  assert.match(runbook, new RegExp(`git switch --detach ${acceptedCandidate}`));
  assert.doesNotMatch(runbook, /f2789a4ec43e0878688aa9ea29c647e40a1154b6/);

  assert.match(runbook, /SETUP\.cmd/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd provider-recovery/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd demo-buy-runtime/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd demo-buy-outcomes/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd ai-investigation-ui/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd ai-pack-safety/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd feature/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd target/);
  assert.match(runbook, /fresh active DB.*schema v4/i);
  assert.match(runbook, /NEW_TRADING_DAY\.cmd/);
  assert.match(runbook, /RUN_IBKR_ORDER_ACCEPTANCE\.cmd/);
  assert.match(runbook, /CHECK_IBKR_SESSION\.cmd/);
  assert.match(runbook, /PENDING_EXTERNAL_PERMISSION/);
  assert.match(runbook, /PREPARE_LIVE_VERIFICATION\.cmd/);
  assert.match(runbook, /PRE-MARKET READINESS = PASS/);
  assert.match(runbook, /FR-13 = PENDING MARKET MOVEMENT/);
  assert.match(runbook, /NO_MARKET_MOVEMENT_OBSERVED/);
  assert.match(runbook, /ממשיכים ישירות ל־FR-13/);
  assert.match(runbook, /movement\.status = "PENDING"/);
  assert.match(runbook, /movement\.status = "PASS"/);
  assert.match(runbook, /movement\.status = "FAIL"/);

  assert.match(plan, /Two-pass first run is valid/);
  assert.match(plan, /PRE-MARKET READINESS = PASS/);
  assert.match(plan, /do not replay FR-0\.\.FR-12/i);
  assert.match(plan, /Demo Buy \+ AI Investigation/);
  assert.match(plan, /fresh active DB is schema v4/);
  assert.match(plan, /RUN_IBKR_ORDER_ACCEPTANCE\.cmd/);
  assert.match(plan, /CHECK_IBKR_SESSION\.cmd/);
  assert.match(plan, /PENDING_EXTERNAL_PERMISSION/);

  assert.match(liveVerification, /overall = "PASS"/);
  assert.match(liveVerification, /movement\.status = "PENDING"/);
  assert.match(liveVerification, /NO_MARKET_MOVEMENT_OBSERVED/);
  assert.match(liveVerification, /movement\.status = "PASS"/);
  assert.match(liveVerification, /collected_at_ms/);
});
