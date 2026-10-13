import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { findManagedAnalysisJobId } from "./analysis-retrieval.js";
import { resolveManagedResearchGrowthLimits } from "./growth-governance.js";
import {
  deterministicManagedAnalysisId,
  deterministicManagedExperimentId
} from "./managed-identities.js";
import { openManagedResearchDomain as openCoreManagedResearchDomain } from "./managed-domain-core.js";

function fallbackExperimentIdFactory(options) {
  if (options.experimentIdFactory !== undefined) {
    if (typeof options.experimentIdFactory !== "function") {
      throw new TypeError("experimentIdFactory must be a function");
    }
    return options.experimentIdFactory;
  }
  return () => `exp_${randomUUID()}`;
}

function analysisView(job, analysisId, result) {
  const handles = Array.isArray(job.progress?.resultHandles) ? job.progress.resultHandles : [];
  if (handles.length > 1) throw new Error("Research Analysis Job has more than one Result Handle");
  const resultHandle = handles[0]?.resultHandle ?? null;
  if (result && result.resultHandle !== resultHandle) {
    throw new Error("Research Analysis Result Handle does not match durable Job progress");
  }
  if (result?.provenance?.analysisId !== undefined && result.provenance.analysisId !== analysisId) {
    throw new Error("Research Analysis Result provenance does not match analysisId");
  }

  const query = Object.freeze({
    sql: job.intent.sql,
    purpose: job.intent.purpose,
    outputMode: job.intent.outputMode,
    partitionId: job.intent.partitionId,
    experimentIds: Object.freeze([...(job.intent.experimentIds ?? [])])
  });
  const provenance = result
    ? Object.freeze({ ...result.provenance })
    : Object.freeze({
        partitionId: job.intent.partitionId,
        experimentIds: Object.freeze([...(job.intent.experimentIds ?? [])]),
        purpose: job.intent.purpose,
        outputMode: job.intent.outputMode
      });

  return Object.freeze({
    researchRunId: job.researchRunId,
    analysisId,
    jobId: job.jobId,
    status: job.status,
    errorCode: job.errorCode,
    query,
    provenance,
    resultHandle
  });
}

export async function openManagedResearchDomain(options = {}) {
  if (options.growthLimits !== undefined) {
    throw new TypeError("growthLimits is server-owned by managed research resource policy");
  }
  if (options.freezeResearchSqlProvenance !== undefined) {
    throw new TypeError("freezeResearchSqlProvenance is server-owned by managed research execution");
  }

  const growthLimits = resolveManagedResearchGrowthLimits(options.resourcePolicy);
  const experimentIdentityContext = new AsyncLocalStorage();
  const fallbackExperimentId = fallbackExperimentIdFactory(options);
  const core = await openCoreManagedResearchDomain({
    ...options,
    growthLimits,
    freezeResearchSqlProvenance: true,
    experimentIdFactory: () => (
      experimentIdentityContext.getStore()?.experimentId ?? fallbackExperimentId()
    )
  });

  return Object.freeze({
    ...core,
    resourceLimits: Object.freeze({
      ...core.resourceLimits,
      growth: growthLimits
    }),

    async submitDevelopmentExperiment(input) {
      const experimentId = deterministicManagedExperimentId(
        input?.researchRunId,
        input?.clientRequestId
      );
      const submitted = await experimentIdentityContext.run(
        Object.freeze({ experimentId }),
        () => core.submitDevelopmentExperiment(input)
      );
      return Object.freeze({ ...submitted, experimentId });
    },

    async submitDevelopmentResearchSql(input) {
      const expectedAnalysisId = deterministicManagedAnalysisId(
        input?.researchRunId,
        input?.clientRequestId
      );
      const submitted = await core.submitDevelopmentResearchSql(input);
      if (submitted.analysisId !== expectedAnalysisId) {
        throw new Error("Managed Research SQL analysisId does not match the stable identity contract");
      }
      return submitted;
    },

    async getAnalysis(researchRunId, analysisId) {
      const jobId = await findManagedAnalysisJobId({
        dbPath: options.dbPath,
        researchRunId,
        analysisId,
        maxAnalysisSubmissionsPerRun: growthLimits.maxAnalysisSubmissionsPerRun
      });
      if (jobId === null) return null;
      const job = await core.getJob(researchRunId, jobId);
      if (!job) throw new Error("Research Analysis Job disappeared after durable lookup");
      const expectedAnalysisId = deterministicManagedAnalysisId(
        researchRunId,
        job.clientRequestId
      );
      if (expectedAnalysisId !== analysisId) {
        throw new Error("Research Analysis durable identity does not match its Job request");
      }
      const handles = Array.isArray(job.progress?.resultHandles) ? job.progress.resultHandles : [];
      const result = handles.length === 1
        ? await core.getResult(researchRunId, handles[0].resultHandle)
        : null;
      return analysisView(job, analysisId, result);
    }
  });
}
