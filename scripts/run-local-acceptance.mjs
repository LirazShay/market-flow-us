import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TEST_FILE = "tests/e2e/us-runtime-membership-recovery.spec.mjs";
const REPORT_DIR = path.resolve("test-results", "acceptance");
const MAX_DIAGNOSTIC_CHARS = 4000;

const PROFILES = Object.freeze({
  static: Object.freeze({
    checkpoint: "FR-7",
    grep: "repeated identical complete responses"
  }),
  recovery: Object.freeze({
    checkpoint: "FR-8",
    grep: "preserves committed authority|applies add/remove membership"
  }),
  all: Object.freeze({
    checkpoint: "FR-7+FR-8",
    grep: null
  })
});

function boundedSanitizedText(value) {
  if (!value) return null;
  const cwd = process.cwd();
  return String(value)
    .replaceAll(cwd, "<repo>")
    .replace(/https?:\/\/[^\s)\]}>]+/gi, "<url>")
    .slice(-MAX_DIAGNOSTIC_CHARS);
}

async function run(command, args, { capture = false } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"]
    });

    let output = "";
    const onData = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      if (capture || text) {
        output = `${output}${text}`.slice(-MAX_DIAGNOSTIC_CHARS * 2);
      }
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
  const result = await new Promise((resolve) => {
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
  return result;
}

async function candidateIdentity() {
  const sha = await gitValue(["rev-parse", "HEAD"]);
  const porcelain = await gitValue(["status", "--porcelain"]);
  return {
    sha: sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : null,
    dirty: porcelain === null ? null : porcelain.length > 0
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
  const args = [
    "playwright",
    "test",
    TEST_FILE,
    "--reporter=line"
  ];
  if (profile.grep) args.push("--grep", profile.grep);

  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = await run(executable, args, { capture: true });
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
      testFile: TEST_FILE,
      exitCode: result.code,
      signal: result.signal
    },
    diagnostic: passed
      ? null
      : {
          component: "local-acceptance",
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
  if (report.candidateSha) console.log(`Candidate SHA: ${report.candidateSha}`);
  if (report.candidateDirty === true) {
    console.log("Candidate working tree: DIRTY");
  }

  process.exitCode = passed ? 0 : 1;
}
