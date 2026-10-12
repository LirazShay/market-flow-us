import { createHash } from "node:crypto";

import { executeBacktestPoint } from "../backtest-lab/point-execution.js";
import {
  executeBacktestSweep,
  freezeBacktestSweepRequest
} from "../backtest-lab/sweep-execution.js";

const MAX_QUERY_SQL_BYTES = 1024 * 1024;
const EXPERIMENT_BATCH_CONTRACT_VERSION = "research-experiment-batch-v1";
const EXPERIMENT_METRIC_CONTRACT_VERSION = "research-experiment-metrics-v1";
const EXPERIMENT_PHASES = new Set(["DEVELOPMENT", "VALIDATION"]);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const SECURITY_CONCENTRATION_LIMIT = 10;

function invalid(message) {
  throw new TypeError(message);
}

function freezeCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeCopy));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, freezeCopy(item)])
    ));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertArtifactId(value) {
  if (typeof value !== "string" || !/^qry_[0-9a-f-]{36}$/u.test(value)) {
    invalid("queryArtifactId must be a qry_ prefixed UUID");
  }
  return value;
}

function assertResearchRunId(value) {
  if (typeof value !== "string" || !/^run_[0-9a-f-]{36}$/u.test(value)) {
    invalid("researchRunId must be a run_ prefixed UUID");
  }
  return value;
}

function assertObjectiveVersionId(value) {
  if (typeof value !== "string" || !/^obj_[0-9a-f-]{36}$/u.test(value)) {
    invalid("objectiveVersionId must be an obj_ prefixed UUID");
  }
  return value;
}

function assertEvidencePartitionId(value) {
  if (typeof value !== "string" || !/^part_[0-9a-f-]{36}$/u.test(value)) {
    invalid("evidencePartitionId must be a part_ prefixed UUID");
  }
  return value;
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    invalid(`${label} must be a SHA-256 value`);
  }
  return value;
}

function assertBoundedText(value, label, maxChars) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxChars) {
    invalid(`${label} is invalid`);
  }
  return value;
}

function assertExactSqlText(value) {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || Buffer.byteLength(value, "utf8") > MAX_QUERY_SQL_BYTES
  ) {
    invalid(`query artifact SQL must be non-empty UTF-8 text of at most ${MAX_QUERY_SQL_BYTES} bytes`);
  }
  return value;
}

function freezeQueryBindings(queryArtifacts) {
  if (!Array.isArray(queryArtifacts) || queryArtifacts.length < 1 || queryArtifacts.length > 3) {
    invalid("Choose one to three immutable Query Artifacts.");
  }

  const ids = new Set();
  let researchRunId = null;
  const bindings = queryArtifacts.map((artifact) => {
    if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) {
      invalid("Query Artifact is invalid.");
    }

    const queryArtifactId = assertArtifactId(artifact.queryArtifactId);
    if (ids.has(queryArtifactId)) invalid("Query Artifact IDs must be unique.");
    ids.add(queryArtifactId);

    const artifactResearchRunId = assertResearchRunId(artifact.researchRunId);
    if (researchRunId === null) researchRunId = artifactResearchRunId;
    if (artifactResearchRunId !== researchRunId) {
      invalid("All Query Artifacts must belong to the same Research Run.");
    }

    const sqlText = assertExactSqlText(artifact.sqlText);
    const sqlHash = assertSha256(artifact.sqlHash, "query artifact sqlHash");
    if (sha256(sqlText) !== sqlHash) {
      invalid("query artifact sqlHash does not match SQL text");
    }
    const scannerContractVersion = assertBoundedText(
      artifact.scannerContractVersion,
      "scannerContractVersion",
      128
    );
    const label = artifact.label === null || artifact.label === undefined
      ? queryArtifactId
      : assertBoundedText(artifact.label, "query artifact label", 256);

    return {
      queryArtifactId,
      sqlHash,
      scannerContractVersion,
      label,
      sqlText
    };
  });

  return freezeCopy({ researchRunId, bindings });
}

function queryProvenance(bindings) {
  return bindings.map((binding) => ({
    queryArtifactId: binding.queryArtifactId,
    sqlHash: binding.sqlHash,
    scannerContractVersion: binding.scannerContractVersion
  }));
}

