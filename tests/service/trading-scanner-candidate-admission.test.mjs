import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { openTradingLedger } from "../../trading-server/ledger.js";

const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";
const CREATED_AT_MS = 5_000;
const ADMITTED_AT_MS = 4_900;

function scannerSource({
  generation = 7,
  sql = "SELECT security_id, last, score FROM latest ORDER BY score DESC",
  rows = [
    ["NASDAQ:MSFT", 420.25, 0.91],
    ["NASDAQ:AAPL", 221.5, 0.87]
  ]
} = {}) {
  return {
    context: {
      generation,
      queryId: "query-momentum",
      queryName: "Momentum",
      sql,
      intervalMs: 5_000,
      startedAtMs: 4_600,
      completedAtMs: 4_800
    },
    result: {
      columns: [
        { name: "security_id", type: "VARCHAR" },
        { name: "last", type: "DOUBLE" },
        { name: "score", type: "DOUBLE" }
      ],
      rows,
      rowCount: rows.length
    }
  };
}

async function bootstrapLedger(dbPath, now = () => CREATED_AT_MS) {
  const ledger = await openTradingLedger({
    dbPath,
    now,
    policyVersionIdFactory: () => POLICY_ID,
    tradingRunIdFactory: () => RUN_ID,
    tradeEpisodeIdFactory: () => EPISODE_ID
  });
  await ledger.createPolicyVersion({
    policy: {
      entry: { source: "scanner" },
      exit: { maxHoldMs: 120_000 }
    }
  });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    environmentSnapshot: { productVersion: "0.1.0", source: "synthetic" },
    riskEnvelope: { maxOpenEpisodes: 1, maxNotionalUsd: 250 }
  });
  return ledger;
}

test("TREE 12.2 Scanner admission durably preserves the exact admitted generation/query/rank across later generations and reopen", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-scanner-admission-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await bootstrapLedger(dbPath);
    const source = scannerSource();

    const episode = await admitScannerCandidate({
      ledger,
      tradingRunId: RUN_ID,
      policyVersionId: POLICY_ID,
      ...source,
      resultRank: 2,
      admittedAtMs: ADMITTED_AT_MS
    });

    assert.equal(episode.tradeEpisodeId, EPISODE_ID);
    assert.equal(episode.candidateKey, "NASDAQ:AAPL");
    assert.equal(episode.candidateProvenance.securityId, "NASDAQ:AAPL");
    assert.equal(episode.candidateProvenance.scannerGeneration.generation, 7);
    assert.equal(episode.candidateProvenance.sourceQuery.queryId, "query-momentum");
    assert.equal(episode.candidateProvenance.sourceQuery.name, "Momentum");
    assert.equal(
      episode.candidateProvenance.sourceQuery.sql,
      "SELECT security_id, last, score FROM latest ORDER BY score DESC"
    );
    assert.equal(episode.candidateProvenance.resultRank, 2);
    assert.equal(episode.candidateProvenance.rowEvidence.resultRank, 2);
    assert.equal(episode.candidateProvenance.rowEvidence.values[0], "NASDAQ:AAPL");
    assert.equal(episode.candidateProvenance.admittedAtMs, ADMITTED_AT_MS);

    const admittedSnapshot = structuredClone(episode.candidateProvenance);

    source.context.generation = 8;
    source.context.queryName = "Edited after admission";
    source.context.sql = "SELECT security_id FROM latest WHERE 1 = 0";
    source.result.rows[1][0] = "NASDAQ:NVDA";
    source.result.rows[1][1] = 999;

    const laterGeneration = scannerSource({
      generation: 8,
      sql: "SELECT security_id, last, score FROM latest ORDER BY last DESC",
      rows: [["NASDAQ:NVDA", 999, 1]]
    });
    assert.equal(laterGeneration.context.generation, 8);

    const beforeClose = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.deepEqual(beforeClose.episode.candidateProvenance, admittedSnapshot);
    assert.equal(beforeClose.episode.candidateKey, "NASDAQ:AAPL");

    await ledger.close();
    ledger = null;

    ledger = await openTradingLedger({ dbPath, now: () => CREATED_AT_MS + 1_000 });
    const reopened = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);

    assert.equal(reopened.episode.candidateKey, "NASDAQ:AAPL");
    assert.deepEqual(reopened.episode.candidateProvenance, admittedSnapshot);
    assert.equal(reopened.episode.candidateProvenance.scannerGeneration.generation, 7);
    assert.equal(reopened.episode.candidateProvenance.resultRank, 2);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.2 Scanner admission fails before ledger mutation when canonical identity is ambiguous", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-scanner-admission-identity-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await bootstrapLedger(dbPath);
    const source = scannerSource();
    source.result.columns = [
      { name: "securityId", type: "VARCHAR" },
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" }
    ];
    source.result.rows = [["NASDAQ:AAPL", "NASDAQ:AAPL", 1]];
    source.result.rowCount = 1;

    await assert.rejects(
      admitScannerCandidate({
        ledger,
        tradingRunId: RUN_ID,
        policyVersionId: POLICY_ID,
        ...source,
        resultRank: 1,
        admittedAtMs: ADMITTED_AT_MS
      }),
      /identity|recognized/iu
    );

    assert.deepEqual(await ledger.listTradeEpisodes(RUN_ID), []);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
