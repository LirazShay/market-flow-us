export const SCREENER_HUL_ENDPOINT = "/lti/lti-app/api/Market/ScreenerHulPaging3";
export const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

const SCREENER_PARAMS = Object.freeze({
  region: "1",
  Country: "2",
  indexIdArray: "0",
  paperType: "1",
  sectorIdArray: "0",
  subSectorIdArray: "0",
  changePercentFrom: "-999999999",
  changePercentTo: "999999999",
  volumeFrom: "-999999999",
  volumeTo: "999999999",
  marketCapFrom: "-999999999999999",
  marketCapTo: "999999999999999",
  beginYearChangePercentFrom: "-999999999",
  beginYearChangePercentTo: "999999999",
  month12ChangePercentFrom: "-999999999",
  month12ChangePercentTo: "999999999",
  month36ChangePercentFrom: "-999999999",
  month36ChangePercentTo: "999999999",
  EsdRatingModeSelected: "0",
  EsdRatingModeValueSelected: "0",
  page: "1",
  pageCount: "5000",
  orderFieldName: "DailyVolume",
  orderDir: "DESC",
  rt: "true"
});

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
}

function validateTiming(timing) {
  const startedAtMs = timing?.startedAtMs;
  const responseReceivedAtMs = timing?.responseReceivedAtMs;
  const completedAtMs = timing?.completedAtMs;

  assertNonNegativeFinite(startedAtMs, "startedAtMs");
  assertNonNegativeFinite(responseReceivedAtMs, "responseReceivedAtMs");
  assertNonNegativeFinite(completedAtMs, "completedAtMs");

  if (responseReceivedAtMs < startedAtMs) {
    throw new Error("responseReceivedAtMs cannot be earlier than startedAtMs.");
  }
  if (completedAtMs < responseReceivedAtMs) {
    throw new Error("completedAtMs cannot be earlier than responseReceivedAtMs.");
  }

  return Object.freeze({
    startedAtMs,
    responseReceivedAtMs,
    completedAtMs,
    requestDurationMs: responseReceivedAtMs - startedAtMs,
    parseDurationMs: completedAtMs - responseReceivedAtMs,
    durationMs: completedAtMs - startedAtMs
  });
}

function canonicalPaperId(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`ScreenerHulPaging3 contains invalid row at index ${index}.`);
  }

  const value = row.PaperId;
  if (value === null || value === undefined || value === "") {
    throw new Error(`ScreenerHulPaging3 contains row without PaperId at index ${index}.`);
  }

  const securityId = String(value);
  if (securityId.trim().length === 0) {
    throw new Error(`ScreenerHulPaging3 contains row without PaperId at index ${index}.`);
  }
  return securityId;
}

function buildSourceMetadata(responseJson, screener) {
  return Object.freeze({
    maxDateChange: screener.maxDateChange ?? null,
    rsCount: responseJson.rsCount ?? null,
    rtIsr: responseJson.rtIsr ?? null,
    rtUsa: responseJson.rtUsa ?? null,
    logtm: responseJson.logtm ?? null,
    reqtm: responseJson.reqtm ?? null,
    responsetm: responseJson.responsetm ?? null,
    serverId: responseJson.serverId ?? null,
    version: responseJson.version ?? null,
    resultCode: responseJson.resultCode ?? null
  });
}

function buildWarnings(records, responseJson) {
  const warnings = [];

  for (let index = 0; index < records.length; index++) {
    const symbol = records[index]?.Symbol;
    if (symbol === null || symbol === undefined || symbol === "") {
      warnings.push(`ScreenerHulPaging3 row ${index} is missing Symbol.`);
    }
  }

  if (responseJson?.rtUsa !== true) {
    warnings.push("ScreenerHulPaging3 rtUsa is false or absent.");
  }

  return Object.freeze(warnings);
}

export function buildScreenerHulUrl() {
  return `${SCREENER_HUL_ENDPOINT}?${new URLSearchParams(SCREENER_PARAMS).toString()}`;
}

export function buildValidatedSnapshot({
  responseJson,
  timing,
  httpStatus = 200
}) {
  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) {
    throw new Error(`ScreenerHulPaging3 failed: HTTP ${httpStatus}.`);
  }

  if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
    throw new Error("ScreenerHulPaging3 response payload must be an object.");
  }

  const screener = responseJson.data?.ScreenerHulPaging;
  if (!screener || typeof screener !== "object" || Array.isArray(screener)) {
    throw new Error("ScreenerHulPaging3 response is missing data.ScreenerHulPaging.");
  }

  const recordCount = screener.recordCount;
  if (!Number.isSafeInteger(recordCount) || recordCount <= 0) {
    throw new Error("ScreenerHulPaging3 recordCount must be a positive safe integer.");
  }

  if (!Array.isArray(screener.records)) {
    throw new Error("ScreenerHulPaging3 records must be an array.");
  }
  if (screener.records.length !== recordCount) {
    throw new Error(
      `ScreenerHulPaging3 recordCount/records.length mismatch. recordCount=${recordCount}, records.length=${screener.records.length}.`
    );
  }

  if (Object.hasOwn(responseJson, "resultCode") && responseJson.resultCode !== 0) {
    throw new Error(`ScreenerHulPaging3 resultCode must be 0 when present, received ${responseJson.resultCode}.`);
  }

  const records = Object.freeze([...screener.records]);
  const responseIds = [];
  const seen = new Set();

  for (let index = 0; index < records.length; index++) {
    const securityId = canonicalPaperId(records[index], index);
    if (seen.has(securityId)) {
      throw new Error(`ScreenerHulPaging3 contains duplicate PaperId after canonicalization: ${securityId}.`);
    }
    seen.add(securityId);
    responseIds.push(securityId);
  }

  const validatedTiming = validateTiming(timing);
  const membership = Object.freeze([...seen].sort());
  const sourceMetadata = buildSourceMetadata(responseJson, screener);

  return Object.freeze({
    recordCount,
    records,
    responseIds: Object.freeze(responseIds),
    membership,
    sourceMetadata,
    warnings: buildWarnings(records, responseJson),
    httpStatus,
    timing: validatedTiming
  });
}

export async function fetchValidatedSnapshot({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  requestTimeoutMs = DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }
  assertPositiveFinite(requestTimeoutMs, "requestTimeoutMs");
  if (typeof globalThis.AbortController !== "function") {
    throw new Error("AbortController is required for bounded provider requests.");
  }

  const startedAtMs = now();
  const controller = new globalThis.AbortController();
  let timeoutHandle = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error(`ScreenerHulPaging3 request timed out after ${requestTimeoutMs} ms.`));
    }, requestTimeoutMs);
  });

  const requestPromise = (async () => {
    const response = await fetchImpl(buildScreenerHulUrl(), { signal: controller.signal });
    const responseReceivedAtMs = now();

    if (!response?.ok) {
      throw new Error(`ScreenerHulPaging3 failed: HTTP ${response?.status ?? "unknown"}.`);
    }

    const responseJson = await response.json();
    const completedAtMs = now();

    return buildValidatedSnapshot({
      responseJson,
      timing: {
        startedAtMs,
        responseReceivedAtMs,
        completedAtMs
      },
      httpStatus: response.status
    });
  })();

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
  }
}
