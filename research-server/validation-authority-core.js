import { createHash } from "node:crypto";

export const RESEARCH_VALIDATION_AUTHORITY_VERSION = "research-validation-authority-v1";
export const SEALED_HOLDOUT_ROLE = "SEALED_HOLDOUT";
export const HOLDOUT_FINAL_CAPABILITY = "HOLDOUT_FINAL";

const ID_PATTERNS = Object.freeze({
  researchRunId: /^run_[0-9a-f-]{36}$/u,
  objectiveVersionId: /^obj_[0-9a-f-]{36}$/u,
  evidencePlanId: /^plan_[0-9a-f-]{36}$/u,
  partitionId: /^part_[0-9a-f-]{36}$/u,
  queryArtifactId: /^qry_[0-9a-f-]{36}$/u,
  experimentId: /^exp_[0-9a-f-]{36}$/u,
  metricSetId: /^metrics_[0-9a-f-]{36}$/u,
  validationExposureId: /^vexp_[0-9a-f-]{36}$/u,
  finalistSetId: /^finalist_[0-9a-f-]{36}$/u
});

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

function assertId(value, label) {
  const pattern = ID_PATTERNS[label];
  if (!pattern || typeof value !== "string" || !pattern.test(value)) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    invalid(`${label} must be a SHA-256 value`);
  }
  return value;
}

function assertSafeTimestamp(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative safe integer`);
  return value;
}

function assertPositiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    invalid(`${label} must be a positive safe integer not greater than ${max}`);
  }
  return value;
}

function boundedText(value, label, maxChars) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxChars) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeJsonObject(value, label, maxChars = 16_384) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} must be a JSON object`);
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalid(`${label} must be JSON serializable`);
  }
  if (serialized === undefined || serialized.length > maxChars) {
    invalid(`${label} must serialize to at most ${maxChars} characters`);
  }
  return freezeCopy(JSON.parse(serialized));
}

function normalizeQueryArtifacts(queryArtifacts) {
  if (!Array.isArray(queryArtifacts) || queryArtifacts.length < 1 || queryArtifacts.length > 3) {
    invalid("queryArtifacts must contain one to three immutable Query Artifacts");
  }
  const seen = new Set();
  return Object.freeze(queryArtifacts.map((artifact) => {
    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
      invalid("queryArtifacts contains an invalid artifact");
    }
    const queryArtifactId = assertId(artifact.queryArtifactId, "queryArtifactId");
    if (seen.has(queryArtifactId)) invalid("queryArtifactIds must be unique");
    seen.add(queryArtifactId);
    return Object.freeze({
      queryArtifactId,
      sqlHash: assertSha256(artifact.sqlHash, "query artifact sqlHash"),
      scannerContractVersion: boundedText(
        artifact.scannerContractVersion,
        "scannerContractVersion",
        128
      )
    });
  }));
}

export function normalizeFinalistEvaluationProfile(profile) {
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) {
    invalid("evaluationProfile must be an object");
  }
  const selectionPolicy = boundedText(profile.selectionPolicy, "selectionPolicy", 64);
  const topX = assertPositiveInteger(profile.topX, "topX", 5000);
  if (!Array.isArray(profile.horizonsMs) || profile.horizonsMs.length < 1 || profile.horizonsMs.length > 16) {
    invalid("horizonsMs must contain one to sixteen positive horizons");
  }
  const horizonsMs = profile.horizonsMs.map((value) => assertPositiveInteger(value, "horizonMs"));
  if (new Set(horizonsMs).size !== horizonsMs.length) invalid("horizonsMs must be unique");
  const metricProfile = normalizeJsonObject(profile.metricProfile, "metricProfile");
  return freezeCopy({ selectionPolicy, topX, horizonsMs, metricProfile });
}

