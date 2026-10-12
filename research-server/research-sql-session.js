import { createResearchRawDataDiscovery } from "./raw-data-discovery.js";
import {
  createResearchSqlExecute,
  verifyResearchSqlSandboxHardening
} from "./research-sql-admission.js";
import { openDevelopmentResearchSqlSandbox } from "./research-sql.js";

const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const PARTITION_ID = /^part_[0-9a-f-]{36}$/u;
const EXPERIMENT_ID = /^exp_[0-9a-f-]{36}$/u;
const MAX_EXPERIMENT_REFERENCES = 20;
const DIAGNOSTIC_PAGE_LIMIT = 100;

function invalid(message) {
  throw new TypeError(message);
}

function assertId(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) invalid(`${label} is invalid`);
  return value;
}

function normalizeExperimentIds(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_EXPERIMENT_REFERENCES) {
    invalid(`experimentIds must contain at most ${MAX_EXPERIMENT_REFERENCES} explicit Experiment IDs`);
  }
  const seen = new Set();
  const ids = value.map((entry, index) => {
    const id = assertId(entry, `experimentIds[${index}]`, EXPERIMENT_ID);
    if (seen.has(id)) invalid("experimentIds must be unique");
    seen.add(id);
    return id;
  });
  return Object.freeze(ids);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushUniqueOutcome(target, seen, row) {
  const key = `${row.pointId}\u0000${row.securityId}\u0000${row.horizonMs}`;
  const existing = seen.get(key);
  if (existing && !sameJson(existing, row)) {
    throw new Error("Explicit Experiment references disagree on one authoritative point/security/horizon outcome");
  }
  if (!existing) {
    seen.set(key, row);
    target.push(row);
  }
}

function pushMetric(target, {
  experimentId,
  metricSetId,
  queryArtifactId = null,
  metricName,
  horizonMs = null,
  numerator = null,
  denominator = null,
  excludedCount = null,
  value = null
}) {
  target.push({
    experimentId,
    metricSetId,
    queryArtifactId,
    metricName,
    horizonMs,
    numerator,
    denominator,
    excludedCount,
    value
  });
}

function appendExperimentMetrics(target, experiment) {
  const metrics = experiment.metrics;
  const denominators = metrics.denominators;
  pushMetric(target, {
    experimentId: experiment.experimentId,
    metricSetId: experiment.metricSetId,
    metricName: "point_availability_rate",
    numerator: denominators.availablePointCount,
    denominator: denominators.requestedPointCount,
    excludedCount: denominators.unavailablePointCount,
    value: denominators.pointAvailabilityRate
  });

  for (const query of metrics.queries ?? []) {
    pushMetric(target, {
      experimentId: experiment.experimentId,
      metricSetId: experiment.metricSetId,
      queryArtifactId: query.queryArtifactId,
      metricName: "zero_result_rate",
      numerator: query.zeroResultPointCount,
      denominator: query.pointDenominator,
      excludedCount: 0,
      value: query.zeroResultRate
    });

    for (const horizon of query.horizons ?? []) {
      const common = {
        experimentId: experiment.experimentId,
        metricSetId: experiment.metricSetId,
        queryArtifactId: query.queryArtifactId,
        horizonMs: horizon.horizonMs
      };
      pushMetric(target, {
        ...common,
        metricName: "coverage_rate",
        numerator: horizon.availableOutcomeCount,
        denominator: horizon.selectedObservationCount,
        excludedCount: horizon.unavailableOutcomeCount,
        value: horizon.coverageRate
      });
      pushMetric(target, {
        ...common,
        metricName: "positive_rate",
        numerator: horizon.upCount,
        denominator: horizon.availableOutcomeCount,
        excludedCount: horizon.unavailableOutcomeCount,
        value: horizon.positiveRate
      });
      pushMetric(target, {
        ...common,
        metricName: "flat_rate",
        numerator: horizon.flatCount,
        denominator: horizon.availableOutcomeCount,
        excludedCount: horizon.unavailableOutcomeCount,
        value: horizon.flatRate
      });
      pushMetric(target, {
        ...common,
        metricName: "negative_rate",
        numerator: horizon.downCount,
        denominator: horizon.availableOutcomeCount,
        excludedCount: horizon.unavailableOutcomeCount,
        value: horizon.negativeRate
      });
      for (const [metricName, value] of [
        ["average_percent", horizon.averagePercent],
        ["median_percent", horizon.medianPercent],
        ["p10_percent", horizon.p10Percent],
        ["p25_percent", horizon.p25Percent],
        ["p75_percent", horizon.p75Percent],
        ["p90_percent", horizon.p90Percent],
        ["best_percent", horizon.bestPercent],
        ["worst_percent", horizon.worstPercent]
      ]) {
        pushMetric(target, {
          ...common,
          metricName,
          denominator: horizon.availableOutcomeCount,
          excludedCount: horizon.unavailableOutcomeCount,
          value
        });
      }
    }
  }
}

