import assert from "node:assert/strict";
import test from "node:test";

import {
  browserVersionSummary,
  providerOriginHost,
  runBoundedLiveVerification
} from "../../browser/live-verification/harness.js";

function createUniverse() {
  return {
    loadedAtMs: 100,
    recordCount: 2,
    securities: [
      {
        securityId: "1001",
        paperName: "Alpha",
        mapHeatDateChange: 1,
        rawMapHeat: { PaperId: 1001, cookie: "secret-cookie" }
      },
      {
        securityId: "1002",
        paperName: "Beta",
        mapHeatDateChange: 2,
        rawMapHeat: { PaperId: 1002, accountId: "account-123" }
      }
    ]
  };
}

function createCycle() {
  return {
    status: "complete",
    startedAtMs: 200,
    completedAtMs: 300,
    durationMs: 100,
    requested: 2,
    received: 2,
    unique: 2,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [],
    securities: [
      { securityId: "1001", data: { Key: 1001, authorization: "secret-auth" } },
      { securityId: "1002", data: { Key: 1002, sessionToken: "secret-session" } }
    ]
  };
}

function createHappyDependencies(events) {
  const producerState = {
    state: "idle",
    sessionId: null,
    acknowledgedUniverseRevision: null,
    pendingRequests: 0
  };

  const producer = {
    async startSession() {
      events.push("producer.start");
      producerState.state = "ready";
      producerState.sessionId = "private-session-id";
      return { sessionId: producerState.sessionId };
    },
    async acceptUniverse(universe) {
      events.push("producer.universe");
      assert.equal(universe.recordCount, 2);
      producerState.acknowledgedUniverseRevision = 7;
      return { universeRevision: 7, recordCount: 2 };
    },
    async commitCycle(cycle) {
      events.push("producer.commit");
      assert.equal(cycle.received, 2);
      return { cycleId: 42, committedAtMs: 350 };
    },
    async stopSession(reason) {
      events.push(`producer.stop:${reason}`);
      producerState.state = "stopped";
      producerState.sessionId = null;
      producerState.acknowledgedUniverseRevision = null;
      return { status: "stopped" };
    },
    getState() {
      return { ...producerState };
    }
  };

  const viewer = {
    async getCurrent() {
      events.push("viewer.current");
      return {
        rows: [{ securityId: "1001" }, { securityId: "1002" }],
        summary: { rowCount: 2, lastCycleId: 42, lastCollectedAtMs: 300 }
      };
    },
    async getSecurity(securityId) {
      events.push("viewer.security");
      return {
        found: true,
        securityId,
        paperName: "Alpha",
        isCurrent: true,
        currentRow: { securityId }
      };
    },
    async getHistoryPage(securityId, cursor) {
      events.push("viewer.history");
      assert.equal(securityId, "1001");
      assert.equal(cursor, null);
      return {
        rows: [{ securityId, cycleId: 42 }],
        hasMore: false,
        nextCursor: null
      };
    },
    async executeScanner(sql) {
      events.push("scanner.execute");
      assert.match(sql, /FROM latest/);
      assert.match(sql, /security_id = '1001'/);
      return {
        columns: [
          { name: "security_id", type: "VARCHAR" },
          { name: "cycle_id", type: "BIGINT" }
        ],
        rows: [["1001", "42"]],
        rowCount: 1
      };
    },
    async getStatus() {
      events.push("viewer.status");
      return {
        recorderHealth: "RUNNING",
        lastCompletedCycleId: 42
      };
    },
    close() {
      events.push("viewer.close");
    }
  };

  return {
    producer,
    viewer,
    producerBridgeFactory() {
      return producer;
    },
    viewerClientFactory() {
      return viewer;
    }
  };
}

