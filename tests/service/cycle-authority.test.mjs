import assert from "node:assert/strict";
import test from "node:test";
import { openMarketScopeDatabase } from "../../local-service/database/database.js";
import {
  createPersistenceFaultInjector,
  createServiceFixture
} from "./helpers/service-fixture.mjs";

function security(securityId, paperName) {
  return {
    securityId: String(securityId),
    paperName,
    mapHeatDateChange: null,
    rawMapHeat: {
      PaperId: Number(securityId),
      PaperName: paperName,
      DateChange: null
    }
  };
}

function universe(loadedAtMs = 1000) {
  return {
    loadedAtMs,
    recordCount: 2,
    securities: [
      security("1001", "Alpha"),
      security("1002", "Beta")
    ]
  };
}

function rawSecurity(id, overrides = {}) {
  return {
    Key: Number(id),
    LastKnownRate: id === "1001" ? 0 : 2222,
    BaseRateChangePercentage: id === "1001" ? 1.5 : null,
    BuyLimit1: id === "1001" ? null : 2210,
    BuyVolume1: id === "1001" ? 0 : 12,
    SellLimit1: id === "1001" ? 10 : 2230,
    SellVolume1: id === "1001" ? 4 : 7,
    DailyDealsQuantity: id === "1001" ? 5 : 6,
    LastDealVolume: id === "1001" ? 0 : 3,
    DailyTurnover: id === "1001" ? 100 : 200,
    DailyNISRevenue: id === "1001" ? 1000 : 2000,
    DailyLowestRate: id === "1001" ? 8 : 20,
    DailyHighestRate: id === "1001" ? 12 : 25,
    LastDealTimeOnly: id === "1001" ? "" : "10:00",
    UnknownField: id === "1001" ? 0 : null,
    ...overrides
  };
}

function completeCycle({
  startedAtMs = 2000,
  completedAtMs = 2100,
  firstRate,
  secondRate
} = {}) {
  const durationMs = completedAtMs - startedAtMs;
  const receivedAtMs = completedAtMs - 20;
  const chunkCompletedAtMs = completedAtMs - 10;

  return {
    status: "complete",
    startedAtMs,
    completedAtMs,
    durationMs,
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
      requestStartedAtMs: startedAtMs + 10,
      receivedAtMs,
      completedAtMs: chunkCompletedAtMs,
      durationMs: chunkCompletedAtMs - (startedAtMs + 10),
      serverAsOfDate: "",
      httpStatus: 200
    }],
    securities: [
      {
        securityId: "1001",
        chunkIndex: 0,
        chunkReceivedAtMs: receivedAtMs,
        collectedAtMs: chunkCompletedAtMs,
        serverAsOfDate: "",
        data: rawSecurity("1001", firstRate === undefined ? {} : { LastKnownRate: firstRate })
      },
      {
        securityId: "1002",
        chunkIndex: 0,
        chunkReceivedAtMs: receivedAtMs,
        collectedAtMs: chunkCompletedAtMs,
        serverAsOfDate: "",
        data: rawSecurity("1002", secondRate === undefined ? {} : { LastKnownRate: secondRate })
      }
    ]
  };
}

async function producerWithUniverse(fixture, clientId = "cycle-producer") {
  const producer = await fixture.connect("producer", clientId);
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
  assert.equal(replaced.payload.data.universeRevision, 1);

  return {
    producer,
    sessionId: started.payload.data.sessionId,
    universeRevision: replaced.payload.data.universeRevision
  };
}

async function authorityFingerprint(fixture, sessionId) {
  const [cycles, history, latest, session] = await Promise.all([
    fixture.rows(
      `SELECT cycle_id, status, session_id, universe_revision, started_at_ms,
              completed_at_ms, committed_at_ms, requested, received, unique_count,
              missing, duplicates, unexpected, failure_phase, error_json
       FROM cycles ORDER BY cycle_id`
    ),
    fixture.rows(
      `SELECT cycle_id, session_id, universe_revision, security_id, raw_data
       FROM history ORDER BY cycle_id, security_id`
    ),
    fixture.rows(
      `SELECT cycle_id, session_id, universe_revision, security_id, raw_data
       FROM latest ORDER BY security_id`
    ),
    fixture.rows(
      `SELECT completed_cycles, failed_cycles, last_completed_cycle_id,
              last_completed_at_ms, last_error_json
       FROM sessions WHERE session_id = $sessionId`,
      { sessionId }
    )
  ]);

  return { cycles, history, latest, session };
}