function appendExperimentControlledInputs(target, reconstructed) {
  const { experiment, execution, diagnostics } = reconstructed;
  if (experiment.phase !== "DEVELOPMENT" || execution.request.phase !== "DEVELOPMENT") {
    throw new Error("Research SQL Experiment references must be DEVELOPMENT authority");
  }
  if (experiment.metricSetId === null || experiment.metricSetId === undefined) {
    throw new Error("Completed Experiment is missing its authoritative metric set identity");
  }

  const authoritativeSeen = target.authoritativeSeen;
  const pointCount = execution.sweep.metrics.requestedPointCount;
  for (let offset = 0; offset < pointCount; offset += DIAGNOSTIC_PAGE_LIMIT) {
    const page = diagnostics.getPoints({
      offset,
      limit: Math.min(DIAGNOSTIC_PAGE_LIMIT, pointCount - offset)
    });
    for (const compact of page.items) {
      const point = execution.sweep.openPoint(compact.pointIndex);
      const pointId = `${experiment.experimentId}:${compact.pointRef}`;
      target.decisionPoints.push({
        pointId,
        sourceId: execution.request.source.sourceId,
        requestedT0Ms: point.requestedAtMs,
        baselineCycleId: point.available ? point.baseline.cycleId : null,
        baselineCommittedAtMs: point.available ? point.baseline.committedAtMs : null,
        baselineAvailable: point.available,
        partitionRole: "DEVELOPMENT"
      });

      for (let queryIndex = 0; queryIndex < execution.request.queryArtifacts.length; queryIndex += 1) {
        const queryArtifact = execution.request.queryArtifacts[queryIndex];
        const query = point.available ? point.queries[queryIndex] : null;
        if (query && query.id !== queryArtifact.queryArtifactId) {
          throw new Error("Reconstructed Experiment Query order no longer matches durable provenance");
        }
        target.experimentPoints.push({
          experimentId: experiment.experimentId,
          queryArtifactId: queryArtifact.queryArtifactId,
          pointRef: compact.pointRef,
          sourceId: execution.request.source.sourceId,
          requestedT0Ms: point.requestedAtMs,
          baselineCycleId: point.available ? point.baseline.cycleId : null,
          returnedRowCount: query?.sourceRowCount ?? 0,
          evaluatedUniqueCount: query?.evaluatedUniqueCount ?? 0,
          availability: point.available ? "AVAILABLE" : "UNAVAILABLE"
        });

        if (!query) continue;
        for (const item of query.items) {
          target.experimentCandidates.push({
            experimentId: experiment.experimentId,
            queryArtifactId: queryArtifact.queryArtifactId,
            pointRef: compact.pointRef,
            securityId: item.securityId,
            returnedPosition: item.returnedPosition,
            baselinePrice: item.baseline.price,
            baselineCollectedAtMs: item.baseline.collectedAtMs
          });
          for (const horizon of item.horizons) {
            const outcome = {
              experimentId: experiment.experimentId,
              queryArtifactId: queryArtifact.queryArtifactId,
              pointRef: compact.pointRef,
              securityId: item.securityId,
              returnedPosition: item.returnedPosition,
              horizonMs: horizon.horizonMs,
              futureCycleId: horizon.futureCycleId,
              futureCollectedAtMs: horizon.observedAtMs,
              futurePrice: horizon.price,
              changePercent: horizon.changePercent,
              outcome: horizon.outcome,
              unavailableReason: horizon.unavailableReason
            };
            target.experimentOutcomes.push(outcome);
            pushUniqueOutcome(target.authoritativeOutcomes, authoritativeSeen, {
              pointId,
              sourceId: execution.request.source.sourceId,
              requestedT0Ms: point.requestedAtMs,
              baselineCycleId: point.baseline.cycleId,
              securityId: item.securityId,
              horizonMs: horizon.horizonMs,
              baselinePrice: item.baseline.price,
              baselineCollectedAtMs: item.baseline.collectedAtMs,
              futureCycleId: horizon.futureCycleId,
              futureCollectedAtMs: horizon.observedAtMs,
              futurePrice: horizon.price,
              changePercent: horizon.changePercent,
              outcome: horizon.outcome,
              unavailableReason: horizon.unavailableReason
            });
          }
        }
      }
    }
  }

  appendExperimentMetrics(target.experimentMetrics, experiment);
}

