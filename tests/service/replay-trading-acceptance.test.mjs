import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { WebSocket } from "ws";

import { buildValidatedSnapshot } from "../../browser/provider/us-screener.js";
import { createMarketReplayPlayer } from "../../browser/replay/market-player.js";
import { createReplayFrame } from "../../browser/replay/recording-model.js";
import { createRecordingSource } from "../../browser/replay/recording-source.js";
import { createProducerBridge } from "../../browser/runtime/producer-bridge.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { openTradingLedger } from "../../trading-server/ledger.js";
import { admitScannerCandidate } from "../../trading-server/scanner-candidate-admission.js";
import { createTradingSupervisorRuntime } from "../../trading-server/supervisor-runtime.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

const POLICY_ID = "pol_88888888-8888-4888-8888-888888888888";
const RUN_ID = "trun_88888888-8888-4888-8888-888888888888";
const EPISODE_ID = "tep_88888888-8888-4888-8888-888888888888";
const WALL_NOW = 1_901_100_000_000;
const REPLAY_FRAME_AT_MS = 10_000;
const AAPL = Object.freeze({
  symbol: "AAPL",
  secType: "STK",
  currency: "USD",
  exchange: "SMART"
});

function rawSecurity(price) {
  return {
    PaperId: 1001,
    Symbol: "AAPL",
    PaperNameEng: "Apple Inc.",
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-09T14:31:00Z",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 50_000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 3_000_000,
    PaperIdYatab: 1501,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function replaySnapshot(price) {
  return buildValidatedSnapshot({
    responseJson: {
      data: {
        ScreenerHulPaging: {
          recordCount: 1,
          records: [rawSecurity(price)]
        }
      },
      resultCode: 0,
      rtUsa: true,
      serverId: "tree-12.9-historical-replay"
    },
    timing: {
      startedAtMs: REPLAY_FRAME_AT_MS - 20,
      responseReceivedAtMs: REPLAY_FRAME_AT_MS - 5,
      completedAtMs: REPLAY_FRAME_AT_MS
    },
    httpStatus: 200
  });
}

function replaySource(snapshot) {
  const frame = createReplayFrame({
    recordingId: "tree-12.9-historical-replay",
    sequence: 0,
    snapshot
  });

  return createRecordingSource({
    kind: "tree-12.9-acceptance",
    summary: {
      id: "tree-12.9-historical-replay",
      name: "TREE 12.9 historical Replay acceptance",
      status: "complete",
      createdAtMs: REPLAY_FRAME_AT_MS,
      firstFrameAtMs: REPLAY_FRAME_AT_MS,
      lastFrameAtMs: REPLAY_FRAME_AT_MS,
      durationMs: 0,
      frameCount: 1,
      approximateBytes: 1_024
    },
    frameIndex: [{
      sequence: 0,
      completedAtMs: REPLAY_FRAME_AT_MS
    }],
    readFrame: async (sequence) => {
      assert.equal(sequence, 0);
      return structuredClone(frame);
    }
  });
}

function uuidFactory(prefix, start = 1) {
  let value = start;
  return () => {
    const tail = String(value).padStart(12, "0");
    value += 1;
    return `${prefix}_00000000-0000-4000-8000-${tail}`;
  };
}

function clock(start = WALL_NOW) {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

async function openLedger(dbPath, { start = 1, now = clock() } = {}) {
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

function rowsAsObjects(result) {
  const names = result.columns.map((column) => column.name);
  return result.rows.map((row) => Object.fromEntries(
    names.map((name, index) => [name, row[index]])
  ));
}

test("TREE 12.9 historical Replay feeds Scanner and SHADOW Supervisor without broker mutation", async () => {
  let wallNowMs = WALL_NOW;
  const service = await createServiceFixture({
    now: () => wallNowMs,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 60_000 }
  });
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-flow-us-trading-replay-acceptance-"));
  const dbPath = path.join(tempDir, "trading-ledger.duckdb");
  let ledger = null;
  let viewer = null;

  const producerBridge = createProducerBridge({
    url: service.url,
    productVersion: "tree-12.9-historical-replay",
    clientInstanceId: "tree-12.9-historical-replay",
    createSocket(url) {
      return new WebSocket(url, { origin: service.origin });
    },
    createBroadcastChannel: () => ({
      postMessage() {},
      close() {}
    }),
    schedule: () => ({ cancelled: false }),
    cancelSchedule: (token) => {
      token.cancelled = true;
    },
    now: () => wallNowMs
  });
  const player = createMarketReplayPlayer({
    source: replaySource(replaySnapshot(187.25)),
    producerBridge,
    now: () => wallNowMs
  });

  try {
    await player.play();
    assert.equal(player.getState().status, "completed");
    assert.equal(player.getState().committedFrameCount, 1);

    viewer = await service.connect("viewer", "tree-12.9-historical-replay-viewer");
    const scannerSql = "SELECT security_id, Symbol, Price AS last FROM latest ORDER BY security_id LIMIT 10;";
    const scannerResponse = await viewer.request("scanner.execute", { sql: scannerSql });
    assert.equal(scannerResponse.type, "response.ok");
    assert.equal(scannerResponse.payload.data.rowCount, 1);

    const scannerResult = scannerResponse.payload.data;
    const scannerRows = rowsAsObjects(scannerResult);
    assert.equal(scannerRows[0].security_id, "1001");
    assert.equal(scannerRows[0].Symbol, "AAPL");
    assert.equal(scannerRows[0].last, 187.25);

    ledger = await openLedger(dbPath, { now: clock(WALL_NOW + 100) });
    await ledger.createPolicyVersion({
      policy: {
        entry: { source: "historical-replay" },
        exit: { maxHoldMs: 120_000 }
      }
    });
    await ledger.createTradingRun({
      policyVersionId: POLICY_ID,
      mode: "SHADOW",
      environmentSnapshot: {
        source: "historical-replay",
        recordingId: "tree-12.9-historical-replay"
      },
      riskEnvelope: { maxOpenEpisodes: 1, maxNotionalUsd: 500 }
    });

    const episode = await admitScannerCandidate({
      ledger,
      tradingRunId: RUN_ID,
      policyVersionId: POLICY_ID,
      context: {
        generation: 1,
        queryId: "query-tree-12.9-historical-replay",
        queryName: "TREE 12.9 historical Replay candidate",
        sql: scannerSql,
        intervalMs: 1_000,
        startedAtMs: scannerResult.startedAtMs,
        completedAtMs: scannerResult.completedAtMs
      },
      result: {
        columns: scannerResult.columns,
        rows: scannerResult.rows,
        rowCount: scannerResult.rowCount
      },
      resultRank: 1,
      admittedAtMs: scannerResult.completedAtMs + 1
    });
    assert.equal(episode.candidateKey, "1001");
    assert.equal(episode.candidateProvenance.sourceQuery.queryId, "query-tree-12.9-historical-replay");

    let orderIntentBuilds = 0;
    let brokerMutations = 0;
    let replayQuotePolls = 0;
    const replayQuote = Object.freeze({
      instrument: AAPL,
      resolutionStatus: "EXACT",
      conid: 265598,
      availability: "AVAILABLE",
      staleness: "FRESH",
      usableForNewDecision: true,
      marketDataAvailability: "REPLAY",
      last: scannerRows[0].last,
      bid: scannerRows[0].last - 0.1,
      ask: scannerRows[0].last + 0.1,
      providerUpdatedAtMs: scannerResult.completedAtMs,
      receivedAtMs: scannerResult.completedAtMs
    });
    const supervisor = createTradingSupervisorRuntime({
      ledger,
      quoteWatch: {
        async poll(instruments) {
          replayQuotePolls += 1;
          assert.deepEqual(instruments, [AAPL]);
          return [replayQuote];
        }
      },
      protectedOrderBridge: {
        async submitOrderIntent() {
          brokerMutations += 1;
          throw new Error("historical/replay acceptance must not reach broker mutation");
        }
      },
      async buildOrderIntent() {
        orderIntentBuilds += 1;
        throw new Error("historical/replay acceptance must not build an order intent");
      },
      now: clock(WALL_NOW + 200)
    });

    const watching = await supervisor.startWatching({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID
    });
    assert.equal(watching.supervisorState.lifecycleState, "WATCHING");

    const decision = await supervisor.evaluateCycle({
      tradingRunId: RUN_ID,
      tradeEpisodeId: EPISODE_ID,
      instrument: AAPL,
      proposal: null
    });
    assert.equal(decision.status, "DECIDED");
    assert.equal(decision.action.type, "NONE");
    assert.equal(decision.state.lifecycleState, "WATCHING");
    assert.equal(decision.decision.source, "DETERMINISTIC_FALLBACK");
    assert.equal(decision.decision.reasonCode, "AI_UNAVAILABLE_FALLBACK_WAIT");
    assert.equal(decision.quote.marketDataAvailability, "REPLAY");
    assert.equal(replayQuotePolls, 1);
    assert.equal(orderIntentBuilds, 0);
    assert.equal(brokerMutations, 0);

    const beforeRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(beforeRestart.episode.candidateProvenance.securityId, "1001");
    assert.equal(beforeRestart.episode.candidateProvenance.scannerGeneration.generation, 1);
    assert.equal(beforeRestart.episode.candidateProvenance.rowEvidence.values.includes(187.25), true);
    assert.equal(beforeRestart.observations.length, 1);
    assert.equal(beforeRestart.observations[0].observation.marketDataAvailability, "REPLAY");
    assert.equal(beforeRestart.decisions.length, 1);
    assert.equal(beforeRestart.decisions[0].decisionType, "NONE");
    assert.equal(beforeRestart.decisions[0].reasonCode, "AI_UNAVAILABLE_FALLBACK_WAIT");
    assert.equal(beforeRestart.orderReferences.length, 0);

    await ledger.close();
    ledger = await openLedger(dbPath, { start: 100, now: clock(WALL_NOW + 1_000) });
    const afterRestart = await ledger.getTradeEpisodeBundle(RUN_ID, EPISODE_ID);
    assert.equal(afterRestart.episode.candidateProvenance.sourceQuery.sql, scannerSql);
    assert.equal(afterRestart.observations.length, 1);
    assert.equal(afterRestart.decisions.length, 1);
    assert.equal(afterRestart.orderReferences.length, 0);
  } finally {
    if (viewer) await viewer.close();
    if (ledger) await ledger.close();
    await service.cleanup();
    await rm(tempDir, { recursive: true, force: true });
  }
});
