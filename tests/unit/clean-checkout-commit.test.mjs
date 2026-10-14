import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readCleanCheckoutCommit,
  validateCandidateCommit
} from "../../scripts/clean-checkout-commit.mjs";

function scriptedGit(responses) {
  const calls = [];
  return {
    calls,
    async run(command, args, options) {
      calls.push({ command, args, options });
      const key = args.join(" ");
      const response = responses.get(key);
      if (response instanceof Error) throw response;
      if (!response) throw new Error(`Unexpected git call: ${key}`);
      return response;
    }
  };
}

test("clean checkout provenance returns the exact normalized commit after proving no tracked or untracked drift", async () => {
  const git = scriptedGit(new Map([
    ["status --porcelain --untracked-files=normal", { stdout: "" }],
    ["rev-parse HEAD", { stdout: "ABCDEF1234567890\n" }]
  ]));

  const commit = await readCleanCheckoutCommit({
    root: "/repo",
    run: git.run
  });

  assert.equal(commit, "abcdef1234567890");
  assert.deepEqual(git.calls.map((call) => call.args), [
    ["status", "--porcelain", "--untracked-files=normal"],
    ["rev-parse", "HEAD"]
  ]);
  assert.equal(git.calls.every((call) => call.command === "git"), true);
  assert.equal(git.calls.every((call) => call.options.cwd === "/repo"), true);
});

test("dirty checkout fails closed before reading HEAD so acceptance cannot bind evidence to drifted source", async () => {
  const git = scriptedGit(new Map([
    ["status --porcelain --untracked-files=normal", { stdout: " M scripts/run-trading-live-shadow.mjs\n" }]
  ]));

  await assert.rejects(
    readCleanCheckoutCommit({ root: "/repo", run: git.run }),
    (error) => error?.code === "DIRTY_CHECKOUT"
  );
  assert.equal(git.calls.length, 1);
});

test("malformed HEAD fails closed with a stable public-safe reason code", async () => {
  const git = scriptedGit(new Map([
    ["status --porcelain --untracked-files=normal", { stdout: "" }],
    ["rev-parse HEAD", { stdout: "not-a-commit\n" }]
  ]));

  await assert.rejects(
    readCleanCheckoutCommit({ root: "/repo", run: git.run }),
    (error) => error?.code === "INVALID_CHECKOUT_COMMIT"
  );
});

test("candidate commit validator preserves the existing 7-40 hexadecimal contract", () => {
  assert.equal(validateCandidateCommit("ABCDEF1"), "abcdef1");
  assert.throws(
    () => validateCandidateCommit("abc123!"),
    (error) => error?.code === "INVALID_CHECKOUT_COMMIT"
  );
});
