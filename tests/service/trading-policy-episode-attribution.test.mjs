import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import {
  deriveEpisodeAttributionFromLedger
} from "../../trading-server/policy-episode-attribution.js";
import { summarizePolicyAttribution } from "../../trading-server/policy-distillation.js";

const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const GOOD_CANDIDATE_FILL_FAILURE_ID = "tep_11111111-1111-4111-8111-111111111111";
const BAD_CANDIDATE_EXECUTION_SUCCESS_ID = "tep_22222222-2222-4222-8222-222222222222";
const NOW = 1_900_500_000_000;

const POLICY = Object.freeze({
  schemaVersion: 1,
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: Object.freeze({ enterOnUsableQuote: true, maxWatchMs: 30_000 }),
  exit: Object.freeze({ takeProfitBps: 100, stopLossBps: 50, maxHoldMs: 120_000 })
});

function supervisorSnapshot({ tradeEpisodeId, candidateKey, lifecycleState, stateVersion }) {
  return {
    kind: "TRADING_SUPERVISOR_V1",
    version: 1,
    supervisorState: {
      tradingRunId: RUN_ID,
      tradeEpisodeId,
      policyVersionId: POLICY_ID,
      candidateKey,
      lifecycleState,
      stateVersion
    },
    runtimeState: "ACTIVE",
    dispatch: null,
    recovery: null,
    lastOrderReference: null
  };
}

