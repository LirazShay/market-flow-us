import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    )
  );
}

export async function resetDemoState({
  rootDir = ROOT,
  demoDir = path.join(path.resolve(rootDir), ".demo")
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const allowedDemoRoot = path.resolve(resolvedRoot, ".demo");
  const resolvedTarget = path.resolve(demoDir);

  if (!isPathInside(allowedDemoRoot, resolvedTarget)) {
    throw new Error("Demo reset path escape refused: target must stay inside .demo.");
  }

  if (resolvedTarget === resolvedRoot) {
    throw new Error("Demo reset refuses to delete the repository root.");
  }

  await rm(resolvedTarget, { recursive: true, force: true });

  return Object.freeze({
    rootDir: resolvedRoot,
    demoDir: resolvedTarget
  });
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  await resetDemoState();
}
