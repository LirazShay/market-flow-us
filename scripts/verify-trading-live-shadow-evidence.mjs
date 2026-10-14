import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readCleanCheckoutCommit } from "./clean-checkout-commit.mjs";
import { validateTradingLiveShadowEvidence } from "./trading-live-shadow-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPORT_PATH = "tmp/trading-live-shadow-evidence.json";
const MAX_REPORT_BYTES = 64 * 1024;

export function parseEvidenceArgs(argv) {
  const config = {
    reportPath: DEFAULT_REPORT_PATH,
    expectedCommit: null,
    help: false
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      config.help = true;
    } else if (arg.startsWith("--report=")) {
      config.reportPath = arg.slice("--report=".length).trim();
    } else if (arg.startsWith("--expected-commit=")) {
      config.expectedCommit = arg.slice("--expected-commit=".length).trim().toLowerCase();
    } else {
      throw new TypeError(`Unknown argument: ${arg}`);
    }
  }

  if (!config.help && !config.reportPath) {
    throw new TypeError("--report must not be empty");
  }
  return Object.freeze(config);
}

function usage() {
  return [
    "Usage: npm run trading-live-shadow:verify -- [options]",
    "",
    `  --report=${DEFAULT_REPORT_PATH}`,
    "  --expected-commit=<7-40 hex Git commit>",
    "",
    "Without --expected-commit, verification requires a clean checkout and binds the report to its exact HEAD.",
    "A PASS verifies only the live-market SHADOW evidence contract; it never enables synthetic, DRY_RUN or LIVE."
  ].join("\n");
}

function boundedErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,128}$/u.test(error.code)
    ? error.code
    : "LIVE_SHADOW_EVIDENCE_VERIFY_FAILED";
}

async function readReport(reportPath) {
  let text;
  try {
    text = await readFile(reportPath, "utf8");
  } catch {
    const error = new Error("LIVE_SHADOW_EVIDENCE_REPORT_UNREADABLE");
    error.code = "LIVE_SHADOW_EVIDENCE_REPORT_UNREADABLE";
    throw error;
  }
  if (Buffer.byteLength(text, "utf8") > MAX_REPORT_BYTES) {
    const error = new Error("LIVE_SHADOW_EVIDENCE_REPORT_TOO_LARGE");
    error.code = "LIVE_SHADOW_EVIDENCE_REPORT_TOO_LARGE";
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("LIVE_SHADOW_EVIDENCE_JSON_INVALID");
    error.code = "LIVE_SHADOW_EVIDENCE_JSON_INVALID";
    throw error;
  }
}

export async function verifyTradingLiveShadowEvidence({
  reportPath,
  expectedCommit = null,
  root = ROOT
}) {
  const resolvedCommit = expectedCommit ?? await readCleanCheckoutCommit({ root });
  const report = await readReport(path.resolve(root, reportPath));
  return validateTradingLiveShadowEvidence(report, { expectedCommit: resolvedCommit });
}

async function main(argv) {
  const config = parseEvidenceArgs(argv);
  if (config.help) {
    console.log(usage());
    return;
  }
  const result = await verifyTradingLiveShadowEvidence(config);
  console.log(JSON.stringify(result, null, 2));
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.log(JSON.stringify({
      schemaVersion: 1,
      check: "LIVE_MARKET_SHADOW_EVIDENCE_VERIFY",
      status: "ERROR",
      reasonCode: boundedErrorCode(error),
      nextStageEnabled: false
    }, null, 2));
    process.exitCode = 1;
  }
}
