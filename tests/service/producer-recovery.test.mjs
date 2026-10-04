import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { startMarketScopeService } from "../../local-service/server/service.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

async function eventually(check, {
  timeoutMs = 1000,
  intervalMs = 10,
  message = "condition was not satisfied"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) throw lastError;
  throw new Error(message);
}

async function startSession(producer, startedAtMs = 1000) {
  const response = await producer.request("producer.session.start", {
    startedAtMs,
    config: {
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false
    }
  });
  assert.equal(response.type, "response.ok");
  return response.payload.data.sessionId;
}

test("producer socket loss interrupts the running session and releases ownership", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const first = await fixture.connect("producer", "producer-loss-1");
    const firstSessionId = await startSession(first);

    clock.value = 6100;
    const heartbeat = await first.request("producer.heartbeat", { atMs: 6000 });
    assert.equal(heartbeat.type, "response.ok");
    assert.deepEqual(heartbeat.payload.data, { acceptedAtMs: 6100 });

    let rows = await fixture.rows(
      "SELECT status, last_heartbeat_at_ms FROM sessions WHERE session_id = $sessionId",
      { sessionId: firstSessionId }
    );
    assert.deepEqual(rows, [{
      status: "running",
      last_heartbeat_at_ms: "6100"
    }]);

    clock.value = 7000;
    await first.close();

    await eventually(async () => {
      rows = await fixture.rows(
        "SELECT status, stopped_at_ms, stop_reason FROM sessions WHERE session_id = $sessionId",
        { sessionId: firstSessionId }
      );
      return rows[0]?.status === "interrupted";
    }, {
      message: "socket loss did not interrupt the producer session"
    });

    assert.deepEqual(rows, [{
      status: "interrupted",
      stopped_at_ms: "7000",
      stop_reason: "connection_lost"
    }]);

    const second = await fixture.connect("producer", "producer-loss-2");
    const secondSessionId = await startSession(second, 7100);
    assert.notEqual(secondSessionId, firstSessionId);
    await second.close();
  } finally {
    await fixture.cleanup();
  }
});

test("stale heartbeat interrupts the session, closes the socket, and frees producer ownership", async () => {
  const clock = { value: 8000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    config: {
      producerStaleAfterMs: 40
    }
  });

  try {
    const first = await fixture.connect("producer", "producer-stale-1");
    const firstSessionId = await startSession(first);

    clock.value = 8050;
    const heartbeat = await first.request("producer.heartbeat", { atMs: 8040 });
    assert.equal(heartbeat.type, "response.ok");
    assert.deepEqual(heartbeat.payload.data, { acceptedAtMs: 8050 });

    const closeResult = await Promise.race([
      once(first.socket, "close").then(() => "closed"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 500))
    ]);
    assert.equal(closeResult, "closed", "stale producer socket should be closed by the service");

    let rows;
    await eventually(async () => {
      rows = await fixture.rows(
        "SELECT status, stopped_at_ms, stop_reason FROM sessions WHERE session_id = $sessionId",
        { sessionId: firstSessionId }
      );
      return rows[0]?.status === "interrupted";
    }, {
      message: "heartbeat stale timeout did not interrupt the producer session"
    });

    assert.deepEqual(rows, [{
      status: "interrupted",
      stopped_at_ms: "8050",
      stop_reason: "heartbeat_stale"
    }]);

    const second = await fixture.connect("producer", "producer-stale-2");
    assert.equal(second.hello.type, "response.ok");
    assert.equal((await startSession(second, 9000)).length > 0, true);
    await second.close();
  } finally {
    await fixture.cleanup();
  }
});


function oneSecurityUniverse() {
  return {
    loadedAtMs: 1000,
    recordCount: 1,
    securities: [{
      securityId: "1001",
      paperName: "Fixture Alpha",
      mapHeatDateChange: 1,
      rawMapHeat: {
        PaperId: 1001,
        PaperName: "Fixture Alpha",
        DateChange: 1
      }
    }]
  };
}

function oneSecurityCycle() {
  return {
    status: "complete",
    startedAtMs: 2000,
    completedAtMs: 2050,
    durationMs: 50,
    requested: 1,
    received: 1,
    unique: 1,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: 1,
      received: 1,
      unique: 1,
      requestStartedAtMs: 2000,
      receivedAtMs: 2040,
      completedAtMs: 2050,
      durationMs: 50,
      serverAsOfDate: "fixture",
      httpStatus: 200
    }],
    securities: [{
      securityId: "1001",
      chunkIndex: 0,
      chunkReceivedAtMs: 2040,
      collectedAtMs: 2050,
      serverAsOfDate: "fixture",
      data: {
        Key: 1001,
        LastKnownRate: 101
      }
    }]
  };
}

async function connectionRows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

test("service shutdown interrupts the producer and restart preserves committed authority with no RUNNING session", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });
  let restarted = null;

  try {
    const producer = await fixture.connect("producer", "producer-restart");
    const sessionId = await startSession(producer);

    const acceptedUniverse = await producer.request(
      "producer.universe.replace",
      oneSecurityUniverse()
    );
    assert.equal(acceptedUniverse.type, "response.ok");
    assert.equal(acceptedUniverse.payload.data.universeRevision, 1);

    const committed = await producer.request("producer.cycle.commit", {
      universeRevision: 1,
      cycle: oneSecurityCycle()
    });
    assert.equal(committed.type, "response.ok");
    assert.equal(committed.payload.data.cycleId, 1);

    clock.value = 7000;
    await fixture.service.close();

    restarted = await startMarketScopeService({
      config: {
        host: "127.0.0.1",
        port: 0,
        dbPath: fixture.dbPath,
        maxInboundMessageBytes: 16 * 1024 * 1024,
        producerHeartbeatMs: 5000,
        producerStaleAfterMs: 15000,
        historyPageSize: 500,
        allowedOrigins: [fixture.origin]
      },
      serviceVersion: "restart-test",
      now: () => 8000
    });

    const counts = await connectionRows(
      restarted.database.viewerReadConnection,
      `SELECT
         (SELECT COUNT(*) FROM cycles WHERE status = 'complete') AS complete_cycles,
         (SELECT COUNT(*) FROM history) AS history_count,
         (SELECT COUNT(*) FROM latest) AS latest_count,
         (SELECT COUNT(*) FROM sessions WHERE status = 'running') AS running_sessions`
    );
    assert.deepEqual(counts, [{
      complete_cycles: "1",
      history_count: "1",
      latest_count: "1",
      running_sessions: "0"
    }]);

    const sessions = await connectionRows(
      restarted.database.viewerReadConnection,
      `SELECT status, stopped_at_ms, stop_reason
       FROM sessions WHERE session_id = '${sessionId}'`
    );
    assert.deepEqual(sessions, [{
      status: "interrupted",
      stopped_at_ms: "7000",
      stop_reason: "service_shutdown"
    }]);
  } finally {
    await restarted?.close();
    await fixture.cleanup();
  }
});
