import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import test from "node:test";

import { openMarketScopeDatabase } from "../../local-service/database/database.js";
import { startMarketScopeService } from "../../local-service/server/service.js";
import { createDiagnosticTracker } from "../../shared/diagnostics/index.js";
import {
  DEFAULT_TEST_ORIGIN,
  createServiceFixture
} from "./helpers/service-fixture.mjs";

function sessionConfig() {
  return {
    snapshotIntervalMs: 3000,
    chunkDelayMs: 1000,
    chunkSize: 187,
    refreshUniverseEveryCycle: false
  };
}

function universe() {
  return {
    loadedAtMs: 1000,
    recordCount: 1,
    securities: [{
      securityId: "1001",
      paperName: "Fixture Alpha",
      mapHeatDateChange: 1.5,
      rawMapHeat: {
        PaperId: 1001,
        PaperName: "Fixture Alpha",
        DateChange: 1.5
      }
    }]
  };
}

function cycle() {
  return {
    status: "complete",
    startedAtMs: 1200,
    completedAtMs: 1250,
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
      requestStartedAtMs: 1200,
      receivedAtMs: 1240,
      completedAtMs: 1250,
      durationMs: 50,
      serverAsOfDate: "fixture",
      httpStatus: 200
    }],
    securities: [{
      securityId: "1001",
      chunkIndex: 0,
      chunkReceivedAtMs: 1240,
      collectedAtMs: 1250,
      serverAsOfDate: "fixture",
      data: {
        Key: 1001,
        LastKnownRate: 101.25
      }
    }]
  };
}

function snapshotData(response) {
  assert.equal(response.type, "response.ok");
  assert.equal(response.payload.requestType, "viewer.support.snapshot");
  return response.payload.data;
}