export function buildControlledResearchInputsFromExperiments(reconstructedExperiments = []) {
  if (!Array.isArray(reconstructedExperiments)) invalid("reconstructedExperiments must be an array");
  const target = {
    partitionRole: "DEVELOPMENT",
    decisionPoints: [],
    authoritativeOutcomes: [],
    experimentPoints: [],
    experimentCandidates: [],
    experimentOutcomes: [],
    experimentMetrics: [],
    authoritativeSeen: new Map()
  };
  for (const reconstructed of reconstructedExperiments) {
    if (!reconstructed || typeof reconstructed !== "object") invalid("reconstructed Experiment reference is invalid");
    appendExperimentControlledInputs(target, reconstructed);
  }
  return Object.freeze({
    partitionRole: target.partitionRole,
    decisionPoints: Object.freeze(target.decisionPoints),
    authoritativeOutcomes: Object.freeze(target.authoritativeOutcomes),
    experimentPoints: Object.freeze(target.experimentPoints),
    experimentCandidates: Object.freeze(target.experimentCandidates),
    experimentOutcomes: Object.freeze(target.experimentOutcomes),
    experimentMetrics: Object.freeze(target.experimentMetrics)
  });
}

export async function openDevelopmentResearchSqlSession({
  dataDir,
  researchRunId,
  partitionId,
  experimentIds = [],
  now = () => Date.now(),
  verifySourceFingerprint,
  getPartition,
  getEvidencePlan,
  getEvidenceInventory,
  reconstructExperiment,
  openSandbox = openDevelopmentResearchSqlSandbox
} = {}) {
  const boundedRunId = assertId(researchRunId, "researchRunId", RUN_ID);
  const boundedPartitionId = assertId(partitionId, "partitionId", PARTITION_ID);
  const boundedExperimentIds = normalizeExperimentIds(experimentIds);
  for (const [callback, label] of [
    [getPartition, "getPartition"],
    [getEvidencePlan, "getEvidencePlan"],
    [getEvidenceInventory, "getEvidenceInventory"],
    [reconstructExperiment, "reconstructExperiment"],
    [openSandbox, "openSandbox"]
  ]) {
    if (typeof callback !== "function") invalid(`${label} must be a function`);
  }

  const partition = await getPartition(boundedRunId, boundedPartitionId);
  if (!partition) throw new Error("Partition was not found in this Research Run");
  if (partition.role !== "DEVELOPMENT") {
    throw new Error("General research SQL is currently authorized only for DEVELOPMENT partitions");
  }
  const plan = await getEvidencePlan(boundedRunId, partition.evidencePlanId);
  if (!plan) throw new Error("Development partition Evidence Plan was not found");
  const inventory = await getEvidenceInventory(boundedRunId, plan.evidenceInventoryId);
  if (!inventory) throw new Error("Development partition Evidence Inventory was not found");

  const reconstructed = [];
  for (const experimentId of boundedExperimentIds) {
    const item = await reconstructExperiment(boundedRunId, experimentId);
    if (!item?.experiment || item.experiment.partitionId !== boundedPartitionId) {
      throw new Error("Explicit Experiment reference does not belong to the selected Development partition");
    }
    reconstructed.push(item);
  }
  const controlledInputs = buildControlledResearchInputsFromExperiments(reconstructed);
  const sandbox = await openSandbox({
    dataDir,
    partition,
    inventory,
    controlledInputs,
    now,
    verifySourceFingerprint
  });

  let executeResearchSql;
  try {
    await verifyResearchSqlSandboxHardening({ execute: sandbox.execute });
    executeResearchSql = createResearchSqlExecute({ execute: sandbox.execute });
  } catch (error) {
    await sandbox.close();
    throw error;
  }

  const activeExecutions = new Set();
  let closed = false;
  async function execute(sql) {
    if (closed) throw new Error("Research SQL session is closed");
    const execution = executeResearchSql(sql);
    activeExecutions.add(execution);
    try {
      return await execution;
    } finally {
      activeExecutions.delete(execution);
    }
  }

  const rawData = createResearchRawDataDiscovery({ execute });

  return Object.freeze({
    dataSurfaceVersion: sandbox.dataSurfaceVersion,
    phase: sandbox.phase,
    researchRunId: boundedRunId,
    partitionId: boundedPartitionId,
    experimentIds: boundedExperimentIds,
    describeSchema: sandbox.describeSchema,
    execute,
    listRawDataKeys: rawData.listRawDataKeys,
    profileRawDataKey: rawData.profileRawDataKey,
    async close() {
      if (closed) return;
      closed = true;
      if (activeExecutions.size > 0 && typeof sandbox.interrupt === "function") {
        sandbox.interrupt();
        await Promise.allSettled([...activeExecutions]);
      }
      await sandbox.close();
    }
  });
}
