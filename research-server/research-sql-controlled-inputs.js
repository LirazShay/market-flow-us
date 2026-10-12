import { deriveDemoBuyHorizonOutcome } from "../shared/demo-buy/outcome-evidence.js";

// This module materializes only server-supplied authoritative rows. It does not
// derive baselines, future observations, experiment selection or strategy truth.
// Domain composition owns those references; research SQL receives only this
// validated detached projection.
const MAX_CONTROLLED_ROWS = 20_000;
const EXPERIMENT_ID = /^exp_[0-9a-f-]{36}$/u;
const QUERY_ARTIFACT_ID = /^qry_[0-9a-f-]{36}$/u;
const METRIC_SET_ID = /^metrics_[0-9a-f-]{36}$/u;
const SOURCE_ID = /^[A-Za-z0-9._:-]{1,256}$/u;
const AVAILABILITY = new Set(["AVAILABLE", "UNAVAILABLE"]);

export const CONTROLLED_RESEARCH_RELATIONS = Object.freeze([
  "research_decision_points",
  "research_authoritative_outcomes",
  "experiment_points",
  "experiment_candidates",
  "experiment_outcomes",
  "experiment_metrics"
]);

function field(column, type, {
  nullable = false,
  origin = "authority_derived",
  decisionTimeEligible = false,
  futureDependent = false,
  scannerEquivalent = null,
  caveats = []
} = {}) {
  return Object.freeze({
    column,
    type,
    nullable,
    origin,
    known_unit: column.endsWith("_ms") ? "milliseconds" : null,
    scanner_equivalent: scannerEquivalent,
    decision_time_eligible: decisionTimeEligible,
    future_dependent: futureDependent,
    research_only: true,
    phase_availability: Object.freeze(["DEVELOPMENT"]),
    caveats: Object.freeze([...caveats])
  });
}

function relation(relationName, fields) {
  return Object.freeze({ relation: relationName, fields: Object.freeze(fields) });
}

export const CONTROLLED_RESEARCH_SCHEMA_MANIFEST = Object.freeze({
  contract_version: "research-controlled-inputs-v1",
  relations: Object.freeze([
    relation("research_decision_points", [
      field("point_id", "VARCHAR"),
      field("source_id", "VARCHAR"),
      field("requested_t0_ms", "BIGINT"),
      field("baseline_cycle_id", "BIGINT", { nullable: true }),
      field("baseline_committed_at_ms", "BIGINT", { nullable: true }),
      field("baseline_available", "BOOLEAN"),
      field("partition_role", "VARCHAR")
    ]),
    relation("research_authoritative_outcomes", [
      field("point_id", "VARCHAR"),
      field("source_id", "VARCHAR"),
      field("requested_t0_ms", "BIGINT"),
      field("baseline_cycle_id", "BIGINT"),
      field("security_id", "VARCHAR"),
      field("horizon_ms", "BIGINT"),
      field("baseline_price", "DOUBLE", { nullable: true }),
      field("baseline_collected_at_ms", "BIGINT"),
      field("future_cycle_id", "BIGINT", { nullable: true, futureDependent: true }),
      field("future_collected_at_ms", "BIGINT", { nullable: true, futureDependent: true }),
      field("future_price", "DOUBLE", { nullable: true, futureDependent: true }),
      field("change_percent", "DOUBLE", { nullable: true, futureDependent: true }),
      field("outcome", "VARCHAR", { futureDependent: true }),
      field("unavailable_reason", "VARCHAR", { nullable: true, futureDependent: true })
    ]),
    relation("experiment_points", [
      field("experiment_id", "VARCHAR"),
      field("query_artifact_id", "VARCHAR"),
      field("point_ref", "VARCHAR"),
      field("source_id", "VARCHAR"),
      field("requested_t0_ms", "BIGINT"),
      field("baseline_cycle_id", "BIGINT", { nullable: true }),
      field("returned_row_count", "BIGINT"),
      field("evaluated_unique_count", "BIGINT"),
      field("availability", "VARCHAR")
    ]),
    relation("experiment_candidates", [
      field("experiment_id", "VARCHAR"),
      field("query_artifact_id", "VARCHAR"),
      field("point_ref", "VARCHAR"),
      field("security_id", "VARCHAR"),
      field("returned_position", "BIGINT"),
      field("baseline_price", "DOUBLE", { nullable: true }),
      field("baseline_collected_at_ms", "BIGINT")
    ]),
    relation("experiment_outcomes", [
      field("experiment_id", "VARCHAR"),
      field("query_artifact_id", "VARCHAR"),
      field("point_ref", "VARCHAR"),
      field("security_id", "VARCHAR"),
      field("returned_position", "BIGINT"),
      field("horizon_ms", "BIGINT"),
      field("future_cycle_id", "BIGINT", { nullable: true, futureDependent: true }),
      field("future_collected_at_ms", "BIGINT", { nullable: true, futureDependent: true }),
      field("future_price", "DOUBLE", { nullable: true, futureDependent: true }),
      field("change_percent", "DOUBLE", { nullable: true, futureDependent: true }),
      field("outcome", "VARCHAR", { futureDependent: true }),
      field("unavailable_reason", "VARCHAR", { nullable: true, futureDependent: true })
    ]),
    relation("experiment_metrics", [
      field("experiment_id", "VARCHAR"),
      field("metric_set_id", "VARCHAR"),
      field("query_artifact_id", "VARCHAR", { nullable: true }),
      field("metric_name", "VARCHAR"),
      field("horizon_ms", "BIGINT", { nullable: true }),
      field("numerator", "DOUBLE", { nullable: true }),
      field("denominator", "DOUBLE", { nullable: true }),
      field("excluded_count", "BIGINT", { nullable: true }),
      field("value", "DOUBLE", { nullable: true })
    ])
  ])
});

