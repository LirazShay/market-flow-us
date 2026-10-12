import { createHash } from "node:crypto";

export const RESEARCH_EXPERIMENT_DIAGNOSTICS_VERSION = "research-experiment-diagnostics-v1";
export const RESEARCH_EXPERIMENT_DIAGNOSTICS_PAGE_LIMIT = 100;

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

function assertExperimentId(value) {
  if (typeof value !== "string" || !/^exp_[0-9a-f-]{36}$/u.test(value)) {
    invalid("experimentId must be an exp_ prefixed UUID");
  }
  return value;
}

function assertMetricSetId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^metrics_[0-9a-f-]{36}$/u.test(value)) {
    invalid("metricSetId must be a metrics_ prefixed UUID");
  }
  return value;
}

function assertQueryArtifactId(value) {
  if (typeof value !== "string" || !/^qry_[0-9a-f-]{36}$/u.test(value)) {
    invalid("queryArtifactId must be a qry_ prefixed UUID");
  }
  return value;
}

function assertSecurityId(value) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 256
    || value.trim() !== value
    || value.includes("\0")
  ) {
    invalid("securityId is invalid");
  }
  return value;
}

function assertPage({ offset = 0, limit = 50 } = {}) {
  if (
    !Number.isSafeInteger(offset)
    || offset < 0
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > RESEARCH_EXPERIMENT_DIAGNOSTICS_PAGE_LIMIT
  ) {
    invalid(`diagnostic page must use offset >= 0 and limit 1-${RESEARCH_EXPERIMENT_DIAGNOSTICS_PAGE_LIMIT}`);
  }
  return { offset, limit };
}

function assertExecution(execution) {
  if (
    execution === null
    || typeof execution !== "object"
    || execution.request === null
    || typeof execution.request !== "object"
    || execution.durableRequest === null
    || typeof execution.durableRequest !== "object"
    || execution.metrics === null
    || typeof execution.metrics !== "object"
    || execution.sweep === null
    || typeof execution.sweep !== "object"
    || typeof execution.sweep.page !== "function"
    || typeof execution.sweep.openPoint !== "function"
  ) {
    invalid("diagnostics require one completed authoritative Experiment execution");
  }
  if (
    execution.request.requestFingerprint !== execution.durableRequest.requestFingerprint
    || execution.metrics.requestFingerprint !== execution.request.requestFingerprint
    || execution.sweep.metrics?.requestedPointCount !== execution.request.schedule?.requestedAtMsList?.length
  ) {
    invalid("Experiment execution provenance is inconsistent");
  }
  return execution;
}

function pointRef(experimentId, requestFingerprint, index) {
  const digest = sha256(`${experimentId}\u0000${requestFingerprint}\u0000${index}`).slice(0, 16);
  return `pt_${index}_${digest}`;
}

function parsePointRef(value, experimentId, requestFingerprint, pointCount) {
  if (typeof value !== "string") invalid("pointRef is invalid");
  const match = /^pt_([0-9]+)_([0-9a-f]{16})$/u.exec(value);
  if (!match) invalid("pointRef is invalid");
  const index = Number(match[1]);
  if (!Number.isSafeInteger(index) || index < 0 || index >= pointCount) {
    invalid("pointRef is out of range");
  }
  if (pointRef(experimentId, requestFingerprint, index) !== value) {
    invalid("pointRef does not belong to this Experiment");
  }
  return index;
}

function candidateRef(experimentId, requestFingerprint, pointIndex, queryIndex, itemIndex, item) {
  const digest = sha256([
    experimentId,
    requestFingerprint,
    pointIndex,
    queryIndex,
    itemIndex,
    item.securityId,
    item.returnedPosition
  ].join("\u0000")).slice(0, 16);
  return `cand_${pointIndex}_${queryIndex}_${itemIndex}_${digest}`;
}

