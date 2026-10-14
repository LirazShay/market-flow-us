import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function validateCandidateCommit(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{7,40}$/iu.test(value)) {
    throw codedError(
      "candidateCommit must be a 7-40 character hexadecimal Git commit.",
      "INVALID_CHECKOUT_COMMIT"
    );
  }
  return value.toLowerCase();
}

export async function readCleanCheckoutCommit({ root, run = execFileAsync } = {}) {
  if (typeof root !== "string" || root.length === 0) {
    throw new TypeError("root is required");
  }
  if (typeof run !== "function") {
    throw new TypeError("run must be a function");
  }

  const options = { cwd: root, windowsHide: true };
  const { stdout: status } = await run(
    "git",
    ["status", "--porcelain", "--untracked-files=normal"],
    options
  );
  if (String(status ?? "").trim().length > 0) {
    throw codedError(
      "Acceptance evidence requires a clean Git checkout so candidateCommit identifies the exact source.",
      "DIRTY_CHECKOUT"
    );
  }

  const { stdout } = await run("git", ["rev-parse", "HEAD"], options);
  return validateCandidateCommit(String(stdout ?? "").trim());
}
