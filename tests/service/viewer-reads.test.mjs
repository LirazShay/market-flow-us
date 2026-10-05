import assert from "node:assert/strict";
import test from "node:test";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function security(securityId, paperName) {
  return {
    securityId,
    paperName,
    mapHeatDateChange: null,
    rawMapHeat: {
      PaperId: Number(securityId),
      PaperName: paperName,
      DateChange: null
    }
  };
}

function universe() {
  return {
    loadedAtMs: 1000,
    recordCount: 2,
    securities: [
      security("1001", "Alpha"),
      security("1002", "Beta")
    ]
  };
}

function rawSecurity(securityId) {
  const alpha = securityId === "1001";
  return {
    Key: Number(securityId),
    LastKnownRate: alpha ? 0 : 2222,
    BaseRateChangePercentage: alpha ? 1.5 : null,
    BuyLimit1: alpha ? null : 2210,
    BuyVolume1: alpha ? 0 : 12,
    SellLimit1: alpha ? 10 : 2230,
    SellVolume1: alpha ? 4 : 7,
    DailyDealsQuantity: alpha ? 5 : 6,
    LastDealVolume: alpha ? 0 : 3,
    DailyTurnover: alpha ? 100 : 200,
    DailyNISRevenue: alpha ? 1000 : 2000,
    DailyLowestRate: alpha ? 8 : 20,
    DailyHighestRate: alpha ? 12 : 25,
    LastDealTimeOnly: alpha ? "" : "10:00"
  };
}

function completeCycle() {
  return {
    status: "complete",
    startedAtMs: 2000,
    completedAtMs: 2100,
    durationMs: 100,
    requested: 2,
    received: 2,
    unique: 2,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: 2,
      received: 2,
      unique: 2,
      requestStartedAtMs: 2010,
      receivedAtMs: 2080,
      completedAtMs: 2090,
      durationMs: 80,
      serverAsOfDate: "",
      httpStatus: 200
    }],
    securities: ["1001", "1002"].map((securityId) => ({
      securityId,
      chunkIndex: 0,
      chunkReceivedAtMs: 2080,
      collectedAtMs: 2090,
      serverAsOfDate: "",
      data: rawSecurity(securityId)
    }))
  };
}

async function startAuthority(fixture) {
  const producer = await fixture.connect("producer", "viewer-read-producer");
  const started = await producer.request("producer.session.start", {
    startedAtMs: 500,
    config: {
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false
    }
  });
  assert.equal(started.type, "response.ok");

  const replaced = await producer.request("producer.universe.replace", universe());
  assert.equal(replaced.type, "response.ok");

  return {
    producer,
    universeRevision: replaced.payload.data.universeRevision
  };
}