function parseCandidateRef(value) {
  if (typeof value !== "string") invalid("candidateRef is invalid");
  const match = /^cand_([0-9]+)_([0-9]+)_([0-9]+)_([0-9a-f]{16})$/u.exec(value);
  if (!match) invalid("candidateRef is invalid");
  const coordinates = match.slice(1, 4).map(Number);
  if (coordinates.some((entry) => !Number.isSafeInteger(entry) || entry < 0)) {
    invalid("candidateRef is invalid");
  }
  return {
    pointIndex: coordinates[0],
    queryIndex: coordinates[1],
    itemIndex: coordinates[2]
  };
}

function compactQuery(query) {
  return {
    queryArtifactId: query.id,
    sourceRowCount: query.sourceRowCount,
    selectedSourceRowCount: query.selectedSourceRowCount,
    evaluatedUniqueCount: query.evaluatedUniqueCount,
    duplicateRowCount: query.duplicateRowCount,
    summary: query.summary
  };
}

function compactPoint(experimentId, requestFingerprint, index, point) {
  if (!point.available) {
    return {
      pointRef: pointRef(experimentId, requestFingerprint, index),
      pointIndex: index,
      requestedAtMs: point.requestedAtMs,
      available: false,
      unavailableReason: point.unavailableReason,
      baseline: null,
      queries: []
    };
  }
  return {
    pointRef: pointRef(experimentId, requestFingerprint, index),
    pointIndex: index,
    requestedAtMs: point.requestedAtMs,
    available: true,
    unavailableReason: null,
    baseline: point.baseline,
    queries: point.queries.map(compactQuery)
  };
}

function warningCodes(metrics) {
  const warnings = [];
  if (metrics.denominators?.unavailablePointCount > 0) warnings.push("UNAVAILABLE_POINTS");
  if (metrics.denominators?.repeatedBaselineRequestedPointCount > 0) warnings.push("REPEATED_BASELINES");
  if (metrics.queries?.some((query) => query.zeroResultPointCount > 0)) warnings.push("ZERO_RESULT_POINTS");
  return warnings;
}

function assertDevelopment(execution) {
  if (execution.request.phase !== "DEVELOPMENT") {
    invalid("Candidate-level experiment diagnostics are available only for DEVELOPMENT experiments");
  }
}

function assertRequestedQuery(execution, queryArtifactId) {
  const queryIndex = execution.request.queryArtifacts.findIndex(
    (query) => query.queryArtifactId === queryArtifactId
  );
  if (queryIndex < 0) {
    invalid("queryArtifactId is not part of this Experiment");
  }
  return queryIndex;
}

function queryAt(point, queryArtifactId) {
  const queryIndex = point.queries.findIndex((query) => query.id === queryArtifactId);
  if (queryIndex < 0) invalid("queryArtifactId is not part of this Experiment point");
  return { query: point.queries[queryIndex], queryIndex };
}

function candidateEvidence({ experimentId, requestFingerprint, pointIndex, queryIndex, itemIndex, item }) {
  return {
    candidateRef: candidateRef(
      experimentId,
      requestFingerprint,
      pointIndex,
      queryIndex,
      itemIndex,
      item
    ),
    securityId: item.securityId,
    returnedPosition: item.returnedPosition,
    baseline: item.baseline,
    horizons: item.horizons
  };
}

function exactEvidenceRefs({ execution, experimentId, pointIndex, queryArtifactId, candidate = null }) {
  return {
    experimentId,
    requestFingerprint: execution.request.requestFingerprint,
    sourceId: execution.request.source.sourceId,
    sourceFingerprint: execution.request.source.sourceFingerprint,
    pointRef: pointRef(experimentId, execution.request.requestFingerprint, pointIndex),
    queryArtifactId,
    candidateRef: candidate?.candidateRef ?? null
  };
}

