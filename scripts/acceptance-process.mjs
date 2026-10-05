import { spawn } from "node:child_process";
import { once } from "node:events";

const DEFAULT_KILL_GRACE_MS = 2000;

function isRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

async function waitForExit(child, timeoutMs) {
  if (!isRunning(child)) return;
  let timer;
  try {
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function terminateChildTree(child, { graceMs = DEFAULT_KILL_GRACE_MS } = {}) {
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || !isRunning(child)) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
        shell: false
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    await waitForExit(child, graceMs);
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {}
  }

  await waitForExit(child, graceMs);
  if (!isRunning(child)) return;

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {}
  }
  await waitForExit(child, graceMs);
}

export async function runBoundedCommand(command, args, {
  env = process.env,
  timeoutMs,
  maxOutputChars = 8000,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive safe integer");
  }

  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });

    let output = "";
    let settled = false;
    let timedOut = false;

    const append = (chunk, stream) => {
      const text = chunk.toString();
      stream?.write?.(text);
      output = `${output}${text}`.slice(-maxOutputChars);
    };

    child.stdout?.on("data", (chunk) => append(chunk, stdout));
    child.stderr?.on("data", (chunk) => append(chunk, stderr));

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, output });
    };

    child.once("error", (error) => {
      if (timedOut) return;
      finish({
        code: 1,
        signal: null,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    child.once("exit", (code, signal) => {
      if (timedOut) return;
      finish({ code: code ?? 1, signal, error: null });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildTree(child).then(() => {
        finish({
          code: 1,
          signal: "TIMEOUT",
          error: `Acceptance subprocess exceeded ${timeoutMs} ms.`
        });
      });
    }, timeoutMs);
  });
}
