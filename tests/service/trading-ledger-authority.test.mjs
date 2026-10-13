import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  TRADING_LEDGER_SCHEMA_VERSION,
  openTradingLedger
} from "../../trading-server/ledger.js";

const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const RUN_A_ID = "trun_11111111-1111-4111-8111-111111111111";
const RUN_B_ID = "trun_22222222-2222-4222-8222-222222222222";
const EPISODE_A_ID = "tep_11111111-1111-4111-8111-111111111111";
const EPISODE_B_ID = "tep_22222222-2222-4222-8222-222222222222";
const OBSERVATION_ID = "obs_11111111-1111-4111-8111-111111111111";
const DECISION_ID = "dec_11111111-1111-4111-8111-111111111111";
const ORDER_REFERENCE_ID = "ordref_11111111-1111-4111-8111-111111111111";
const POSITION_STATE_ID = "pos_11111111-1111-4111-8111-111111111111";
const OUTCOME_ID = "out_11111111-1111-4111-8111-111111111111";
const NOW = 1_900_000_000_000;

function expectedPolicy() {
  return {
    policyVersionId: POLICY_ID,
    policy: {
      entry: { minimumScannerRank: 1 },
      exit: { maxHoldMs: 120_000 }
    },
    createdAtMs: NOW
  };
}

function expectedRun(tradingRunId = RUN_A_ID) {
  return {
    tradingRunId,
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    lifecycleState: "ACTIVE",
    environmentSnapshot: {
      productVersion: "0.1.0",
      source: "synthetic"
    },
    riskEnvelope: {
      maxOpenEpisodes: 1,
      maxNotionalUsd: 250
    },
    createdAtMs: NOW,
    updatedAtMs: NOW
  };
}

function expectedEpisode({
  tradeEpisodeId = EPISODE_A_ID,
  lifecycleState = "ACTIVE",
  completedAtMs = null
} = {}) {
  return {
    tradeEpisodeId,
    tradingRunId: RUN_A_ID,
    policyVersionId: POLICY_ID,
    lifecycleState,
    candidateKey: "NASDAQ:AAPL",
    candidateProvenance: {
      scannerGenerationId: "synthetic-generation-7",
      queryArtifactId: "synthetic-query-3",
      resultPosition: 1
    },
    createdAtMs: NOW + 10,
    updatedAtMs: lifecycleState === "COMPLETED" ? NOW + 80 : NOW + 10,
    completedAtMs
  };
}

async function createPolicyAndRun(ledger, tradingRunId = RUN_A_ID) {
  if ((await ledger.getPolicyVersion(POLICY_ID)) === null) {
    await ledger.createPolicyVersion({
      policy: expectedPolicy().policy
    });
  }
  return ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    lifecycleState: "ACTIVE",
    environmentSnapshot: expectedRun(tradingRunId).environmentSnapshot,
    riskEnvelope: expectedRun(tradingRunId).riskEnvelope
  });
}

