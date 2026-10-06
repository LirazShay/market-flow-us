import { validateDemoBuyCapturePayload } from "../../shared/demo-buy/capture.js";
import { shapeDemoBuyScannerContext } from "../../shared/demo-buy/context.js";
import {
  DEMO_BUY_IDENTITY_COLUMN_NAMES,
  DEMO_BUY_MAX_CAPTURE_ITEMS,
  DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS,
  DEMO_BUY_MAX_SOURCE_SQL_BYTES
} from "../../shared/demo-buy/limits.js";
import { DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT } from "./client.js";

const UTF8 = new TextEncoder();
const IDENTITY_NAMES = new Set(DEMO_BUY_IDENTITY_COLUMN_NAMES);

export const DEMO_BUY_AUTO_MODE = Object.freeze({
  OFF: "off",
  ALL: "all",
  TOP_X: "top_x"
});

export const DEMO_BUY_CAPTURE_PRECHECK = Object.freeze({
  NO_RENDERED_GENERATION: "NO_RENDERED_GENERATION",
  IDENTITY_COLUMN: "IDENTITY_COLUMN",
  INVALID_IDENTITY: "INVALID_IDENTITY",
  EMPTY_SELECTION: "EMPTY_SELECTION",
  INVALID_TOP_X: "INVALID_TOP_X",
  UNIQUE_ITEM_LIMIT: "UNIQUE_ITEM_LIMIT",
  SOURCE_SQL_LIMIT: "SOURCE_SQL_LIMIT",
  CONTEXT_UNSHAPABLE: "CONTEXT_UNSHAPABLE",
  CAPTURE_BUSY: "CAPTURE_BUSY",
  CAPTURE_LOCKED: "CAPTURE_LOCKED"
});

export const DEMO_BUY_AI_EXPORT_PRECHECK = Object.freeze({
  BUSY: "AI_EXPORT_BUSY",
  UNAVAILABLE: "AI_EXPORT_UNAVAILABLE"
});

