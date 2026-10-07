import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkerPath = fileURLToPath(import.meta.url);
const here = path.dirname(checkerPath);
const repoRoot = path.resolve(here, "..");
const installPath = path.join(here, "ST_PLANNER_INSTALL.json");
const releaseUrl = process.env.ST_PLANNER_RELEASE_URL
  ?? "https://raw.githubusercontent.com/LirazShay/st-planner/main/FRAMEWORK_RELEASE.json";

function emit(kind, message) {
  const text = String(message).replace(/\r?\n/g, " ");
  if (process.env.GITHUB_ACTIONS === "true") {
    const annotation = kind === "error" ? "error" : kind === "warning" ? "warning" : "notice";
    console.log(`::${annotation} title=S&T Planner framework::${text}`);
  }
  const writer = kind === "error" ? console.error : kind === "warning" ? console.warn : console.log;
  writer(message);
}

function canonicalTextBytes(buffer) {
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
}

function gitBlobSha(buffer) {
  const canonical = canonicalTextBytes(buffer);
  const header = Buffer.from(`blob ${canonical.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(canonical).digest("hex");
}

function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value));
}

function isIntegrityMap(value) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length > 0
    && Object.entries(value).every(([relative, digest]) => relative.startsWith(".planning/") && !relative.split("/").includes("..") && isSha(digest));
}

function compareSemver(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((value) => !Number.isInteger(value) || value < 0)) {
    return null;
  }
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function stableObject(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))));
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function verifyManagedIntegrity(installed) {
  const managed = installed.managed_integrity;
  if (!isIntegrityMap(managed)) {
    emit("error", "Installed S&T Planner provenance lacks valid framework-managed integrity metadata. Run an explicit framework upgrade before S&T work.");
    return false;
  }

  for (const [relative, expected] of Object.entries(managed)) {
    if (relative === ".planning/ST_PLANNER_INSTALL.json") {
      emit("error", "Install metadata cannot classify itself as framework-managed integrity content. Repair/upgrade before S&T work.");
      return false;
    }

    let bytes;
    try {
      bytes = await fs.readFile(path.join(repoRoot, relative));
    } catch (error) {
      emit("error", `Installed framework-managed file is missing/unreadable: ${relative} (${error.message}). Repair/upgrade before S&T work.`);
      return false;
    }

    const actual = gitBlobSha(bytes);
    if (actual !== expected) {
      emit("error", `Installed framework-managed file drifted from its recorded release: ${relative}. Repair/upgrade before S&T work.`);
      return false;
    }
  }

  if (!managed[".planning/check-framework-update.mjs"]) {
    emit("error", "Installed managed-integrity metadata does not include the framework update checker. Repair/upgrade before S&T work.");
    return false;
  }

  return true;
}

async function verifyCriticalIntegrity(installed) {
  const integrity = installed.critical_integrity;
  if (!integrity?.checker_git_blob_sha || !integrity?.agents_rules_git_blob_sha) {
    emit("error", "Installed S&T Planner provenance lacks critical freshness-path integrity metadata. Run an explicit framework upgrade before S&T work.");
    return false;
  }

  if (integrity.checker_git_blob_sha !== installed.managed_integrity?.[".planning/check-framework-update.mjs"]) {
    emit("error", "Installed S&T Planner provenance disagrees about the update checker's expected bytes. Repair/upgrade before S&T work.");
    return false;
  }

  const begin = integrity.agents_rules_begin_marker;
  const end = integrity.agents_rules_end_marker;
  if (!begin || !end) {
    emit("error", "Installed S&T Planner provenance lacks bounded AGENTS rules markers. Run an explicit framework upgrade before S&T work.");
    return false;
  }

  let agents;
  try {
    agents = await fs.readFile(path.join(repoRoot, "AGENTS.md"), "utf8");
  } catch (error) {
    emit("error", `Cannot read AGENTS.md for S&T freshness-path integrity: ${error.message}`);
    return false;
  }

  const start = agents.indexOf(begin);
  const endIndex = start === -1 ? -1 : agents.indexOf(end, start + begin.length);
  const uniqueStart = start !== -1 && agents.indexOf(begin, start + begin.length) === -1;
  const uniqueEnd = endIndex !== -1 && agents.indexOf(end) === endIndex && agents.indexOf(end, endIndex + end.length) === -1;
  if (!uniqueStart || !uniqueEnd) {
    emit("error", "The bounded S&T Planner rules block in AGENTS.md is missing, duplicated, or malformed. Repair/upgrade it before S&T work.");
    return false;
  }

  let blockEnd = endIndex + end.length;
  if (agents.slice(blockEnd, blockEnd + 2) === "\r\n") blockEnd += 2;
  else if (agents[blockEnd] === "\n") blockEnd += 1;
  const block = Buffer.from(agents.slice(start, blockEnd), "utf8");
  const agentsActual = gitBlobSha(block);
  if (agentsActual !== integrity.agents_rules_git_blob_sha) {
    emit("error", "The S&T Planner rules block in AGENTS.md differs from its recorded framework release. Keep target-native rules outside the bounded framework block and repair/upgrade before S&T work.");
    return false;
  }

  return true;
}

function validateSourceRelease(latest) {
  if (compareSemver(latest?.version, latest?.version) === null) return "invalid version";
  if (!["recommended", "required"].includes(latest?.update_policy)) return "invalid update_policy";
  if (!isIntegrityMap(latest?.managed_integrity)) return "missing/invalid managed_integrity";
  if (!isSha(latest?.critical_integrity?.checker_git_blob_sha) || !isSha(latest?.critical_integrity?.agents_rules_git_blob_sha)) {
    return "missing/invalid critical_integrity";
  }
  if (latest.critical_integrity.checker_git_blob_sha !== latest.managed_integrity[".planning/check-framework-update.mjs"]) {
    return "inconsistent checker integrity";
  }
  return null;
}

async function fetchLatestRelease() {
  const response = await fetch(releaseUrl, {
    headers: { "user-agent": "st-planner-update-check" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function main() {
  let installed;
  try {
    installed = await readJson(installPath);
  } catch (error) {
    emit("error", `Cannot read ${path.relative(process.cwd(), installPath)}: ${error.message}`);
    process.exitCode = 3;
    return;
  }

  try {
    if (!(await verifyManagedIntegrity(installed)) || !(await verifyCriticalIntegrity(installed))) {
      process.exitCode = 3;
      return;
    }
  } catch (error) {
    emit("error", `Cannot verify installed S&T Planner integrity: ${error.message}`);
    process.exitCode = 3;
    return;
  }

  let latest;
  try {
    latest = await fetchLatestRelease();
  } catch (error) {
    emit("notice", `S&T Planner freshness could not be verified (${error.message}). Installed version: ${installed.framework_version ?? "unknown"}. Local framework integrity passed; do not claim the framework is current.`);
    return;
  }

  const sourceProblem = validateSourceRelease(latest);
  if (sourceProblem) {
    emit("error", `S&T Planner source release manifest is malformed (${sourceProblem}). Freshness cannot be trusted; reconcile with LirazShay/st-planner before further S&T work.`);
    process.exitCode = 3;
    return;
  }

  const installedVersion = installed.framework_version ?? "unknown";
  const latestVersion = latest.version;
  const relation = compareSemver(installedVersion, latestVersion);
  if (relation === null) {
    emit("error", `Invalid installed S&T Planner version metadata: ${installedVersion}.`);
    process.exitCode = 3;
    return;
  }

  const sameManagedRelease = stableObject(latest.managed_integrity) === stableObject(installed.managed_integrity);
  const latestCritical = latest.critical_integrity;
  const installedCritical = installed.critical_integrity ?? {};
  const sameCriticalRelease = latestCritical.checker_git_blob_sha === installedCritical.checker_git_blob_sha
    && latestCritical.agents_rules_git_blob_sha === installedCritical.agents_rules_git_blob_sha;

  if (relation === 0 && sameManagedRelease && sameCriticalRelease) {
    console.log(`S&T Planner framework is current (${installedVersion}); installed framework integrity passed.`);
    return;
  }

  if (relation > 0) {
    emit("warning", `Installed S&T Planner ${installedVersion} is newer than source release ${latestVersion}. Freshness is ambiguous; reconcile the installation with LirazShay/st-planner before further S&T planning/execution.`);
    process.exitCode = 2;
    return;
  }

  const required = latest.update_policy === "required" || relation === 0;
  const reason = relation === 0
    ? "The source release content changed without a version change; treat this as a required framework repair."
    : required
      ? "This release is marked REQUIRED before further S&T planning/execution."
      : "This release is recommended.";
  const message = [
    `S&T Planner framework update available: installed ${installedVersion}, latest ${latestVersion}.`,
    latest.summary ? `Latest: ${latest.summary}` : null,
    reason,
    latest.upgrade_command ?? "Ask the repository agent to update S&T Planner from LirazShay/st-planner before continuing.",
  ].filter(Boolean).join(" ");

  emit(required ? "warning" : "notice", message);
  if (required) process.exitCode = 2;
}

await main();
