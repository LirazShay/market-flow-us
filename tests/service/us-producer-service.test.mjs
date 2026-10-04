import assert from "node:assert/strict";
import test from "node:test";
import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

function rawSecurity(paperId, symbol, price) {
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `${symbol} Incorporated`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-04T19:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1.25,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 1000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 1000000,
    PaperIdYatab: 500 + paperId,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate({
  startedAtMs,
  completedAtMs,
  rows
}) {
  const records = rows.map(([paperId, symbol, price]) => rawSecurity(paperId, symbol, price));
  const responseIds = records.map((row) => String(row.PaperId));
  return buildUsCollectionCandidate({
    recordCount: records.length,
    records,
    responseIds,
    membership: [...responseIds].sort(),
    timing: {
      startedAtMs,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: completedAtMs - startedAtMs
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: "synthetic-test"
    },
    httpStatus: 200
  });
}

function wireUniverse(universe) {
  return {
    loadedAtMs: universe.loadedAtMs,
    recordCount: universe.recordCount,
    securities: universe.securities
  };
}

async function databaseRows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function serviceConfig(dbPath, origin) {
  return {
    host: "127.0.0.1",
    port: 0,
    dbPath,
    maxInboundMessageBytes: 16 * 1024 * 1024,
    producerHeartbeatMs: 5000,
    producerStaleAfterMs: 15000,
    historyPageSize: 500,
    allowedOrigins: [origin]
  };
}

test("real service accepts U.S. session/universe/cycles/failure/heartbeat with durable revision semantics", async () => {
  const clock = { value: 10000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase
  });

  try {
    const producer = await fixture.connect("producer", "us-producer");
    const started = await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");
    const sessionId = started.payload.data.sessionId;

    const sessionConfig = await fixture.rows(
      "SELECT config_json FROM sessions WHERE session_id = $sessionId",
      { sessionId }
    );
    assert.deepEqual(JSON.parse(sessionConfig[0].config_json), {
      snapshotIntervalMs: 3000
    });

    const first = candidate({
      startedAtMs: 2000,
      completedAtMs: 2100,
      rows: [
        [101, "AAA", 10],
        [202, "BBB", 20]
      ]
    });
    const firstUniverse = await producer.request(
      "producer.universe.replace",
      wireUniverse(first.universe)
    );
    assert.equal(firstUniverse.type, "response.ok");
    assert.deepEqual(firstUniverse.payload.data, {
      universeRevision: 1,
      recordCount: 2
    });

    const firstCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: first.cycle
    });
    assert.equal(firstCommit.type, "response.ok");
    assert.deepEqual(firstCommit.payload.data, {
      cycleId: 1,
      committedAtMs: 10000
    });

    const currentUniverse = await fixture.rows(
      `SELECT security_id, universe_revision, Symbol, PaperNameEng, ExchangeName, raw_source
       FROM universe WHERE is_current = true ORDER BY security_id`
    );
    assert.deepEqual(currentUniverse.map((row) => ({
      securityId: row.security_id,
      revision: row.universe_revision,
      symbol: row.Symbol,
      name: row.PaperNameEng,
      exchange: row.ExchangeName,
      rawPaperId: JSON.parse(row.raw_source).PaperId
    })), [
      {
        securityId: "101",
        revision: "1",
        symbol: "AAA",
        name: "AAA Incorporated",
        exchange: "NASDAQ",
        rawPaperId: 101
      },
      {
        securityId: "202",
        revision: "1",
        symbol: "BBB",
        name: "BBB Incorporated",
        exchange: "NASDAQ",
        rawPaperId: 202
      }
    ]);

    clock.value = 10100;
    const sameMembership = candidate({
      startedAtMs: 3000,
      completedAtMs: 3100,
      rows: [
        [202, "BBB", 21],
        [101, "AAA", 11]
      ]
    });
    const secondCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: sameMembership.cycle
    });
    assert.equal(secondCommit.type, "response.ok");
    assert.equal(secondCommit.payload.data.cycleId, 2);

    clock.value = 10200;
    const changedMembership = candidate({
      startedAtMs: 4000,
      completedAtMs: 4100,
      rows: [
        [101, "AAA", 12],
        [303, "CCC", 30]
      ]
    });
    const changedUniverse = await producer.request(
      "producer.universe.replace",
      wireUniverse(changedMembership.universe)
    );
    assert.equal(changedUniverse.type, "response.ok");
    assert.deepEqual(changedUniverse.payload.data, {
      universeRevision: 2,
      recordCount: 2
    });

    const changedCommit = await producer.request("producer.cycle.commit", {
      universeRevision: 2,
      cycle: changedMembership.cycle
    });
    assert.equal(changedCommit.type, "response.ok");
    assert.equal(changedCommit.payload.data.cycleId, 3);

    const authorityCounts = await fixture.rows(`
      SELECT
        (SELECT COUNT(*) FROM history) AS history_count,
        (SELECT COUNT(*) FROM latest) AS latest_count,
        (SELECT COUNT(*) FROM universe WHERE is_current = true) AS universe_count
    `);
    assert.deepEqual(authorityCounts, [{
      history_count: "6",
      latest_count: "2",
      universe_count: "2"
    }]);

    const latest = await fixture.rows(
      "SELECT security_id, Price, universe_revision FROM latest ORDER BY security_id"
    );
    assert.deepEqual(latest, [
      { security_id: "101", Price: 12, universe_revision: "2" },
      { security_id: "303", Price: 30, universe_revision: "2" }
    ]);

    clock.value = 10300;
    const failed = await producer.request("producer.cycle.failed", {
      report: {
        phase: "provider-fetch",
        startedAtMs: 5000,
        failedAtMs: 5050,
        requested: 2,
        received: null,
        unique: null,
        missing: null,
        duplicates: null,
        unexpected: null,
        error: {
          name: "ProviderFetchError",
          message: "synthetic provider failure"
        }
      }
    });
    assert.equal(failed.type, "response.ok");
    assert.equal(failed.payload.data.cycleId, 4);

    const latestAfterFailure = await fixture.rows(
      "SELECT security_id, Price, cycle_id FROM latest ORDER BY security_id"
    );
    assert.deepEqual(latestAfterFailure, [
      { security_id: "101", Price: 12, cycle_id: "3" },
      { security_id: "303", Price: 30, cycle_id: "3" }
    ]);

    clock.value = 10400;
    const heartbeat = await producer.request("producer.heartbeat", { atMs: 10400 });
    assert.equal(heartbeat.type, "response.ok");
    assert.deepEqual(heartbeat.payload.data, { acceptedAtMs: 10400 });

    const session = await fixture.rows(
      `SELECT completed_cycles, failed_cycles, last_completed_cycle_id,
              last_completed_at_ms, last_heartbeat_at_ms, last_error_json
       FROM sessions WHERE session_id = $sessionId`,
      { sessionId }
    );
    assert.equal(session[0].completed_cycles, "3");
    assert.equal(session[0].failed_cycles, "1");
    assert.equal(session[0].last_completed_cycle_id, "3");
    assert.equal(session[0].last_completed_at_ms, "4100");
    assert.equal(session[0].last_heartbeat_at_ms, "10400");
    assert.deepEqual(JSON.parse(session[0].last_error_json), {
      name: "ProviderFetchError",
      message: "synthetic provider failure"
    });
  } finally {
    await fixture.cleanup();
  }
});

