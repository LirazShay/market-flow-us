import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openResearchDomain } from "../../research-server/domain.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";
import { ERROR_CODES } from "../../shared/protocol/index.js";

const RUN_ID = "run_61616161-6161-4161-8161-616161616161";
const OBJECTIVE_ID = "obj_61616161-6161-4161-8161-616161616161";
const INVENTORY_ID = "inv_61616161-6161-4161-8161-616161616161";
const PLAN_ID = "plan_61616161-6161-4161-8161-616161616161";
const PART_DEV = "part_61616161-6161-4161-8161-616161616161";
const PART_VALIDATION = "part_62626262-6262-4262-8262-626262626262";

function sequence(values) {
  const remaining = [...values];
  return () => {
    if (remaining.length === 0) throw new Error("test sequence exhausted");
    return remaining.shift();
  };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function seedMarketData(dataDir) {
  const dbPath = path.join(dataDir, "market-flow-us.duckdb");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-sql-host-source-hardening-v4",
    now: () => 1_700_000_000_000
  });
  try {
    await database.writerConnection.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'host-source-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await database.writerConnection.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'host-source-seed', 1, '1001', 0, 1900, 1980, 1980,
         '{}', 'AAA', 'Alpha', 'NYSE', 'provider-t0', 100, 0.5, 1000,
         '{"PaperId":"1001","ExtraSignal":7}')
    `);
  } finally {
    await database.close();
  }
  return dbPath;
}

function assertScannerForbidden(error) {
  return error?.code === ERROR_CODES.SCANNER_FORBIDDEN_FUNCTION;
}

test("TREE 11.7 composed Research SQL blocks host/source escape equivalents and preserves source bytes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-host-source-"));
  const ledgerPath = path.join(tempDir, "research-ledger.duckdb");
  const canaryPath = path.join(tempDir, "host-canary.json");
  const exportPath = path.join(tempDir, "must-not-export");
  let domain = null;
  let session = null;

  try {
    const dbPath = await seedMarketData(tempDir);
    await writeFile(canaryPath, '{"canary":"host-read-must-not-succeed"}\n', "utf8");
    const sourceBefore = await readFile(dbPath);
    const fingerprintBefore = await fingerprintResearchEvidenceSource({
      dataDir: tempDir,
      sourceId: "active"
    });

    domain = await openResearchDomain({
      dbPath: ledgerPath,
      marketDataDir: tempDir,
      now: () => 1_893_000_000_000,
      idFactory: () => RUN_ID,
      objectiveVersionIdFactory: () => OBJECTIVE_ID,
      evidenceInventoryIdFactory: () => INVENTORY_ID,
      evidencePlanIdFactory: () => PLAN_ID,
      partitionIdFactory: sequence([PART_DEV, PART_VALIDATION])
    });

    await domain.createResearchRun({
      userIntent: "Prove composed Research SQL cannot reach host or original evidence.",
      environmentSnapshot: {},
      budgetPolicy: {}
    });
    await domain.createObjectiveVersion({
      researchRunId: RUN_ID,
      interpretationText: "Inspect Development evidence without widening host authority.",
      objective: { targetDirection: "UP", primaryHorizonsSec: [10] }
    });
    await domain.createEvidenceInventory({
      researchRunId: RUN_ID,
      inventory: {
        sources: [{
          sourceId: "active",
          sourceFingerprint: fingerprintBefore,
          classification: "ACTIVE",
          schemaVersion: 4
        }]
      }
    });
    await domain.createEvidencePlan({
      researchRunId: RUN_ID,
      objectiveVersionId: OBJECTIVE_ID,
      evidenceInventoryId: INVENTORY_ID,
      plan: { algorithmVersion: "host-source-hardening-v1" },
      partitions: [
        { role: "DEVELOPMENT", partition: { sourceIds: ["active"] } },
        { role: "VALIDATION", partition: { sourceIds: ["active"] } }
      ]
    });

    session = await domain.openDevelopmentResearchSql({
      researchRunId: RUN_ID,
      partitionId: PART_DEV,
      experimentIds: []
    });

    const explicitlyForbidden = [
      `SELECT * FROM main.read_csv_auto /* namespaced + comment */ (${sqlLiteral(canaryPath)})`,
      `SELECT * FROM "main"."read_json" /* quoted + comment */ (${sqlLiteral(canaryPath)})`,
      "SELECT * FROM main.query_table /* namespaced dynamic SQL */ ('research_history')",
      "SELECT * FROM pragma_database_list /* catalog pragma equivalent */ ()",
      "SELECT * FROM \"duckdb_settings\" /* quoted catalog function */ ()",
      "SELECT * FROM parquet_file_metadata /* metadata reader */ ('synthetic.parquet')"
    ];
    for (const sql of explicitlyForbidden) {
      await assert.rejects(() => session.execute(sql), assertScannerForbidden, sql);
    }

    const unexpectedSuccesses = [];
    const mustReject = [
      ["implicit local replacement scan", `SELECT * FROM ${sqlLiteral(canaryPath)}`],
      ["implicit remote replacement scan", "SELECT * FROM 'https://example.invalid/host-source.csv'"],
      ["JSON object reader alias", `SELECT * FROM read_json_objects(${sqlLiteral(canaryPath)})`],
      ["NDJSON object reader alias", `SELECT * FROM read_ndjson_objects(${sqlLiteral(canaryPath)})`],
      ["detached original evidence alias", "SELECT * FROM evidence.main.history"],
      ["PostgreSQL-compatible settings catalog", "SELECT name, setting FROM pg_catalog.pg_settings"],
      ["unqualified settings catalog", "SELECT name, setting FROM pg_settings"],
      ["quoted settings catalog", "SELECT name, setting FROM \"pg_catalog\".\"pg_settings\""],
      ["EXPORT DATABASE", `EXPORT DATABASE ${sqlLiteral(exportPath)}`],
      ["CHECKPOINT", "CHECKPOINT"],
      ["VACUUM", "VACUUM"]
    ];

    for (const [label, sql] of mustReject) {
      try {
        await session.execute(sql);
        unexpectedSuccesses.push(label);
      } catch {
        // Safe rejection is the required outcome for this hostile corpus.
      }
    }

    const stillUsable = await session.execute(`
      SELECT security_id, Price
      FROM research_history
      ORDER BY security_id
    `);
    assert.deepEqual(stillUsable.rows, [["1001", 100]]);

    await session.close();
    session = null;
    await domain.close();
    domain = null;

    assert.deepEqual(await readFile(dbPath), sourceBefore);
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir: tempDir, sourceId: "active" }),
      fingerprintBefore
    );
    await assert.rejects(() => access(exportPath));
    assert.deepEqual(
      unexpectedSuccesses,
      [],
      `host/source attacks unexpectedly executed: ${unexpectedSuccesses.join(", ")}`
    );
  } finally {
    if (session) await session.close();
    if (domain) await domain.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
