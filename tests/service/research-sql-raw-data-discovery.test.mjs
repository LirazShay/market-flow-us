import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  createResearchRawDataDiscovery,
  RAW_DATA_DISCOVERY_LIMITS
} from "../../research-server/raw-data-discovery.js";
import { openDevelopmentResearchSqlSandbox } from "../../research-server/research-sql.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";

const PARTITION_ID = "part_33333333-3333-4333-8333-333333333333";
const PLAN_ID = "plan_33333333-3333-4333-8333-333333333333";

async function seedRawDiscoverySource(dbPath) {
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "research-raw-discovery-v4",
    now: () => 1_700_000_000_000
  });
  const writer = database.writerConnection;
  const oversizeKey = "k".repeat(RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters + 1);

  try {
    await writer.run(`
      INSERT INTO cycles (
        cycle_id, session_id, universe_revision, status, started_at_ms,
        completed_at_ms, committed_at_ms, duration_ms, requested, received,
        unique_count, missing, duplicates, unexpected, chunk_count, chunks_json,
        failure_phase, error_json
      ) VALUES (
        1, 'raw-discovery-seed', 1, 'complete', 1900,
        1990, 2000, 90, 3, 3,
        3, 0, 0, 0, 1, '[]', NULL, NULL
      )
    `);

    const rows = [
      {
        securityId: "1001",
        collectedAtMs: 1991,
        price: 101.5,
        rawData: {
          PaperId: "1001",
          Price: 101.5,
          Signal: "alpha",
          Mixed: 7,
          Nullable: null,
          LongIdea: "x".repeat(RAW_DATA_DISCOVERY_LIMITS.maxSampleCharacters + 80),
          [oversizeKey]: "hidden"
        }
      },
      {
        securityId: "1002",
        collectedAtMs: 1992,
        price: 102,
        rawData: {
          PaperId: "1002",
          Price: 102,
          Signal: "beta",
          Mixed: "seven"
        }
      },
      {
        securityId: "1003",
        collectedAtMs: 1993,
        price: null,
        rawData: {
          PaperId: "1003",
          Price: null,
          Signal: null
        }
      }
    ];

    for (const row of rows) {
      await writer.run(
        `INSERT INTO history (
          cycle_id, session_id, universe_revision, security_id, chunk_index,
          cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
          source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
          Price, ChangePercent, DailyVolume, raw_data
        ) VALUES (
          1, 'raw-discovery-seed', 1, $securityId, 0,
          1900, 1980, $collectedAtMs,
          '{}', $symbol, 'Raw discovery fixture', 'NYSE', 'provider-time',
          $price, 1.25, 12345, $rawData
        )`,
        {
          securityId: row.securityId,
          collectedAtMs: row.collectedAtMs,
          symbol: `R${row.securityId}`,
          price: row.price,
          rawData: JSON.stringify(row.rawData)
        }
      );
    }
  } finally {
    await database.close();
  }
}

function keyByName(result, key) {
  const found = result.keys.find((entry) => entry.key === key);
  assert.ok(found, `missing raw-data discovery key ${key}`);
  return found;
}

function typeCount(profile, type) {
  return profile.typeCounts.find((entry) => entry.type === type)?.count ?? 0;
}

