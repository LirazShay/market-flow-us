export const DEMO_BUY_HORIZON_LABELS = Object.freeze(new Map([
  [10000, "10s"],
  [20000, "20s"],
  [30000, "30s"],
  [45000, "45s"],
  [60000, "60s"],
  [90000, "90s"],
  [120000, "120s"],
  [180000, "3m"],
  [300000, "5m"],
  [600000, "10m"]
]));

export const DEMO_BUY_VIEW_STATE = Object.freeze({
  LOADING: "LOADING",
  READY: "READY",
  ERROR: "ERROR"
});

function errorMessage(error, fallback) {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

function freezePage(page) {
  if (!page || !Array.isArray(page.items)) {
    throw new TypeError("Demo Buy page must expose items.");
  }
  if (page.nextCursor !== null && page.nextCursor !== undefined && typeof page.nextCursor !== "string") {
    throw new TypeError("Demo Buy nextCursor must be null or a string.");
  }
  return Object.freeze({
    items: Object.freeze([...page.items]),
    hasMore: page.hasMore === true,
    nextCursor: page.nextCursor ?? null
  });
}

function freezeRecord(record) {
  return Object.freeze({ ...record });
}

export function createInitialDemoBuyModel() {
  return Object.freeze({
    state: DEMO_BUY_VIEW_STATE.LOADING,
    pages: Object.freeze([]),
    firstPageError: null,
    continuationError: null,
    observationErrors: Object.freeze({}),
    provenance: Object.freeze({})
  });
}

export function applyDemoBuyFirstPage(model, page) {
  const frozenPage = freezePage(page);
  return Object.freeze({
    ...model,
    state: DEMO_BUY_VIEW_STATE.READY,
    pages: Object.freeze([frozenPage]),
    firstPageError: null,
    continuationError: null
  });
}

export function applyDemoBuyFirstPageError(model, error) {
  const hasTrustedData = model.pages.length > 0;
  return Object.freeze({
    ...model,
    state: hasTrustedData ? DEMO_BUY_VIEW_STATE.READY : DEMO_BUY_VIEW_STATE.ERROR,
    firstPageError: errorMessage(error, "Demo Buy latest refresh failed.")
  });
}

export function applyDemoBuyContinuation(model, page) {
  const frozenPage = freezePage(page);
  return Object.freeze({
    ...model,
    state: DEMO_BUY_VIEW_STATE.READY,
    pages: Object.freeze([...model.pages, frozenPage]),
    continuationError: null
  });
}

export function applyDemoBuyContinuationError(model, error) {
  return Object.freeze({
    ...model,
    continuationError: errorMessage(error, "Demo Buy continuation failed.")
  });
}

export function demoBuyObservationKey(captureId, securityId) {
  return `${captureId}\u0000${securityId}`;
}

export function replaceDemoBuyObservation(model, observation) {
  const key = demoBuyObservationKey(observation.capture.captureId, observation.securityId);
  let replaced = false;
  const pages = model.pages.map((page) => {
    const items = page.items.map((item) => {
      if (demoBuyObservationKey(item.capture.captureId, item.securityId) !== key) return item;
      replaced = true;
      return observation;
    });
    return Object.freeze({ ...page, items: Object.freeze(items) });
  });

  if (!replaced) {
    throw new Error("Targeted Demo Buy observation is not present in the loaded page walk.");
  }

  const observationErrors = { ...model.observationErrors };
  delete observationErrors[key];
  return Object.freeze({
    ...model,
    pages: Object.freeze(pages),
    observationErrors: freezeRecord(observationErrors)
  });
}

export function applyDemoBuyObservationError(model, captureId, securityId, error) {
  const key = demoBuyObservationKey(captureId, securityId);
  return Object.freeze({
    ...model,
    observationErrors: freezeRecord({
      ...model.observationErrors,
      [key]: errorMessage(error, "Demo Buy observation refresh failed.")
    })
  });
}

export function applyDemoBuyProvenanceLoading(model, captureId) {
  const previous = model.provenance[captureId];
  return Object.freeze({
    ...model,
    provenance: freezeRecord({
      ...model.provenance,
      [captureId]: Object.freeze({
        state: "LOADING",
        data: previous?.data ?? null,
        error: null
      })
    })
  });
}

export function applyDemoBuyProvenance(model, captureId, data) {
  return Object.freeze({
    ...model,
    provenance: freezeRecord({
      ...model.provenance,
      [captureId]: Object.freeze({ state: "READY", data, error: null })
    })
  });
}

export function applyDemoBuyProvenanceError(model, captureId, error) {
  const previous = model.provenance[captureId];
  return Object.freeze({
    ...model,
    provenance: freezeRecord({
      ...model.provenance,
      [captureId]: Object.freeze({
        state: previous?.data ? "READY" : "ERROR",
        data: previous?.data ?? null,
        error: errorMessage(error, "Demo Buy provenance read failed.")
      })
    })
  });
}

export function currentDemoBuyContinuation(model) {
  const page = model.pages.at(-1);
  return page?.hasMore === true ? page.nextCursor : null;
}

export function groupDemoBuyPages(model) {
  const renderedPages = [];
  let previousLastCaptureId = null;

  for (const page of model.pages) {
    const groups = [];
    let group = null;

    for (const item of page.items) {
      const captureId = item.capture.captureId;
      if (group === null || group.capture.captureId !== captureId) {
        if (group !== null) groups.push(Object.freeze(group));
        group = {
          capture: item.capture,
          continued: groups.length === 0 && previousLastCaptureId === captureId,
          items: []
        };
      }
      group.items.push(item);
    }

    if (group !== null) groups.push(Object.freeze(group));
    for (const renderedGroup of groups) Object.freeze(renderedGroup.items);

    const lastItem = page.items.at(-1);
    previousLastCaptureId = lastItem?.capture?.captureId ?? previousLastCaptureId;
    renderedPages.push(Object.freeze({
      groups: Object.freeze(groups),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
    }));
  }

  return Object.freeze(renderedPages);
}

export function demoBuyHorizonProgress(observation) {
  const total = observation.horizons.length;
  const observed = observation.horizons.filter((horizon) => horizon.observedAtMs !== null).length;
  return Object.freeze({ observed, total });
}

function numberText(value, options = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", options);
}

export function formatDemoBuyPrice(value) {
  if (value === null || value === undefined) return "—";
  return `$${numberText(value, { maximumFractionDigits: 6 })}`;
}

export function formatDemoBuyPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%`;
}

export function describeDemoBuyHorizon(horizon) {
  if (horizon.unavailableReason === "NO_FUTURE_OBSERVATION") {
    return Object.freeze({
      kind: "pending",
      primary: "Pending / ממתין",
      secondary: "",
      observed: false
    });
  }

  if (horizon.outcome === "UNAVAILABLE") {
    const reason = horizon.unavailableReason === "BASELINE_PRICE_UNAVAILABLE"
      ? "baseline Price unavailable"
      : horizon.unavailableReason === "BASELINE_PRICE_ZERO"
        ? "baseline Price is zero"
        : horizon.unavailableReason === "FUTURE_PRICE_UNAVAILABLE"
          ? "future Price unavailable"
          : "outcome unavailable";
    return Object.freeze({
      kind: "warning",
      primary: "UNAVAILABLE ⚠",
      secondary: reason,
      observed: horizon.observedAtMs !== null
    });
  }

  const direction = horizon.outcome === "UP"
    ? "UP ▲"
    : horizon.outcome === "DOWN"
      ? "DOWN ▼"
      : "FLAT →";
  return Object.freeze({
    kind: horizon.outcome.toLowerCase(),
    primary: `${direction} ${formatDemoBuyPercent(horizon.changePercent)}`.trim(),
    secondary: formatDemoBuyPrice(horizon.price),
    observed: horizon.observedAtMs !== null
  });
}

export function formatDemoBuyTimestamp(value) {
  if (!Number.isSafeInteger(Number(value))) return "—";
  return new Date(Number(value)).toLocaleTimeString("he-IL", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function demoBuyCaptureModeText(capture) {
  const automatic = capture.isAutomatic === true ? "Automatic" : "Manual";
  const selection = capture.selectionMode === "top_x"
    ? `Top ${capture.topX}`
    : capture.selectionMode === "all"
      ? "All"
      : "Selected";
  return `${automatic} · ${selection}`;
}
