import { executeAuthoritativeExperimentBatch } from "./experiment-authority.js";
import {
  createAuthoritativeExperimentDiagnostics,
  RESEARCH_EXPERIMENT_DIAGNOSTICS_VERSION
} from "./experiment-diagnostics.js";
import { openResearchEvidenceDomain } from "./evidence-domain.js";
import { openResearchExperimentLedger } from "./experiment-ledger.js";
import { openResearchLedger } from "./ledger.js";
import { openResearchMemory } from "./research-memory.js";
import { openDevelopmentResearchSqlSession } from "./research-sql-session.js";
import { verifyResearchEvidenceSourceFingerprint } from "./source-fingerprint.js";

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
const RESEARCH_SQL_REQUEST_KEYS = new Set([
  "researchRunId",
  "partitionId",
  "experimentIds"
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

function assertDevelopmentResearchSqlInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("development research SQL request must be an object");
  }
  for (const key of Object.keys(input)) {
    if (!RESEARCH_SQL_REQUEST_KEYS.has(key)) {
      throw new TypeError(`${key} is not client-owned research SQL authority`);
    }
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

function warningCodes(metrics) {
  const warnings = [];
  if (metrics.denominators?.unavailablePointCount > 0) warnings.push("UNAVAILABLE_POINTS");
  if (metrics.denominators?.repeatedBaselineRequestedPointCount > 0) warnings.push("REPEATED_BASELINES");
  if (metrics.queries?.some((query) => query.zeroResultPointCount > 0)) warnings.push("ZERO_RESULT_POINTS");
  return warnings;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const verifySourceFingerprint = options.verifySourceFingerprint ?? verifyResearchEvidenceSourceFingerprint;
  const marketDataDir = options.marketDataDir ?? "data";
  const researchSqlNow = options.now ?? (() => Date.now());
  if (typeof executeExperimentBatch !== "function") {
    throw new TypeError("executeExperimentBatch must be a function");
  }
  if (typeof verifySourceFingerprint !== "function") {
    throw new TypeError("verifySourceFingerprint must be a function");
  }
  if (typeof marketDataDir !== "string" || marketDataDir.length === 0) {
    throw new TypeError("marketDataDir must be a non-empty server-owned path");
  }
  if (typeof researchSqlNow !== "function") {
    throw new TypeError("now must be a function");
  }

  let accepting = true;
  let queue = Promise.resolve();
  const researchSqlSessions = new Set();

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

  async function loadQueryArtifacts(researchRunId, references) {
    const queryArtifacts = [];
    for (const reference of references) {
      const queryArtifactId = typeof reference === "string" ? reference : reference?.queryArtifactId;
      if (typeof queryArtifactId !== "string" || !QUERY_ARTIFACT_ID.test(queryArtifactId)) {
        throw new TypeError("Experiment Query Artifact reference is invalid");
      }
      const queryArtifact = await useLedger((ledger) => ledger.getQueryArtifact(
        researchRunId,
        queryArtifactId
      ));
      if (!queryArtifact) {
        throw new Error("Query Artifact was not found in this Research Run");
      }
      if (typeof reference === "object" && reference !== null) {
        if (
          queryArtifact.sqlHash !== reference.sqlHash
          || queryArtifact.scannerContractVersion !== reference.scannerContractVersion
        ) {
          throw new Error("Durable Experiment Query Artifact provenance no longer matches the ledger");
        }
      }
      queryArtifacts.push(queryArtifact);
    }
    return queryArtifacts;
  }

  async function executeWithVerifiedSource({ sourceId, sourceFingerprint, ...input }) {
    const verificationInput = {
      dataDir: marketDataDir,
      sourceId,
      expectedFingerprint: sourceFingerprint
    };
    await verifySourceFingerprint(verificationInput);
    const execution = await executeExperimentBatch({
      dataDir: marketDataDir,
      sourceId,
      sourceFingerprint,
      ...input
    });
    await verifySourceFingerprint(verificationInput);
    return execution;
  }

  async function requireExperiment(researchRunId, experimentId) {
    const experiment = await useExperiments((experiments) => experiments.getExperiment(
      researchRunId,
      experimentId
    ));
    if (!experiment) throw new Error("Experiment was not found in this Research Run");
    return experiment;
  }

  async function reconstructDevelopmentExperiment(researchRunId, experimentId) {
    const experiment = await requireExperiment(researchRunId, experimentId);
    if (experiment.phase !== "DEVELOPMENT") {
      throw new Error("Detailed Experiment reconstruction is available only for DEVELOPMENT experiments");
    }
    const queryArtifacts = await loadQueryArtifacts(researchRunId, experiment.request.queryArtifacts);
    const schedule = experiment.request.schedule;
    const execution = await executeWithVerifiedSource({
      objectiveVersionId: experiment.objectiveVersionId,
      evidencePartitionId: experiment.partitionId,
      phase: experiment.phase,
      sourceId: experiment.request.source.sourceId,
      sourceFingerprint: experiment.request.source.sourceFingerprint,
      queryArtifacts,
      fromAtMs: schedule.fromAtMs,
      toAtMs: schedule.toAtMs,
      intervalValue: schedule.intervalValue,
      intervalUnit: schedule.intervalUnit,
      topX: schedule.topX,
      horizonsMs: schedule.horizonsMs
    });
    if (
      !sameJson(execution.durableRequest, experiment.request)
      || !sameJson(execution.metrics, experiment.metrics)
    ) {
      throw new Error("Reconstructed Experiment no longer matches its durable authoritative record");
    }
    return {
      experiment,
      execution,
      diagnostics: createAuthoritativeExperimentDiagnostics({
        experimentId: experiment.experimentId,
        metricSetId: experiment.metricSetId,
        execution
      })
    };
  }

  function trackResearchSqlSession(session) {
    researchSqlSessions.add(session);
    let released = false;
    return Object.freeze({
      ...session,
      async close() {
        if (released) return;
        released = true;
        researchSqlSessions.delete(session);
        await session.close();
      }
    });
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
      const queryArtifacts = await loadQueryArtifacts(request.researchRunId, request.queryArtifactIds);

      const execution = await executeWithVerifiedSource({
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
      assertPublicSafeValue({
        request: execution.durableRequest,
        metrics: execution.metrics
      }, "completed experiment");

      return await useExperiments((experiments) => experiments.recordCompletedExperiment({
        researchRunId: request.researchRunId,
        request: execution.durableRequest,
        metrics: execution.metrics
      }));
    },

    async getExperiment(researchRunId, experimentId) {
      return await useExperiments((experiments) => experiments.getExperiment(researchRunId, experimentId));
    },

    async listExperiments(researchRunId, listOptions) {
      return await useExperiments((experiments) => experiments.listExperiments(researchRunId, listOptions));
    },

    async getExperimentSummary(researchRunId, experimentId) {
      const experiment = await requireExperiment(researchRunId, experimentId);
      return Object.freeze({
        contractVersion: RESEARCH_EXPERIMENT_DIAGNOSTICS_VERSION,
        experimentId: experiment.experimentId,
        metricSetId: experiment.metricSetId,
        researchRunId: experiment.researchRunId,
        objectiveVersionId: experiment.objectiveVersionId,
        partitionId: experiment.partitionId,
        phase: experiment.phase,
        requestFingerprint: experiment.requestFingerprint,
        source: experiment.request.source,
        queryArtifacts: experiment.request.queryArtifacts,
        schedule: experiment.request.schedule,
        denominators: experiment.metrics.denominators,
        exclusions: experiment.metrics.exclusions,
        warnings: Object.freeze(warningCodes(experiment.metrics))
      });
    },

    async getExperimentPoints(researchRunId, experimentId, page) {
      const { diagnostics } = await reconstructDevelopmentExperiment(researchRunId, experimentId);
      return diagnostics.getPoints(page);
    },

    async getExperimentCandidates(researchRunId, experimentId, request) {
      const { diagnostics } = await reconstructDevelopmentExperiment(researchRunId, experimentId);
      return diagnostics.getCandidates(request);
    },

    async diagnoseReturnedCandidate(researchRunId, experimentId, request) {
      const { diagnostics } = await reconstructDevelopmentExperiment(researchRunId, experimentId);
      return diagnostics.diagnoseReturnedCandidate(request);
    },

    async diagnoseMissingCandidate(researchRunId, experimentId, request) {
      const { diagnostics } = await reconstructDevelopmentExperiment(researchRunId, experimentId);
      return diagnostics.diagnoseMissingCandidate(request);
    },

    async openDevelopmentResearchSql(input) {
      assertPublicSafeValue(input, "development research SQL");
      const request = assertDevelopmentResearchSqlInput(input);
      const session = await openDevelopmentResearchSqlSession({
        dataDir: marketDataDir,
        researchRunId: request.researchRunId,
        partitionId: request.partitionId,
        experimentIds: request.experimentIds,
        now: researchSqlNow,
        verifySourceFingerprint,
        getPartition: (researchRunId, partitionId) => useEvidence(
          (evidence) => evidence.getPartition(researchRunId, partitionId)
        ),
        getEvidencePlan: (researchRunId, evidencePlanId) => useEvidence(
          (evidence) => evidence.getEvidencePlan(researchRunId, evidencePlanId)
        ),
        getEvidenceInventory: (researchRunId, evidenceInventoryId) => useEvidence(
          (evidence) => evidence.getEvidenceInventory(researchRunId, evidenceInventoryId)
        ),
        reconstructExperiment: reconstructDevelopmentExperiment
      });
      return trackResearchSqlSession(session);
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
      const sessions = [...researchSqlSessions];
      researchSqlSessions.clear();
      await Promise.all(sessions.map((session) => session.close()));
    }
  });
}
