const DEFAULT_EPOCH_MS = Date.UTC(2026, 9, 5, 0, 0, 0);

function positiveInteger(value, name, { allowZero = false } = {}) {
  const min = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < min) {
    throw new TypeError(`${name} must be a safe integer >= ${min}.`);
  }
  return value;
}

function normalizeFailureCycles(value) {
  const cycles = value ?? [];
  if (!Array.isArray(cycles)) {
    throw new TypeError("failureCycles must be an array.");
  }
  const normalized = cycles.map((cycle) => positiveInteger(cycle, "failure cycle", { allowZero: true }));
  return Object.freeze([...new Set(normalized)].sort((left, right) => left - right));
}

function normalizeUniverseSchedule(value, defaultSize) {
  if (value === null || value === undefined) return Object.freeze({});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("universeSizeByCycle must be an object.");
  }

  const schedule = {};
  for (const [rawCycle, rawSize] of Object.entries(value)) {
    const cycle = Number(rawCycle);
    positiveInteger(cycle, "universe schedule cycle", { allowZero: true });
    const size = positiveInteger(rawSize, "scheduled universe size");
    if (size > defaultSize) {
      throw new TypeError("scheduled universe size cannot exceed configured universeSize.");
    }
    schedule[String(cycle)] = size;
  }
  return Object.freeze(schedule);
}

function fixtureRowFor(paperId, cycle) {
  const id = String(paperId);
  if (id === "1001") {
    return {
      Id: 501,
      PaperId: 1001,
      PaperNameEng: "Fixture Alpha US",
      PaperNameHeb: "Fixture Alpha",
      Symbol: "ALFA",
      ExchangeName: "Fixture Exchange A",
      PaperIdYatab: 9001,
      CountryId: 2,
      CountryName: "Fixture Country",
      CountryNameEng: "Fixture Country",
      PaperType: 1,
      Price: 101.25 + cycle,
      ChangePercent: 1.2 + cycle * 0.1,
      DailyHigh: 103 + cycle,
      DailyLow: 99.5,
      YearHigh: 130,
      YearLow: 80,
      DailyVolume: 100000 + cycle * 1000,
      BeginYearChangePercent: 8.5,
      Month12ChangePercent: 12.5,
      Month36ChangePercent: 31.5,
      TradeDateTime: `fixture-cycle-${cycle}`,
      AskRate: 101.5 + cycle,
      BidRate: 101 + cycle,
      YesterdayRate: 100,
      PaperMarketCap: 500000000 + cycle * 10000,
      ESGRatingId: 3,
      ESGScope: 1,
      ExtraSyntheticField: `alpha-${cycle}`
    };
  }

  if (id === "1002") {
    return {
      Id: 502,
      PaperId: 1002,
      PaperNameEng: "Fixture Beta US",
      PaperNameHeb: "Fixture Beta",
      Symbol: "BETA",
      ExchangeName: "Fixture Exchange B",
      PaperIdYatab: 9002,
      CountryId: 2,
      CountryName: "Fixture Country",
      CountryNameEng: "Fixture Country",
      PaperType: 1,
      Price: 0,
      ChangePercent: -0.4 - cycle * 0.05,
      DailyHigh: 10 + cycle,
      DailyLow: 0,
      YearHigh: 15,
      YearLow: 0,
      DailyVolume: 0,
      BeginYearChangePercent: null,
      Month12ChangePercent: 0,
      Month36ChangePercent: -4,
      TradeDateTime: null,
      AskRate: null,
      BidRate: 0,
      YesterdayRate: 0,
      PaperMarketCap: null,
      ESGRatingId: null,
      ESGScope: 0
    };
  }

  if (id === "1003") {
    return {
      Id: 503,
      PaperId: 1003,
      PaperNameEng: "Fixture Gamma US",
      Symbol: "GAMA",
      ExchangeName: "Fixture Exchange A",
      CountryId: 2,
      CountryNameEng: "Fixture Country",
      PaperType: 1,
      Price: null,
      ChangePercent: 0,
      DailyHigh: 51 + cycle,
      DailyLow: 48,
      YearHigh: 65,
      YearLow: 40,
      DailyVolume: 25000 + cycle * 250,
      Month12ChangePercent: null,
      TradeDateTime: `fixture-cycle-${cycle}`,
      AskRate: 50.5 + cycle,
      YesterdayRate: 50,
      PaperMarketCap: 125000000
    };
  }

  if (id === "1004") {
    return {
      Id: 504,
      PaperId: 1004,
      PaperNameEng: "Fixture Delta US",
      PaperNameHeb: "Fixture Delta",
      Symbol: "DLTA",
      ExchangeName: "Fixture Exchange C",
      PaperIdYatab: 9004,
      CountryId: 2,
      CountryName: "Fixture Country",
      CountryNameEng: "Fixture Country",
      PaperType: 1,
      Price: 72.75 + cycle * 0.5,
      ChangePercent: 0.8 + cycle * 0.05,
      DailyHigh: 74 + cycle,
      DailyLow: 70,
      YearHigh: 90,
      YearLow: 60,
      DailyVolume: 60000 + cycle * 700,
      BeginYearChangePercent: 5,
      Month12ChangePercent: 9,
      Month36ChangePercent: 22,
      TradeDateTime: `fixture-cycle-${cycle}`,
      AskRate: 73 + cycle * 0.5,
      BidRate: 72.5 + cycle * 0.5,
      YesterdayRate: 72,
      PaperMarketCap: 300000000 + cycle * 5000,
      ESGRatingId: 2,
      ESGScope: 1
    };
  }

  if (id === "1005") {
    return {
      Id: 505,
      PaperId: 1005,
      PaperNameEng: "Fixture Epsilon US",
      PaperNameHeb: "Fixture Epsilon",
      Symbol: "EPSI",
      ExchangeName: "Fixture Exchange B",
      PaperIdYatab: 9005,
      CountryId: 2,
      CountryName: "Fixture Country",
      CountryNameEng: "Fixture Country",
      PaperType: 1,
      Price: 33 + cycle,
      ChangePercent: 2.4,
      DailyHigh: 34 + cycle,
      DailyLow: 30,
      YearHigh: 40,
      YearLow: 20,
      DailyVolume: 90000 + cycle * 500,
      BeginYearChangePercent: 15,
      Month12ChangePercent: 20,
      Month36ChangePercent: 45,
      TradeDateTime: `fixture-cycle-${cycle}`,
      AskRate: 33.2 + cycle,
      BidRate: 32.8 + cycle,
      YesterdayRate: 32,
      PaperMarketCap: 175000000,
      ESGRatingId: 4,
      ESGScope: 2
    };
  }

  throw new Error(`Unknown fixture synthetic security ${id}`);
}

