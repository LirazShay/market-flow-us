const GET_SECURITIES_ENDPOINT = "/lti/lti-app/api/SecuritiesFast/GetSecuritiesData";

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

export function normalizeSecurityIds(securityIds) {
  if (!Array.isArray(securityIds) || securityIds.length === 0) {
    throw new TypeError("securityIds must be a non-empty array.");
  }

  const normalized = securityIds.map((value, index) => {
    if (value === null || value === undefined || value === "") {
      throw new TypeError(`securityIds contains an invalid value at index ${index}.`);
    }
    return String(value);
  });

  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error(
      `securityIds contains duplicates after canonicalization. Total=${normalized.length}, unique=${unique.size}.`
    );
  }

  return Object.freeze(normalized);
}

export function buildGetSecuritiesDataUrl(securityIds) {
  const normalized = normalizeSecurityIds(securityIds);
  const encodedIds = normalized.map((securityId) => encodeURIComponent(securityId));

  return (
    `${GET_SECURITIES_ENDPOINT}?securityIds=${encodedIds.join(",")}` +
    "&responseType=1&is_gto=true&force=false"
  );
}

function extractSecuritiesTable(responseJson) {
  const table = responseJson?.data?.SecuritiesData?.Table;
  if (!table || typeof table !== "object") {
    throw new Error(
      "GetSecuritiesData response structure is invalid: missing data.SecuritiesData.Table."
    );
  }
  if (!Array.isArray(table.Security)) {
    throw new Error(
      "GetSecuritiesData response structure is invalid: Security must be an array."
    );
  }
  return table;
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

function validateResponseMembership(requestedIds, records) {
  const responseIds = [];
  const seen = new Set();

  for (let index = 0; index < records.length; index++) {
    const key = records[index]?.Key;
    if (key === null || key === undefined || key === "") {
      throw new Error(`GetSecuritiesData contains record without Key at index ${index}.`);
    }

    const securityId = String(key);
    if (seen.has(securityId)) {
      throw new Error(`GetSecuritiesData contains duplicate Key after canonicalization: ${securityId}.`);
    }

    seen.add(securityId);
    responseIds.push(securityId);
  }

  const requestedSet = new Set(requestedIds);
  const missing = requestedIds.filter((securityId) => !seen.has(securityId));
  const unexpected = responseIds.filter((securityId) => !requestedSet.has(securityId));

  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `GetSecuritiesData chunk mismatch. Requested=${requestedIds.length}, received=${responseIds.length}, missing=[${missing.join(",")}], unexpected=[${unexpected.join(",")}].`
    );
  }

  return {
    responseIds: Object.freeze(responseIds),
    uniqueCount: seen.size
  };
}

export function buildValidatedChunk({
  securityIds,
  responseJson,
  timing,
  httpStatus = 200
}) {
  const requestedIds = normalizeSecurityIds(securityIds);

  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) {
    throw new Error(`GetSecuritiesData requires a successful HTTP status, received ${httpStatus}.`);
  }

  const table = extractSecuritiesTable(responseJson);
  const records = Object.freeze([...table.Security]);
  const membership = validateResponseMembership(requestedIds, records);
  const validatedTiming = validateTiming(timing);

  return Object.freeze({
    requestedIds,
    requestedCount: requestedIds.length,
    responseIds: membership.responseIds,
    receivedCount: records.length,
    uniqueCount: membership.uniqueCount,
    records,
    serverAsOfDate: table.AsOfDate ?? null,
    httpStatus,
    timing: validatedTiming
  });
}

export async function fetchValidatedChunk({
  securityIds,
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  const normalizedIds = normalizeSecurityIds(securityIds);
  const startedAtMs = now();
  const response = await fetchImpl(buildGetSecuritiesDataUrl(normalizedIds));
  const responseReceivedAtMs = now();

  if (!response?.ok) {
    throw new Error(
      `GetSecuritiesData failed: HTTP ${response?.status ?? "unknown"}. Requested=${normalizedIds.length}.`
    );
  }

  const responseJson = await response.json();
  const completedAtMs = now();

  return buildValidatedChunk({
    securityIds: normalizedIds,
    responseJson,
    timing: {
      startedAtMs,
      responseReceivedAtMs,
      completedAtMs
    },
    httpStatus: response.status
  });
}

export { GET_SECURITIES_ENDPOINT };
