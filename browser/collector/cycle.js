import { fetchValidatedChunk } from "../provider/securities.js";

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
}

function assertNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`);
  }
}

function universeIds(universe) {
  assertPositiveInteger(universe?.recordCount, "universe.recordCount");
  if (!Array.isArray(universe?.securities) || universe.securities.length !== universe.recordCount) {
    throw new Error("ValidatedUniverse securities must match recordCount.");
  }

  const ids = universe.securities.map((security, index) => {
    const securityId = security?.securityId;
    if (securityId === null || securityId === undefined || securityId === "") {
      throw new Error(`ValidatedUniverse contains invalid securityId at index ${index}.`);
    }
    return String(securityId);
  });

  if (new Set(ids).size !== ids.length) {
    throw new Error("ValidatedUniverse contains duplicate securityIds.");
  }

  return ids;
}

export function planUniverseChunks(universe, chunkSize) {
  assertPositiveInteger(chunkSize, "chunkSize");
  const ids = universeIds(universe);
  const chunks = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    chunks.push(Object.freeze(ids.slice(index, index + chunkSize)));
  }

  return Object.freeze(chunks);
}

function assertPlannedChunksMatchUniverse(universe, plannedChunks) {
  if (!Array.isArray(plannedChunks) || plannedChunks.length === 0) {
    throw new Error("plannedChunks must contain at least one chunk.");
  }

  const expected = universeIds(universe);
  const flattened = [];

  for (let index = 0; index < plannedChunks.length; index++) {
    const chunk = plannedChunks[index];
    if (!Array.isArray(chunk) || chunk.length === 0) {
      throw new Error(`plannedChunks[${index}] must be non-empty.`);
    }
    flattened.push(...chunk.map(String));
  }

  if (
    flattened.length !== expected.length ||
    flattened.some((securityId, index) => securityId !== expected[index])
  ) {
    throw new Error("planned chunks do not exactly match validated universe order.");
  }

  return expected;
}

function sameIds(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => String(value) === right[index])
  );
}

export function buildCompleteCycle({
  universe,
  plannedChunks,
  chunkResults,
  startedAtMs,
  completedAtMs
}) {
  assertNonNegativeFinite(startedAtMs, "startedAtMs");
  assertNonNegativeFinite(completedAtMs, "completedAtMs");
  if (completedAtMs < startedAtMs) {
    throw new Error("completedAtMs cannot be earlier than startedAtMs.");
  }

  const expectedUniverseIds = assertPlannedChunksMatchUniverse(universe, plannedChunks);

  if (!Array.isArray(chunkResults) || chunkResults.length !== plannedChunks.length) {
    throw new Error(
      `Complete cycle expected ${plannedChunks.length} chunk results, received ${chunkResults?.length ?? "invalid"}.`
    );
  }

  const seen = new Set();
  const chunks = [];
  const securities = [];

  for (let chunkIndex = 0; chunkIndex < plannedChunks.length; chunkIndex++) {
    const expectedIds = plannedChunks[chunkIndex].map(String);
    const result = chunkResults[chunkIndex];

    if (!result || !sameIds(result.requestedIds, expectedIds)) {
      throw new Error(`Complete cycle chunk ${chunkIndex} requested IDs do not match the planned chunk.`);
    }

    if (
      result.requestedCount !== expectedIds.length ||
      result.receivedCount !== expectedIds.length ||
      result.uniqueCount !== expectedIds.length ||
      !Array.isArray(result.records) ||
      result.records.length !== expectedIds.length
    ) {
      throw new Error(`Complete cycle chunk ${chunkIndex} counters do not match its requested membership.`);
    }

    const expectedSet = new Set(expectedIds);
    const actualIds = [];

    for (const rawSecurity of result.records) {
      const key = rawSecurity?.Key;
      if (key === null || key === undefined || key === "") {
        throw new Error(`Complete cycle chunk ${chunkIndex} contains Security without Key.`);
      }

      const securityId = String(key);
      if (!expectedSet.has(securityId)) {
        throw new Error(`Complete cycle chunk ${chunkIndex} contains unexpected securityId ${securityId}.`);
      }
      if (actualIds.includes(securityId)) {
        throw new Error(`Complete cycle chunk ${chunkIndex} contains duplicate securityId ${securityId}.`);
      }
      if (seen.has(securityId)) {
        throw new Error(`Complete cycle contains cross-chunk duplicate securityId ${securityId}.`);
      }

      actualIds.push(securityId);
      seen.add(securityId);
      securities.push(
        Object.freeze({
          securityId,
          chunkIndex,
          chunkReceivedAtMs: result.timing.responseReceivedAtMs,
          collectedAtMs: result.timing.completedAtMs,
          serverAsOfDate: result.serverAsOfDate,
          data: rawSecurity
        })
      );
    }

    for (const expectedId of expectedIds) {
      if (!actualIds.includes(expectedId)) {
        throw new Error(`Complete cycle chunk ${chunkIndex} is missing securityId ${expectedId}.`);
      }
    }

    chunks.push(
      Object.freeze({
        chunkIndex,
        requested: result.requestedCount,
        received: result.receivedCount,
        unique: result.uniqueCount,
        requestStartedAtMs: result.timing.startedAtMs,
        receivedAtMs: result.timing.responseReceivedAtMs,
        completedAtMs: result.timing.completedAtMs,
        durationMs: result.timing.durationMs,
        serverAsOfDate: result.serverAsOfDate,
        httpStatus: result.httpStatus
      })
    );
  }

  const missing = expectedUniverseIds.filter((securityId) => !seen.has(securityId));
  const unexpected = [...seen].filter((securityId) => !expectedUniverseIds.includes(securityId));
  const duplicates = securities.length - seen.size;

  if (missing.length > 0 || unexpected.length > 0 || duplicates !== 0) {
    throw new Error(
      `Complete cycle membership mismatch. missing=[${missing.join(",")}], duplicates=${duplicates}, unexpected=[${unexpected.join(",")}].`
    );
  }

  return Object.freeze({
    status: "complete",
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    requested: expectedUniverseIds.length,
    received: securities.length,
    unique: seen.size,
    missing: 0,
    duplicates: 0,
    unexpected: 0,
    chunks: Object.freeze(chunks),
    securities: Object.freeze(securities)
  });
}

function tagCollectionPhase(error, phase) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (!Object.hasOwn(normalized, "marketScopePhase")) {
    Object.defineProperty(normalized, "marketScopePhase", {
      value: phase,
      configurable: true,
      enumerable: false
    });
  }
  return normalized;
}

export async function collectCompleteCycle({
  universe,
  chunkSize = 187,
  chunkDelayMs = 1000,
  fetchChunk = (securityIds) => fetchValidatedChunk({ securityIds }),
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  now = () => Date.now()
}) {
  assertPositiveInteger(chunkSize, "chunkSize");
  assertNonNegativeInteger(chunkDelayMs, "chunkDelayMs");

  if (typeof fetchChunk !== "function") throw new TypeError("fetchChunk must be a function.");
  if (typeof sleep !== "function") throw new TypeError("sleep must be a function.");
  if (typeof now !== "function") throw new TypeError("now must be a function.");

  const plannedChunks = planUniverseChunks(universe, chunkSize);
  const chunkResults = [];
  const startedAtMs = now();

  for (let chunkIndex = 0; chunkIndex < plannedChunks.length; chunkIndex++) {
    try {
      chunkResults.push(await fetchChunk(plannedChunks[chunkIndex]));
    } catch (error) {
      throw tagCollectionPhase(error, "chunk-fetch");
    }

    if (chunkIndex < plannedChunks.length - 1 && chunkDelayMs > 0) {
      await sleep(chunkDelayMs);
    }
  }

  const completedAtMs = now();

  try {
    return buildCompleteCycle({
      universe,
      plannedChunks,
      chunkResults,
      startedAtMs,
      completedAtMs
    });
  } catch (error) {
    throw tagCollectionPhase(error, "cycle-validation");
  }
}
