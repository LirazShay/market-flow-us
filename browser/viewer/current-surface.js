import {
  LEGACY_CURRENT_PROFILE,
  createCurrentModel,
  createInitialCurrentSort,
  formatCurrentCell,
  formatDiagnosticTime,
  formatDiagnosticValue,
  formatRecorderHealth,
  nextCurrentSort,
  sortCurrentRows
} from "./current-model.js";

function assertElement(root) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("root must be a DOM element.");
  }
}

function assertClient(client) {
  if (!client || typeof client.getCurrent !== "function" || typeof client.getStatus !== "function") {
    throw new TypeError("client must expose getCurrent() and getStatus().");
  }
}

function text(document, tagName, value, className = "") {
  const element = document.createElement(tagName);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function metric(document, label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "market-scope-diagnostic";

  const term = text(document, "dt", label);
  const description = text(document, "dd", value);
  wrapper.append(term, description);
  return wrapper;
}

function numericDirection(column) {
  return ["number", "percentage", "time", "timestamp"].includes(column.kind);
}

export function createCurrentSurface({
  root,
  client,
  onOpenSecurity = () => {},
  now = () => Date.now(),
  profile = LEGACY_CURRENT_PROFILE
} = {}) {
  assertElement(root);
  assertClient(client);
  if (typeof onOpenSecurity !== "function") {
    throw new TypeError("onOpenSecurity must be a function.");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }
  if (!profile || !Array.isArray(profile.columns) || profile.columns.length === 0) {
    throw new TypeError("profile must expose Current columns.");
  }

  const columns = profile.columns;
  const document = root.ownerDocument;
  let sort = createInitialCurrentSort(profile);
  let model = null;
  let status = null;
  let state = "BOOTING";
  let lastError = null;

  const shell = document.createElement("section");
  shell.className = "market-scope-current";
  shell.dir = "rtl";

  const heading = text(document, "h1", "שוק נוכחי");
  const summary = document.createElement("p");
  summary.setAttribute("aria-live", "polite");

  const diagnostics = document.createElement("section");
  diagnostics.setAttribute("role", "region");
  diagnostics.setAttribute("aria-label", "אבחון תפעולי");

  const content = document.createElement("div");
  content.className = "market-scope-current-content";

  shell.append(heading, summary, diagnostics, content);
  root.replaceChildren(shell);

  function renderDiagnostics() {
    diagnostics.replaceChildren();
    const list = document.createElement("dl");
    list.className = "market-scope-diagnostics";

    const metrics = [
      ["איסוף", formatRecorderHealth(status?.recorderHealth)],
      ["עדכון אחרון", formatDiagnosticTime(status?.lastCompletedAtMs, now())],
      ["מחזור אחרון", formatDiagnosticValue(status?.lastCompletedCycleId)],
      [
        "משך מחזור",
        status?.lastCycleDurationMs === null || status?.lastCycleDurationMs === undefined
          ? "—"
          : `${formatDiagnosticValue(status.lastCycleDurationMs)} ms`
      ],
      ["ניירות נוכחיים", formatDiagnosticValue(status?.latestCount)],
      ["מחזורים שהושלמו", formatDiagnosticValue(status?.completedCycles)],
      ["מחזורים שנכשלו", formatDiagnosticValue(status?.failedCycles)],
      ["שורות היסטוריה", formatDiagnosticValue(status?.historyCount)]
    ];

    for (const [label, value] of metrics) {
      list.append(metric(document, label, value));
    }

    diagnostics.append(list);
  }

  function activateRow(row, event) {
    if (event?.type === "keydown") {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.key === " ") event.preventDefault();
    }
    onOpenSecurity(row.securityId);
  }

  function renderTable() {
    const table = document.createElement("table");
    table.setAttribute("aria-label", "שוק נוכחי");

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    for (const column of columns) {
      const th = document.createElement("th");
      th.scope = "col";

      if (sort.key === column.key) {
        th.setAttribute("aria-sort", sort.direction === "asc" ? "ascending" : "descending");
      }

      const button = document.createElement("button");
      button.type = "button";
      const activeIndicator = sort.key === column.key
        ? sort.direction === "asc" ? " ▲" : " ▼"
        : "";
      button.textContent = `${column.label}${activeIndicator}`;
      button.addEventListener("click", () => {
        sort = nextCurrentSort(sort, column.key, profile);
        renderCurrentState();
      });

      if (numericDirection(column)) {
        button.dir = "ltr";
      }

      th.append(button);
      headerRow.append(th);
    }

    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    const orderedRows = sortCurrentRows(model.rows, sort, profile);

    for (const row of orderedRows) {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      const identity = row.paperName === null || row.paperName === undefined || row.paperName === ""
        ? row.securityId
        : row.paperName;
      tr.setAttribute("aria-label", `פתח היסטוריה עבור ${identity}`);
      tr.addEventListener("click", (event) => activateRow(row, event));
      tr.addEventListener("keydown", (event) => activateRow(row, event));

      for (const column of columns) {
        const td = document.createElement("td");
        td.textContent = formatCurrentCell(column.key, row[column.key], profile);
        if (numericDirection(column)) {
          td.dir = "ltr";
        }
        if (
          column.kind === "percentage"
          && typeof row[column.key] === "number"
          && Number.isFinite(row[column.key])
        ) {
          if (row[column.key] > 0) td.dataset.sign = "positive";
          if (row[column.key] < 0) td.dataset.sign = "negative";
        }
        tr.append(td);
      }

      tbody.append(tr);
    }

    table.append(tbody);
    content.replaceChildren(table);
  }

  function renderCurrentState() {
    shell.dataset.viewerState = state;
    renderDiagnostics();

    if (state === "BOOTING") {
      summary.textContent = "";
      const loading = text(document, "p", "טוען נתוני שוק…");
      loading.setAttribute("role", "status");
      content.replaceChildren(loading);
      return;
    }

    if (state === "ERROR") {
      summary.textContent = "";
      const alert = text(document, "p", "שגיאה בטעינת נתוני השוק.");
      alert.setAttribute("role", "alert");
      if (lastError?.message) {
        alert.title = String(lastError.message);
      }
      content.replaceChildren(alert);
      return;
    }

    if (state === "EMPTY") {
      summary.textContent = "0 ניירות";
      content.replaceChildren(text(document, "p", "אין עדיין snapshot מלא."));
      return;
    }

    summary.textContent = model.summary.lastCycleId === null
      ? `${model.summary.rowCount} ניירות`
      : `${model.summary.rowCount} ניירות · מחזור ${model.summary.lastCycleId}`;
    renderTable();
  }

  function mountDiagnostics(targetRoot) {
    if (!targetRoot || typeof targetRoot.replaceChildren !== "function") {
      throw new TypeError("diagnosticsRoot must be a DOM element.");
    }
    targetRoot.replaceChildren(diagnostics);
  }

  function captureViewState() {
    return Object.freeze({
      sort: Object.freeze({ ...sort }),
      scrollLeft: content.scrollLeft,
      scrollTop: content.scrollTop
    });
  }

  function restoreViewState(viewState) {
    if (!viewState || typeof viewState !== "object") return;

    if (
      viewState.sort
      && columns.some((column) => column.key === viewState.sort.key)
      && ["asc", "desc"].includes(viewState.sort.direction)
    ) {
      sort = Object.freeze({
        key: viewState.sort.key,
        direction: viewState.sort.direction
      });
      if (model && (state === "MAIN" || state === "EMPTY")) {
        renderCurrentState();
      }
    }

    if (Number.isFinite(viewState.scrollLeft)) {
      content.scrollLeft = viewState.scrollLeft;
    }
    if (Number.isFinite(viewState.scrollTop)) {
      content.scrollTop = viewState.scrollTop;
    }
  }

  async function refresh() {
    const viewState = captureViewState();

    if (state === "BOOTING") {
      renderCurrentState();
    }

    try {
      const [currentResponse, statusResponse] = await Promise.all([
        client.getCurrent(),
        client.getStatus()
      ]);
      model = createCurrentModel(currentResponse);
      status = statusResponse && typeof statusResponse === "object" ? statusResponse : {};
      lastError = null;
      state = model.rows.length === 0 ? "EMPTY" : "MAIN";
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Current read failed.");
      state = "ERROR";
    }

    renderCurrentState();
    restoreViewState(viewState);
    return Object.freeze({
      state,
      rowCount: model?.rows.length ?? 0,
      sort
    });
  }

  function getState() {
    return Object.freeze({
      state,
      rowCount: model?.rows.length ?? 0,
      sort
    });
  }

  renderCurrentState();

  return Object.freeze({
    refresh,
    mountDiagnostics,
    captureViewState,
    restoreViewState,
    getState
  });
}
