import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import {
  AI_PACK_PROMPT_MAX_BYTES,
  createDemoBuyAiPackExporter
} from "../../local-service/exports/demo-buy-ai-pack.js";
import { createDemoBuyReads } from "../../local-service/reads/demo-buy-reads.js";
import { createScannerAuthority } from "../../local-service/scanner/scanner.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import {
  GENERAL_SCANNER_QUERIES,
  distribution,
  measure,
  roundMs,
  workloadMode
} from "./us-workload-support.mjs";

const REPORT_PATH = process.env.MARKET_FLOW_US_DEMO_BUY_REPORT
  ?? path.resolve("test-results/workload/demo-buy-evaluator.json");
const EPOCH_MS = Date.UTC(2026, 9, 5, 13, 30, 0);
const CADENCE_MS = 3000;
const SECURITY_COUNT = 64;
const CYCLE_COUNT = 240;
const CAPTURE_CYCLE_ID = 20;
const CAPTURE_ITEM_COUNT = 50;
const CAPTURED_AT_MS = EPOCH_MS + (CAPTURE_CYCLE_ID * CADENCE_MS);

async function seedAuthority(connection) {
  const scannerContext = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" }
    ],
    rows: Array.from({ length: SECURITY_COUNT }, (_, securityIndex) => [
      String(1000000 + securityIndex),
      SECURITY_COUNT - securityIndex
    ])
  });

  await connection.run(`
    INSERT INTO cycles (
      cycle_id,
      session_id,
      universe_revision,
      status,
      started_at_ms,
      completed_at_ms,
      committed_at_ms,
      duration_ms
    )
    SELECT
      cycle_id,
      'demo-buy-workload',
      1,
      'complete',
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 100,
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}),
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}) + 1,
      100
    FROM range(1, ${CYCLE_COUNT + 1}) AS cycles(cycle_id)
  `);

  await connection.run(`
    INSERT INTO history (
      cycle_id,
      session_id,
      universe_revision,
      security_id,
      chunk_index,
      cycle_started_at_ms,
      chunk_received_at_ms,
      collected_at_ms,
      Symbol,
      PaperNameEng,
      ExchangeName,
      Price,
      raw_data
    )
    SELECT
      cycle_id,
      'demo-buy-workload',
      1,
      CAST(1000000 + security_index AS VARCHAR),
      0,
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 100,
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}) - 10,
      ${EPOCH_MS} + (cycle_id * ${CADENCE_MS}),
      'SYM' || CAST(security_index AS VARCHAR),
      'Synthetic ' || CAST(security_index AS VARCHAR),
      'NASDAQ',
      100.0 + security_index + (cycle_id * 0.01),
      CAST('{}' AS JSON)
    FROM range(1, ${CYCLE_COUNT + 1}) AS cycles(cycle_id)
    CROSS JOIN range(0, ${SECURITY_COUNT}) AS securities(security_index)
  `);

  await connection.run(`
    INSERT INTO latest
    SELECT *
    FROM history
    WHERE cycle_id = ${CYCLE_COUNT}
  `);

  await connection.run(
    `INSERT INTO demo_buy_captures (
      capture_id,
      captured_at_ms,
      source_query_id,
      source_query_name,
      source_query_sql,
      source_interval_ms,
      source_result_started_at_ms,
      source_result_completed_at_ms,
      source_result_row_count,
      source_result_context_json,
      selection_mode,
      is_automatic,
      top_x
    ) VALUES (
      1,
      ${CAPTURED_AT_MS},
      'workload:demo-buy',
      'Bounded Demo Buy workload',
      'SELECT security_id, score FROM latest ORDER BY score DESC, security_id',
      ${CADENCE_MS},
      ${CAPTURED_AT_MS - 200},
      ${CAPTURED_AT_MS - 100},
      ${SECURITY_COUNT},
      $sourceResultContextJson,
      'all',
      false,
      NULL
    )`,
    { sourceResultContextJson: JSON.stringify(scannerContext) }
  );

  await connection.run(`
    INSERT INTO demo_buy_items (
      capture_id,
      result_rank,
      security_id,
      buy_cycle_id
    )
    SELECT
      1,
      security_index + 1,
      CAST(1000000 + security_index AS VARCHAR),
      ${CAPTURE_CYCLE_ID}
    FROM range(0, ${CAPTURE_ITEM_COUNT}) AS items(security_index)
  `);
}

