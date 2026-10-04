import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistenceFaultInjector,
  createServiceFixture
} from "./helpers/service-fixture.mjs";

function universe(loadedAtMs, securities) {
  return {
    loadedAtMs,
    recordCount: securities.length,
    securities
  };
}

function security(securityId, {
  paperName = `Paper ${securityId}`,
  dateChange = null,
  extra = {}
} = {}) {
  const numericId = Number(securityId);
  const rawMapHeat = {
    PaperId: Number.isNaN(numericId) ? securityId : numericId,
    PaperName: paperName,
    DateChange: dateChange,
    ...extra
  };

  return {
    securityId: String(securityId),
    paperName,
    mapHeatDateChange: dateChange,
    rawMapHeat
  };
}

async function startProducer(fixture, id = "producer-authority") {
  const producer = await fixture.connect("producer", id);
  assert.equal(producer.hello.type, "response.ok");
  return producer;
}

async function startSession(producer, {
  startedAtMs = 1000,
  config = {
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false
  }
} = {}) {
  return await producer.request("producer.session.start", {
    startedAtMs,
    config
  });
}

test("producer session lifecycle persists only sanitized collector config and releases producer after stop ACK", async () => {
  const clock = { value: 5000 };
  const fixture = await createServiceFixture({ now: () => clock.value });

  try {
    const producer = await startProducer(fixture, "producer-session-1");

    const beforeStart = await producer.request("producer.heartbeat", { atMs: 900 });
    assert.equal(beforeStart.type, "response.error");
    assert.equal(beforeStart.payload.code, "SESSION_NOT_STARTED");

    const started = await startSession(producer, {
      startedAtMs: 1000,
      config: {
        snapshotIntervalMs: 3000,
        chunkDelayMs: 1000,
        chunkSize: 187,
        refreshUniverseEveryCycle: false,
        authToken: "must-not-persist",
        cookie: "must-not-persist"
      }
    });

    assert.equal(started.type, "response.ok");
    assert.equal(started.payload.requestType, "producer.session.start");
    assert.equal(typeof started.payload.data.sessionId, "string");
    assert.ok(started.payload.data.sessionId.length > 0);

    const duplicate = await startSession(producer, { startedAtMs: 1001 });
    assert.equal(duplicate.type, "response.error");
    assert.equal(duplicate.payload.code, "SESSION_ALREADY_STARTED");

    let rows = await fixture.rows(
      `SELECT session_id, producer_instance_id, status, started_at_ms,
              stopped_at_ms, stop_reason, last_heartbeat_at_ms,
              completed_cycles, failed_cycles, config_json
       FROM sessions`
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].session_id, started.payload.data.sessionId);
    assert.equal(rows[0].producer_instance_id, "producer-session-1");
    assert.equal(rows[0].status, "running");
    assert.equal(rows[0].started_at_ms, "1000");
    assert.equal(rows[0].stopped_at_ms, null);
    assert.equal(rows[0].stop_reason, null);
    assert.equal(rows[0].last_heartbeat_at_ms, "5000");
    assert.equal(rows[0].completed_cycles, "0");
    assert.equal(rows[0].failed_cycles, "0");
    assert.deepEqual(JSON.parse(rows[0].config_json), {
      snapshotIntervalMs: 3000,
      chunkDelayMs: 1000,
      chunkSize: 187,
      refreshUniverseEveryCycle: false
    });
    assert.equal(rows[0].config_json.includes("authToken"), false);
    assert.equal(rows[0].config_json.includes("cookie"), false);

    clock.value = 6100;
    const heartbeat = await producer.request("producer.heartbeat", { atMs: 6000 });
    assert.equal(heartbeat.type, "response.ok");
    assert.deepEqual(heartbeat.payload.data, { acceptedAtMs: 6100 });

    rows = await fixture.rows(
      "SELECT last_heartbeat_at_ms FROM sessions WHERE session_id = $sessionId",
      { sessionId: started.payload.data.sessionId }
    );
    assert.equal(rows[0].last_heartbeat_at_ms, "6100");

    clock.value = 7000;
    const stopped = await producer.request("producer.session.stop", {
      stoppedAtMs: 6900,
      reason: "manual"
    });
    assert.equal(stopped.type, "response.ok");
    assert.equal(stopped.payload.data.sessionId, started.payload.data.sessionId);
    assert.equal(stopped.payload.data.status, "stopped");

    rows = await fixture.rows(
      `SELECT status, stopped_at_ms, stop_reason
       FROM sessions WHERE session_id = $sessionId`,
      { sessionId: started.payload.data.sessionId }
    );
    assert.deepEqual(rows, [{
      status: "stopped",
      stopped_at_ms: "6900",
      stop_reason: "manual"
    }]);

    const afterStopHeartbeat = await producer.request("producer.heartbeat", { atMs: 7001 });
    assert.equal(afterStopHeartbeat.type, "response.error");
    assert.equal(afterStopHeartbeat.payload.code, "SESSION_NOT_STARTED");

    const restartSameConnection = await startSession(producer, { startedAtMs: 7002 });
    assert.equal(restartSameConnection.type, "response.error");
    assert.equal(restartSameConnection.payload.code, "SESSION_ALREADY_STARTED");

    const secondProducer = await startProducer(fixture, "producer-session-2");
    const secondStart = await startSession(secondProducer, { startedAtMs: 7100 });
    assert.equal(secondStart.type, "response.ok");

    await secondProducer.close();
    await producer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("universe replacement is revisioned, atomic, retains inactive metadata and ACKs only committed state", async () => {
  const fixture = await createServiceFixture();

  try {
    const producer = await startProducer(fixture, "producer-universe");
    assert.equal((await startSession(producer)).type, "response.ok");

    const first = await producer.request(
      "producer.universe.replace",
      universe(1000, [
        security("1001", { paperName: "Alpha", dateChange: 1.25, extra: { Unknown: 0 } }),
        security("1002", { paperName: "Beta", dateChange: null })
      ])
    );

    assert.equal(first.type, "response.ok");
    assert.deepEqual(first.payload.data, {
      universeRevision: 1,
      recordCount: 2
    });

    let rows = await fixture.rows(
      `SELECT security_id, is_current, universe_revision, first_seen_at_ms,
              last_seen_at_ms, paper_name, map_heat_date_change_json, raw_map_heat
       FROM universe ORDER BY security_id`
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0].security_id, "1001");
    assert.equal(rows[0].is_current, true);
    assert.equal(rows[0].universe_revision, "1");
    assert.equal(rows[0].first_seen_at_ms, "1000");
    assert.equal(rows[0].last_seen_at_ms, "1000");
    assert.equal(rows[0].paper_name, "Alpha");
    assert.equal(JSON.parse(rows[0].map_heat_date_change_json), 1.25);
    assert.deepEqual(JSON.parse(rows[0].raw_map_heat), {
      PaperId: 1001,
      PaperName: "Alpha",
      DateChange: 1.25,
      Unknown: 0
    });

    const second = await producer.request(
      "producer.universe.replace",
      universe(2000, [
        security("1002", { paperName: "Beta Updated", dateChange: -0.5 }),
        security("1003", { paperName: "Gamma", dateChange: "" })
      ])
    );

    assert.equal(second.type, "response.ok");
    assert.deepEqual(second.payload.data, {
      universeRevision: 2,
      recordCount: 2
    });

    rows = await fixture.rows(
      `SELECT security_id, is_current, universe_revision, first_seen_at_ms,
              last_seen_at_ms, paper_name, map_heat_date_change_json, raw_map_heat
       FROM universe ORDER BY security_id`
    );

    assert.equal(rows.length, 3);

    const alpha = rows.find((row) => row.security_id === "1001");
    const beta = rows.find((row) => row.security_id === "1002");
    const gamma = rows.find((row) => row.security_id === "1003");

    assert.deepEqual({
      isCurrent: alpha.is_current,
      revision: alpha.universe_revision,
      firstSeen: alpha.first_seen_at_ms,
      lastSeen: alpha.last_seen_at_ms,
      paperName: alpha.paper_name
    }, {
      isCurrent: false,
      revision: "1",
      firstSeen: "1000",
      lastSeen: "1000",
      paperName: "Alpha"
    });

    assert.deepEqual({
      isCurrent: beta.is_current,
      revision: beta.universe_revision,
      firstSeen: beta.first_seen_at_ms,
      lastSeen: beta.last_seen_at_ms,
      paperName: beta.paper_name
    }, {
      isCurrent: true,
      revision: "2",
      firstSeen: "1000",
      lastSeen: "2000",
      paperName: "Beta Updated"
    });

    assert.equal(gamma.is_current, true);
    assert.equal(gamma.universe_revision, "2");
    assert.equal(gamma.first_seen_at_ms, "2000");
    assert.equal(gamma.last_seen_at_ms, "2000");
    assert.equal(JSON.parse(gamma.map_heat_date_change_json), "");
    assert.deepEqual(JSON.parse(gamma.raw_map_heat), {
      PaperId: 1003,
      PaperName: "Gamma",
      DateChange: ""
    });

    const current = rows.filter((row) => row.is_current);
    assert.equal(current.length, 2);
    assert.deepEqual(current.map((row) => row.security_id).sort(), ["1002", "1003"]);

    await producer.close();
  } finally {
    await fixture.cleanup();
  }
});

test("invalid universe is rejected with UNIVERSE_INVALID and leaves prior authority unchanged", async () => {
  const fixture = await createServiceFixture();

  try {
    const producer = await startProducer(fixture, "producer-invalid-universe");
    assert.equal((await startSession(producer)).type, "response.ok");

    const baselinePayload = universe(1000, [
      security("1001", { paperName: "Alpha" }),
      security("1002", { paperName: "Beta" })
    ]);
    const baseline = await producer.request("producer.universe.replace", baselinePayload);
    assert.equal(baseline.type, "response.ok");
    assert.equal(baseline.payload.data.universeRevision, 1);

    const invalidPayloads = [
      {
        ...baselinePayload,
        recordCount: 3
      },
      universe(1100, [
        security("1001"),
        security("1001")
      ]),
      universe(1200, [{
        ...security("1001"),
        rawMapHeat: { PaperId: 9999, PaperName: "Wrong identity" }
      }])
    ];

    for (const payload of invalidPayloads) {
      const response = await producer.request("producer.universe.replace", payload);
      assert.equal(response.type, "response.error");
      assert.equal(response.payload.code, "UNIVERSE_INVALID");
      assert.equal(response.payload.details, null);
    }

    const rows = await fixture.rows(
      `SELECT security_id, is_current, universe_revision, paper_name
       FROM universe ORDER BY security_id`
    );
    assert.deepEqual(rows, [
      {
        security_id: "1001",
        is_current: true,
        universe_revision: "1",
        paper_name: "Alpha"
      },
      {
        security_id: "1002",
        is_current: true,
        universe_revision: "1",
        paper_name: "Beta"
      }
    ]);

    await producer.close();
  } finally {
    await fixture.cleanup();
  }
});

for (const faultPoint of ["U1", "U2", "U3"]) {
  test(`universe fault ${faultPoint} rolls back with no revision ACK and preserves previous authority`, async () => {
    const fault = createPersistenceFaultInjector();
    const fixture = await createServiceFixture({ persistenceFault: fault });

    try {
      const producer = await startProducer(fixture, `producer-${faultPoint}`);
      assert.equal((await startSession(producer)).type, "response.ok");

      const baseline = await producer.request(
        "producer.universe.replace",
        universe(1000, [
          security("1001", { paperName: "Alpha" }),
          security("1002", { paperName: "Beta" })
        ])
      );
      assert.equal(baseline.type, "response.ok");
      assert.equal(baseline.payload.data.universeRevision, 1);

      fault.enable(faultPoint);

      const failed = await producer.request(
        "producer.universe.replace",
        universe(2000, [
          security("1002", { paperName: "Beta New" }),
          security("1003", { paperName: "Gamma" })
        ])
      );

      assert.equal(failed.type, "response.error");
      assert.equal(failed.payload.code, "DB_ERROR");
      assert.equal(Object.hasOwn(failed.payload, "data"), false);

      const rows = await fixture.rows(
        `SELECT security_id, is_current, universe_revision, first_seen_at_ms,
                last_seen_at_ms, paper_name
         FROM universe ORDER BY security_id`
      );

      assert.deepEqual(rows, [
        {
          security_id: "1001",
          is_current: true,
          universe_revision: "1",
          first_seen_at_ms: "1000",
          last_seen_at_ms: "1000",
          paper_name: "Alpha"
        },
        {
          security_id: "1002",
          is_current: true,
          universe_revision: "1",
          first_seen_at_ms: "1000",
          last_seen_at_ms: "1000",
          paper_name: "Beta"
        }
      ]);

      await producer.close();
    } finally {
      await fixture.cleanup();
    }
  });
}
