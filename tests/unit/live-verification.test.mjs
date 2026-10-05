import assert from "node:assert/strict";
import test from "node:test";

import {
  browserVersionSummary,
  MIN_COMPLETE_CYCLES,
  MIN_RUN_DURATION_MS,
  providerOriginHost,
  runBoundedLiveVerification
} from "../../browser/live-verification/harness.js";

function createCandidate({ clock, membership, index }) {
  const records = membership.map((securityId, rowIndex) => ({
    PaperId: Number(securityId),
    Symbol: `SYM${securityId}`,
    PaperNameEng: `Security ${securityId}`,
    Price: 100 + index + rowIndex,
    cookie: `SENTINEL_COOKIE_${index}`,
    accountId: `SENTINEL_ACCOUNT_${index}`
  }));

  const universe = {
    loadedAtMs: clock.value,
    recordCount: membership.length,
    membership: [...membership],
    securities: records.map((row) => ({
      securityId: String(row.PaperId),
      symbol: row.Symbol,
      paperNameEng: row.PaperNameEng,
      rawSource: row
    }))
  };

  const cycle = {
    status: "complete",
    startedAtMs: clock.value - 100,
    completedAtMs: clock.value,
    durationMs: 100,
    requested: membership.length,
    received: membership.length,
    unique: membership.length,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: membership.length,
      received: membership.length,
      unique: membership.length,
      requestStartedAtMs: clock.value - 100,
      receivedAtMs: clock.value,
      completedAtMs: clock.value,
      durationMs: 100,
      httpStatus: 200
    }],
    securities: records.map((row) => ({
      securityId: String(row.PaperId),
      chunkIndex: 0,
      chunkReceivedAtMs: clock.value,
      collectedAtMs: clock.value,
      data: {
        ...row,
        authorization: `SENTINEL_AUTH_${index}`,
        sessionToken: `SENTINEL_SESSION_${index}`
      }
    }))
  };

  return { universe, cycle };
}

function createHappyDependencies(events, shared) {
  const producerState = {
    state: "idle",
    sessionId: null,
    acknowledgedUniverseRevision: null,
    pendingRequests: 0
  };

  const producer = {
    async startSession(config) {
      events.push("producer.start");
      assert.deepEqual(Object.keys(config), ["snapshotIntervalMs"]);
      assert.equal(config.snapshotIntervalMs, 3000);
      producerState.state = "ready";
      producerState.sessionId = "SENTINEL_PRIVATE_SESSION_ID";
      return { sessionId: producerState.sessionId };
    },
    async acceptUniverse(universe) {
      events.push(`producer.universe:${universe.membership.join(",")}`);
      shared.universeRevision += 1;
      producerState.acknowledgedUniverseRevision = shared.universeRevision;
      return {
        universeRevision: shared.universeRevision,
        recordCount: universe.recordCount
      };
    },
    async commitCycle(cycle) {
      events.push("producer.commit");
      assert.equal(cycle.status, "complete");
      shared.lastCycleId += 1;
      shared.commitIds.push(shared.lastCycleId);
      return { cycleId: shared.lastCycleId, committedAtMs: shared.clock.value };
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
        rows: shared.finalMembership.map((securityId) => ({ securityId })),
        summary: {
          rowCount: shared.finalMembership.length,
          lastCycleId: shared.lastCycleId,
          lastCollectedAtMs: shared.clock.value
        }
      };
    },
    async getSecurity(securityId) {
      events.push("viewer.security");
      return {
        found: true,
        securityId,
        paperName: "Stable Security",
        isCurrent: true,
        currentRow: { securityId }
      };
    },
    async getHistoryPage(securityId, cursor) {
      events.push("viewer.history");
      assert.equal(securityId, "1001");
      assert.equal(cursor, null);
      return {
        rows: shared.commitIds.map((cycleId) => ({ securityId, cycleId })),
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
        rows: [["1001", String(shared.lastCycleId)]],
        rowCount: 1
      };
    },
    async getStatus() {
      events.push("viewer.status");
      return {
        recorderHealth: "RUNNING",
        lastCompletedCycleId: shared.lastCycleId
      };
    },
    close() {
      events.push("viewer.close");
    }
  };

  return {
    producerBridgeFactory() {
      return producer;
    },
    viewerClientFactory() {
      return viewer;
    }
  };
}

