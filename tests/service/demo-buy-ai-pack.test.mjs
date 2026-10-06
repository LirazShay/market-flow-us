import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildUsCollectionCandidate } from "../../browser/collector/us-cycle.js";
import { openMarketFlowUsDatabase } from "../../local-service/database/database.js";
import { AI_PACK_FILE_NAMES } from "../../local-service/exports/demo-buy-ai-pack.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import { createServiceFixture } from "./helpers/service-fixture.mjs";

const OPERATIONAL_CANARY = "OPERATIONAL_SESSION_CANARY_48f0f";
const SCANNER_CANARY = "ARBITRARY_SCANNER_TEXT_CANARY_91aa1";

function rawSecurity(paperId, symbol, price) {
  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `${symbol} Incorporated`,
    PaperNameHeb: null,
    ExchangeName: "NASDAQ",
    TradeDateTime: "2026-10-06T10:00:00",
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: 1,
    DailyHigh: price + 1,
    DailyLow: price - 1,
    YearHigh: price + 10,
    YearLow: price - 10,
    DailyVolume: 1000,
    BeginYearChangePercent: 2,
    Month12ChangePercent: 3,
    Month36ChangePercent: 4,
    AskRate: price + 0.1,
    BidRate: price - 0.1,
    YesterdayRate: price - 0.5,
    PaperMarketCap: 1000000,
    PaperIdYatab: 542,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: null,
    ESGScope: 0
  };
}

function candidate({ completedAtMs, price }) {
  const records = [rawSecurity(42, "PACK", price)];
  return buildUsCollectionCandidate({
    recordCount: 1,
    records,
    responseIds: ["42"],
    membership: ["42"],
    timing: {
      startedAtMs: completedAtMs - 100,
      responseReceivedAtMs: completedAtMs - 10,
      completedAtMs,
      durationMs: 100
    },
    sourceMetadata: {
      endpoint: "ScreenerHulPaging3",
      source: OPERATIONAL_CANARY
    },
    httpStatus: 200
  });
}

function wireUniverse(universe) {
  return {
    loadedAtMs: universe.loadedAtMs,
    recordCount: universe.recordCount,
    securities: universe.securities
  };
}

function capturePayload() {
  const context = shapeDemoBuyScannerContext({
    columns: [
      { name: "security_id", type: "VARCHAR" },
      { name: "score", type: "DOUBLE" },
      { name: "comment", type: "VARCHAR" },
      { name: "Symbol", type: "VARCHAR" }
    ],
    rows: [["42", 9.5, SCANNER_CANARY, "PACK"]]
  });

  return {
    items: [{ securityId: "42", resultRank: 1 }],
    sourceQuery: {
      queryId: "user:ai-pack",
      name: "AI pack proof",
      sql: "SELECT security_id, 9.5 AS score, 'computed text' AS comment, Symbol FROM latest WHERE security_id = '42'",
      intervalMs: 3000
    },
    sourceResult: {
      startedAtMs: 995000,
      completedAtMs: 996000,
      rowCount: 1,
      context
    },
    selectionMode: "all",
    isAutomatic: false,
    topX: null
  };
}

async function startProducer(fixture) {
  const producer = await fixture.connect("producer", "ai-pack-producer");
  await producer.request("producer.session.start", {
    startedAtMs: 900000,
    config: { snapshotIntervalMs: 3000, canary: OPERATIONAL_CANARY }
  });
  const baseline = candidate({ completedAtMs: 990000, price: 100 });
  await producer.request("producer.universe.replace", wireUniverse(baseline.universe));
  const committed = await producer.request("producer.cycle.commit", {
    universeRevision: 1,
    cycle: baseline.cycle
  });
  assert.equal(committed.type, "response.ok");
  return producer;
}

async function commitCycle(producer, completedAtMs, price) {
  const next = candidate({ completedAtMs, price });
  const response = await producer.request("producer.cycle.commit", {
    universeRevision: 1,
    cycle: next.cycle
  });
  assert.equal(response.type, "response.ok");
}

