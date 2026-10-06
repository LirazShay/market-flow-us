import {
  DEMO_BUY_HORIZON_LABELS,
  DEMO_BUY_VIEW_STATE,
  applyDemoBuyContinuation,
  applyDemoBuyContinuationError,
  applyDemoBuyFirstPage,
  applyDemoBuyFirstPageError,
  applyDemoBuyObservationError,
  applyDemoBuyProvenance,
  applyDemoBuyProvenanceError,
  applyDemoBuyProvenanceLoading,
  createInitialDemoBuyModel,
  currentDemoBuyContinuation,
  demoBuyCaptureModeText,
  demoBuyHorizonProgress,
  demoBuyObservationKey,
  describeDemoBuyHorizon,
  formatDemoBuyPrice,
  formatDemoBuyTimestamp,
  groupDemoBuyPages,
  replaceDemoBuyObservation
} from "./demo-buy-model.js";

function assertElement(root) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("root must be a DOM element.");
  }
}

function assertClient(client) {
  if (
    !client
    || typeof client.getDemoBuyPage !== "function"
    || typeof client.getDemoBuyObservation !== "function"
    || typeof client.getDemoBuyCapture !== "function"
  ) {
    throw new TypeError(
      "client must expose getDemoBuyPage(), getDemoBuyObservation() and getDemoBuyCapture()."
    );
  }
}

