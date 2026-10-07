#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

function normalizeChatId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return /^[1-9]\d*$/.test(text) ? text : null;
}

function startupLineChatId(line) {
  const normalized = line.trim();
  if (!normalized) return null;

  const patterns = [
    /^אני\s+צ(?:'|׳)?אט(?:\s+מספר)?\s+([1-9]\d*)\s+תתחיל[.!]?$/u,
    /^אני\s+צ(?:'|׳)?אט(?:\s+מספר)?\s+([1-9]\d*)[.!]?$/u,
    /^I\s+am\s+chat\s+([1-9]\d*)(?:\s+start)?[.!]?$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export function parseExplicitExecutorStartup(message) {
  const text = String(message ?? "");
  const ids = new Set();

  for (const line of text.split(/\r?\n/)) {
    const id = startupLineChatId(line);
    if (id) ids.add(id);
  }

  if (ids.size !== 1) return null;
  return [...ids][0];
}

function allocatedSet(values) {
  const result = new Set();
  for (const value of values ?? []) {
    const id = normalizeChatId(value);
    if (id) result.add(id);
  }
  return result;
}

function pointerWarning(currentChatId, requestedChatId) {
  if (!currentChatId || !requestedChatId || currentChatId === requestedChatId) return [];
  return [
    {
      code: "repository_pointer_differs",
      severity: "warning",
      detail:
        `Repository projection points to Chat ${currentChatId}, while this executor context is Chat ${requestedChatId}. ` +
        "Treat the pointer as advisory; use allocation/dependencies as execution authority.",
    },
  ];
}

function reject(code, identity, nextChatId, detail, warnings = []) {
  return {
    allowed: false,
    action: "reject",
    severity: "blocker",
    code,
    executorIdentity: identity,
    nextChatId,
    mayMutateExecutionState: false,
    warnings,
    detail,
  };
}

function allow(action, code, identity, nextChatId, detail, warnings = [], previousIdentity = null) {
  return {
    allowed: true,
    action,
    severity: warnings.length ? "warning" : "ok",
    code,
    executorIdentity: identity,
    previousExecutorIdentity: previousIdentity,
    nextChatId,
    mayMutateExecutionState: true,
    warnings,
    detail,
  };
}

function allocationUnknown(identity, nextChatId, warnings = []) {
  return reject(
    "repository_allocation_unknown",
    identity,
    nextChatId,
    "Authoritative EXECUTION allocation was not provided. Read EXECUTION.yaml before executor mutation; target current-chat pointers are not a substitute for allocation.",
    warnings,
  );
}

/**
 * Framework-level executor authority gate.
 *
 * Durable execution authority comes from repository authorization + EXECUTION
 * allocation/dependencies. Target-owned current_chat/current_node pointers are
 * projections only: they may help navigation, but a mismatch is advisory by
 * itself and must not stop otherwise-safe execution.
 *
 * Conversation identity still prevents accidental rollover. A generic continue
 * command never activates the next executor. After handoff, however, an explicit
 * startup may intentionally re-bootstrap another allocated executor in the same
 * conversation when the user prefers continuity over opening a fresh chat.
 */
export function evaluateExecutorAuthority({
  conversationIdentity = null,
  handoffEmitted = false,
  userMessage = "",
  repoExecutionAuthorized = true,
  repoAllocatedChatIds = null,
  repoCurrentChatId = null,
} = {}) {
  const identity = normalizeChatId(conversationIdentity);
  const startupId = parseExplicitExecutorStartup(userMessage);
  const allocationKnown = Array.isArray(repoAllocatedChatIds);
  const allocated = allocatedSet(repoAllocatedChatIds);
  const currentChatId = normalizeChatId(repoCurrentChatId);
  const nextChatId = currentChatId ?? (allocated.size === 1 ? [...allocated][0] : null);

  if (!repoExecutionAuthorized) {
    return reject(
      "repository_execution_not_authorized",
      identity,
      nextChatId,
      "Repository execution authorization is not active.",
    );
  }

  if (handoffEmitted) {
    if (!startupId) {
      return reject(
        "explicit_startup_required_after_handoff",
        identity,
        nextChatId,
        "This conversation already emitted a handoff. A generic continue cannot activate another executor. Open a fresh chat as recommended, or explicitly start the allocated Chat N here if you intentionally want to re-bootstrap in this conversation.",
      );
    }

    const warnings = pointerWarning(currentChatId, startupId);
    if (!allocationKnown) return allocationUnknown(identity, nextChatId, warnings);

    if (!allocated.has(startupId)) {
      return reject(
        "startup_chat_not_allocated",
        identity,
        nextChatId,
        `Explicit startup requested Chat ${startupId}, which is not allocated in current repository execution state.`,
        warnings,
      );
    }

    return allow(
      "rebootstrap",
      "explicit_rebootstrap_after_handoff",
      startupId,
      nextChatId,
      `Explicit startup intentionally re-bootstrapped Chat ${startupId} after the prior handoff. Repository allocation remains authoritative; the project pointer is advisory.`,
      warnings,
      identity,
    );
  }

  if (identity) {
    const warnings = pointerWarning(currentChatId, identity);

    if (startupId && startupId !== identity) {
      return reject(
        "conversation_switch_requires_handoff",
        identity,
        nextChatId,
        `This active conversation is executing Chat ${identity}. Finish/handoff that executor before explicitly switching to Chat ${startupId}.`,
        warnings,
      );
    }

    if (!allocationKnown) return allocationUnknown(identity, nextChatId, warnings);

    if (!allocated.has(identity)) {
      return reject(
        "conversation_identity_not_allocated",
        identity,
        nextChatId,
        `Chat ${identity} is not allocated in current repository execution state.`,
        warnings,
      );
    }

    return allow(
      "continue",
      "existing_identity_confirmed",
      identity,
      nextChatId,
      `Conversation remains Chat ${identity}; repository allocation confirms execution authority.`,
      warnings,
    );
  }

  if (!startupId) {
    return reject(
      "explicit_startup_required",
      null,
      nextChatId,
      "No executor identity is active in this conversation. Repository pointers and generic continue commands cannot activate one implicitly.",
    );
  }

  const warnings = pointerWarning(currentChatId, startupId);
  if (!allocationKnown) return allocationUnknown(null, nextChatId, warnings);

  if (!allocated.has(startupId)) {
    return reject(
      "startup_chat_not_allocated",
      null,
      nextChatId,
      `Explicit startup requested Chat ${startupId}, which is not allocated in current repository execution state.`,
      warnings,
    );
  }

  return allow(
    "activate",
    "explicit_startup_confirmed",
    startupId,
    nextChatId,
    `Explicit startup activated Chat ${startupId} after repository authorization/allocation confirmation.`,
    warnings,
  );
}

function usage() {
  return [
    "S&T executor conversation authority guard",
    "",
    "This helper is primarily an executable framework contract used by tests.",
    "Allocation/dependencies authorize work; target current_chat/current_node pointers are advisory projections.",
    "A generic continue never rolls an old conversation into the next executor implicitly.",
    "After handoff, an explicit startup may intentionally re-bootstrap an allocated executor in the same conversation.",
    "Authoritative EXECUTION allocation must be known before any executor mutation.",
    "",
    "Usage:",
    "  node .planning/executor-authority.mjs --help",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  throw new Error("Unsupported arguments; use --help. The framework invokes this contract through its exported functions/tests.");
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`S&T executor authority ERROR: ${error.message}`);
    process.exitCode = 2;
  });
}