async function readPackFiles(fixture, response) {
  const finalName = response.payload.data.exportPathRelative.split("/").at(-1);
  const finalPath = path.join(fixture.aiPackExportRoot, finalName);
  const names = (await readdir(finalPath)).sort();
  assert.deepEqual(names, [...AI_PACK_FILE_NAMES].sort());

  const contents = new Map();
  for (const name of names) {
    contents.set(name, await readFile(path.join(finalPath, name), "utf8"));
  }
  return { finalPath, contents };
}

function assertNoUnsafeCanaries(contents) {
  for (const [name, content] of contents) {
    assert.equal(content.includes(OPERATIONAL_CANARY), false, `${name} leaked operational canary`);
    assert.equal(content.includes(SCANNER_CANARY), false, `${name} leaked arbitrary Scanner text`);
  }
}

test("AI pack exports immutable evidence with watermark partition, sharing-safe redaction and partial-to-complete regeneration", async () => {
  const clock = { value: 1000000 };
  const fixture = await createServiceFixture({
    now: () => clock.value,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 1000000 }
  });

  try {
    const producer = await startProducer(fixture);
    const viewer = await fixture.connect("viewer", "ai-pack-viewer");

    const capture = await viewer.request("demo.buy.capture", capturePayload());
    assert.equal(capture.type, "response.ok");
    assert.equal(capture.payload.data.captureId, 1);

    const partial = await viewer.request("demo.buy.ai-pack.create", {
      captureId: 1,
      securityId: "42"
    });
    assert.equal(partial.type, "response.ok");
    assert.equal(partial.payload.data.outcomeEvidenceStatus, "PARTIAL_OUTCOME");
    assert.equal(partial.payload.data.targetInScannerContext, true);
    assert.equal(partial.payload.data.fileCount, 10);
    assert.match(partial.payload.data.exportPathRelative, /^exports\/ai-investigations\/capture-1-security-42-/);
    assert.equal(partial.payload.data.exportPathRelative.includes(fixture.tempDir), false);
    assert.equal(JSON.stringify(partial).includes(OPERATIONAL_CANARY), false);
    assert.equal(JSON.stringify(partial).includes(SCANNER_CANARY), false);

    const partialPack = await readPackFiles(fixture, partial);
    assertNoUnsafeCanaries(partialPack.contents);
    assert.equal(partialPack.contents.get("QUERY.sql"), capturePayload().sourceQuery.sql);
    assert.match(partialPack.contents.get("README.md"), /review every generated file/i);
    assert.match(partialPack.contents.get("PROMPT.md"), /returned Scanner row position/i);

    const scannerContext = JSON.parse(partialPack.contents.get("SCANNER_CONTEXT.json"));
    assert.equal(scannerContext.rows[0].values[0], "42");
    assert.equal(scannerContext.rows[0].values[1], 9.5);
    assert.equal(scannerContext.rows[0].values[2].redactedForSharing, true);
    assert.equal(scannerContext.rows[0].values[3], "PACK");

    const baseline = JSON.parse(partialPack.contents.get("BASELINE.json"));
    assert.equal(baseline.cycle_id, 1);
    assert.equal(baseline.security_id, "42");
    assert.equal(baseline.Price, 100);
    assert.ok(Object.hasOwn(baseline, "raw_data"));
    assert.equal(Object.hasOwn(baseline, "session_id"), false);
    assert.equal(Object.hasOwn(baseline, "source_metadata_json"), false);

    const beforeLines = partialPack.contents.get("TARGET_BEFORE.jsonl").trim().split("\n");
    assert.equal(beforeLines.length, 1);
    assert.equal(JSON.parse(beforeLines[0]).cycle_id, 1);
    assert.equal(partialPack.contents.get("TARGET_AFTER.jsonl"), "");

    const authorityBefore = await fixture.rows("SELECT COUNT(*) AS n FROM history");
    const capturesBefore = await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_captures");

    await commitCycle(producer, 1600000, 90);
    clock.value = 1601000;

    const complete = await viewer.request("demo.buy.ai-pack.create", {
      captureId: 1,
      securityId: "42"
    });
    assert.equal(complete.type, "response.ok");
    assert.equal(complete.payload.data.outcomeEvidenceStatus, "COMPLETE_OUTCOME");
    assert.notEqual(complete.payload.data.exportPathRelative, partial.payload.data.exportPathRelative);

    const completePack = await readPackFiles(fixture, complete);
    assertNoUnsafeCanaries(completePack.contents);
    assert.equal(completePack.contents.get("QUERY.sql"), partialPack.contents.get("QUERY.sql"));
    assert.equal(completePack.contents.get("SCANNER_CONTEXT.json"), partialPack.contents.get("SCANNER_CONTEXT.json"));
    assert.equal(completePack.contents.get("BASELINE.json"), partialPack.contents.get("BASELINE.json"));

    const afterLines = completePack.contents.get("TARGET_AFTER.jsonl").trim().split("\n");
    assert.equal(afterLines.length, 1);
    assert.equal(JSON.parse(afterLines[0]).cycle_id, 2);
    assert.equal(JSON.parse(afterLines[0]).Price, 90);

    const outcome = JSON.parse(completePack.contents.get("OUTCOME.json"));
    const tenMinutes = outcome.horizons.find((entry) => entry.horizonMs === 600000);
    assert.equal(tenMinutes.observedAtMs, 1600000);
    assert.equal(tenMinutes.outcome, "DOWN");

    const authorityAfter = await fixture.rows("SELECT COUNT(*) AS n FROM history");
    const capturesAfter = await fixture.rows("SELECT COUNT(*) AS n FROM demo_buy_captures");
    assert.equal(Number(authorityAfter[0].n), 2);
    assert.equal(Number(capturesAfter[0].n), Number(capturesBefore[0].n));
    assert.equal(Number(authorityAfter[0].n), Number(authorityBefore[0].n) + 1);

    const diagnostics = JSON.stringify(fixture.service.diagnostics.snapshot());
    assert.equal(diagnostics.includes(OPERATIONAL_CANARY), false);
    assert.equal(diagnostics.includes(SCANNER_CANARY), false);
    assert.equal(diagnostics.includes(capturePayload().sourceQuery.sql), false);
  } finally {
    await fixture.cleanup();
  }
});

