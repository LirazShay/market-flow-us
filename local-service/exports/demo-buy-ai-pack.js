import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";

import { validateDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import {
  ERROR_CODES,
  ProtocolValidationError
} from "../../shared/protocol/index.js";

export const AI_PACK_FORMAT_VERSION = 1;
export const AI_PACK_RELATIVE_ROOT = "exports/ai-investigations";
export const AI_PACK_PROMPT_MAX_BYTES = 256 * 1024;
export const AI_PACK_FILE_NAMES = Object.freeze([
  "README.md",
  "PROMPT.md",
  "MANIFEST.json",
  "QUERY.sql",
  "SCANNER_CONTEXT.json",
  "TARGET_BEFORE.jsonl",
  "BASELINE.json",
  "TARGET_AFTER.jsonl",
  "OUTCOME.json",
  "FIELD_GUIDE.md"
]);

const PRE_WINDOW_MS = 30 * 60 * 1000;
const POST_WINDOW_MS = 10 * 60 * 1000;
const UTF8 = new TextEncoder();
const SAFE_MARKET_TEXT_COLUMNS = new Set([
  "securityId",
  "security_id",
  "Symbol",
  "PaperNameEng",
  "PaperNameHeb",
  "ExchangeName",
  "TradeDateTime",
  "CountryName",
  "CountryNameEng"
]);
const OMITTED_OPERATIONAL_HISTORY_FIELDS = Object.freeze([
  "session_id",
  "producer_instance_id",
  "chunk_index",
  "cycle_started_at_ms",
  "chunk_received_at_ms",
  "source_metadata_json"
]);

const TARGET_AUTHORITY_SQL = `SELECT
  c.capture_id AS captureId,
  c.captured_at_ms AS capturedAtMs,
  c.source_query_sql AS sourceQuerySql,
  c.source_result_started_at_ms AS sourceResultStartedAtMs,
  c.source_result_completed_at_ms AS sourceResultCompletedAtMs,
  c.source_result_row_count AS sourceResultRowCount,
  CAST(c.source_result_context_json AS VARCHAR) AS sourceResultContextJson,
  i.result_rank AS resultRank,
  i.security_id AS securityId,
  i.buy_cycle_id AS buyCycleId,
  b.cycle_id,
  b.security_id,
  b.universe_revision,
  b.collected_at_ms,
  b.Symbol,
  b.PaperNameEng,
  b.PaperNameHeb,
  b.ExchangeName,
  b.TradeDateTime,
  b.CountryName,
  b.CountryNameEng,
  b.Price,
  b.ChangePercent,
  b.DailyHigh,
  b.DailyLow,
  b.YearHigh,
  b.YearLow,
  b.DailyVolume,
  b.BeginYearChangePercent,
  b.Month12ChangePercent,
  b.Month36ChangePercent,
  b.AskRate,
  b.BidRate,
  b.YesterdayRate,
  b.PaperMarketCap,
  b.PaperIdYatab,
  b.CountryId,
  b.PaperType,
  b.ESGRatingId,
  b.ESGScope,
  b.raw_data
FROM demo_buy_items AS i
JOIN demo_buy_captures AS c
  ON c.capture_id = i.capture_id
LEFT JOIN history AS b
  ON b.cycle_id = i.buy_cycle_id
 AND b.security_id = i.security_id
WHERE i.capture_id = $captureId
  AND i.security_id = $securityId`;

const TARGET_WINDOW_SQL = `SELECT
  cycle_id,
  security_id,
  universe_revision,
  collected_at_ms,
  Symbol,
  PaperNameEng,
  PaperNameHeb,
  ExchangeName,
  TradeDateTime,
  CountryName,
  CountryNameEng,
  Price,
  ChangePercent,
  DailyHigh,
  DailyLow,
  YearHigh,
  YearLow,
  DailyVolume,
  BeginYearChangePercent,
  Month12ChangePercent,
  Month36ChangePercent,
  AskRate,
  BidRate,
  YesterdayRate,
  PaperMarketCap,
  PaperIdYatab,
  CountryId,
  PaperType,
  ESGRatingId,
  ESGScope,
  raw_data
FROM history
WHERE security_id = $securityId
  AND (
    (
      cycle_id <= $buyCycleId
      AND collected_at_ms >= $preWindowStartMs
      AND collected_at_ms <= $capturedAtMs
    )
    OR
    (
      cycle_id > $buyCycleId
      AND collected_at_ms >= $capturedAtMs
      AND collected_at_ms <= $postWindowEndMs
    )
  )
ORDER BY collected_at_ms ASC, cycle_id ASC`;

const EVIDENCE_WATERMARK_SQL = `SELECT
  MAX(collected_at_ms) AS evidenceWatermarkMs
FROM history
WHERE cycle_id > $buyCycleId`;

function fail(code) {
  throw new ProtocolValidationError(code);
}

function asSafeInteger(value, name, { min = 0, nullable = false } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    throw new Error(`${name} is missing from persisted AI Investigation authority.`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(`${name} is invalid in persisted AI Investigation authority.`);
  }
  return number;
}

function utf8Bytes(value) {
  return UTF8.encode(value).byteLength;
}

function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const result = {};
  for (const key of Object.keys(value).sort()) {
    result[key] = canonicalize(value[key]);
  }
  return result;
}

function prettyJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function jsonLine(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeRawData(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("Persisted provider raw_data is not valid JSON.");
    }
  }
  if (value === null || typeof value !== "object") {
    throw new Error("Persisted provider raw_data is invalid.");
  }
  return value;
}

function marketProjection(row) {
  return Object.freeze({
    cycle_id: asSafeInteger(row.cycle_id, "cycle_id", { min: 1 }),
    security_id: String(row.security_id ?? ""),
    universe_revision: asSafeInteger(row.universe_revision, "universe_revision", { min: 1 }),
    collected_at_ms: asSafeInteger(row.collected_at_ms, "collected_at_ms"),
    Symbol: row.Symbol ?? null,
    PaperNameEng: row.PaperNameEng ?? null,
    PaperNameHeb: row.PaperNameHeb ?? null,
    ExchangeName: row.ExchangeName ?? null,
    TradeDateTime: row.TradeDateTime ?? null,
    CountryName: row.CountryName ?? null,
    CountryNameEng: row.CountryNameEng ?? null,
    Price: row.Price ?? null,
    ChangePercent: row.ChangePercent ?? null,
    DailyHigh: row.DailyHigh ?? null,
    DailyLow: row.DailyLow ?? null,
    YearHigh: row.YearHigh ?? null,
    YearLow: row.YearLow ?? null,
    DailyVolume: row.DailyVolume ?? null,
    BeginYearChangePercent: row.BeginYearChangePercent ?? null,
    Month12ChangePercent: row.Month12ChangePercent ?? null,
    Month36ChangePercent: row.Month36ChangePercent ?? null,
    AskRate: row.AskRate ?? null,
    BidRate: row.BidRate ?? null,
    YesterdayRate: row.YesterdayRate ?? null,
    PaperMarketCap: row.PaperMarketCap ?? null,
    PaperIdYatab: row.PaperIdYatab ?? null,
    CountryId: row.CountryId ?? null,
    PaperType: row.PaperType ?? null,
    ESGRatingId: row.ESGRatingId ?? null,
    ESGScope: row.ESGScope ?? null,
    raw_data: normalizeRawData(row.raw_data)
  });
}

async function queryRows(connection, sql, values) {
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJson();
}

function parsePersistedContext(serialized) {
  let context;
  try {
    context = JSON.parse(serialized);
  } catch {
    fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
  }
  try {
    return validateDemoBuyScannerContext(context);
  } catch {
    fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
  }
}

function metadataByCell(context) {
  const map = new Map();
  for (const entry of context.cellMetadata) {
    map.set(`${entry.resultRank}:${entry.sourceColumnIndex}`, entry);
  }
  return map;
}

