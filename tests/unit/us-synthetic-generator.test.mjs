import assert from "node:assert/strict";
import test from "node:test";
import { createUsSyntheticGenerator } from "../fake-market/us-synthetic.mjs";

test("U.S. synthetic generator is deterministic and externally configurable", () => {
  const generator = createUsSyntheticGenerator({
    universeSize: 6,
    cycleCount: 8,
    cadenceMs: 2500,
    firstPaperId: 7000,
    epochMs: 100000,
    dataPattern: "moving",
    failureCycles: [2, 5, 2],
    universeSizeByCycle: { 4: 4 }
  });

  assert.deepEqual(generator.config.failureCycles, [2, 5]);
  assert.equal(generator.config.cadenceMs, 2500);
  assert.equal(generator.sizeForCycle(1), 6);
  assert.equal(generator.sizeForCycle(4), 4);
  assert.equal(generator.shouldFail(2), true);
  assert.equal(generator.shouldFail(3), false);

  const first = generator.snapshot(1);
  const repeated = generator.snapshot(1);
  assert.deepEqual(repeated, first);
  assert.equal(first.recordCount, 6);
  assert.deepEqual(first.responseIds, ["7000", "7001", "7002", "7003", "7004", "7005"]);
  assert.equal(first.records[0].Price, 101);
  assert.equal(first.records[0].TradeDateTime, new Date(102500).toISOString());

  const changedMembership = generator.snapshot(4);
  assert.equal(changedMembership.recordCount, 4);
  assert.deepEqual(changedMembership.responseIds, ["7000", "7001", "7002", "7003"]);
});

test("static synthetic pattern repeats market values while logical timestamps advance", () => {
  const generator = createUsSyntheticGenerator({
    universeSize: 2,
    cycleCount: 3,
    cadenceMs: 3000,
    firstPaperId: 8000,
    epochMs: 200000,
    dataPattern: "static"
  });

  const first = generator.snapshot(1).records[0];
  const third = generator.snapshot(3).records[0];
  assert.equal(first.Price, third.Price);
  assert.equal(first.DailyVolume, third.DailyVolume);
  assert.notEqual(first.TradeDateTime, third.TradeDateTime);
});

test("fake-market preset preserves the existing fixture contract", () => {
  const generator = createUsSyntheticGenerator({
    universeSize: 5,
    cycleCount: 10,
    firstPaperId: 1001,
    preset: "fake-market"
  });

  assert.equal(generator.rowForPaperId(1001, 0).ExtraSyntheticField, "alpha-0");
  assert.equal(generator.rowForPaperId(1002, 0).Price, 0);
  assert.equal(generator.rowForPaperId(1002, 0).AskRate, null);
  assert.equal(generator.rowForPaperId(1003, 0).Price, null);
  assert.equal(Object.hasOwn(generator.rowForPaperId(1003, 0), "BidRate"), false);
  assert.equal(generator.rowForPaperId(1005, 1).PaperNameEng, "Fixture Epsilon US");
});
