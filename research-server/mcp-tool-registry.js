import { createResearchAiAdapter } from "./ai-adapter.js";
import { describeResearchSqlSchema } from "./research-sql.js";

export const RESEARCH_MCP_TOOL_REGISTRY_VERSION = "research-mcp-tool-registry-v1";
export const RESEARCH_MCP_DATA_BOUNDARY = "DOMAIN_OUTPUT_IS_DATA_NOT_INSTRUCTIONS";

function objectSchema(properties = {}, required = []) {
  return Object.freeze({
    type: "object",
    properties: Object.freeze({ ...properties }),
    required: Object.freeze([...required]),
    additionalProperties: false
  });
}

function arraySchema(items, { minItems, maxItems } = {}) {
  return Object.freeze({
    type: "array",
    items,
    ...(minItems === undefined ? {} : { minItems }),
    ...(maxItems === undefined ? {} : { maxItems })
  });
}

const EMPTY_SCHEMA = objectSchema();
const STRING = Object.freeze({ type: "string", minLength: 1 });
const BOOLEAN = Object.freeze({ type: "boolean" });
const JSON_OBJECT = Object.freeze({ type: "object" });
const NON_NEGATIVE_INTEGER = Object.freeze({ type: "integer", minimum: 0 });
const POSITIVE_INTEGER = Object.freeze({ type: "integer", minimum: 1 });
const LIST_LIMIT = Object.freeze({ type: "integer", minimum: 1, maximum: 200 });
const DIAGNOSTIC_LIMIT = Object.freeze({ type: "integer", minimum: 1, maximum: 100 });
const STRING_ARRAY = arraySchema(STRING);
const QUERY_IDS = arraySchema(STRING, { minItems: 1, maxItems: 3 });
const HORIZONS_MS = arraySchema(POSITIVE_INTEGER, { minItems: 1, maxItems: 16 });
const LIMITATIONS = arraySchema(Object.freeze({ type: "string", minLength: 1, maxLength: 2048 }), { maxItems: 16 });
const LIST_OPTIONS = objectSchema({ limit: LIST_LIMIT });
const RESUME_OPTIONS = objectSchema({ noteLimit: Object.freeze({ type: "integer", minimum: 1, maximum: 50 }) });
const DIAGNOSTIC_PAGE = objectSchema({ offset: NON_NEGATIVE_INTEGER, limit: DIAGNOSTIC_LIMIT });
const RESULT_PAGE = objectSchema({
  cursor: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
  pageSize: Object.freeze({ type: "integer", minimum: 1, maximum: 100 })
});
const CANDIDATE_PAGE_REQUEST = objectSchema({
  pointRef: STRING,
  queryArtifactId: STRING,
  offset: NON_NEGATIVE_INTEGER,
  limit: DIAGNOSTIC_LIMIT
}, ["pointRef", "queryArtifactId"]);
const RETURNED_CANDIDATE_REQUEST = objectSchema({ candidateRef: STRING }, ["candidateRef"]);
const MISSING_CANDIDATE_REQUEST = objectSchema({
  pointRef: STRING,
  queryArtifactId: STRING,
  securityId: STRING
}, ["pointRef", "queryArtifactId", "securityId"]);
const RELATED_REF = objectSchema({
  type: Object.freeze({
    type: "string",
    enum: ["OBJECTIVE_VERSION", "EVIDENCE_INVENTORY", "EVIDENCE_PLAN", "PARTITION", "QUERY_ARTIFACT"]
  }),
  id: STRING
}, ["type", "id"]);
const RELATED_REFS = arraySchema(RELATED_REF, { maxItems: 16 });