function genericRowFor({ index, paperId, cycle, epochMs, cadenceMs, dataPattern }) {
  const movementCycle = dataPattern === "static" ? 0 : cycle;
  const price = 100 + index + movementCycle;
  const symbol = `US${String(index).padStart(4, "0")}`;
  const tradeDateTime = new Date(epochMs + (cycle * cadenceMs)).toISOString();

  return {
    PaperId: paperId,
    Symbol: symbol,
    PaperNameEng: `Synthetic US Security ${String(index).padStart(4, "0")}`,
    PaperNameHeb: null,
    ExchangeName: index % 2 === 0 ? "NASDAQ" : "NYSE",
    TradeDateTime: tradeDateTime,
    CountryName: "United States",
    CountryNameEng: "United States",
    Price: price,
    ChangePercent: (index % 25) + (movementCycle / 1000),
    DailyHigh: price + 2,
    DailyLow: price - 2,
    YearHigh: price + 25,
    YearLow: price - 25,
    DailyVolume: (movementCycle * 100000) + index,
    BeginYearChangePercent: (index % 17) / 10,
    Month12ChangePercent: (index % 23) / 10,
    Month36ChangePercent: (index % 31) / 10,
    AskRate: price + 0.05,
    BidRate: price - 0.05,
    YesterdayRate: price - 1,
    PaperMarketCap: 1000000 + (index * 10000),
    PaperIdYatab: paperId + 500000,
    CountryId: 2,
    PaperType: 1,
    ESGRatingId: index % 7 === 0 ? null : index % 5,
    ESGScope: index % 3
  };
}

