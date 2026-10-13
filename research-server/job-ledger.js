import {
  RESEARCH_JOB_SCHEMA_VERSION,
  openResearchJobLedger as openCoreResearchJobLedger
} from "./job-ledger-core.js";
import {
  RESEARCH_ANALYSIS_OPERATION,
  RESEARCH_EXPERIMENT_OPERATION,
  assertResearchGrowthCapacity,
  normalizeResearchGrowthLimits,
  readResearchSubmissionGrowthState
} from "./growth-governance.js";

export { RESEARCH_JOB_SCHEMA_VERSION };

function requestKey(operation, clientRequestId) {
  return `${operation}\u0000${clientRequestId}`;
}

function mergeDurableCounts(target, durable) {
  target.jobs = Math.max(target.jobs, durable.jobs);
  target.experimentSubmissions = Math.max(
    target.experimentSubmissions,
    durable.experimentSubmissions
  );
  target.analysisSubmissions = Math.max(
    target.analysisSubmissions,
    durable.analysisSubmissions
  );
}

export async function openResearchJobLedger(options = {}) {
  const growthLimits = normalizeResearchGrowthLimits(options.growthLimits);
  const core = await openCoreResearchJobLedger(options);
  const runGrowth = new Map();
  let closed = false;
  let createTail = Promise.resolve();

  async function serializeCreate(operation) {
    const previous = createTail;
    let release;
    createTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (closed) throw new Error("Research Job Ledger is closed");
      return await operation();
    } finally {
      release();
    }
  }

  async function createGrowthGovernedJob(input) {
    const durable = await readResearchSubmissionGrowthState({
      dbPath: options.dbPath,
      researchRunId: input?.researchRunId,
      operation: input?.operation,
      clientRequestId: input?.clientRequestId
    });
    const runId = input.researchRunId;
    const key = requestKey(input.operation, input.clientRequestId);
    let state = runGrowth.get(runId);
    if (!state) {
      state = {
        counts: { ...durable.counts },
        requestKeys: new Set()
      };
      runGrowth.set(runId, state);
    } else {
      mergeDurableCounts(state.counts, durable.counts);
    }

    if (durable.existingRequest || state.requestKeys.has(key)) {
      state.requestKeys.add(key);
      return await core.createJob(input);
    }

    assertResearchGrowthCapacity({
      growthLimits,
      operation: input.operation,
      counts: state.counts
    });
    const created = await core.createJob(input);
    state.requestKeys.add(key);
    state.counts.jobs += 1;
    if (input.operation === RESEARCH_EXPERIMENT_OPERATION) {
      state.counts.experimentSubmissions += 1;
    }
    if (input.operation === RESEARCH_ANALYSIS_OPERATION) {
      state.counts.analysisSubmissions += 1;
    }
    return created;
  }

  return Object.freeze({
    ...core,
    growthLimits,

    async createJob(input) {
      if (growthLimits === null) return await core.createJob(input);
      return await serializeCreate(() => createGrowthGovernedJob(input));
    },

    async close() {
      if (closed) return;
      closed = true;
      await createTail;
      await core.close();
    }
  });
}