test("viewer current and status read committed authority, preserve zero/null, and never drop latest rows without metadata", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const viewer = await fixture.connect("viewer", "trusted-reader");

    const emptyCurrent = await viewer.request("viewer.current.get");
    assert.equal(emptyCurrent.type, "response.ok");
    assert.deepEqual(emptyCurrent.payload.data, {
      rows: [],
      summary: {
        rowCount: 0,
        lastCycleId: null,
        lastCollectedAtMs: null
      }
    });

    const emptyStatus = await viewer.request("viewer.status.get");
    assert.equal(emptyStatus.type, "response.ok");
    assert.deepEqual(emptyStatus.payload.data, {
      serviceReady: true,
      recorderHealth: "UNKNOWN",
      lastCompletedAtMs: null,
      lastCompletedCycleId: null,
      lastCycleDurationMs: null,
      latestCount: 0,
      completedCycles: 0,
      failedCycles: 0,
      historyCount: 0,
      lastError: null
    });

    const { producer, universeRevision } = await startAuthority(fixture);
    const committed = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: completeCycle()
    });
    assert.equal(committed.type, "response.ok");

    const current = await viewer.request("viewer.current.get");
    assert.equal(current.type, "response.ok");
    assert.deepEqual(current.payload.data.summary, {
      rowCount: 2,
      lastCycleId: 1,
      lastCollectedAtMs: 2090
    });
    assert.deepEqual(current.payload.data.rows, [
      {
        paperName: "Alpha",
        securityId: "1001",
        LastKnownRate: 0,
        BaseRateChangePercentage: 1.5,
        BuyLimit1: null,
        BuyVolume1: 0,
        SellLimit1: 10,
        SellVolume1: 4,
        DailyDealsQuantity: 5,
        LastDealVolume: 0,
        DailyTurnover: 100,
        DailyNISRevenue: 1000,
        DailyLowestRate: 8,
        DailyHighestRate: 12,
        LastDealTimeOnly: "",
        collectedAtMs: 2090
      },
      {
        paperName: "Beta",
        securityId: "1002",
        LastKnownRate: 2222,
        BaseRateChangePercentage: null,
        BuyLimit1: 2210,
        BuyVolume1: 12,
        SellLimit1: 2230,
        SellVolume1: 7,
        DailyDealsQuantity: 6,
        LastDealVolume: 3,
        DailyTurnover: 200,
        DailyNISRevenue: 2000,
        DailyLowestRate: 20,
        DailyHighestRate: 25,
        LastDealTimeOnly: "10:00",
        collectedAtMs: 2090
      }
    ]);

    const status = await viewer.request("viewer.status.get");
    assert.equal(status.type, "response.ok");
    assert.deepEqual(status.payload.data, {
      serviceReady: true,
      recorderHealth: "RUNNING",
      lastCompletedAtMs: 2100,
      lastCompletedCycleId: 1,
      lastCycleDurationMs: 100,
      latestCount: 2,
      completedCycles: 1,
      failedCycles: 0,
      historyCount: 2,
      lastError: null
    });

    await fixture.service.database.writerConnection.run(
      "DELETE FROM universe WHERE security_id = '1002'"
    );

    const missingMetadata = await viewer.request("viewer.current.get");
    assert.equal(missingMetadata.type, "response.ok");
    assert.equal(missingMetadata.payload.data.rows.length, 2);
    assert.equal(missingMetadata.payload.data.rows[1].securityId, "1002");
    assert.equal(missingMetadata.payload.data.rows[1].paperName, null);

    await producer.close();
    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("viewer status applies UNKNOWN/RUNNING/STALE/STOPPED/ERROR precedence and keeps aggregate counts authoritative", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const viewer = await fixture.connect("viewer", "status-reader");
    const { producer } = await startAuthority(fixture);

    let status = await viewer.request("viewer.status.get");
    assert.equal(status.payload.data.recorderHealth, "RUNNING");
    assert.equal(status.payload.data.completedCycles, 0);
    assert.equal(status.payload.data.failedCycles, 0);
    assert.equal(status.payload.data.historyCount, 0);
    assert.equal(status.payload.data.lastCompletedCycleId, null);

    const failed = await producer.request("producer.cycle.failed", {
      report: {
        phase: "chunk-fetch",
        startedAtMs: 2200,
        failedAtMs: 2250,
        requested: 2,
        received: 1,
        unique: 1,
        missing: 1,
        duplicates: 0,
        unexpected: 0,
        error: {
          name: "ProviderError",
          message: "sanitized provider failure"
        }
      }
    });
    assert.equal(failed.type, "response.ok");

    status = await viewer.request("viewer.status.get");
    assert.equal(status.payload.data.recorderHealth, "ERROR");
    assert.equal(status.payload.data.completedCycles, 0);
    assert.equal(status.payload.data.failedCycles, 1);
    assert.equal(status.payload.data.historyCount, 0);
    assert.deepEqual(status.payload.data.lastError, {
      name: "CollectionError",
      message: "A sanitized collection error was recorded."
    });

    clock.value = 20000;
    status = await viewer.request("viewer.status.get");
    assert.equal(status.payload.data.recorderHealth, "STALE");

    const stopped = await producer.request("producer.session.stop", {
      stoppedAtMs: 19900,
      reason: "manual"
    });
    assert.equal(stopped.type, "response.ok");

    status = await viewer.request("viewer.status.get");
    assert.equal(status.payload.data.recorderHealth, "STOPPED");

    await producer.close();
    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});