test("successful cycle commit atomically updates cycle/history/latest/session and preserves raw plus typed projection", async () => {
  const clock = { value: 9000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const { producer, sessionId, universeRevision } = await producerWithUniverse(fixture);

    const cycle1 = completeCycle();
    const committed1 = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: cycle1
    });

    assert.equal(committed1.type, "response.ok");
    assert.deepEqual(committed1.payload.data, {
      cycleId: 1,
      committedAtMs: 9000
    });

    let cycleRows = await fixture.rows(
      `SELECT cycle_id, session_id, universe_revision, status, started_at_ms,
              completed_at_ms, committed_at_ms, duration_ms, requested, received,
              unique_count, missing, duplicates, unexpected, chunk_count,
              chunks_json, failure_phase, error_json
       FROM cycles ORDER BY cycle_id`
    );

    assert.equal(cycleRows.length, 1);
    assert.deepEqual({
      cycleId: cycleRows[0].cycle_id,
      sessionId: cycleRows[0].session_id,
      revision: cycleRows[0].universe_revision,
      status: cycleRows[0].status,
      startedAt: cycleRows[0].started_at_ms,
      completedAt: cycleRows[0].completed_at_ms,
      committedAt: cycleRows[0].committed_at_ms,
      duration: cycleRows[0].duration_ms,
      requested: cycleRows[0].requested,
      received: cycleRows[0].received,
      unique: cycleRows[0].unique_count,
      missing: cycleRows[0].missing,
      duplicates: cycleRows[0].duplicates,
      unexpected: cycleRows[0].unexpected,
      chunkCount: cycleRows[0].chunk_count,
      failurePhase: cycleRows[0].failure_phase,
      error: cycleRows[0].error_json
    }, {
      cycleId: "1",
      sessionId,
      revision: "1",
      status: "complete",
      startedAt: "2000",
      completedAt: "2100",
      committedAt: "9000",
      duration: "100",
      requested: "2",
      received: "2",
      unique: "2",
      missing: "0",
      duplicates: "0",
      unexpected: "0",
      chunkCount: 1,
      failurePhase: null,
      error: null
    });
    assert.deepEqual(JSON.parse(cycleRows[0].chunks_json), cycle1.chunks);

    const history = await fixture.rows(
      `SELECT security_id, cycle_id, session_id, universe_revision, chunk_index,
              cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
              server_as_of_date_json, LastKnownRate, BaseRateChangePercentage,
              BuyLimit1, BuyVolume1, LastDealTimeOnly, raw_data
       FROM history ORDER BY security_id`
    );
    const latest = await fixture.rows(
      `SELECT security_id, cycle_id, LastKnownRate, BuyLimit1, BuyVolume1,
              LastDealTimeOnly, raw_data
       FROM latest ORDER BY security_id`
    );

    assert.equal(history.length, 2);
    assert.equal(latest.length, 2);
    assert.equal(history[0].security_id, "1001");
    assert.equal(history[0].cycle_id, "1");
    assert.equal(history[0].session_id, sessionId);
    assert.equal(history[0].universe_revision, "1");
    assert.equal(history[0].chunk_index, 0);
    assert.equal(history[0].cycle_started_at_ms, "2000");
    assert.equal(history[0].chunk_received_at_ms, "2080");
    assert.equal(history[0].collected_at_ms, "2090");
    assert.equal(JSON.parse(history[0].server_as_of_date_json), "");
    assert.equal(history[0].LastKnownRate, 0);
    assert.equal(history[0].BaseRateChangePercentage, 1.5);
    assert.equal(history[0].BuyLimit1, null);
    assert.equal(history[0].BuyVolume1, 0);
    assert.equal(history[0].LastDealTimeOnly, "");
    assert.deepEqual(JSON.parse(history[0].raw_data), cycle1.securities[0].data);
    assert.equal(JSON.parse(history[0].raw_data).UnknownField, 0);

    assert.equal(latest[0].LastKnownRate, 0);
    assert.equal(latest[0].BuyLimit1, null);
    assert.equal(latest[0].BuyVolume1, 0);
    assert.equal(latest[0].LastDealTimeOnly, "");
    assert.deepEqual(JSON.parse(latest[0].raw_data), cycle1.securities[0].data);

    let session = await fixture.rows(
      `SELECT completed_cycles, failed_cycles, last_completed_cycle_id,
              last_completed_at_ms, last_error_json
       FROM sessions WHERE session_id = $sessionId`,
      { sessionId }
    );
    assert.deepEqual(session, [{
      completed_cycles: "1",
      failed_cycles: "0",
      last_completed_cycle_id: "1",
      last_completed_at_ms: "2100",
      last_error_json: null
    }]);

    clock.value = 9500;
    const cycle2 = completeCycle({
      startedAtMs: 3000,
      completedAtMs: 3100,
      firstRate: 101,
      secondRate: 202
    });
    const committed2 = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: cycle2
    });

    assert.equal(committed2.type, "response.ok");
    assert.deepEqual(committed2.payload.data, {
      cycleId: 2,
      committedAtMs: 9500
    });

    const counts = await fixture.rows(
      `SELECT
         (SELECT COUNT(*) FROM cycles WHERE status = 'complete') AS complete_cycles,
         (SELECT COUNT(*) FROM history) AS history_count,
         (SELECT COUNT(*) FROM latest) AS latest_count`
    );
    assert.deepEqual(counts, [{
      complete_cycles: "2",
      history_count: "4",
      latest_count: "2"
    }]);

    const currentRates = await fixture.rows(
      "SELECT security_id, cycle_id, LastKnownRate FROM latest ORDER BY security_id"
    );
    assert.deepEqual(currentRates, [
      { security_id: "1001", cycle_id: "2", LastKnownRate: 101 },
      { security_id: "1002", cycle_id: "2", LastKnownRate: 202 }
    ]);

    await producer.close();
    await fixture.service.close();

    const reopened = await openMarketScopeDatabase({
      dbPath: fixture.dbPath,
      productVersion: "test-version",
      now: () => 10000
    });
    try {
      const reader = await reopened.viewerReadConnection.runAndReadAll(
        "SELECT COUNT(*) AS history_count FROM history"
      );
      assert.deepEqual(reader.getRowObjectsJson(), [{ history_count: "4" }]);
    } finally {
      await reopened.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a new producer session cannot commit against a durable universe revision it has not acknowledged", async () => {
  const fixture = await createServiceFixture();

  try {
    const first = await producerWithUniverse(fixture, "producer-ack-1");

    const stopped = await first.producer.request("producer.session.stop", {
      stoppedAtMs: 1500,
      reason: "handoff"
    });
    assert.equal(stopped.type, "response.ok");
    await first.producer.close();

    const second = await fixture.connect("producer", "producer-ack-2");
    const secondStart = await second.request("producer.session.start", {
      startedAtMs: 1600,
      config: {
        snapshotIntervalMs: 3000,
        chunkDelayMs: 1000,
        chunkSize: 187,
        refreshUniverseEveryCycle: false
      }
    });
    assert.equal(secondStart.type, "response.ok");

    const rejected = await second.request("producer.cycle.commit", {
      universeRevision: first.universeRevision,
      cycle: completeCycle()
    });
    assert.equal(rejected.type, "response.error");
    assert.equal(rejected.payload.code, "UNIVERSE_REVISION_MISMATCH");

    const counts = await fixture.rows(
      `SELECT
         (SELECT COUNT(*) FROM cycles) AS cycles_count,
         (SELECT COUNT(*) FROM history) AS history_count,
         (SELECT COUNT(*) FROM latest) AS latest_count`
    );
    assert.deepEqual(counts, [{
      cycles_count: "0",
      history_count: "0",
      latest_count: "0"
    }]);

    const acknowledged = await second.request("producer.universe.replace", universe(1700));
    assert.equal(acknowledged.type, "response.ok");
    assert.equal(acknowledged.payload.data.universeRevision, 2);

    const committed = await second.request("producer.cycle.commit", {
      universeRevision: 2,
      cycle: completeCycle()
    });
    assert.equal(committed.type, "response.ok");

    await second.close();
  } finally {
    await fixture.cleanup();
  }
});

