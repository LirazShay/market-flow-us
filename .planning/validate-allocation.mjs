#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VALID_STATES = new Set(["pending", "in_progress", "done", "blocked"]);

function cleanScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseIdLine(line, indent) {
  const prefix = " ".repeat(indent);
  if (!line.startsWith(prefix) || line.startsWith(prefix + " ")) return null;
  const rest = line.slice(indent);
  const match = rest.match(/^["']([^"']+)["']:\s*$/);
  return match ? match[1] : null;
}

function parseInlineList(rest, index, field) {
  const trimmed = rest.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(
      `TREE.yaml unsupported inline value for ${field} at line ${index + 1}; use YAML list items or [..]`,
    );
  }

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((value) => cleanScalar(value));
}

export function parseTreeYaml(text) {
  const lines = text.split(/\r?\n/);
  const nodes = new Map();
  let inNodes = false;
  let current = null;
  let listField = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (raw === "nodes:") {
      inNodes = true;
      current = null;
      listField = null;
      continue;
    }

    if (!inNodes) continue;

    const nodeId = parseIdLine(raw, 2);
    if (nodeId !== null) {
      if (nodes.has(nodeId)) {
        throw new Error(`TREE.yaml duplicate node key "${nodeId}" at line ${index + 1}`);
      }
      current = {
        id: nodeId,
        status: null,
        children: [],
        dependsOn: [],
      };
      nodes.set(nodeId, current);
      listField = null;
      continue;
    }

    if (!current) continue;

    if (raw.startsWith("    status:")) {
      current.status = cleanScalar(raw.slice(raw.indexOf(":") + 1));
      listField = null;
      continue;
    }

    const listMatch = raw.match(/^    (children|depends_on):\s*(.*)$/);
    if (listMatch) {
      const [, field, rest] = listMatch;
      const inline = parseInlineList(rest, index, field);
      if (inline !== null) {
        if (field === "children") current.children = inline;
        else current.dependsOn = inline;
        listField = null;
      } else {
        listField = field;
      }
      continue;
    }

    const itemMatch = raw.match(/^      -\s+(.+)$/);
    if (itemMatch && listField) {
      const value = cleanScalar(itemMatch[1]);
      if (listField === "children") current.children.push(value);
      else current.dependsOn.push(value);
      continue;
    }

    if (!raw.startsWith("      ")) listField = null;
  }

  if (!inNodes) throw new Error("TREE.yaml is missing top-level nodes:");
  if (nodes.size === 0) throw new Error("TREE.yaml contains no nodes");

  return nodes;
}

export function parseExecutionYaml(text) {
  const lines = text.split(/\r?\n/);
  const chats = new Map();
  let inChats = false;
  let currentChat = null;
  let inChatNodes = false;
  let currentNode = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (raw === "chats: {}") {
      return chats;
    }

    if (raw === "chats:") {
      inChats = true;
      currentChat = null;
      inChatNodes = false;
      currentNode = null;
      continue;
    }

    if (!inChats) continue;

    const chatId = parseIdLine(raw, 2);
    if (chatId !== null) {
      if (chats.has(chatId)) {
        throw new Error(`EXECUTION.yaml duplicate chat key "${chatId}" at line ${index + 1}`);
      }
      currentChat = { id: chatId, nodes: new Map(), order: [] };
      chats.set(chatId, currentChat);
      inChatNodes = false;
      currentNode = null;
      continue;
    }

    if (!currentChat) continue;

    if (raw === "    nodes:") {
      inChatNodes = true;
      currentNode = null;
      continue;
    }

    if (!inChatNodes) continue;

    const inlineNode = raw.match(
      /^      ["']([^"']+)["']:\s*\{\s*state:\s*([^,}]+),\s*result:\s*(.+)\s*\}\s*$/,
    );
    if (inlineNode) {
      const [, nodeId, stateValue, resultValue] = inlineNode;
      if (currentChat.nodes.has(nodeId)) {
        throw new Error(
          `EXECUTION.yaml duplicate node key "${nodeId}" inside chat "${currentChat.id}" at line ${index + 1}`,
        );
      }
      const node = {
        id: nodeId,
        state: cleanScalar(stateValue),
        result: cleanScalar(resultValue),
      };
      currentChat.nodes.set(nodeId, node);
      currentChat.order.push(nodeId);
      currentNode = null;
      continue;
    }

    const nodeId = parseIdLine(raw, 6);
    if (nodeId !== null) {
      if (currentChat.nodes.has(nodeId)) {
        throw new Error(
          `EXECUTION.yaml duplicate node key "${nodeId}" inside chat "${currentChat.id}" at line ${index + 1}`,
        );
      }
      currentNode = { id: nodeId, state: null, result: undefined };
      currentChat.nodes.set(nodeId, currentNode);
      currentChat.order.push(nodeId);
      continue;
    }

    if (!currentNode) continue;

    if (raw.startsWith("        state:")) {
      currentNode.state = cleanScalar(raw.slice(raw.indexOf(":") + 1));
      continue;
    }

    if (raw.startsWith("        result:")) {
      currentNode.result = cleanScalar(raw.slice(raw.indexOf(":") + 1));
      continue;
    }
  }

  if (!inChats) throw new Error("EXECUTION.yaml is missing top-level chats:");
  return chats;
}

