import assert from "node:assert/strict";
import { test } from "node:test";

import { createHardRiskAuthority, HardRiskRejectionError } from "../../trading-server/hard-risk-authority.js";
import { openTradingLedger } from "../../trading-server/ledger.js";

const NOW = 1_900_000_000_000;
const HARD_LIMITS = Object.freeze({
  maxOrderNotionalUsd: 500,
  maxConcurrentPositions: 2,
  maxAggregateExposureUsd: 800,
  maxOrderAttemptsPerWindow: 3,
  orderAttemptWindowMs: 60_000,
  maxSessionLossUsd: 100,
  maxFailedEntryAttempts: 2,
  maxQuoteAgeMs: 5_000
});

function baseIntent(overrides = {}) {
  return {
    requestId: "synthetic-risk-request-1",
    instrument: {
      symbol: "AAPL",
      secType: "STK",
      currency: "USD",
      exchange: "SMART"
    },
    side: "BUY",
    quantity: 2,
    orderType: "LMT",
    limitPrice: 100,
    tif: "DAY",
    executionMode: "DRY_RUN",
    ...overrides
  };
}

function baseQuote(overrides = {}) {
  return {
    last: 100,
    bid: 99.9,
    ask: 100.1,
    providerUpdatedAtMs: NOW - 100,
    ...overrides
  };
}

function baseRiskState(overrides = {}) {
  return {
    openPositionCount: 0,
    aggregateExposureUsd: 0,
    recentOrderAttemptTimestampsMs: [],
    pnlUsd: 0,
    failedEntryAttempts: 0,
    instrumentPositionQuantity: 0,
    ...overrides
  };
}

function baseOperatorControls(overrides = {}) {
  return {
    globalKillSwitch: false,
    newEntryPaused: false,
    ...overrides
  };
}

function createFakeLedger() {
  const decisions = [];
  return {
    decisions,
    async appendDecisionRecord(record) {
      decisions.push(record);
      return { decisionRecordId: `dec_${decisions.length}`, ...record };
    }
  };
}

function createAuthority({
  ledger = createFakeLedger(),
  riskState = baseRiskState(),
  operatorControls = baseOperatorControls()
} = {}) {
  return {
    ledger,
    authority: createHardRiskAuthority({
      hardLimits: HARD_LIMITS,
      ledger,
      now: () => NOW,
      readRiskState: async () => riskState,
      readOperatorControls: async () => operatorControls
    })
  };
}

async function gate(authority, {
  intent = baseIntent(),
  quote = baseQuote(),
  policyLimits = undefined,
  forward = async ({ normalizedIntent, riskPermit }) => ({ normalizedIntent, riskPermit })
} = {}) {
  return authority.gateOrderIntent({
    tradingRunId: "trun_synthetic-risk-run",
    tradeEpisodeId: "tep_synthetic-risk-episode",
    intent,
    quote,
    policyLimits
  }, forward);
}

async function expectRejected({
  riskState = baseRiskState(),
  operatorControls = baseOperatorControls(),
  intent = baseIntent(),
  quote = baseQuote(),
  policyLimits,
  reasonCode
}) {
  const ledger = createFakeLedger();
  const authority = createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger,
    now: () => NOW,
    readRiskState: async () => riskState,
    readOperatorControls: async () => operatorControls
  });
  let forwarded = false;

  await assert.rejects(
    gate(authority, {
      intent,
      quote,
      policyLimits,
      forward: async () => {
        forwarded = true;
        return "must-not-forward";
      }
    }),
    (error) => {
      assert.ok(error instanceof HardRiskRejectionError);
      assert.equal(error.code, reasonCode);
      return true;
    }
  );

  assert.equal(forwarded, false, `${reasonCode} must fail before the downstream Order Bridge seam`);
  assert.equal(ledger.decisions.length, 1, `${reasonCode} must be durably diagnosed`);
  assert.equal(ledger.decisions[0].decisionType, "HARD_RISK_REJECTED");
  assert.equal(ledger.decisions[0].reasonCode, reasonCode);
  assert.equal(ledger.decisions[0].decidedAtMs, NOW);
  return ledger.decisions[0];
}