function scannerQueries(bindings) {
  return bindings.map((binding) => ({
    id: binding.queryArtifactId,
    name: binding.label,
    sql: binding.sqlText
  }));
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function average(values) {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function incrementBreakdown(breakdown, key) {
  breakdown[key] = (breakdown[key] ?? 0) + 1;
}

function createHorizonAggregates(horizonsMs) {
  return horizonsMs.map((horizonMs) => ({
    horizonMs,
    values: [],
    upCount: 0,
    flatCount: 0,
    downCount: 0,
    unavailableCount: 0,
    unavailableReasons: {}
  }));
}

function addOutcome(aggregate, outcome) {
  if (!aggregate || outcome.horizonMs !== aggregate.horizonMs) {
    invalid("Experiment outcome horizon order does not match the frozen request");
  }
  if (outcome.outcome === "UP") {
    aggregate.upCount += 1;
    aggregate.values.push(outcome.changePercent);
  } else if (outcome.outcome === "FLAT") {
    aggregate.flatCount += 1;
    aggregate.values.push(outcome.changePercent);
  } else if (outcome.outcome === "DOWN") {
    aggregate.downCount += 1;
    aggregate.values.push(outcome.changePercent);
  } else if (outcome.outcome === "UNAVAILABLE") {
    aggregate.unavailableCount += 1;
    incrementBreakdown(aggregate.unavailableReasons, outcome.unavailableReason ?? "UNKNOWN");
  } else {
    invalid("Experiment outcome state is invalid");
  }
}

function summarizeHorizonAggregate(aggregate) {
  const availableOutcomeCount = aggregate.values.length;
  const selectedObservationCount = availableOutcomeCount + aggregate.unavailableCount;
  return {
    horizonMs: aggregate.horizonMs,
    selectedObservationCount,
    availableOutcomeCount,
    unavailableOutcomeCount: aggregate.unavailableCount,
    coverageRate: rate(availableOutcomeCount, selectedObservationCount),
    upCount: aggregate.upCount,
    flatCount: aggregate.flatCount,
    downCount: aggregate.downCount,
    positiveRate: rate(aggregate.upCount, availableOutcomeCount),
    flatRate: rate(aggregate.flatCount, availableOutcomeCount),
    negativeRate: rate(aggregate.downCount, availableOutcomeCount),
    averagePercent: average(aggregate.values),
    medianPercent: median(aggregate.values),
    p10Percent: quantile(aggregate.values, 0.10),
    p25Percent: quantile(aggregate.values, 0.25),
    p75Percent: quantile(aggregate.values, 0.75),
    p90Percent: quantile(aggregate.values, 0.90),
    bestPercent: aggregate.values.length > 0 ? Math.max(...aggregate.values) : null,
    worstPercent: aggregate.values.length > 0 ? Math.min(...aggregate.values) : null,
    unavailableReasonBreakdown: aggregate.unavailableReasons
  };
}

function createSelectionGroup(horizonsMs) {
  return {
    pointCount: 0,
    zeroResultPointCount: 0,
    selectedObservationCount: 0,
    securities: new Set(),
    horizons: createHorizonAggregates(horizonsMs)
  };
}

function addPointToSelectionGroup(group, query) {
  group.pointCount += 1;
  if (query.evaluatedUniqueCount === 0) group.zeroResultPointCount += 1;
  group.selectedObservationCount += query.items.length;
  for (const item of query.items) {
    group.securities.add(item.securityId);
    item.horizons.forEach((outcome, horizonIndex) => addOutcome(group.horizons[horizonIndex], outcome));
  }
}

function summarizeSelectionGroup(group, identity) {
  return {
    ...identity,
    pointCount: group.pointCount,
    zeroResultPointCount: group.zeroResultPointCount,
    zeroResultRate: rate(group.zeroResultPointCount, group.pointCount),
    selectedObservationCount: group.selectedObservationCount,
    distinctSecurityCount: group.securities.size,
    horizons: group.horizons.map(summarizeHorizonAggregate)
  };
}

function timeBucketKeys(requestedAtMs) {
  return {
    utcDayStartAtMs: Math.floor(requestedAtMs / DAY_MS) * DAY_MS,
    utcHourOfDay: Math.floor((requestedAtMs % DAY_MS) / HOUR_MS)
  };
}

function incrementPointAvailabilityGroup(map, key, point) {
  let group = map.get(key);
  if (!group) {
    group = {
      requestedPointCount: 0,
      availablePointCount: 0,
      unavailablePointCount: 0,
      baselines: new Set(),
      unavailableReasons: {}
    };
    map.set(key, group);
  }
  group.requestedPointCount += 1;
  if (point.available) {
    group.availablePointCount += 1;
    group.baselines.add(`${point.baseline.cycleId}:${point.baseline.committedAtMs}`);
  } else {
    group.unavailablePointCount += 1;
    incrementBreakdown(group.unavailableReasons, point.unavailableReason ?? "UNKNOWN");
  }
}

function summarizePointAvailabilityGroup(group, identity) {
  return {
    ...identity,
    requestedPointCount: group.requestedPointCount,
    availablePointCount: group.availablePointCount,
    unavailablePointCount: group.unavailablePointCount,
    pointAvailabilityRate: rate(group.availablePointCount, group.requestedPointCount),
    distinctBaselineCount: group.baselines.size,
    unavailableReasonBreakdown: group.unavailableReasons
  };
}

function buildSecurityConcentration(securityCounts, selectedObservationCount) {
  const ordered = [...securityCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const maxSecurityObservationCount = ordered[0]?.[1] ?? 0;
  return {
    selectedObservationCount,
    distinctSecurityCount: ordered.length,
    repeatedSelectionObservationCount: Math.max(0, selectedObservationCount - ordered.length),
    maxSecurityObservationCount,
    maxSecurityShare: rate(maxSecurityObservationCount, selectedObservationCount),
    topSecurities: ordered.slice(0, SECURITY_CONCENTRATION_LIMIT).map(([securityId, count]) => ({
      securityId,
      count,
      share: rate(count, selectedObservationCount)
    }))
  };
}

export function durableAuthoritativeExperimentRequest(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    invalid("experiment request is invalid");
  }
  return freezeCopy({
    contractVersion: request.contractVersion,
    researchRunId: request.researchRunId,
    objectiveVersionId: request.objectiveVersionId,
    evidencePartitionId: request.evidencePartitionId,
    phase: request.phase,
    source: request.source,
    queryArtifacts: request.queryArtifacts,
    schedule: request.schedule,
    requestFingerprint: request.requestFingerprint
  });
}

export function freezeAuthoritativeExperimentBatchRequest({
  objectiveVersionId,
  evidencePartitionId,
  phase,
  sourceId,
  sourceFingerprint,
  queryArtifacts,
  fromAtMs,
  toAtMs,
  intervalValue,
  intervalUnit,
  topX = 10,
  horizonsMs
} = {}) {
  const frozenQueries = freezeQueryBindings(queryArtifacts);
  const frozenObjectiveVersionId = assertObjectiveVersionId(objectiveVersionId);
  const frozenEvidencePartitionId = assertEvidencePartitionId(evidencePartitionId);
  if (!EXPERIMENT_PHASES.has(phase)) {
    invalid("experiment phase must be DEVELOPMENT or VALIDATION");
  }
  const frozenSourceFingerprint = assertSha256(sourceFingerprint, "sourceFingerprint");

  const backtestRequest = freezeBacktestSweepRequest({
    sourceId,
    fromAtMs,
    toAtMs,
    intervalValue,
    intervalUnit,
    queries: scannerQueries(frozenQueries.bindings),
    topX,
    horizonsMs
  });
  const queryArtifactsProvenance = freezeCopy(queryProvenance(frozenQueries.bindings));
  const schedule = freezeCopy({
    fromAtMs: backtestRequest.fromAtMs,
    toAtMs: backtestRequest.toAtMs,
    intervalValue: backtestRequest.intervalValue,
    intervalUnit: backtestRequest.intervalUnit,
    intervalMs: backtestRequest.intervalMs,
    requestedAtMsList: backtestRequest.requestedAtMsList,
    topX: backtestRequest.topX,
    horizonsMs: backtestRequest.horizonsMs
  });
  const fingerprintPayload = {
    contractVersion: EXPERIMENT_BATCH_CONTRACT_VERSION,
    researchRunId: frozenQueries.researchRunId,
    objectiveVersionId: frozenObjectiveVersionId,
    evidencePartitionId: frozenEvidencePartitionId,
    phase,
    source: {
      sourceId: backtestRequest.sourceId,
      sourceFingerprint: frozenSourceFingerprint
    },
    queryArtifacts: queryArtifactsProvenance,
    schedule
  };

  return freezeCopy({
    ...fingerprintPayload,
    requestFingerprint: sha256(JSON.stringify(fingerprintPayload)),
    backtestRequest
  });
}

export function buildAuthoritativeExperimentMetrics({ request, sweep } = {}) {
  if (!request || !sweep || typeof sweep.openPoint !== "function") {
    invalid("experiment metrics require an executed authoritative Sweep");
  }
  if (
    sweep.request.sourceId !== request.backtestRequest.sourceId
    || JSON.stringify(sweep.request.requestedAtMsList) !== JSON.stringify(request.schedule.requestedAtMsList)
    || JSON.stringify(sweep.request.horizonsMs) !== JSON.stringify(request.schedule.horizonsMs)
    || sweep.request.topX !== request.schedule.topX
  ) {
    invalid("executed Sweep does not match the frozen Experiment request");
  }

  const unavailablePointReasons = {};
  const availablePoints = [];
  const utcDayAvailability = new Map();
  const utcHourAvailability = new Map();
  for (let index = 0; index < sweep.metrics.requestedPointCount; index += 1) {
    const point = sweep.openPoint(index);
    const { utcDayStartAtMs, utcHourOfDay } = timeBucketKeys(point.requestedAtMs);
    incrementPointAvailabilityGroup(utcDayAvailability, utcDayStartAtMs, point);
    incrementPointAvailabilityGroup(utcHourAvailability, utcHourOfDay, point);
    if (point.available) {
      availablePoints.push(point);
    } else {
      incrementBreakdown(unavailablePointReasons, point.unavailableReason ?? "UNKNOWN");
    }
  }

  const queries = request.queryArtifacts.map((queryArtifact, queryIndex) => {
    let sourceRowCount = 0;
    let selectedSourceRowCount = 0;
    let evaluatedUniqueCount = 0;
    let duplicateRowCount = 0;
    let zeroResultPointCount = 0;
    const horizons = createHorizonAggregates(request.schedule.horizonsMs);
    const securityCounts = new Map();
    const positionGroups = new Map();
    const utcDayGroups = new Map();
    const utcHourGroups = new Map();

    for (const point of availablePoints) {
      const query = point.queries[queryIndex];
      if (!query || query.id !== queryArtifact.queryArtifactId) {
        invalid("Experiment point Query order does not match the frozen request");
      }
      sourceRowCount += query.sourceRowCount;
      selectedSourceRowCount += query.selectedSourceRowCount;
      evaluatedUniqueCount += query.evaluatedUniqueCount;
      duplicateRowCount += query.duplicateRowCount;
      if (query.evaluatedUniqueCount === 0) zeroResultPointCount += 1;

      const { utcDayStartAtMs, utcHourOfDay } = timeBucketKeys(point.requestedAtMs);
      if (!utcDayGroups.has(utcDayStartAtMs)) {
        utcDayGroups.set(utcDayStartAtMs, createSelectionGroup(request.schedule.horizonsMs));
      }
      if (!utcHourGroups.has(utcHourOfDay)) {
        utcHourGroups.set(utcHourOfDay, createSelectionGroup(request.schedule.horizonsMs));
      }
      addPointToSelectionGroup(utcDayGroups.get(utcDayStartAtMs), query);
      addPointToSelectionGroup(utcHourGroups.get(utcHourOfDay), query);

      for (const item of query.items) {
        securityCounts.set(item.securityId, (securityCounts.get(item.securityId) ?? 0) + 1);
        let positionGroup = positionGroups.get(item.returnedPosition);
        if (!positionGroup) {
          positionGroup = createSelectionGroup(request.schedule.horizonsMs);
          positionGroups.set(item.returnedPosition, positionGroup);
        }
        positionGroup.selectedObservationCount += 1;
        positionGroup.securities.add(item.securityId);
        item.horizons.forEach((outcome, horizonIndex) => {
          addOutcome(horizons[horizonIndex], outcome);
          addOutcome(positionGroup.horizons[horizonIndex], outcome);
        });
      }
    }

    return {
      queryArtifactId: queryArtifact.queryArtifactId,
      pointDenominator: availablePoints.length,
      zeroResultPointCount,
      zeroResultRate: rate(zeroResultPointCount, availablePoints.length),
      sourceRowCount,
      selectedSourceRowCount,
      evaluatedUniqueCount,
      duplicateRowCount,
      horizons: horizons.map(summarizeHorizonAggregate),
      robustness: {
        positionSemantics: "SCANNER_RETURNED_POSITION_ONLY",
        selectionConcentration: buildSecurityConcentration(securityCounts, evaluatedUniqueCount),
        returnedPositionBreakdown: [...positionGroups.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([returnedPosition, group]) => ({
            returnedPosition,
            selectedObservationCount: group.selectedObservationCount,
            distinctSecurityCount: group.securities.size,
            horizons: group.horizons.map(summarizeHorizonAggregate)
          })),
        utcDayBreakdown: [...utcDayGroups.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([utcDayStartAtMs, group]) => summarizeSelectionGroup(group, { utcDayStartAtMs })),
        utcHourOfDayBreakdown: [...utcHourGroups.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([utcHourOfDay, group]) => summarizeSelectionGroup(group, { utcHourOfDay }))
      }
    };
  });

  const requestedPointCount = sweep.metrics.requestedPointCount;
  const availablePointCount = sweep.metrics.availablePointCount;
  return freezeCopy({
    contractVersion: EXPERIMENT_METRIC_CONTRACT_VERSION,
    requestFingerprint: request.requestFingerprint,
    denominators: {
      requestedPointCount,
      availablePointCount,
      unavailablePointCount: sweep.metrics.unavailablePointCount,
      pointAvailabilityRate: rate(availablePointCount, requestedPointCount),
      distinctBaselineCount: sweep.metrics.distinctBaselineCount,
      repeatedBaselineRequestedPointCount: Math.max(0, availablePointCount - sweep.metrics.distinctBaselineCount),
      queryExecutionCount: sweep.metrics.queryExecutionCount
    },
    exclusions: {
      unavailablePointReasonBreakdown: unavailablePointReasons
    },
    timeBreakdowns: {
      timezone: "UTC",
      days: [...utcDayAvailability.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([utcDayStartAtMs, group]) => summarizePointAvailabilityGroup(group, { utcDayStartAtMs })),
      hoursOfDay: [...utcHourAvailability.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([utcHourOfDay, group]) => summarizePointAvailabilityGroup(group, { utcHourOfDay }))
    },
    queries
  });
}

export async function executeAuthoritativeExperimentPoint({
  dataDir,
  sourceId,
  requestedAtMs,
  queryArtifacts,
  topX = 10,
  horizonsMs,
  now,
  executePoint = executeBacktestPoint
} = {}) {
  if (typeof executePoint !== "function") {
    invalid("executePoint must be a function.");
  }

  const frozen = freezeQueryBindings(queryArtifacts);
  const point = await executePoint({
    dataDir,
    sourceId,
    requestedAtMs,
    queries: scannerQueries(frozen.bindings),
    topX,
    horizonsMs,
    now
  });

  return freezeCopy({
    researchRunId: frozen.researchRunId,
    queryArtifacts: queryProvenance(frozen.bindings),
    point
  });
}

export async function executeAuthoritativeExperimentBatch({
  dataDir,
  objectiveVersionId,
  evidencePartitionId,
  phase,
  sourceId,
  sourceFingerprint,
  queryArtifacts,
  fromAtMs,
  toAtMs,
  intervalValue,
  intervalUnit,
  topX = 10,
  horizonsMs,
  now,
  executeSweep = executeBacktestSweep
} = {}) {
  if (typeof executeSweep !== "function") {
    invalid("executeSweep must be a function.");
  }

  const request = freezeAuthoritativeExperimentBatchRequest({
    objectiveVersionId,
    evidencePartitionId,
    phase,
    sourceId,
    sourceFingerprint,
    queryArtifacts,
    fromAtMs,
    toAtMs,
    intervalValue,
    intervalUnit,
    topX,
    horizonsMs
  });
  const sweep = await executeSweep({
    dataDir,
    sourceId: request.backtestRequest.sourceId,
    fromAtMs: request.backtestRequest.fromAtMs,
    toAtMs: request.backtestRequest.toAtMs,
    intervalValue: request.backtestRequest.intervalValue,
    intervalUnit: request.backtestRequest.intervalUnit,
    queries: request.backtestRequest.queries,
    topX: request.backtestRequest.topX,
    horizonsMs: request.backtestRequest.horizonsMs,
    now
  });
  const metrics = buildAuthoritativeExperimentMetrics({ request, sweep });

  return Object.freeze({
    request,
    durableRequest: durableAuthoritativeExperimentRequest(request),
    metrics,
    sweep
  });
}
