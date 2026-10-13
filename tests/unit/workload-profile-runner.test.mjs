import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildWorkloadEnvironment,
  clearWorkloadReports,
  missingWorkloadReports,
  resolveWorkloadReportPaths,
  resolveWorkloadTestFiles
} from "../../scripts/run-workload-profile.mjs";

function reportOverrides(prefix) {
  return {
    MARKET_FLOW_US_WORKLOAD_REPORT: path.resolve(`${prefix}-end-to-end.json`),
    MARKET_FLOW_US_ISOLATED_REPORT: path.resolve(`${prefix}-isolated.json`),
    MARKET_FLOW_US_DEMO_BUY_REPORT: path.resolve(`${prefix}-demo-buy.json`),
    MARKET_FLOW_US_BACKTEST_REPORT: path.resolve(`${prefix}-backtest.json`),
    MARKET_FLOW_US_RESEARCH_REPORT: path.resolve(`${prefix}-research.json`)
  };
}

test("workload profile runner clears exactly the target-e2e reports before execution", () => {
  const environment = buildWorkloadEnvironment("target-e2e", reportOverrides("target-e2e-test"));
  const removed = [];

  clearWorkloadReports("target-e2e", environment, (reportPath, options) => {
    removed.push({ reportPath, options });
  });

  assert.deepEqual(
    removed.map((entry) => entry.reportPath),
    [
      environment.MARKET_FLOW_US_WORKLOAD_REPORT,
      environment.MARKET_FLOW_US_DEMO_BUY_REPORT,
      environment.MARKET_FLOW_US_BACKTEST_REPORT,
      environment.MARKET_FLOW_US_RESEARCH_REPORT
    ]
  );
  assert.ok(removed.every((entry) => entry.options.force === true));
  assert.ok(!removed.some((entry) => entry.reportPath === environment.MARKET_FLOW_US_ISOLATED_REPORT));
});

test("workload report cleanup follows the selected probe set for target-day and ci", () => {
  const targetDayEnvironment = buildWorkloadEnvironment("target-day", reportOverrides("target-day-test"));
  assert.deepEqual(
    resolveWorkloadReportPaths("target-day", targetDayEnvironment),
    [
      targetDayEnvironment.MARKET_FLOW_US_ISOLATED_REPORT,
      targetDayEnvironment.MARKET_FLOW_US_DEMO_BUY_REPORT,
      targetDayEnvironment.MARKET_FLOW_US_BACKTEST_REPORT,
      targetDayEnvironment.MARKET_FLOW_US_RESEARCH_REPORT
    ]
  );

  const ciEnvironment = buildWorkloadEnvironment("ci", reportOverrides("ci-test"));
  assert.deepEqual(
    resolveWorkloadReportPaths("ci", ciEnvironment),
    [
      ciEnvironment.MARKET_FLOW_US_WORKLOAD_REPORT,
      ciEnvironment.MARKET_FLOW_US_ISOLATED_REPORT,
      ciEnvironment.MARKET_FLOW_US_DEMO_BUY_REPORT,
      ciEnvironment.MARKET_FLOW_US_BACKTEST_REPORT
    ]
  );
  assert.ok(!resolveWorkloadTestFiles("ci").includes("tests/workload/research-resource-probe.test.mjs"));
});

test("workload report cleanup honors explicit report destinations", () => {
  const overrides = reportOverrides("explicit-report-test");
  const environment = buildWorkloadEnvironment("target-e2e", overrides);

  assert.equal(environment.MARKET_FLOW_US_RESEARCH_REPORT, overrides.MARKET_FLOW_US_RESEARCH_REPORT);
  assert.ok(resolveWorkloadReportPaths("target-e2e", environment).includes(overrides.MARKET_FLOW_US_RESEARCH_REPORT));
});

test("successful workload profiles require every selected report to be freshly present", () => {
  const environment = buildWorkloadEnvironment("target-e2e", reportOverrides("fresh-report-test"));
  const expected = resolveWorkloadReportPaths("target-e2e", environment);
  const present = new Set(expected.slice(0, -1));

  assert.deepEqual(
    missingWorkloadReports("target-e2e", environment, (reportPath) => present.has(reportPath)),
    [environment.MARKET_FLOW_US_RESEARCH_REPORT]
  );
  assert.deepEqual(
    missingWorkloadReports("target-e2e", environment, () => true),
    []
  );
});