test("cycle commit rejects universe revision, membership and raw identity mismatches without mutation", async () => {
  const fixture = await createServiceFixture();

  try {
    const { producer, sessionId, universeRevision } = await producerWithUniverse(fixture);
    const before = await authorityFingerprint(fixture, sessionId);

    const wrongRevision = await producer.request("producer.cycle.commit", {
      universeRevision: universeRevision + 1,
      cycle: completeCycle()
    });
    assert.equal(wrongRevision.type, "response.error");
    assert.equal(wrongRevision.payload.code, "UNIVERSE_REVISION_MISMATCH");

    const missingMember = completeCycle();
    missingMember.securities[1] = {
      ...missingMember.securities[1],
      securityId: "9999",
      data: rawSecurity("9999")
    };
    const wrongMembership = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: missingMember
    });
    assert.equal(wrongMembership.type, "response.error");
    assert.equal(wrongMembership.payload.code, "CYCLE_INVALID");

    const rawMismatch = completeCycle();
    rawMismatch.securities[0] = {
      ...rawMismatch.securities[0],
      data: rawSecurity("9999")
    };
    const wrongRawIdentity = await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: rawMismatch
    });
    assert.equal(wrongRawIdentity.type, "response.error");
    assert.equal(wrongRawIdentity.payload.code, "CYCLE_INVALID");

    assert.deepEqual(await authorityFingerprint(fixture, sessionId), before);

    await producer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("failed cycle persists sanitized diagnostics and session failure state without touching latest/history", async () => {
  const clock = { value: 8000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const { producer, sessionId, universeRevision } = await producerWithUniverse(fixture);

    assert.equal((await producer.request("producer.cycle.commit", {
      universeRevision,
      cycle: completeCycle()
    })).type, "response.ok");

    const beforeLatest = await fixture.rows(
      "SELECT * FROM latest ORDER BY security_id"
    );
    const beforeHistory = await fixture.rows(
      "SELECT * FROM history ORDER BY cycle_id, security_id"
    );

    clock.value = 8200;
    const failed = await producer.request("producer.cycle.failed", {
      report: {
        phase: "chunk-fetch",
        startedAtMs: 3000,
        failedAtMs: 3075,
        requested: 2,
        received: null,
        unique: null,
        missing: null,
        duplicates: null,
        unexpected: null,
        error: {
          name: "Error",
          message: "synthetic provider failure",
          stack: "must not persist"
        }
      }
    });

    assert.equal(failed.type, "response.ok");
    assert.deepEqual(failed.payload.data, { cycleId: 2 });

    const failedRows = await fixture.rows(
      `SELECT cycle_id, session_id, universe_revision, status, started_at_ms,
              completed_at_ms, committed_at_ms, duration_ms, requested, received,
              unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
              failure_phase, error_json
       FROM cycles WHERE cycle_id = 2`
    );
    assert.equal(failedRows.length, 1);
    assert.equal(failedRows[0].status, "failed");
    assert.equal(failedRows[0].session_id, sessionId);
    assert.equal(failedRows[0].universe_revision, null);
    assert.equal(failedRows[0].started_at_ms, "3000");
    assert.equal(failedRows[0].completed_at_ms, "3075");
    assert.equal(failedRows[0].committed_at_ms, "8200");
    assert.equal(failedRows[0].duration_ms, "75");
    assert.equal(failedRows[0].requested, "2");
    assert.equal(failedRows[0].received, null);
    assert.equal(failedRows[0].chunk_count, null);
    assert.equal(failedRows[0].chunks_json, null);
    assert.equal(failedRows[0].failure_phase, "chunk-fetch");
    assert.deepEqual(JSON.parse(failedRows[0].error_json), {
      name: "Error",
      message: "synthetic provider failure"
    });

    assert.deepEqual(
      await fixture.rows("SELECT * FROM latest ORDER BY security_id"),
      beforeLatest
    );
    assert.deepEqual(
      await fixture.rows("SELECT * FROM history ORDER BY cycle_id, security_id"),
      beforeHistory
    );

    const session = await fixture.rows(
      `SELECT completed_cycles, failed_cycles, last_completed_cycle_id,
              last_completed_at_ms, last_error_json
       FROM sessions WHERE session_id = $sessionId`,
      { sessionId }
    );
    assert.equal(session[0].completed_cycles, "1");
    assert.equal(session[0].failed_cycles, "1");
    assert.equal(session[0].last_completed_cycle_id, "1");
    assert.equal(session[0].last_completed_at_ms, "2100");
    assert.deepEqual(JSON.parse(session[0].last_error_json), {
      name: "Error",
      message: "synthetic provider failure"
    });

    await producer.close();
  } finally {
    await fixture.cleanup();
  }
});

