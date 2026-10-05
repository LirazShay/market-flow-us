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
const LATEST_COPY_SQL = "INSERT INTO latest SELECT * FROM history WHERE cycle_id = $cycleId";

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
      async run(sql, values) {
        events.push(["run", sql.trim(), values ?? null]);
      },
      async runAndReadAll(sql) {
        events.push(["read", sql.trim()]);
        return { getRowObjectsJson: () => [] };
      }
    }
  };
}

test("serialized writer bulk-loads history once and rebuilds identical latest set-wise inside the transaction", async () => {
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
    0
  );

  const historyChunks = fake.events.filter(
    ([name, table]) => name === "appendDataChunk" && table === "history"
  );
  const latestChunks = fake.events.filter(
    ([name, table]) => name === "appendDataChunk" && table === "latest"
  );
  assert.equal(historyChunks.length, 1);
  assert.equal(latestChunks.length, 0);
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
    LATEST_COPY_SQL,
    "UPDATE sessions SET completed_cycles = completed_cycles + 1",
    "COMMIT"
  ]);

  const historyFlush = fake.events.findIndex(
    ([name, table]) => name === "flush" && table === "history"
  );
  const deleteLatest = fake.events.findIndex(
    ([name, sql]) => name === "run" && sql === "DELETE FROM latest"
  );
  const latestCopy = fake.events.findIndex(
    ([name, sql, values]) => name === "run"
      && sql === LATEST_COPY_SQL
      && values?.cycleId === 1
  );
  const updateSession = fake.events.findIndex(
    ([name, sql]) => name === "run" && sql.startsWith("UPDATE sessions")
  );

  assert.ok(historyFlush >= 0 && historyFlush < deleteLatest);
  assert.ok(deleteLatest < latestCopy && latestCopy < updateSession);
});

test("rollback discards buffered history without flushing non-authoritative rows", async () => {
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

  assert.equal(
    fake.events.filter(([name, table]) => name === "createAppender" && table === "history").length,
    0
  );
  assert.equal(
    fake.events.filter(([name, table]) => name === "flush" && table === "history").length,
    0
  );
  assert.ok(fake.events.some(([name, sql]) => name === "run" && sql === "ROLLBACK"));
});

test("rollback reaches DuckDB even when flushing the discarded appender buffer would fail", async () => {
  const events = [];
  const connection = {
    async createAppender(table) {
      events.push(["createAppender", table]);
      throw new Error("synthetic appender failure");
    },
    async run(sql) {
      events.push(["run", sql.trim()]);
    }
  };
  const writer = createSerializedWriter(connection);
  const expected = new Error("original transaction failure");

  await assert.rejects(
    writer.enqueue(async (writerConnection) => {
      await writerConnection.run("BEGIN TRANSACTION");
      try {
        await writerConnection.run(HISTORY_INSERT, params(1, "101", 10));
        throw expected;
      } catch (error) {
        await writerConnection.run("ROLLBACK");
        throw error;
      }
    }),
    (error) => error === expected
  );

  assert.deepEqual(events, [
    ["run", "BEGIN TRANSACTION"],
    ["run", "ROLLBACK"]
  ]);
});

test("rollback during latest phase discards an incomplete set-wise copy and preserves prior authority", async () => {
  const fake = createFakeConnection();
  const writer = createSerializedWriter(fake.connection);
  const expected = new Error("synthetic F4");

  await assert.rejects(
    writer.enqueue(async (connection) => {
      await connection.run("BEGIN TRANSACTION");
      await connection.run(HISTORY_INSERT, params(1, "101", 10));
      await connection.run(HISTORY_INSERT, params(1, "202", 20));
      await connection.run("DELETE FROM latest");
      try {
        await connection.run(LATEST_INSERT, params(1, "101", 10));
        throw expected;
      } catch (error) {
        await connection.run("ROLLBACK");
        throw error;
      }
    }),
    (error) => error === expected
  );

  assert.equal(
    fake.events.filter(([name, sql]) => name === "run" && sql === LATEST_COPY_SQL).length,
    0
  );
  assert.equal(
    fake.events.filter(([name, table]) => name === "createAppender" && table === "latest").length,
    0
  );
  assert.ok(fake.events.some(([name, sql]) => name === "run" && sql === "ROLLBACK"));
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
