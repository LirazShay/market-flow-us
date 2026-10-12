import { createHash } from "node:crypto";

function deterministicUuid(prefix, namespace, researchRunId, clientRequestId) {
  const hex = createHash("sha256")
    .update(`${namespace}\u0000${researchRunId}\u0000${clientRequestId}`, "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${prefix}_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function deterministicManagedExperimentId(researchRunId, clientRequestId) {
  return deterministicUuid("exp", "development-experiment", researchRunId, clientRequestId);
}

export function deterministicManagedAnalysisId(researchRunId, clientRequestId) {
  return deterministicUuid("analysis", "research-sql", researchRunId, clientRequestId);
}
