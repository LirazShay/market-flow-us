import fs from "node:fs";
import path from "node:path";

const workflowsDir = ".github/workflows";
const workflowNames = fs.readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));

const stalePins = [
  /actions\/checkout@v4\b/,
  /actions\/setup-node@v4\b/,
  /actions\/cache@v4\b/,
  /actions\/upload-artifact@v4\b/
];

const stale = [];
for (const name of workflowNames) {
  const file = path.join(workflowsDir, name);
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of stalePins) {
    if (pattern.test(text)) stale.push(`${file}: ${pattern}`);
  }
}

if (stale.length) {
  throw new Error(`Deprecated Node-20 GitHub Action pins remain:\n${stale.join("\n")}`);
}

const planningWorkflow = fs.readFileSync(
  path.join(workflowsDir, "planning-docs-ci.yml"),
  "utf8"
);

if (/require_text[^\n]*EXECUTOR_HANDOFF\.md/.test(planningWorkflow)) {
  throw new Error(
    "Planning CI must not derive live execution truth from EXECUTOR_HANDOFF.md; use TREE/EXECUTION/STATUS authority instead"
  );
}

const handoff = fs.readFileSync(".planning/EXECUTOR_HANDOFF.md", "utf8");
if (/^## Current serial allocation$/m.test(handoff)) {
  throw new Error(
    "EXECUTOR_HANDOFF.md must remain bootstrap/routing guidance, not a duplicate live allocation registry"
  );
}

console.log("CI hygiene verified", {
  workflows: workflowNames.length,
  authority: "TREE + EXECUTION + planning STATUS",
  handoff: "bootstrap/routing only"
});