function valueType(value, metadata) {
  if (metadata?.encoding === "canonical_json") return "encoded_json";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function redactionDescriptor({ row, column, value, metadata }) {
  const descriptor = {
    sourceColumnIndex: column.sourceIndex,
    sourceColumnName: column.name,
    valueType: valueType(value, metadata),
    redactedForSharing: true
  };
  if (typeof value === "string") {
    descriptor.capturedUtf8Bytes = utf8Bytes(value);
  }
  if (metadata?.encoding) descriptor.encoding = metadata.encoding;
  if (metadata?.truncated === true) descriptor.truncated = true;
  if (Number.isSafeInteger(metadata?.originalUtf8Bytes)) {
    descriptor.originalUtf8Bytes = metadata.originalUtf8Bytes;
  }
  descriptor.resultRank = row.resultRank;
  return descriptor;
}

export function projectScannerContextForSharing(context) {
  const validated = validateDemoBuyScannerContext(context);
  const metadata = metadataByCell(context);
  let preservedValueCount = 0;
  let redactedValueCount = 0;

  const rows = context.rows.map((row) => ({
    resultRank: row.resultRank,
    values: row.values.map((value, index) => {
      const column = context.retainedColumns[index];
      const cellMetadata = metadata.get(`${row.resultRank}:${column.sourceIndex}`);
      const preserve = value === null
        || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value))
        || (typeof value === "string" && SAFE_MARKET_TEXT_COLUMNS.has(column.name));

      if (preserve) {
        preservedValueCount += 1;
        return value;
      }

      redactedValueCount += 1;
      return redactionDescriptor({ row, column, value, metadata: cellMetadata });
    })
  }));

  return Object.freeze({
    context: Object.freeze({
      version: context.version,
      sourceRowCount: context.sourceRowCount,
      retainedRowCount: context.retainedRowCount,
      omittedRowCount: context.omittedRowCount,
      sourceColumnCount: context.sourceColumnCount,
      identityColumn: context.identityColumn,
      retainedColumns: context.retainedColumns,
      omittedColumns: context.omittedColumns,
      rows,
      cellMetadata: context.cellMetadata
    }),
    identityValueIndex: validated.identityValueIndex,
    preservedValueCount,
    redactedValueCount
  });
}

function targetContextCoverage({ context, identityValueIndex, resultRank, securityId }) {
  if (resultRank > 50) return false;
  const row = context.rows.find((candidate) => candidate.resultRank === resultRank);
  if (!row) fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
  if (row.values[identityValueIndex] !== securityId) {
    fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
  }
  return true;
}

function sanitizeDirectoryPart(value) {
  const sanitized = String(value)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return sanitized.length > 0 ? sanitized : "security";
}

function buildPrompt({ targetInScannerContext, outcomeEvidenceStatus }) {
  return `# AI Investigation Instructions\n\n` +
    `Analyze this Market Flow US Demo Buy evidence pack. This is forensic strategy-improvement evidence, not a trading instruction.\n\n` +
    `## Mandatory evidence discipline\n\n` +
    `1. Treat QUERY.sql, SCANNER_CONTEXT.json, TARGET_BEFORE.jsonl and BASELINE.json as prediction-time evidence only.\n` +
    `2. Treat TARGET_AFTER.jsonl and OUTCOME.json as outcome evidence only. Never use outcome evidence to justify a proposed pre-buy rule.\n` +
    `3. resultRank means original returned Scanner row position. Do not call it best, top-ranked or preferred unless QUERY.sql contains explicit deterministic ordering that establishes that meaning.\n` +
    `4. Label every statement as fact, derived calculation or hypothesis. Cite concrete fields/rows/timestamps for facts.\n` +
    `5. Do not invent semantics for provider fields beyond FIELD_GUIDE.md. Price is market evidence, not proof of an executable fill.\n` +
    `6. If evidence is omitted, truncated or redacted, state that limitation. targetInScannerContext=${targetInScannerContext}.\n` +
    `7. Outcome evidence status is ${outcomeEvidenceStatus}. If PARTIAL_OUTCOME, later committed evidence may change outcome-dependent files.\n` +
    `8. One observation is insufficient to adopt a new Scanner rule. End with a measurable multi-observation validation plan.\n\n` +
    `## Investigation sequence\n\n` +
    `A. Explain the exact Scanner SQL, including filters, calculations and deterministic ordering/tie-breaks if present.\n` +
    `B. Using prediction-time evidence only, identify warning signals that were already available before capture.\n` +
    `C. Separately describe what happened after capture using outcome evidence.\n` +
    `D. Propose the smallest useful SQL hypotheses. For each: evidence used, minimal SQL fragment, precise effect, expected benefit, false-negative cost, overfitting risk and additional evidence required.\n` +
    `E. Perform a counterfactual/peer check only where retained sharing-safe context supports it; do not fabricate peer evidence.\n` +
    `F. Finish with validation criteria across multiple Demo Buy observations before replacing or activating any Scanner query.\n`;
}

function buildReadme({ outcomeEvidenceStatus, targetInScannerContext }) {
  return `# Market Flow US — AI Investigation Pack\n\n` +
    `This folder is a local, reproducible evidence bundle for one Demo Buy observation. No AI API call or upload was performed.\n\n` +
    `**Before external sharing:** QUERY.sql contains your exact Scanner SQL and the pack contains market evidence. Do not place secrets in Scanner SQL; review every generated file before uploading it externally.\n\n` +
    `Outcome evidence: **${outcomeEvidenceStatus}**.\n\n` +
    `Target retained in the first-50 frozen Scanner context: **${targetInScannerContext ? "yes" : "no"}**.\n\n` +
    `Use PROMPT.md as the investigation instructions and attach the other files as evidence. Returned Scanner position is not automatically a semantic rank.\n`;
}

