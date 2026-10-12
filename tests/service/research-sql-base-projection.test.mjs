import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  describeResearchSqlSchema,
  openDevelopmentResearchSqlSandbox,
  RESEARCH_DATA_SURFACE_VERSION
} from "../../research-server/research-sql.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const PARTITION_ID = "part_11111111-1111-4111-8111-111111111111";
const PLAN_ID = "plan_11111111-1111-4111-8111-111111111111";
const ARCHIVE_NAME = "market-flow-us-20261010T200000000Z.duckdb";
const ARCHIVE_ID = `archive:${ARCHIVE_NAME}`;

async function seedSource(dbPath, { securityId, excludedSecurityId, symbol, price, extraSignal }) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-sql-test-v4",
    now: () => 1_700_000_000_000
  });
  const writer = database.writerConnection;
  const universeOnlySecurityId = `${securityId}-universe-only`;

  try {
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES
        (1, 'research-seed', 1, 'complete', 1900, 1990, 2000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'research-seed', 2, 'complete', 3900, 3990, 4000, 90, 1, 1, 1, 0, 0, 0, 1, '[]', NULL, NULL)
    `);

    await writer.run(
      `INSERT INTO universe (
        security_id, is_current, universe_revision, first_seen_at_ms, last_seen_at_ms,
        Symbol, PaperNameEng, PaperNameHeb, ExchangeName, raw_source
      ) VALUES
        ($securityId, false, 7, 100, 9000, $universeSymbol, 'Universe included', 'Universe Heb', 'NASDAQ', '{}'),
        ($excludedSecurityId, true, 8, 3900, 4100, $excludedSymbol, 'Universe outside range', NULL, 'NYSE', '{}'),
        ($universeOnlySecurityId, true, 9, 5000, 6000, $universeOnlySymbol, 'Universe only', NULL, 'NYSE', '{}')`,
      {
        securityId,
        excludedSecurityId,
        universeOnlySecurityId,
        universeSymbol: `${symbol}-U`,
        excludedSymbol: `${symbol}X-U`,
        universeOnlySymbol: `${symbol}O-U`
      }
    );

    await writer.run(
      `INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES (
        1, 'research-seed', 1, $securityId, 7,
        1900, 1980, 1995,
        '{"internalTransport":"must-not-project"}', $symbol, 'Included security', 'NYSE', 'provider-time-1',
        $price, 1.25, 12345, $rawData
      )`,
      {
        securityId,
        symbol,
        price,
        rawData: JSON.stringify({ PaperId: securityId, ExtraSignal: extraSignal, MissingTypedIdea: 7 })
      }
    );

    await writer.run(
      `INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES (
        2, 'research-seed', 2, $securityId, 8,
        3900, 3980, 3995,
        '{"internalTransport":"must-not-project"}', $symbol, 'Excluded security', 'NYSE', 'provider-time-2',
        $price, 9.99, 99999, $rawData
      )`,
      {
        securityId: excludedSecurityId,
        symbol: `${symbol}X`,
        price: price + 50,
        rawData: JSON.stringify({ PaperId: excludedSecurityId, ExtraSignal: "outside-range" })
      }
    );
  } finally {
    await database.close();
  }
}

function relation(manifest, name) {
  const found = manifest.relations.find((entry) => entry.relation === name);
  assert.ok(found, `missing ${name} manifest relation`);
  return found;
}

function field(manifestRelation, column) {
  const found = manifestRelation.fields.find((entry) => entry.column === column);
  assert.ok(found, `missing ${manifestRelation.relation}.${column} manifest field`);
  return found;
}

test("TREE 11.3 base research projection isolates two authorized sources and exposes only research relations", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-sql-"));
  const archiveDir = path.join(dataDir, "archive");
  const activePath = path.join(dataDir, "market-flow-us.duckdb");
  const archivePath = path.join(archiveDir, ARCHIVE_NAME);
  let sandbox = null;

  try {
    await mkdir(archiveDir, { recursive: true });
    await seedSource(activePath, {
      securityId: "1001",
      excludedSecurityId: "1099",
      symbol: "ACT",
      price: 101.5,
      extraSignal: "active-extra"
    });
    await seedSource(archivePath, {
      securityId: "2001",
      excludedSecurityId: "2099",
      symbol: "ARC",
      price: 202.5,
      extraSignal: "archive-extra"
    });

    const activeFingerprint = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });
    const archiveFingerprint = await fingerprintResearchEvidenceSource({ dataDir, sourceId: ARCHIVE_ID });
    const activeBefore = await readFile(activePath);
    const archiveBefore = await readFile(archivePath);

    sandbox = await openDevelopmentResearchSqlSandbox({
      dataDir,
      partition: {
        partitionId: PARTITION_ID,
        evidencePlanId: PLAN_ID,
        role: "DEVELOPMENT",
        partition: {
          sourceIds: ["active", ARCHIVE_ID],
          range: { fromMs: 1500, toMs: 2500 },
          maxAuthorizedHorizonMs: 120_000
        }
      },
      inventory: {
        inventory: {
          sources: [
            {
              sourceId: "active",
              sourceFingerprint: activeFingerprint,
              classification: "ACTIVE",
              schemaVersion: 4
            },
            {
              sourceId: ARCHIVE_ID,
              sourceFingerprint: archiveFingerprint,
              classification: "ARCHIVE",
              schemaVersion: 4
            }
          ]
        }
      },
      now: () => 10_000
    });

    assert.equal(sandbox.dataSurfaceVersion, RESEARCH_DATA_SURFACE_VERSION);
    assert.equal(sandbox.phase, "DEVELOPMENT");

    const tables = await sandbox.execute(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `);
    assert.deepEqual(tables.rows, [
      ["research_cycles"],
      ["research_history"],
      ["research_partition"],
      ["research_sources"],
      ["research_universe"]
    ]);

    const history = await sandbox.execute(`
      SELECT source_id, security_id, Symbol, Price, cycle_committed_at_ms,
             json_extract_string(raw_data, '$.ExtraSignal') AS extra_signal
      FROM research_history
      ORDER BY source_id, security_id
    `);
    assert.deepEqual(history.rows, [
      ["active", "1001", "ACT", 101.5, "2000", "active-extra"],
      [ARCHIVE_ID, "2001", "ARC", 202.5, "2000", "archive-extra"]
    ]);

    const cycles = await sandbox.execute("SELECT * FROM research_cycles ORDER BY source_id, cycle_id");
    assert.equal(cycles.rowCount, 2);
    const cycleColumns = cycles.columns.map((column) => column.name);
    assert.equal(cycleColumns.includes("session_id"), false);
    assert.equal(cycleColumns.includes("chunks_json"), false);
    assert.equal(cycleColumns.includes("failure_phase"), false);
    assert.equal(cycleColumns.includes("error_json"), false);

    const historyColumns = (await sandbox.execute("SELECT * FROM research_history LIMIT 0"))
      .columns.map((column) => column.name);
    for (const forbidden of [
      "session_id",
      "chunk_index",
      "cycle_started_at_ms",
      "chunk_received_at_ms",
      "source_metadata_json"
    ]) {
      assert.equal(historyColumns.includes(forbidden), false, `${forbidden} must not be projected`);
    }

    const universe = await sandbox.execute(`
      SELECT source_id, security_id, is_current, universe_revision,
             first_seen_at_ms, last_seen_at_ms, Symbol, PaperNameEng, PaperNameHeb, ExchangeName
      FROM research_universe
      ORDER BY source_id, security_id
    `);
    assert.deepEqual(universe.rows, [
      ["active", "1001", false, "7", "100", "9000", "ACT-U", "Universe included", "Universe Heb", "NASDAQ"],
      [ARCHIVE_ID, "2001", false, "7", "100", "9000", "ARC-U", "Universe included", "Universe Heb", "NASDAQ"]
    ]);

    const sources = await sandbox.execute(`
      SELECT source_id, source_class, complete_cycle_count, first_complete_at_ms, last_complete_at_ms
      FROM research_sources
      ORDER BY source_id
    `);
    assert.deepEqual(sources.rows, [
      ["active", "ACTIVE", "1", "2000", "2000"],
      [ARCHIVE_ID, "ARCHIVE", "1", "2000", "2000"]
    ]);

    const partition = await sandbox.execute(`
      SELECT partition_id, partition_role, evidence_plan_id, source_id,
             allowed_from_ms, allowed_to_ms, max_authorized_horizon_ms
      FROM research_partition
      ORDER BY source_id
    `);
    assert.deepEqual(partition.rows, [
      [PARTITION_ID, "DEVELOPMENT", PLAN_ID, "active", "1500", "2500", "120000"],
      [PARTITION_ID, "DEVELOPMENT", PLAN_ID, ARCHIVE_ID, "1500", "2500", "120000"]
    ]);

    await assert.rejects(() => sandbox.execute("SELECT * FROM history"));
    await assert.rejects(() => sandbox.execute("SELECT * FROM latest"));
    await assert.rejects(() => sandbox.execute("SELECT * FROM sessions"));
    await assert.rejects(() => sandbox.execute("SELECT * FROM evidence.main.history"));

    const manifest = sandbox.describeSchema();
    assert.equal(manifest, describeResearchSqlSchema());
    assert.equal(manifest.data_surface_version, RESEARCH_DATA_SURFACE_VERSION);
    assert.deepEqual(
      manifest.relations.map((entry) => entry.relation),
      [
        "research_sources",
        "research_partition",
        "research_cycles",
        "research_history",
        "research_universe"
      ]
    );

    const historyManifest = relation(manifest, "research_history");
    assert.equal(field(historyManifest, "Price").origin, "source_typed");
    assert.equal(field(historyManifest, "Price").decision_time_eligible, true);
    assert.equal(field(historyManifest, "Price").future_dependent, false);
    assert.equal(field(historyManifest, "raw_data").origin, "source_raw");
    assert.equal(field(historyManifest, "raw_data").decision_time_eligible, true);
    assert.match(field(historyManifest, "raw_data").caveats.join(" "), /provider-shaped JSON/iu);
    assert.equal(field(historyManifest, "cycle_committed_at_ms").origin, "authority_derived");
    assert.equal(field(historyManifest, "cycle_committed_at_ms").research_only, true);

    const universeManifest = relation(manifest, "research_universe");
    assert.match(universeManifest.meaning, /source-persisted/iu);
    assert.equal(field(universeManifest, "is_current").origin, "source_typed");
    assert.equal(field(universeManifest, "is_current").decision_time_eligible, false);
    assert.equal(field(universeManifest, "is_current").future_dependent, true);
    assert.match(field(universeManifest, "is_current").caveats.join(" "), /not exact historical membership/iu);
    assert.equal(field(universeManifest, "last_seen_at_ms").origin, "source_typed");
    assert.equal(field(universeManifest, "last_seen_at_ms").future_dependent, true);
    assert.equal(field(universeManifest, "Symbol").future_dependent, true);

    const manifestText = JSON.stringify(manifest);
    for (const forbidden of ["session_id", "source_metadata_json", "filesystem", "cookie", "authorization", "raw_source"] ) {
      assert.equal(manifestText.includes(forbidden), false, `manifest leaked ${forbidden}`);
    }

    await sandbox.close();
    sandbox = null;

    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" }),
      activeFingerprint
    );
    assert.equal(
      await fingerprintResearchEvidenceSource({ dataDir, sourceId: ARCHIVE_ID }),
      archiveFingerprint
    );
    assert.deepEqual(await readFile(activePath), activeBefore);
    assert.deepEqual(await readFile(archivePath), archiveBefore);
  } finally {
    if (sandbox) await sandbox.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("TREE 11.3 base research projection fails closed outside DEVELOPMENT", async () => {
  for (const role of ["VALIDATION", "SEALED_HOLDOUT"]) {
    await assert.rejects(
      openDevelopmentResearchSqlSandbox({
        dataDir: "server-owned-data",
        partition: {
          partitionId: PARTITION_ID,
          evidencePlanId: PLAN_ID,
          role,
          partition: { sourceIds: ["active"] }
        },
        inventory: {
          inventory: {
            sources: [{
              sourceId: "active",
              sourceFingerprint: "a".repeat(64),
              classification: "ACTIVE",
              schemaVersion: 4
            }]
          }
        }
      }),
      /DEVELOPMENT/u
    );
  }
});
