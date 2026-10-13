import { openResearchEvidenceDomain } from "./evidence-domain.js";

const SHA256 = /^[0-9a-f]{64}$/u;

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} persistence is invalid`);
  }
  return value;
}

function authorizedSources(partition, inventory) {
  const sourceIds = partition?.partition?.sourceIds;
  if (!Array.isArray(sourceIds) || sourceIds.length < 1) {
    throw new Error("Research SQL partition must contain at least one authorized sourceId");
  }

  const seen = new Set();
  return Object.freeze(sourceIds.map((sourceId) => {
    if (typeof sourceId !== "string" || seen.has(sourceId)) {
      throw new Error("Research SQL partition contains invalid or duplicate sourceId authority");
    }
    seen.add(sourceId);
    const matches = inventory?.inventory?.sources?.filter((source) => source?.sourceId === sourceId) ?? [];
    if (matches.length !== 1) {
      throw new Error("Research SQL authorized source is not present exactly once in the bound Evidence Inventory");
    }
    return Object.freeze({
      sourceId,
      sourceFingerprint: assertSha256(matches[0].sourceFingerprint, "sourceFingerprint")
    });
  }));
}

export async function freezeResearchSqlResultProvenance(options, input) {
  if (!options?.freezeResearchSqlProvenance || input?.resultKind !== "RESEARCH_SQL_RESULT") {
    return input;
  }
  if (!input?.provenance || typeof input.provenance !== "object" || Array.isArray(input.provenance)) {
    throw new TypeError("Research SQL Result provenance must be an object");
  }
  if (Object.hasOwn(input.provenance, "evidence")) {
    throw new Error("Research SQL evidence provenance is server-owned");
  }

  const evidence = await openResearchEvidenceDomain(options);
  try {
    const partition = await evidence.getPartition(input.researchRunId, input.provenance.partitionId);
    if (!partition || partition.role !== "DEVELOPMENT") {
      throw new Error("Research SQL Result partition is not an authorized DEVELOPMENT partition");
    }
    const plan = await evidence.getEvidencePlan(input.researchRunId, partition.evidencePlanId);
    if (!plan) throw new Error("Research SQL Result Evidence Plan was not found");
    const inventory = await evidence.getEvidenceInventory(input.researchRunId, plan.evidenceInventoryId);
    if (!inventory) throw new Error("Research SQL Result Evidence Inventory was not found");

    return {
      ...input,
      provenance: {
        ...input.provenance,
        evidence: {
          evidenceInventoryId: inventory.evidenceInventoryId,
          inventoryHash: assertSha256(inventory.inventoryHash, "inventoryHash"),
          evidencePlanId: plan.evidencePlanId,
          planHash: assertSha256(plan.planHash, "planHash"),
          partitionId: partition.partitionId,
          partitionHash: assertSha256(partition.partitionHash, "partitionHash"),
          authorizedSources: authorizedSources(partition, inventory)
        }
      }
    };
  } finally {
    await evidence.close();
  }
}
