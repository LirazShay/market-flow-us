import assert from "node:assert/strict";
import test from "node:test";

import {
  TRADING_DOMAIN_SCHEMA_VERSION,
  createTradingDomain,
  createTradingProposalInbox
} from "../../trading-server/domain.js";

const RUN_ID = "trun_11111111-1111-4111-8111-111111111111";
const OTHER_RUN_ID = "trun_22222222-2222-4222-8222-222222222222";
const POLICY_ID = "pol_11111111-1111-4111-8111-111111111111";
const OTHER_POLICY_ID = "pol_22222222-2222-4222-8222-222222222222";
const EPISODE_ID = "tep_11111111-1111-4111-8111-111111111111";

function ledgerStub() {
  const run = Object.freeze({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    lifecycleState: "ACTIVE",
    updatedAtMs: 10
  });
  const episode = Object.freeze({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    lifecycleState: "ACTIVE",
    candidateKey: "NASDAQ:AAPL",
    createdAtMs: 11,
    updatedAtMs: 12
  });
  const calls = [];
  return {
    calls,
    schemaVersion: 1,
    async getTradingRun(tradingRunId) {
      calls.push(["getTradingRun", tradingRunId]);
      return tradingRunId === RUN_ID ? run : null;
    },
    async listTradingRuns(options) {
      calls.push(["listTradingRuns", options]);
      return Object.freeze([run]);
    },
    async listTradeEpisodes(tradingRunId) {
      calls.push(["listTradeEpisodes", tradingRunId]);
      return tradingRunId === RUN_ID ? Object.freeze([episode]) : Object.freeze([]);
    },
    async getTradeEpisodeBundle(tradingRunId, tradeEpisodeId) {
      calls.push(["getTradeEpisodeBundle", tradingRunId, tradeEpisodeId]);
      if (tradingRunId !== RUN_ID || tradeEpisodeId !== EPISODE_ID) return null;
      return Object.freeze({
        episode,
        observations: Object.freeze([]),
        decisions: Object.freeze([]),
        orderReferences: Object.freeze([]),
        positionStates: Object.freeze([
          Object.freeze({
            observedAtMs: 13,
            state: Object.freeze({
              kind: "TRADING_SUPERVISOR_V1",
              version: 1,
              runtimeState: "ACTIVE",
              supervisorState: Object.freeze({
                tradingRunId: RUN_ID,
                tradeEpisodeId: EPISODE_ID,
                policyVersionId: POLICY_ID,
                candidateKey: "NASDAQ:AAPL",
                lifecycleState: "WATCHING",
                stateVersion: 3
              })
            })
          })
        ]),
        outcome: null
      });
    }
  };
}

function proposal(overrides = {}) {
  return Object.freeze({
    decisionType: "ENTER",
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: 3,
    ...overrides
  });
}

test("TREE 12.7 Trading Domain resumes compact durable state without chat memory", async () => {
  const ledger = ledgerStub();
  const domain = createTradingDomain({ ledger });

  assert.equal(TRADING_DOMAIN_SCHEMA_VERSION, 1);
  assert.deepEqual(domain.schemaVersions, {
    tradingDomain: 1,
    tradingLedger: 1
  });

  const resumed = await domain.resumeTradingRun(RUN_ID);

  assert.equal(resumed.tradingRun.tradingRunId, RUN_ID);
  assert.equal(resumed.episodeCount, 1);
  assert.equal(resumed.truncated, false);
  assert.deepEqual(resumed.episodes, [
    {
      tradeEpisodeId: EPISODE_ID,
      policyVersionId: POLICY_ID,
      lifecycleState: "ACTIVE",
      candidateKey: "NASDAQ:AAPL",
      updatedAtMs: 12,
      supervisor: {
        runtimeState: "ACTIVE",
        lifecycleState: "WATCHING",
        stateVersion: 3
      }
    }
  ]);
});

test("TREE 12.7 DecisionProposal submission queues only a bounded proposal and never calls broker authority", async () => {
  const ledger = ledgerStub();
  const inbox = createTradingProposalInbox();
  const domain = createTradingDomain({ ledger, proposalInbox: inbox });
  const input = proposal();

  const submitted = await domain.submitDecisionProposal(input);

  assert.deepEqual(submitted, {
    submissionStatus: "QUEUED_FOR_SUPERVISOR_VALIDATION",
    replacedPendingProposal: false,
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    observedStateVersion: 3
  });
  assert.equal(Object.hasOwn(submitted, "accepted"), false, "MCP submission is not Supervisor acceptance");
  assert.equal(inbox.pendingCount, 1);

  const delivered = await domain.readDecisionProposal({
    tradingRunId: RUN_ID,
    tradeEpisodeId: EPISODE_ID,
    policyVersionId: POLICY_ID,
    state: { stateVersion: 3 }
  });
  assert.deepEqual(delivered, input);
  assert.equal(inbox.pendingCount, 0);
  assert.equal(await domain.readDecisionProposal({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID }), null);
});

test("TREE 12.7 proposal inbox keeps scope exact and latest submission replaces only the same episode slot", async () => {
  const ledger = ledgerStub();
  const inbox = createTradingProposalInbox({ maxPendingEpisodes: 2 });
  const domain = createTradingDomain({ ledger, proposalInbox: inbox });

  await domain.submitDecisionProposal(proposal({ observedStateVersion: 3 }));
  const replaced = await domain.submitDecisionProposal(proposal({ observedStateVersion: 4 }));
  assert.equal(replaced.replacedPendingProposal, true);
  assert.equal(inbox.pendingCount, 1);

  assert.equal(
    await domain.readDecisionProposal({ tradingRunId: OTHER_RUN_ID, tradeEpisodeId: EPISODE_ID }),
    null
  );
  const delivered = await domain.readDecisionProposal({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID });
  assert.equal(delivered.observedStateVersion, 4);
});

test("TREE 12.7 proposal admission fails closed on run, episode, and policy authority mismatches", async () => {
  const ledger = ledgerStub();
  const inbox = createTradingProposalInbox();
  const domain = createTradingDomain({ ledger, proposalInbox: inbox });

  await assert.rejects(
    domain.submitDecisionProposal(proposal({ tradingRunId: OTHER_RUN_ID })),
    (error) => error?.code === "TRADING_PROPOSAL_RUN_NOT_FOUND"
  );
  await assert.rejects(
    domain.submitDecisionProposal(proposal({ tradeEpisodeId: "tep_22222222-2222-4222-8222-222222222222" })),
    (error) => error?.code === "TRADING_PROPOSAL_EPISODE_NOT_FOUND"
  );
  await assert.rejects(
    domain.submitDecisionProposal(proposal({ policyVersionId: OTHER_POLICY_ID })),
    (error) => error?.code === "TRADING_PROPOSAL_POLICY_MISMATCH"
  );
  assert.equal(inbox.pendingCount, 0);
});

test("TREE 12.7 SWITCH proposals preserve the bounded targetCandidateKey for Supervisor validation", async () => {
  const ledger = ledgerStub();
  const domain = createTradingDomain({ ledger });
  const input = proposal({
    decisionType: "SWITCH",
    targetCandidateKey: "NASDAQ:MSFT"
  });

  await domain.submitDecisionProposal(input);
  assert.deepEqual(
    await domain.readDecisionProposal({ tradingRunId: RUN_ID, tradeEpisodeId: EPISODE_ID }),
    input
  );
});
