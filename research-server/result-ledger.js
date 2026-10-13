import { assertResearchResultCapacity } from "./growth-governance.js";
import { openResearchJobLedger } from "./job-ledger.js";
import { freezeResearchSqlResultProvenance } from "./research-sql-result-provenance.js";
import {
  DEFAULT_RESEARCH_RESULT_LIMITS,
  RESEARCH_RESULT_SCHEMA_VERSION,
  openResearchResultLedger as openResearchResultStorage
} from "./result-ledger-storage.js";

export { DEFAULT_RESEARCH_RESULT_LIMITS, RESEARCH_RESULT_SCHEMA_VERSION };

const RESULT_BUDGET_DIMENSIONS = Object.freeze([
  ["resultRows", (rows) => rows.length],
  ["resultBytes", (rows) => Buffer.byteLength(JSON.stringify(rows), "utf8")]
]);

function budgetExceeded({ dimension, amount, exhaustedScope, budgets }) {
  const error = new Error(`Research budget exceeded for ${dimension} at ${exhaustedScope} scope`);
  error.code = "RESEARCH_BUDGET_EXCEEDED";
  error.dimension = dimension;
  error.amount = amount;
  error.exhaustedScope = exhaustedScope;
  error.budgets = budgets;
  return error;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertBudgetState(state, scope, dimension) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error(`Research result budget is missing ${dimension} at ${scope} scope`);
  }
  const limit = Number(state.limit);
  const consumed = Number(state.consumed);
  const remaining = Number(state.remaining);
  if (!Number.isSafeInteger(limit) || limit < 1
    || !Number.isSafeInteger(consumed) || consumed < 0
    || !Number.isSafeInteger(remaining) || remaining < 0
    || consumed + remaining !== limit) {
    throw new Error(`Research result budget ${dimension} at ${scope} scope is invalid`);
  }
  return { limit, consumed };
}

function reserveResultBudgetProgress(progress, rows) {
  if (!progress || !Array.isArray(progress.budget) || progress.budget.length === 0) {
    return null;
  }
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");

  const next = cloneJson(progress);
  for (const [dimension, amountFactory] of RESULT_BUDGET_DIMENSIONS) {
    const amount = amountFactory(rows);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`Research result ${dimension} amount is invalid`);
    }

    for (const view of [...next.budget].reverse()) {
      const scope = String(view?.scope ?? "");
      const state = assertBudgetState(view?.dimensions?.[dimension], scope, dimension);
      if (state.consumed + amount > state.limit) {
        throw budgetExceeded({
          dimension,
          amount,
          exhaustedScope: scope,
          budgets: cloneJson(progress.budget)
        });
      }
    }

    for (const view of next.budget) {
      const state = assertBudgetState(view.dimensions[dimension], view.scope, dimension);
      const consumed = state.consumed + amount;
      view.dimensions[dimension] = {
        limit: state.limit,
        consumed,
        remaining: state.limit - consumed
      };
    }
  }
  return next;
}

async function reserveManagedResultBudget(options, input) {
  const jobs = await openResearchJobLedger({
    ...options,
    reconcileInterrupted: false
  });
  try {
    const job = await jobs.getJob(input.researchRunId, input.sourceJobId);
    if (!job) return;
    const progress = reserveResultBudgetProgress(job.progress, input.rows);
    if (!progress) return;
    if (job.status !== "RUNNING") {
      throw new Error(`Research Result cannot reserve budget from ${job.status} Job`);
    }
    await jobs.updateJobProgress(job.researchRunId, job.jobId, progress);
  } finally {
    await jobs.close();
  }
}

export async function openResearchResultLedger(options = {}) {
  let storage = await openResearchResultStorage(options);
  const schemaVersion = storage.schemaVersion;
  const limits = storage.limits;
  let closed = false;
  let createTail = Promise.resolve();

  function requireOpen() {
    if (closed || !storage) throw new Error("Research Result Ledger is closed");
    return storage;
  }

  async function reopenStorage() {
    storage = await openResearchResultStorage(options);
  }

  async function serializeCreate(operation) {
    const previous = createTail;
    let release;
    createTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (closed) throw new Error("Research Result Ledger is closed");
      return await operation();
    } finally {
      release();
    }
  }

  return Object.freeze({
    schemaVersion,
    limits,

    async createResult(input) {
      return await serializeCreate(async () => {
        requireOpen();
        await storage.close();
        storage = null;
        let durableInput = input;
        try {
          await assertResearchResultCapacity({
            dbPath: options.dbPath,
            growthLimits: options.growthLimits,
            researchRunId: input?.researchRunId
          });
          durableInput = await freezeResearchSqlResultProvenance(options, input);
          await reserveManagedResultBudget(options, durableInput);
        } finally {
          await reopenStorage();
        }
        return await storage.createResult(durableInput);
      });
    },

    async getResult(researchRunId, resultHandle) {
      return await requireOpen().getResult(researchRunId, resultHandle);
    },

    async getResultPage(researchRunId, resultHandle, pageOptions) {
      return await requireOpen().getResultPage(researchRunId, resultHandle, pageOptions);
    },

    async close() {
      if (closed) return;
      closed = true;
      await createTail;
      if (storage) {
        await storage.close();
        storage = null;
      }
    }
  });
}
