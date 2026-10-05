import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RUNTIME_KEY, VIEWER_SHELL_KEY, VIEWER_WINDOW_NAME } from "../../browser/runtime/index.js";
import { DEFAULT_SERVICE_CONFIG, parseServiceConfig } from "../../local-service/server/config.js";
import { buildBrowser } from "../../scripts/build-browser.mjs";
import { buildLiveVerification } from "../../scripts/build-live-verification.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readRootFile(name) {
  return await readFile(path.join(ROOT, name), "utf8");
}

test("package identity and default service DB are Market Flow US", async () => {
  const [packageJson, packageLock] = await Promise.all([
    readRootFile("package.json").then(JSON.parse),
    readRootFile("package-lock.json").then(JSON.parse)
  ]);

  assert.equal(packageJson.name, "market-flow-us");
  assert.equal(packageLock.name, "market-flow-us");
  assert.equal(packageLock.packages[""].name, "market-flow-us");

  assert.equal(path.basename(DEFAULT_SERVICE_CONFIG.dbPath), "market-flow-us.duckdb");
  const parsed = parseServiceConfig([
    "--allowed-origin", "https://example.test"
  ], { cwd: "/tmp/market-flow-us-packaging" });
  assert.equal(
    parsed.dbPath,
    path.resolve("/tmp/market-flow-us-packaging", "data", "market-flow-us.duckdb")
  );
});

test("browser branding keys and generated artifacts use Market Flow US names", async () => {
  assert.equal(RUNTIME_KEY, "__MARKET_FLOW_US_RUNTIME_V1__");
  assert.equal(VIEWER_SHELL_KEY, "__MARKET_FLOW_US_VIEWER_SHELL_V1__");
  assert.equal(VIEWER_WINDOW_NAME, "market-flow-us-viewer-v1");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-build-"));
  try {
    const result = await buildBrowser({ outDir: tempDir });
    assert.equal(path.basename(result.runtimePath), "market-flow-us.runtime.js");
    assert.equal(path.basename(result.bookmarkletPath), "market-flow-us.bookmarklet.txt");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("live-verification generated artifacts use Market Flow US names", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-live-build-"));
  try {
    const result = await buildLiveVerification({
      outDir: tempDir,
      candidateCommit: "abcdef1234567890"
    });
    assert.equal(path.basename(result.runtimePath), "market-flow-us-live-verification.js");
    assert.equal(
      path.basename(result.bookmarkletPath),
      "market-flow-us-live-verification.bookmarklet.txt"
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Windows real-provider launcher and user docs expose only the Market Flow US product path", async () => {
  const [launcher, setup, startHere, userGuide] = await Promise.all([
    readRootFile("START_MARKET_FLOW_US.cmd"),
    readRootFile("SETUP.cmd"),
    readRootFile("START_HERE.md"),
    readRootFile(path.join("docs", "USER_GUIDE.md"))
  ]);

  assert.match(launcher, /Market Flow US/);
  assert.match(launcher, /market-flow-us\.bookmarklet\.txt/);
  assert.match(launcher, /npm run service -- --allowed-origin "%MARKET_FLOW_US_ORIGIN%"/);
  assert.doesNotMatch(launcher, /MarketScope|MARKETSCOPE|market-scope/i);

  assert.match(setup, /START_MARKET_FLOW_US\.cmd/);
  assert.doesNotMatch(setup, /START_MARKETSCOPE\.cmd/);

  for (const content of [startHere, userGuide]) {
    assert.match(content, /Market Flow US/);
    assert.match(content, /START_MARKET_FLOW_US\.cmd/);
    assert.doesNotMatch(content, /START_MARKETSCOPE\.cmd|market-scope\.duckdb|market-scope\.bookmarklet\.txt/i);
  }
});
