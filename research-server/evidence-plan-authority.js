import { createHash } from "node:crypto";

import { normalizeFinalistEvaluationProfile } from "./validation-authority-core.js";

export const RESEARCH_EVIDENCE_PLAN_AUTHORITY_VERSION = "research-evidence-plan-authority-v1";
export const WHOLE_DAY_PARTITION_ALGORITHM = "whole-day-chronological-v1";
export const BLOCK_PARTITION_ALGORITHM = "chronological-blocks-purged-v1";

const MAX_SOURCE_COUNT = 512;
const MAX_INTERVAL_VALUE = 86_400;
const INTERVAL_UNITS = new Set(["milliseconds", "seconds", "minutes"]);

function invalid(message) {
  throw new TypeError(message);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])
    ));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSafeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${label} must be a safe integer between ${min} and ${max}`);
  }
  return value;
}

function boundedText(value, label, maxChars = 256) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxChars) {
    invalid(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function normalizeInterval(profile) {
  const intervalValue = assertSafeInteger(profile?.intervalValue, "intervalValue", {
    min: 1,
    max: MAX_INTERVAL_VALUE
  });
  const intervalUnit = boundedText(profile?.intervalUnit, "intervalUnit", 32);
  if (!INTERVAL_UNITS.has(intervalUnit)) {
    invalid("intervalUnit must be milliseconds, seconds or minutes");
  }
  return Object.freeze({ intervalValue, intervalUnit });
}

function objectiveHorizonsMs(objectiveVersion) {
  if (!objectiveVersion || typeof objectiveVersion !== "object" || Array.isArray(objectiveVersion)) {
    invalid("objectiveVersion must be an immutable Objective Version object");
  }
  const objective = objectiveVersion.objective;
  if (!objective || typeof objective !== "object" || Array.isArray(objective)) {
    invalid("objectiveVersion.objective must be an object");
  }

  let horizons;
  if (Array.isArray(objective.primaryHorizonsMs)) {
    horizons = objective.primaryHorizonsMs;
  } else if (Array.isArray(objective.horizonsMs)) {
    horizons = objective.horizonsMs;
  } else if (Array.isArray(objective.primaryHorizonsSec)) {
    horizons = objective.primaryHorizonsSec.map((seconds) => (
      assertSafeInteger(seconds, "primaryHorizonsSec value", { min: 1 }) * 1000
    ));
  } else {
    invalid("Objective Version must define primaryHorizonsMs, horizonsMs or primaryHorizonsSec");
  }

  if (horizons.length < 1 || horizons.length > 16) {
    invalid("Objective Version must define one to sixteen horizons");
  }
  const normalized = horizons.map((value) => assertSafeInteger(value, "objective horizonMs", { min: 1 }));
  if (new Set(normalized).size !== normalized.length) invalid("Objective horizons must be unique");
  return Object.freeze([...normalized].sort((left, right) => left - right));
}

function normalizeEvaluationProfile(profile, horizonsMs) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    invalid("evaluationProfile must be an object");
  }
  const finalist = normalizeFinalistEvaluationProfile({
    selectionPolicy: profile.selectionPolicy,
    topX: profile.topX,
    horizonsMs,
    metricProfile: profile.metricProfile
  });
  const interval = normalizeInterval(profile);
  if (profile.horizonsMs !== undefined) {
    const supplied = normalizeFinalistEvaluationProfile({
      selectionPolicy: profile.selectionPolicy,
      topX: profile.topX,
      horizonsMs: profile.horizonsMs,
      metricProfile: profile.metricProfile
    });
    if (!sameJson(supplied.horizonsMs, finalist.horizonsMs)) {
      invalid("evaluationProfile horizons must match the immutable Objective Version");
    }
  }
  return freezeCopy({ ...finalist, ...interval });
}

function normalizeSource(source, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    invalid(`evidence source ${index} must be an object`);
  }
  const sourceId = boundedText(source.sourceId, `evidence source ${index} sourceId`);
  if (typeof source.sourceFingerprint !== "string" || !/^[0-9a-f]{64}$/u.test(source.sourceFingerprint)) {
    invalid(`evidence source ${index} sourceFingerprint must be SHA-256`);
  }
  const firstCompleteAtMs = assertSafeInteger(
    source.firstCompleteAtMs,
    `evidence source ${index} firstCompleteAtMs`
  );
  const lastCompleteAtMs = assertSafeInteger(
    source.lastCompleteAtMs,
    `evidence source ${index} lastCompleteAtMs`
  );
  if (firstCompleteAtMs > lastCompleteAtMs) {
    invalid(`evidence source ${index} firstCompleteAtMs must be <= lastCompleteAtMs`);
  }
  const tradingDay = source.tradingDay === undefined || source.tradingDay === null
    ? null
    : boundedText(source.tradingDay, `evidence source ${index} tradingDay`, 64);
  return Object.freeze({
    sourceId,
    sourceFingerprint: source.sourceFingerprint,
    firstCompleteAtMs,
    lastCompleteAtMs,
    tradingDay
  });
}

function normalizeInventory(evidenceInventory) {
  const sources = evidenceInventory?.inventory?.sources;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > MAX_SOURCE_COUNT) {
    invalid(`Evidence Inventory must contain 1..${MAX_SOURCE_COUNT} sources for partition planning`);
  }
  const normalized = sources.map(normalizeSource);
  const seenIds = new Set();
  for (const source of normalized) {
    if (seenIds.has(source.sourceId)) invalid("Evidence Inventory sourceIds must be unique");
    seenIds.add(source.sourceId);
  }
  normalized.sort((left, right) => (
    left.firstCompleteAtMs - right.firstCompleteAtMs
    || left.lastCompleteAtMs - right.lastCompleteAtMs
    || left.sourceId.localeCompare(right.sourceId)
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].lastCompleteAtMs >= normalized[index].firstCompleteAtMs) {
      invalid("Evidence Inventory planning sources must be chronologically non-overlapping");
    }
  }
  return Object.freeze(normalized);
}

function schedule(source, range, evaluationProfile) {
  return Object.freeze({
    sourceId: source.sourceId,
    fromAtMs: range.fromMs,
    toAtMs: range.toMs,
    intervalValue: evaluationProfile.intervalValue,
    intervalUnit: evaluationProfile.intervalUnit
  });
}

function partition(role, sources, range, maxHorizonMs, scheduleKey, evaluationProfile) {
  const body = {
    sourceIds: sources.map((source) => source.sourceId),
    range: Object.freeze({ fromMs: range.fromMs, toMs: range.toMs }),
    maxAuthorizedHorizonMs: maxHorizonMs
  };
  if (scheduleKey !== null) {
    body[scheduleKey] = Object.freeze({
      sources: Object.freeze(sources.map((source) => schedule(
        source,
        sources.length === 1
          ? range
          : { fromMs: source.firstCompleteAtMs, toMs: source.lastCompleteAtMs },
        evaluationProfile
      )))
    });
  }
  return freezeCopy({ role, partition: body });
}

function wholeDayProposal(sources, maxHorizonMs, evaluationProfile) {
  const developmentSources = sources.slice(0, -2);
  const validationSource = sources.at(-2);
  const holdoutSource = sources.at(-1);
  return Object.freeze({
    algorithmVersion: WHOLE_DAY_PARTITION_ALGORITHM,
    partitionMode: "WHOLE_DAY",
    partitions: Object.freeze([
      partition(
        "DEVELOPMENT",
        developmentSources,
        {
          fromMs: developmentSources[0].firstCompleteAtMs,
          toMs: developmentSources.at(-1).lastCompleteAtMs
        },
        maxHorizonMs,
        null,
        evaluationProfile
      ),
      partition(
        "VALIDATION",
        [validationSource],
        { fromMs: validationSource.firstCompleteAtMs, toMs: validationSource.lastCompleteAtMs },
        maxHorizonMs,
        "validationSchedule",
        evaluationProfile
      ),
      partition(
        "SEALED_HOLDOUT",
        [holdoutSource],
        { fromMs: holdoutSource.firstCompleteAtMs, toMs: holdoutSource.lastCompleteAtMs },
        maxHorizonMs,
        "holdoutSchedule",
        evaluationProfile
      )
    ])
  });
}

function validRange(fromMs, toMs) {
  return Number.isSafeInteger(fromMs) && Number.isSafeInteger(toMs) && fromMs <= toMs;
}

function insufficient({ maxHorizonMs, purgeMs, sourceIds, reasonCode }) {
  return freezeCopy({
    contractVersion: RESEARCH_EVIDENCE_PLAN_AUTHORITY_VERSION,
    status: "INSUFFICIENT_INDEPENDENT_EVIDENCE",
    reasonCode,
    maxHorizonMs,
    purgeMs,
    sourceIds
  });
}

function blockProposal(sources, maxHorizonMs, purgeMs, evaluationProfile) {
  if (sources.length === 2) {
    const development = sources[0];
    const splitSource = sources[1];
    const span = splitSource.lastCompleteAtMs - splitSource.firstCompleteAtMs;
    const holdoutFromMs = splitSource.firstCompleteAtMs + Math.floor(span / 2);
    const validationRange = {
      fromMs: splitSource.firstCompleteAtMs,
      toMs: holdoutFromMs - purgeMs
    };
    const holdoutRange = { fromMs: holdoutFromMs, toMs: splitSource.lastCompleteAtMs };
    if (!validRange(validationRange.fromMs, validationRange.toMs) || !validRange(holdoutRange.fromMs, holdoutRange.toMs)) {
      return null;
    }
    return Object.freeze({
      algorithmVersion: BLOCK_PARTITION_ALGORITHM,
      partitionMode: "CHRONOLOGICAL_BLOCKS",
      partitions: Object.freeze([
        partition(
          "DEVELOPMENT",
          [development],
          { fromMs: development.firstCompleteAtMs, toMs: development.lastCompleteAtMs },
          maxHorizonMs,
          null,
          evaluationProfile
        ),
        partition(
          "VALIDATION",
          [splitSource],
          validationRange,
          maxHorizonMs,
          "validationSchedule",
          evaluationProfile
        ),
        partition(
          "SEALED_HOLDOUT",
          [splitSource],
          holdoutRange,
          maxHorizonMs,
          "holdoutSchedule",
          evaluationProfile
        )
      ])
    });
  }

  const source = sources[0];
  const span = source.lastCompleteAtMs - source.firstCompleteAtMs;
  const validationFromMs = source.firstCompleteAtMs + Math.floor(span * 0.6);
  const holdoutFromMs = source.firstCompleteAtMs + Math.floor(span * 0.8);
  const developmentRange = {
    fromMs: source.firstCompleteAtMs,
    toMs: validationFromMs - purgeMs
  };
  const validationRange = {
    fromMs: validationFromMs,
    toMs: holdoutFromMs - purgeMs
  };
  const holdoutRange = { fromMs: holdoutFromMs, toMs: source.lastCompleteAtMs };
  if (
    !validRange(developmentRange.fromMs, developmentRange.toMs)
    || !validRange(validationRange.fromMs, validationRange.toMs)
    || !validRange(holdoutRange.fromMs, holdoutRange.toMs)
  ) {
    return null;
  }
  return Object.freeze({
    algorithmVersion: BLOCK_PARTITION_ALGORITHM,
    partitionMode: "CHRONOLOGICAL_BLOCKS",
    partitions: Object.freeze([
      partition("DEVELOPMENT", [source], developmentRange, maxHorizonMs, null, evaluationProfile),
      partition("VALIDATION", [source], validationRange, maxHorizonMs, "validationSchedule", evaluationProfile),
      partition("SEALED_HOLDOUT", [source], holdoutRange, maxHorizonMs, "holdoutSchedule", evaluationProfile)
    ])
  });
}

export function proposeDeterministicEvidencePlan({
  objectiveVersion,
  evidenceInventory,
  evaluationProfile,
  timingToleranceMs = 0
} = {}) {
  const horizonsMs = objectiveHorizonsMs(objectiveVersion);
  const profile = normalizeEvaluationProfile(evaluationProfile, horizonsMs);
  const sources = normalizeInventory(evidenceInventory);
  const tolerance = assertSafeInteger(timingToleranceMs, "timingToleranceMs");
  const maxHorizonMs = Math.max(...horizonsMs);
  const purgeMs = maxHorizonMs + tolerance;
  if (!Number.isSafeInteger(purgeMs)) invalid("purgeMs exceeds safe integer range");

  const split = sources.length >= 3
    ? wholeDayProposal(sources, maxHorizonMs, profile)
    : blockProposal(sources, maxHorizonMs, purgeMs, profile);
  if (split === null) {
    return insufficient({
      maxHorizonMs,
      purgeMs,
      sourceIds: sources.map((source) => source.sourceId),
      reasonCode: "INSUFFICIENT_CHRONOLOGICAL_SPAN"
    });
  }

  const payload = freezeCopy({
    contractVersion: RESEARCH_EVIDENCE_PLAN_AUTHORITY_VERSION,
    status: "PROPOSED",
    algorithmVersion: split.algorithmVersion,
    partitionMode: split.partitionMode,
    maxHorizonMs,
    timingToleranceMs: tolerance,
    purgeMs,
    sourceOrder: sources.map((source) => source.sourceId),
    evaluationProfile: profile,
    partitions: split.partitions
  });
  return freezeCopy({
    ...payload,
    proposalHash: sha256(JSON.stringify(payload))
  });
}

export function committedPlanInputFromProposal(proposal) {
  if (!proposal || proposal.status !== "PROPOSED") {
    invalid("Only a deterministic PROPOSED Evidence Plan can be committed");
  }
  const plan = freezeCopy({
    contractVersion: proposal.contractVersion,
    algorithmVersion: proposal.algorithmVersion,
    partitionMode: proposal.partitionMode,
    maxHorizonMs: proposal.maxHorizonMs,
    timingToleranceMs: proposal.timingToleranceMs,
    purgeMs: proposal.purgeMs,
    sourceOrder: proposal.sourceOrder,
    evaluationProfile: proposal.evaluationProfile,
    proposalHash: proposal.proposalHash
  });
  return Object.freeze({ plan, partitions: proposal.partitions });
}

export function assertCommittedPlanMatchesProposal({ proposal, plan, partitions } = {}) {
  const expected = committedPlanInputFromProposal(proposal);
  if (!sameJson(expected.plan, plan) || !sameJson(expected.partitions, partitions)) {
    throw new Error("Committed sealed Evidence Plan must exactly match the server deterministic proposal");
  }
  return true;
}

export function assertValidationRequestMatchesPlan({ plan, partition, request } = {}) {
  if (plan?.plan?.contractVersion !== RESEARCH_EVIDENCE_PLAN_AUTHORITY_VERSION) {
    throw new Error("Validation requires a server-authoritative deterministic Evidence Plan");
  }
  if (partition?.role !== "VALIDATION") {
    throw new Error("Validation request requires the exact VALIDATION partition");
  }
  const scheduleSources = partition.partition?.validationSchedule?.sources;
  if (!Array.isArray(scheduleSources)) {
    throw new Error("Validation partition is missing its frozen validationSchedule");
  }
  const matches = scheduleSources.filter((source) => source?.sourceId === request?.sourceId);
  if (matches.length !== 1) {
    throw new Error("Validation source is not present exactly once in the frozen validationSchedule");
  }
  const expected = matches[0];
  for (const [key, actual] of [
    ["fromAtMs", request.fromAtMs],
    ["toAtMs", request.toAtMs],
    ["intervalValue", request.intervalValue],
    ["intervalUnit", request.intervalUnit]
  ]) {
    if (actual !== expected[key]) {
      throw new Error(`Validation request ${key} must match the frozen validationSchedule`);
    }
  }
  const profile = plan.plan.evaluationProfile;
  if (request.topX !== profile?.topX || !sameJson(request.horizonsMs, profile?.horizonsMs)) {
    throw new Error("Validation request Top-X/horizons must match the frozen Evidence Plan evaluation profile");
  }
  return true;
}

export function assertFinalistProfileMatchesPlan({ plan, evaluationProfile } = {}) {
  if (plan?.plan?.contractVersion !== RESEARCH_EVIDENCE_PLAN_AUTHORITY_VERSION) {
    throw new Error("Finalist Set requires a server-authoritative deterministic Evidence Plan");
  }
  const expected = normalizeFinalistEvaluationProfile(plan.plan.evaluationProfile);
  const actual = normalizeFinalistEvaluationProfile(evaluationProfile);
  if (!sameJson(expected, actual)) {
    throw new Error("Finalist evaluationProfile must match the frozen Evidence Plan evaluation profile");
  }
  return true;
}