const CREATE_RUN_SCHEMA = objectSchema({
  userIntent: Object.freeze({ type: "string", minLength: 1, maxLength: 8192 }),
  environmentSnapshot: JSON_OBJECT
}, ["userIntent"]);
const CREATE_OBJECTIVE_SCHEMA = objectSchema({
  researchRunId: STRING,
  interpretationText: Object.freeze({ type: "string", minLength: 1, maxLength: 8192 }),
  objective: JSON_OBJECT
}, ["researchRunId", "interpretationText", "objective"]);
const CREATE_QUERY_SCHEMA = objectSchema({
  researchRunId: STRING,
  sqlText: Object.freeze({ type: "string", minLength: 1 }),
  scannerContractVersion: Object.freeze({ type: "string", minLength: 1, maxLength: 128 }),
  parentQueryArtifactId: STRING,
  label: Object.freeze({ type: "string", minLength: 1, maxLength: 256 }),
  hypothesisText: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 })
}, ["researchRunId", "sqlText", "scannerContractVersion"]);
const CREATE_INVENTORY_SCHEMA = objectSchema({
  researchRunId: STRING,
  inventory: JSON_OBJECT
}, ["researchRunId", "inventory"]);
const EVIDENCE_PLAN_PROPOSAL_SCHEMA = objectSchema({
  researchRunId: STRING,
  objectiveVersionId: STRING,
  evidenceInventoryId: STRING,
  evaluationProfile: JSON_OBJECT,
  timingToleranceMs: NON_NEGATIVE_INTEGER
}, ["researchRunId", "objectiveVersionId", "evidenceInventoryId", "evaluationProfile"]);
const COMMIT_EVIDENCE_PLAN_SCHEMA = objectSchema({
  researchRunId: STRING,
  objectiveVersionId: STRING,
  evidenceInventoryId: STRING,
  proposal: JSON_OBJECT
}, ["researchRunId", "objectiveVersionId", "evidenceInventoryId", "proposal"]);
const DEVELOPMENT_EXPERIMENT_SCHEMA = objectSchema({
  clientRequestId: STRING,
  researchRunId: STRING,
  objectiveVersionId: STRING,
  partitionId: STRING,
  sourceId: STRING,
  queryArtifactIds: QUERY_IDS,
  fromAtMs: NON_NEGATIVE_INTEGER,
  toAtMs: NON_NEGATIVE_INTEGER,
  intervalValue: POSITIVE_INTEGER,
  intervalUnit: Object.freeze({ type: "string", enum: ["seconds", "minutes"] }),
  topX: POSITIVE_INTEGER,
  horizonsMs: HORIZONS_MS
}, [
  "clientRequestId", "researchRunId", "objectiveVersionId", "partitionId", "sourceId",
  "queryArtifactIds", "fromAtMs", "toAtMs", "intervalValue", "intervalUnit", "topX", "horizonsMs"
]);
const VALIDATION_EXPERIMENT_SCHEMA = objectSchema({
  researchRunId: STRING,
  objectiveVersionId: STRING,
  partitionId: STRING,
  sourceId: STRING,
  queryArtifactIds: QUERY_IDS,
  fromAtMs: NON_NEGATIVE_INTEGER,
  toAtMs: NON_NEGATIVE_INTEGER,
  intervalValue: POSITIVE_INTEGER,
  intervalUnit: Object.freeze({ type: "string", enum: ["seconds", "minutes"] }),
  topX: POSITIVE_INTEGER,
  horizonsMs: HORIZONS_MS
}, [
  "researchRunId", "objectiveVersionId", "partitionId", "sourceId", "queryArtifactIds",
  "fromAtMs", "toAtMs", "intervalValue", "intervalUnit", "topX", "horizonsMs"
]);
const DEVELOPMENT_SQL_SCHEMA = objectSchema({
  clientRequestId: STRING,
  researchRunId: STRING,
  partitionId: STRING,
  experimentIds: STRING_ARRAY,
  sql: Object.freeze({ type: "string", minLength: 1 }),
  purpose: Object.freeze({
    type: "string",
    enum: ["PROFILE", "DEBUG", "HYPOTHESIS", "AGGREGATE", "OTHER_BOUNDED"]
  }),
  outputMode: Object.freeze({ type: "string", enum: ["PREVIEW", "PAGED_RESULT", "AGGREGATE"] })
}, ["clientRequestId", "researchRunId", "partitionId", "sql", "purpose", "outputMode"]);
const FINALIST_SET_SCHEMA = objectSchema({
  researchRunId: STRING,
  objectiveVersionId: STRING,
  queryArtifactIds: QUERY_IDS,
  evaluationProfile: JSON_OBJECT,
  justification: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 })
}, ["researchRunId", "objectiveVersionId", "queryArtifactIds", "evaluationProfile", "justification"]);
const HOLDOUT_SCHEMA = objectSchema({
  researchRunId: STRING,
  finalistSetId: STRING
}, ["researchRunId", "finalistSetId"]);
const RECOMMENDATION_SCHEMA = objectSchema({
  researchRunId: STRING,
  finalistSetId: STRING,
  holdoutEvaluationId: STRING,
  outcome: Object.freeze({ type: "string", enum: ["SELECTED_QUERY", "NO_RECOMMENDATION"] }),
  queryArtifactId: STRING,
  stoppingReason: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 }),
  interpretation: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 }),
  limitations: LIMITATIONS
}, ["researchRunId", "finalistSetId", "holdoutEvaluationId", "outcome", "stoppingReason"]);
const INSUFFICIENT_RECOMMENDATION_SCHEMA = objectSchema({
  researchRunId: STRING,
  objectiveVersionId: STRING,
  evidenceInventoryId: STRING,
  evaluationProfile: JSON_OBJECT,
  timingToleranceMs: NON_NEGATIVE_INTEGER,
  outcome: Object.freeze({ type: "string", enum: ["NO_RECOMMENDATION"] }),
  stoppingReason: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 }),
  interpretation: Object.freeze({ type: "string", minLength: 1, maxLength: 4096 }),
  limitations: LIMITATIONS
}, ["researchRunId", "objectiveVersionId", "evidenceInventoryId", "evaluationProfile", "outcome", "stoppingReason"]);
const RESEARCH_NOTE_SCHEMA = objectSchema({
  researchRunId: STRING,
  kind: Object.freeze({ type: "string", enum: ["HYPOTHESIS", "DECISION", "ANOMALY", "NEXT_ACTION", "LIMITATION"] }),
  text: Object.freeze({ type: "string", minLength: 1, maxLength: 2048 }),
  decision: Object.freeze({ type: "string", enum: ["KEEP", "REJECT", "INVESTIGATE", "FINALIST"] }),
  relatedRefs: RELATED_REFS
}, ["researchRunId", "kind", "text"]);