const CREATE_STATEMENTS = Object.freeze([
  `CREATE TABLE research_decision_points (
    point_id VARCHAR PRIMARY KEY,
    source_id VARCHAR NOT NULL,
    requested_t0_ms BIGINT NOT NULL,
    baseline_cycle_id BIGINT NULL,
    baseline_committed_at_ms BIGINT NULL,
    baseline_available BOOLEAN NOT NULL,
    partition_role VARCHAR NOT NULL
  )`,
  `CREATE TABLE research_authoritative_outcomes (
    point_id VARCHAR NOT NULL,
    source_id VARCHAR NOT NULL,
    requested_t0_ms BIGINT NOT NULL,
    baseline_cycle_id BIGINT NOT NULL,
    security_id VARCHAR NOT NULL,
    horizon_ms BIGINT NOT NULL,
    baseline_price DOUBLE NULL,
    baseline_collected_at_ms BIGINT NOT NULL,
    future_cycle_id BIGINT NULL,
    future_collected_at_ms BIGINT NULL,
    future_price DOUBLE NULL,
    change_percent DOUBLE NULL,
    outcome VARCHAR NOT NULL,
    unavailable_reason VARCHAR NULL,
    PRIMARY KEY (point_id, security_id, horizon_ms)
  )`,
  `CREATE TABLE experiment_points (
    experiment_id VARCHAR NOT NULL,
    query_artifact_id VARCHAR NOT NULL,
    point_ref VARCHAR NOT NULL,
    source_id VARCHAR NOT NULL,
    requested_t0_ms BIGINT NOT NULL,
    baseline_cycle_id BIGINT NULL,
    returned_row_count BIGINT NOT NULL,
    evaluated_unique_count BIGINT NOT NULL,
    availability VARCHAR NOT NULL,
    PRIMARY KEY (experiment_id, query_artifact_id, point_ref)
  )`,
  `CREATE TABLE experiment_candidates (
    experiment_id VARCHAR NOT NULL,
    query_artifact_id VARCHAR NOT NULL,
    point_ref VARCHAR NOT NULL,
    security_id VARCHAR NOT NULL,
    returned_position BIGINT NOT NULL,
    baseline_price DOUBLE NULL,
    baseline_collected_at_ms BIGINT NOT NULL,
    PRIMARY KEY (experiment_id, query_artifact_id, point_ref, returned_position)
  )`,
  `CREATE TABLE experiment_outcomes (
    experiment_id VARCHAR NOT NULL,
    query_artifact_id VARCHAR NOT NULL,
    point_ref VARCHAR NOT NULL,
    security_id VARCHAR NOT NULL,
    returned_position BIGINT NOT NULL,
    horizon_ms BIGINT NOT NULL,
    future_cycle_id BIGINT NULL,
    future_collected_at_ms BIGINT NULL,
    future_price DOUBLE NULL,
    change_percent DOUBLE NULL,
    outcome VARCHAR NOT NULL,
    unavailable_reason VARCHAR NULL,
    PRIMARY KEY (experiment_id, query_artifact_id, point_ref, returned_position, horizon_ms)
  )`,
  `CREATE TABLE experiment_metrics (
    experiment_id VARCHAR NOT NULL,
    metric_set_id VARCHAR NOT NULL,
    query_artifact_id VARCHAR NULL,
    metric_name VARCHAR NOT NULL,
    horizon_ms BIGINT NULL,
    numerator DOUBLE NULL,
    denominator DOUBLE NULL,
    excluded_count BIGINT NULL,
    value DOUBLE NULL
  )`
]);