const FIELD_GUIDE = `# Field Guide\n\n` +
  `## Authority\n\n` +
  `security_id is the canonical identity derived from String(PaperId). cycle_id/writer order is the authority boundary. collected_at_ms is a local market-row timestamp used for forensic windows; wall-clock timestamps never reorder writer authority.\n\n` +
  `## Provider fields\n\n` +
  `Symbol, PaperNameEng, PaperNameHeb, ExchangeName, TradeDateTime, CountryName and CountryNameEng are source-shaped text fields. Price, ChangePercent, DailyHigh, DailyLow, YearHigh, YearLow, DailyVolume, BeginYearChangePercent, Month12ChangePercent, Month36ChangePercent, AskRate, BidRate, YesterdayRate, PaperMarketCap, PaperIdYatab, CountryId, PaperType, ESGRatingId and ESGScope are source-shaped numeric projections. Unknown provider semantics/units remain unknown. raw_data is the preserved provider market record.\n\n` +
  `## Null / zero / missing\n\n` +
  `Typed projection may use null for missing/wrong-type values. Numeric zero is a real projected value and must not be treated as missing. raw_data preserves provider-record distinctions.\n\n` +
  `## Prediction versus outcome\n\n` +
  `Prediction-time history requires cycle_id <= buy_cycle_id and the fixed 30-minute timestamp window. Outcome history requires cycle_id > buy_cycle_id and the fixed capture-through-10-minute timestamp window. BASELINE.json is the exact linked (buy_cycle_id, security_id) row. OUTCOME.json is produced by the trusted Demo Buy evaluator and may contain a delayed horizon observation beyond the raw TARGET_AFTER fixed window.\n\n` +
  `## Returned position\n\n` +
  `resultRank/result_rank is the original 1-based returned Scanner row position. It is not evidence of score quality, preference, or semantic rank unless QUERY.sql explicitly establishes deterministic ordering semantics.\n\n` +
  `## Phase-1 boundary\n\n` +
  `This pack does not model fills, executable liquidity, portfolio behavior, slippage, or real order execution. Price evidence is not proof of a fill.\n\n` +
  `## Sharing safety\n\n` +
  `History/baseline files are explicit market-field allowlists. Operational/session/request/config/path fields are omitted. Arbitrary Scanner result strings/arrays/objects are replaced with structural redaction metadata; numeric/null/boolean values and documented market-text columns may be preserved. Exact QUERY.sql is intentionally verbatim and must be reviewed by the user before sharing.\n`;

async function durableWrite(filePath, content) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function outcomeStatus(evidenceWatermarkMs, postWindowEndMs) {
  return evidenceWatermarkMs !== null && evidenceWatermarkMs >= postWindowEndMs
    ? "COMPLETE_OUTCOME"
    : "PARTIAL_OUTCOME";
}

function buildManifest({
  productVersion,
  generatedAtMs,
  authority,
  baseline,
  preWindowStartMs,
  postWindowEndMs,
  before,
  after,
  evidenceWatermarkMs,
  outcomeEvidenceStatus,
  targetInScannerContext,
  sharingSummary
}) {
  return {
    packFormatVersion: AI_PACK_FORMAT_VERSION,
    productVersion,
    captureId: authority.captureId,
    securityId: authority.securityId,
    resultRank: authority.resultRank,
    resultRankMeaning: "RETURNED_POSITION",
    targetInScannerContext,
    generatedAtMs,
    sourceResultStartedAtMs: authority.sourceResultStartedAtMs,
    sourceResultCompletedAtMs: authority.sourceResultCompletedAtMs,
    capturedAtMs: authority.capturedAtMs,
    buyCycleId: authority.buyCycleId,
    baselineCollectedAtMs: baseline.collected_at_ms,
    preWindowStartMs,
    postWindowEndMs,
    evidenceWatermarkMs,
    latestIncludedPostObservationMs: after.length === 0 ? null : after.at(-1).collected_at_ms,
    outcomeEvidenceStatus,
    files: {
      names: AI_PACK_FILE_NAMES,
      recordCounts: {
        scannerContextRows: authority.context.retainedRowCount,
        targetBefore: before.length,
        baseline: 1,
        targetAfter: after.length,
        outcomeHorizons: 10
      }
    },
    sharingSummary
  };
}