function tool(name, description, inputSchema, invoke) {
  return Object.freeze({ name, description, inputSchema, invoke });
}

function callDomain(domain, method, args) {
  const operation = domain?.[method];
  if (typeof operation !== "function") {
    const error = new Error(`Research MCP tool requires domain.${method}`);
    error.code = "RESEARCH_MCP_CAPABILITY_UNAVAILABLE";
    throw error;
  }
  return operation.apply(domain, args);
}

function splitOptions(input) {
  return input.options === undefined ? undefined : input.options;
}

function envelope(toolName, data) {
  return Object.freeze({
    toolRegistryVersion: RESEARCH_MCP_TOOL_REGISTRY_VERSION,
    toolName,
    dataBoundary: RESEARCH_MCP_DATA_BOUNDARY,
    data
  });
}

const TOOL_DEFINITIONS = Object.freeze([
  tool("describe_research_environment", "Return compact product, version, authority, bootstrap, and security metadata for a fresh research conversation.", EMPTY_SCHEMA,
    ({ adapter }) => adapter.describeResearchEnvironment()),
  tool("describe_research_schema", "Return the existing machine-readable Research SQL relation/field manifest on demand, including decision-time and future-dependence semantics.", objectSchema({ includeControlledInputs: BOOLEAN }),
    ({ schemaProvider }, input) => schemaProvider({ includeControlledInputs: input.includeControlledInputs ?? false })),
  tool("bootstrap_research", "Deterministically discover or resume Research Runs without guessing among multiple resumable runs.", objectSchema({ researchRunId: STRING, continueExisting: BOOLEAN }),
    ({ adapter }, input) => adapter.bootstrapResearch(input)),

  tool("create_research_run", "Create a durable Research Run from the user's objective. The managed domain owns budget policy and phase.", CREATE_RUN_SCHEMA,
    ({ domain }, input) => callDomain(domain, "createResearchRun", [input])),
  tool("get_research_run", "Get compact durable state, accounting, and status for one Research Run.", objectSchema({ researchRunId: STRING }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "getResearchRun", [input.researchRunId])),
  tool("resume_research_run", "Return the bounded durable Resume Capsule for one Research Run.", objectSchema({ researchRunId: STRING, options: RESUME_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "resumeResearchRun", [input.researchRunId, splitOptions(input)])),

  tool("create_objective_version", "Create an immutable operational Objective Version for a Research Run.", CREATE_OBJECTIVE_SCHEMA,
    ({ domain }, input) => callDomain(domain, "createObjectiveVersion", [input])),
  tool("get_current_objective_version", "Get the current Objective Version for one Research Run.", objectSchema({ researchRunId: STRING }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "getCurrentObjectiveVersion", [input.researchRunId])),
  tool("list_objective_versions", "List bounded Objective Version history on demand.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listObjectiveVersions", [input.researchRunId, splitOptions(input)])),

  tool("create_query_artifact", "Create an immutable Scanner SQL Query Artifact. Strategy authority remains server-owned.", CREATE_QUERY_SCHEMA,
    ({ domain }, input) => callDomain(domain, "createQueryArtifact", [input])),
  tool("get_query_artifact", "Get exact immutable Scanner SQL and provenance for one Query Artifact.", objectSchema({ researchRunId: STRING, queryArtifactId: STRING }, ["researchRunId", "queryArtifactId"]),
    ({ domain }, input) => callDomain(domain, "getQueryArtifact", [input.researchRunId, input.queryArtifactId])),
  tool("list_query_artifacts", "List bounded Query Artifact metadata for prior candidate work.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listQueryArtifacts", [input.researchRunId, splitOptions(input)])),

  tool("create_evidence_inventory", "Record the immutable logical evidence inventory for a Research Run; inventory internals remain validated by Research Domain authority.", CREATE_INVENTORY_SCHEMA,
    ({ domain }, input) => callDomain(domain, "createEvidenceInventory", [input])),
  tool("get_evidence_inventory", "Get one immutable Evidence Inventory by logical ID.", objectSchema({ researchRunId: STRING, evidenceInventoryId: STRING }, ["researchRunId", "evidenceInventoryId"]),
    ({ domain }, input) => callDomain(domain, "getEvidenceInventory", [input.researchRunId, input.evidenceInventoryId])),
  tool("propose_evidence_plan", "Ask server authority to propose deterministic Development, Validation, and Holdout evidence partitions.", EVIDENCE_PLAN_PROPOSAL_SCHEMA,
    ({ domain }, input) => callDomain(domain, "proposeEvidencePlan", [input])),
  tool("commit_evidence_plan", "Commit a server-proposed immutable evidence plan; do not fabricate partition authority in chat.", COMMIT_EVIDENCE_PLAN_SCHEMA,
    ({ domain }, input) => callDomain(domain, "commitEvidencePlan", [input])),
  tool("get_current_evidence_plan", "Get the current committed Evidence Plan for one Research Run.", objectSchema({ researchRunId: STRING }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "getCurrentEvidencePlan", [input.researchRunId])),
  tool("list_evidence_plans", "List bounded prior Evidence Plan versions when lineage matters.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listEvidencePlans", [input.researchRunId, splitOptions(input)])),
  tool("get_partition", "Get one server-owned evidence partition by ID.", objectSchema({ researchRunId: STRING, partitionId: STRING }, ["researchRunId", "partitionId"]),
    ({ domain }, input) => callDomain(domain, "getPartition", [input.researchRunId, input.partitionId])),
  tool("list_partitions", "List the partitions belonging to one Evidence Plan.", objectSchema({ researchRunId: STRING, evidencePlanId: STRING }, ["researchRunId", "evidencePlanId"]),
    ({ domain }, input) => callDomain(domain, "listPartitions", [input.researchRunId, input.evidencePlanId])),

  tool("submit_development_experiment", "Submit authoritative Development Scanner evaluation as a durable managed job with budgets and cancellation.", DEVELOPMENT_EXPERIMENT_SCHEMA,
    ({ domain }, input) => callDomain(domain, "submitDevelopmentExperiment", [input])),
  tool("execute_validation_experiment", "Execute the exact server-authorized Validation experiment and record exposure under Validation authority.", VALIDATION_EXPERIMENT_SCHEMA,
    ({ domain }, input) => callDomain(domain, "executeValidationExperiment", [input])),
  tool("list_experiments", "List bounded durable experiment records for comparison and prior-work recovery.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listExperiments", [input.researchRunId, splitOptions(input)])),
  tool("get_experiment_summary", "Get compact authoritative metrics, denominators, exclusions, warnings, and provenance for one experiment.", objectSchema({ researchRunId: STRING, experimentId: STRING }, ["researchRunId", "experimentId"]),
    ({ domain }, input) => callDomain(domain, "getExperimentSummary", [input.researchRunId, input.experimentId])),
  tool("get_experiment_points", "Page bounded point-level diagnostics for one Development experiment.", objectSchema({ researchRunId: STRING, experimentId: STRING, page: DIAGNOSTIC_PAGE }, ["researchRunId", "experimentId"]),
    ({ domain }, input) => callDomain(domain, "getExperimentPoints", [input.researchRunId, input.experimentId, input.page])),
  tool("get_experiment_candidates", "Retrieve bounded candidate diagnostics for one experiment point/request.", objectSchema({ researchRunId: STRING, experimentId: STRING, request: CANDIDATE_PAGE_REQUEST }, ["researchRunId", "experimentId", "request"]),
    ({ domain }, input) => callDomain(domain, "getExperimentCandidates", [input.researchRunId, input.experimentId, input.request])),
  tool("diagnose_returned_candidate", "Diagnose why an authoritative Scanner result returned a candidate without changing strategy authority.", objectSchema({ researchRunId: STRING, experimentId: STRING, request: RETURNED_CANDIDATE_REQUEST }, ["researchRunId", "experimentId", "request"]),
    ({ domain }, input) => callDomain(domain, "diagnoseReturnedCandidate", [input.researchRunId, input.experimentId, input.request])),
  tool("diagnose_missing_candidate", "Diagnose why a candidate was not returned without rewriting the Scanner query as authority.", objectSchema({ researchRunId: STRING, experimentId: STRING, request: MISSING_CANDIDATE_REQUEST }, ["researchRunId", "experimentId", "request"]),
    ({ domain }, input) => callDomain(domain, "diagnoseMissingCandidate", [input.researchRunId, input.experimentId, input.request])),

  tool("submit_development_research_sql", "Submit bounded Development-only analytical SQL as a durable managed job. Research SQL is never strategy authority.", DEVELOPMENT_SQL_SCHEMA,
    ({ domain }, input) => callDomain(domain, "submitDevelopmentResearchSql", [input])),
  tool("get_analysis", "Get durable Research SQL analysis status, provenance, job, and result handle.", objectSchema({ researchRunId: STRING, analysisId: STRING }, ["researchRunId", "analysisId"]),
    ({ domain }, input) => callDomain(domain, "getAnalysis", [input.researchRunId, input.analysisId])),
  tool("get_job", "Get one durable job with progress, budget, result references, and cancellation state.", objectSchema({ researchRunId: STRING, jobId: STRING }, ["researchRunId", "jobId"]),
    ({ domain }, input) => callDomain(domain, "getJob", [input.researchRunId, input.jobId])),
  tool("list_jobs", "List bounded jobs for a Research Run.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listJobs", [input.researchRunId, splitOptions(input)])),
  tool("cancel_job", "Request idempotent cancellation of queued/running managed work.", objectSchema({ researchRunId: STRING, jobId: STRING }, ["researchRunId", "jobId"]),
    ({ domain }, input) => callDomain(domain, "cancelJob", [input.researchRunId, input.jobId])),
  tool("get_result_page", "Page a durable bounded result by server-owned Result Handle without rerunning work.", objectSchema({ researchRunId: STRING, resultHandle: STRING, page: RESULT_PAGE }, ["researchRunId", "resultHandle"]),
    ({ domain }, input) => callDomain(domain, "getResultPage", [input.researchRunId, input.resultHandle, input.page])),

  tool("get_validation_exposure_count", "Get the durable Validation exposure count for a Research Run.", objectSchema({ researchRunId: STRING }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "getValidationExposureCount", [input.researchRunId])),
  tool("list_validation_exposures", "List bounded Validation exposure records.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listValidationExposures", [input.researchRunId, splitOptions(input)])),
  tool("create_finalist_set", "Freeze an immutable Validation-supported Finalist Set under server authority.", FINALIST_SET_SCHEMA,
    ({ domain }, input) => callDomain(domain, "createFinalistSet", [input])),
  tool("get_finalist_set", "Get one immutable Finalist Set.", objectSchema({ researchRunId: STRING, finalistSetId: STRING }, ["researchRunId", "finalistSetId"]),
    ({ domain }, input) => callDomain(domain, "getFinalistSet", [input.researchRunId, input.finalistSetId])),
  tool("list_finalist_sets", "List bounded Finalist Sets for one Research Run.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listFinalistSets", [input.researchRunId, splitOptions(input)])),
  tool("execute_holdout_evaluation", "Perform the one-shot server-owned Sealed Holdout evaluation for an immutable Finalist Set.", HOLDOUT_SCHEMA,
    ({ domain }, input) => callDomain(domain, "executeHoldoutEvaluation", [input])),
  tool("get_holdout_evaluation", "Get an authorized Holdout evaluation only after server-controlled exposure permits it.", objectSchema({ researchRunId: STRING, holdoutEvaluationId: STRING }, ["researchRunId", "holdoutEvaluationId"]),
    ({ domain }, input) => callDomain(domain, "getHoldoutEvaluation", [input.researchRunId, input.holdoutEvaluationId])),

  tool("build_recommendation_artifact", "Build the deterministic selected-query final recommendation artifact from valid server-owned evidence.", RECOMMENDATION_SCHEMA,
    ({ domain }, input) => callDomain(domain, "buildRecommendationArtifact", [input])),
  tool("build_insufficient_evidence_recommendation_artifact", "Finalize with explicit NO_RECOMMENDATION when independent evidence is insufficient.", INSUFFICIENT_RECOMMENDATION_SCHEMA,
    ({ domain }, input) => callDomain(domain, "buildInsufficientEvidenceRecommendationArtifact", [input])),
  tool("get_recommendation_artifact", "Get the terminal recommendation or NO_RECOMMENDATION artifact for one Research Run.", objectSchema({ researchRunId: STRING }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "getRecommendationArtifact", [input.researchRunId])),

  tool("record_research_note", "Persist a concise hypothesis/decision/reason/next-action note; never store private chain-of-thought.", RESEARCH_NOTE_SCHEMA,
    ({ domain }, input) => callDomain(domain, "recordResearchNote", [input])),
  tool("list_research_notes", "List bounded durable research notes on demand.", objectSchema({ researchRunId: STRING, options: LIST_OPTIONS }, ["researchRunId"]),
    ({ domain }, input) => callDomain(domain, "listResearchNotes", [input.researchRunId, splitOptions(input)]))
]);

