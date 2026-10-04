import assert from "node:assert/strict";
import test from "node:test";

import {
  HISTORY_COLUMNS,
  createDetailModel,
  formatDetailSummaryValue,
  formatHistoryCell
} from "../../browser/viewer/detail-model.js";

const EXPECTED_HISTORY_COLUMNS = [
  ["collectedAtMs", "זמן איסוף"],
  ["cycleId", "Cycle"],
  ["chunkIndex", "Chunk"],
  ["LastKnownRate", "שער אחרון"],
  ["BaseRateChangePercentage", "שינוי יומי %"],
  ["BuyLimit1", "BID1"],
  ["BuyVolume1", "כמות BID1"],
  ["SellLimit1", "ASK1"],
  ["SellVolume1", "כמות ASK1"],
  ["DailyDealsQuantity", "מס' עסקאות"],
  ["LastDealVolume", "כמות עסקה אחרונה"],
  ["DailyTurnover", "כמות יומית"],
  ["DailyNISRevenue", "מחזור כספי"],
  ["LastDealTimeOnly", "עסקה אחרונה"],
  ["serverAsOfDate", "זמן שרת"]
];

test("Detail preserves the exact 15-column History contract and shared formatting family", () => {
  assert.deepEqual(
    HISTORY_COLUMNS.map(({ key, label }) => [key, label]),
    EXPECTED_HISTORY_COLUMNS
  );

  assert.equal(formatHistoryCell("LastKnownRate", null), "—");
  assert.equal(formatHistoryCell("LastKnownRate", 0), "0");
  assert.equal(formatHistoryCell("BaseRateChangePercentage", 0), "0%");
  assert.match(formatHistoryCell("collectedAtMs", Date.now()), /^\d{2}:\d{2}:\d{2}$/u);
  assert.equal(formatHistoryCell("serverAsOfDate", ""), "—");
  assert.equal(formatHistoryCell("serverAsOfDate", "fixture-cycle-9"), "fixture-cycle-9");
});

test("historical-only Detail never promotes newest history into the Current summary", () => {
  const model = createDetailModel({
    found: true,
    securityId: "9001",
    paperName: "Historical Alpha",
    isCurrent: false,
    currentRow: null
  }, {
    rows: [{
      collectedAtMs: 1000,
      cycleId: 77,
      chunkIndex: 0,
      LastKnownRate: 9999,
      BaseRateChangePercentage: 8.5,
      BuyLimit1: 9990,
      BuyVolume1: 10,
      SellLimit1: 10000,
      SellVolume1: 11,
      DailyDealsQuantity: 55,
      LastDealVolume: 2,
      DailyTurnover: 100,
      DailyNISRevenue: 200,
      LastDealTimeOnly: "10:10:10",
      serverAsOfDate: "fixture"
    }],
    hasMore: false,
    nextCursor: null
  });

  assert.equal(model.title, "Historical Alpha");
  assert.equal(model.isCurrent, false);
  assert.equal(model.currentRow, null);
  assert.equal(model.rows.length, 1);
  assert.equal(formatDetailSummaryValue(model, "LastKnownRate"), "—");
  assert.equal(formatDetailSummaryValue(model, "BaseRateChangePercentage"), "—");
});

test("current Detail summary uses only authoritative currentRow and keeps zero distinct from missing", () => {
  const model = createDetailModel({
    found: true,
    securityId: "1002",
    paperName: "Fixture Beta",
    isCurrent: true,
    currentRow: {
      securityId: "1002",
      paperName: "Fixture Beta",
      LastKnownRate: 0,
      BaseRateChangePercentage: 0,
      BuyLimit1: null,
      SellLimit1: 10,
      LastDealTimeOnly: null
    }
  }, {
    rows: [],
    hasMore: false,
    nextCursor: null
  });

  assert.equal(formatDetailSummaryValue(model, "LastKnownRate"), "0");
  assert.equal(formatDetailSummaryValue(model, "BaseRateChangePercentage"), "0%");
  assert.equal(formatDetailSummaryValue(model, "BuyLimit1"), "—");
  assert.equal(formatDetailSummaryValue(model, "SellLimit1"), "10");
  assert.equal(formatDetailSummaryValue(model, "LastDealTimeOnly"), "—");
});