export function createDemoBuyAiPackExporter({
  connection,
  demoBuyReads,
  exportRoot = path.resolve(process.cwd(), AI_PACK_RELATIVE_ROOT),
  productVersion = "0.1.0",
  now = () => Date.now(),
  createSuffix = () => randomUUID(),
  fault = null
}) {
  if (!connection || typeof connection.runAndReadAll !== "function") {
    throw new TypeError("AI Investigation read connection is required");
  }
  if (!demoBuyReads || typeof demoBuyReads.observationGet !== "function") {
    throw new TypeError("trusted Demo Buy reads are required");
  }
  if (typeof exportRoot !== "string" || exportRoot.length === 0) {
    throw new TypeError("AI Investigation export root is required");
  }

  async function create(captureId, securityId) {
    asSafeInteger(captureId, "captureId", { min: 1 });
    if (typeof securityId !== "string" || securityId.length === 0 || securityId.length > 128) {
      throw new TypeError("securityId is invalid.");
    }

    const authorityRows = await queryRows(connection, TARGET_AUTHORITY_SQL, {
      captureId,
      securityId
    });
    if (authorityRows.length === 0) fail(ERROR_CODES.NOT_FOUND);
    if (authorityRows.length !== 1) fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);

    const row = authorityRows[0];
    if (row.cycle_id === null || row.cycle_id === undefined) {
      fail(ERROR_CODES.DEMO_BUY_BASELINE_INTEGRITY);
    }

    const parsedContext = parsePersistedContext(row.sourceResultContextJson);
    const sharingContext = projectScannerContextForSharing(parsedContext.context);
    const authority = Object.freeze({
      captureId: asSafeInteger(row.captureId, "captureId", { min: 1 }),
      capturedAtMs: asSafeInteger(row.capturedAtMs, "capturedAtMs"),
      sourceQuerySql: String(row.sourceQuerySql ?? ""),
      sourceResultStartedAtMs: asSafeInteger(row.sourceResultStartedAtMs, "sourceResultStartedAtMs"),
      sourceResultCompletedAtMs: asSafeInteger(row.sourceResultCompletedAtMs, "sourceResultCompletedAtMs"),
      sourceResultRowCount: asSafeInteger(row.sourceResultRowCount, "sourceResultRowCount"),
      resultRank: asSafeInteger(row.resultRank, "resultRank", { min: 1 }),
      securityId: String(row.securityId ?? ""),
      buyCycleId: asSafeInteger(row.buyCycleId, "buyCycleId", { min: 1 }),
      context: parsedContext.context
    });
    if (authority.securityId !== securityId || authority.sourceQuerySql.length === 0) {
      fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
    }

    const targetInScannerContext = targetContextCoverage({
      context: parsedContext.context,
      identityValueIndex: parsedContext.identityValueIndex,
      resultRank: authority.resultRank,
      securityId
    });

    const baseline = marketProjection(row);
    if (baseline.cycle_id !== authority.buyCycleId || baseline.security_id !== securityId) {
      fail(ERROR_CODES.DEMO_BUY_BASELINE_INTEGRITY);
    }

    const preWindowStartMs = Math.max(0, authority.capturedAtMs - PRE_WINDOW_MS);
    const postWindowEndMs = authority.capturedAtMs + POST_WINDOW_MS;
    if (!Number.isSafeInteger(postWindowEndMs)) {
      fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
    }

    const windowRows = await queryRows(connection, TARGET_WINDOW_SQL, {
      securityId,
      buyCycleId: authority.buyCycleId,
      preWindowStartMs,
      capturedAtMs: authority.capturedAtMs,
      postWindowEndMs
    });
    const before = [];
    const after = [];
    for (const historyRow of windowRows) {
      const projected = marketProjection(historyRow);
      if (projected.security_id !== securityId) fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
      if (projected.cycle_id <= authority.buyCycleId) before.push(projected);
      else after.push(projected);
    }

    const watermarkRows = await queryRows(connection, EVIDENCE_WATERMARK_SQL, {
      buyCycleId: authority.buyCycleId
    });
    if (watermarkRows.length !== 1) fail(ERROR_CODES.DEMO_BUY_AI_PACK_INTEGRITY);
    const evidenceWatermarkMs = asSafeInteger(
      watermarkRows[0].evidenceWatermarkMs,
      "evidenceWatermarkMs",
      { nullable: true }
    );
    const status = outcomeStatus(evidenceWatermarkMs, postWindowEndMs);
    const outcome = await demoBuyReads.observationGet(captureId, securityId);

    const generatedAtMs = asSafeInteger(now(), "generatedAtMs");
    const promptText = buildPrompt({
      targetInScannerContext,
      outcomeEvidenceStatus: status
    });
    if (utf8Bytes(promptText) > AI_PACK_PROMPT_MAX_BYTES) {
      fail(ERROR_CODES.DEMO_BUY_AI_PACK_EXPORT_ERROR);
    }

    const sharingSummary = Object.freeze({
      contextValuesPreserved: sharingContext.preservedValueCount,
      contextValuesRedactedForSharing: sharingContext.redactedValueCount,
      operationalHistoryFieldsOmittedPerRecord: OMITTED_OPERATIONAL_HISTORY_FIELDS.length,
      operationalHistoryValuesOmitted: OMITTED_OPERATIONAL_HISTORY_FIELDS.length * (before.length + after.length + 1)
    });
    const manifest = buildManifest({
      productVersion,
      generatedAtMs,
      authority,
      baseline,
      preWindowStartMs,
      postWindowEndMs,
      before,
      after,
      evidenceWatermarkMs,
      outcomeEvidenceStatus: status,
      targetInScannerContext,
      sharingSummary
    });

    const fileContents = new Map([
      ["README.md", buildReadme({ outcomeEvidenceStatus: status, targetInScannerContext })],
      ["PROMPT.md", promptText],
      ["MANIFEST.json", prettyJson(manifest)],
      ["QUERY.sql", authority.sourceQuerySql],
      ["SCANNER_CONTEXT.json", prettyJson(sharingContext.context)],
      ["TARGET_BEFORE.jsonl", before.length === 0 ? "" : `${before.map(jsonLine).join("\n")}\n`],
      ["BASELINE.json", prettyJson(baseline)],
      ["TARGET_AFTER.jsonl", after.length === 0 ? "" : `${after.map(jsonLine).join("\n")}\n`],
      ["OUTCOME.json", prettyJson(outcome)],
      ["FIELD_GUIDE.md", FIELD_GUIDE]
    ]);

    await mkdir(exportRoot, { recursive: true });
    const securityPart = sanitizeDirectoryPart(securityId);
    let tempPath = null;
    let finalPath = null;
    let finalName = null;

    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const suffix = sanitizeDirectoryPart(createSuffix()).slice(0, 36) || "pack";
        finalName = `capture-${captureId}-security-${securityPart}-${generatedAtMs}-${suffix}`;
        finalPath = path.join(exportRoot, finalName);
        if (!(await pathExists(finalPath))) break;
        finalPath = null;
      }
      if (finalPath === null) fail(ERROR_CODES.DEMO_BUY_AI_PACK_EXPORT_ERROR);

      tempPath = path.join(exportRoot, `.tmp-${finalName}`);
      await mkdir(tempPath, { recursive: false });
      let written = 0;
      for (const name of AI_PACK_FILE_NAMES) {
        await durableWrite(path.join(tempPath, name), fileContents.get(name));
        written += 1;
        if (written === 1) fault?.hit?.("AI_PACK_AFTER_FIRST_FILE");
      }
      fault?.hit?.("AI_PACK_BEFORE_RENAME");
      await rename(tempPath, finalPath);
      tempPath = null;
    } catch (error) {
      if (tempPath !== null) {
        try {
          await rm(tempPath, { recursive: true, force: true });
        } catch {
          // Preserve the original export error.
        }
      }
      if (error instanceof ProtocolValidationError) throw error;
      fail(ERROR_CODES.DEMO_BUY_AI_PACK_EXPORT_ERROR);
    }

    const exportPathRelative = `${AI_PACK_RELATIVE_ROOT}/${finalName}`;
    return Object.freeze({
      exportPathRelative,
      packFormatVersion: AI_PACK_FORMAT_VERSION,
      outcomeEvidenceStatus: status,
      targetInScannerContext,
      generatedAtMs,
      promptText,
      fileCount: AI_PACK_FILE_NAMES.length,
      fileNames: AI_PACK_FILE_NAMES,
      recordCounts: Object.freeze({
        scannerContextRows: authority.context.retainedRowCount,
        targetBefore: before.length,
        baseline: 1,
        targetAfter: after.length,
        outcomeHorizons: 10
      }),
      sharingSummary
    });
  }

  return Object.freeze({ create });
}
