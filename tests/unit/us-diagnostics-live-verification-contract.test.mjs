import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createDiagnosticTracker,
  formatCliDiagnostic
} from "../../shared/diagnostics/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function readRootFile(relativePath) {
  return await readFile(path.join(ROOT, relativePath), "utf8");
}

test("diagnostic CLI fallback identifies Market Flow US and remains sanitized", () => {
  const tracker = createDiagnosticTracker({ productVersion: "6.2-proof", now: () => 1234 });
  const record = tracker.recordError({
    component: "provider",
    operation: "provider.screener.snapshot",
    operationId: "us-provider-snapshot",
    checkpoint: "provider.cycle.collected",
    error: {
      code: "US_PROVIDER_SNAPSHOT_FAILED",
      name: "ProviderSnapshotError",
      message: "ScreenerHulPaging3 snapshot acquisition or validation failed.",
      retryable: true,
      cookie: "SENTINEL_COOKIE"
    },
    context: {
      requested: 4015,
      received: 0,
      accountId: "SENTINEL_ACCOUNT",
      authorization: "SENTINEL_AUTH"
    }
  });

  const line = formatCliDiagnostic(record);
  assert.ok(line.startsWith("MARKET_FLOW_US_DIAGNOSTIC "));
  assert.equal(line.includes("MARKETSCOPE_DIAGNOSTIC"), false);
  assert.equal(line.includes("SENTINEL_COOKIE"), false);
  assert.equal(line.includes("SENTINEL_ACCOUNT"), false);
  assert.equal(line.includes("SENTINEL_AUTH"), false);
});

test("live verification is wired to the production U.S. single-response seam and mandatory sustained bounds", async () => {
  const [harness, entrypoint] = await Promise.all([
    readRootFile("browser/live-verification/harness.js"),
    readRootFile("browser/live-verification/index.js")
  ]);
  const source = `${harness}\n${entrypoint}`;

  assert.match(harness, /collectUsCollectionCandidate/);
  assert.match(harness, /createUsRecorderConfig/);
  assert.match(source, /market-flow-us-real-provider/);
  assert.match(harness, /(?:20|MIN[^\n]*CYCLES)/i);
  assert.match(harness, /(?:60_000|60000|MIN[^\n]*DURATION)/i);

  for (const legacy of [
    "collectCompleteCycle",
    "loadValidatedUniverse",
    "chunkSize",
    "chunkDelayMs",
    "market-scope-real-provider"
  ]) {
    assert.equal(source.includes(legacy), false, legacy);
  }
});

test("live verification runbook describes the bounded ScreenerHulPaging3 gate and Market Flow US artifacts", async () => {
  const runbook = await readRootFile("docs/LIVE_VERIFICATION.md");

  assert.match(runbook, /ScreenerHulPaging3/);
  assert.match(runbook, /at least 20/i);
  assert.match(runbook, /at least 60 seconds/i);
  assert.match(runbook, /market-flow-us-live-verification\.bookmarklet\.txt/);
  assert.match(runbook, /__MARKET_FLOW_US_LIVE_VERIFICATION_RESULT_V1__/);

  assert.doesNotMatch(runbook, /MapHeat|GetSecuritiesData|market-scope-live-verification|__MARKET_SCOPE_/i);
});
