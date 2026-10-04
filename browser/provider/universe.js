import { fetchValidatedSnapshot } from "./securities.js";

function assertSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("snapshot must be a validated ScreenerHulPaging3 snapshot.");
  }
  if (!Number.isSafeInteger(snapshot.recordCount) || snapshot.recordCount <= 0) {
    throw new Error("snapshot.recordCount must be a positive safe integer.");
  }
  if (!Array.isArray(snapshot.records) || snapshot.records.length !== snapshot.recordCount) {
    throw new Error("snapshot.records must exactly match snapshot.recordCount.");
  }
  if (!Array.isArray(snapshot.membership) || snapshot.membership.length !== snapshot.recordCount) {
    throw new Error("snapshot.membership must exactly match snapshot.recordCount.");
  }
}

function canonicalMembership(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("membership must be an array.");
  }

  const normalized = values.map((value, index) => {
    if (value === null || value === undefined || value === "") {
      throw new Error(`membership contains invalid securityId at index ${index}.`);
    }
    const securityId = String(value);
    if (securityId.trim().length === 0) {
      throw new Error(`membership contains invalid securityId at index ${index}.`);
    }
    return securityId;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new Error("membership contains duplicate securityIds.");
  }

  return normalized.sort();
}

export function sameCanonicalMembership(left, right) {
  const leftCanonical = canonicalMembership(left);
  const rightCanonical = canonicalMembership(right);
  return (
    leftCanonical.length === rightCanonical.length
    && leftCanonical.every((securityId, index) => securityId === rightCanonical[index])
  );
}

export function buildUniverseFromSnapshot(snapshot) {
  assertSnapshot(snapshot);

  const securities = snapshot.records.map((row, index) => {
    const securityId = String(row.PaperId);
    if (securityId !== snapshot.responseIds?.[index]) {
      throw new Error(`snapshot response identity mismatch at index ${index}.`);
    }

    return Object.freeze({
      securityId,
      symbol: row.Symbol ?? null,
      paperNameEng: row.PaperNameEng ?? null,
      paperNameHeb: row.PaperNameHeb ?? null,
      exchangeName: row.ExchangeName ?? null,
      rawSource: row
    });
  });

  return Object.freeze({
    loadedAtMs: snapshot.timing?.completedAtMs ?? null,
    recordCount: snapshot.recordCount,
    membership: Object.freeze([...snapshot.membership]),
    securities: Object.freeze(securities),
    sourceMetadata: snapshot.sourceMetadata ?? null
  });
}

export async function loadValidatedUniverse({
  fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  const snapshot = await fetchValidatedSnapshot({ fetchImpl, now });
  return buildUniverseFromSnapshot(snapshot);
}