test("viewer security lookup distinguishes current, historical-only, known-without-history and unknown identities", async () => {
  const fixture = await createServiceFixture();

  try {
    const { producer, universeRevision } = await startAuthority(fixture);
    const committed = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: completeCycle()
    });
    assert.equal(committed.type, "response.ok");

    await fixture.service.database.writerConnection.run(
      `INSERT INTO universe (
         security_id, is_current, universe_revision, first_seen_at_ms,
         last_seen_at_ms, paper_name, raw_map_heat
       ) VALUES
         ('9001', false, 1, 1, 1, 'Legacy', '{"PaperId":9001,"PaperName":"Legacy"}'),
         ('9002', false, 1, 1, 1, 'Catalog only', '{"PaperId":9002,"PaperName":"Catalog only"}')`
    );

    await fixture.service.database.writerConnection.run(
      `INSERT INTO history (
         cycle_id, session_id, universe_revision, security_id, chunk_index,
         cycle_started_at_ms, chunk_received_at_ms, collected_at_ms, raw_data
       ) VALUES (
         9001, 'synthetic-session', 1, '9001', 0,
         8000, 8090, 8100, '{}'
       )`
    );

    const viewer = await fixture.connect("viewer", "security-lookup-reader");

    const current = await viewer.request("viewer.security.get", { securityId: "1001" });
    assert.equal(current.type, "response.ok");
    assert.equal(current.payload.data.found, true);
    assert.equal(current.payload.data.securityId, "1001");
    assert.equal(current.payload.data.paperName, "Alpha");
    assert.equal(current.payload.data.isCurrent, true);
    assert.equal(current.payload.data.currentRow.securityId, "1001");
    assert.equal(current.payload.data.currentRow.LastKnownRate, 0);

    const historicalOnly = await viewer.request("viewer.security.get", { securityId: "9001" });
    assert.deepEqual(historicalOnly.payload.data, {
      found: true,
      securityId: "9001",
      paperName: "Legacy",
      isCurrent: false,
      currentRow: null
    });

    const catalogOnly = await viewer.request("viewer.security.get", { securityId: "9002" });
    assert.deepEqual(catalogOnly.payload.data, {
      found: true,
      securityId: "9002",
      paperName: "Catalog only",
      isCurrent: false,
      currentRow: null
    });

    const unknown = await viewer.request("viewer.security.get", { securityId: "9999" });
    assert.deepEqual(unknown.payload.data, {
      found: false,
      securityId: "9999",
      paperName: null,
      isCurrent: false,
      currentRow: null
    });

    await producer.close();
    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("viewer history pages 500 rows with equal-timestamp keyset continuation and rejects invalid or wrong-security cursors", async () => {
  const fixture = await createServiceFixture();

  try {
    await fixture.service.database.writerConnection.run(
      `INSERT INTO universe (
         security_id, is_current, universe_revision, first_seen_at_ms,
         last_seen_at_ms, paper_name, raw_map_heat
       ) VALUES ('9001', false, 1, 1, 1, 'Legacy', '{"PaperId":9001,"PaperName":"Legacy"}')`
    );

    await fixture.service.database.writerConnection.run(
      `INSERT INTO history (
         cycle_id, session_id, universe_revision, security_id, chunk_index,
         cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
         LastKnownRate, LastDealTimeOnly, raw_data
       )
       SELECT
         10000 + n,
         'synthetic-session',
         1,
         '9001',
         0,
         9000,
         9990,
         10000,
         n,
         CAST(n AS VARCHAR),
         '{}'
       FROM range(502) AS rows(n)`
    );

    const viewer = await fixture.connect("viewer", "history-reader");

    const first = await viewer.request("viewer.history.page", {
      securityId: "9001",
      cursor: null
    });
    assert.equal(first.type, "response.ok");
    assert.equal(first.payload.data.rows.length, 500);
    assert.equal(first.payload.data.hasMore, true);
    assert.equal(typeof first.payload.data.nextCursor, "string");
    assert.ok(first.payload.data.nextCursor.length > 0);
    assert.equal(first.payload.data.rows[0].cycleId, 10501);
    assert.equal(first.payload.data.rows[499].cycleId, 10002);
    assert.equal(first.payload.data.rows[0].collectedAtMs, 10000);
    assert.equal(first.payload.data.rows[499].collectedAtMs, 10000);

    const second = await viewer.request("viewer.history.page", {
      securityId: "9001",
      cursor: first.payload.data.nextCursor
    });
    assert.equal(second.type, "response.ok");
    assert.deepEqual(second.payload.data.rows.map((row) => row.cycleId), [10001, 10000]);
    assert.equal(second.payload.data.hasMore, false);
    assert.equal(second.payload.data.nextCursor, null);

    const allIds = [
      ...first.payload.data.rows.map((row) => row.cycleId),
      ...second.payload.data.rows.map((row) => row.cycleId)
    ];
    assert.equal(allIds.length, 502);
    assert.equal(new Set(allIds).size, 502);

    const empty = await viewer.request("viewer.history.page", {
      securityId: "9002",
      cursor: null
    });
    assert.deepEqual(empty.payload.data, {
      rows: [],
      hasMore: false,
      nextCursor: null
    });

    const invalid = await viewer.request("viewer.history.page", {
      securityId: "9001",
      cursor: "not-a-valid-cursor"
    });
    assert.equal(invalid.type, "response.error");
    assert.equal(invalid.payload.code, "CURSOR_INVALID");

    const wrongSecurity = await viewer.request("viewer.history.page", {
      securityId: "9002",
      cursor: first.payload.data.nextCursor
    });
    assert.equal(wrongSecurity.type, "response.error");
    assert.equal(wrongSecurity.payload.code, "CURSOR_INVALID");

    await viewer.close();
  } finally {
    await fixture.cleanup();
  }
});
