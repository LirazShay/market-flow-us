import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";

const POLICY_ID = "pol_88888888-8888-4888-8888-888888888888";
const RUN_ID = "trun_88888888-8888-4888-8888-888888888888";
const EPISODE_ID = "tep_88888888-8888-4888-8888-888888888888";
const BASE_NOW = 1_900_800_000_000;
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});
const POLICY = Object.freeze({
  kind: "DETERMINISTIC_TRADING_POLICY_V1",
  entry: Object.freeze({
    enterOnUsableQuote: true,
    maxWatchMs: 30_000
  }),
  exit: Object.freeze({
    takeProfitBps: 100,
    stopLossBps: 50,
    maxHoldMs: 120_000
  })
});

function uuidFactory(prefix) {
  let value = 1;
  return () => {
    const tail = String(value).padStart(12, "0");
    value += 1;
    return `${prefix}_88888888-8888-4888-8888-${tail}`;
  };
}

function clock(start = BASE_NOW) {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

async function seedEpisode(ledger) {
  await ledger.createPolicyVersion({ policy: POLICY });
  await ledger.createTradingRun({
    policyVersionId: POLICY_ID,
    mode: "DRY_RUN",
    environmentSnapshot: { source: "synthetic-deterministic-policy-test" },
    riskEnvelope: { maxNotionalUsd: 500 }
  });
  await ledger.createTradeEpisode({
    tradingRunId: RUN_ID,
    policyVersionId: POLICY_ID,
    candidateKey: "NASDAQ:AAPL",
    candidateProvenance: {
      scannerGeneration: 8,
      resultRank: 1,
      securityId: "NASDAQ:AAPL"
    }
  });
}

function quoteObservation() {
  return {
    instrument: AAPL,
    resolutionStatus: "EXACT",
    conid: 265598,
    availability: "AVAILABLE",
    staleness: "FRESH",
    usableForNewDecision: true,
    marketDataAvailability: "RpB",
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: BASE_NOW,
    receivedAtMs: BASE_NOW + 1
  };
}

function intentBuilder({ action, requestId }) {
  return {
    requestId,
    instrument: AAPL,
    side: action.type === "REQUEST_ENTRY" ? "BUY" : "SELL",
    quantity: 1,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode: "DRY_RUN"
  };
}

test("TREE 12.8 promoted deterministic PolicyVersion executes without AI and ignores conflicting AI proposal", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-deterministic-runtime-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  const now = clock(BASE_NOW + 100);
  let ledger = null;

  try {
    ledger = await openTradingLedger({
      dbPath,
      now: () => BASE_NOW,
      policyVersionIdFactory: () => POLICY_ID,
      tradingRunIdFactory: () => RUN_ID,
      tradeEpisodeIdFactory: () => EPISODE_ID,
      candidateObservationIdFactory: uuidFactory("obs"),
      decisionRecordIdFactory: uuidFactory("dec"),
      orderReferenceIdFactory: uuidFactory("ordref"),
      positionStateIdFactory: uuidFactory("pos")
    });
    await seedEpisode(ledger);

    let orderCalls = 0;
    const runtime = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll(instruments) {
          assert.deepEqual(instruments, [AAPL]);
          return [quoteObservation()];
        }
      },
      protectedOrderBridge: {
        async submitOrderIntent(input) {
          orderCalls += 1;
          return {
            requestId: input.intent.requestId,
            localOrderId: "ord_deterministic_entry_1",
            lifecycleState: "DRY_RUN_COMPLETE",
            executionMode: "DRY_RUN",
            replayed: false
          };
        }
      },
      buildOrderIntent: intentBuilder,
      now
    });

    const watching = await runtime.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(watching.supervisorState.lifecycleState, "WATCHING");

    const conflictingAiProposal = {
      decisionType: "SKIP",
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      policyVersionId: POLICY_ID,
      observedStateVersion: watching.supervisorState.stateVersion
    };
    const result = await runtime.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: conflictingAiProposal
    });

    assert.equal(result.status, "ORDER_SUBMITTED");
    assert.equal(result.state.lifecycleState, "ENTRY_WORKING");
    assert.deepEqual(result.action, { type: "REQUEST_ENTRY" });
    assert.equal(result.decisionRecord.decisionType, "ENTER");
    assert.equal(result.decisionRecord.reasonCode, "POLICY_USABLE_QUOTE_ENTRY");
    assert.equal(orderCalls, 1);

    const bundle = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    const decision = bundle.decisions.at(-1);
    assert.equal(decision.evidence.source, "DETERMINISTIC_POLICY");
    assert.equal(decision.evidence.proposalStatus, "NOT_APPLICABLE");
    assert.equal(decision.evidence.deterministicPolicyEvidence.lifecycleState, "WATCHING");
    assert.equal(Number.isSafeInteger(
      decision.evidence.deterministicPolicyEvidence.watchStartedAtMs
    ), true);
    assert.equal(decision.evidence.deterministicPolicyEvidence.positionOpenedAtMs, null);
    assert.equal(decision.evidence.deterministicPolicyEvidence.entryPrice, null);
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});
