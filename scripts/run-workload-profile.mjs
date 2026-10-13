import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHAPE_OVERRIDE_KEYS = Object.freeze([
  "MARKET_FLOW_US_WORKLOAD_UNIVERSE_SIZE",
  "MARKET_FLOW_US_WORKLOAD_CYCLES",
  "MARKET_FLOW_US_WORKLOAD_CADENCE_MS",
  "MARKET_FLOW_US_TRADING_DAY_MINUTES",
  "MARKET_FLOW_US_PERSISTENCE_UNIVERSE_SIZE",
  "MARKET_FLOW_US_PERSISTENCE_CYCLES",
  "MARKET_FLOW_US_WORKLOAD_PATTERN",
  "MARKET_FLOW_US_WORKLOAD_FAILURE_CYCLES"
]);

const REPORT_ENV_BY_TEST_FILE = Object.freeze({
  "tests/workload/representative-workload.test.mjs": "MARKET_FLOW_US_WORKLOAD_REPORT",
  "tests/workload/isolated-probes.test.mjs": "MARKET_FLOW_US_ISOLATED_REPORT",
  "tests/workload/demo-buy-evaluator-probe.test.mjs": "MARKET_FLOW_US_DEMO_BUY_REPORT",
  "tests/workload/backtest-lab-probe.test.mjs": "MARKET_FLOW_US_BACKTEST_REPORT",
  "tests/workload/research-resource-probe.test.mjs": "MARKET_FLOW_US_RESEARCH_REPORT"
});

export function buildWorkloadEnvironment(profile, baseEnv = process.env) {
  const env = { ...baseEnv };
  if (profile !== "custom") {
    for (const key of SHAPE_OVERRIDE_KEYS) delete env[key];
  }

  const reportDir = path.resolve("test-results", "workload");
  return {
    ...env,
    MARKET_FLOW_US_WORKLOAD_PROFILE: profile,
    MARKET_FLOW_US_WORKLOAD_REPORT:
      env.MARKET_FLOW_US_WORKLOAD_REPORT
      ?? path.join(reportDir, `${profile}-end-to-end.json`),
    MARKET_FLOW_US_ISOLATED_REPORT:
      env.MARKET_FLOW_US_ISOLATED_REPORT
      ?? path.join(reportDir, `${profile}-isolated.json`),
    MARKET_FLOW_US_DEMO_BUY_REPORT:
      env.MARKET_FLOW_US_DEMO_BUY_REPORT
      ?? path.join(reportDir, `${profile}-demo-buy-evaluator.json`),
    MARKET_FLOW_US_BACKTEST_REPORT:
      env.MARKET_FLOW_US_BACKTEST_REPORT
      ?? path.join(reportDir, `${profile}-backtest-lab.json`),
    MARKET_FLOW_US_RESEARCH_REPORT:
      env.MARKET_FLOW_US_RESEARCH_REPORT
      ?? path.join(reportDir, `${profile}-research-resource.json`)
  };
}

export function resolveWorkloadTestFiles(profile) {
  if (profile === "target-e2e") {
    return [
      "tests/workload/representative-workload.test.mjs",
      "tests/workload/demo-buy-evaluator-probe.test.mjs",
      "tests/workload/backtest-lab-probe.test.mjs",
      "tests/workload/research-resource-probe.test.mjs"
    ];
  }
  if (profile === "target-day") {
    return [
      "tests/workload/isolated-probes.test.mjs",
      "tests/workload/demo-buy-evaluator-probe.test.mjs",
      "tests/workload/backtest-lab-probe.test.mjs",
      "tests/workload/research-resource-probe.test.mjs"
    ];
  }
  return [
    "tests/workload/representative-workload.test.mjs",
    "tests/workload/isolated-probes.test.mjs",
    "tests/workload/demo-buy-evaluator-probe.test.mjs",
    "tests/workload/backtest-lab-probe.test.mjs"
  ];
}

export function resolveWorkloadReportPaths(profile, environment = buildWorkloadEnvironment(profile)) {
  return resolveWorkloadTestFiles(profile).map((testFile) => {
    const envKey = REPORT_ENV_BY_TEST_FILE[testFile];
    const reportPath = envKey ? environment[envKey] : null;
    if (typeof reportPath !== "string" || reportPath.length === 0) {
      throw new Error(`Workload report path missing for ${testFile}.`);
    }
    return reportPath;
  });
}

export function clearWorkloadReports(
  profile,
  environment = buildWorkloadEnvironment(profile),
  removeFile = rmSync
) {
  for (const reportPath of resolveWorkloadReportPaths(profile, environment)) {
    removeFile(reportPath, { force: true });
  }
}

export function runWorkloadProfile(profile = process.argv[2] ?? "ci") {
  const allowed = new Set(["ci", "target-e2e", "target-day", "custom"]);
  if (!allowed.has(profile)) {
    console.error(`Unknown workload profile: ${profile}`);
    process.exitCode = 2;
    return null;
  }

  const env = buildWorkloadEnvironment(profile);
  clearWorkloadReports(profile, env);

  const child = spawn(
    process.execPath,
    ["--test", ...resolveWorkloadTestFiles(profile)],
    {
      env,
      stdio: "inherit",
      shell: false
    }
  );

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Workload profile ${profile} terminated by ${signal}.`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });

  return child;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  runWorkloadProfile();
}
