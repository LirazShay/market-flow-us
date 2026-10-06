import { spawn } from "node:child_process";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBoundedCommand } from "./acceptance-process.mjs";

const MEMBERSHIP_RECOVERY_TEST_FILE = "tests/e2e/us-runtime-membership-recovery.spec.mjs";
const MOVING_VALUES_TEST_FILE = "tests/e2e/us-runtime-moving-values.spec.mjs";
const DEMO_BUY_RUNTIME_TEST_FILE = "tests/e2e/demo-buy-scanner-capture.spec.mjs";
const DEMO_BUY_OUTCOME_TEST_FILE = "tests/e2e/demo-buy-outcome-surface.spec.mjs";
const AI_INVESTIGATION_UI_TEST_FILE = "tests/e2e/demo-buy-ai-investigation.spec.mjs";
const AI_PACK_SERVICE_TEST_FILE = "tests/service/demo-buy-ai-pack.test.mjs";
const REPORT_DIR = path.resolve("test-results", "acceptance");
const DETAIL_DIR = path.join(REPORT_DIR, "details");
const PLAYWRIGHT_CLI = path.resolve("node_modules", "@playwright", "test", "cli.js");
const WORKLOAD_RUNNER = path.resolve("scripts", "run-workload-profile.mjs");
const MAX_DIAGNOSTIC_CHARS = 4000;
const PLAYWRIGHT_ACCEPTANCE_TIMEOUT_MS = 3 * 60 * 1000;
const NODE_TEST_ACCEPTANCE_TIMEOUT_MS = 3 * 60 * 1000;
const WORKLOAD_ACCEPTANCE_TIMEOUT_MS = 45 * 60 * 1000;

const FEATURE_PROFILES = Object.freeze([
  "demo-buy-runtime",
  "demo-buy-outcomes",
  "ai-investigation-ui",
  "ai-pack-safety"
]);