for (const faultPoint of ["F1", "F2", "F3", "F4", "F5"]) {
  test(`successful-cycle fault ${faultPoint} rolls back all authority and sends no success ACK`, async () => {
    const fault = createPersistenceFaultInjector();
    const fixture = await createServiceFixture({ persistenceFault: fault });

    try {
      const { producer, sessionId, universeRevision } = await producerWithUniverse(
        fixture,
        `producer-${faultPoint}`
      );

      const baseline = await producer.request("producer.cycle.commit", {
        universeRevision,
        cycle: completeCycle()
      });
      assert.equal(baseline.type, "response.ok");

      const before = await authorityFingerprint(fixture, sessionId);

      fault.enable(faultPoint);
      const failed = await producer.request("producer.cycle.commit", {
        universeRevision,
        cycle: completeCycle({
          startedAtMs: 3000,
          completedAtMs: 3100,
          firstRate: 333,
          secondRate: 444
        })
      });

      assert.equal(failed.type, "response.error");
      assert.equal(failed.payload.code, "DB_ERROR");
      assert.equal(Object.hasOwn(failed.payload, "data"), false);
      assert.deepEqual(await authorityFingerprint(fixture, sessionId), before);

      await producer.close();
    } finally {
      await fixture.cleanup();
    }
  });
}