test("TREE 12.5 hard risk authority gates before the downstream Order Bridge seam", async () => {
  const { authority, ledger } = createAuthority();
  let forwarded = 0;

  const result = await gate(authority, {
    forward: async ({ normalizedIntent, riskPermit }) => {
      forwarded += 1;
      assert.equal(normalizedIntent.instrument.symbol, "AAPL");
      assert.equal(riskPermit.reasonCode, "HARD_RISK_AUTHORIZED");
      assert.equal(riskPermit.orderNotionalUsd, 200);
      assert.equal(riskPermit.effectiveLimits.maxOrderNotionalUsd, 500);
      return { accepted: true, requestId: normalizedIntent.requestId };
    }
  });

  assert.deepEqual(result, { accepted: true, requestId: "synthetic-risk-request-1" });
  assert.equal(forwarded, 1);
  assert.deepEqual(ledger.decisions, [], "successful gates do not fabricate rejection diagnostics");
});

test("TREE 12.5 every initial hard-risk category fails closed with a stable durable reason code", async () => {
  const cases = [
    {
      reasonCode: "HARD_RISK_GLOBAL_KILL_SWITCH",
      operatorControls: baseOperatorControls({ globalKillSwitch: true })
    },
    {
      reasonCode: "HARD_RISK_NEW_ENTRY_PAUSED",
      operatorControls: baseOperatorControls({ newEntryPaused: true })
    },
    {
      reasonCode: "HARD_RISK_STALE_QUOTE",
      quote: baseQuote({ providerUpdatedAtMs: NOW - HARD_LIMITS.maxQuoteAgeMs - 1 })
    },
    {
      reasonCode: "HARD_RISK_ORDER_NOTIONAL_LIMIT",
      intent: baseIntent({ quantity: 6 })
    },
    {
      reasonCode: "HARD_RISK_CONCURRENT_POSITION_LIMIT",
      riskState: baseRiskState({ openPositionCount: HARD_LIMITS.maxConcurrentPositions })
    },
    {
      reasonCode: "HARD_RISK_AGGREGATE_EXPOSURE_LIMIT",
      riskState: baseRiskState({ aggregateExposureUsd: 700 })
    },
    {
      reasonCode: "HARD_RISK_ORDER_ATTEMPT_RATE_LIMIT",
      riskState: baseRiskState({
        recentOrderAttemptTimestampsMs: [NOW - 30_000, NOW - 20_000, NOW - 10_000]
      })
    },
    {
      reasonCode: "HARD_RISK_SESSION_LOSS_LIMIT",
      riskState: baseRiskState({ pnlUsd: -HARD_LIMITS.maxSessionLossUsd })
    },
    {
      reasonCode: "HARD_RISK_FAILED_ENTRY_LIMIT",
      riskState: baseRiskState({ failedEntryAttempts: HARD_LIMITS.maxFailedEntryAttempts })
    }
  ];

  for (const riskCase of cases) {
    const record = await expectRejected({ ...riskCase });
    assert.equal(record.evidence.symbol, "AAPL");
    assert.equal(record.evidence.side, "BUY");
    assert.equal(record.evidence.requestId, "synthetic-risk-request-1");
  }
});

test("TREE 12.5 PolicyVersion/AI limits can narrow but cannot widen operator-owned hard limits", async () => {
  let record = await expectRejected({
    intent: baseIntent({ quantity: 6 }),
    policyLimits: { maxOrderNotionalUsd: 1_000 },
    reasonCode: "HARD_RISK_ORDER_NOTIONAL_LIMIT"
  });
  assert.equal(record.evidence.limit, HARD_LIMITS.maxOrderNotionalUsd);

  record = await expectRejected({
    intent: baseIntent({ quantity: 2 }),
    policyLimits: { maxOrderNotionalUsd: 150 },
    reasonCode: "HARD_RISK_ORDER_NOTIONAL_LIMIT"
  });
  assert.equal(record.evidence.limit, 150);

  record = await expectRejected({
    operatorControls: baseOperatorControls({ globalKillSwitch: true }),
    policyLimits: { stopAllTrading: false, pauseNewEntries: false },
    reasonCode: "HARD_RISK_GLOBAL_KILL_SWITCH"
  });
  assert.equal(record.reasonCode, "HARD_RISK_GLOBAL_KILL_SWITCH");
});

