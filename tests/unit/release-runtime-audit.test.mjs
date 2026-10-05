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

test("normal service command boots the Market Flow US schema-v3 database path", async () => {
  const [packageJson, serverEntry, schema] = await Promise.all([
    rootFile("package.json").then(JSON.parse),
    rootFile("local-service/server/index.js"),
    rootFile("local-service/database/schema.js")
  ]);

  assert.equal(packageJson.scripts.service, "node local-service/server/index.js");
  assert.match(serverEntry, /openMarketFlowUsDatabase/);
  assert.doesNotMatch(serverEntry, /openMarketScopeDatabase/);
  assert.match(schema, /MARKET_FLOW_US_SCHEMA_VERSION\s*=\s*3/);
});

test("Scanner authoring guide exposes only the active U.S. schema-v3 contract", async () => {
  const guide = await rootFile("docs/SCANNER_SQL_GUIDE.md");

  assert.match(guide, /active Market Flow US contract is \*\*schema v3\*\*/);
  assert.match(guide, /ScreenerHulPaging3/);
  assert.match(guide, /SCANNER_US_SCHEMA_MANIFEST_V3/);
  assert.doesNotMatch(
    guide,
    /pre-cutover|schema v2|SCANNER_SCHEMA_MANIFEST_V2|SCANNER_SCHEMA_TYPES_V2|MapHeat2|GetSecuritiesData/
  );
  assert.doesNotMatch(
    guide,
    /LastKnownRate|BaseRateChangePercentage|BuyLimit1|SellLimit1|DailyDealsQuantity|DailyNISRevenue/
  );
});

test("first-run acceptance is complete and routed from START_HERE", async () => {
  const [startHere, runbook] = await Promise.all([
    rootFile("START_HERE.md"),
    rootFile("docs/FIRST_RUN_ACCEPTANCE.md")
  ]);

  assert.match(startHere, /docs\/FIRST_RUN_ACCEPTANCE\.md/);

  for (let checkpoint = 0; checkpoint <= 14; checkpoint += 1) {
    assert.match(runbook, new RegExp(`## FR-${checkpoint}\\b`));
  }

  assert.match(runbook, /SETUP\.cmd/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd provider-recovery/);
  assert.match(runbook, /RUN_LOCAL_ACCEPTANCE\.cmd target/);
  assert.match(runbook, /NEW_TRADING_DAY\.cmd/);
  assert.match(runbook, /PREPARE_LIVE_VERIFICATION\.cmd/);
  assert.match(runbook, /pending\/inconclusive/);
});
