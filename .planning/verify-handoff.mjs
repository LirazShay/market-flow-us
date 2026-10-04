import fs from "node:fs";

const rootStatus = fs.readFileSync("STATUS.yaml", "utf8");
const planningStatus = fs.readFileSync(".planning/STATUS.yaml", "utf8");
const execution = fs.readFileSync(".planning/EXECUTION.yaml", "utf8");
const tree = fs.readFileSync(".planning/TREE.yaml", "utf8");

const phase = rootStatus.match(/^phase: ([a-z_]+)$/m)?.[1];
const planState = planningStatus.match(/^plan_state: ([a-z_]+)$/m)?.[1];
const replanMode = planningStatus.match(/^replan_mode: ([a-z_]+)$/m)?.[1] ?? null;

const ids = [...tree.matchAll(/^  "([^"]+)":$/gm)].map((match) => match[1]);
if (!ids.length || ids[0] !== "0") {
  throw new Error("TREE must contain root node 0");
}

const sections = {};
for (let index = 0; index < ids.length; index += 1) {
  const start = tree.indexOf(`  "${ids[index]}":\n`);
  const end = index + 1 < ids.length
    ? tree.indexOf(`  "${ids[index + 1]}":\n`, start + 1)
    : tree.length;
  sections[ids[index]] = tree.slice(start, end);
}

function parseList(section, field) {
  const match = section.match(new RegExp(`    ${field}: \\\\[([^\\\\]]*)\\\\]`));
  if (!match || !match[1].trim()) return [];
  return match[1].split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
}

const children = Object.fromEntries(ids.map((id) => [id, parseList(sections[id], "children")]));
const leaves = ids.filter((id) => children[id].length === 0);
const leafSet = new Set(leaves);
const dependencies = Object.fromEntries(
  leaves.map((id) => [id, parseList(sections[id], "depends_on")])
);

for (const [id, deps] of Object.entries(dependencies)) {
  for (const dep of deps) {
    if (!leafSet.has(dep)) {
      throw new Error(`TREE dependency ${id} -> ${dep} must reference an implementation leaf`);
    }
  }
}

const unallocated = /^chats: {}$/m.test(execution);

if (unallocated) {
  if (phase === "implementation") {
    throw new Error("Implementation phase requires allocated EXECUTION");
  }
  if (planState === "active" || planState === "frozen") {
    console.log("Execution allocation not created yet", { phase, planState, leaves: leaves.length });
    process.exit(0);
  }
  throw new Error(`Unsupported plan_state with unallocated execution: ${planState}`);
}

const chatMatches = [...execution.matchAll(
  /^  "(\d+)":\n    nodes:\n((?:      "[^"]+": \{ state: [a-z_]+, result: (?:null|"[^"]*") \}\n)+)/gm
)];

if (!chatMatches.length) {
  throw new Error("Allocated EXECUTION contains no parseable chats");
}

const chats = [];
const assigned = [];
const positions = new Map();
let previousChat = 0;

for (const match of chatMatches) {
  const chat = Number(match[1]);
  if (chat !== previousChat + 1) {
    throw new Error(`EXECUTION chat numbers must be contiguous from 1; got ${chat} after ${previousChat}`);
  }
  previousChat = chat;

  const nodes = [...match[2].matchAll(
    /^      "([^"]+)": \{ state: ([a-z_]+), result: (null|"[^"]*") \}$/gm
  )].map((nodeMatch, index) => ({
    id: nodeMatch[1],
    state: nodeMatch[2],
    result: nodeMatch[3],
    index
  }));

  if (!nodes.length) {
    throw new Error(`Chat ${chat} has no nodes`);
  }

  for (const node of nodes) {
    if (!["pending", "in_progress", "done", "blocked"].includes(node.state)) {
      throw new Error(`Invalid state for ${node.id}: ${node.state}`);
    }
    if (positions.has(node.id)) {
      throw new Error(`Implementation leaf assigned more than once: ${node.id}`);
    }
    positions.set(node.id, { chat, index: node.index });
    assigned.push(node.id);
  }

  chats.push({ chat, nodes });
}