test("TREE 11.3 raw-data discovery is bounded and distinguishes missing, null, types and typed projection", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-research-raw-"));
  const activePath = path.join(dataDir, "market-flow-us.duckdb");
  let sandbox = null;

  try {
    await seedRawDiscoverySource(activePath);
    const sourceFingerprint = await fingerprintResearchEvidenceSource({
      dataDir,
      sourceId: "active"
    });

    sandbox = await openDevelopmentResearchSqlSandbox({
      dataDir,
      partition: {
        partitionId: PARTITION_ID,
        evidencePlanId: PLAN_ID,
        role: "DEVELOPMENT",
        partition: {
          sourceIds: ["active"],
          range: { fromMs: 1500, toMs: 2500 },
          maxAuthorizedHorizonMs: 120_000
        }
      },
      inventory: {
        inventory: {
          sources: [{
            sourceId: "active",
            sourceFingerprint,
            classification: "ACTIVE",
            schemaVersion: 4
          }]
        }
      },
      now: () => 10_000
    });

    const discovery = createResearchRawDataDiscovery({ execute: sandbox.execute });
    const keys = await discovery.listRawDataKeys({ limit: 10 });

    assert.equal(keys.scope, "research_history.raw_data:top_level");
    assert.equal(keys.totalRows, 3);
    assert.equal(keys.excludedKeyOccurrences, 1);
    assert.equal(keys.truncated, false);
    assert.deepEqual(
      keys.keys.slice(0, 4).map((entry) => [entry.key, entry.presentRows]),
      [
        ["PaperId", 3],
        ["Price", 3],
        ["Signal", 3],
        ["Mixed", 2]
      ]
    );
    assert.equal(keyByName(keys, "Signal").coverageFraction, 1);
    assert.equal(keyByName(keys, "Mixed").coverageFraction, 2 / 3);
    assert.equal(keyByName(keys, "Nullable").coverageFraction, 1 / 3);
    assert.deepEqual(
      keyByName(keys, "Mixed").typeCounts,
      [
        { type: "UBIGINT", count: 1 },
        { type: "VARCHAR", count: 1 }
      ]
    );

    const signal = await discovery.profileRawDataKey({ key: "Signal", sampleLimit: 3 });
    assert.equal(signal.totalRows, 3);
    assert.equal(signal.presentRows, 3);
    assert.equal(signal.missingRows, 0);
    assert.equal(signal.nullRows, 1);
    assert.equal(typeCount(signal, "NULL"), 1);
    assert.equal(typeCount(signal, "VARCHAR"), 2);
    assert.equal(signal.typedComparison, null);
    assert.deepEqual(
      signal.samples.map((sample) => [sample.securityId, sample.rawType, sample.valueJson]),
      [
        ["1001", "VARCHAR", '"alpha"'],
        ["1002", "VARCHAR", '"beta"'],
        ["1003", "NULL", "null"]
      ]
    );

    const mixed = await discovery.profileRawDataKey({ key: "Mixed", sampleLimit: 0 });
    assert.equal(mixed.presentRows, 2);
    assert.equal(mixed.missingRows, 1);
    assert.equal(mixed.nullRows, 0);
    assert.equal(mixed.samples.length, 0);

    const price = await discovery.profileRawDataKey({ key: "Price", sampleLimit: 1 });
    assert.deepEqual(price.typedComparison, {
      column: "Price",
      nonNullRows: 2,
      nullRows: 1
    });
    assert.equal(price.presentRows, 3);
    assert.equal(price.nullRows, 1);
    assert.equal(typeCount(price, "DOUBLE"), 1);
    assert.equal(typeCount(price, "UBIGINT"), 1);
    assert.equal(typeCount(price, "NULL"), 1);

    const missing = await discovery.profileRawDataKey({ key: "DoesNotExist", sampleLimit: 5 });
    assert.equal(missing.presentRows, 0);
    assert.equal(missing.missingRows, 3);
    assert.equal(missing.coverageFraction, 0);
    assert.deepEqual(missing.typeCounts, []);
    assert.deepEqual(missing.samples, []);

    const longValue = await discovery.profileRawDataKey({ key: "LongIdea", sampleLimit: 1 });
    assert.equal(longValue.samples.length, 1);
    assert.equal(longValue.samples[0].valueJson.length, RAW_DATA_DISCOVERY_LIMITS.maxSampleCharacters);
    assert.equal(longValue.samples[0].valueTruncated, true);
    assert.equal(longValue.samples[0].sourceId, "active");
    assert.equal(longValue.samples[0].securityId, "1001");

    const limited = await discovery.listRawDataKeys({ limit: 2 });
    assert.equal(limited.keys.length, 2);
    assert.equal(limited.truncated, true);

    await assert.rejects(
      () => discovery.listRawDataKeys({ limit: RAW_DATA_DISCOVERY_LIMITS.maxKeys + 1 }),
      /raw-data key limit/u
    );
    await assert.rejects(
      () => discovery.profileRawDataKey({ key: "k".repeat(RAW_DATA_DISCOVERY_LIMITS.maxKeyCharacters + 1) }),
      /raw-data key/u
    );
    await assert.rejects(
      () => discovery.profileRawDataKey({ key: "Signal", sampleLimit: RAW_DATA_DISCOVERY_LIMITS.maxSamples + 1 }),
      /raw-data sample limit/u
    );
  } finally {
    if (sandbox) await sandbox.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
