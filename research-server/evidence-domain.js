import { openResearchEvidenceLedger } from "./evidence-ledger.js";

const PATH_KEY_SUFFIX = /(?:path|filepath|filename|directory|folder)$/iu;
const RELATIVE_FILE_PATH = /(?:^|[\\/])(?:[^\\/]+[\\/])+[^\\/]+\.(?:duckdb|db|sqlite|sqlite3|json|csv|parquet|arrow)$/iu;
const SOURCE_ID = /^[A-Za-z0-9._:-]{1,256}$/u;
const SOURCE_FINGERPRINT = /^[0-9a-f]{64}$/u;
const PARTITION_ROLES = new Set(["DEVELOPMENT", "VALIDATION", "SEALED_HOLDOUT"]);

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

function assertEvidenceInventory(inventory) {
  if (inventory === null || typeof inventory !== "object" || Array.isArray(inventory)) {
    throw new TypeError("inventory must be an object");
  }
  if (!Array.isArray(inventory.sources) || inventory.sources.length > 512) {
    throw new TypeError("inventory.sources must be an array with at most 512 entries");
  }

  const sourceIds = new Set();
  for (const source of inventory.sources) {
    if (source === null || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("each inventory source must be an object");
    }
    if (typeof source.sourceId !== "string" || !SOURCE_ID.test(source.sourceId)) {
      throw new TypeError("each inventory source requires a bounded logical sourceId");
    }
    if (typeof source.sourceFingerprint !== "string" || !SOURCE_FINGERPRINT.test(source.sourceFingerprint)) {
      throw new TypeError("each inventory source requires a SHA-256 sourceFingerprint");
    }
    if (sourceIds.has(source.sourceId)) {
      throw new TypeError(`inventory contains duplicate sourceId ${source.sourceId}`);
    }
    sourceIds.add(source.sourceId);
  }

  assertLogicalEvidenceValue(inventory, "inventory");
  return inventory;
}

function assertEvidencePlanPartitions(partitions) {
  if (!Array.isArray(partitions) || partitions.length < 2 || partitions.length > 3) {
    throw new TypeError("partitions must contain DEVELOPMENT and VALIDATION, with optional SEALED_HOLDOUT");
  }

  const roles = new Set();
  for (const entry of partitions) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError("partition definition must be an object");
    }
    if (!PARTITION_ROLES.has(entry.role)) {
      throw new TypeError("partition role is not supported");
    }
    if (roles.has(entry.role)) {
      throw new TypeError(`duplicate partition role ${entry.role}`);
    }
    roles.add(entry.role);
    assertLogicalEvidenceValue(entry.partition, "partition");
  }

  if (!roles.has("DEVELOPMENT") || !roles.has("VALIDATION")) {
    throw new TypeError("partitions must contain DEVELOPMENT and VALIDATION, with optional SEALED_HOLDOUT");
  }
  if (partitions.length === 3 && !roles.has("SEALED_HOLDOUT")) {
    throw new TypeError("third partition must be SEALED_HOLDOUT");
  }
  return partitions;
}

export async function openResearchEvidenceDomain(options = {}) {
  const ledger = await openResearchEvidenceLedger(options);

  return Object.freeze({
    schemaVersion: ledger.schemaVersion,

    async createEvidenceInventory(input) {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("evidence inventory request must be an object");
      }
      assertEvidenceInventory(input.inventory);
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
      assertEvidencePlanPartitions(input.partitions);
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