test("TREE 12.5 entry-only ceilings do not trap a risk-reducing SELL exit", async () => {
  const { authority } = createAuthority({
    operatorControls: baseOperatorControls({ newEntryPaused: true }),
    riskState: baseRiskState({
      openPositionCount: 9,
      aggregateExposureUsd: 5_000,
      pnlUsd: -1_000,
      failedEntryAttempts: 99,
      instrumentPositionQuantity: 5
    })
  });
  let forwarded = false;

  await gate(authority, {
    intent: baseIntent({ side: "SELL", quantity: 1 }),
    forward: async () => {
      forwarded = true;
      return { accepted: true };
    }
  });

  assert.equal(forwarded, true);
});

test("TREE 12.5 invalid or incomplete hard-risk configuration is rejected instead of guessed", () => {
  const ledger = createFakeLedger();
  const common = {
    ledger,
    now: () => NOW,
    readRiskState: async () => baseRiskState(),
    readOperatorControls: async () => baseOperatorControls()
  };

  assert.throws(
    () => createHardRiskAuthority({ ...common, hardLimits: {} }),
    /maxOrderNotionalUsd|hard limits|required/iu
  );
  assert.throws(
    () => createHardRiskAuthority({
      ...common,
      hardLimits: { ...HARD_LIMITS, maxQuoteAgeMs: 0 }
    }),
    /maxQuoteAgeMs/iu
  );
});

test("TREE 12.5 rejection is fail-closed when durable diagnostic persistence fails", async () => {
  const authority = createHardRiskAuthority({
    hardLimits: HARD_LIMITS,
    ledger: {
      async appendDecisionRecord() {
        throw new Error("synthetic durable write failure");
      }
    },
    now: () => NOW,
    readRiskState: async () => baseRiskState(),
    readOperatorControls: async () => baseOperatorControls({ globalKillSwitch: true })
  });
  let forwarded = false;

  await assert.rejects(
    gate(authority, {
      forward: async () => {
        forwarded = true;
      }
    }),
    /durable write failure/iu
  );
  assert.equal(forwarded, false);
});

test("TREE 12.5 rejection reason is actually durable in the Trading Ledger", async () => {
  const ledger = await openTradingLedger({ dbPath: ":memory:", now: () => NOW });
  try {
    const policy = await ledger.createPolicyVersion({
      policy: { source: "synthetic-hard-risk-test" }
    });
    const run = await ledger.createTradingRun({
      policyVersionId: policy.policyVersionId,
      mode: "DRY_RUN",
      lifecycleState: "ACTIVE",
      environmentSnapshot: { source: "synthetic" },
      riskEnvelope: HARD_LIMITS
    });
    const episode = await ledger.createTradeEpisode({
      tradingRunId: run.tradingRunId,
      policyVersionId: policy.policyVersionId,
      candidateKey: "NASDAQ:AAPL",
      candidateProvenance: { source: "synthetic" }
    });
    const authority = createHardRiskAuthority({
      hardLimits: HARD_LIMITS,
      ledger,
      now: () => NOW,
      readRiskState: async () => baseRiskState(),
      readOperatorControls: async () => baseOperatorControls({ globalKillSwitch: true })
    });

    await assert.rejects(
      authority.gateOrderIntent({
        tradingRunId: run.tradingRunId,
        tradeEpisodeId: episode.tradeEpisodeId,
        intent: baseIntent(),
        quote: baseQuote()
      }, async () => {
        throw new Error("must not forward");
      }),
      (error) => error?.code === "HARD_RISK_GLOBAL_KILL_SWITCH"
    );

    const bundle = await ledger.getTradeEpisodeBundle(run.tradingRunId, episode.tradeEpisodeId);
    assert.equal(bundle.decisions.length, 1);
    assert.equal(bundle.decisions[0].decisionType, "HARD_RISK_REJECTED");
    assert.equal(bundle.decisions[0].reasonCode, "HARD_RISK_GLOBAL_KILL_SWITCH");
    assert.deepEqual(bundle.decisions[0].evidence, {
      requestId: "synthetic-risk-request-1",
      symbol: "AAPL",
      side: "BUY",
      category: "operator-control"
    });
  } finally {
    await ledger.close();
  }
});
