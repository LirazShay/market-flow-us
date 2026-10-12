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

async function withComponent(opener, options, operation) {
  const component = await opener(options);
  try {
    return await operation(component);
  } finally {
    await component.close();
  }
}

async function bootstrapComponent(opener, options) {
  return await withComponent(opener, options, async (component) => component.schemaVersion);
}

export async function openResearchDomain(options = {}) {
  const schemaVersions = Object.freeze({
    ledger: await bootstrapComponent(openResearchLedger, options),
    evidence: await bootstrapComponent(openResearchEvidenceDomain, options),
    memory: await bootstrapComponent(openResearchMemory, options)
  });

  let accepting = true;
  let queue = Promise.resolve();

  function enqueue(operation) {
    if (!accepting) {
      return Promise.reject(new Error("Research Domain is closed"));
    }
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  function useLedger(operation) {
    return enqueue(() => withComponent(openResearchLedger, options, operation));
  }

  function useEvidence(operation) {
    return enqueue(() => withComponent(openResearchEvidenceDomain, options, operation));
  }

  function useMemory(operation) {
    return enqueue(() => withComponent(openResearchMemory, options, operation));
  }

  return Object.freeze({
    schemaVersions,

    async createResearchRun(input) {
      assertPublicSafeValue(input, "research run");
      return await useLedger((ledger) => ledger.createResearchRun(input));
    },

    async getResearchRun(researchRunId) {
      return await useLedger((ledger) => ledger.getResearchRun(researchRunId));
    },

    async listResearchRuns(listOptions) {
      return await useLedger((ledger) => ledger.listResearchRuns(listOptions));
    },

    async createObjectiveVersion(input) {
      assertPublicSafeValue(input, "objective version");
      return await useLedger((ledger) => ledger.createObjectiveVersion(input));
    },

    async getObjectiveVersion(researchRunId, objectiveVersionId) {
      return await useLedger((ledger) => ledger.getObjectiveVersion(researchRunId, objectiveVersionId));
    },

    async getCurrentObjectiveVersion(researchRunId) {
      return await useLedger((ledger) => ledger.getCurrentObjectiveVersion(researchRunId));
    },

    async listObjectiveVersions(researchRunId, listOptions) {
      return await useLedger((ledger) => ledger.listObjectiveVersions(researchRunId, listOptions));
    },

    async createQueryArtifact(input) {
      assertPublicSafeValue(input, "query artifact");
      return await useLedger((ledger) => ledger.createQueryArtifact(input));
    },

    async getQueryArtifact(researchRunId, queryArtifactId) {
      return await useLedger((ledger) => ledger.getQueryArtifact(researchRunId, queryArtifactId));
    },

    async listQueryArtifacts(researchRunId, listOptions) {
      return await useLedger((ledger) => ledger.listQueryArtifacts(researchRunId, listOptions));
    },

    async createEvidenceInventory(input) {
      assertPublicSafeValue(input, "evidence inventory");
      return await useEvidence((evidence) => evidence.createEvidenceInventory(input));
    },

    async getEvidenceInventory(researchRunId, evidenceInventoryId) {
      return await useEvidence((evidence) => evidence.getEvidenceInventory(researchRunId, evidenceInventoryId));
    },

    async listEvidenceInventories(researchRunId, listOptions) {
      return await useEvidence((evidence) => evidence.listEvidenceInventories(researchRunId, listOptions));
    },

    async createEvidencePlan(input) {
      assertPublicSafeValue(input, "evidence plan");
      return await useEvidence((evidence) => evidence.createEvidencePlan(input));
    },

    async getEvidencePlan(researchRunId, evidencePlanId) {
      return await useEvidence((evidence) => evidence.getEvidencePlan(researchRunId, evidencePlanId));
    },

    async getCurrentEvidencePlan(researchRunId) {
      return await useEvidence((evidence) => evidence.getCurrentEvidencePlan(researchRunId));
    },

    async listEvidencePlans(researchRunId, listOptions) {
      return await useEvidence((evidence) => evidence.listEvidencePlans(researchRunId, listOptions));
    },

    async getPartition(researchRunId, partitionId) {
      return await useEvidence((evidence) => evidence.getPartition(researchRunId, partitionId));
    },

    async listPartitions(researchRunId, evidencePlanId) {
      return await useEvidence((evidence) => evidence.listPartitions(researchRunId, evidencePlanId));
    },

    async recordResearchNote(input) {
      assertPublicSafeValue(input, "research note");
      return await useMemory((memory) => memory.recordResearchNote(input));
    },

    async listResearchNotes(researchRunId, listOptions) {
      return await useMemory((memory) => memory.listResearchNotes(researchRunId, listOptions));
    },

    async resumeResearchRun(researchRunId, resumeOptions) {
      return await useMemory((memory) => memory.resumeResearchRun(researchRunId, resumeOptions));
    },

    async close() {
      if (!accepting) return;
      accepting = false;
      await queue;
    }
  });
}