function invalid(message) { throw new TypeError(message); }
function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object`);
  return value;
}
function boundedText(value, label, max = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.includes("\0")) invalid(`${label} is invalid`);
  return value;
}
function id(value, label, pattern = null) {
  boundedText(value, label);
  if (pattern && !pattern.test(value)) invalid(`${label} is invalid`);
  return value;
}
function safeInteger(value, label, { nullable = false, min = 0 } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (!Number.isSafeInteger(value) || value < min) invalid(`${label} must be a safe integer >= ${min}`);
  return value;
}
function finite(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${label} must be finite${nullable ? " or null" : ""}`);
  return value;
}
function rows(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CONTROLLED_ROWS) invalid(`${label} must contain at most ${MAX_CONTROLLED_ROWS} rows`);
  return value;
}
function assertSourceId(value, label) {
  if (typeof value !== "string" || !SOURCE_ID.test(value)) invalid(`${label} is invalid`);
  return value;
}

function authoritativeOutcomeFields(row, label, baselinePrice) {
  const futureCycleId = safeInteger(row.futureCycleId, `${label}.futureCycleId`, { nullable: true, min: 1 });
  const futureCollectedAtMs = safeInteger(row.futureCollectedAtMs, `${label}.futureCollectedAtMs`, { nullable: true });
  const futurePrice = finite(row.futurePrice, `${label}.futurePrice`, { nullable: true });
  if ((futureCycleId === null) !== (futureCollectedAtMs === null)) invalid(`${label} future cycle/time authority is inconsistent`);

  const derived = deriveDemoBuyHorizonOutcome({ baselinePrice, futureCycleId, futurePrice });
  const changePercent = finite(row.changePercent, `${label}.changePercent`, { nullable: true });
  const outcome = boundedText(row.outcome, `${label}.outcome`, 32);
  const unavailableReason = row.unavailableReason === null || row.unavailableReason === undefined
    ? null
    : boundedText(row.unavailableReason, `${label}.unavailableReason`, 128);
  if (outcome !== derived.outcome || unavailableReason !== derived.unavailableReason || changePercent !== derived.changePercent) {
    invalid(`${label} does not match authoritative outcome semantics`);
  }
  return { futureCycleId, futureCollectedAtMs, futurePrice, changePercent, outcome, unavailableReason };
}

function normalizeDecisionPoints(input) {
  return rows(input, "decisionPoints").map((entry, index) => {
    const label = `decisionPoints[${index}]`;
    const row = object(entry, label);
    if (typeof row.baselineAvailable !== "boolean") invalid(`${label}.baselineAvailable must be boolean`);
    const baselineCycleId = safeInteger(row.baselineCycleId, `${label}.baselineCycleId`, { nullable: true, min: 1 });
    const baselineCommittedAtMs = safeInteger(row.baselineCommittedAtMs, `${label}.baselineCommittedAtMs`, { nullable: true });
    if (row.baselineAvailable !== (baselineCycleId !== null && baselineCommittedAtMs !== null)) invalid(`${label} baseline availability is inconsistent`);
    if (row.partitionRole !== "DEVELOPMENT") invalid(`${label}.partitionRole must be DEVELOPMENT`);
    return {
      pointId: id(row.pointId, `${label}.pointId`),
      sourceId: assertSourceId(row.sourceId, `${label}.sourceId`),
      requestedT0Ms: safeInteger(row.requestedT0Ms, `${label}.requestedT0Ms`),
      baselineCycleId,
      baselineCommittedAtMs,
      baselineAvailable: row.baselineAvailable,
      partitionRole: "DEVELOPMENT"
    };
  });
}

