import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createSerializedWriter } from "../../local-service/database/writer.js";
import {
  MARKET_FLOW_US_CYCLE_ADAPTER,
  createCycleAuthorityPersistence
} from "../../local-service/persistence/cycle-authority.js";

async function rows(connection, sql, values) {
  const reader = values === undefined
    ? await connection.runAndReadAll(sql)
    : await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function rawSecurity(id, overrides = {}) {
  return {
    PaperId: Number(id),
    Symbol: id === "1001" ? "AAA" : "BBB",
    PaperNameEng: id === "1001" ? "Alpha" : "Beta",
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: id === "1001" ? "2026-10-04T19:00:00" : "2026-10-04T19:00:01",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: id === "1001" ? 0 : 20.5,
    ChangePercent: id === "1001" ? 1.25 : null,
    DailyHigh: id === "1001" ? 11 : 21,
    DailyLow: id === "1001" ? 9 : 19,
    YearHigh: id === "1001" ? 15 : 30,
    YearLow: id === "1001" ? 5 : 10,
    DailyVolume: id === "1001" ? 0 : 1234,
    BeginYearChangePercent: id === "1001" ? "wrong-type" : 3,
    Month12ChangePercent: id === "1001" ? 4 : 5,
    Month36ChangePercent: id === "1001" ? 6 : 7,
    AskRate: id === "1001" ? 10.1 : 20.6,
    BidRate: id === "1001" ? 9.9 : 20.4,
    YesterdayRate: id === "1001" ? 9.8 : 20,
    PaperMarketCap: id === "1001" ? 100000 : 200000,
    PaperIdYatab: id === "1001" ? 501 : 502,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: id === "1001" ? null : 3,
    ESGScope: id === "1001" ? 0 : 2,
    UnknownField: id === "1001" ? 0 : null,
    ...overrides
  };
}

function completeCycle({
  startedAtMs = 2000,
  completedAtMs = 2100,
  ids = ["1001", "1002"],
  priceOverrides = {}
} = {}) {
  const receivedAtMs = completedAtMs - 20;
  const chunkCompletedAtMs = completedAtMs - 10;
  const securities = ids.map((id) => ({
    securityId: id,
    chunkIndex: 0,
    chunkReceivedAtMs: receivedAtMs,
    collectedAtMs: chunkCompletedAtMs,
    sourceMetadata: { serverId: "synthetic", version: "test" },
    data: rawSecurity(id, Object.hasOwn(priceOverrides, id)
      ? { Price: priceOverrides[id] }
      : {})
  }));

  return {
    status: "complete",
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    requested: ids.length,
    received: ids.length,
    unique: ids.length,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: [{
      chunkIndex: 0,
      requested: ids.length,
      received: ids.length,
      unique: ids.length,
      requestStartedAtMs: startedAtMs + 10,
      receivedAtMs,
      completedAtMs: chunkCompletedAtMs,
      durationMs: chunkCompletedAtMs - (startedAtMs + 10),
      httpStatus: 200,
      sourceMetadata: { serverId: "synthetic", version: "test" }
    }],
    securities
  };
}

async function createAuthorityFixture() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-cycle-"));
  const dbPath = path.join(tempDir, "authority.duckdb");
  const clock = { value: 9000 };
  const database = await openMarketFlowUsDatabase({ dbPath, now: () => clock.value });
  const writer = createSerializedWriter(database.writerConnection);
  const faultPoints = new Set();
  const authority = createCycleAuthorityPersistence({
    writer,
    now: () => clock.value,
    cycleAdapter: MARKET_FLOW_US_CYCLE_ADAPTER,
    persistenceFault: {
      hit(point) {
        if (faultPoints.has(point)) throw new Error(`Injected ${point}`);
      }
    }
  });

  await database.writerConnection.run(`
    INSERT INTO sessions (
      session_id, producer_instance_id, status, started_at_ms, stopped_at_ms,
      stop_reason, last_heartbeat_at_ms, completed_cycles, failed_cycles,
      last_completed_cycle_id, last_completed_at_ms, config_json, last_error_json
    ) VALUES (
      'session-us', 'producer-us', 'running', 100, NULL, NULL, 100,
      0, 0, NULL, NULL, '{"snapshotIntervalMs":3000}', NULL
    )
  `);

  for (const [securityId, symbol, name] of [
    ["1001", "AAA", "Alpha"],
    ["1002", "BBB", "Beta"]
  ]) {
    await database.writerConnection.run(
      `INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms,
        last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      ) VALUES (
        $securityId, true, 1, 100, 100, $symbol, $name, NULL, 'NASDAQ', $rawSource
      )`,
      {
        securityId,
        symbol,
        name,
        rawSource: JSON.stringify({ PaperId: Number(securityId), Symbol: symbol })
      }
    );
  }

  return {
    database,
    authority,
    clock,
    faultPoints,
    async fingerprint() {
      const [cycles, history, latest, session] = await Promise.all([
        rows(database.viewerReadConnection,
          "SELECT cycle_id, status, universe_revision, error_json FROM cycles ORDER BY cycle_id"),
        rows(database.viewerReadConnection,
          "SELECT cycle_id, security_id, Price, raw_data FROM history ORDER BY cycle_id, security_id"),
        rows(database.viewerReadConnection,
          "SELECT cycle_id, security_id, Price, raw_data FROM latest ORDER BY security_id"),
        rows(database.viewerReadConnection,
          `SELECT completed_cycles, failed_cycles, last_completed_cycle_id,
                  last_completed_at_ms, last_error_json
           FROM sessions WHERE session_id = 'session-us'`)
      ]);
      return { cycles, history, latest, session };
    },
    async cleanup() {
      await database.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

test("U.S. cycle commit preserves source rows and projects exact typed fields into history/latest", async () => {
  const fixture = await createAuthorityFixture();
  try {
    const result = await fixture.authority.commitCycle({
      sessionId: "session-us",
      universeRevision: 1,
      cycle: completeCycle()
    });
    assert.deepEqual(result, { cycleId: 1, committedAtMs: 9000 });

    const history = await rows(
      fixture.database.viewerReadConnection,
      `SELECT security_id, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
              Price, ChangePercent, DailyVolume, BeginYearChangePercent,
              ESGRatingId, ESGScope, source_metadata_json, raw_data
       FROM history ORDER BY security_id`
    );
    assert.equal(history.length, 2);
    assert.deepEqual({
      securityId: history[0].security_id,
      symbol: history[0].Symbol,
      name: history[0].PaperNameEng,
      exchange: history[0].ExchangeName,
      tradeDateTime: history[0].TradeDateTime,
      price: history[0].Price,
      change: history[0].ChangePercent,
      volume: history[0].DailyVolume,
      wrongTypeProjection: history[0].BeginYearChangePercent,
      nullableProjection: history[0].ESGRatingId,
      zeroProjection: history[0].ESGScope
    }, {
      securityId: "1001",
      symbol: "AAA",
      name: "Alpha",
      exchange: "NASDAQ",
      tradeDateTime: "2026-10-04T19:00:00",
      price: 0,
      change: 1.25,
      volume: 0,
      wrongTypeProjection: null,
      nullableProjection: null,
      zeroProjection: 0
    });

    assert.deepEqual(JSON.parse(history[0].source_metadata_json), {
      serverId: "synthetic",
      version: "test"
    });
    const raw = JSON.parse(history[0].raw_data);
    assert.equal(raw.Price, 0);
    assert.equal(raw.DailyVolume, 0);
    assert.equal(raw.BeginYearChangePercent, "wrong-type");
    assert.equal(raw.UnknownField, 0);

    const latest = await rows(
      fixture.database.viewerReadConnection,
      "SELECT security_id, Price FROM latest ORDER BY security_id"
    );
    assert.deepEqual(latest, [
      { security_id: "1001", Price: 0 },
      { security_id: "1002", Price: 20.5 }
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("U.S. cycle authority requires exact current membership and appends one history row per security", async () => {
  const fixture = await createAuthorityFixture();
  try {
    await assert.rejects(
      () => fixture.authority.commitCycle({
        sessionId: "session-us",
        universeRevision: 1,
        cycle: completeCycle({ ids: ["1001"] })
      }),
      (error) => error?.code === "CYCLE_INVALID"
    );
    assert.deepEqual(await rows(
      fixture.database.viewerReadConnection,
      "SELECT COUNT(*) AS count FROM history"
    ), [{ count: "0" }]);

    await fixture.authority.commitCycle({
      sessionId: "session-us",
      universeRevision: 1,
      cycle: completeCycle()
    });
    fixture.clock.value = 9100;
    await fixture.authority.commitCycle({
      sessionId: "session-us",
      universeRevision: 1,
      cycle: completeCycle({
        startedAtMs: 3000,
        completedAtMs: 3100,
        priceOverrides: { "1001": 12, "1002": 22 }
      })
    });

    assert.deepEqual(await rows(
      fixture.database.viewerReadConnection,
      "SELECT COUNT(*) AS count FROM history"
    ), [{ count: "4" }]);
    assert.deepEqual(await rows(
      fixture.database.viewerReadConnection,
      "SELECT security_id, Price, cycle_id FROM latest ORDER BY security_id"
    ), [
      { security_id: "1001", Price: 12, cycle_id: "2" },
      { security_id: "1002", Price: 22, cycle_id: "2" }
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("every U.S. persistence fault seam rolls back cycle/history/latest/session authority", async () => {
  const fixture = await createAuthorityFixture();
  try {
    await fixture.authority.commitCycle({
      sessionId: "session-us",
      universeRevision: 1,
      cycle: completeCycle()
    });
    const baseline = await fixture.fingerprint();

    for (const point of ["F1", "F2", "F3", "F4", "F5"]) {
      fixture.faultPoints.add(point);
      fixture.clock.value += 100;
      await assert.rejects(
        () => fixture.authority.commitCycle({
          sessionId: "session-us",
          universeRevision: 1,
          cycle: completeCycle({
            startedAtMs: 4000 + fixture.clock.value,
            completedAtMs: 4100 + fixture.clock.value,
            priceOverrides: { "1001": 99, "1002": 100 }
          })
        }),
        new RegExp(`Injected ${point}`)
      );
      fixture.faultPoints.delete(point);
      assert.deepEqual(await fixture.fingerprint(), baseline, point);
    }
  } finally {
    await fixture.cleanup();
  }
});
