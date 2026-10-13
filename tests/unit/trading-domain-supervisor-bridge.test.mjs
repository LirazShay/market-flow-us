import assert from "node:assert/strict";
import test from "node:test";

import { createTradingDomain } from "../../trading-server/domain.js";
import {
  createSupervisorState,
  validateDecisionProposal
} from "../../trading-server/supervisor.js";

const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";

function ledgerStub() {
  const run = Object.freeze({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    lifecycleState: "ACTIVE"
  });
  const episode = Object.freeze({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    lifecycleState: "ACTIVE",
    candidateKey: "NASDAQ:AAPL",
    updatedAtMs: 1
  });
  return {
    schemaVersion: 1,
    async getTradingRun(tradingRunId) {
      return tradingRunId === RUN_ID ? run : null;
    },
    async listTradingRuns() {
      return Object.freeze([run]);
    },
    async listTradeEpisodes(tradingRunId) {
      return tradingRunId === RUN_ID ? Object.freeze([episode]) : Object.freeze([]);
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      if (tradingRunId !== RUN_ID || tradeEpisodeId !== EPISODE_ID) return null;
      return Object.freeze({
        episode,
        observations: Object.freeze([]),
        decisions: Object.freeze([]),
        orderReferences: Object.freeze([]),
        positionStates: Object.freeze([]),
        outcome: null
      });
    }
  };
}

test("TREE 12.7 Trading Domain preserves SWITCH proposal for authoritative Supervisor validation", async () => {
  const domain = createTradingDomain({ ledger: ledgerStub() });
  const submitted = Object.freeze({
    decisionType: "SWITCH",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: 3,
    targetCandidateKey: "NASDAQ:MSFT"
  });

  await domain.submitDecisionProposal(submitted);
  const delivered = await domain.readDecisionProposal({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID
  });
  const state = createSupervisorState({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    candidateKey: "NASDAQ:AAPL",
    lifecycleState: "WATCHING",
    stateVersion: 3
  });

  const accepted = validateDecisionProposal({
    state,
    proposal: delivered,
    authorizedSwitchTargetKeys: ["NASDAQ:MSFT"]
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.proposal.targetCandidateKey, "NASDAQ:MSFT");

  const rejected = validateDecisionProposal({
    state,
    proposal: submitted,
    authorizedSwitchTargetKeys: []
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reasonCode, "AI_PROPOSAL_UNAUTHORIZED_SWITCH_TARGET");
});
