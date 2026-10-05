import assert from "node:assert/strict";
import test from "node:test";

import { createSerializedWriter } from "../../local-service/database/writer.js";

const HISTORY_INSERT = `
  INSERT INTO history (
    cycle_id,
    security_id,
    chunk_index,
    Price,
    raw_data
  ) VALUES (
    $cycleId,
    $securityId,
    $chunkIndex,
    $Price,
    $rawDataJson
  )
`;

const LATEST_INSERT = HISTORY_INSERT.replace("history", "latest");

function params(cycleId, securityId, price) {
  return {
    cycleId,
    securityId,
    chunkIndex: 0,
    Price: price,
    rawDataJson: JSON.stringify({ securityId, price })
  };
}

function createFakeConnection() {
  const events = [];

  function appender(table) {
    return {
      appendDataChunk(chunk) {
        events.push(["appendDataChunk", table, chunk.getRows()]);
      },
      flushSync() {
        events.push(["flush", table]);
      },
      closeSync() {
        events.push(["close", table]);
      }
    };
  }

  return {
    events,
    connection: {
      async createAppender(table) {
        events.push(["createAppender", table]);
        return appender(table);
      },
      async run(sql) {
        events.push(["run", sql.trim()]);
      },
      async runAndReadAll(sql) {
        events.push(["read", sql.trim()]);
        return { getRowObjectsJson: () => [] };
      }
    }
  };
}

test("serialized writer batches consecutive history/latest rows into data chunks and flushes at authority boundaries", async () => {
  const fake = createFakeConnection();
  const writer = createSerializedWriter(fake.connection);

  await writer.enqueue(async (connection) => {
    await connection.run("BEGIN TRANSACTION");
    await connection.run(HISTORY_INSERT, params(1, "101", 10));
    await connection.run(HISTORY_INSERT, params(1, "202", 20));
    await connection.run("DELETE FROM latest");
    await connection.run(LATEST_INSERT, params(1, "101", 10));
    await connection.run(LATEST_INSERT, params(1, "202", 20));
    await connection.run("UPDATE sessions SET completed_cycles = completed_cycles + 1");
    await connection.run("COMMIT");
  });

  assert.equal(
    fake.events.filter(([name, table]) => name === "createAppender" && table === "history").length,
    1
  );
  assert.equal(
    fake.events.filter(([name, table]) => name === "createAppender" && table === "latest").length,
    1
  );

  const historyChunks = fake.events.filter(
    ([name, table]) => name === "appendDataChunk" && table === "history"
  );
  const latestChunks = fake.events.filter(
    ([name, table]) => name === "appendDataChunk" && table === "latest"
  );
  assert.equal(historyChunks.length, 1);
  assert.equal(latestChunks.length, 1);
  assert.deepEqual(historyChunks[0][2], [
    [1n, "101", 0, 10, JSON.stringify({ securityId: "101", price: 10 })],
    [1n, "202", 0, 20, JSON.stringify({ securityId: "202", price: 20 })]
  ]);

  const rawSql = fake.events
    .filter(([name]) => name === "run")
    .map(([, sql]) => sql);
  assert.deepEqual(rawSql, [
    "BEGIN TRANSACTION",
    "DELETE FROM latest",
    "UPDATE sessions SET completed_cycles = completed_cycles + 1",
    "COMMIT"
  ]);

  const historyFlush = fake.events.findIndex(
    ([name, table]) => name === "flush" && table === "history"
  );
  const deleteLatest = fake.events.findIndex(
    ([name, sql]) => name === "run" && sql === "DELETE FROM latest"
  );
  const latestFlush = fake.events.findIndex(
    ([name, table]) => name === "flush" && table === "latest"
  );
  const updateSession = fake.events.findIndex(
    ([name, sql]) => name === "run" && sql.startsWith("UPDATE sessions")
  );

  assert.ok(historyFlush >= 0 && historyFlush < deleteLatest);
  assert.ok(latestFlush >= 0 && latestFlush < updateSession);
});

test("serialized writer flushes buffered chunk rows inside the transaction before rollback and preserves the original error", async () => {
  const fake = createFakeConnection();
  const writer = createSerializedWriter(fake.connection);
  const expected = new Error("synthetic F2");

  await assert.rejects(
    writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      try {
        await connection.run(HISTORY_INSERT, params(1, "101", 10));
        throw expected;
      } catch (error) {
        await connection.run("ROLLBACK");
        throw error;
      }
    }),
    (error) => error === expected
  );

  const appendIndex = fake.events.findIndex(
    ([name, table]) => name === "appendDataChunk" && table === "history"
  );
  const flushIndex = fake.events.findIndex(
    ([name, table]) => name === "flush" && table === "history"
  );
  const rollbackIndex = fake.events.findIndex(
    ([name, sql]) => name === "run" && sql === "ROLLBACK"
  );
  assert.ok(appendIndex >= 0 && appendIndex < flushIndex);
  assert.ok(flushIndex >= 0 && flushIndex < rollbackIndex);
});

test("serialized writer keeps the original direct connection behavior when Appender is unavailable", async () => {
  const calls = [];
  const connection = {
    async run(sql) {
      calls.push(sql.trim());
      return sql;
    }
  };
  const writer = createSerializedWriter(connection);

  await writer.enqueue(async (writerConnection) => {
    await writerConnection.run(HISTORY_INSERT, params(1, "101", 10));
  });

  assert.deepEqual(calls, [HISTORY_INSERT.trim()]);
});