const TOOL_BY_NAME = new Map(TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));
if (TOOL_BY_NAME.size !== TOOL_DEFINITIONS.length) throw new Error("Research MCP tool names must be unique");

export function createResearchMcpToolRegistry({
  domain,
  aiAdapter = null,
  schemaProvider = describeResearchSqlSchema
} = {}) {
  if (domain === null || typeof domain !== "object") throw new TypeError("domain is required");
  const adapter = aiAdapter ?? createResearchAiAdapter({ domain });
  if (adapter === null || typeof adapter !== "object") throw new TypeError("aiAdapter must be an object");
  if (typeof schemaProvider !== "function") throw new TypeError("schemaProvider must be a function");

  return Object.freeze({
    version: RESEARCH_MCP_TOOL_REGISTRY_VERSION,
    listTools() {
      return TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => Object.freeze({ name, description, inputSchema }));
    },
    async callTool(name, input = {}) {
      if (typeof name !== "string" || name.length === 0) throw new TypeError("tool name is required");
      if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("tool input must be an object");
      const definition = TOOL_BY_NAME.get(name);
      if (!definition) {
        const error = new Error(`Unknown Research MCP tool: ${name}`);
        error.code = "RESEARCH_MCP_TOOL_NOT_FOUND";
        throw error;
      }
      const data = await definition.invoke({ domain, adapter, schemaProvider }, input);
      return envelope(name, data);
    }
  });
}
