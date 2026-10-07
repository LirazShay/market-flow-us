#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_BASELINE_FILES = [
  ".planning/GOAL.md",
  ".planning/TREE.yaml",
  ".planning/DECISIONS.md",
];

function runGit(args, cwd = process.cwd()) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`git invocation failed: ${result.error.message}`);
  }

  return result;
}

function requireCommit(ref, cwd) {
  const result = runGit(["rev-parse", "--verify", `${ref}^{commit}`], cwd);
  if (result.status !== 0) {
    throw new Error(`Git ref "${ref}" does not resolve to a commit`);
  }
  return result.stdout.trim();
}

function changedFiles(reviewedRef, frozenRef, files, cwd) {
  const args = ["diff", "--name-only", reviewedRef];
  if (frozenRef) args.push(frozenRef);
  args.push("--", ...files);

  const result = runGit(args, cwd);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "git diff failed");
  }

  return result.stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function verifyFreezeBaseline({
  reviewedRef,
  frozenRef = null,
  files = DEFAULT_BASELINE_FILES,
  cwd = process.cwd(),
} = {}) {
  if (!reviewedRef) {
    throw new Error("reviewedRef is required");
  }

  const reviewedCommit = requireCommit(reviewedRef, cwd);
  const frozenCommit = frozenRef ? requireCommit(frozenRef, cwd) : null;
  const drift = changedFiles(reviewedRef, frozenRef, files, cwd);

  return {
    ok: drift.length === 0,
    reviewedRef,
    reviewedCommit,
    frozenRef,
    frozenCommit,
    files,
    drift,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  let reviewedRef = null;
  let frozenRef = null;
  const files = [];

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--reviewed-ref") {
      reviewedRef = args.shift() ?? null;
      continue;
    }

    if (arg === "--frozen-ref") {
      frozenRef = args.shift() ?? null;
      continue;
    }

    if (arg === "--file") {
      const file = args.shift();
      if (!file) throw new Error("--file requires a path");
      files.push(file);
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!reviewedRef) {
    throw new Error("--reviewed-ref is required");
  }

  return {
    help: false,
    reviewedRef,
    frozenRef,
    files: files.length > 0 ? files : DEFAULT_BASELINE_FILES,
  };
}

function usage() {
  return [
    "Usage:",
    "  node .planning/verify-freeze-baseline.mjs --reviewed-ref <git-ref> [--frozen-ref <git-ref>] [--file <path> ...]",
    "",
    "Default baseline files:",
    ...DEFAULT_BASELINE_FILES.map((file) => `  - ${file}`),
    "",
    "Behavior:",
    "  Without --frozen-ref, compares the reviewed commit to the current working tree.",
    "  With --frozen-ref, compares the reviewed commit to that frozen commit.",
    "  Exit code 1 means material planning-baseline drift was found.",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const result = verifyFreezeBaseline(args);

  if (!result.ok) {
    console.error("S&T freeze baseline verification FAILED");
    console.error(`Reviewed ref: ${result.reviewedRef} (${result.reviewedCommit})`);
    if (result.frozenRef) {
      console.error(`Frozen ref: ${result.frozenRef} (${result.frozenCommit})`);
    }
    console.error("Material planning files changed after Final Planning Review:");
    for (const file of result.drift) console.error(`- ${file}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `S&T freeze baseline verification passed: ${result.files.length} baseline files unchanged from ${result.reviewedRef}${result.frozenRef ? ` to ${result.frozenRef}` : " to current working tree"}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`S&T freeze baseline verification ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