function assertNoForbidden(serialized) {
  for (const forbidden of [
    "SENTINEL_COOKIE",
    "SENTINEL_AUTH",
    "SENTINEL_ACCOUNT",
    "SENTINEL_RAW",
    "SENTINEL_SQL",
    "SENTINEL_RESULT",
    "/private/",
    "\\Users\\private"
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

test("database startup failure exposes one safe node.database checkpoint record", async () => {
  const tracker = createDiagnosticTracker({ productVersion: "test-service", now: () => 1000 });

  await assert.rejects(
    startMarketScopeService({
      config: {
        host: "127.0.0.1",
        port: 0,
        dbPath: "/private/SENTINEL_RAW_DB.duckdb",
        maxInboundMessageBytes: 1024,
        producerHeartbeatMs: 5000,
        producerStaleAfterMs: 15000,
        historyPageSize: 500,
        allowedOrigins: [DEFAULT_TEST_ORIGIN]
      },
      serviceVersion: "test-service",
      diagnosticTracker: tracker,
      openDatabase: async () => {
        throw new Error("SENTINEL_RAW database failed at /private/SENTINEL_RAW_DB.duckdb");
      }
    }),
    (error) => {
      const record = error.diagnosticRecord;
      assert.equal(record.component, "node.database");
      assert.equal(record.checkpoint, "node.database.ready");
      assert.equal(record.error.code, "DB_ERROR");
      assert.equal(record.lastSuccessfulCheckpoint, null);
      assertNoForbidden(JSON.stringify(record));
      return true;
    }
  );
});

test("occupied loopback port preserves database-ready as last successful checkpoint", async () => {
  const blocker = createNetServer();
  blocker.listen(0, "127.0.0.1");
  await once(blocker, "listening");
  const address = blocker.address();

  try {
    await assert.rejects(
      createServiceFixture({ config: { port: address.port } }),
      (error) => {
        const record = error.diagnosticRecord;
        assert.equal(record.component, "node.service");
        assert.equal(record.checkpoint, "node.service.ready");
        assert.equal(record.lastSuccessfulCheckpoint, "node.database.ready");
        assert.equal(record.error.code, "SERVICE_LISTEN_ERROR");
        assertNoForbidden(JSON.stringify(record));
        return true;
      }
    );
  } finally {
    blocker.close();
    await once(blocker, "close");
  }
});

test("support snapshot localizes producer ownership, commit, Scanner and query-library failures without authority mutation", async () => {
  const fixture = await createServiceFixture();
  const viewer = await fixture.connect("viewer", "diagnostic-viewer");
  const producer = await fixture.connect("producer", "diagnostic-producer");

  try {
    const initial = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(initial.schemaVersion, 1);
    assert.equal(initial.service.productVersion, "test-version");
    assert.equal(initial.service.ready, true);
    assert.equal(initial.service.schemaVersion, 2);
    assert.equal(initial.authority.latestCount, 0);
    assert.equal(initial.authority.historyCount, 0);
    assertNoForbidden(JSON.stringify(initial));

    const secondProducer = await fixture.connect("producer", "diagnostic-producer-2");
    assert.equal(secondProducer.hello.type, "response.error");
    assert.equal(secondProducer.hello.payload.code, "PRODUCER_ALREADY_ACTIVE");

    let support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.diagnostics.lastError.component, "producer");
    assert.equal(support.diagnostics.lastError.checkpoint, "producer.session.started");
    assert.equal(support.diagnostics.lastError.error.code, "PRODUCER_ALREADY_ACTIVE");

    const started = await producer.request("producer.session.start", {
      startedAtMs: 1000,
      config: sessionConfig()
    });
    assert.equal(started.type, "response.ok");

    const accepted = await producer.request("producer.universe.replace", universe());
    assert.equal(accepted.type, "response.ok");

    fixture.persistenceFault.enable("F1");
    const rejectedCommit = await producer.request("producer.cycle.commit", {
      universeRevision: accepted.payload.data.universeRevision,
      cycle: cycle()
    });
    assert.equal(rejectedCommit.type, "response.error");
    assert.equal(rejectedCommit.payload.code, "DB_ERROR");

    support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.diagnostics.lastError.component, "persistence");
    assert.equal(support.diagnostics.lastError.checkpoint, "producer.cycle.committed");
    assert.equal(support.diagnostics.lastError.error.code, "DB_ERROR");
    assert.equal(support.authority.latestCount, 0);
    assert.equal(support.authority.historyCount, 0);
    fixture.persistenceFault.disable("F1");

    const rejectedSql = await viewer.request("scanner.execute", {
      sql: "DELETE FROM latest /* SENTINEL_SQL */"
    });
    assert.equal(rejectedSql.type, "response.error");
    support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.diagnostics.lastError.component, "scanner");
    assert.equal(support.diagnostics.lastError.checkpoint, "scanner.execute");
    assert.match(support.diagnostics.lastError.error.code, /^SCANNER_/);
    assert.equal(JSON.stringify(support).includes("SENTINEL_SQL"), false);

    const beforeLibraryFailure = support.authority;
    fixture.persistenceFault.enable("Q1");
    const rejectedCreate = await viewer.request("scanner.queries.create", {
      name: "Diagnostic sentinel query",
      sql: "SELECT 'SENTINEL_SQL' AS value",
      intervalMs: 5000
    });
    assert.equal(rejectedCreate.type, "response.error");
    assert.equal(rejectedCreate.payload.code, "DB_ERROR");

    support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.diagnostics.lastError.component, "scanner");
    assert.equal(support.diagnostics.lastError.checkpoint, "scanner.query_library");
    assert.equal(support.diagnostics.lastError.error.code, "DB_ERROR");
    assert.deepEqual(support.authority, beforeLibraryFailure);
    assertNoForbidden(JSON.stringify(support));
  } finally {
    await fixture.cleanup();
  }
});

test("trusted Viewer read failure reports exact read checkpoint while Support Snapshot stays readable", async () => {
  const openDatabase = async (options) => {
    const database = await openMarketScopeDatabase(options);
    const original = database.viewerReadConnection.runAndReadAll.bind(
      database.viewerReadConnection
    );

    database.viewerReadConnection = {
      async runAndReadAll(sql, values) {
        if (String(sql).includes("FROM latest AS l")) {
          throw new Error("SENTINEL_RAW viewer read failed at C:\\Users\\private\\db.duckdb");
        }
        return values === undefined
          ? await original(sql)
          : await original(sql, values);
      }
    };
    return database;
  };

  const fixture = await createServiceFixture({ openDatabase });
  const viewer = await fixture.connect("viewer", "viewer-read-diagnostic");

  try {
    const failed = await viewer.request("viewer.current.get");
    assert.equal(failed.type, "response.error");
    assert.equal(failed.payload.code, "DB_ERROR");

    const support = snapshotData(await viewer.request("viewer.support.snapshot"));
    assert.equal(support.diagnostics.lastError.component, "viewer");
    assert.equal(support.diagnostics.lastError.checkpoint, "viewer.current.read");
    assert.equal(support.diagnostics.lastError.error.code, "DB_ERROR");
    assert.equal(support.authority.latestCount, 0);
    assertNoForbidden(JSON.stringify(support));
  } finally {
    await fixture.cleanup();
  }
});
