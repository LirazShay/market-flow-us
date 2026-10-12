import { openResearchEvidenceLedger } from "./evidence-ledger.js";

const PATH_KEY_SUFFIX = /(?:path|filepath|filename|directory|folder)$/iu;
const RELATIVE_FILE_PATH = /(?:^|[\\/])(?:[^\\/]+[\\/])+[^\\/]+\.(?:duckdb|db|sqlite|sqlite3|json|csv|parquet|arrow)$/iu;

function assertLogicalEvidenceValue(value, label) {
  const seen = new Set();

  function visit(current) {
    if (current === null || current === undefined) return;

    if (typeof current === "string") {
      if (
        /^[A-Za-z]:[\\/]/u.test(current)
        || current.startsWith("/")
        || current.startsWith("\\\\")
        || current.startsWith("file:")
        || current.startsWith("./")
        || current.startsWith("../")
        || current.includes("\\")
        || RELATIVE_FILE_PATH.test(current)
      ) {
        throw new TypeError(`${label} must use logical IDs/fingerprints, not client filesystem paths`);
      }
      return;
    }

    if (typeof current !== "object") return;
    if (seen.has(current)) {
      throw new TypeError(`${label} must be JSON serializable`);
    }

    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
    } else {
      for (const [key, item] of Object.entries(current)) {
        if (PATH_KEY_SUFFIX.test(key)) {
          throw new TypeError(`${label} must use logical IDs/fingerprints, not client filesystem paths`);
        }
        visit(item);
      }
    }
    seen.delete(current);
  }

  visit(value);
  return value;
}

export async function openResearchEvidenceDomain(options = {}) {
  const ledger = await openResearchEvidenceLedger(options);

  return Object.freeze({
    schemaVersion: ledger.schemaVersion,

    async createEvidenceInventory(input) {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("evidence inventory request must be an object");
      }
      assertLogicalEvidenceValue(input.inventory, "inventory");
      return await ledger.createEvidenceInventory(input);
    },

    async getEvidenceInventory(researchRunId, evidenceInventoryId) {
      return await ledger.getEvidenceInventory(researchRunId, evidenceInventoryId);
    },

    async listEvidenceInventories(researchRunId, options) {
      return await ledger.listEvidenceInventories(researchRunId, options);
    },

    async createEvidencePlan(input) {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("evidence plan request must be an object");
      }
      assertLogicalEvidenceValue(input.plan, "plan");
      if (Array.isArray(input.partitions)) {
        for (const entry of input.partitions) {
          if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
            assertLogicalEvidenceValue(entry.partition, "partition");
          }
        }
      }
      return await ledger.createEvidencePlan(input);
    },

    async getEvidencePlan(researchRunId, evidencePlanId) {
      return await ledger.getEvidencePlan(researchRunId, evidencePlanId);
    },

    async getCurrentEvidencePlan(researchRunId) {
      return await ledger.getCurrentEvidencePlan(researchRunId);
    },

    async listEvidencePlans(researchRunId, options) {
      return await ledger.listEvidencePlans(researchRunId, options);
    },

    async getPartition(researchRunId, partitionId) {
      return await ledger.getPartition(researchRunId, partitionId);
    },

    async listPartitions(researchRunId, evidencePlanId) {
      return await ledger.listPartitions(researchRunId, evidencePlanId);
    },

    async close() {
      await ledger.close();
    }
  });
}