function text(document, tagName, value, className = "") {
  const element = document.createElement(tagName);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function field(document, label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "market-flow-us-demo-buy-field";
  const term = text(document, "dt", label);
  const description = text(document, "dd", value);
  wrapper.append(term, description);
  return wrapper;
}

function captureLabel(capture) {
  return capture.sourceQueryName ?? capture.sourceQueryId ?? "Unsaved query";
}

function observedDetails(horizon) {
  const parts = [
    `Target: ${horizon.targetAtMs}`,
    `Observed: ${horizon.observedAtMs ?? "—"}`,
    `Elapsed: ${horizon.actualElapsedMs ?? "—"}`
  ];
  if (horizon.unavailableReason) parts.push(`Reason: ${horizon.unavailableReason}`);
  if (horizon.timingAnomaly) parts.push(`Timing anomaly: ${horizon.timingAnomaly}`);
  return parts.join("\n");
}

const STICKY_RIGHT = Object.freeze([0, 88, 280, 430]);

function makeSticky(cell, index) {
  cell.classList.add("market-flow-us-demo-buy-sticky");
  cell.style.position = "sticky";
  cell.style.right = `${STICKY_RIGHT[index]}px`;
  cell.style.zIndex = cell.tagName === "TH" ? "3" : "2";
  cell.style.background = cell.tagName === "TH" ? "#eef1f4" : "#fff";
}

export function createDemoBuySurface({ root, client } = {}) {
  assertElement(root);
  assertClient(client);

  const document = root.ownerDocument;
  let model = createInitialDemoBuyModel();
  let started = false;
  let destroyed = false;
  let refreshBusy = false;
  let continuationBusy = false;
  const observationBusy = new Set();
  const openObservationDetails = new Set();
  const openProvenance = new Set();

  const shell = document.createElement("section");
  shell.className = "market-flow-us-demo-buy";
  shell.dir = "rtl";

  const heading = text(document, "h1", "Demo Buy");
  const intro = text(
    document,
    "p",
    "תצפיות וירטואליות מה־Scanner מול Price עתידי. אין כאן הוראות מסחר או סימולציית ביצוע."
  );

  const controls = document.createElement("div");
  controls.className = "market-flow-us-demo-buy-controls";

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "Refresh latest";

  const globalStatus = document.createElement("span");
  globalStatus.setAttribute("aria-live", "polite");

  controls.append(refreshButton, globalStatus);

  const content = document.createElement("div");
  content.className = "market-flow-us-demo-buy-content";

  shell.append(heading, intro, controls, content);
  root.replaceChildren(shell);

  function captureHorizontalScroll() {
    const scroll = new Map();
    for (const element of content.querySelectorAll?.("[data-demo-buy-scroll-key]") ?? []) {
      scroll.set(element.dataset.demoBuyScrollKey, element.scrollLeft);
    }
    return scroll;
  }

  function restoreHorizontalScroll(scroll) {
    for (const element of content.querySelectorAll?.("[data-demo-buy-scroll-key]") ?? []) {
      const value = scroll.get(element.dataset.demoBuyScrollKey);
      if (typeof value === "number") element.scrollLeft = value;
    }
  }

  function renderProvenance(captureId) {
    if (!openProvenance.has(captureId)) return null;

    const panel = document.createElement("section");
    panel.className = "market-flow-us-demo-buy-provenance";
    panel.setAttribute("aria-label", `Demo Buy capture ${captureId} provenance`);
    const state = model.provenance[captureId];

    if (!state || state.state === "LOADING") {
      const loading = text(document, "p", "Loading provenance / SQL…");
      loading.setAttribute("role", "status");
      panel.append(loading);
      return panel;
    }

    if (state.error) {
      const alert = text(document, "p", `Provenance error: ${state.error}`);
      alert.setAttribute("role", "alert");
      panel.append(alert);
    }

    if (!state.data) return panel;

    const provenance = state.data;
    const list = document.createElement("dl");
    list.className = "market-flow-us-demo-buy-provenance-fields";
    list.append(
      field(document, "Query", provenance.sourceQueryName ?? provenance.sourceQueryId ?? "Unsaved query"),
      field(document, "Query ID", provenance.sourceQueryId ?? "—"),
      field(document, "Scanner interval", `${provenance.sourceIntervalMs} ms`),
      field(document, "Scanner started (raw)", String(provenance.sourceResultStartedAtMs)),
      field(document, "Scanner completed (raw)", String(provenance.sourceResultCompletedAtMs)),
      field(document, "Source rows", String(provenance.sourceResultRowCount)),
      field(document, "Capture mode", demoBuyCaptureModeText(provenance)),
      field(document, "Captured items", String(provenance.capturedItemCount)),
      field(document, "Captured at (raw)", String(provenance.capturedAtMs)),
      field(document, "Timing anomaly", provenance.timingAnomaly ?? "None")
    );

    const authorityNote = text(
      document,
      "p",
      "Raw wall-clock timestamps are diagnostic only; writer/cycle ordering remains the authority boundary."
    );
    const sqlHeading = text(document, "h4", "Exact Scanner SQL");
    const sql = text(document, "pre", provenance.sourceQuerySql);
    sql.dir = "ltr";

    panel.append(list, authorityNote, sqlHeading, sql);
    return panel;
  }

  async function loadProvenance(captureId) {
    if (destroyed) return;
    const current = model.provenance[captureId];
    if (current?.state === "LOADING") return;

    openProvenance.add(captureId);
    model = applyDemoBuyProvenanceLoading(model, captureId);
    render();

    try {
      const provenance = await client.getDemoBuyCapture(captureId);
      if (destroyed) return;
      model = applyDemoBuyProvenance(model, captureId, provenance);
    } catch (error) {
      if (destroyed) return;
      model = applyDemoBuyProvenanceError(model, captureId, error);
    }
    render();
  }

  function renderCaptureHeader(group, pageIndex, groupIndex) {
    const capture = group.capture;
    const header = document.createElement("header");
    header.className = "market-flow-us-demo-buy-capture-header";

    const title = text(
      document,
      "h2",
      `Capture #${capture.captureId}${group.continued ? " · continued" : ""}`
    );
    const list = document.createElement("dl");
    list.className = "market-flow-us-demo-buy-capture-fields";
    list.append(
      field(document, "Query", captureLabel(capture)),
      field(document, "Captured", formatDemoBuyTimestamp(capture.capturedAtMs)),
      field(document, "Scanner completed", formatDemoBuyTimestamp(capture.sourceResultCompletedAtMs)),
      field(document, "Mode", demoBuyCaptureModeText(capture)),
      field(
        document,
        "Captured items",
        capture.capturedItemCount === null || capture.capturedItemCount === undefined
          ? "—"
          : String(capture.capturedItemCount)
      )
    );

    if (capture.timingAnomaly) {
      const anomaly = text(document, "p", `Timing anomaly: ${capture.timingAnomaly}`);
      anomaly.className = "market-flow-us-demo-buy-warning";
      header.append(title, list, anomaly);
    } else {
      header.append(title, list);
    }

    const provenanceButton = document.createElement("button");
    provenanceButton.type = "button";
    provenanceButton.textContent = openProvenance.has(capture.captureId)
      ? "Hide provenance / SQL"
      : "View provenance / SQL";
    provenanceButton.addEventListener("click", () => {
      if (openProvenance.has(capture.captureId)) {
        openProvenance.delete(capture.captureId);
        render();
        return;
      }
      void loadProvenance(capture.captureId);
    });
    header.append(provenanceButton);

    const provenance = renderProvenance(capture.captureId);
    if (provenance) header.append(provenance);

    header.dataset.pageIndex = String(pageIndex);
    header.dataset.groupIndex = String(groupIndex);
    return header;
  }

  function renderObservationDetails(item) {
    const key = demoBuyObservationKey(item.capture.captureId, item.securityId);
    const wrapper = document.createElement("div");
    wrapper.className = "market-flow-us-demo-buy-observation-details";

    const progress = demoBuyHorizonProgress(item);
    wrapper.append(text(document, "p", `${progress.observed} / ${progress.total} horizons observed`));

    const timing = document.createElement("dl");
    timing.append(
      field(document, "Baseline cycle", String(item.baseline.cycleId)),
      field(document, "Baseline collected", String(item.baseline.collectedAtMs)),
      field(document, "Baseline age", item.baseline.ageMs === null ? "—" : `${item.baseline.ageMs} ms`),
      field(document, "Timing anomaly", item.timing.anomaly ?? "None")
    );
    wrapper.append(timing);

    const refreshObservationButton = document.createElement("button");
    refreshObservationButton.type = "button";
    refreshObservationButton.textContent = observationBusy.has(key)
      ? "Refreshing observation…"
      : "Refresh observation";
    refreshObservationButton.disabled = observationBusy.has(key);
    refreshObservationButton.addEventListener("click", () => {
      void refreshObservation(item.capture.captureId, item.securityId);
    });
    wrapper.append(refreshObservationButton);

    const error = model.observationErrors[key];
    if (error) {
      const alert = text(document, "p", `Observation refresh error: ${error}`);
      alert.setAttribute("role", "alert");
      wrapper.append(alert);
    }

    return wrapper;
  }

  function renderGroup(group, pageIndex, groupIndex) {
    const section = document.createElement("section");
    section.className = "market-flow-us-demo-buy-capture";
    section.dataset.captureId = String(group.capture.captureId);
    section.append(renderCaptureHeader(group, pageIndex, groupIndex));

    const scroll = document.createElement("div");
    scroll.className = "market-flow-us-demo-buy-scroll";
    scroll.style.overflowX = "auto";
    scroll.dataset.demoBuyScrollKey = `${pageIndex}:${groupIndex}:${group.capture.captureId}`;

    const table = document.createElement("table");
    table.className = "market-flow-us-demo-buy-table";
    table.setAttribute("aria-label", `Demo Buy capture ${group.capture.captureId}`);

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const leading = ["Scanner position", "Symbol / display name", "securityId", "baseline Price"];
    for (const [index, label] of leading.entries()) {
      const th = text(document, "th", label);
      th.scope = "col";
      makeSticky(th, index);
      headerRow.append(th);
    }

    const progressHeader = text(document, "th", "Progress");
    progressHeader.scope = "col";
    headerRow.append(progressHeader);

    for (const label of DEMO_BUY_HORIZON_LABELS.values()) {
      const th = text(document, "th", label);
      th.scope = "col";
      headerRow.append(th);
    }

    const actionHeader = text(document, "th", "Observation");
    actionHeader.scope = "col";
    headerRow.append(actionHeader);
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const item of group.items) {
      const tr = document.createElement("tr");
      tr.dataset.captureId = String(item.capture.captureId);
      tr.dataset.securityId = item.securityId;

      const position = text(document, "td", String(item.resultRank));
      makeSticky(position, 0);

      const displayIdentity = item.baseline.paperName === item.baseline.symbol || !item.baseline.symbol
        ? item.baseline.paperName
        : `${item.baseline.paperName} (${item.baseline.symbol})`;
      const identity = text(document, "td", displayIdentity ?? item.securityId);
      makeSticky(identity, 1);

      const securityId = text(document, "td", item.securityId);
      makeSticky(securityId, 2);

      const baseline = text(document, "td", formatDemoBuyPrice(item.baseline.price));
      baseline.dir = "ltr";
      makeSticky(baseline, 3);

      tr.append(position, identity, securityId, baseline);

      const progress = demoBuyHorizonProgress(item);
      tr.append(text(document, "td", `${progress.observed} / ${progress.total}`));

      for (const horizon of item.horizons) {
        const presentation = describeDemoBuyHorizon(horizon);
        const td = document.createElement("td");
        td.className = `market-flow-us-demo-buy-horizon market-flow-us-demo-buy-${presentation.kind}`;
        td.dataset.outcome = horizon.outcome;
        td.dataset.unavailableReason = horizon.unavailableReason ?? "";
        td.title = observedDetails(horizon);
        const primary = text(document, "div", presentation.primary);
        const secondary = text(document, "div", presentation.secondary);
        secondary.dir = "ltr";
        td.append(primary);
        if (presentation.secondary) td.append(secondary);
        tr.append(td);
      }

      const action = document.createElement("td");
      const key = demoBuyObservationKey(item.capture.captureId, item.securityId);
      const details = document.createElement("details");
      details.open = openObservationDetails.has(key);
      details.addEventListener("toggle", () => {
        if (details.open) openObservationDetails.add(key);
        else openObservationDetails.delete(key);
      });
      const summary = text(document, "summary", "Observation details");
      details.append(summary, renderObservationDetails(item));
      action.append(details);
      tr.append(action);

      tbody.append(tr);
    }

    table.append(tbody);
    scroll.append(table);
    section.append(scroll);
    return section;
  }

  function render() {
    if (destroyed) return;
    const horizontalScroll = captureHorizontalScroll();
    refreshButton.disabled = refreshBusy;
    refreshButton.textContent = refreshBusy ? "Refreshing latest…" : "Refresh latest";
    globalStatus.textContent = continuationBusy ? "Loading more…" : "";

    if (model.state === DEMO_BUY_VIEW_STATE.LOADING && model.pages.length === 0) {
      const loading = text(document, "p", "Loading Demo Buy observations…");
      loading.setAttribute("role", "status");
      content.replaceChildren(loading);
      return;
    }

    if (model.state === DEMO_BUY_VIEW_STATE.ERROR && model.pages.length === 0) {
      const alert = text(
        document,
        "p",
        `Demo Buy could not be loaded: ${model.firstPageError ?? "unknown error"}`
      );
      alert.setAttribute("role", "alert");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => void refreshLatest());
      content.replaceChildren(alert, retry);
      return;
    }

    const fragments = [];
    if (model.firstPageError) {
      const alert = text(
        document,
        "p",
        `Refresh latest failed; showing the last trustworthy result: ${model.firstPageError}`
      );
      alert.setAttribute("role", "alert");
      fragments.push(alert);
    }

    const pageGroups = groupDemoBuyPages(model);
    const totalItems = model.pages.reduce((sum, page) => sum + page.items.length, 0);
    if (totalItems === 0) {
      fragments.push(text(
        document,
        "p",
        "אין עדיין תצפיות Demo Buy. הפעילו Scanner ובצעו Demo Buy selected / all / Top X, או הפעילו Auto לתוצאות עתידיות."
      ));
      content.replaceChildren(...fragments);
      return;
    }

    for (const [pageIndex, page] of pageGroups.entries()) {
      for (const [groupIndex, group] of page.groups.entries()) {
        fragments.push(renderGroup(group, pageIndex, groupIndex));
      }
    }

    if (model.continuationError) {
      const alert = text(
        document,
        "p",
        `Load more failed; already loaded observations are unchanged: ${model.continuationError}`
      );
      alert.setAttribute("role", "alert");
      fragments.push(alert);
    }

    const cursor = currentDemoBuyContinuation(model);
    if (cursor !== null) {
      const loadMore = document.createElement("button");
      loadMore.type = "button";
      loadMore.textContent = continuationBusy ? "Loading more…" : "Load more";
      loadMore.disabled = continuationBusy;
      loadMore.addEventListener("click", () => void loadMorePage());
      fragments.push(loadMore);
    }

    content.replaceChildren(...fragments);
    restoreHorizontalScroll(horizontalScroll);
  }

  async function refreshLatest() {
    if (destroyed || refreshBusy) return;
    refreshBusy = true;
    render();
    try {
      const page = await client.getDemoBuyPage(null);
      if (destroyed) return;
      model = applyDemoBuyFirstPage(model, page);
    } catch (error) {
      if (destroyed) return;
      model = applyDemoBuyFirstPageError(model, error);
    } finally {
      refreshBusy = false;
      render();
    }
  }

  async function loadMorePage() {
    if (destroyed || continuationBusy) return;
    const cursor = currentDemoBuyContinuation(model);
    if (cursor === null) return;

    continuationBusy = true;
    render();
    try {
      const page = await client.getDemoBuyPage(cursor);
      if (destroyed) return;
      model = applyDemoBuyContinuation(model, page);
    } catch (error) {
      if (destroyed) return;
      model = applyDemoBuyContinuationError(model, error);
    } finally {
      continuationBusy = false;
      render();
    }
  }

  async function refreshObservation(captureId, securityId) {
    if (destroyed) return;
    const key = demoBuyObservationKey(captureId, securityId);
    if (observationBusy.has(key)) return;

    observationBusy.add(key);
    render();
    try {
      const observation = await client.getDemoBuyObservation(captureId, securityId);
      if (destroyed) return;
      model = replaceDemoBuyObservation(model, observation);
    } catch (error) {
      if (destroyed) return;
      model = applyDemoBuyObservationError(model, captureId, securityId, error);
    } finally {
      observationBusy.delete(key);
      render();
    }
  }

  function start() {
    if (destroyed || started) return;
    started = true;
    void refreshLatest();
  }

  function destroy() {
    destroyed = true;
    openObservationDetails.clear();
    openProvenance.clear();
    observationBusy.clear();
  }

  refreshButton.addEventListener("click", () => void refreshLatest());
  render();

  return Object.freeze({
    start,
    refreshLatest,
    loadMore: loadMorePage,
    refreshObservation,
    destroy,
    getState: () => model
  });
}