test("real service startup recovers a stale U.S. producer session and preserves schema-v3 authority", async () => {
  const clock = { value: 20000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase
  });
  let restarted = null;

  try {
    const producer = await fixture.connect("producer", "restart-producer");
    const started = await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(started.type, "response.ok");

    const first = candidate({
      startedAtMs: 2000,
      completedAtMs: 2100,
      rows: [[101, "AAA", 10]]
    });
    const universe = await producer.request(
      "producer.universe.replace",
      wireUniverse(first.universe)
    );
    assert.equal(universe.type, "response.ok");
    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: universe.payload.data.universeRevision,
      cycle: first.cycle
    });
    assert.equal(committed.type, "response.ok");

    await producer.close();
    await fixture.service.close();

    const seed = await openMarketFlowUsDatabase({
      dbPath: fixture.dbPath,
      productVersion: "test-version",
      now: () => 20500
    });
    try {
      await seed.writerConnection.run(`
        INSERT INTO sessions (
          session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
          stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
          last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
        ) VALUES (
          'stale-after-crash', 'crashed-producer', 'running', 15000, NULL, NULL,
          15100, 0, 0, NULL, NULL, '{"snapshotIntervalMs":3000}', NULL
        )
      `);
    } finally {
      await seed.close();
    }

    clock.value = 21000;
    restarted = await startMarketScopeService({
      config: serviceConfig(fixture.dbPath, fixture.origin),
      serviceVersion: "test-version",
      now: () => clock.value,
      openDatabase: openMarketFlowUsDatabase
    });

    assert.equal(restarted.database.schemaVersion, 3);
    const recovered = await databaseRows(
      restarted.database.viewerReadConnection,
      `SELECT status, stopped_at_ms, stop_reason
       FROM sessions WHERE session_id = 'stale-after-crash'`
    );
    assert.deepEqual(recovered, [{
      status: "interrupted",
      stopped_at_ms: "21000",
      stop_reason: "service_restart"
    }]);

    const authority = await databaseRows(
      restarted.database.viewerReadConnection,
      `SELECT
        (SELECT COUNT(*) FROM history) AS history_count,
        (SELECT COUNT(*) FROM latest) AS latest_count`
    );
    assert.deepEqual(authority, [{
      history_count: "1",
      latest_count: "1"
    }]);
  } finally {
    await restarted?.close();
    await fixture.cleanup();
  }
});
