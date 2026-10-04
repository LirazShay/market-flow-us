import assert from "node:assert/strict";
import test from "node:test";

import {
  US_CURRENT_COLUMNS,
  US_CURRENT_PROFILE,
  createCurrentModel,
  createInitialCurrentSort,
  formatCurrentCell,
  nextCurrentSort,
  sortCurrentRows
} from "../../browser/viewer/current-model.js";
import {
  US_DETAIL_PROFILE,
  US_DETAIL_SUMMARY_COLUMNS,
  US_HISTORY_COLUMNS,
  appendDetailHistory,
  createDetailModel,
  formatDetailSummaryValue,
  formatHistoryCell
} from "../../browser/viewer/detail-model.js";

const EXPECTED_CURRENT_KEYS = [
  "paperName",
  "Symbol",
  "ExchangeName",
  "securityId",
  "Price",
  "ChangePercent",
  "BidRate",
  "AskRate",
  "DailyVolume",
  "DailyLow",
  "DailyHigh",
  "YesterdayRate",
  "PaperMarketCap",
  "TradeDateTime",
  "collectedAtMs"
];

const EXPECTED_SUMMARY_KEYS = [
  "Price",
  "ChangePercent",
  "BidRate",
  "AskRate",
  "DailyVolume",
  "TradeDateTime"
];

const EXPECTED_HISTORY_KEYS = [
  "collectedAtMs",
  "cycleId",
  "Price",
  "ChangePercent",
  "BidRate",
  "AskRate",
  "DailyVolume",
  "DailyLow",
  "DailyHigh",
  "YesterdayRate",
  "PaperMarketCap",
  "TradeDateTime"
];

test("U.S. Current profile exposes exact columns, DailyVolume DESC and identity tie-breaks", () => {
  assert.deepEqual(US_CURRENT_COLUMNS.map((column) => column.key), EXPECTED_CURRENT_KEYS);
  assert.deepEqual(createInitialCurrentSort(US_CURRENT_PROFILE), {
    key: "DailyVolume",
    direction: "desc"
  });

  const model = createCurrentModel({
    rows: [
      { paperName: "Zulu", securityId: "20", DailyVolume: 100, Price: 0 },
      { paperName: "Alpha", securityId: "10", DailyVolume: 100, Price: 5 },
      { paperName: "High", securityId: "30", DailyVolume: 200, Price: 10 },
      { paperName: "Null", securityId: "40", DailyVolume: null, Price: null },
      { paperName: "Missing", securityId: "50", Price: 12 }
    ],
    summary: {
      rowCount: 5,
      lastCycleId: 7,
      lastCollectedAtMs: 1234
    }
  });

  const initial = createInitialCurrentSort(US_CURRENT_PROFILE);
  assert.deepEqual(
    sortCurrentRows(model.rows, initial, US_CURRENT_PROFILE).map((row) => row.securityId),
    ["30", "10", "20", "40", "50"]
  );

  const ascending = nextCurrentSort(initial, "DailyVolume", US_CURRENT_PROFILE);
  assert.deepEqual(ascending, { key: "DailyVolume", direction: "asc" });
  assert.deepEqual(
    sortCurrentRows(model.rows, ascending, US_CURRENT_PROFILE).map((row) => row.securityId),
    ["10", "20", "30", "40", "50"]
  );

  assert.equal(formatCurrentCell("Price", 0, US_CURRENT_PROFILE), "0");
  assert.equal(formatCurrentCell("Price", null, US_CURRENT_PROFILE), "—");
  assert.equal(formatCurrentCell("ChangePercent", 0, US_CURRENT_PROFILE), "0%");
  assert.equal(formatCurrentCell("TradeDateTime", "2026-10-04T19:00:00", US_CURRENT_PROFILE), "2026-10-04T19:00:00");
});

test("U.S. Detail profile exposes exact summary/history fields and accepts history without legacy chunk metadata", () => {
  assert.deepEqual(US_DETAIL_SUMMARY_COLUMNS.map((column) => column.key), EXPECTED_SUMMARY_KEYS);
  assert.deepEqual(US_HISTORY_COLUMNS.map((column) => column.key), EXPECTED_HISTORY_KEYS);

  const security = {
    found: true,
    securityId: "101",
    paperName: "Alpha Inc",
    isCurrent: true,
    currentRow: {
      paperName: "Alpha Inc",
      Symbol: "AAA",
      ExchangeName: "NASDAQ",
      securityId: "101",
      Price: 0,
      ChangePercent: 1.5,
      BidRate: 9.9,
      AskRate: 10.1,
      DailyVolume: 0,
      DailyLow: 9,
      DailyHigh: 11,
      YesterdayRate: 10,
      PaperMarketCap: 1000000,
      TradeDateTime: "2026-10-04T19:00:00",
      collectedAtMs: 2000
    }
  };
  const firstHistoryRow = {
    collectedAtMs: 2000,
    cycleId: 2,
    Price: 0,
    ChangePercent: 1.5,
    BidRate: 9.9,
    AskRate: 10.1,
    DailyVolume: 0,
    DailyLow: 9,
    DailyHigh: 11,
    YesterdayRate: 10,
    PaperMarketCap: 1000000,
    TradeDateTime: "2026-10-04T19:00:00"
  };

  const model = createDetailModel(
    security,
    {
      rows: [firstHistoryRow],
      hasMore: true,
      nextCursor: "cursor-1"
    },
    US_DETAIL_PROFILE
  );

  assert.equal(model.rows.length, 1);
  assert.equal(formatDetailSummaryValue(model, "Price", US_DETAIL_PROFILE), "0");
  assert.equal(formatDetailSummaryValue(model, "ChangePercent", US_DETAIL_PROFILE), "1.5%");
  assert.equal(formatHistoryCell("DailyVolume", 0, US_DETAIL_PROFILE), "0");
  assert.equal(formatHistoryCell("DailyVolume", null, US_DETAIL_PROFILE), "—");

  const appended = appendDetailHistory(
    model,
    {
      rows: [{ ...firstHistoryRow, collectedAtMs: 1000, cycleId: 1, Price: 8 }],
      hasMore: false,
      nextCursor: null
    },
    US_DETAIL_PROFILE
  );
  assert.equal(appended.rows.length, 2);
  assert.equal(appended.rows[1].cycleId, 1);
  assert.equal(appended.hasMore, false);
});

test("U.S. Detail historical-only model keeps identity while current summary remains missing", () => {
  const model = createDetailModel(
    {
      found: true,
      securityId: "9001",
      paperName: "History Only",
      isCurrent: false,
      currentRow: null
    },
    {
      rows: [{
        collectedAtMs: 1000,
        cycleId: 1,
        Price: 8,
        ChangePercent: null,
        BidRate: null,
        AskRate: null,
        DailyVolume: 100,
        DailyLow: 7,
        DailyHigh: 9,
        YesterdayRate: 7.5,
        PaperMarketCap: null,
        TradeDateTime: null
      }],
      hasMore: false,
      nextCursor: null
    },
    US_DETAIL_PROFILE
  );

  assert.equal(model.title, "History Only");
  assert.equal(model.isCurrent, false);
  assert.equal(formatDetailSummaryValue(model, "Price", US_DETAIL_PROFILE), "—");
});