export const LOCAL_ACCEPTANCE_PROFILES = Object.freeze({
  static: Object.freeze({
    checkpoint: "FR-7",
    kind: "playwright",
    testFile: MEMBERSHIP_RECOVERY_TEST_FILE,
    grep: "repeated identical complete responses"
  }),
  moving: Object.freeze({
    checkpoint: "FR-8A",
    kind: "playwright",
    testFile: MOVING_VALUES_TEST_FILE,
    grep: "moves Current values while preserving prior values in History"
  }),
  membership: Object.freeze({
    checkpoint: "FR-8B",
    kind: "playwright",
    testFile: MEMBERSHIP_RECOVERY_TEST_FILE,
    grep: "applies add/remove membership under acknowledged universe revisions"
  }),
  "provider-recovery": Object.freeze({
    checkpoint: "FR-8C",
    kind: "playwright",
    testFile: MEMBERSHIP_RECOVERY_TEST_FILE,
    grep: "records provider failure, recovers, and executes staged Scanner"
  }),
  restart: Object.freeze({
    checkpoint: "FR-8D",
    kind: "playwright",
    testFile: MEMBERSHIP_RECOVERY_TEST_FILE,
    grep: "preserves committed authority across service restart"
  }),
  "demo-buy-runtime": Object.freeze({
    checkpoint: "FR-8E",
    kind: "playwright",
    testFile: DEMO_BUY_RUNTIME_TEST_FILE,
    grep: "Scanner Demo Buy manual/Auto capture stays generation-bound, keeps running behind Demo Buy, and Stop remains resumable"
  }),
  "demo-buy-outcomes": Object.freeze({
    checkpoint: "FR-8F",
    kind: "playwright",
    testFile: DEMO_BUY_OUTCOME_TEST_FILE,
    grep: "Demo Buy outcome surface renders grouped progressive evidence and isolates provenance failure"
  }),
  "ai-investigation-ui": Object.freeze({
    checkpoint: "FR-8G",
    kind: "playwright",
    testFile: AI_INVESTIGATION_UI_TEST_FILE,
    grep: "AI Investigation uses authoritative refresh, neutral returned-position wording, one Viewer export slot and partial-to-complete regeneration"
  }),
  "ai-pack-safety": Object.freeze({
    checkpoint: "FR-8H",
    kind: "node-test",
    testFiles: Object.freeze([AI_PACK_SERVICE_TEST_FILE]),
    testNamePattern: "AI pack exports immutable evidence with watermark partition, sharing-safe redaction and partial-to-complete regeneration"
  }),
  feature: Object.freeze({
    checkpoint: "FR-8E+FR-8H",
    kind: "composite",
    profiles: FEATURE_PROFILES
  }),
  all: Object.freeze({
    checkpoint: "FR-7+FR-8",
    kind: "composite",
    profiles: Object.freeze([
      "static",
      "moving",
      "membership",
      "provider-recovery",
      "restart",
      ...FEATURE_PROFILES
    ])
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

export function resolveLocalAcceptanceProfile(name) {
  return LOCAL_ACCEPTANCE_PROFILES[name] ?? null;
}

export function sanitizeAcceptanceDiagnostic(value) {
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

function passedResult(result) {
  return result.code === 0 && result.signal === null && result.error === null;
}

async function run(command, args, {
  env = process.env,
  timeoutMs = PLAYWRIGHT_ACCEPTANCE_TIMEOUT_MS
} = {}) {
  return await runBoundedCommand(command, args, {
    env,
    timeoutMs,
    maxOutputChars: MAX_DIAGNOSTIC_CHARS * 2
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

export async function existingDetailReportPaths(detailPath) {
  try {
    await access(detailPath);
    return [path.relative(process.cwd(), detailPath)];
  } catch {
    return [];
  }
}

export async function runCompositeAcceptance(profile, executeChild = runProfile) {
  const subchecks = [];
  const detailReports = [];
  let failed = null;

  for (const childName of profile.profiles) {
    const childProfile = resolveLocalAcceptanceProfile(childName);
    if (!childProfile || childProfile.kind === "composite") {
      throw new Error(`Invalid composite acceptance child: ${childName}`);
    }
    const execution = await executeChild(childProfile, childName);
    const childPassed = passedResult(execution.result);
    subchecks.push({
      profile: childName,
      checkpoint: childProfile.checkpoint,
      status: childPassed ? "PASS" : "FAIL",
      exitCode: execution.result.code,
      signal: execution.result.signal
    });
    detailReports.push(...execution.detailReports);
    if (!childPassed) {
      failed = `${childProfile.checkpoint}:${childName}`;
      break;
    }
  }

  return {
    result: {
      code: failed === null ? 0 : 1,
      signal: null,
      error: failed === null
        ? null
        : `Failed acceptance sub-checkpoint: ${failed}.`,
      output: ""
    },
    summary: {
      runner: "composite",
      subchecks,
      stoppedAt: failed
    },
    detailReports: [...new Set(detailReports)]
  };
}

async function runProfile(profile) {
  if (profile.kind === "composite") {
    return await runCompositeAcceptance(profile);
  }

  if (profile.kind === "playwright") {
    const args = [
      PLAYWRIGHT_CLI,
      "test",
      profile.testFile,
      "--reporter=line"
    ];
    if (profile.grep) args.push("--grep", profile.grep);

    return {
      result: await run(process.execPath, args, {
        timeoutMs: PLAYWRIGHT_ACCEPTANCE_TIMEOUT_MS
      }),
      summary: {
        runner: "playwright",
        testFile: profile.testFile,
        grep: profile.grep
      },
      detailReports: []
    };
  }

  if (profile.kind === "node-test") {
    const args = ["--test"];
    if (profile.testNamePattern) {
      args.push("--test-name-pattern", profile.testNamePattern);
    }
    args.push(...profile.testFiles);

    return {
      result: await run(process.execPath, args, {
        timeoutMs: NODE_TEST_ACCEPTANCE_TIMEOUT_MS
      }),
      summary: {
        runner: "node-test",
        testFiles: profile.testFiles,
        testNamePattern: profile.testNamePattern ?? null
      },
      detailReports: []
    };
  }

  if (profile.kind !== "workload") {
    throw new Error(`Unsupported local acceptance runner kind: ${profile.kind}`);
  }

  const detailPath = path.join(DETAIL_DIR, profile.detailReport);
  await mkdir(DETAIL_DIR, { recursive: true });
  await rm(detailPath, { force: true });
  const env = {
    ...process.env,
    [profile.detailEnv]: detailPath
  };
  const result = await run(
    process.execPath,
    [WORKLOAD_RUNNER, profile.workloadProfile],
    {
      env,
      timeoutMs: WORKLOAD_ACCEPTANCE_TIMEOUT_MS
    }
  );
  const detailReports = await existingDetailReportPaths(detailPath);

  if (passedResult(result) && detailReports.length === 0) {
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

  return {
    result,
    summary: {
      runner: "workload",
      workloadProfile: profile.workloadProfile
    },
    detailReports
  };
}

export async function runLocalAcceptanceCli(profileName = process.argv[2] ?? "all") {
  const profile = resolveLocalAcceptanceProfile(profileName);

  if (!profile) {
    console.error(`Unknown local acceptance profile: ${profileName}`);
    console.error(`Allowed profiles: ${Object.keys(LOCAL_ACCEPTANCE_PROFILES).join(", ")}`);
    process.exitCode = 2;
    return null;
  }

  const startedAt = Date.now();
  const identity = await candidateIdentity();
  const execution = await runProfile(profile);
  const result = execution.result;
  const finishedAt = Date.now();
  const passed = passedResult(result);

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
          message: sanitizeAcceptanceDiagnostic(
            result.error ?? result.output ?? "Local acceptance failed."
          )
        }
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${profileName}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`\nLocal acceptance ${profileName}: ${report.status}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  if (execution.summary.runner === "composite") {
    for (const subcheck of execution.summary.subchecks) {
      console.log(`${subcheck.checkpoint} ${subcheck.profile}: ${subcheck.status}`);
    }
  }
  for (const detailReport of execution.detailReports) {
    console.log(`Detail report: ${detailReport}`);
  }
  if (report.candidateSha) console.log(`Candidate SHA: ${report.candidateSha}`);
  if (report.candidateDirty === true) {
    console.log("Candidate working tree: DIRTY");
  }

  process.exitCode = passed ? 0 : 1;
  return report;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await runLocalAcceptanceCli();
}
