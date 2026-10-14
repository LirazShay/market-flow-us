import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { openTradingLedger } from "../../trading-server/ledger.js";
import { runLiveMarketShadowObservation } from "../../trading-server/live-shadow-acceptance.js";

const POLICY_ID = "pol_77777777-7777-4777-8777-777777777777";
const RUN_ID = "trun_77777777-7777-4777-8777-777777777777";
const EPISODE_ID = "tep_77777777-7777-4777-8777-777777777777";
const NOW = 10_000;
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});

function uuidFactory(prefix, start = 1) {
  let value = start;
  return () => {
    const tail = String(value).padStart(12, "0");
    value += 1;
    return `${prefix}_00000000-0000-4000-8000-${tail}`;
  };
}

async function openLedger(dbPath, { start = 1, now = () => NOW } = {}) {
  return openTradingLedger({
    dbPath,
    now,
    policyVersionIdFactory: () => POLICY_ID,
    tradingRunIdFactory: () => RUN_ID,
    tradeEpisodeIdFactory: () => EPISODE_ID,
    candidateObservationIdFactory: uuidFactory("obs", start),
    decisionRecordIdFactory: uuidFactory("dec", start),
    orderReferenceIdFactory: uuidFactory("ordref", start),
    positionStateIdFactory: uuidFactory("pos", start),
    episodeOutcomeIdFactory: uuidFactory("out", start)
  });
}

function adapterWithSnapshot({ updatedAtMs, status = "READY" }) {
  const calls = [];
  return {
    calls,
    async resolveInstrument(instrument) {
      calls.push({ method: "resolveInstrument", instrument });
      return {
        status: "EXACT",
        conid: 265598,
        instrument: AAPL
      };
    },
    async getSnapshot({ resolution }) {
      calls.push({ method: "getSnapshot", conid: resolution.conid });
      return {
        status,
        conid: resolution.conid,
        last: 221.5,
        bid: 221.49,
        ask: 221.51,
        updatedAtMs,
        marketDataAvailability: "RpB"
      };
    }
  };
}

async function withLedger(prefix, operation) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;
  try {
    ledger = await openLedger(dbPath);
    await operation({
      ledger,
      dbPath,
      async closeLedger() {
        if (!ledger) return;
        await ledger.close();
        ledger = null;
      }
    });
  } finally {
    if (ledger) await ledger.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("TREE 12.9 live-market shadow accepts a fresh read-only quote while keeping every order stage disabled", async () => {
  await withLedger("market-flow-us-live-shadow-pass-", async ({ ledger, dbPath, closeLedger }) => {
    const adapter = adapterWithSnapshot({ updatedAtMs: NOW - 100 });
    const report = await runLiveMarketShadowObservation({
      ledger,
      adapter,
      instrument: AAPL,
      maxQuoteAgeMs: 500,
      now: () => NOW
    });

    assert.equal(report.status, "PASS");
    assert.equal(report.reasonCode, "SHADOW_LIVE_QUOTE_ACCEPTED");
    assert.equal(report.mode, "SHADOW");
    assert.equal(report.nextStageEnabled, false);
    assert.deepEqual(report.instrument, AAPL);
    assert.equal(report.quote.resolutionStatus, "EXACT");
    assert.equal(report.quote.availability, "AVAILABLE");
    assert.equal(report.quote.staleness, "FRESH");
    assert.equal(report.quote.usableForNewDecision, true);
    assert.equal(report.quote.last, 221.5);
    assert.equal(report.decision.status, "DECIDED");
    assert.equal(report.decision.actionType, "NONE");
    assert.equal(report.decision.reasonCode, "AI_UNAVAILABLE_FALLBACK_WAIT");
    assert.deepEqual(report.orderPath, {
      orderIntentBuilds: 0,
      brokerMutations: 0
    });
    assert.deepEqual(report.durableEvidence, {
      observations: 1,
      decisions: 1,
      orderReferences: 0
    });
    assert.deepEqual(adapter.calls.map((call) => call.method), [
      "resolveInstrument",
      "getSnapshot"
    ]);

    const beforeClose = await ledger.getTradeEpisodeBundle(report.tradingRunId, report.tradeEpisodeId);
    assert.equal(beforeClose.observations[0].observation.marketDataAvailability, "RpB");
    assert.equal(beforeClose.observations[0].observation.usableForNewDecision, true);
    assert.equal(beforeClose.decisions[0].reasonCode, "AI_UNAVAILABLE_FALLBACK_WAIT");
    assert.equal(beforeClose.orderReferences.length, 0);

    await closeLedger();
    const reopened = await openTradingLedger({ dbPath, now: () => NOW + 1_000 });
    try {
      const afterRestart = await reopened.getTradeEpisodeBundle(report.tradingRunId, report.tradeEpisodeId);
      assert.equal(afterRestart.observations.length, 1);
      assert.equal(afterRestart.decisions.length, 1);
      assert.equal(afterRestart.orderReferences.length, 0);
    } finally {
      await reopened.close();
    }
  });
});

test("TREE 12.9 live-market shadow fails closed on stale quote evidence without enabling an order path", async () => {
  await withLedger("market-flow-us-live-shadow-stale-", async ({ ledger }) => {
    const adapter = adapterWithSnapshot({ updatedAtMs: NOW - 2_000 });
    const report = await runLiveMarketShadowObservation({
      ledger,
      adapter,
      instrument: AAPL,
      maxQuoteAgeMs: 500,
      now: () => NOW
    });

    assert.equal(report.status, "FAIL");
    assert.equal(report.reasonCode, "SHADOW_QUOTE_STALE");
    assert.equal(report.mode, "SHADOW");
    assert.equal(report.nextStageEnabled, false);
    assert.equal(report.quote.availability, "AVAILABLE");
    assert.equal(report.quote.staleness, "STALE");
    assert.equal(report.quote.usableForNewDecision, false);
    assert.equal(report.decision.actionType, "NONE");
    assert.deepEqual(report.orderPath, {
      orderIntentBuilds: 0,
      brokerMutations: 0
    });
    assert.equal(report.durableEvidence.observations, 1);
    assert.equal(report.durableEvidence.decisions, 1);
    assert.equal(report.durableEvidence.orderReferences, 0);

    const durable = await ledger.getTradeEpisodeBundle(report.tradingRunId, report.tradeEpisodeId);
    assert.equal(durable.observations[0].observation.staleness, "STALE");
    assert.equal(durable.orderReferences.length, 0);
  });
});

test("TREE 12.9 live-market shadow rejects an invalid instrument before provider or ledger mutation", async () => {
  await withLedger("market-flow-us-live-shadow-input-", async ({ ledger }) => {
    const adapter = adapterWithSnapshot({ updatedAtMs: NOW - 100 });

    await assert.rejects(
      runLiveMarketShadowObservation({
        ledger,
        adapter,
        instrument: { ...AAPL, exchange: "NASDAQ" },
        maxQuoteAgeMs: 500,
        now: () => NOW
      }),
      /STK|USD|SMART|instrument/iu
    );

    assert.equal(adapter.calls.length, 0);
    assert.deepEqual(await ledger.listTradingRuns(), []);
  });
});
