import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiagnosticTracker,
  DIAGNOSTIC_CHECKPOINTS,
  formatCliDiagnostic
} from "../../shared/diagnostics/index.js";
import {
  buildBrowserSupportSnapshot,
  supportSnapshotJson
} from "../../browser/diagnostics/support-snapshot.js";

test("diagnostic tracker keeps bounded public-safe checkpoint evidence", () => {
  let now = 1000;
  const tracker = createDiagnosticTracker({
    productVersion: "test-version",
    now: () => now++,
    maxRecords: 32
  });

  tracker.recordSuccess({
    component: "browser.runtime",
    operation: "runtime.load",
    operationId: "browser-runtime",
    checkpoint: "browser.runtime.loaded",
    context: {
      ready: true,
      cookie: "SENTINEL_COOKIE",
      accountId: "SENTINEL_ACCOUNT"
    }
  });

  const failure = tracker.recordError({
    component: "provider",
    operation: "provider.universe.collect",
    operationId: "unsafe id with spaces and ?secret=SENTINEL_QUERY",
    checkpoint: "provider.universe.collected",
    lastSuccessfulCheckpoint: "browser.runtime.loaded",
    error: {
      code: "UNIVERSE_INVALID",
      name: "UniverseCollectionError",
      message: "Provider universe acquisition or validation failed.",
      retryable: false,
      rawError: new Error("SENTINEL_RAW_ERROR /private/absolute/path")
    },
    context: {
      requested: 561,
      received: 0,
      authHeader: "SENTINEL_AUTH",
      sql: "SELECT SENTINEL_SQL"
    }
  });

  assert.match(failure.operationId, /^diag-/);
  assert.equal(failure.lastSuccessfulCheckpoint, "browser.runtime.loaded");
  assert.deepEqual(failure.context, { requested: 561, received: 0 });

  for (let index = 0; index < 40; index++) {
    tracker.recordSuccess({
      component: "scanner",
      operation: "scanner.query-library",
      operationId: `query-${index}`,
      checkpoint: "scanner.query_library"
    });
  }

  const snapshot = tracker.snapshot();
  assert.equal(snapshot.recent.length, 32);
  const serialized = JSON.stringify(snapshot);
  for (const sentinel of [
    "SENTINEL_COOKIE",
    "SENTINEL_ACCOUNT",
    "SENTINEL_QUERY",
    "SENTINEL_RAW_ERROR",
    "SENTINEL_AUTH",
    "SENTINEL_SQL",
    "/private/absolute/path"
  ]) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
});

test("checkpoint ownership is strict and includes saved-query, AI export and Basic BUY boundaries", () => {
  assert.equal(DIAGNOSTIC_CHECKPOINTS["scanner.query_library"], "scanner");
  assert.equal(DIAGNOSTIC_CHECKPOINTS["demo_buy.ai_pack_export"], "demo_buy");
  assert.equal(DIAGNOSTIC_CHECKPOINTS["basic_buy.sidecar"], "basic_buy");
  assert.equal(DIAGNOSTIC_CHECKPOINTS["basic_buy.prepare"], "basic_buy");
  const tracker = createDiagnosticTracker();

  assert.throws(() => tracker.recordSuccess({
    component: "viewer",
    operation: "wrong-owner",
    operationId: "wrong-owner",
    checkpoint: "scanner.query_library"
  }), /does not belong/);

  const exportRecord = tracker.recordSuccess({
    component: "demo_buy",
    operation: "demo.buy.ai-pack.create",
    operationId: "ai-export-1",
    checkpoint: "demo_buy.ai_pack_export",
    context: {
      captureId: 7,
      fileCount: 10,
      targetInScannerContext: true,
      outcomeEvidenceStatus: "PARTIAL_OUTCOME",
      securityId: "SENTINEL_SECURITY_ID",
      sql: "SELECT SENTINEL_SQL",
      promptText: "SENTINEL_PROMPT",
      exportPath: "C:\\Users\\private\\exports"
    }
  });
  assert.deepEqual(exportRecord.context, {
    captureId: 7,
    fileCount: 10,
    targetInScannerContext: true,
    outcomeEvidenceStatus: "PARTIAL_OUTCOME"
  });
  const serialized = JSON.stringify(exportRecord);
  assert.equal(serialized.includes("SENTINEL_SECURITY_ID"), false);
  assert.equal(serialized.includes("SENTINEL_SQL"), false);
  assert.equal(serialized.includes("SENTINEL_PROMPT"), false);
  assert.equal(serialized.includes("Users"), false);
});

test("support snapshot remains useful when Node is unavailable and does not copy raw failure", async () => {
  const tracker = createDiagnosticTracker({ productVersion: "browser-test", now: () => 2000 });
  tracker.recordSuccess({
    component: "browser.runtime",
    operation: "runtime.load",
    operationId: "browser-runtime",
    checkpoint: "browser.runtime.loaded"
  });
  tracker.recordError({
    component: "browser.runtime",
    operation: "service.hello",
    operationId: "browser-hello",
    checkpoint: "browser.service.hello",
    lastSuccessfulCheckpoint: "browser.runtime.loaded",
    error: {
      code: "SERVICE_UNAVAILABLE",
      name: "ServiceUnavailableError",
      message: "Local Market Flow US service is unavailable.",
      retryable: false
    }
  });

  const snapshot = await buildBrowserSupportSnapshot({
    productVersion: "browser-test",
    diagnosticTracker: tracker,
    getNodeSnapshot: async () => {
      throw new Error("SENTINEL_RAW_NODE_ERROR C:\\Users\\private\\db.duckdb");
    },
    visibleState: {
      runtimeState: "error",
      viewerSurface: "MAIN",
      selectedSecurityIdPresent: false,
      scannerActive: false,
      selectedSecurityId: "SENTINEL_SECURITY_ID"
    },
    now: () => 3000
  });

  assert.equal(snapshot.node.unavailable, true);
  assert.equal(snapshot.node.diagnostic.checkpoint, "browser.service.hello");
  assert.equal(snapshot.node.diagnostic.code, "SERVICE_UNAVAILABLE");
  assert.deepEqual(snapshot.visibleState, {
    runtimeState: "error",
    viewerSurface: "MAIN",
    selectedSecurityIdPresent: false,
    scannerActive: false
  });

  const json = supportSnapshotJson(snapshot);
  assert.equal(json.includes("SENTINEL_RAW_NODE_ERROR"), false);
  assert.equal(json.includes("SENTINEL_SECURITY_ID"), false);
  assert.equal(json.includes("Users"), false);
});

test("CLI diagnostic format is exactly one parseable prefixed record", () => {
  const tracker = createDiagnosticTracker({ productVersion: "cli-test", now: () => 1234 });
  const record = tracker.recordError({
    component: "node.service",
    operation: "service.startup",
    operationId: "service-startup",
    checkpoint: "node.service.ready",
    lastSuccessfulCheckpoint: "node.database.ready",
    error: {
      code: "SERVICE_LISTEN_ERROR",
      name: "ServiceListenError",
      message: "Loopback service listener could not start.",
      retryable: false
    }
  });

  const line = formatCliDiagnostic(record);
  assert.equal(line.split("\n").length, 1);
  assert.ok(line.startsWith("MARKET_FLOW_US_DIAGNOSTIC "));
  const parsed = JSON.parse(line.slice("MARKET_FLOW_US_DIAGNOSTIC ".length));
  assert.equal(parsed.checkpoint, "node.service.ready");
  assert.equal(parsed.lastSuccessfulCheckpoint, "node.database.ready");
});
