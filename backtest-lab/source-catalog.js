import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

export const BACKTEST_ACTIVE_SOURCE_ID = "active";
export const BACKTEST_ACTIVE_FILE_NAME = "market-flow-us.duckdb";
export const BACKTEST_ARCHIVE_SOURCE_PREFIX = "archive:";

export class BacktestSourceCatalogError extends Error {
  constructor(message, code = "BACKTEST_SOURCE_CATALOG_UNAVAILABLE", options = undefined) {
    super(message, options);
    this.name = "BacktestSourceCatalogError";
    this.code = code;
  }
}

function assertDataDir(dataDir) {
  if (typeof dataDir !== "string" || dataDir.length === 0) {
    throw new TypeError("dataDir must be a non-empty string");
  }
}

export function isBacktestArchiveFileName(fileName) {
  return typeof fileName === "string"
    && fileName.startsWith("market-flow-us-")
    && fileName.length > "market-flow-us-.duckdb".length
    && fileName.endsWith(".duckdb")
    && !fileName.includes("/")
    && !fileName.includes("\\");
}

export function describeBacktestEvidenceSource(sourceId) {
  if (sourceId === BACKTEST_ACTIVE_SOURCE_ID) {
    return Object.freeze({
      sourceId: BACKTEST_ACTIVE_SOURCE_ID,
      kind: "active",
      fileName: BACKTEST_ACTIVE_FILE_NAME
    });
  }

  if (typeof sourceId === "string" && sourceId.startsWith(BACKTEST_ARCHIVE_SOURCE_PREFIX)) {
    const fileName = sourceId.slice(BACKTEST_ARCHIVE_SOURCE_PREFIX.length);
    if (isBacktestArchiveFileName(fileName)) {
      return Object.freeze({
        sourceId,
        kind: "archive",
        fileName
      });
    }
  }

  throw new BacktestSourceCatalogError(
    "Backtest source selection is invalid.",
    "BACKTEST_SOURCE_INVALID_SELECTION"
  );
}

export function resolveBacktestEvidenceSourcePath({ dataDir, sourceId }) {
  assertDataDir(dataDir);
  const source = describeBacktestEvidenceSource(sourceId);
  return source.kind === "active"
    ? path.join(dataDir, BACKTEST_ACTIVE_FILE_NAME)
    : path.join(dataDir, "archive", source.fileName);
}

async function isRegularFile(filePath) {
  try {
    const stats = await lstat(filePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw new BacktestSourceCatalogError(
      "Backtest source catalog could not inspect product evidence.",
      "BACKTEST_SOURCE_CATALOG_UNAVAILABLE",
      { cause: error }
    );
  }
}

async function archiveFileNames(archiveDir) {
  let entries;
  try {
    entries = await readdir(archiveDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return [];
    throw new BacktestSourceCatalogError(
      "Backtest source catalog could not enumerate archived evidence.",
      "BACKTEST_SOURCE_CATALOG_UNAVAILABLE",
      { cause: error }
    );
  }

  return entries
    .filter((entry) => entry.isFile() && isBacktestArchiveFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
}

export async function listBacktestEvidenceSources({ dataDir }) {
  assertDataDir(dataDir);
  const sources = [];
  const activePath = path.join(dataDir, BACKTEST_ACTIVE_FILE_NAME);

  if (await isRegularFile(activePath)) {
    sources.push(describeBacktestEvidenceSource(BACKTEST_ACTIVE_SOURCE_ID));
  }

  for (const fileName of await archiveFileNames(path.join(dataDir, "archive"))) {
    sources.push(describeBacktestEvidenceSource(
      `${BACKTEST_ARCHIVE_SOURCE_PREFIX}${fileName}`
    ));
  }

  return Object.freeze(sources);
}
