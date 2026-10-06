import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { createDemoBuyAiPackExporter } from "../../local-service/exports/demo-buy-ai-pack.js";
import { createDemoBuyReads } from "../../local-service/reads/demo-buy-reads.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";

async function seedTarget(connection) {
  const context = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" }
    ],
    rows: [["42", 9.5]]
  });
  const reducedContext = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" }
    ],
    rows: Array.from({ length: 51 }, (_, index) => [
      index === 50 ? "99" : String(1000 + index),
      100 - index
    ])
  });

  await connection.run(
    `INSERT INTO history (
      cycle_id, session_id, universe_revision, security_id,
      chunk_index, cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
      source_metadata_json, Symbol, Price, raw_data
    ) VALUES
      (1, 'session-canary', 1, '42', 0, 900, 950, 1000, $sourceMetadata, 'PACK', 100, $rawData42),
      (1, 'session-canary', 1, '99', 0, 900, 950, 1000, $sourceMetadata, 'LATE', 50, $rawData99)`,
    {
      sourceMetadata: JSON.stringify({ secret: "OPERATIONAL_DIRECT_CANARY" }),
      rawData42: JSON.stringify({ PaperId: 42, Symbol: "PACK", Price: 100 }),
      rawData99: JSON.stringify({ PaperId: 99, Symbol: "LATE", Price: 50 })
    }
  );

  await connection.run(
    `INSERT INTO demo_buy_captures VALUES
      (1, 1100, NULL, 'Pack', 'SELECT security_id, 9.5 AS score FROM latest',
       3000, 1000, 1050, 1, $context,
       'all', false, NULL),
      (2, 1200, NULL, 'Reduced', 'SELECT security_id, score FROM latest ORDER BY score DESC, security_id',
       3000, 1100, 1150, 51, $reducedContext,
       'all', false, NULL)`,
    {
      context: JSON.stringify(context),
      reducedContext: JSON.stringify(reducedContext)
    }
  );
  await connection.run(
    `INSERT INTO demo_buy_items VALUES
      (1, 1, '42', 1),
      (2, 51, '99', 1)`
  );
}

async function withDatabase(run) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-pack-exporter-"));
  const dbPath = path.join(tempDir, "fixture.duckdb");
  const exportRoot = path.join(tempDir, "exports", "ai-investigations");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "test-version",
    now: () => 1
  });

  try {
    await seedTarget(database.writerConnection);
    await run({ database, exportRoot });
  } finally {
    await database.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("direct AI pack exporter executes its SQL against real schema v4 and publishes a readable pack", async () => {
  await withDatabase(async ({ database, exportRoot }) => {
    const demoBuyReads = createDemoBuyReads({ connection: database.viewerReadConnection });
    const exporter = createDemoBuyAiPackExporter({
      connection: database.viewerReadConnection,
      demoBuyReads,
      exportRoot,
      productVersion: "test-version",
      now: () => 1300,
      createSuffix: () => "direct-proof"
    });

    const result = await exporter.create(1, "42");
    assert.equal(result.outcomeEvidenceStatus, "PARTIAL_OUTCOME");
    assert.equal(result.targetInScannerContext, true);
    assert.equal(result.fileCount, 10);

    const finalName = result.exportPathRelative.split("/").at(-1);
    const baseline = await readFile(path.join(exportRoot, finalName, "BASELINE.json"), "utf8");
    assert.equal(baseline.includes("session-canary"), false);
    assert.equal(baseline.includes("OPERATIONAL_DIRECT_CANARY"), false);
    assert.equal(JSON.parse(baseline).security_id, "42");
  });
});

test("position greater than 50 remains investigable without fabricated Scanner peer context", async () => {
  await withDatabase(async ({ database, exportRoot }) => {
    const demoBuyReads = createDemoBuyReads({ connection: database.viewerReadConnection });
    const exporter = createDemoBuyAiPackExporter({
      connection: database.viewerReadConnection,
      demoBuyReads,
      exportRoot,
      productVersion: "test-version",
      now: () => 1400,
      createSuffix: () => "position-51"
    });

    const result = await exporter.create(2, "99");
    assert.equal(result.targetInScannerContext, false);
    assert.equal(result.recordCounts.scannerContextRows, 50);
    assert.match(result.promptText, /targetInScannerContext=false/);

    const finalName = result.exportPathRelative.split("/").at(-1);
    const context = JSON.parse(
      await readFile(path.join(exportRoot, finalName, "SCANNER_CONTEXT.json"), "utf8")
    );
    assert.equal(context.retainedRowCount, 50);
    assert.equal(JSON.stringify(context).includes('"99"'), false);
  });
});

test("regeneration never overwrites an existing successful pack when an internal name collides", async () => {
  await withDatabase(async ({ database, exportRoot }) => {
    const demoBuyReads = createDemoBuyReads({ connection: database.viewerReadConnection });
    const suffixes = ["same", "same", "next"];
    const exporter = createDemoBuyAiPackExporter({
      connection: database.viewerReadConnection,
      demoBuyReads,
      exportRoot,
      productVersion: "test-version",
      now: () => 1500,
      createSuffix: () => suffixes.shift() ?? "fallback"
    });

    const first = await exporter.create(1, "42");
    const firstName = first.exportPathRelative.split("/").at(-1);
    const firstQueryPath = path.join(exportRoot, firstName, "QUERY.sql");
    const firstQuery = await readFile(firstQueryPath, "utf8");

    const second = await exporter.create(1, "42");
    assert.notEqual(second.exportPathRelative, first.exportPathRelative);
    assert.equal(await readFile(firstQueryPath, "utf8"), firstQuery);
    assert.match(second.exportPathRelative, /-next$/);
  });
});