export function createUsSyntheticGenerator({
  universeSize = 4,
  cycleCount = 45,
  cadenceMs = 3000,
  firstPaperId = 1000000,
  epochMs = DEFAULT_EPOCH_MS,
  dataPattern = "moving",
  failureCycles = [],
  universeSizeByCycle = null,
  preset = "scale"
} = {}) {
  positiveInteger(universeSize, "universeSize");
  positiveInteger(cycleCount, "cycleCount");
  positiveInteger(cadenceMs, "cadenceMs");
  positiveInteger(firstPaperId, "firstPaperId", { allowZero: true });
  positiveInteger(epochMs, "epochMs", { allowZero: true });
  if (!new Set(["moving", "static"]).has(dataPattern)) {
    throw new TypeError("dataPattern must be 'moving' or 'static'.");
  }
  if (!new Set(["scale", "fake-market"]).has(preset)) {
    throw new TypeError("preset must be 'scale' or 'fake-market'.");
  }
  if (preset === "fake-market" && (firstPaperId !== 1001 || universeSize > 5)) {
    throw new TypeError("fake-market preset supports PaperId 1001..1005 only.");
  }

  const normalizedFailureCycles = normalizeFailureCycles(failureCycles);
  const failureSet = new Set(normalizedFailureCycles);
  const normalizedSchedule = normalizeUniverseSchedule(universeSizeByCycle, universeSize);
  const allPaperIds = Object.freeze(
    Array.from({ length: universeSize }, (_, index) => firstPaperId + index)
  );

  function assertCycle(cycle) {
    positiveInteger(cycle, "cycle", { allowZero: true });
  }

  function sizeForCycle(cycle) {
    assertCycle(cycle);
    return normalizedSchedule[String(cycle)] ?? universeSize;
  }

  function paperIdsForCycle(cycle) {
    return allPaperIds.slice(0, sizeForCycle(cycle));
  }

  function rowForPaperId(paperId, cycle) {
    assertCycle(cycle);
    if (!Number.isSafeInteger(paperId)) {
      throw new TypeError("paperId must be a safe integer.");
    }
    const index = paperId - firstPaperId;
    if (index < 0 || index >= universeSize) {
      throw new RangeError(`PaperId ${paperId} is outside the configured synthetic universe.`);
    }
    return preset === "fake-market"
      ? fixtureRowFor(paperId, dataPattern === "static" ? 0 : cycle)
      : genericRowFor({ index, paperId, cycle, epochMs, cadenceMs, dataPattern });
  }

  function recordsForCycle(cycle) {
    return paperIdsForCycle(cycle).map((paperId) => rowForPaperId(paperId, cycle));
  }

  function snapshot(cycle) {
    assertCycle(cycle);
    const completedAtMs = 10000 + (cycle * cadenceMs);
    const startedAtMs = completedAtMs - 100;
    const records = recordsForCycle(cycle);
    const responseIds = records.map((row) => String(row.PaperId));
    return {
      recordCount: records.length,
      records,
      responseIds,
      membership: [...responseIds].sort(),
      timing: {
        startedAtMs,
        responseReceivedAtMs: completedAtMs - 10,
        completedAtMs,
        durationMs: completedAtMs - startedAtMs
      },
      sourceMetadata: {
        endpoint: "ScreenerHulPaging3",
        source: "synthetic-us-generator",
        cycle
      },
      httpStatus: 200
    };
  }

  function shouldFail(cycle) {
    assertCycle(cycle);
    return failureSet.has(cycle);
  }

  return Object.freeze({
    config: Object.freeze({
      universeSize,
      cycleCount,
      cadenceMs,
      firstPaperId,
      epochMs,
      dataPattern,
      failureCycles: normalizedFailureCycles,
      universeSizeByCycle: normalizedSchedule,
      preset
    }),
    paperIds: allPaperIds,
    sizeForCycle,
    paperIdsForCycle,
    rowForPaperId,
    recordsForCycle,
    snapshot,
    shouldFail
  });
}