const missing = leaves.filter((id) => !positions.has(id));
const extra = assigned.filter((id) => !leafSet.has(id));
if (missing.length || extra.length || assigned.length !== leaves.length) {
  throw new Error(
    `EXECUTION must assign every implementation leaf exactly once; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}]`
  );
}

for (const leaf of leaves) {
  const current = positions.get(leaf);
  for (const dep of dependencies[leaf]) {
    const before = positions.get(dep);
    if (
      !before
      || before.chat > current.chat
      || (before.chat === current.chat && before.index >= current.index)
    ) {
      throw new Error(`Dependency order invalid: ${dep} must precede ${leaf}`);
    }
  }
}

const ordered = chats.flatMap((chat) =>
  chat.nodes.map((node) => ({ ...node, chat: chat.chat }))
);

let seenNonDone = false;
for (const node of ordered) {
  if (node.state === "done") {
    if (seenNonDone) {
      throw new Error(`Execution done-state is not a serial prefix; later node already done: ${node.id}`);
    }
  } else {
    seenNonDone = true;
  }
}

const inProgress = ordered.filter((node) => node.state === "in_progress");
if (inProgress.length > 1) {
  throw new Error(`Only one execution node may be in_progress; found ${inProgress.map((n) => n.id).join(", ")}`);
}

const states = new Map(ordered.map((node) => [node.id, node.state]));
for (const node of ordered) {
  if (node.state === "done" || node.state === "in_progress") {
    const blockers = dependencies[node.id].filter((dep) => states.get(dep) !== "done");
    if (blockers.length) {
      throw new Error(`${node.state} node ${node.id} has unfinished dependencies: ${blockers.join(", ")}`);
    }
  }
}

if (planState === "active") {
  if (replanMode !== "execution_reopen") {
    throw new Error("Allocated EXECUTION with active plan requires replan_mode: execution_reopen");
  }
  if (phase !== "planning") {
    throw new Error("execution_reopen requires root phase: planning");
  }
  if (inProgress.length) {
    throw new Error("execution_reopen cannot retain in_progress execution");
  }
  if (!ordered.some((node) => node.state === "blocked")) {
    throw new Error("execution_reopen requires at least one blocked node");
  }
  console.log("Execution allocation verified during planning reopen", {
    chats: chats.length,
    leaves: leaves.length
  });
  process.exit(0);
}

if (planState !== "frozen") {
  throw new Error(`Allocated EXECUTION requires frozen plan or execution_reopen; got ${planState}`);
}

if (phase !== "implementation") {
  console.log("Frozen execution allocation verified before implementation authorization", {
    chats: chats.length,
    leaves: leaves.length
  });
  process.exit(0);
}

const firstOpen = ordered.find((node) => node.state !== "done");
if (!firstOpen) {
  throw new Error("All execution nodes are done; root phase must advance from implementation");
}
if (firstOpen.state === "blocked") {
  throw new Error("Blocked current node requires reopening planning");
}

const pointer = rootStatus.match(/current:\n  chat: (\d+)\n  node: "([^"]+)"/);
if (!pointer) {
  throw new Error("Implementation STATUS must point to current chat and node");
}

const currentChat = Number(pointer[1]);
const currentNode = pointer[2];

if (currentChat !== firstOpen.chat || currentNode !== firstOpen.id) {
  throw new Error(
    `STATUS pointer mismatch: expected Chat ${firstOpen.chat} / ${firstOpen.id}, got Chat ${currentChat} / ${currentNode}`
  );
}

if (inProgress.length === 1 && inProgress[0].id !== firstOpen.id) {
  throw new Error(`Only the current node may be in_progress; got ${inProgress[0].id}`);
}

console.log("Implementation handoff verified", {
  chats: chats.length,
  leaves: leaves.length,
  currentChat,
  currentNode
});
