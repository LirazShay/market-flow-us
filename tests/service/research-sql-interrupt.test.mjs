import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openDevelopmentResearchSqlSandbox } from "../../research-server/research-sql.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const LONG_SQL = "SELECT SUM(sin(i::DOUBLE)) AS total FROM range(0, 1000000000) AS t(i)";

async function seedMarketData(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-sql-interrupt-test-v1",
    now: () => 1_700_000_000_000
  });
  try {
    const writer = database.writerConnection;
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'interrupt-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'interrupt-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}')
    `);
  } finally {
    await database.close();
  }
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`interrupt proof exceeded ${ms}ms`)), ms);
  });
}

test("TREE 11.4 Research SQL sandbox directly interrupts active DuckDB work without closing the sandbox", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-sql-interrupt-"));
  let sandbox = null;

  try {
    await seedMarketData(tempDir);
    const fingerprint = await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" });
    sandbox = await openDevelopmentResearchSqlSandbox({
      dataDir: tempDir,
      partition: {
        partitionId: PARTITION_ID,
        evidencePlanId: PLAN_ID,
        role: "DEVELOPMENT",
        partition: { sourceIds: ["active"] }
      },
      inventory: {
        inventory: {
          sources: [{
            sourceId: "active",
            sourceFingerprint: fingerprint,
            classification: "ACTIVE",
            schemaVersion: 4
          }]
        }
      },
      now: () => 1_860_000_000_000
    });

    assert.equal(typeof sandbox.interrupt, "function");

    let settled = false;
    const execution = sandbox.execute(LONG_SQL).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(settled, false, "long SQL must still be active before the interrupt proof fires");

    sandbox.interrupt();
    await assert.rejects(Promise.race([execution, timeoutAfter(2_000)]));

    const afterInterrupt = await sandbox.execute("SELECT 1 AS value");
    assert.equal(afterInterrupt.rowCount, 1);
    assert.deepEqual(afterInterrupt.rows, [[1]]);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprint
    );
  } finally {
    if (sandbox) await sandbox.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