export function freezeValidationExposure({
  validationExposureId,
  researchRunId,
  objectiveVersionId,
  partitionId,
  experimentId,
  metricSetId,
  requestFingerprint,
  queryArtifacts,
  schedule,
  exposureIndex,
  createdAtMs
} = {}) {
  const payload = {
    contractVersion: RESEARCH_VALIDATION_AUTHORITY_VERSION,
    validationExposureId: assertId(validationExposureId, "validationExposureId"),
    researchRunId: assertId(researchRunId, "researchRunId"),
    objectiveVersionId: assertId(objectiveVersionId, "objectiveVersionId"),
    partitionId: assertId(partitionId, "partitionId"),
    experimentId: assertId(experimentId, "experimentId"),
    metricSetId: assertId(metricSetId, "metricSetId"),
    requestFingerprint: assertSha256(requestFingerprint, "requestFingerprint"),
    queryArtifacts: normalizeQueryArtifacts(queryArtifacts),
    schedule: normalizeJsonObject(schedule, "schedule", 65_536),
    exposureIndex: assertPositiveInteger(exposureIndex, "exposureIndex"),
    createdAtMs: assertSafeTimestamp(createdAtMs, "createdAtMs")
  };
  return freezeCopy({
    ...payload,
    exposureHash: sha256(JSON.stringify(payload))
  });
}

export function freezeFinalistSet({
  finalistSetId,
  researchRunId,
  objectiveVersionId,
  evidencePlanId,
  validationPartitionId,
  holdoutPartitionId,
  queryArtifacts,
  evaluationProfile,
  validationExposureCountAtLock,
  justification,
  createdAtMs
} = {}) {
  const payload = {
    contractVersion: RESEARCH_VALIDATION_AUTHORITY_VERSION,
    finalistSetId: assertId(finalistSetId, "finalistSetId"),
    researchRunId: assertId(researchRunId, "researchRunId"),
    objectiveVersionId: assertId(objectiveVersionId, "objectiveVersionId"),
    evidencePlanId: assertId(evidencePlanId, "evidencePlanId"),
    validationPartitionId: assertId(validationPartitionId, "partitionId"),
    holdoutPartitionId: assertId(holdoutPartitionId, "partitionId"),
    queryArtifacts: normalizeQueryArtifacts(queryArtifacts),
    evaluationProfile: normalizeFinalistEvaluationProfile(evaluationProfile),
    validationExposureCountAtLock: Number(validationExposureCountAtLock) === 0
      ? 0
      : assertPositiveInteger(validationExposureCountAtLock, "validationExposureCountAtLock"),
    justification: boundedText(justification, "justification", 4096),
    createdAtMs: assertSafeTimestamp(createdAtMs, "createdAtMs")
  };
  if (payload.validationPartitionId === payload.holdoutPartitionId) {
    invalid("Validation and Sealed Holdout partitions must be distinct");
  }
  return freezeCopy({
    ...payload,
    finalistHash: sha256(JSON.stringify(payload))
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function authorizeSealedHoldout({
  capability,
  researchRunId,
  holdoutPartitionId,
  finalistSet
} = {}) {
  if (capability !== HOLDOUT_FINAL_CAPABILITY) {
    throw new Error("Sealed Holdout is unavailable outside dedicated HOLDOUT_FINAL evaluation");
  }
  if (finalistSet === null || typeof finalistSet !== "object" || Array.isArray(finalistSet)) {
    throw new Error("Sealed Holdout requires an immutable Finalist Set");
  }
  const runId = assertId(researchRunId, "researchRunId");
  const partitionId = assertId(holdoutPartitionId, "partitionId");
  if (finalistSet.researchRunId !== runId) {
    throw new Error("Finalist Set belongs to a different Research Run");
  }
  if (finalistSet.holdoutPartitionId !== partitionId) {
    throw new Error("Finalist Set does not authorize this Sealed Holdout partition");
  }
  const frozen = freezeFinalistSet(finalistSet);
  if (!sameJson(frozen, finalistSet)) {
    throw new Error("Finalist Set is not a canonical immutable authority record");
  }
  return freezeCopy({
    contractVersion: RESEARCH_VALIDATION_AUTHORITY_VERSION,
    capability: HOLDOUT_FINAL_CAPABILITY,
    researchRunId: runId,
    finalistSetId: frozen.finalistSetId,
    objectiveVersionId: frozen.objectiveVersionId,
    evidencePlanId: frozen.evidencePlanId,
    holdoutPartitionId: frozen.holdoutPartitionId,
    queryArtifacts: frozen.queryArtifacts,
    evaluationProfile: frozen.evaluationProfile,
    finalistHash: frozen.finalistHash
  });
}
