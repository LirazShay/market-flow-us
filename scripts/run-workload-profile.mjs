import { spawn } from "node:child_process";
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
      ?? path.join(reportDir, `${profile}-demo-buy-evaluator.json`)
  };
}

export function resolveWorkloadTestFiles(profile) {
  if (profile === "target-e2e") {
    return [
      "tests/workload/representative-workload.test.mjs",
      "tests/workload/demo-buy-evaluator-probe.test.mjs"
    ];
  }
  if (profile === "target-day") {
    return [
      "tests/workload/isolated-probes.test.mjs",
      "tests/workload/demo-buy-evaluator-probe.test.mjs"
    ];
  }
  return [
    "tests/workload/representative-workload.test.mjs",
    "tests/workload/isolated-probes.test.mjs",
    "tests/workload/demo-buy-evaluator-probe.test.mjs"
  ];
}

export function runWorkloadProfile(profile = process.argv[2] ?? "ci") {
  const allowed = new Set(["ci", "target-e2e", "target-day", "custom"]);
  if (!allowed.has(profile)) {
    console.error(`Unknown workload profile: ${profile}`);
    process.exitCode = 2;
    return null;
  }

  const child = spawn(
    process.execPath,
    ["--test", ...resolveWorkloadTestFiles(profile)],
    {
      env: buildWorkloadEnvironment(profile),
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
