import { createHash } from "node:crypto";

import { executeBacktestPoint } from "../backtest-lab/point-execution.js";

const MAX_QUERY_SQL_BYTES = 1024 * 1024;

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

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertArtifactId(value) {
  if (typeof value !== "string" || !/^qry_[0-9a-f-]{36}$/u.test(value)) {
    invalid("queryArtifactId must be a qry_ prefixed UUID");
  }
  return value;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    invalid("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertSha256(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    invalid("query artifact sqlHash must be a SHA-256 value");
  }
  return value;
}

function assertBoundedText(value, label, maxChars) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxChars) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function assertExactSqlText(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || Buffer.byteLength(value, "utf8") > MAX_QUERY_SQL_BYTES
  ) {
    invalid(`query artifact SQL must be non-empty UTF-8 text of at most ${MAX_QUERY_SQL_BYTES} bytes`);
  }
  return value;
}

function freezeQueryBindings(queryArtifacts) {
  if (!Array.isArray(queryArtifacts) || queryArtifacts.length < 1 || queryArtifacts.length > 3) {
    invalid("Choose one to three immutable Query Artifacts.");
  }

  const ids = new Set();
  let researchRunId = null;
  const bindings = queryArtifacts.map((artifact) => {
    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
      invalid("Query Artifact is invalid.");
    }

    const queryArtifactId = assertArtifactId(artifact.queryArtifactId);
    if (ids.has(queryArtifactId)) invalid("Query Artifact IDs must be unique.");
    ids.add(queryArtifactId);

    const artifactResearchRunId = assertResearchRunId(artifact.researchRunId);
    if (researchRunId === null) researchRunId = artifactResearchRunId;
    if (artifactResearchRunId !== researchRunId) {
      invalid("All Query Artifacts must belong to the same Research Run.");
    }

    const sqlText = assertExactSqlText(artifact.sqlText);
    const sqlHash = assertSha256(artifact.sqlHash);
    if (sha256(sqlText) !== sqlHash) {
      invalid("query artifact sqlHash does not match SQL text");
    }
    const scannerContractVersion = assertBoundedText(
      artifact.scannerContractVersion,
      "scannerContractVersion",
      128
    );
    const label = artifact.label === null || artifact.label === undefined
      ? queryArtifactId
      : assertBoundedText(artifact.label, "query artifact label", 256);

    return {
      queryArtifactId,
      sqlHash,
      scannerContractVersion,
      label,
      sqlText
    };
  });

  return freezeCopy({ researchRunId, bindings });
}

export async function executeAuthoritativeExperimentPoint({
  dataDir,
  sourceId,
  requestedAtMs,
  queryArtifacts,
  topX = 10,
  horizonsMs,
  now,
  executePoint = executeBacktestPoint
} = {}) {
  if (typeof executePoint !== "function") {
    invalid("executePoint must be a function.");
  }

  const frozen = freezeQueryBindings(queryArtifacts);
  const queries = frozen.bindings.map((binding) => ({
    id: binding.queryArtifactId,
    name: binding.label,
    sql: binding.sqlText
  }));

  const point = await executePoint({
    dataDir,
    sourceId,
    requestedAtMs,
    queries,
    topX,
    horizonsMs,
    now
  });

  return freezeCopy({
    researchRunId: frozen.researchRunId,
    queryArtifacts: frozen.bindings.map((binding) => ({
      queryArtifactId: binding.queryArtifactId,
      sqlHash: binding.sqlHash,
      scannerContractVersion: binding.scannerContractVersion
    })),
    point
  });
}
