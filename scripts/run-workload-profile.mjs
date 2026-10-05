import { spawn } from "node:child_process";
import path from "node:path";

const profile = process.argv[2] ?? "ci";
const allowed = new Set(["ci", "target-e2e", "target-day", "custom"]);
if (!allowed.has(profile)) {
  console.error(`Unknown workload profile: ${profile}`);
  process.exitCode = 2;
} else {
  const tests = profile === "target-e2e"
    ? ["tests/workload/representative-workload.test.mjs"]
    : profile === "target-day"
      ? ["tests/workload/isolated-probes.test.mjs"]
      : [
          "tests/workload/representative-workload.test.mjs",
          "tests/workload/isolated-probes.test.mjs"
        ];

  const reportDir = path.resolve("test-results", "workload");
  const env = {
    ...process.env,
    MARKET_FLOW_US_WORKLOAD_PROFILE: profile,
    MARKET_FLOW_US_WORKLOAD_REPORT:
      process.env.MARKET_FLOW_US_WORKLOAD_REPORT
      ?? path.join(reportDir, `${profile}-end-to-end.json`),
    MARKET_FLOW_US_ISOLATED_REPORT:
      process.env.MARKET_FLOW_US_ISOLATED_REPORT
      ?? path.join(reportDir, `${profile}-isolated.json`)
  };

  const child = spawn(
    process.execPath,
    ["--test", ...tests],
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
}