test("live verification orchestrates one bounded production-shaped proof and emits only sanitized summary fields", async () => {
  const events = [];
  const deps = createHappyDependencies(events);
  const universe = createUniverse();
  const cycle = createCycle();
  let clock = 1000;

  const report = await runBoundedLiveVerification({
    candidateCommit: "abc1234",
    providerOrigin: "https://provider.example/private/path?account=123",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
    now: () => clock++,
    loadUniverse: async () => {
      events.push("provider.universe");
      return universe;
    },
    collectCycle: async ({ universe: actualUniverse, config }) => {
      events.push("provider.cycle");
      assert.equal(actualUniverse, universe);
      assert.equal(config.chunkSize, 187);
      return cycle;
    },
    producerBridgeFactory: deps.producerBridgeFactory,
    viewerClientFactory: deps.viewerClientFactory
  });

  assert.equal(report.overall, "PASS");
  assert.equal(report.candidateCommit, "abc1234");
  assert.equal(report.browserVersion, "Chrome/154.0.0.0");
  assert.equal(report.providerOriginHost, "provider.example");
  assert.equal(report.universeCount, 2);
  assert.deepEqual(report.cycle, { requested: 2, received: 2, unique: 2 });
  assert.equal(report.cycleId, 42);
  assert.equal(report.currentRowCount, 2);
  assert.equal(report.selectedSecurityId, "1001");
  assert.equal(report.historyProofCount, 1);
  assert.equal(report.historyCycleId, 42);
  assert.deepEqual(report.scannerProof, {
    rowCount: 1,
    securityIdMatched: true,
    cycleIdMatched: true
  });
  assert.equal(report.transportCspLna, "PASS");
  assert.equal(report.producerOwnership, "PASS");
  assert.equal(report.cleanStop, true);

  assert.deepEqual(events, [
    "producer.start",
    "provider.universe",
    "producer.universe",
    "provider.cycle",
    "producer.commit",
    "viewer.current",
    "viewer.security",
    "viewer.history",
    "scanner.execute",
    "viewer.status",
    "viewer.close",
    "producer.stop:live_verification_complete"
  ]);

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "secret-cookie",
    "account-123",
    "secret-auth",
    "secret-session",
    "private-session-id",
    "/private/path",
    "Windows NT"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("live verification fails closed, stops producer, and never copies raw failure details into its report", async () => {
  const events = [];
  const deps = createHappyDependencies(events);
  let clock = 2000;

  const report = await runBoundedLiveVerification({
    candidateCommit: "def4567",
    providerOrigin: "https://provider.example",
    userAgent: "Chrome/154.0.0.0 raw-private-os-detail",
    now: () => clock++,
    loadUniverse: async () => {
      events.push("provider.universe");
      const error = new Error("cookie=raw-secret; account=private-account");
      error.code = "SESSION-private-code";
      throw error;
    },
    producerBridgeFactory: deps.producerBridgeFactory,
    viewerClientFactory: deps.viewerClientFactory
  });

  assert.equal(report.overall, "FAIL");
  assert.equal(report.failure.checkpoint, "provider.universe");
  assert.equal(report.failure.code, "LIVE_STEP_FAILED");
  assert.equal(
    report.failure.message,
    "Provider universe acquisition or validation did not complete."
  );
  assert.equal(report.transportCspLna, "PASS");
  assert.ok(events.includes("producer.stop:live_verification_complete"));
  assert.equal(events.includes("viewer.current"), false);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("raw-secret"), false);
  assert.equal(serialized.includes("private-account"), false);
  assert.equal(serialized.includes("SESSION-private-code"), false);
  assert.equal(serialized.includes("raw-private-os-detail"), false);
});

test("live verification helpers expose host-only Origin and browser family/version", () => {
  assert.equal(
    providerOriginHost("https://provider.example:443/ignored/path?query=1"),
    "provider.example"
  );
  assert.equal(
    browserVersionSummary("Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36"),
    "Chrome/154.0.0.0"
  );
  assert.equal(browserVersionSummary("opaque-agent"), "unknown");
});

test("live verification rejects an unsafe candidate identifier without echoing it", async () => {
  const report = await runBoundedLiveVerification({
    candidateCommit: "private-account-id",
    providerOrigin: "https://provider.example"
  });

  assert.equal(report.overall, "FAIL");
  assert.equal(report.candidateCommit, "unknown");
  assert.equal(report.failure.checkpoint, "harness.input");
  assert.equal(JSON.stringify(report).includes("private-account-id"), false);
});
