import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { fingerprintResearchEvidenceSource } from "../../research-server/source-fingerprint.js";
import { selectTargetEvidenceSources } from "../../scripts/run-research-target-evidence.mjs";

async function seedExistingEvidence(dataDir) {
  const database = await openMarketFlowUsDatabase({
    dbPath: path.join(dataDir, "market-flow-us.duckdb"),
    productVersion: "research-target-evidence-service-v1",
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
        (1, 'target-existing', 1, 'complete', 1900, 1990, 2000, 90, 0, 0, 0, 0, 0, 0, 1, '[]', NULL, NULL),
        (2, 'target-existing', 1, 'complete', 11900, 11990, 12000, 90, 0, 0, 0, 0, 0, 0, 1, '[]', NULL, NULL),
        (3, 'target-existing', 1, 'complete', 21900, 21990, 22000, 90, 0, 0, 0, 0, 0, 0, 1, '[]', NULL, NULL)
    `);
  } finally {
    await database.close();
  }
}

test("TREE 11.8 target-machine source selection consumes existing evidence and never fabricates fallback data", { timeout: 5000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-target-evidence-service-"));
  const dataDir = path.join(root, "data");
  const emptyDataDir = path.join(root, "empty-data");
  await mkdir(dataDir, { recursive: true });
  await mkdir(emptyDataDir, { recursive: true });

  try {
    await seedExistingEvidence(dataDir);
    const fingerprintBefore = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });

    const selection = await selectTargetEvidenceSources({ dataDir });
    assert.equal(selection.catalogCount, 1);
    assert.equal(selection.selected.length, 1);
    assert.deepEqual(selection.selected[0], {
      sourceId: "active",
      kind: "active",
      schemaVersion: 4,
      latestAtMs: 22000,
      t0AtMs: 12000
    });
    assert.equal(JSON.stringify(selection).includes(root), false, "selection must never expose an absolute source path");

    const fingerprintAfter = await fingerprintResearchEvidenceSource({ dataDir, sourceId: "active" });
    assert.equal(fingerprintAfter, fingerprintBefore, "read-only source selection must preserve exact source bytes");

    await assert.rejects(
      selectTargetEvidenceSources({ dataDir: emptyDataDir }),
      (error) => error?.code === "RESEARCH_TARGET_EVIDENCE_NO_USABLE_MARKET_EVIDENCE"
    );
    assert.deepEqual(await readdir(emptyDataDir), [], "target workload must never seed synthetic market evidence");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