function nodePositionMap(chats) {
  const positions = new Map();
  for (const [chatId, chat] of chats) {
    chat.order.forEach((nodeId, index) => {
      positions.set(nodeId, { chatId, index });
    });
  }
  return positions;
}

function numericChatIds(chats, errors) {
  const ids = [];
  for (const chatId of chats.keys()) {
    if (!/^[1-9]\d*$/.test(chatId)) {
      errors.push(`chat id "${chatId}" must be a positive integer string`);
      continue;
    }
    ids.push(Number(chatId));
  }
  return ids;
}

export function validateAllocation(treeText, executionText, options = {}) {
  const phase = options.phase ?? "initial";
  const serialChats = options.serialChats ?? false;

  if (!["initial", "resume"].includes(phase)) {
    throw new Error(`Unsupported phase "${phase}"; expected initial or resume`);
  }

  const tree = parseTreeYaml(treeText);
  const chats = parseExecutionYaml(executionText);
  const errors = [];

  const expectedLeaves = new Set();
  for (const node of tree.values()) {
    if (node.status === "approved" && node.children.length === 0) {
      expectedLeaves.add(node.id);
    }
  }

  if (expectedLeaves.size === 0) {
    errors.push("TREE.yaml has no approved implementation-ready leaves");
  }

  const assignedCounts = new Map();
  const positions = nodePositionMap(chats);
  const chatNumbers = numericChatIds(chats, errors);

  for (const [chatId, chat] of chats) {
    if (chat.nodes.size === 0) {
      errors.push(`chat "${chatId}" has no assigned nodes`);
    }

    for (const node of chat.nodes.values()) {
      assignedCounts.set(node.id, (assignedCounts.get(node.id) ?? 0) + 1);

      const planned = tree.get(node.id);
      if (!planned) {
        errors.push(`assigned node "${node.id}" does not exist in TREE.yaml`);
      } else {
        if (planned.children.length !== 0) {
          errors.push(`assigned node "${node.id}" is not a leaf`);
        }
        if (planned.status !== "approved") {
          errors.push(
            `assigned node "${node.id}" is not approved (status: ${planned.status ?? "missing"})`,
          );
        }
      }

      if (!VALID_STATES.has(node.state)) {
        errors.push(
          `assigned node "${node.id}" has invalid execution state "${node.state ?? "missing"}"`,
        );
      }

      if (node.result === undefined) {
        errors.push(`assigned node "${node.id}" is missing result`);
      }

      if (phase === "initial") {
        if (node.state !== "pending") {
          errors.push(
            `initial allocation node "${node.id}" must be pending, found "${node.state ?? "missing"}"`,
          );
        }
        if (node.result !== null) {
          errors.push(`initial allocation node "${node.id}" must have result: null`);
        }
      } else {
        if ((node.state === "pending" || node.state === "in_progress") && node.result !== null) {
          errors.push(`node "${node.id}" in state ${node.state} must have result: null`);
        }
        if ((node.state === "done" || node.state === "blocked") && !node.result) {
          errors.push(`node "${node.id}" in state ${node.state} must have a short result`);
        }
      }
    }
  }

  for (const leafId of expectedLeaves) {
    const count = assignedCounts.get(leafId) ?? 0;
    if (count === 0) errors.push(`implementation-ready leaf "${leafId}" is not assigned`);
    if (count > 1) errors.push(`implementation-ready leaf "${leafId}" is assigned ${count} times`);
  }

  for (const [nodeId, count] of assignedCounts) {
    if (count > 1 && !expectedLeaves.has(nodeId)) {
      errors.push(`assigned node "${nodeId}" appears ${count} times`);
    }
  }

  for (const leafId of expectedLeaves) {
    const node = tree.get(leafId);
    for (const dependencyId of node.dependsOn) {
      if (!expectedLeaves.has(dependencyId)) {
        errors.push(
          `leaf "${leafId}" depends_on "${dependencyId}", which is not an approved implementation-ready leaf`,
        );
        continue;
      }
      if (!positions.has(dependencyId)) {
        errors.push(`dependency "${dependencyId}" for leaf "${leafId}" is not assigned`);
      }
    }
  }

  if (serialChats) {
    const sorted = [...chatNumbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i += 1) {
      const expected = i + 1;
      if (sorted[i] !== expected) {
        errors.push(
          `serial chat numbering must be contiguous from 1; expected ${expected}, found ${sorted[i]}`,
        );
        break;
      }
    }

    for (const leafId of expectedLeaves) {
      const leafPos = positions.get(leafId);
      if (!leafPos) continue;
      const leaf = tree.get(leafId);

      for (const dependencyId of leaf.dependsOn) {
        const depPos = positions.get(dependencyId);
        if (!depPos) continue;

        const leafChat = Number(leafPos.chatId);
        const depChat = Number(depPos.chatId);
        if (!Number.isInteger(leafChat) || !Number.isInteger(depChat)) continue;

        const dependencyIsEarlier =
          depChat < leafChat || (depChat === leafChat && depPos.index < leafPos.index);

        if (!dependencyIsEarlier) {
          errors.push(
            `serial allocation requires dependency "${dependencyId}" before "${leafId}" (earlier chat or earlier in the same chat)`,
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      treeNodes: tree.size,
      implementationReadyLeaves: expectedLeaves.size,
      chats: chats.size,
      assignedNodes: [...assignedCounts.values()].reduce((sum, count) => sum + count, 0),
      phase,
      serialChats,
    },
  };
}

function parseArgs(argv) {
  const args = [...argv];
  let phase = "initial";
  let serialChats = false;
  const files = [];

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--resume") {
      phase = "resume";
    } else if (arg === "--initial") {
      phase = "initial";
    } else if (arg === "--serial-chats") {
      serialChats = true;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      files.push(arg);
    }
  }

  if (files.length > 2) {
    throw new Error("Expected at most TREE.yaml and EXECUTION.yaml paths");
  }

  return {
    help: false,
    phase,
    serialChats,
    treePath: files[0] ?? path.join(".planning", "TREE.yaml"),
    executionPath: files[1] ?? path.join(".planning", "EXECUTION.yaml"),
  };
}

function usage() {
  return [
    "Usage:",
    "  node .planning/validate-allocation.mjs [--initial|--resume] [--serial-chats] [TREE.yaml] [EXECUTION.yaml]",
    "",
    "Modes:",
    "  --initial       Pre-first-authorization validation (default): every node must be pending with result: null.",
    "  --resume        Re-authorization validation after replanning: done/blocked results are allowed and checked.",
    "  --serial-chats  Also require chat IDs 1..N and every dependency to be in an earlier chat or earlier in the same chat.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const treeText = fs.readFileSync(args.treePath, "utf8");
  const executionText = fs.readFileSync(args.executionPath, "utf8");
  const result = validateAllocation(treeText, executionText, {
    phase: args.phase,
    serialChats: args.serialChats,
  });

  if (!result.ok) {
    console.error("S&T allocation validation FAILED");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `S&T allocation validation passed: ${result.stats.implementationReadyLeaves} leaves, ${result.stats.chats} chats, phase=${result.stats.phase}, serialChats=${result.stats.serialChats}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`S&T allocation validation ERROR: ${error.message}`);
    process.exitCode = 2;
  });
}