function normalizeAuthoritativeOutcomes(input, pointMap) {
  return rows(input, "authoritativeOutcomes").map((entry, index) => {
    const label = `authoritativeOutcomes[${index}]`;
    const row = object(entry, label);
    const pointId = id(row.pointId, `${label}.pointId`);
    const point = pointMap.get(pointId);
    if (!point || !point.baselineAvailable) invalid(`${label} must reference an available controlled decision point`);
    const sourceId = assertSourceId(row.sourceId, `${label}.sourceId`);
    const requestedT0Ms = safeInteger(row.requestedT0Ms, `${label}.requestedT0Ms`);
    const baselineCycleId = safeInteger(row.baselineCycleId, `${label}.baselineCycleId`, { min: 1 });
    if (sourceId !== point.sourceId || requestedT0Ms !== point.requestedT0Ms || baselineCycleId !== point.baselineCycleId) invalid(`${label} does not match its controlled decision point authority`);
    const baselinePrice = finite(row.baselinePrice, `${label}.baselinePrice`, { nullable: true });
    return {
      pointId,
      sourceId,
      requestedT0Ms,
      baselineCycleId,
      securityId: boundedText(row.securityId, `${label}.securityId`),
      horizonMs: safeInteger(row.horizonMs, `${label}.horizonMs`, { min: 1 }),
      baselinePrice,
      baselineCollectedAtMs: safeInteger(row.baselineCollectedAtMs, `${label}.baselineCollectedAtMs`),
      ...authoritativeOutcomeFields(row, label, baselinePrice)
    };
  });
}

function experimentKey(row) { return `${row.experimentId}\u0000${row.queryArtifactId}\u0000${row.pointRef}`; }
function candidateKey(row) { return `${experimentKey(row)}\u0000${row.returnedPosition}`; }

function normalizeExperimentPoints(input) {
  return rows(input, "experimentPoints").map((entry, index) => {
    const label = `experimentPoints[${index}]`;
    const row = object(entry, label);
    const availability = boundedText(row.availability, `${label}.availability`, 32);
    if (!AVAILABILITY.has(availability)) invalid(`${label}.availability is invalid`);
    const baselineCycleId = safeInteger(row.baselineCycleId, `${label}.baselineCycleId`, { nullable: true, min: 1 });
    if ((availability === "AVAILABLE") !== (baselineCycleId !== null)) invalid(`${label} baseline availability is inconsistent`);
    return {
      experimentId: id(row.experimentId, `${label}.experimentId`, EXPERIMENT_ID),
      queryArtifactId: id(row.queryArtifactId, `${label}.queryArtifactId`, QUERY_ARTIFACT_ID),
      pointRef: id(row.pointRef, `${label}.pointRef`),
      sourceId: assertSourceId(row.sourceId, `${label}.sourceId`),
      requestedT0Ms: safeInteger(row.requestedT0Ms, `${label}.requestedT0Ms`),
      baselineCycleId,
      returnedRowCount: safeInteger(row.returnedRowCount, `${label}.returnedRowCount`),
      evaluatedUniqueCount: safeInteger(row.evaluatedUniqueCount, `${label}.evaluatedUniqueCount`),
      availability
    };
  });
}

