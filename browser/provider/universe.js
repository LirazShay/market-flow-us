const MAP_HEAT_ENDPOINT = "/lti/lti-app/api/MarketFast/MapHeat2";

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

export function buildMapHeatUrl(pageCount) {
  assertPositiveInteger(pageCount, "pageCount");

  const params = new URLSearchParams({
    indexIdArray: "0",
    sectorIdAndTatSectorArray: "0;0",
    showOnlyDual: "0",
    lowChngPrcDay: "-999999999",
    highChngPrcDay: "999999999",
    lowChngPrcStartYear: "-999999999",
    highChngPrcStartYear: "999999999",
    highLow52: "0",
    lowDailyAverageVolume: "-999999999",
    highDailyAverageVolume: "999999999",
    lowDivYield: "-999999999",
    highDivYield: "999999999",
    lowMarketValue: "-999999999999999",
    highMarketValue: "999999999999999",
    esdRatingModeSelected: "0",
    EsdRatingModeValueSelected: "0",
    page: "1",
    pageCount: String(pageCount),
    orderFieldName: "DailyNumDeals",
    order: "DESC",
    rt: "true"
  });

  return `${MAP_HEAT_ENDPOINT}?${params.toString()}`;
}

export function validateRecordCount(recordCount) {
  assertPositiveInteger(recordCount, "MapHeat2 recordCount");
  return recordCount;
}

function canonicalizePaperId(record, index) {
  const paperId = record?.PaperId;
  if (paperId === null || paperId === undefined || paperId === "") {
    throw new Error(`MapHeat2 contains record without PaperId at index ${index}.`);
  }
  return String(paperId);
}

export function buildValidatedUniverse({ initialRecordCount, fullMap, loadedAtMs }) {
  const recordCount = validateRecordCount(initialRecordCount);
  assertNonNegativeFinite(loadedAtMs, "loadedAtMs");

  if (!fullMap || typeof fullMap !== "object") {
    throw new Error("MapHeat2 full response is invalid.");
  }

  if (fullMap.recordCount !== recordCount) {
    throw new Error(
      `MapHeat2 recordCount changed during universe load. Initial=${recordCount}, full=${fullMap.recordCount}.`
    );
  }

  if (!Array.isArray(fullMap.records)) {
    throw new Error("MapHeat2 full response does not contain records[].");
  }

  if (fullMap.records.length !== recordCount) {
    throw new Error(
      `MapHeat2 universe is incomplete. Expected ${recordCount} records, received ${fullMap.records.length}.`
    );
  }

  const seen = new Set();
  const securities = fullMap.records.map((record, index) => {
    const securityId = canonicalizePaperId(record, index);
    if (seen.has(securityId)) {
      throw new Error(`MapHeat2 contains duplicate PaperId after canonicalization: ${securityId}.`);
    }
    seen.add(securityId);

    return Object.freeze({
      securityId,
      paperName: record?.PaperName ?? null,
      mapHeatDateChange: record?.DateChange ?? null,
      rawMapHeat: record
    });
  });

  return Object.freeze({
    loadedAtMs,
    recordCount,
    securities: Object.freeze(securities)
  });
}

function extractMapHeat(responseJson) {
  const map = responseJson?.data?.MapHeat;
  if (!map || typeof map !== "object") {
    throw new Error("MapHeat2 response structure is invalid.");
  }
  return map;
}

export async function fetchMapHeat({ pageCount, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }

  const response = await fetchImpl(buildMapHeatUrl(pageCount));
  if (!response?.ok) {
    throw new Error(`MapHeat2 failed: HTTP ${response?.status ?? "unknown"}.`);
  }

  return extractMapHeat(await response.json());
}

export async function loadValidatedUniverse({
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  const countMap = await fetchMapHeat({ pageCount: 1, fetchImpl });
  const recordCount = validateRecordCount(countMap.recordCount);
  const fullMap = await fetchMapHeat({ pageCount: recordCount, fetchImpl });

  return buildValidatedUniverse({
    initialRecordCount: recordCount,
    fullMap,
    loadedAtMs: now()
  });
}

export { MAP_HEAT_ENDPOINT };