async function withFixture(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-policy-attribution-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  try {
    await fn(dbPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function createEpisode(ledger, { tradeEpisodeId, candidateKey, nowMs }) {
  return ledger.createTradeEpisode({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    candidateKey,
    candidateProvenance: {
      scannerGenerationId: `generation-${nowMs}`,
      queryArtifactId: "qry_11111111-1111-4111-8111-111111111111",
      resultPosition: 1
    }
  });
}

test("TREE 12.8 durable Trade Episodes distinguish Scanner quality from execution failures across all five attribution layers", async () => {
  await withFixture(async (dbPath) => {
    let nowMs = NOW;
    const episodeIds = [GOOD_CANDIDATE_FILL_FAILURE_ID, BAD_CANDIDATE_EXECUTION_SUCCESS_ID];
    const observationIds = [
      "obs_11111111-1111-4111-8111-111111111111",
      "obs_22222222-2222-4222-8222-222222222222",
      "obs_33333333-3333-4333-8333-333333333333",
      "obs_44444444-4444-4444-8444-444444444444"
    ];
    const decisionIds = [
      "dec_11111111-1111-4111-8111-111111111111",
      "dec_22222222-2222-4222-8222-222222222222",
      "dec_33333333-3333-4333-8333-333333333333",
      "dec_44444444-4444-4444-8444-444444444444"
    ];
    const orderReferenceIds = [
      "ordref_11111111-1111-4111-8111-111111111111",
      "ordref_22222222-2222-4222-8222-222222222222",
      "ordref_33333333-3333-4333-8333-333333333333"
    ];
    const positionStateIds = [
      "pos_11111111-1111-4111-8111-111111111111",
      "pos_22222222-2222-4222-8222-222222222222",
      "pos_33333333-3333-4333-8333-333333333333",
      "pos_44444444-4444-4444-8444-444444444444"
    ];
    const outcomeIds = [
      "out_11111111-1111-4111-8111-111111111111",
      "out_22222222-2222-4222-8222-222222222222"
    ];

    let ledger = await openTradingLedger({
      dbPath,
      now: () => nowMs,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_ID,
      tradeEpisodeIdFactory: () => episodeIds.shift(),
      candidateObservationIdFactory: () => observationIds.shift(),
      decisionRecordIdFactory: () => decisionIds.shift(),
      orderReferenceIdFactory: () => orderReferenceIds.shift(),
      positionStateIdFactory: () => positionStateIds.shift(),
      episodeOutcomeIdFactory: () => outcomeIds.shift()
    });

    await ledger.createPolicyVersion({ policy: POLICY });
    await ledger.createTradingRun({
      policyVersionId: POLICY_ID,
      mode: "DRY_RUN",
      environmentSnapshot: { source: "synthetic-attribution-proof" },
      riskEnvelope: { maxNotionalUsd: 250 }
    });

    nowMs = NOW + 10;
    await createEpisode(ledger, {
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      candidateKey: "NASDAQ:GOOD",
      nowMs
    });
    await ledger.appendCandidateObservation({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      observedAtMs: NOW + 11,
      observation: { last: 100, usableForNewDecision: true }
    });
    await ledger.appendDecisionRecord({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      decidedAtMs: NOW + 12,
      decisionType: "ENTER",
      reasonCode: "POLICY_USABLE_QUOTE_ENTRY",
      evidence: { lifecycleStateBefore: "WATCHING", source: "DETERMINISTIC_POLICY" }
    });
    await ledger.appendCandidateObservation({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      observedAtMs: NOW + 13,
      observation: { last: 101, usableForNewDecision: true }
    });
    await ledger.appendOrderReference({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      recordedAtMs: NOW + 14,
      localOrderId: "good-entry-order",
      requestId: "good-entry-request",
      lifecycleState: "ENTRY_SUBMITTED"
    });
    await ledger.appendPositionState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      observedAtMs: NOW + 15,
      state: supervisorSnapshot({
        tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
        candidateKey: "NASDAQ:GOOD",
        lifecycleState: "CLOSED",
        stateVersion: 4
      })
    });
    await ledger.completeTradeEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID,
      completedAtMs: NOW + 16,
      reasonCode: "ENTRY_TERMINAL_NO_POSITION",
      outcome: { status: "CLOSED", pnlUsd: 0 },
      evidence: { terminalState: "CLOSED" }
    });

    nowMs = NOW + 20;
    await createEpisode(ledger, {
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      candidateKey: "NASDAQ:BAD",
      nowMs
    });
    await ledger.appendCandidateObservation({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      observedAtMs: NOW + 21,
      observation: { last: 100, usableForNewDecision: true }
    });
    await ledger.appendDecisionRecord({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      decidedAtMs: NOW + 22,
      decisionType: "ENTER",
      reasonCode: "POLICY_USABLE_QUOTE_ENTRY",
      evidence: { lifecycleStateBefore: "WATCHING", source: "DETERMINISTIC_POLICY" }
    });
    await ledger.appendCandidateObservation({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      observedAtMs: NOW + 23,
      observation: { last: 99.5, usableForNewDecision: true }
    });
    await ledger.appendOrderReference({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      recordedAtMs: NOW + 24,
      localOrderId: "bad-entry-order",
      requestId: "bad-entry-request",
      lifecycleState: "ENTRY_SUBMITTED"
    });
    await ledger.appendPositionState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      observedAtMs: NOW + 25,
      state: supervisorSnapshot({
        tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
        candidateKey: "NASDAQ:BAD",
        lifecycleState: "POSITION_OPEN",
        stateVersion: 4
      })
    });
    await ledger.appendDecisionRecord({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      decidedAtMs: NOW + 26,
      decisionType: "HOLD",
      reasonCode: "POLICY_HOLD",
      evidence: { lifecycleStateBefore: "POSITION_OPEN", source: "DETERMINISTIC_POLICY" }
    });
    await ledger.appendDecisionRecord({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      decidedAtMs: NOW + 27,
      decisionType: "EXIT",
      reasonCode: "POLICY_STOP_LOSS",
      evidence: { lifecycleStateBefore: "POSITION_OPEN", source: "DETERMINISTIC_POLICY" }
    });
    await ledger.appendOrderReference({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      recordedAtMs: NOW + 28,
      localOrderId: "bad-exit-order",
      requestId: "bad-exit-request",
      lifecycleState: "EXIT_SUBMITTED"
    });
    await ledger.appendPositionState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      observedAtMs: NOW + 29,
      state: supervisorSnapshot({
        tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
        candidateKey: "NASDAQ:BAD",
        lifecycleState: "EXIT_WORKING",
        stateVersion: 6
      })
    });
    await ledger.appendPositionState({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      observedAtMs: NOW + 30,
      state: supervisorSnapshot({
        tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
        candidateKey: "NASDAQ:BAD",
        lifecycleState: "CLOSED",
        stateVersion: 7
      })
    });
    await ledger.completeTradeEpisode({
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID,
      completedAtMs: NOW + 31,
      reasonCode: "EXIT_FILLED",
      outcome: { status: "CLOSED", pnlUsd: -1.25 },
      evidence: { terminalState: "CLOSED" }
    });

    const goodCandidate = await deriveEpisodeAttributionFromLedger({
      ledger,
      tradingRunId: RUN_ID,
      tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID
    });
    assert.deepEqual(
      Object.fromEntries(Object.entries(goodCandidate.layers).map(([key, value]) => [key, value.outcome])),
      {
        scanner: "SUCCESS",
        entry: "SUCCESS",
        fill: "FAILURE",
        positionManagement: "NOT_APPLICABLE",
        exit: "NOT_APPLICABLE"
      },
      "a favorable Scanner candidate must remain distinguishable from an entry fill failure"
    );

    const badCandidate = await deriveEpisodeAttributionFromLedger({
      ledger,
      tradingRunId: RUN_ID,
      tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID
    });
    assert.deepEqual(
      Object.fromEntries(Object.entries(badCandidate.layers).map(([key, value]) => [key, value.outcome])),
      {
        scanner: "FAILURE",
        entry: "FAILURE",
        fill: "SUCCESS",
        positionManagement: "INCONCLUSIVE",
        exit: "SUCCESS"
      },
      "successful fill/exit execution must not launder a poor Scanner candidate into Scanner success"
    );

    const summary = summarizePolicyAttribution({
      policyVersionId: POLICY_ID,
      episodes: [goodCandidate, badCandidate]
    });
    assert.deepEqual(
      {
        scanner: summary.layers.scanner,
        entry: summary.layers.entry,
        fill: summary.layers.fill,
        positionManagement: summary.layers.positionManagement,
        exit: summary.layers.exit
      },
      {
        scanner: {
          totalEpisodes: 2,
          applicableEpisodes: 2,
          conclusiveEpisodes: 2,
          successEpisodes: 1,
          failureEpisodes: 1,
          inconclusiveEpisodes: 0,
          notApplicableEpisodes: 0,
          successRate: { numerator: 1, denominator: 2, value: 0.5 },
          evidenceCoverage: { numerator: 2, denominator: 2, value: 1 },
          evidenceRefs: summary.layers.scanner.evidenceRefs
        },
        entry: {
          totalEpisodes: 2,
          applicableEpisodes: 2,
          conclusiveEpisodes: 2,
          successEpisodes: 1,
          failureEpisodes: 1,
          inconclusiveEpisodes: 0,
          notApplicableEpisodes: 0,
          successRate: { numerator: 1, denominator: 2, value: 0.5 },
          evidenceCoverage: { numerator: 2, denominator: 2, value: 1 },
          evidenceRefs: summary.layers.entry.evidenceRefs
        },
        fill: {
          totalEpisodes: 2,
          applicableEpisodes: 2,
          conclusiveEpisodes: 2,
          successEpisodes: 1,
          failureEpisodes: 1,
          inconclusiveEpisodes: 0,
          notApplicableEpisodes: 0,
          successRate: { numerator: 1, denominator: 2, value: 0.5 },
          evidenceCoverage: { numerator: 2, denominator: 2, value: 1 },
          evidenceRefs: summary.layers.fill.evidenceRefs
        },
        positionManagement: {
          totalEpisodes: 2,
          applicableEpisodes: 1,
          conclusiveEpisodes: 0,
          successEpisodes: 0,
          failureEpisodes: 0,
          inconclusiveEpisodes: 1,
          notApplicableEpisodes: 1,
          successRate: { numerator: 0, denominator: 0, value: null },
          evidenceCoverage: { numerator: 1, denominator: 1, value: 1 },
          evidenceRefs: summary.layers.positionManagement.evidenceRefs
        },
        exit: {
          totalEpisodes: 2,
          applicableEpisodes: 1,
          conclusiveEpisodes: 1,
          successEpisodes: 1,
          failureEpisodes: 0,
          inconclusiveEpisodes: 0,
          notApplicableEpisodes: 1,
          successRate: { numerator: 1, denominator: 1, value: 1 },
          evidenceCoverage: { numerator: 1, denominator: 1, value: 1 },
          evidenceRefs: summary.layers.exit.evidenceRefs
        }
      }
    );

    await ledger.close();
    ledger = await openTradingLedger({ dbPath, now: () => NOW + 1_000 });
    assert.deepEqual(
      await deriveEpisodeAttributionFromLedger({
        ledger,
        tradingRunId: RUN_ID,
        tradeEpisodeId: GOOD_CANDIDATE_FILL_FAILURE_ID
      }),
      goodCandidate,
      "derived attribution must reproduce exactly from durable ledger evidence after restart"
    );
    assert.deepEqual(
      await deriveEpisodeAttributionFromLedger({
        ledger,
        tradingRunId: RUN_ID,
        tradeEpisodeId: BAD_CANDIDATE_EXECUTION_SUCCESS_ID
      }),
      badCandidate
    );
    await ledger.close();
  });
});
