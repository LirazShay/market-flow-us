const RUN_ID = /^run_[0-9a-f-]{36}$/u;
const JOB_ID = /^job_[0-9a-f-]{36}$/u;
const SCOPE_KINDS = new Set(["REQUEST", "SQL_ANALYSIS"]);

function assertId(value, label, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function assertPositiveLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertNonNegativeAmount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeBudgetLimits(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a non-empty budget object`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new TypeError(`${label} must be a non-empty budget object`);
  }
  const normalized = {};
  for (const [dimension, limit] of entries) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(dimension)) {
      throw new TypeError(`${label} contains an invalid budget dimension`);
    }
    normalized[dimension] = assertPositiveLimit(limit, `${label}.${dimension}`);
  }
  return Object.freeze(normalized);
}

function normalizeConcurrency(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("concurrency limits are required");
  }
  return Object.freeze({
    maxActiveJobs: assertPositiveLimit(value.maxActiveJobs, "maxActiveJobs"),
    maxQueuedJobs: assertPositiveLimit(value.maxQueuedJobs, "maxQueuedJobs"),
    maxActiveJobsPerRun: assertPositiveLimit(value.maxActiveJobsPerRun, "maxActiveJobsPerRun"),
    maxAnalyticalReaders: assertPositiveLimit(value.maxAnalyticalReaders, "maxAnalyticalReaders"),
    maxAnalyticalReadersPerRun: assertPositiveLimit(
      value.maxAnalyticalReadersPerRun,
      "maxAnalyticalReadersPerRun"
    ),
    maxAnalyticalReadersPerJob: assertPositiveLimit(
      value.maxAnalyticalReadersPerJob,
      "maxAnalyticalReadersPerJob"
    )
  });
}

function validateBudgetHierarchy(serverLimits, runLimits, jobLimits) {
  const dimensions = Object.keys(serverLimits);
  for (const dimension of dimensions) {
    if (!Object.hasOwn(runLimits, dimension) || !Object.hasOwn(jobLimits, dimension)) {
      throw new TypeError(`budget dimension ${dimension} must be bounded at server, run and job scope`);
    }
    if (runLimits[dimension] > serverLimits[dimension]) {
      throw new TypeError(`run budget ${dimension} cannot exceed its server parent limit`);
    }
    if (jobLimits[dimension] > runLimits[dimension]) {
      throw new TypeError(`job budget ${dimension} cannot exceed its run parent limit`);
    }
  }
  for (const dimension of Object.keys(runLimits)) {
    if (!Object.hasOwn(serverLimits, dimension) || !Object.hasOwn(jobLimits, dimension)) {
      throw new TypeError(`budget dimension ${dimension} must be bounded at server, run and job scope`);
    }
  }
  for (const dimension of Object.keys(jobLimits)) {
    if (!Object.hasOwn(serverLimits, dimension) || !Object.hasOwn(runLimits, dimension)) {
      throw new TypeError(`budget dimension ${dimension} must be bounded at server, run and job scope`);
    }
  }
}

function keyForJob(researchRunId, jobId) {
  return `${researchRunId}\u0000${jobId}`;
}

function usageFor(map, key) {
  let usage = map.get(key);
  if (!usage) {
    usage = new Map();
    map.set(key, usage);
  }
  return usage;
}

function readUsage(map, dimension) {
  return map.get(dimension) ?? 0;
}

function budgetView(scope, limits, consumed) {
  const dimensions = {};
  for (const [dimension, limit] of Object.entries(limits)) {
    const used = readUsage(consumed, dimension);
    dimensions[dimension] = Object.freeze({
      limit,
      consumed: used,
      remaining: Math.max(0, limit - used)
    });
  }
  return Object.freeze({ scope, dimensions: Object.freeze(dimensions) });
}

export class ResearchBudgetExceededError extends Error {
  constructor({ dimension, amount, exhaustedScope, budgets }) {
    super(`Research budget exceeded for ${dimension} at ${exhaustedScope} scope`);
    this.name = "ResearchBudgetExceededError";
    this.code = "RESEARCH_BUDGET_EXCEEDED";
    this.dimension = dimension;
    this.amount = amount;
    this.exhaustedScope = exhaustedScope;
    this.budgets = budgets;
  }
}

export class ResearchConcurrencyLimitError extends Error {
  constructor(message, code = "RESEARCH_CONCURRENCY_LIMIT") {
    super(message);
    this.name = "ResearchConcurrencyLimitError";
    this.code = code;
  }
}

export function createResearchResourceGovernor({ concurrency, budgets } = {}) {
  const boundedConcurrency = normalizeConcurrency(concurrency);
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    throw new TypeError("budgets are required");
  }
  const serverBudgetLimits = normalizeBudgetLimits(budgets.server, "budgets.server");
  const runBudgetLimits = normalizeBudgetLimits(budgets.run, "budgets.run");
  const jobBudgetLimits = normalizeBudgetLimits(budgets.job, "budgets.job");
  validateBudgetHierarchy(serverBudgetLimits, runBudgetLimits, jobBudgetLimits);

  const globalUsage = new Map();
  const runUsage = new Map();
  const jobUsage = new Map();

  const activeJobs = new Set();
  const activeJobsByRun = new Map();
  const queuedJobs = [];
  const queuedJobKeys = new Set();

  let activeReaders = 0;
  const activeReadersByRun = new Map();
  const activeReadersByJob = new Map();

  function decrementCount(map, key) {
    const next = (map.get(key) ?? 0) - 1;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  }

  function activateJob(researchRunId, jobId) {
    const key = keyForJob(researchRunId, jobId);
    activeJobs.add(key);
    activeJobsByRun.set(researchRunId, (activeJobsByRun.get(researchRunId) ?? 0) + 1);

    let released = false;
    return Object.freeze({
      researchRunId,
      jobId,
      release() {
        if (released) return;
        released = true;
        if (!activeJobs.delete(key)) return;
        decrementCount(activeJobsByRun, researchRunId);
        drainJobQueue();
      }
    });
  }

  function canActivateJob(researchRunId) {
    return activeJobs.size < boundedConcurrency.maxActiveJobs
      && (activeJobsByRun.get(researchRunId) ?? 0) < boundedConcurrency.maxActiveJobsPerRun;
  }

  function removeQueued(waiter) {
    const index = queuedJobs.indexOf(waiter);
    if (index >= 0) queuedJobs.splice(index, 1);
    queuedJobKeys.delete(waiter.key);
    if (waiter.signal && waiter.abortHandler) {
      waiter.signal.removeEventListener("abort", waiter.abortHandler);
    }
  }

  function drainJobQueue() {
    while (activeJobs.size < boundedConcurrency.maxActiveJobs) {
      const index = queuedJobs.findIndex((waiter) => canActivateJob(waiter.researchRunId));
      if (index < 0) return;
      const waiter = queuedJobs[index];
      removeQueued(waiter);
      waiter.resolve(activateJob(waiter.researchRunId, waiter.jobId));
    }
  }

  function budgetState(researchRunId, jobId, localScopes = []) {
    const runConsumed = usageFor(runUsage, researchRunId);
    const jobConsumed = usageFor(jobUsage, keyForJob(researchRunId, jobId));
    const views = [
      budgetView("SERVER", serverBudgetLimits, globalUsage),
      budgetView("RUN", runBudgetLimits, runConsumed),
      budgetView("JOB", jobBudgetLimits, jobConsumed)
    ];
    for (const scope of localScopes) {
      views.push(budgetView(scope.kind, scope.limits, scope.consumed));
    }
    return Object.freeze(views);
  }

  function consumeHierarchy(researchRunId, jobId, localScopes, dimension, amount) {
    if (!Object.hasOwn(serverBudgetLimits, dimension)) {
      throw new TypeError(`budget dimension ${dimension} is not configured across the hierarchy`);
    }
    const boundedAmount = assertNonNegativeAmount(amount, "budget amount");
    if (boundedAmount === 0) return budgetState(researchRunId, jobId, localScopes);

    const runConsumed = usageFor(runUsage, researchRunId);
    const jobKey = keyForJob(researchRunId, jobId);
    const jobConsumed = usageFor(jobUsage, jobKey);
    const checks = [
      ...localScopes.slice().reverse().map((scope) => ({
        scope: scope.kind,
        limits: scope.limits,
        consumed: scope.consumed
      })),
      { scope: "JOB", limits: jobBudgetLimits, consumed: jobConsumed },
      { scope: "RUN", limits: runBudgetLimits, consumed: runConsumed },
      { scope: "SERVER", limits: serverBudgetLimits, consumed: globalUsage }
    ];

    for (const check of checks) {
      if (!Object.hasOwn(check.limits, dimension)) {
        throw new TypeError(`${check.scope} scope does not bound ${dimension}`);
      }
      const current = readUsage(check.consumed, dimension);
      if (current + boundedAmount > check.limits[dimension]) {
        throw new ResearchBudgetExceededError({
          dimension,
          amount: boundedAmount,
          exhaustedScope: check.scope,
          budgets: budgetState(researchRunId, jobId, localScopes)
        });
      }
    }

    globalUsage.set(dimension, readUsage(globalUsage, dimension) + boundedAmount);
    runConsumed.set(dimension, readUsage(runConsumed, dimension) + boundedAmount);
    jobConsumed.set(dimension, readUsage(jobConsumed, dimension) + boundedAmount);
    for (const scope of localScopes) {
      scope.consumed.set(dimension, readUsage(scope.consumed, dimension) + boundedAmount);
    }
    return budgetState(researchRunId, jobId, localScopes);
  }

  function createScopeFactory(researchRunId, jobId, parentScopes) {
    return function createScope({ kind, limits } = {}) {
      if (!SCOPE_KINDS.has(kind)) {
        throw new TypeError("budget scope kind must be REQUEST or SQL_ANALYSIS");
      }
      const normalizedLimits = normalizeBudgetLimits(limits, `${kind} limits`);
      for (const dimension of Object.keys(serverBudgetLimits)) {
        if (!Object.hasOwn(normalizedLimits, dimension)) {
          throw new TypeError(`${kind} scope must bound ${dimension}`);
        }
        const parentLimit = parentScopes.length > 0
          ? parentScopes[parentScopes.length - 1].limits[dimension]
          : jobBudgetLimits[dimension];
        if (normalizedLimits[dimension] > parentLimit) {
          throw new TypeError(`${kind} budget ${dimension} cannot exceed its parent limit`);
        }
      }
      const scope = {
        kind,
        limits: normalizedLimits,
        consumed: new Map()
      };
      const scopes = [...parentScopes, scope];
      return Object.freeze({
        kind,
        consume(dimension, amount = 1) {
          return consumeHierarchy(researchRunId, jobId, scopes, dimension, amount);
        },
        snapshot() {
          return budgetState(researchRunId, jobId, scopes);
        },
        createScope: createScopeFactory(researchRunId, jobId, scopes)
      });
    };
  }

  return Object.freeze({
    limits: Object.freeze({
      concurrency: boundedConcurrency,
      budgets: Object.freeze({
        server: serverBudgetLimits,
        run: runBudgetLimits,
        job: jobBudgetLimits
      })
    }),

    async acquireJob({ researchRunId, jobId, signal } = {}) {
      const runId = assertId(researchRunId, "researchRunId", RUN_ID);
      const durableJobId = assertId(jobId, "jobId", JOB_ID);
      if (signal !== undefined && !(signal instanceof AbortSignal)) {
        throw new TypeError("signal must be an AbortSignal");
      }
      const key = keyForJob(runId, durableJobId);
      if (activeJobs.has(key) || queuedJobKeys.has(key)) {
        throw new Error("Research Job already owns or is waiting for a heavy-job slot");
      }
      if (signal?.aborted) {
        throw new ResearchConcurrencyLimitError("Research Job queue wait was cancelled", "RESEARCH_QUEUE_CANCELLED");
      }
      if (canActivateJob(runId)) return activateJob(runId, durableJobId);
      if (queuedJobs.length >= boundedConcurrency.maxQueuedJobs) {
        throw new ResearchConcurrencyLimitError("Research heavy-job queue is full", "RESEARCH_QUEUE_FULL");
      }

      return await new Promise((resolve, reject) => {
        const waiter = {
          key,
          researchRunId: runId,
          jobId: durableJobId,
          signal,
          abortHandler: null,
          resolve,
          reject
        };
        if (signal) {
          waiter.abortHandler = () => {
            removeQueued(waiter);
            reject(new ResearchConcurrencyLimitError(
              "Research Job queue wait was cancelled",
              "RESEARCH_QUEUE_CANCELLED"
            ));
          };
          signal.addEventListener("abort", waiter.abortHandler, { once: true });
        }
        queuedJobs.push(waiter);
        queuedJobKeys.add(key);
      });
    },

    acquireAnalyticalReader({ researchRunId, jobId } = {}) {
      const runId = assertId(researchRunId, "researchRunId", RUN_ID);
      const durableJobId = assertId(jobId, "jobId", JOB_ID);
      const key = keyForJob(runId, durableJobId);
      if (activeReaders >= boundedConcurrency.maxAnalyticalReaders
        || (activeReadersByRun.get(runId) ?? 0) >= boundedConcurrency.maxAnalyticalReadersPerRun
        || (activeReadersByJob.get(key) ?? 0) >= boundedConcurrency.maxAnalyticalReadersPerJob) {
        throw new ResearchConcurrencyLimitError("Research analytical reader limit reached");
      }

      activeReaders += 1;
      activeReadersByRun.set(runId, (activeReadersByRun.get(runId) ?? 0) + 1);
      activeReadersByJob.set(key, (activeReadersByJob.get(key) ?? 0) + 1);
      let released = false;
      return Object.freeze({
        researchRunId: runId,
        jobId: durableJobId,
        release() {
          if (released) return;
          released = true;
          activeReaders -= 1;
          decrementCount(activeReadersByRun, runId);
          decrementCount(activeReadersByJob, key);
        }
      });
    },

    createJobBudget({ researchRunId, jobId } = {}) {
      const runId = assertId(researchRunId, "researchRunId", RUN_ID);
      const durableJobId = assertId(jobId, "jobId", JOB_ID);
      return Object.freeze({
        consume(dimension, amount = 1) {
          return consumeHierarchy(runId, durableJobId, [], dimension, amount);
        },
        snapshot() {
          return budgetState(runId, durableJobId, []);
        },
        createScope: createScopeFactory(runId, durableJobId, [])
      });
    },

    snapshot({ researchRunId, jobId } = {}) {
      const runId = assertId(researchRunId, "researchRunId", RUN_ID);
      const durableJobId = assertId(jobId, "jobId", JOB_ID);
      return Object.freeze({
        activeJobs: activeJobs.size,
        queuedJobs: queuedJobs.length,
        activeAnalyticalReaders: activeReaders,
        activeJobsForRun: activeJobsByRun.get(runId) ?? 0,
        activeReadersForRun: activeReadersByRun.get(runId) ?? 0,
        activeReadersForJob: activeReadersByJob.get(keyForJob(runId, durableJobId)) ?? 0,
        budgets: budgetState(runId, durableJobId, [])
      });
    }
  });
}
