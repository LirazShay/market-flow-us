import { readFile } from "node:fs/promises";

const EXECUTION_PATH = ".planning/EXECUTION.md";
const STATUS_PATH = "STATUS.yaml";
const VALID_STATUSES = new Set(["pending", "in_progress", "done", "blocked"]);
const VALID_CURRENT_STATUSES = new Set(["pending", "in_progress", "blocked"]);

function fail(message) {
  throw new Error(`STATUS projection validation failed: ${message}`);
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/u.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  return value;
}

function parseDirectSection(yaml, sectionName) {
  const lines = yaml.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `${sectionName}:`);
  if (start < 0) fail(`missing ${sectionName}: section in ${STATUS_PATH}`);

  const result = {};
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    if (!line.startsWith("  ")) break;
    if (line.startsWith("    ")) continue;

    const match = line.match(/^  ([A-Za-z0-9_]+):(?:\s+(.*))?$/u);
    if (!match) continue;
    result[match[1]] = parseScalar(match[2] ?? "");
  }
  return result;
}

function parseExecutionRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) continue;

    const taskMatch = cells[0].match(/^`([^`]+)`$/u);
    const statusMatch = cells[2].match(/^`([^`]+)`$/u);
    if (!taskMatch || !statusMatch || !VALID_STATUSES.has(statusMatch[1])) continue;

    rows.push({
      task: taskMatch[1],
      owner: cells[1],
      status: statusMatch[1],
      dependsOn: cells[3]
    });
  }
  return rows;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const [executionText, statusText] = await Promise.all([
  readFile(EXECUTION_PATH, "utf8"),
  readFile(STATUS_PATH, "utf8")
]);

const rows = parseExecutionRows(executionText);
if (rows.length === 0) fail(`no execution rows found in ${EXECUTION_PATH}`);

const current = parseDirectSection(statusText, "current");
const projection = parseDirectSection(statusText, "execution_projection");
const nextPointer = parseDirectSection(statusText, "next_pointer");

const counts = {
  done: rows.filter((row) => row.status === "done").length,
  pending: rows.filter((row) => row.status === "pending").length,
  in_progress: rows.filter((row) => row.status === "in_progress").length,
  blocked: rows.filter((row) => row.status === "blocked").length
};

assertEqual(projection.active_execution_rows, rows.length, "execution_projection.active_execution_rows");
for (const [status, count] of Object.entries(counts)) {
  assertEqual(projection[status], count, `execution_projection.${status}`);
}

if (typeof current.node !== "string" || current.node.length === 0) {
  fail("current.node must identify an execution task");
}
const currentRow = rows.find((row) => row.task === current.node);
if (!currentRow) fail(`current.node ${JSON.stringify(current.node)} has no execution row`);
if (!VALID_CURRENT_STATUSES.has(currentRow.status)) {
  fail(`current.node ${current.node} must be pending, in_progress or blocked, got ${currentRow.status}`);
}

assertEqual(current.status, currentRow.status, "current.status");
assertEqual(projection.current_node, currentRow.task, "execution_projection.current_node");
assertEqual(nextPointer.task, currentRow.task, "next_pointer.task");
assertEqual(nextPointer.owner, currentRow.owner, "next_pointer.owner");
assertEqual(nextPointer.status, currentRow.status, "next_pointer.status");

if (currentRow.status === "in_progress") {
  assertEqual(current.chat, currentRow.owner, "current.chat");
  assertEqual(current.activation_required, false, "current.activation_required");
  assertEqual(projection.current_chat, currentRow.owner, "execution_projection.current_chat");
} else if (currentRow.status === "pending") {
  assertEqual(current.chat, null, "current.chat");
  assertEqual(current.activation_required, true, "current.activation_required");
  assertEqual(projection.current_chat, null, "execution_projection.current_chat");
} else {
  assertEqual(current.chat, null, "current.chat");
  assertEqual(current.activation_required, false, "current.activation_required");
  assertEqual(projection.current_chat, null, "execution_projection.current_chat");
}

console.log("STATUS projection matches authoritative EXECUTION.md", {
  currentTask: currentRow.task,
  currentOwner: currentRow.owner,
  currentStatus: currentRow.status,
  counts
});
