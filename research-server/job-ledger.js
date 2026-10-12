import {
  RESEARCH_JOB_SCHEMA_VERSION,
  openResearchJobLedger as openCoreResearchJobLedger
} from "./job-ledger-core.js";
import {
  assertResearchSubmissionCapacity,
  normalizeResearchGrowthLimits
} from "./growth-governance.js";

export { RESEARCH_JOB_SCHEMA_VERSION };

export async function openResearchJobLedger(options = {}) {
  const growthLimits = normalizeResearchGrowthLimits(options.growthLimits);
  const core = await openCoreResearchJobLedger(options);
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

  return Object.freeze({
    ...core,
    growthLimits,

    async createJob(input) {
      if (growthLimits === null) return await core.createJob(input);
      return await serializeCreate(async () => {
        await assertResearchSubmissionCapacity({
          dbPath: options.dbPath,
          growthLimits,
          researchRunId: input?.researchRunId,
          operation: input?.operation,
          clientRequestId: input?.clientRequestId
        });
        return await core.createJob(input);
      });
    },

    async close() {
      if (closed) return;
      closed = true;
      await createTail;
      await core.close();
    }
  });
}
