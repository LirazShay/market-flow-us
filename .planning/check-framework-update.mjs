import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const installPath = path.join(here, "ST_PLANNER_INSTALL.json");
const releaseUrl = "https://raw.githubusercontent.com/LirazShay/st-planner/main/FRAMEWORK_RELEASE.json";

function emit(kind, message) {
  const text = String(message).replace(/\r?\n/g, " ");
  if (process.env.GITHUB_ACTIONS === "true") {
    const annotation = kind === "error" ? "error" : kind === "warning" ? "warning" : "notice";
    console.log(`::${annotation} title=S&T Planner framework::${text}`);
  }
  const writer = kind === "error" ? console.error : kind === "warning" ? console.warn : console.log;
  writer(message);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function main() {
  let installed;
  try {
    installed = await readJson(installPath);
  } catch (error) {
    emit("error", `Cannot read ${path.relative(process.cwd(), installPath)}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let response;
  try {
    response = await fetch(releaseUrl, {
      headers: { "user-agent": "st-planner-update-check" },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    emit("notice", `S&T Planner update check unavailable (${error.message}). Installed version: ${installed.framework_version ?? "unknown"}.`);
    return;
  }

  if (!response.ok) {
    emit("notice", `S&T Planner update check unavailable (HTTP ${response.status}). Installed version: ${installed.framework_version ?? "unknown"}.`);
    return;
  }

  const latest = await response.json();
  const installedVersion = installed.framework_version ?? "unknown";
  const latestVersion = latest.version ?? "unknown";

  if (installedVersion === latestVersion) {
    console.log(`S&T Planner framework is current (${installedVersion}).`);
    return;
  }

  const required = latest.update_policy === "required";
  const message = [
    `S&T Planner framework update available: installed ${installedVersion}, latest ${latestVersion}.`,
    latest.summary ? `Latest: ${latest.summary}` : null,
    required ? "This release is marked REQUIRED before further S&T planning/execution." : "This release is recommended.",
    latest.upgrade_command ?? "Ask the repository agent to update S&T Planner from LirazShay/st-planner."
  ].filter(Boolean).join(" ");

  emit(required ? "warning" : "notice", message);

  if (required && process.env.GITHUB_ACTIONS === "true") {
    process.exitCode = 2;
  }
}

await main();