test("TREE 12.1 trading run, immutable policy, episode and durable evidence survive reopen", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-ledger-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_A_ID,
      tradeEpisodeIdFactory: () => EPISODE_A_ID,
      candidateObservationIdFactory: () => OBSERVATION_ID,
      decisionRecordIdFactory: () => DECISION_ID,
      orderReferenceIdFactory: () => ORDER_REFERENCE_ID,
      positionStateIdFactory: () => POSITION_STATE_ID,
      episodeOutcomeIdFactory: () => OUTCOME_ID
    });

    assert.equal(ledger.schemaVersion, TRADING_LEDGER_SCHEMA_VERSION);
    assert.equal(await ledger.getTradingRun(RUN_A_ID), null);
    assert.equal(await ledger.getPolicyVersion(POLICY_ID), null);

    const policy = await ledger.createPolicyVersion({ policy: expectedPolicy().policy });
    assert.deepEqual(policy, expectedPolicy());

    const run = await createPolicyAndRun(ledger);
    assert.deepEqual(run, expectedRun());

    const episode = await ledger.createTradeEpisode({
      tradingRunId: RUN_A_ID,
      policyVersionId: POLICY_ID,
      candidateKey: "NASDAQ:AAPL",
      candidateProvenance: expectedEpisode().candidateProvenance
    });
    assert.deepEqual(episode, expectedEpisode());

    await ledger.appendCandidateObservation({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      observedAtMs: NOW + 20,
      observation: {
        symbol: "AAPL",
        last: 201.25,
        source: "synthetic"
      }
    });
    await ledger.appendDecisionRecord({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      decidedAtMs: NOW + 30,
      decisionType: "WATCH",
      reasonCode: "CANDIDATE_ADMITTED",
      evidence: {
        scannerRank: 1,
        change60sPct: 0.8
      }
    });
    await ledger.appendOrderReference({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      recordedAtMs: NOW + 40,
      localOrderId: "synthetic-local-order-1",
      requestId: "synthetic-request-1",
      lifecycleState: "DRY_RUN_PREVIEWED"
    });
    await ledger.appendPositionState({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      observedAtMs: NOW + 50,
      state: {
        side: "LONG",
        quantity: 1,
        averagePrice: 201.25
      }
    });

    const completed = await ledger.completeTradeEpisode({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      completedAtMs: NOW + 80,
      reasonCode: "MAX_HOLD_REACHED",
      outcome: {
        status: "CLOSED",
        pnlUsd: 1.5,
        favorableMovePct: 1.1,
        adverseMovePct: -0.2
      },
      evidence: {
        exitSource: "synthetic"
      }
    });
    assert.equal(completed.lifecycleState, "COMPLETED");
    assert.equal(completed.completedAtMs, NOW + 80);

    const beforeClose = await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_A_ID);
    assert.equal(beforeClose.episode.lifecycleState, "COMPLETED");
    assert.equal(beforeClose.observations.length, 1);
    assert.equal(beforeClose.decisions.length, 1);
    assert.equal(beforeClose.decisions[0].reasonCode, "CANDIDATE_ADMITTED");
    assert.deepEqual(beforeClose.decisions[0].evidence, {
      scannerRank: 1,
      change60sPct: 0.8
    });
    assert.equal(beforeClose.orderReferences.length, 1);
    assert.equal(beforeClose.positionStates.length, 1);
    assert.equal(beforeClose.outcome.reasonCode, "MAX_HOLD_REACHED");
    assert.deepEqual(beforeClose.outcome.evidence, { exitSource: "synthetic" });

    await ledger.close();
    ledger = null;

    ledger = await openTradingLedger({ dbPath, now: () => NOW + 1_000 });

    assert.equal(ledger.schemaVersion, TRADING_LEDGER_SCHEMA_VERSION);
    assert.deepEqual(await ledger.getPolicyVersion(POLICY_ID), expectedPolicy());
    assert.deepEqual(await ledger.getTradingRun(RUN_A_ID), expectedRun());
    assert.deepEqual(
      await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_A_ID),
      beforeClose,
      "reopen must deterministically restore the complete durable episode aggregate"
    );
    assert.deepEqual(await ledger.listTradeEpisodes(RUN_A_ID), [beforeClose.episode]);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.1 policy content is immutable once used by a TradingRun", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-policy-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_A_ID
    });
    await ledger.createPolicyVersion({ policy: expectedPolicy().policy });
    await createPolicyAndRun(ledger);

    await assert.rejects(
      ledger.replacePolicyVersion(POLICY_ID, {
        entry: { minimumScannerRank: 2 },
        exit: { maxHoldMs: 30_000 }
      }),
      /immutable|in use/iu
    );
    assert.deepEqual(await ledger.getPolicyVersion(POLICY_ID), expectedPolicy());
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.1 cross-run and cross-episode identifiers fail closed", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-id-scope-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;
  const runIds = [RUN_A_ID, RUN_B_ID];

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => runIds.shift(),
      tradeEpisodeIdFactory: () => EPISODE_A_ID,
      decisionRecordIdFactory: () => DECISION_ID
    });
    await ledger.createPolicyVersion({ policy: expectedPolicy().policy });
    await createPolicyAndRun(ledger, RUN_A_ID);
    await createPolicyAndRun(ledger, RUN_B_ID);
    await ledger.createTradeEpisode({
      tradingRunId: RUN_A_ID,
      policyVersionId: POLICY_ID,
      candidateKey: "NASDAQ:AAPL",
      candidateProvenance: expectedEpisode().candidateProvenance
    });

    await assert.rejects(
      ledger.appendDecisionRecord({
        tradingRunId: RUN_B_ID,
        tradeEpisodeId: EPISODE_A_ID,
        decidedAtMs: NOW + 20,
        decisionType: "WATCH",
        reasonCode: "WRONG_RUN_MUST_FAIL",
        evidence: { synthetic: true }
      }),
      /run|episode|scope|belong/iu
    );
    assert.equal(
      await ledger.getTradeEpisodeBundle(RUN_B_ID, EPISODE_A_ID),
      null,
      "an episode ID from another run must never resolve through the wrong run"
    );
    const aggregate = await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_A_ID);
    assert.deepEqual(aggregate.decisions, []);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.1 episode completion is transaction-safe and cannot fabricate completed state", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-tx-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;
  const episodeIds = [EPISODE_A_ID, EPISODE_B_ID];

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_A_ID,
      tradeEpisodeIdFactory: () => episodeIds.shift(),
      episodeOutcomeIdFactory: () => OUTCOME_ID
    });
    await ledger.createPolicyVersion({ policy: expectedPolicy().policy });
    await createPolicyAndRun(ledger);

    for (const candidateKey of ["NASDAQ:AAPL", "NASDAQ:MSFT"]) {
      await ledger.createTradeEpisode({
        tradingRunId: RUN_A_ID,
        policyVersionId: POLICY_ID,
        candidateKey,
        candidateProvenance: expectedEpisode().candidateProvenance
      });
    }

    await ledger.completeTradeEpisode({
      tradingRunId: RUN_A_ID,
      tradeEpisodeId: EPISODE_A_ID,
      completedAtMs: NOW + 80,
      reasonCode: "FIRST_SYNTHETIC_OUTCOME",
      outcome: { status: "CLOSED", pnlUsd: 1 },
      evidence: { synthetic: true }
    });

    await assert.rejects(
      ledger.completeTradeEpisode({
        tradingRunId: RUN_A_ID,
        tradeEpisodeId: EPISODE_B_ID,
        completedAtMs: NOW + 90,
        reasonCode: "DUPLICATE_OUTCOME_ID_MUST_ROLL_BACK",
        outcome: { status: "CLOSED", pnlUsd: 2 },
        evidence: { synthetic: true }
      })
    );

    const failed = await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_B_ID);
    assert.equal(failed.episode.lifecycleState, "ACTIVE");
    assert.equal(failed.episode.completedAtMs, null);
    assert.equal(failed.outcome, null);

    await ledger.close();
    ledger = null;

    ledger = await openTradingLedger({ dbPath, now: () => NOW + 1_000 });
    const reopened = await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_B_ID);
    assert.equal(reopened.episode.lifecycleState, "ACTIVE");
    assert.equal(reopened.episode.completedAtMs, null);
    assert.equal(reopened.outcome, null);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("TREE 12.1 public-safe persistence rejects sensitive and chain-of-thought payloads", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-safe-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_A_ID,
      tradeEpisodeIdFactory: () => EPISODE_A_ID,
      decisionRecordIdFactory: () => DECISION_ID
    });
    await ledger.createPolicyVersion({ policy: expectedPolicy().policy });

    await assert.rejects(
      ledger.createTradingRun({
        policyVersionId: POLICY_ID,
        mode: "DRY_RUN",
        lifecycleState: "ACTIVE",
        environmentSnapshot: {
          productVersion: "0.1.0",
          accountId: "DU1234567"
        },
        riskEnvelope: expectedRun().riskEnvelope
      }),
      /public-safe|sensitive|account/iu
    );

    await createPolicyAndRun(ledger);
    await ledger.createTradeEpisode({
      tradingRunId: RUN_A_ID,
      policyVersionId: POLICY_ID,
      candidateKey: "NASDAQ:AAPL",
      candidateProvenance: expectedEpisode().candidateProvenance
    });

    await assert.rejects(
      ledger.appendDecisionRecord({
        tradingRunId: RUN_A_ID,
        tradeEpisodeId: EPISODE_A_ID,
        decidedAtMs: NOW + 20,
        decisionType: "WATCH",
        reasonCode: "SAFE_REASON_CODE",
        evidence: {
          sessionToken: "synthetic-secret-must-not-persist"
        }
      }),
      /public-safe|sensitive|session|token/iu
    );
    await assert.rejects(
      ledger.appendDecisionRecord({
        tradingRunId: RUN_A_ID,
        tradeEpisodeId: EPISODE_A_ID,
        decidedAtMs: NOW + 20,
        decisionType: "WATCH",
        reasonCode: "SAFE_REASON_CODE",
        evidence: {
          chainOfThought: "must never become durable product state"
        }
      }),
      /chain-of-thought|chainOfThought|reasoning|public-safe/iu
    );

    const aggregate = await ledger.getTradeEpisodeBundle(RUN_A_ID, EPISODE_A_ID);
    assert.deepEqual(aggregate.decisions, []);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