test("bounded active-day Demo Buy evaluator and AI export timing stay set-wise and Scanner-compatible", { timeout: 120000 }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-demo-buy-workload-"));
  const dbPath = path.join(tempDir, "demo-buy-workload.duckdb");
  const exportRoot = path.join(tempDir, "exports", "ai-investigations");
  const database = await openMarketFlowUsDatabase({
    dbPath,
    productVersion: "market-flow-us-demo-buy-workload"
  });
  const report = {
    schemaVersion: 1,
    product: "Market Flow US",
    profileMode: workloadMode(),
    result: "running",
    shape: {
      securities: SECURITY_COUNT,
      cycles: CYCLE_COUNT,
      historyRows: SECURITY_COUNT * CYCLE_COUNT,
      captureItems: CAPTURE_ITEM_COUNT,
      horizonTargetsPerPage: CAPTURE_ITEM_COUNT * 10,
      aiPackTargetBeforeRows: CAPTURE_CYCLE_ID,
      aiPackTargetAfterRows: 200,
      logicalMinutes: roundMs((CYCLE_COUNT * CADENCE_MS) / 60000)
    },
    seedMs: null,
    pageLatencyMs: null,
    observationLatencyMs: null,
    aiPackExportLatencyMs: null,
    scannerCoexistenceMs: null,
    wallClockMs: null,
    error: null
  };
  const started = performance.now();
  let failure = null;

  try {
    const seedSamples = [];
    await measure(seedSamples, () => seedAuthority(database.writerConnection));
    report.seedMs = distribution(seedSamples);

    const reads = createDemoBuyReads({
      connection: database.viewerReadConnection
    });
    const scanner = await createScannerAuthority({
      connection: database.scannerConnection
    });
    const exporter = createDemoBuyAiPackExporter({
      connection: database.viewerReadConnection,
      demoBuyReads: reads,
      exportRoot,
      productVersion: "market-flow-us-demo-buy-workload"
    });

    const warmPage = await reads.page(null);
    assert.equal(warmPage.items.length, CAPTURE_ITEM_COUNT);
    assert.equal(warmPage.hasMore, false);
    assert.equal(warmPage.nextCursor, null);
    assert.ok(warmPage.items.every((item) => item.horizons.length === 10));
    assert.ok(warmPage.items.every((item) => {
      const tenMinute = item.horizons.find((horizon) => horizon.horizonMs === 600000);
      return tenMinute?.unavailableReason === null && tenMinute?.observedAtMs !== null;
    }));

    const pageSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const page = await measure(pageSamples, () => reads.page(null));
      assert.equal(page.items.length, CAPTURE_ITEM_COUNT);
    }
    report.pageLatencyMs = distribution(pageSamples);

    const observationSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const observation = await measure(observationSamples, () =>
        reads.observationGet(1, "1000000"));
      assert.equal(observation.capture.captureId, 1);
      assert.equal(observation.securityId, "1000000");
      assert.equal(observation.horizons.length, 10);
    }
    report.observationLatencyMs = distribution(observationSamples);

    const warmPack = await exporter.create(1, "1000000");
    assert.equal(warmPack.outcomeEvidenceStatus, "COMPLETE_OUTCOME");
    assert.equal(warmPack.targetInScannerContext, true);
    assert.equal(warmPack.recordCounts.targetBefore, CAPTURE_CYCLE_ID);
    assert.equal(warmPack.recordCounts.targetAfter, 200);
    assert.ok(Buffer.byteLength(warmPack.promptText, "utf8") <= AI_PACK_PROMPT_MAX_BYTES);

    const exportSamples = [];
    for (let index = 0; index < 3; index += 1) {
      const pack = await measure(exportSamples, () => exporter.create(1, "1000000"));
      assert.equal(pack.fileCount, 10);
      assert.equal(pack.outcomeEvidenceStatus, "COMPLETE_OUTCOME");
    }
    report.aiPackExportLatencyMs = distribution(exportSamples);

    const scannerSamples = [];
    const scannerResult = await measure(scannerSamples, () =>
      scanner.execute(GENERAL_SCANNER_QUERIES.windowRank));
    assert.equal(scannerResult.rowCount, 10);
    report.scannerCoexistenceMs = distribution(scannerSamples);

    const afterScanner = await reads.page(null);
    assert.equal(afterScanner.items.length, CAPTURE_ITEM_COUNT);
    assert.equal(afterScanner.items[0].capture.captureId, 1);

    for (const metric of [
      report.pageLatencyMs,
      report.observationLatencyMs,
      report.aiPackExportLatencyMs
    ]) {
      assert.ok(metric.samples >= 3);
      assert.ok(Number.isFinite(metric.maxMs));
      assert.ok(metric.maxMs < 10000, "bounded Demo Buy/AI operation exceeded catastrophic hosted-CI guard");
    }

    report.result = "pass";
  } catch (error) {
    failure = error;
    report.result = "fail";
    report.error = {
      name: error instanceof Error ? error.name : "Error",
      message: "Bounded Demo Buy/AI workload failed."
    };
  } finally {
    report.wallClockMs = roundMs(performance.now() - started);
    await database.close();
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rm(tempDir, { recursive: true, force: true });
  }

  if (failure) throw failure;
});