test("live verification proves a sustained U.S. run, membership revisions, final authority and sanitized output", async () => {
  const events = [];
  const clock = { value: 1000 };
  const shared = {
    clock,
    universeRevision: 0,
    lastCycleId: 100,
    commitIds: [],
    finalMembership: ["1001", "1003"]
  };
  const deps = createHappyDependencies(events, shared);
  let candidateIndex = 0;

  const report = await runBoundedLiveVerification({
    candidateCommit: "abc1234",
    providerOrigin: "https://provider.example/private/path?account=123",
    userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
    now: () => clock.value,
    wait: async (delayMs) => {
      clock.value += delayMs;
    },
    collectCandidate: async () => {
      candidateIndex += 1;
      clock.value += 100;
      const membership = candidateIndex < 11
        ? ["1001", "1002"]
        : shared.finalMembership;
      return createCandidate({ clock, membership, index: candidateIndex });
    },
    producerBridgeFactory: deps.producerBridgeFactory,
    viewerClientFactory: deps.viewerClientFactory
  });

  assert.equal(report.overall, "PASS");
  assert.equal(report.verification, "market-flow-us-real-provider");
  assert.equal(report.candidateCommit, "abc1234");
  assert.equal(report.browserVersion, "Chrome/154.0.0.0");
  assert.equal(report.providerOriginHost, "provider.example");
  assert.ok(report.sustainedRun.completedCycles >= MIN_COMPLETE_CYCLES);
  assert.equal(report.sustainedRun.commitAckCount, report.sustainedRun.completedCycles);
  assert.ok(report.sustainedRun.durationMs >= MIN_RUN_DURATION_MS);
  assert.equal(report.sustainedRun.snapshotIntervalMs, 3000);
  assert.equal(report.sustainedRun.universeAckCount, 2);
  assert.equal(report.sustainedRun.universeRevisionCount, 2);
  assert.equal(report.currentRowCount, 2);
  assert.equal(report.selectedSecurityId, "1001");
  assert.equal(report.historyProofCount, report.sustainedRun.completedCycles);
  assert.equal(report.scannerProof.securityIdMatched, true);
  assert.equal(report.scannerProof.cycleIdMatched, true);
  assert.equal(report.transportCspLna, "PASS");
  assert.equal(report.producerOwnership, "PASS");
  assert.equal(report.lastSuccessfulCheckpoint, "producer.ownership");
  assert.equal(report.cleanStop, true);

  assert.equal(events.filter((event) => event === "producer.commit").length, report.sustainedRun.completedCycles);
  assert.equal(events.filter((event) => event.startsWith("producer.universe:")).length, 2);
  assert.equal(events.at(0), "producer.start");
  assert.equal(events.at(-1), "producer.stop:live_verification_complete");

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "SENTINEL_COOKIE",
    "SENTINEL_ACCOUNT",
    "SENTINEL_AUTH",
    "SENTINEL_SESSION",
    "SENTINEL_PRIVATE_SESSION_ID",
    "/private/path",
    "Windows NT"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("live verification fails closed at the U.S. provider checkpoint and never copies raw failure details", async () => {
  const events = [];
  const clock = { value: 2000 };
  const shared = {
    clock,
    universeRevision: 0,
    lastCycleId: 200,
    commitIds: [],
    finalMembership: ["1001"]
  };
  const deps = createHappyDependencies(events, shared);

  const report = await runBoundedLiveVerification({
    candidateCommit: "def4567",
    providerOrigin: "https://provider.example",
    userAgent: "Chrome/154.0.0.0 raw-private-os-detail",
    now: () => clock.value,
    wait: async (delayMs) => {
      clock.value += delayMs;
    },
    collectCandidate: async () => {
      throw new Error("cookie=raw-secret; account=private-account; /private/raw-dump.json");
    },
    producerBridgeFactory: deps.producerBridgeFactory,
    viewerClientFactory: deps.viewerClientFactory
  });

  assert.equal(report.overall, "FAIL");
  assert.equal(report.verification, "market-flow-us-real-provider");
  assert.equal(report.failure.checkpoint, "provider.snapshot");
  assert.equal(report.failure.code, "LIVE_STEP_FAILED");
  assert.equal(
    report.failure.message,
    "ScreenerHulPaging3 snapshot acquisition or validation did not complete."
  );
  assert.equal(report.lastSuccessfulCheckpoint, "producer.start");
  assert.equal(report.progress.completedCycles, 0);
  assert.equal(report.transportCspLna, "PASS");
  assert.ok(events.includes("producer.stop:live_verification_complete"));
  assert.equal(events.includes("viewer.current"), false);

  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "raw-secret",
    "private-account",
    "/private/raw-dump.json",
    "raw-private-os-detail",
    "SENTINEL_PRIVATE_SESSION_ID"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
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

test("live verification rejects unsafe candidate identity and zero-cadence input without echoing private values", async () => {
  const unsafeCandidate = await runBoundedLiveVerification({
    candidateCommit: "private-account-id",
    providerOrigin: "https://provider.example"
  });
  assert.equal(unsafeCandidate.overall, "FAIL");
  assert.equal(unsafeCandidate.candidateCommit, "unknown");
  assert.equal(unsafeCandidate.failure.checkpoint, "harness.input");
  assert.equal(JSON.stringify(unsafeCandidate).includes("private-account-id"), false);

  const zeroCadence = await runBoundedLiveVerification({
    candidateCommit: "abc1234",
    providerOrigin: "https://provider.example",
    recorderConfig: { snapshotIntervalMs: 0 }
  });
  assert.equal(zeroCadence.overall, "FAIL");
  assert.equal(zeroCadence.failure.checkpoint, "harness.input");
});
