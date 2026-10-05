import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const TEST_FILE = "tests/e2e/us-runtime-membership-recovery.spec.mjs";
const REPORT_DIR = path.resolve("test-results", "acceptance");
const DETAIL_DIR = path.join(REPORT_DIR, "details");
const PLAYWRIGHT_CLI = path.resolve("node_modules", "@playwright", "test", "cli.js");
const WORKLOAD_RUNNER = path.resolve("scripts", "run-workload-profile.mjs");
const MAX_DIAGNOSTIC_CHARS = 4000;

const PROFILES = Object.freeze({
  static: Object.freeze({
    checkpoint: "FR-7",
    kind: "playwright",
    grep: "repeated identical complete responses"
  }),
  recovery: Object.freeze({
    checkpoint: "FR-8",
    kind: "playwright",
    grep: "preserves committed authority|applies add/remove membership"
  }),
  all: Object.freeze({
    checkpoint: "FR-7+FR-8",
    kind: "playwright",
    grep: null
  }),
  isolated: Object.freeze({
    checkpoint: "FR-9",
    kind: "workload",
    workloadProfile: "target-day",
    detailReport: "isolated-target-day.json",
    detailEnv: "MARKET_FLOW_US_ISOLATED_REPORT"
  }),
  target: Object.freeze({
    checkpoint: "FR-9",
    kind: "workload",
    workloadProfile: "target-e2e",
    detailReport: "target-4096x180.json",
    detailEnv: "MARKET_FLOW_US_WORKLOAD_REPORT"
  })
});

function boundedSanitizedText(value) {
  if (!value) return null;
  const cwd = process.cwd();
  const home = os.homedir();
  const temp = os.tmpdir();
  return String(value)
    .replaceAll(cwd, "<repo>")
    .replaceAll(home, "<home>")
    .replaceAll(temp, "<temp>")
    .replace(/https?:\/\/[^\s)\]}>]+/gi, "<url>")
    .slice(-MAX_DIAGNOSTIC_CHARS);
}

async function run(command, args, { env = process.env } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";
    const onData = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      output = `${output}${text}`.slice(-MAX_DIAGNOSTIC_CHARS * 2);
    };

    child.stdout?.on("data", (chunk) => onData(chunk, process.stdout));
    child.stderr?.on("data", (chunk) => onData(chunk, process.stderr));

    child.on("error", (error) => {
      resolve({
        code: 1,
        signal: null,
        error: error instanceof Error ? error.message : String(error),
        output
      });
    });

    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 1, signal, error: null, output });
    });
  });
}

async function gitValue(args) {
  return await new Promise((resolve) => {
    const child = spawn("git", args, {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"]
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code === 0 ? stdout.trim() : null));
  });
}

async function candidateIdentity() {
  const sha = await gitValue(["rev-parse", "HEAD"]);
  const porcelain = await gitValue(["status", "--porcelain"]);
  return {
    sha: sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : null,
    dirty: porcelain === null ? null : porcelain.length > 0
  };
}

async function runProfile(profile) {
  if (profile.kind === "playwright") {
    const args = [
      PLAYWRIGHT_CLI,
      "test",
      TEST_FILE,
      "--reporter=line"
    ];
    if (profile.grep) args.push("--grep", profile.grep);

    return {
      result: await run(process.execPath, args),
      summary: {
        runner: "playwright",
        testFile: TEST_FILE,
        grep: profile.grep
      },
      detailReports: []
    };
  }

  const detailPath = path.join(DETAIL_DIR, profile.detailReport);
  await mkdir(DETAIL_DIR, { recursive: true });
  const env = {
    ...process.env,
    [profile.detailEnv]: detailPath
  };
  const result = await run(
    process.execPath,
    [WORKLOAD_RUNNER, profile.workloadProfile],
    { env }
  );

  if (result.code === 0 && result.signal === null && result.error === null) {
    try {
      await access(detailPath);
    } catch {
      return {
        result: {
          ...result,
          code: 1,
          error: `Workload profile passed without creating ${profile.detailReport}.`
        },
        summary: {
          runner: "workload",
          workloadProfile: profile.workloadProfile
        },
        detailReports: []
      };
    }
  }

  return {
    result,
    summary: {
      runner: "workload",
      workloadProfile: profile.workloadProfile
    },
    detailReports: [path.relative(process.cwd(), detailPath)]
  };
}

const profileName = process.argv[2] ?? "all";
const profile = PROFILES[profileName];

if (!profile) {
  console.error(`Unknown local acceptance profile: ${profileName}`);
  console.error(`Allowed profiles: ${Object.keys(PROFILES).join(", ")}`);
  process.exitCode = 2;
} else {
  const startedAt = Date.now();
  const identity = await candidateIdentity();
  const execution = await runProfile(profile);
  const result = execution.result;
  const finishedAt = Date.now();
  const passed = result.code === 0 && result.signal === null && result.error === null;

  const report = {
    schemaVersion: 1,
    product: "market-flow-us",
    candidateSha: identity.sha,
    candidateDirty: identity.dirty,
    checkpoint: profile.checkpoint,
    profile: profileName,
    status: passed ? "PASS" : "FAIL",
    startedAtMs: startedAt,
    durationMs: finishedAt - startedAt,
    summary: {
      ...execution.summary,
      detailReports: execution.detailReports,
      exitCode: result.code,
      signal: result.signal
    },
    diagnostic: passed
      ? null
      : {
          component: profile.kind === "workload" ? "workload-acceptance" : "local-acceptance",
          checkpoint: profile.checkpoint,
          code: result.signal ? "ACCEPTANCE_TERMINATED" : "ACCEPTANCE_TEST_FAILED",
          message: boundedSanitizedText(result.error ?? result.output ?? "Local acceptance failed.")
        }
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${profileName}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`\nLocal acceptance ${profileName}: ${report.status}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  for (const detailReport of execution.detailReports) {
    console.log(`Detail report: ${detailReport}`);
  }
  if (report.candidateSha) console.log(`Candidate SHA: ${report.candidateSha}`);
  if (report.candidateDirty === true) {
    console.log("Candidate working tree: DIRTY");
  }

  process.exitCode = passed ? 0 : 1;
}
