import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";
import { runResearchTargetEvidenceWorkload } from "../../scripts/run-research-target-evidence.mjs";

async function seedExistingEvidence(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-target-evidence-service-v1",
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
        (1, 'target-existing', 1, 'complete', 1900, 1990, 2000, 90, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'target-existing', 1, 'complete', 11900, 11990, 12000, 90, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'target-existing', 1, 'complete', 21900, 21990, 22000, 90, 2, 2, 2, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
    await writer.run(`
      INSERT INTO history (
        cycle_id, session_id, universe_revision, security_id, chunk_index,
        cycle_started_at_ms, chunk_received_at_ms, collected_at_ms,
        source_metadata_json, Symbol, PaperNameEng, ExchangeName, TradeDateTime,
        Price, ChangePercent, DailyVolume, raw_data
      ) VALUES
        (1, 'target-existing', 1, '1001', 0, 1900, 1980, 1980, '{}', 'AAA', 'Alpha', 'NYSE', 'provider-1', 100, 0.1, 1000, '{"PaperId":"1001"}'),
        (1, 'target-existing', 1, '1002', 0, 1900, 1980, 1980, '{}', 'BBB', 'Beta', 'NASDAQ', 'provider-1', 50, 0.2, 2000, '{"PaperId":"1002"}'),
        (2, 'target-existing', 1, '1001', 0, 11900, 11980, 12000, '{}', 'AAA', 'Alpha', 'NYSE', 'provider-2', 101, 0.3, 1100, '{"PaperId":"1001"}'),
        (2, 'target-existing', 1, '1002', 0, 11900, 11980, 12000, '{}', 'BBB', 'Beta', 'NASDAQ', 'provider-2', 51, 0.4, 2100, '{"PaperId":"1002"}'),
        (3, 'target-existing', 1, '1001', 0, 21900, 21980, 22000, '{}', 'AAA', 'Alpha', 'NYSE', 'provider-3', 102, 0.5, 1200, '{"PaperId":"1001"}'),
        (3, 'target-existing', 1, '1002', 0, 21900, 21980, 22000, '{}', 'BBB', 'Beta', 'NASDAQ', 'provider-3', 52, 0.6, 2200, '{"PaperId":"1002"}')
    `);
  } finally {
    await database.close();
  }
}

test("TREE 11.8 target-machine workload consumes existing evidence and never fabricates fallback data", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-target-evidence-service-"));
  const dataDir = path.join(root, "data");
  const emptyDataDir = path.join(root, "empty-data");
  const reportPath = path.join(root, "reports", "target-evidence.json");
  const emptyReportPath = path.join(root, "reports", "target-evidence-empty.json");
  await mkdir(dataDir, { recursive: true });
  await mkdir(emptyDataDir, { recursive: true });

  try {
    await seedExistingEvidence(dataDir);
    const fingerprintBefore = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });

    const report = await runResearchTargetEvidenceWorkload({
      dataDir,
      reportPath,
      tempRoot: root
    });

    assert.equal(report.result, "pass", JSON.stringify(report.error));
    assert.equal(report.actualEvidence, true);
    assert.equal(report.desktopAcceptance, "STILL_REQUIRED");
    assert.equal(report.source.selectedSourceCount, 1);
    assert.deepEqual(report.source.selectedKinds, ["active"]);
    assert.equal(report.source.absolutePathsRedacted, true);
    assert.equal(report.source.sourceBytesEqual, true);
    assert.equal(report.sourceImmutability.fingerprintEqual, true);
    assert.equal(report.sourceImmutability.bytesEqual, true);
    assert.equal(report.measurements.duplicateSubmissions, 16);
    assert.equal(report.measurements.uniqueExperimentJobs, 1);
    assert.equal(report.measurements.uniqueExperiments, 1);
    assert.ok(report.measurements.wallClockMs > 0);
    assert.ok(report.measurements.experimentMs > 0);
    assert.ok(report.measurements.researchSqlMs > 0);
    assert.ok(report.measurements.ledgerBytesBeforeReopen > 0);
    assert.ok(report.measurements.tempDirBytes > 0);
    assert.ok(report.measurements.experimentResultRows >= 1);
    assert.ok(report.measurements.experimentResultBytes > 0);
    assert.equal(report.measurements.researchSqlResultRows, 1);
    assert.ok(report.measurements.researchSqlResultBytes > 0);
    assert.deepEqual(report.measurements.concurrency, {
      maxActiveJobs: 1,
      maxQueuedJobs: 4,
      maxActiveJobsPerRun: 1,
      maxAnalyticalReaders: 1,
      maxAnalyticalReadersPerRun: 1,
      maxAnalyticalReadersPerJob: 1
    });
    assert.equal(report.restart.durableExperimentResultRead, true);
    assert.equal(report.restart.durableResearchSqlResultRead, true);

    const fingerprintAfter = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });
    assert.equal(fingerprintAfter, fingerprintBefore);

    const persisted = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(persisted.result, "pass");
    const serialized = JSON.stringify(persisted);
    assert.equal(serialized.includes(dataDir), false);
    assert.equal(serialized.includes(root), false);

    const emptyReport = await runResearchTargetEvidenceWorkload({
      dataDir: emptyDataDir,
      reportPath: emptyReportPath,
      tempRoot: root
    });
    assert.equal(emptyReport.result, "fail");
    assert.deepEqual(emptyReport.error, {
      code: "RESEARCH_TARGET_EVIDENCE_NO_USABLE_MARKET_EVIDENCE"
    });
    assert.deepEqual(await readdir(emptyDataDir), [], "target workload must never seed synthetic market evidence");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
