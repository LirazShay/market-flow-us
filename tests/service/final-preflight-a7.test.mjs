import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSerializedWriter } from "../../local-service/database/writer.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  createProducerPersistence,
  MARKET_FLOW_US_PRODUCER_ADAPTER
} from "../../local-service/persistence/producer-authority.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";

async function rows(connection, sql) {
  const reader = await connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

async function withAuthority(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-a7-"));
  const dbPath = path.join(tempDir, "authority.duckdb");
  let now = 1000;
  let nextSession = 1;
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "a7-test",
    now: () => now
  });
  const writer = createSerializedWriter(database.writerConnection);
  const persistence = createProducerPersistence({
    writer,
    now: () => now,
    createSessionId: () => `session-${nextSession++}`,
    producerAdapter: MARKET_FLOW_US_PRODUCER_ADAPTER
  });

  try {
    await run({
      database,
      persistence,
      setNow(value) { now = value; }
    });
  } finally {
    await writer.drain();
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("durable running-session authority blocks a second producer until the orphan is resolved", async () => {
  await withAuthority(async ({ database, persistence, setNow }) => {
    const first = await persistence.startSession({
      producerInstanceId: "producer-1",
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(first.sessionId, "session-1");

    setNow(2000);
    await assert.rejects(
      persistence.startSession({
        producerInstanceId: "producer-2",
        startedAtMs: 2000,
        config: { snapshotIntervalMs: 3000 }
      }),
      (error) => error?.code === ERROR_CODES.PRODUCER_ALREADY_ACTIVE
    );

    assert.deepEqual(
      await rows(
        database.viewerReadConnection,
        "SELECT session_id, status FROM sessions ORDER BY started_at_ms, session_id"
      ),
      [{ session_id: "session-1", status: "running" }]
    );

    setNow(3000);
    await persistence.interruptSession({
      sessionId: first.sessionId,
      reason: "connection_lost"
    });

    setNow(4000);
    const second = await persistence.startSession({
      producerInstanceId: "producer-2",
      startedAtMs: 4000,
      config: { snapshotIntervalMs: 3000 }
    });
    assert.equal(second.sessionId, "session-3");

    assert.deepEqual(
      await rows(
        database.viewerReadConnection,
        "SELECT session_id, status FROM sessions ORDER BY started_at_ms, session_id"
      ),
      [
        { session_id: "session-1", status: "interrupted" },
        { session_id: "session-3", status: "running" }
      ]
    );
  });
});

test("Node U.S. universe authority rejects malformed PaperId and membership before persistence", async () => {
  await withAuthority(async ({ database, persistence }) => {
    const session = await persistence.startSession({
      producerInstanceId: "producer-identity",
      startedAtMs: 1000,
      config: { snapshotIntervalMs: 3000 }
    });

    const baseSecurity = {
      securityId: "123",
      symbol: "SAFE",
      paperNameEng: "Safe",
      paperNameHeb: null,
      exchangeName: "NASDAQ"
    };

    await assert.rejects(
      persistence.replaceUniverse({
        sessionId: session.sessionId,
        universe: {
          loadedAtMs: 1100,
          recordCount: 1,
          membership: ["[object Object]"],
          securities: [{
            ...baseSecurity,
            securityId: "[object Object]",
            rawSource: { PaperId: {} }
          }]
        }
      }),
      (error) => error?.code === ERROR_CODES.UNIVERSE_INVALID
    );

    await assert.rejects(
      persistence.replaceUniverse({
        sessionId: session.sessionId,
        universe: {
          loadedAtMs: 1200,
          recordCount: 1,
          membership: [true],
          securities: [{
            ...baseSecurity,
            rawSource: { PaperId: 123 }
          }]
        }
      }),
      (error) => error?.code === ERROR_CODES.UNIVERSE_INVALID
    );

    assert.deepEqual(
      await rows(database.viewerReadConnection, "SELECT COUNT(*) AS count FROM universe"),
      [{ count: 0n }]
    );
  });
});