function normalizeExperimentCandidates(input, pointMap) {
  return rows(input, "experimentCandidates").map((entry, index) => {
    const label = `experimentCandidates[${index}]`;
    const row = object(entry, label);
    const normalized = {
      experimentId: id(row.experimentId, `${label}.experimentId`, EXPERIMENT_ID),
      queryArtifactId: id(row.queryArtifactId, `${label}.queryArtifactId`, QUERY_ARTIFACT_ID),
      pointRef: id(row.pointRef, `${label}.pointRef`),
      securityId: boundedText(row.securityId, `${label}.securityId`),
      returnedPosition: safeInteger(row.returnedPosition, `${label}.returnedPosition`, { min: 1 }),
      baselinePrice: finite(row.baselinePrice, `${label}.baselinePrice`, { nullable: true }),
      baselineCollectedAtMs: safeInteger(row.baselineCollectedAtMs, `${label}.baselineCollectedAtMs`)
    };
    const point = pointMap.get(experimentKey(normalized));
    if (!point || point.availability !== "AVAILABLE") invalid(`${label} must reference an available experiment point`);
    return normalized;
  });
}

function normalizeExperimentOutcomes(input, candidateMap) {
  return rows(input, "experimentOutcomes").map((entry, index) => {
    const label = `experimentOutcomes[${index}]`;
    const row = object(entry, label);
    const identity = {
      experimentId: id(row.experimentId, `${label}.experimentId`, EXPERIMENT_ID),
      queryArtifactId: id(row.queryArtifactId, `${label}.queryArtifactId`, QUERY_ARTIFACT_ID),
      pointRef: id(row.pointRef, `${label}.pointRef`),
      securityId: boundedText(row.securityId, `${label}.securityId`),
      returnedPosition: safeInteger(row.returnedPosition, `${label}.returnedPosition`, { min: 1 })
    };
    const candidate = candidateMap.get(candidateKey(identity));
    if (!candidate || candidate.securityId !== identity.securityId) invalid(`${label} must reference an exact experiment candidate`);
    return {
      ...identity,
      horizonMs: safeInteger(row.horizonMs, `${label}.horizonMs`, { min: 1 }),
      ...authoritativeOutcomeFields(row, label, candidate.baselinePrice)
    };
  });
}

function normalizeMetrics(input, experimentIds) {
  return rows(input, "experimentMetrics").map((entry, index) => {
    const label = `experimentMetrics[${index}]`;
    const row = object(entry, label);
    const experimentId = id(row.experimentId, `${label}.experimentId`, EXPERIMENT_ID);
    if (!experimentIds.has(experimentId)) invalid(`${label} must reference a materialized experiment`);
    return {
      experimentId,
      metricSetId: id(row.metricSetId, `${label}.metricSetId`, METRIC_SET_ID),
      queryArtifactId: row.queryArtifactId === null || row.queryArtifactId === undefined ? null : id(row.queryArtifactId, `${label}.queryArtifactId`, QUERY_ARTIFACT_ID),
      metricName: boundedText(row.metricName, `${label}.metricName`, 128),
      horizonMs: safeInteger(row.horizonMs, `${label}.horizonMs`, { nullable: true, min: 1 }),
      numerator: finite(row.numerator, `${label}.numerator`, { nullable: true }),
      denominator: finite(row.denominator, `${label}.denominator`, { nullable: true }),
      excludedCount: safeInteger(row.excludedCount, `${label}.excludedCount`, { nullable: true }),
      value: finite(row.value, `${label}.value`, { nullable: true })
    };
  });
}

function unique(rowsToCheck, keyFn, label) {
  const seen = new Set();
  for (const row of rowsToCheck) {
    const key = keyFn(row);
    if (seen.has(key)) invalid(`${label} contains duplicate identity`);
    seen.add(key);
  }
}

async function insertRows(connection, statement, rowsToInsert) {
  for (const row of rowsToInsert) await connection.run(statement, row);
}