test("AI pack write fault cleans temporary output and returns a stable safe error", async () => {
  const fixture = await createServiceFixture({
    now: () => 1000000,
    openDatabase: openMarketFlowUsDatabase,
    config: { producerStaleAfterMs: 1000000 }
  });

  try {
    await startProducer(fixture);
    const viewer = await fixture.connect("viewer", "ai-pack-fault-viewer");
    const capture = await viewer.request("demo.buy.capture", capturePayload());
    assert.equal(capture.type, "response.ok");

    fixture.aiPackFault.enable("AI_PACK_AFTER_FIRST_FILE");
    const failed = await viewer.request("demo.buy.ai-pack.create", {
      captureId: 1,
      securityId: "42"
    });
    assert.equal(failed.type, "response.error");
    assert.equal(failed.payload.code, "DEMO_BUY_AI_PACK_EXPORT_ERROR");
    assert.equal(failed.payload.details, null);
    assert.equal(JSON.stringify(failed).includes(OPERATIONAL_CANARY), false);
    assert.equal(JSON.stringify(failed).includes(SCANNER_CANARY), false);

    const entriesAfterFailure = await readdir(fixture.aiPackExportRoot);
    assert.deepEqual(entriesAfterFailure, []);

    fixture.aiPackFault.disable("AI_PACK_AFTER_FIRST_FILE");
    const recovered = await viewer.request("demo.buy.ai-pack.create", {
      captureId: 1,
      securityId: "42"
    });
    assert.equal(recovered.type, "response.ok");
    assert.equal(recovered.payload.data.fileCount, 10);
  } finally {
    await fixture.cleanup();
  }
});
