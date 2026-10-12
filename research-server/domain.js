import { openResearchEvidenceDomain } from "./evidence-domain.js";
import { openResearchLedger } from "./ledger.js";
import { openResearchMemory } from "./research-memory.js";

const FORBIDDEN_KEY_SUFFIXES = Object.freeze([
  "password",
  "passwd",
  "credential",
  "credentials",
  "cookie",
  "cookies",
  "authorization",
  "apikey",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
  "browsersession",
  "sessionid",
  "sessiondata",
  "authsession",
  "accountid",
  "accountnumber",
  "accountidentifier",
  "browserdump",
  "rawbrowserdump",
  "browserstate",
  "privatebrowserstate",
  "privatebrowserdata",
  "chainofthought",
  "privatereasoning",
  "hiddenreasoning",
  "scratchpad"
]);

const FORBIDDEN_TEXT = /(?:authorization|cookie|set-cookie|password|passwd|api[-_ ]?key|client[-_ ]?secret|access[-_ ]?token|refresh[-_ ]?token|session(?:id)?|account(?:id|number))\s*[:=]\s*\S+/iu;
const BEARER_TEXT = /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/iu;

function normalizedKey(value) {
  return value.replace(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

function assertPublicSafeKey(key, label) {
  const compact = normalizedKey(key);
  if (FORBIDDEN_KEY_SUFFIXES.some((suffix) => compact.endsWith(suffix))) {
    throw new TypeError(`${label} contains a field that is not public-safe research data`);
  }
}

function assertPublicSafeText(value, label) {
  if (FORBIDDEN_TEXT.test(value) || BEARER_TEXT.test(value)) {
    throw new TypeError(`${label} contains content that is not public-safe research data`);
  }
}

function assertPublicSafeValue(value, label) {
  const seen = new Set();

  function visit(current) {
    if (current === null || current === undefined) return;
    if (typeof current === "string") {
      assertPublicSafeText(current, label);
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
        assertPublicSafeKey(key, label);
        visit(item);
      }
    }
    seen.delete(current);
  }

  visit(value);
  return value;
}

async function closeQuietly(component) {
  try {
    await component?.close();
  } catch {
    // Preserve the original startup/operation error.
  }
}

export async function openResearchDomain(options = {}) {
  let ledger = null;
  let evidence = null;
  let memory = null;
  let closed = false;

  try {
    ledger = await openResearchLedger(options);
    evidence = await openResearchEvidenceDomain(options);
    memory = await openResearchMemory(options);
  } catch (error) {
    await closeQuietly(memory);
    await closeQuietly(evidence);
    await closeQuietly(ledger);
    throw error;
  }

  return Object.freeze({
    schemaVersions: Object.freeze({
      ledger: ledger.schemaVersion,
      evidence: evidence.schemaVersion,
      memory: memory.schemaVersion
    }),

    async createResearchRun(input) {
      assertPublicSafeValue(input, "research run");
      return await ledger.createResearchRun(input);
    },

    async getResearchRun(researchRunId) {
      return await ledger.getResearchRun(researchRunId);
    },

    async listResearchRuns(options) {
      return await ledger.listResearchRuns(options);
    },

    async createObjectiveVersion(input) {
      assertPublicSafeValue(input, "objective version");
      return await ledger.createObjectiveVersion(input);
    },

    async getObjectiveVersion(researchRunId, objectiveVersionId) {
      return await ledger.getObjectiveVersion(researchRunId, objectiveVersionId);
    },

    async getCurrentObjectiveVersion(researchRunId) {
      return await ledger.getCurrentObjectiveVersion(researchRunId);
    },

    async listObjectiveVersions(researchRunId, options) {
      return await ledger.listObjectiveVersions(researchRunId, options);
    },

    async createQueryArtifact(input) {
      assertPublicSafeValue(input, "query artifact");
      return await ledger.createQueryArtifact(input);
    },

    async getQueryArtifact(researchRunId, queryArtifactId) {
      return await ledger.getQueryArtifact(researchRunId, queryArtifactId);
    },

    async listQueryArtifacts(researchRunId, options) {
      return await ledger.listQueryArtifacts(researchRunId, options);
    },

    async createEvidenceInventory(input) {
      assertPublicSafeValue(input, "evidence inventory");
      return await evidence.createEvidenceInventory(input);
    },

    async getEvidenceInventory(researchRunId, evidenceInventoryId) {
      return await evidence.getEvidenceInventory(researchRunId, evidenceInventoryId);
    },

    async listEvidenceInventories(researchRunId, options) {
      return await evidence.listEvidenceInventories(researchRunId, options);
    },

    async createEvidencePlan(input) {
      assertPublicSafeValue(input, "evidence plan");
      return await evidence.createEvidencePlan(input);
    },

    async getEvidencePlan(researchRunId, evidencePlanId) {
      return await evidence.getEvidencePlan(researchRunId, evidencePlanId);
    },

    async getCurrentEvidencePlan(researchRunId) {
      return await evidence.getCurrentEvidencePlan(researchRunId);
    },

    async listEvidencePlans(researchRunId, options) {
      return await evidence.listEvidencePlans(researchRunId, options);
    },

    async getPartition(researchRunId, partitionId) {
      return await evidence.getPartition(researchRunId, partitionId);
    },

    async listPartitions(researchRunId, evidencePlanId) {
      return await evidence.listPartitions(researchRunId, evidencePlanId);
    },

    async recordResearchNote(input) {
      assertPublicSafeValue(input, "research note");
      return await memory.recordResearchNote(input);
    },

    async listResearchNotes(researchRunId, options) {
      return await memory.listResearchNotes(researchRunId, options);
    },

    async resumeResearchRun(researchRunId, options) {
      return await memory.resumeResearchRun(researchRunId, options);
    },

    async close() {
      if (closed) return;
      closed = true;
      await closeQuietly(memory);
      await closeQuietly(evidence);
      await closeQuietly(ledger);
    }
  });
}
