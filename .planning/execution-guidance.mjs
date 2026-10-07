#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseExecutionYaml,
  parseTreeYaml,
  validateAllocation,
} from "./validate-allocation.mjs";

function stateMap(chats) {
  const states = new Map();
  for (const chat of chats.values()) {
    for (const node of chat.nodes.values()) states.set(node.id, node.state);
  }
  return states;
}

export function deriveExecutionAvailability(treeText, executionText) {
  const validation = validateAllocation(treeText, executionText, { phase: "resume" });
  if (!validation.ok) {
    return {
      safe: false,
      complete: false,
      runnableNodes: [],
      runnableChatIds: [],
      blockers: [...validation.errors],
    };
  }

  const tree = parseTreeYaml(treeText);
  const chats = parseExecutionYaml(executionText);
  const states = stateMap(chats);
  const authorityBlockers = [];
  const runnableNodes = [];
  const blockedNodes = [];

  for (const [chatId, chat] of chats) {
    for (const nodeId of chat.order) {
      const executionNode = chat.nodes.get(nodeId);
      const plannedNode = tree.get(nodeId);
      if (!executionNode || !plannedNode) continue;

      const unfinishedDependencies = plannedNode.dependsOn.filter(
        (dependencyId) => states.get(dependencyId) !== "done",
      );

      if (
        (executionNode.state === "in_progress" || executionNode.state === "done") &&
        unfinishedDependencies.length > 0
      ) {
        authorityBlockers.push(
          `${executionNode.state} node "${nodeId}" in Chat ${chatId} has unfinished dependencies: ${unfinishedDependencies.join(", ")}`,
        );
      }

      if (executionNode.state === "done") continue;
      if (executionNode.state === "blocked") {
        blockedNodes.push({ chatId, nodeId });
        continue;
      }

      if (unfinishedDependencies.length === 0) {
        runnableNodes.push({
          chatId,
          nodeId,
          state: executionNode.state,
        });
      }
    }
  }

  if (authorityBlockers.length > 0) {
    return {
      safe: false,
      complete: false,
      runnableNodes: [],
      runnableChatIds: [],
      blockedNodes,
      blockers: authorityBlockers,
    };
  }

  const runnableChatIds = [...new Set(runnableNodes.map((node) => node.chatId))];
  const assignedNodes = [...chats.values()].flatMap((chat) => [...chat.nodes.values()]);
  const complete = assignedNodes.length > 0 && assignedNodes.every((node) => node.state === "done");

  return {
    safe: true,
    complete,
    runnableNodes,
    runnableChatIds,
    blockedNodes,
    blockers: [],
  };
}

/**
 * Compare a target-owned current_chat/current_node projection with canonical
 * framework execution state. Projection drift is intentionally advisory: it is
 * useful for diagnostics/self-healing, but it is not execution authority and
 * must not block otherwise-safe work by itself.
 */
export function assessExecutionProjection(
  treeText,
  executionText,
  { chatId = null, nodeId = null } = {},
) {
  const derived = deriveExecutionAvailability(treeText, executionText);
  if (!derived.safe) {
    return {
      ok: false,
      severity: "blocker",
      code: "authoritative_execution_invalid",
      derived,
      detail: "TREE/EXECUTION authority is invalid; repair authoritative execution state before continuing.",
    };
  }

  if (chatId === null && nodeId === null) {
    return {
      ok: true,
      severity: "info",
      code: "projection_absent",
      derived,
      detail: "No target execution pointer was supplied. Derive runnable work from TREE/EXECUTION.",
    };
  }

  const projectedChatId = chatId === null || chatId === undefined ? null : String(chatId);
  const projectedNodeId = nodeId === null || nodeId === undefined ? null : String(nodeId);
  const matchesRunnable = derived.runnableNodes.some(
    (node) => node.chatId === projectedChatId && node.nodeId === projectedNodeId,
  );

  if (matchesRunnable || (derived.complete && projectedChatId === null && projectedNodeId === null)) {
    return {
      ok: true,
      severity: "ok",
      code: "projection_aligned",
      derived,
      detail: "Target execution projection is consistent with canonical runnable execution state.",
    };
  }

  const candidates = derived.runnableNodes
    .map((node) => `Chat ${node.chatId} / ${node.nodeId}`)
    .join(", ");

  return {
    ok: true,
    severity: "warning",
    code: "projection_differs_from_execution",
    derived,
    detail:
      `Target projection says Chat ${projectedChatId ?? "null"} / ${projectedNodeId ?? "null"}; ` +
      `canonical runnable work is ${candidates || (derived.complete ? "complete" : "currently none")}. ` +
      "Treat the target pointer as stale/advisory, repair it when useful, and do not use it alone to block safe execution.",
  };
}

function usage() {
  return [
    "Usage:",
    "  node .planning/execution-guidance.mjs [TREE.yaml] [EXECUTION.yaml]",
    "",
    "Prints canonical runnable execution derived from TREE dependencies and EXECUTION states.",
    "Target-owned current_chat/current_node pointers are projections and are not inputs to authority.",
    "Projection drift is advisory; broken authoritative dependency state is a blocker.",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  if (args.length > 2) throw new Error("Expected at most TREE.yaml and EXECUTION.yaml paths");

  const treePath = args[0] ?? path.join(".planning", "TREE.yaml");
  const executionPath = args[1] ?? path.join(".planning", "EXECUTION.yaml");
  const result = deriveExecutionAvailability(
    fs.readFileSync(treePath, "utf8"),
    fs.readFileSync(executionPath, "utf8"),
  );

  if (!result.safe) {
    console.error("S&T authoritative execution state is invalid");
    for (const blocker of result.blockers) console.error(`- ${blocker}`);
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`S&T execution guidance ERROR: ${error.message}`);
    process.exitCode = 2;
  });
}
