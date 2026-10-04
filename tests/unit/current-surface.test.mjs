import assert from "node:assert/strict";
import test from "node:test";

import {
  CURRENT_COLUMNS,
  createCurrentModel,
  createInitialCurrentSort,
  formatCurrentCell,
  formatRecorderHealth,
  nextCurrentSort,
  sortCurrentRows
} from "../../browser/viewer/current-model.js";

const EXPECTED_COLUMNS = [
  ["paperName", "שם נייר"],
  ["securityId", "מספר נייר"],
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
  ["DailyLowestRate", "נמוך יומי"],
  ["DailyHighestRate", "גבוה יומי"],
  ["LastDealTimeOnly", "עסקה אחרונה"],
  ["collectedAtMs", "נאסף בשעה"]
];

test("Current model preserves the exact 16-column contract and rejects duplicate canonical IDs", () => {
  assert.deepEqual(
    CURRENT_COLUMNS.map(({ key, label }) => [key, label]),
    EXPECTED_COLUMNS
  );

  const model = createCurrentModel({
    rows: [
      { securityId: "1001", paperName: "Alpha", DailyDealsQuantity: 5 },
      { securityId: "1002", paperName: "Beta", DailyDealsQuantity: 7 }
    ],
    summary: {
      rowCount: 2,
      lastCycleId: 9,
      lastCollectedAtMs: 12345
    }
  });

  assert.equal(model.rows.length, 2);
  assert.deepEqual(model.summary, {
    rowCount: 2,
    lastCycleId: 9,
    lastCollectedAtMs: 12345
  });

  assert.throws(
    () => createCurrentModel({
      rows: [{ securityId: "1001" }, { securityId: "1001" }],
      summary: { rowCount: 2, lastCycleId: 1, lastCollectedAtMs: 1 }
    }),
    /duplicate securityId/i
  );
});

test("Current sorting is deterministic, toggles direction, and keeps missing ranks last independently of direction", () => {
  const rows = [
    { paperName: "Beta", securityId: "2", DailyDealsQuantity: 20 },
    { paperName: "Alpha", securityId: "10", DailyDealsQuantity: 20 },
    { paperName: "Alpha", securityId: "3", DailyDealsQuantity: 20 },
    { paperName: "Delta", securityId: "4", DailyDealsQuantity: 10 },
    { paperName: "Null", securityId: "5", DailyDealsQuantity: null },
    { paperName: "Undefined", securityId: "6" },
    { paperName: "Empty", securityId: "7", DailyDealsQuantity: "" }
  ];

  const initial = createInitialCurrentSort();
  assert.deepEqual(initial, { key: "DailyDealsQuantity", direction: "desc" });
  assert.deepEqual(
    sortCurrentRows(rows, initial).map((row) => row.securityId),
    ["10", "3", "2", "4", "5", "6", "7"]
  );

  const ascendingDeals = nextCurrentSort(initial, "DailyDealsQuantity");
  assert.deepEqual(ascendingDeals, { key: "DailyDealsQuantity", direction: "asc" });
  assert.deepEqual(
    sortCurrentRows(rows, ascendingDeals).map((row) => row.securityId),
    ["4", "10", "3", "2", "5", "6", "7"]
  );

  assert.deepEqual(
    nextCurrentSort(initial, "paperName"),
    { key: "paperName", direction: "asc" }
  );
  assert.deepEqual(
    nextCurrentSort(initial, "LastKnownRate"),
    { key: "LastKnownRate", direction: "desc" }
  );
});

test("Current formatting keeps zero distinct from missing and applies percentage/time semantics", () => {
  assert.equal(formatCurrentCell("LastKnownRate", null), "—");
  assert.equal(formatCurrentCell("LastKnownRate", undefined), "—");
  assert.equal(formatCurrentCell("LastKnownRate", ""), "—");
  assert.equal(formatCurrentCell("LastKnownRate", 0), "0");
  assert.equal(formatCurrentCell("BaseRateChangePercentage", 0), "0%");
  assert.equal(formatCurrentCell("paperName", "Fixture Alpha"), "Fixture Alpha");
  assert.match(formatCurrentCell("collectedAtMs", Date.now()), /^\d{2}:\d{2}:\d{2}$/u);

  assert.equal(formatRecorderHealth("UNKNOWN"), "לא ידוע");
  assert.equal(formatRecorderHealth("RUNNING"), "רץ");
  assert.equal(formatRecorderHealth("STALE"), "לא מעודכן");
  assert.equal(formatRecorderHealth("STOPPED"), "נעצר");
  assert.equal(formatRecorderHealth("ERROR"), "שגיאה");
});
