export const DEFAULT_MANAGED_RESEARCH_RESOURCE_POLICY = Object.freeze({
  concurrency: Object.freeze({
    maxActiveJobs: 1,
    maxQueuedJobs: 4,
    maxActiveJobsPerRun: 1,
    maxAnalyticalReaders: 1,
    maxAnalyticalReadersPerRun: 1,
    maxAnalyticalReadersPerJob: 1
  }),
  budgets: Object.freeze({
    server: Object.freeze({
      workUnits: 20,
      t0Evaluations: 1000,
      resultRows: 10_000,
      resultBytes: 5_000_000
    }),
    run: Object.freeze({
      workUnits: 10,
      t0Evaluations: 500,
      resultRows: 5_000,
      resultBytes: 2_000_000
    }),
    job: Object.freeze({
      workUnits: 2,
      t0Evaluations: 100,
      resultRows: 1000,
      resultBytes: 500_000
    }),
    request: Object.freeze({
      workUnits: 2,
      t0Evaluations: 100,
      resultRows: 1000,
      resultBytes: 500_000
    }),
    sqlAnalysis: Object.freeze({
      workUnits: 1,
      t0Evaluations: 100,
      resultRows: 1000,
      resultBytes: 500_000
    })
  })
});