export function createAuthoritativeExperimentDiagnostics({
  experimentId,
  metricSetId = null,
  execution
} = {}) {
  const boundedExperimentId = assertExperimentId(experimentId);
  const boundedMetricSetId = assertMetricSetId(metricSetId);
  const completed = assertExecution(execution);
  const requestFingerprint = completed.request.requestFingerprint;
  const pointCount = completed.sweep.metrics.requestedPointCount;

  function openPointByRef(ref) {
    const index = parsePointRef(ref, boundedExperimentId, requestFingerprint, pointCount);
    return { index, point: completed.sweep.openPoint(index) };
  }

  return Object.freeze({
    contractVersion: RESEARCH_EXPERIMENT_DIAGNOSTICS_VERSION,

    getSummary() {
      return freezeCopy({
        contractVersion: RESEARCH_EXPERIMENT_DIAGNOSTICS_VERSION,
        experimentId: boundedExperimentId,
        metricSetId: boundedMetricSetId,
        researchRunId: completed.request.researchRunId,
        objectiveVersionId: completed.request.objectiveVersionId,
        partitionId: completed.request.evidencePartitionId,
        phase: completed.request.phase,
        requestFingerprint,
        source: completed.request.source,
        queryArtifacts: completed.request.queryArtifacts,
        schedule: completed.request.schedule,
        denominators: completed.metrics.denominators,
        exclusions: completed.metrics.exclusions,
        warnings: warningCodes(completed.metrics)
      });
    },

    getPoints(page = {}) {
      const { offset, limit } = assertPage(page);
      const end = Math.min(pointCount, offset + limit);
      const items = [];
      for (let index = offset; index < end; index += 1) {
        items.push(compactPoint(
          boundedExperimentId,
          requestFingerprint,
          index,
          completed.sweep.openPoint(index)
        ));
      }
      return freezeCopy({
        offset,
        limit,
        totalCount: pointCount,
        items
      });
    },

    getCandidates({ pointRef: ref, queryArtifactId, offset = 0, limit = 50 } = {}) {
      assertDevelopment(completed);
      const boundedQueryArtifactId = assertQueryArtifactId(queryArtifactId);
      assertRequestedQuery(completed, boundedQueryArtifactId);
      const page = assertPage({ offset, limit });
      const { index, point } = openPointByRef(ref);
      if (!point.available) {
        return freezeCopy({
          pointRef: ref,
          queryArtifactId: boundedQueryArtifactId,
          offset: page.offset,
          limit: page.limit,
          totalCount: 0,
          items: [],
          unavailableReason: point.unavailableReason
        });
      }
      const { query, queryIndex } = queryAt(point, boundedQueryArtifactId);
      const slice = query.items.slice(page.offset, page.offset + page.limit);
      return freezeCopy({
        pointRef: ref,
        queryArtifactId: boundedQueryArtifactId,
        offset: page.offset,
        limit: page.limit,
        totalCount: query.items.length,
        items: slice.map((item, sliceIndex) => candidateEvidence({
          experimentId: boundedExperimentId,
          requestFingerprint,
          pointIndex: index,
          queryIndex,
          itemIndex: page.offset + sliceIndex,
          item
        })),
        unavailableReason: null
      });
    },

    diagnoseReturnedCandidate({ candidateRef: ref } = {}) {
      assertDevelopment(completed);
      const coordinates = parseCandidateRef(ref);
      if (coordinates.pointIndex >= pointCount) invalid("candidateRef is out of range");
      const point = completed.sweep.openPoint(coordinates.pointIndex);
      if (!point.available || coordinates.queryIndex >= point.queries.length) {
        invalid("candidateRef is out of range");
      }
      const query = point.queries[coordinates.queryIndex];
      const item = query.items[coordinates.itemIndex];
      if (!item) invalid("candidateRef is out of range");
      const expectedRef = candidateRef(
        boundedExperimentId,
        requestFingerprint,
        coordinates.pointIndex,
        coordinates.queryIndex,
        coordinates.itemIndex,
        item
      );
      if (expectedRef !== ref) invalid("candidateRef does not belong to this Experiment");
      const candidate = candidateEvidence({
        experimentId: boundedExperimentId,
        requestFingerprint,
        pointIndex: coordinates.pointIndex,
        queryIndex: coordinates.queryIndex,
        itemIndex: coordinates.itemIndex,
        item
      });
      return freezeCopy({
        diagnosis: "RETURNED_BY_ORIGINAL_SCANNER_QUERY",
        semanticRankClaim: false,
        positionSemantics: "SCANNER_RETURNED_POSITION_ONLY",
        requestedAtMs: point.requestedAtMs,
        baseline: point.baseline,
        queryBoundary: {
          sourceRowCount: query.sourceRowCount,
          selectedSourceRowCount: query.selectedSourceRowCount,
          evaluatedUniqueCount: query.evaluatedUniqueCount,
          duplicateRowCount: query.duplicateRowCount,
          topX: point.topX
        },
        candidate,
        exactEvidenceRefs: exactEvidenceRefs({
          execution: completed,
          experimentId: boundedExperimentId,
          pointIndex: coordinates.pointIndex,
          queryArtifactId: query.id,
          candidate
        })
      });
    },

    diagnoseMissingCandidate({ pointRef: ref, queryArtifactId, securityId } = {}) {
      assertDevelopment(completed);
      const boundedQueryArtifactId = assertQueryArtifactId(queryArtifactId);
      assertRequestedQuery(completed, boundedQueryArtifactId);
      const boundedSecurityId = assertSecurityId(securityId);
      const { index, point } = openPointByRef(ref);
      if (!point.available) {
        return freezeCopy({
          diagnosis: "POINT_UNAVAILABLE",
          securityId: boundedSecurityId,
          queryArtifactId: boundedQueryArtifactId,
          requestedAtMs: point.requestedAtMs,
          unavailableReason: point.unavailableReason,
          baselineMembership: "UNKNOWN_POINT_UNAVAILABLE",
          semanticRankClaim: false,
          exactEvidenceRefs: exactEvidenceRefs({
            execution: completed,
            experimentId: boundedExperimentId,
            pointIndex: index,
            queryArtifactId: boundedQueryArtifactId
          })
        });
      }

      const { query, queryIndex } = queryAt(point, boundedQueryArtifactId);
      const itemIndex = query.items.findIndex((item) => item.securityId === boundedSecurityId);
      if (itemIndex >= 0) {
        const item = query.items[itemIndex];
        const candidate = candidateEvidence({
          experimentId: boundedExperimentId,
          requestFingerprint,
          pointIndex: index,
          queryIndex,
          itemIndex,
          item
        });
        return freezeCopy({
          diagnosis: "RETURNED_BY_ORIGINAL_SCANNER_QUERY",
          securityId: boundedSecurityId,
          queryArtifactId: boundedQueryArtifactId,
          requestedAtMs: point.requestedAtMs,
          baselineMembership: "NOT_INSPECTED",
          semanticRankClaim: false,
          candidate,
          exactEvidenceRefs: exactEvidenceRefs({
            execution: completed,
            experimentId: boundedExperimentId,
            pointIndex: index,
            queryArtifactId: boundedQueryArtifactId,
            candidate
          })
        });
      }

      const completeOriginalResultObserved = query.sourceRowCount === query.selectedSourceRowCount;
      const lastEvaluatedReturnedPosition = query.items.length > 0
        ? query.items.at(-1).returnedPosition
        : null;
      return freezeCopy({
        diagnosis: completeOriginalResultObserved
          ? "NOT_RETURNED_BY_ORIGINAL_SCANNER_QUERY"
          : "NOT_SELECTED_BELOW_TOP_X_OR_FILTERED_UNKNOWN",
        securityId: boundedSecurityId,
        queryArtifactId: boundedQueryArtifactId,
        requestedAtMs: point.requestedAtMs,
        baseline: point.baseline,
        baselineMembership: "NOT_INSPECTED",
        semanticRankClaim: false,
        originalQueryRewritten: false,
        queryBoundary: {
          sourceRowCount: query.sourceRowCount,
          selectedSourceRowCount: query.selectedSourceRowCount,
          evaluatedUniqueCount: query.evaluatedUniqueCount,
          duplicateRowCount: query.duplicateRowCount,
          topX: point.topX,
          completeOriginalResultObserved,
          lastEvaluatedReturnedPosition
        },
        exactEvidenceRefs: exactEvidenceRefs({
          execution: completed,
          experimentId: boundedExperimentId,
          pointIndex: index,
          queryArtifactId: boundedQueryArtifactId
        })
      });
    }
  });
}
