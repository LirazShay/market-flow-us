const RESEARCH_RUN_ID = /^run_[0-9a-f-]{36}$/u;
const QUERY_ARTIFACT_ID = /^qry_[0-9a-f-]{36}$/u;
const ARTIFACT_ID = /^artifact_[0-9a-f-]{36}$/u;
const MAX_EVIDENCE_REF_CHARS = 512;

function assertTarget(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("strategyValidationTarget must be an object");
  }
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("researchRunId") || !keys.includes("queryArtifactId")) {
    throw new TypeError("strategyValidationTarget fields are invalid");
  }
  if (typeof value.researchRunId !== "string" || !RESEARCH_RUN_ID.test(value.researchRunId)) {
    throw new TypeError("strategyValidationTarget.researchRunId is invalid");
  }
  if (typeof value.queryArtifactId !== "string" || !QUERY_ARTIFACT_ID.test(value.queryArtifactId)) {
    throw new TypeError("strategyValidationTarget.queryArtifactId is invalid");
  }
  return Object.freeze({
    researchRunId: value.researchRunId,
    queryArtifactId: value.queryArtifactId
  });
}

function evidenceRef(target, artifactId = null) {
  const value = artifactId === null
    ? `research-run:${target.researchRunId}:terminal-artifact-missing`
    : `research-recommendation:${artifactId}:query:${target.queryArtifactId}`;
  if (value.length > MAX_EVIDENCE_REF_CHARS) {
    throw new Error("Historical validation evidence reference exceeds bounded size");
  }
  return value;
}

function result(target, status, reasonCode, artifactId = null) {
  return Object.freeze({
    validationEvidence: Object.freeze({
      authority: "HISTORICAL_BACKTEST",
      status,
      evidenceRef: evidenceRef(target, artifactId)
    }),
    reasonCode
  });
}

export async function resolveHistoricalBacktestValidation({
  researchDomain,
  strategyValidationTarget
} = {}) {
  if (!researchDomain || typeof researchDomain.getRecommendationArtifact !== "function") {
    throw new TypeError("researchDomain.getRecommendationArtifact() is required");
  }
  const target = assertTarget(strategyValidationTarget);
  const artifact = await researchDomain.getRecommendationArtifact(target.researchRunId);
  if (artifact === null || artifact === undefined) {
    return result(target, "INSUFFICIENT_EVIDENCE", "HISTORICAL_TERMINAL_ARTIFACT_MISSING");
  }
  if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("Research Domain returned an invalid RecommendationArtifact");
  }
  if (artifact.researchRunId !== target.researchRunId) {
    throw new Error("RecommendationArtifact Research Run does not match strategy validation target");
  }
  if (typeof artifact.artifactId !== "string" || !ARTIFACT_ID.test(artifact.artifactId)) {
    throw new Error("RecommendationArtifact artifactId is invalid");
  }

  if (artifact.outcome === "NO_RECOMMENDATION") {
    return result(
      target,
      artifact.finalistSetId === null ? "INSUFFICIENT_EVIDENCE" : "FAIL",
      artifact.finalistSetId === null
        ? "HISTORICAL_INSUFFICIENT_INDEPENDENT_EVIDENCE"
        : "HISTORICAL_NO_RECOMMENDATION",
      artifact.artifactId
    );
  }
  if (artifact.outcome !== "SELECTED_QUERY") {
    throw new Error("RecommendationArtifact outcome is unsupported");
  }
  if (artifact.confidenceClassification !== "INDEPENDENT_HOLDOUT_SUPPORTED") {
    return result(
      target,
      "INSUFFICIENT_EVIDENCE",
      "HISTORICAL_SELECTED_QUERY_LACKS_INDEPENDENT_HOLDOUT_SUPPORT",
      artifact.artifactId
    );
  }
  if (artifact.selectedQuery?.queryArtifactId !== target.queryArtifactId) {
    return result(
      target,
      "FAIL",
      "HISTORICAL_SELECTED_DIFFERENT_QUERY",
      artifact.artifactId
    );
  }

  return result(
    target,
    "PASS",
    "HISTORICAL_SELECTED_QUERY_INDEPENDENTLY_SUPPORTED",
    artifact.artifactId
  );
}