export class DemoBuyCapturePrecheckError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "DemoBuyCapturePrecheckError";
    this.code = code;
    this.details = details;
  }
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function.`);
  }
}

function cloneJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Scanner result contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneJsonValue(item);
    return copy;
  }
  throw new TypeError("Scanner result contains a non-JSON-safe value.");
}

function validateGeneration(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("Scanner generation is invalid.");
  }
  const query = raw.query;
  const result = raw.result;
  if (
    !query
    || typeof query.sql !== "string"
    || query.sql.length === 0
    || (query.queryId !== null && (typeof query.queryId !== "string" || query.queryId.length === 0))
    || (query.name !== null && (typeof query.name !== "string" || query.name.length === 0))
    || !Number.isSafeInteger(query.intervalMs)
    || query.intervalMs < 1
  ) {
    throw new TypeError("Scanner generation query provenance is invalid.");
  }
  if (
    !result
    || !Array.isArray(result.columns)
    || !Array.isArray(result.rows)
    || result.rows.length !== result.rowCount
    || !Number.isSafeInteger(result.rowCount)
    || result.rowCount < 0
    || !Number.isSafeInteger(result.startedAtMs)
    || result.startedAtMs < 0
    || !Number.isSafeInteger(result.completedAtMs)
    || result.completedAtMs < 0
  ) {
    throw new TypeError("Scanner generation result is invalid.");
  }

  const columns = result.columns.map((column) => {
    if (!column || typeof column.name !== "string" || column.name.length === 0) {
      throw new TypeError("Scanner generation column metadata is invalid.");
    }
    return Object.freeze({
      name: column.name,
      type: typeof column.type === "string" ? column.type : null
    });
  });
  const rows = result.rows.map((row) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      throw new TypeError("Scanner generation row shape is invalid.");
    }
    return Object.freeze(row.map(cloneJsonValue));
  });

  return Object.freeze({
    generation: Number.isSafeInteger(raw.generation) ? raw.generation : null,
    query: Object.freeze({
      queryId: query.queryId,
      name: query.name,
      sql: query.sql,
      intervalMs: query.intervalMs
    }),
    result: Object.freeze({
      startedAtMs: result.startedAtMs,
      completedAtMs: result.completedAtMs,
      rowCount: result.rowCount,
      columns: Object.freeze(columns),
      rows: Object.freeze(rows)
    })
  });
}

function identityColumnIndex(columns) {
  const matches = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (IDENTITY_NAMES.has(columns[index].name)) matches.push(index);
  }
  return matches.length === 1 ? matches[0] : -1;
}

function canonicalSecurityId(value) {
  return (
    typeof value === "string"
    && value.trim().length > 0
    && value.length <= DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
  ) ? value : null;
}

function analyzeGeneration(generation) {
  const identityIndex = identityColumnIndex(generation.result.columns);
  const rowStates = generation.result.rows.map((row, index) => {
    const securityId = identityIndex === -1 ? null : canonicalSecurityId(row[identityIndex]);
    return Object.freeze({
      resultRank: index + 1,
      securityId,
      eligible: securityId !== null
    });
  });
  return Object.freeze({
    capable: identityIndex !== -1,
    identityColumnIndex: identityIndex,
    sourceRowCount: generation.result.rowCount,
    eligibleRowCount: rowStates.filter((row) => row.eligible).length,
    invalidRowCount: rowStates.filter((row) => !row.eligible).length,
    rows: Object.freeze(rowStates)
  });
}

function precheckError(code, message, details = null) {
  return new DemoBuyCapturePrecheckError(code, message, details);
}

function normalizeTopX(value, rowCount) {
  const max = Math.min(rowCount, DEMO_BUY_MAX_CAPTURE_ITEMS);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.INVALID_TOP_X,
      max === 0
        ? "Demo Buy Top X is unavailable because the Scanner result has no rows."
        : `Demo Buy Top X must be between 1 and ${max}.`,
      { min: max === 0 ? null : 1, max }
    );
  }
  return value;
}

function chosenRanks({ selectionMode, selectedRanks, topX, rowCount }) {
  if (selectionMode === "manual") {
    const ranks = [...selectedRanks].sort((left, right) => left - right);
    if (ranks.length === 0) {
      throw precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.EMPTY_SELECTION,
        "Select at least one eligible Scanner row before creating a Demo Buy."
      );
    }
    return ranks;
  }
  if (selectionMode === "all") {
    return Array.from({ length: rowCount }, (_, index) => index + 1);
  }
  if (selectionMode === "top_x") {
    const count = normalizeTopX(topX, rowCount);
    return Array.from({ length: count }, (_, index) => index + 1);
  }
  throw new TypeError("Demo Buy selection mode is invalid.");
}

function prepareCapture(generation, analysis, selectedRanks, { selectionMode, topX, isAutomatic }) {
  if (!analysis.capable) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.IDENTITY_COLUMN,
      "Return exactly one securityId/security_id column to use Demo Buy."
    );
  }
  if (UTF8.encode(generation.query.sql).byteLength > DEMO_BUY_MAX_SOURCE_SQL_BYTES) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.SOURCE_SQL_LIMIT,
      "The active Scanner SQL is above the Demo Buy provenance-size limit."
    );
  }

  const ranks = chosenRanks({
    selectionMode,
    selectedRanks,
    topX,
    rowCount: generation.result.rowCount
  });
  const seen = new Set();
  const items = [];

  for (const resultRank of ranks) {
    const row = analysis.rows[resultRank - 1];
    if (!row || !row.eligible) {
      throw precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.INVALID_IDENTITY,
        `Scanner source position ${resultRank} has an invalid securityId/security_id value.`,
        { resultRank }
      );
    }
    if (seen.has(row.securityId)) continue;
    seen.add(row.securityId);
    items.push({ securityId: row.securityId, resultRank });
  }

  if (items.length > DEMO_BUY_MAX_CAPTURE_ITEMS) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.UNIQUE_ITEM_LIMIT,
      `Demo Buy supports at most ${DEMO_BUY_MAX_CAPTURE_ITEMS} unique securities per capture.`,
      { uniqueItemCount: items.length }
    );
  }
  if (items.length === 0) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.EMPTY_SELECTION,
      "The selected Scanner rows do not contain a capturable security."
    );
  }

  let context;
  try {
    context = shapeDemoBuyScannerContext({
      columns: generation.result.columns,
      rows: generation.result.rows
    });
  } catch (error) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.CONTEXT_UNSHAPABLE,
      error instanceof Error ? error.message : "Scanner context cannot be shaped within Demo Buy bounds."
    );
  }

  const payload = {
    items,
    sourceQuery: {
      queryId: generation.query.queryId,
      name: generation.query.name,
      sql: generation.query.sql,
      intervalMs: generation.query.intervalMs
    },
    sourceResult: {
      startedAtMs: generation.result.startedAtMs,
      completedAtMs: generation.result.completedAtMs,
      rowCount: generation.result.rowCount,
      context
    },
    selectionMode,
    isAutomatic,
    topX: selectionMode === "top_x" ? topX : null
  };

  try {
    validateDemoBuyCapturePayload(payload);
  } catch (error) {
    throw precheckError(
      DEMO_BUY_CAPTURE_PRECHECK.CONTEXT_UNSHAPABLE,
      error instanceof Error ? error.message : "Demo Buy capture provenance is invalid."
    );
  }

  return Object.freeze({
    payload: Object.freeze(payload),
    sourceRowCount: ranks.length,
    uniqueItemCount: items.length
  });
}

export function createDemoBuyCaptureController({
  client,
  now = () => Date.now()
} = {}) {
  if (!client || typeof client.captureDemoBuy !== "function") {
    throw new TypeError("client must expose captureDemoBuy().");
  }
  assertFunction(now, "now");

  let renderedGeneration = null;
  let renderedAnalysis = null;
  let selectedRanks = new Set();
  let autoMode = DEMO_BUY_AUTO_MODE.OFF;
  let autoTopX = null;
  let captureBusy = false;
  let captureLocked = false;
  let autoBusySkippedCount = 0;
  let autoBlockedReason = null;
  let lastAutoReason = null;
  let lastCapture = null;
  let aiExportBusy = false;
  let aiExportTargetKey = null;
  let lastAiExport = null;
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({
      autoMode,
      autoTopX,
      captureBusy,
      captureLocked,
      autoBusySkippedCount,
      autoBlockedReason,
      lastAutoReason,
      lastCapture,
      aiExportBusy,
      aiExportTargetKey,
      lastAiExport,
      selectedCount: selectedRanks.size,
      rendered: renderedGeneration === null ? null : Object.freeze({
        generation: renderedGeneration.generation,
        queryId: renderedGeneration.query.queryId,
        queryName: renderedGeneration.query.name,
        completedAtMs: renderedGeneration.result.completedAtMs,
        sourceRowCount: renderedAnalysis.sourceRowCount,
        eligibleRowCount: renderedAnalysis.eligibleRowCount,
        invalidRowCount: renderedAnalysis.invalidRowCount,
        capable: renderedAnalysis.capable
      })
    });
  }

  function emit() {
    const state = snapshot();
    for (const listener of listeners) listener(state);
    return state;
  }

  function subscribe(listener) {
    assertFunction(listener, "listener");
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function setRenderedGeneration(rawGeneration) {
    renderedGeneration = validateGeneration(rawGeneration);
    renderedAnalysis = analyzeGeneration(renderedGeneration);
    selectedRanks = new Set();
    autoBlockedReason = null;
    lastAutoReason = null;
    emit();
    return Object.freeze({
      generation: renderedGeneration,
      analysis: renderedAnalysis
    });
  }

  function getRenderedGeneration() {
    return renderedGeneration;
  }

  function getRenderedAnalysis() {
    return renderedAnalysis;
  }

  function setSelected(resultRank, selected) {
    if (!renderedAnalysis) {
      throw precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.NO_RENDERED_GENERATION,
        "Run a Scanner query before selecting Demo Buy rows."
      );
    }
    if (!Number.isSafeInteger(resultRank) || resultRank < 1 || resultRank > renderedAnalysis.sourceRowCount) {
      throw new RangeError("Scanner resultRank is outside the rendered generation.");
    }
    const row = renderedAnalysis.rows[resultRank - 1];
    if (!row.eligible) {
      throw precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.INVALID_IDENTITY,
        `Scanner source position ${resultRank} is not eligible for Demo Buy.`,
        { resultRank }
      );
    }
    if (selected === true) selectedRanks.add(resultRank);
    else selectedRanks.delete(resultRank);
    return emit();
  }

  function setAutoMode(mode, topX = null) {
    if (!Object.values(DEMO_BUY_AUTO_MODE).includes(mode)) {
      throw new TypeError("Demo Buy Auto mode is invalid.");
    }
    if (mode === DEMO_BUY_AUTO_MODE.TOP_X) {
      if (!Number.isSafeInteger(topX) || topX < 1 || topX > DEMO_BUY_MAX_CAPTURE_ITEMS) {
        throw new RangeError(`Auto Demo Buy Top X must be between 1 and ${DEMO_BUY_MAX_CAPTURE_ITEMS}.`);
      }
      autoTopX = topX;
    } else {
      autoTopX = null;
    }
    autoMode = mode;
    autoBusySkippedCount = 0;
    autoBlockedReason = null;
    lastAutoReason = null;
    return emit();
  }

  function turnAutoOff() {
    return setAutoMode(DEMO_BUY_AUTO_MODE.OFF);
  }

  function preview(selectionMode, topX = null) {
    if (!renderedGeneration || !renderedAnalysis) {
      throw precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.NO_RENDERED_GENERATION,
        "Run a Scanner query before creating a Demo Buy."
      );
    }
    const prepared = prepareCapture(
      renderedGeneration,
      renderedAnalysis,
      selectedRanks,
      { selectionMode, topX, isAutomatic: false }
    );
    return Object.freeze({
      sourceRowCount: prepared.sourceRowCount,
      uniqueItemCount: prepared.uniqueItemCount
    });
  }

  async function captureCurrent({ selectionMode, topX = null, isAutomatic = false }) {
    if (captureLocked) {
      const error = precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_LOCKED,
        "Demo Buy capture result is unknown. Relaunch the Viewer and refresh Demo Buy before another capture."
      );
      if (isAutomatic) {
        autoBlockedReason = error.message;
        lastAutoReason = DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_LOCKED;
        emit();
      }
      return Object.freeze({ started: false, reason: error.code, error });
    }
    if (captureBusy) {
      if (isAutomatic) {
        autoBusySkippedCount += 1;
        lastAutoReason = DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_BUSY;
        emit();
      }
      const error = precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.CAPTURE_BUSY,
        "Another Demo Buy capture is already in progress."
      );
      return Object.freeze({ started: false, reason: error.code, error });
    }
    if (!renderedGeneration || !renderedAnalysis) {
      const error = precheckError(
        DEMO_BUY_CAPTURE_PRECHECK.NO_RENDERED_GENERATION,
        "Run a Scanner query before creating a Demo Buy."
      );
      return Object.freeze({ started: false, reason: error.code, error });
    }

    let prepared;
    try {
      // This synchronously freezes selection + generation provenance before the async request starts.
      prepared = prepareCapture(
        renderedGeneration,
        renderedAnalysis,
        new Set(selectedRanks),
        { selectionMode, topX, isAutomatic }
      );
    } catch (error) {
      const normalized = error instanceof DemoBuyCapturePrecheckError
        ? error
        : precheckError(
          DEMO_BUY_CAPTURE_PRECHECK.CONTEXT_UNSHAPABLE,
          error instanceof Error ? error.message : "Demo Buy capture preflight failed."
        );
      if (isAutomatic) {
        autoBlockedReason = normalized.message;
        lastAutoReason = normalized.code;
        emit();
      }
      return Object.freeze({ started: false, reason: normalized.code, error: normalized });
    }

    captureBusy = true;
    autoBlockedReason = null;
    lastAutoReason = null;
    emit();

    try {
      const result = await client.captureDemoBuy(prepared.payload);
      const completedAtMs = now();
      lastCapture = Object.freeze({
        status: result.status,
        captureId: result.captureId ?? null,
        capturedAtMs: result.capturedAtMs ?? null,
        capturedItemCount: result.capturedItemCount ?? null,
        sourceRowCount: prepared.sourceRowCount,
        uniqueItemCount: prepared.uniqueItemCount,
        selectionMode,
        isAutomatic,
        topX: selectionMode === "top_x" ? topX : null,
        completedAtMs,
        code: result.code ?? null,
        message: result.message ?? null
      });
      if (result.status === DEMO_BUY_CAPTURE_ACKNOWLEDGEMENT.UNKNOWN) {
        captureLocked = true;
      }
      return Object.freeze({ started: true, result: lastCapture });
    } catch (error) {
      lastCapture = Object.freeze({
        status: "CLIENT_ERROR",
        captureId: null,
        capturedAtMs: null,
        capturedItemCount: null,
        sourceRowCount: prepared.sourceRowCount,
        uniqueItemCount: prepared.uniqueItemCount,
        selectionMode,
        isAutomatic,
        topX: selectionMode === "top_x" ? topX : null,
        completedAtMs: now(),
        code: typeof error?.code === "string" ? error.code : null,
        message: error instanceof Error ? error.message : "Demo Buy capture could not be dispatched."
      });
      return Object.freeze({ started: true, result: lastCapture, error });
    } finally {
      captureBusy = false;
      emit();
    }
  }

  async function captureSelected() {
    return await captureCurrent({ selectionMode: "manual" });
  }

  async function captureAll() {
    return await captureCurrent({ selectionMode: "all" });
  }

  async function captureTopX(topX) {
    return await captureCurrent({ selectionMode: "top_x", topX });
  }

  async function captureAutomaticGeneration() {
    if (autoMode === DEMO_BUY_AUTO_MODE.OFF) {
      return Object.freeze({ started: false, reason: "AUTO_OFF" });
    }
    if (!renderedGeneration || renderedGeneration.result.rowCount === 0) {
      autoBlockedReason = null;
      lastAutoReason = "NO_CANDIDATES";
      emit();
      return Object.freeze({ started: false, reason: "NO_CANDIDATES" });
    }
    return await captureCurrent({
      selectionMode: autoMode === DEMO_BUY_AUTO_MODE.ALL ? "all" : "top_x",
      topX: autoMode === DEMO_BUY_AUTO_MODE.TOP_X ? autoTopX : null,
      isAutomatic: true
    });
  }

  async function createAiPack(captureId, securityId) {
    if (!Number.isSafeInteger(captureId) || captureId < 1) {
      throw new TypeError("captureId must be a positive safe integer.");
    }
    if (
      typeof securityId !== "string"
      || securityId.length === 0
      || securityId.length > DEMO_BUY_MAX_SECURITY_ID_CODE_UNITS
    ) {
      throw new TypeError("securityId must be a non-empty bounded string.");
    }
    if (typeof client.createDemoBuyAiPack !== "function") {
      return Object.freeze({
        started: false,
        reason: DEMO_BUY_AI_EXPORT_PRECHECK.UNAVAILABLE
      });
    }
    if (aiExportBusy) {
      return Object.freeze({
        started: false,
        reason: DEMO_BUY_AI_EXPORT_PRECHECK.BUSY
      });
    }

    aiExportBusy = true;
    aiExportTargetKey = `${captureId}\u0000${securityId}`;
    emit();

    try {
      const result = await client.createDemoBuyAiPack(captureId, securityId);
      lastAiExport = Object.freeze({
        captureId,
        securityId,
        status: result.status ?? "UNKNOWN",
        completedAtMs: now(),
        outcomeEvidenceStatus: result.outcomeEvidenceStatus ?? null,
        targetInScannerContext: result.targetInScannerContext ?? null,
        exportPathRelative: result.exportPathRelative ?? null,
        fileCount: result.fileCount ?? null
      });
      return Object.freeze({ started: true, result });
    } catch (error) {
      lastAiExport = Object.freeze({
        captureId,
        securityId,
        status: "CLIENT_ERROR",
        completedAtMs: now(),
        outcomeEvidenceStatus: null,
        targetInScannerContext: null,
        exportPathRelative: null,
        fileCount: null
      });
      return Object.freeze({ started: true, error });
    } finally {
      aiExportBusy = false;
      aiExportTargetKey = null;
      emit();
    }
  }

  return Object.freeze({
    subscribe,
    getState: snapshot,
    setRenderedGeneration,
    getRenderedGeneration,
    getRenderedAnalysis,
    setSelected,
    setAutoMode,
    turnAutoOff,
    preview,
    captureSelected,
    captureAll,
    captureTopX,
    captureAutomaticGeneration,
    createAiPack
  });
}
