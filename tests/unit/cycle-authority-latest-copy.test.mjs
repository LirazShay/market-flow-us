import assert from "node:assert/strict";
import test from "node:test";
import { createCycleAuthorityPersistence } from "../../local-service/persistence/cycle-authority.js";

function reader(rows) {
  return {
    getRowObjectsJson() {
      return rows;
    }
  };
}

function completeCycle() {
  return {
    status: "complete",
    startedAtMs: 1000,
    completedAtMs: 1100,
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
      requestStartedAtMs: 1010,
      receivedAtMs: 1080,
      completedAtMs: 1090,
      durationMs: 80,
      httpStatus: 200
    }],
    securities: ["1001", "1002"].map((securityId) => ({
      securityId,
      chunkIndex: 0,
      chunkReceivedAtMs: 1080,
      collectedAtMs: 1090,
      data: { id: securityId }
    }))
  };
}

test("complete cycle projects each security once and replaces latest set-wise from committed history", async () => {
  const statements = [];
  let projectionCalls = 0;

  const connection = {
    async runAndReadAll(sql) {
      if (sql.includes("SELECT status FROM sessions")) {
        return reader([{ status: "running" }]);
      }
      if (sql.includes("FROM universe")) {
        return reader([
          { security_id: "1001", universe_revision: "1" },
          { security_id: "1002", universe_revision: "1" }
        ]);
      }
      if (sql.includes("MAX(cycle_id)")) {
        return reader([{ cycle_id: "0" }]);
      }
      throw new Error(`Unexpected read SQL: ${sql}`);
    },
    async run(sql, params) {
      statements.push({ sql, params });
    }
  };

  const adapter = {
    validateCycleShape() {},
    validateChunkMetadata() {},
    validateSecurityIdentity() {},
    metadataJson() {
      return null;
    },
    projectionParams({ cycleId, item }) {
      projectionCalls += 1;
      return { cycleId, securityId: item.securityId };
    },
    insertMarketRowSql: "(cycle_id, security_id) VALUES ($cycleId, $securityId)"
  };

  const authority = createCycleAuthorityPersistence({
    writer: {
      async enqueue(work) {
        return await work(connection);
      }
    },
    now: () => 2000,
    cycleAdapter: adapter
  });

  await authority.commitCycle({
    sessionId: "session-us",
    universeRevision: 1,
    cycle: completeCycle()
  });

  assert.equal(projectionCalls, 2, "projection should happen once per security");

  const historyInserts = statements.filter(({ sql }) =>
    sql.startsWith("INSERT INTO history "));
  assert.equal(historyInserts.length, 2);

  const latestRowInserts = statements.filter(({ sql }) =>
    sql.startsWith("INSERT INTO latest (") && sql.includes("VALUES"));
  assert.equal(latestRowInserts.length, 0, "latest must not replay per-security projections");

  const latestCopies = statements.filter(({ sql }) =>
    sql === "INSERT INTO latest SELECT * FROM history WHERE cycle_id = $cycleId");
  assert.equal(latestCopies.length, 1);
  assert.deepEqual(latestCopies[0].params, { cycleId: 1 });
}
