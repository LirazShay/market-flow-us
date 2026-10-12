import { executeAuthoritativeExperimentBatch } from "./experiment-authority.js";
import { openResearchEvidenceDomain } from "./evidence-domain.js";
import { openResearchExperimentLedger } from "./experiment-ledger.js";
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
const SOURCE_ID = /^[A-Za-z0-9._:-]{1,256}$/u;
const QUERY_ARTIFACT_ID = /^qry_[0-9a-f-]{36}$/u;
const DISALLOWED_EXPERIMENT_AUTHORITY_KEYS = Object.freeze([
  "dataDir",
  "phase",
  "queryArtifacts",
  "sourceFingerprint",
  "sqlText"
]);

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

function assertDevelopmentExperimentInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("development experiment request must be an object");
  }
  for (const key of DISALLOWED_EXPERIMENT_AUTHORITY_KEYS) {
    if (Object.hasOwn(input, key)) {
      throw new TypeError(`${key} is server-owned experiment authority`);
    }
  }
  if (typeof input.sourceId !== "string" || !SOURCE_ID.test(input.sourceId)) {
    throw new TypeError("sourceId must be a bounded logical source ID");
  }
  if (!Array.isArray(input.queryArtifactIds) || input.queryArtifactIds.length < 1 || input.queryArtifactIds.length > 3) {
    throw new TypeError("queryArtifactIds must contain one to three immutable Query Artifact IDs");
  }
  const seen = new Set();
  for (const queryArtifactId of input.queryArtifactIds) {
    if (typeof queryArtifactId !== "string" || !QUERY_ARTIFACT_ID.test(queryArtifactId)) {
      throw new TypeError("queryArtifactIds contains an invalid Query Artifact ID");
    }
    if (seen.has(queryArtifactId)) {
      throw new TypeError("queryArtifactIds must be unique");
    }
    seen.add(queryArtifactId);
  }
  return input;
}

function authorizedPartitionSource(partition, inventory, sourceId) {
  const sourceIds = partition?.partition?.sourceIds;
  if (!Array.isArray(sourceIds) || !sourceIds.includes(sourceId)) {
    throw new Error("Experiment source is not authorized by the Development partition");
  }
  const matches = inventory?.inventory?.sources?.filter((source) => source?.sourceId === sourceId) ?? [];
  if (matches.length !== 1) {
    throw new Error("Experiment source is not present exactly once in the bound evidence inventory");
  }
  return matches[0];
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
    experiments: await bootstrapComponent(openResearchExperimentLedger, options),
    memory: await bootstrapComponent(openResearchMemory, options)
  });
  const executeExperimentBatch = options.executeExperimentBatch ?? executeAuthoritativeExperimentBatch;
  const marketDataDir = options.marketDataDir ?? "data";
  if (typeof executeExperimentBatch !== "function") {
    throw new TypeError("executeExperimentBatch must be a function");
  }
  if (typeof marketDataDir !== "string" || marketDataDir.length === 0) {
    throw new TypeError("marketDataDir must be a non-empty server-owned path");
  }

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

  function useExperiments(operation) {
    return enqueue(() => withComponent(openResearchExperimentLedger, options, operation));
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

    async executeDevelopmentExperiment(input) {
      assertPublicSafeValue(input, "development experiment");
      const request = assertDevelopmentExperimentInput(input);
      const objective = await useLedger((ledger) => ledger.getObjectiveVersion(
        request.researchRunId,
        request.objectiveVersionId
      ));
      if (!objective) {
        throw new Error("Objective Version was not found in this Research Run");
      }

      const partition = await useEvidence((evidence) => evidence.getPartition(
        request.researchRunId,
        request.partitionId
      ));
      if (!partition) {
        throw new Error("Partition was not found in this Research Run");
      }
      if (partition.role !== "DEVELOPMENT") {
        throw new Error("Only DEVELOPMENT experiments are authorized before Validation/Holdout authority");
      }

      const plan = await useEvidence((evidence) => evidence.getEvidencePlan(
        request.researchRunId,
        partition.evidencePlanId
      ));
      if (!plan || plan.objectiveVersionId !== request.objectiveVersionId) {
        throw new Error("Development partition does not match the Experiment Objective Version");
      }
      const inventory = await useEvidence((evidence) => evidence.getEvidenceInventory(
        request.researchRunId,
        plan.evidenceInventoryId
      ));
      if (!inventory) {
        throw new Error("Development partition evidence inventory was not found");
      }
      const source = authorizedPartitionSource(partition, inventory, request.sourceId);

      const queryArtifacts = [];
      for (const queryArtifactId of request.queryArtifactIds) {
        const queryArtifact = await useLedger((ledger) => ledger.getQueryArtifact(
          request.researchRunId,
          queryArtifactId
        ));
        if (!queryArtifact) {
          throw new Error("Query Artifact was not found in this Research Run");
        }
        queryArtifacts.push(queryArtifact);
      }

      const execution = await executeExperimentBatch({
        dataDir: marketDataDir,
        objectiveVersionId: request.objectiveVersionId,
        evidencePartitionId: request.partitionId,
        phase: "DEVELOPMENT",
        sourceId: request.sourceId,
        sourceFingerprint: source.sourceFingerprint,
        queryArtifacts,
        fromAtMs: request.fromAtMs,
        toAtMs: request.toAtMs,
        intervalValue: request.intervalValue,
        intervalUnit: request.intervalUnit,
        topX: request.topX,
        horizonsMs: request.horizonsMs
      });

      return await useExperiments((experiments) => experiments.recordCompletedExperiment({
        researchRunId: request.researchRunId,
        request: execution.durableRequest,
        metrics: execution.metrics
      }));
    },

    async recordCompletedExperiment(input) {
      assertPublicSafeValue(input, "completed experiment");
      return await useExperiments((experiments) => experiments.recordCompletedExperiment(input));
    },

    async getExperiment(researchRunId, experimentId) {
      return await useExperiments((experiments) => experiments.getExperiment(researchRunId, experimentId));
    },

    async listExperiments(researchRunId, listOptions) {
      return await useExperiments((experiments) => experiments.listExperiments(researchRunId, listOptions));
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