export async function materializeControlledResearchInputs({ connection, inputs = {} } = {}) {
  if (!connection || typeof connection.run !== "function") invalid("connection is required");
  object(inputs, "inputs");
  if (inputs.partitionRole !== undefined && inputs.partitionRole !== "DEVELOPMENT") invalid("controlled research inputs are currently DEVELOPMENT only");

  const decisionPoints = normalizeDecisionPoints(inputs.decisionPoints);
  unique(decisionPoints, (row) => row.pointId, "decisionPoints");
  const decisionPointMap = new Map(decisionPoints.map((row) => [row.pointId, row]));
  const authoritativeOutcomes = normalizeAuthoritativeOutcomes(inputs.authoritativeOutcomes, decisionPointMap);
  unique(authoritativeOutcomes, (row) => `${row.pointId}\u0000${row.securityId}\u0000${row.horizonMs}`, "authoritativeOutcomes");

  const experimentPoints = normalizeExperimentPoints(inputs.experimentPoints);
  unique(experimentPoints, experimentKey, "experimentPoints");
  const experimentPointMap = new Map(experimentPoints.map((row) => [experimentKey(row), row]));
  const experimentCandidates = normalizeExperimentCandidates(inputs.experimentCandidates, experimentPointMap);
  unique(experimentCandidates, candidateKey, "experimentCandidates");
  const experimentCandidateMap = new Map(experimentCandidates.map((row) => [candidateKey(row), row]));
  const experimentOutcomes = normalizeExperimentOutcomes(inputs.experimentOutcomes, experimentCandidateMap);
  unique(experimentOutcomes, (row) => `${candidateKey(row)}\u0000${row.horizonMs}`, "experimentOutcomes");
  const experimentIds = new Set(experimentPoints.map((row) => row.experimentId));
  const experimentMetrics = normalizeMetrics(inputs.experimentMetrics, experimentIds);
  unique(experimentMetrics, (row) => [row.experimentId, row.metricSetId, row.queryArtifactId ?? "", row.metricName, row.horizonMs ?? ""].join("\u0000"), "experimentMetrics");

  await connection.run("BEGIN TRANSACTION");
  try {
    for (const statement of CREATE_STATEMENTS) await connection.run(statement);
    await insertRows(connection, `INSERT INTO research_decision_points VALUES ($pointId,$sourceId,$requestedT0Ms,$baselineCycleId,$baselineCommittedAtMs,$baselineAvailable,$partitionRole)`, decisionPoints);
    await insertRows(connection, `INSERT INTO research_authoritative_outcomes VALUES ($pointId,$sourceId,$requestedT0Ms,$baselineCycleId,$securityId,$horizonMs,$baselinePrice,$baselineCollectedAtMs,$futureCycleId,$futureCollectedAtMs,$futurePrice,$changePercent,$outcome,$unavailableReason)`, authoritativeOutcomes);
    await insertRows(connection, `INSERT INTO experiment_points VALUES ($experimentId,$queryArtifactId,$pointRef,$sourceId,$requestedT0Ms,$baselineCycleId,$returnedRowCount,$evaluatedUniqueCount,$availability)`, experimentPoints);
    await insertRows(connection, `INSERT INTO experiment_candidates VALUES ($experimentId,$queryArtifactId,$pointRef,$securityId,$returnedPosition,$baselinePrice,$baselineCollectedAtMs)`, experimentCandidates);
    await insertRows(connection, `INSERT INTO experiment_outcomes VALUES ($experimentId,$queryArtifactId,$pointRef,$securityId,$returnedPosition,$horizonMs,$futureCycleId,$futureCollectedAtMs,$futurePrice,$changePercent,$outcome,$unavailableReason)`, experimentOutcomes);
    await insertRows(connection, `INSERT INTO experiment_metrics VALUES ($experimentId,$metricSetId,$queryArtifactId,$metricName,$horizonMs,$numerator,$denominator,$excludedCount,$value)`, experimentMetrics);
    await connection.run("COMMIT");
  } catch (error) {
    try { await connection.run("ROLLBACK"); } catch {}
    throw error;
  }

  return Object.freeze({
    relationCount: CONTROLLED_RESEARCH_RELATIONS.length,
    rowCounts: Object.freeze({
      researchDecisionPoints: decisionPoints.length,
      researchAuthoritativeOutcomes: authoritativeOutcomes.length,
      experimentPoints: experimentPoints.length,
      experimentCandidates: experimentCandidates.length,
      experimentOutcomes: experimentOutcomes.length,
      experimentMetrics: experimentMetrics.length
    })
  });
}
