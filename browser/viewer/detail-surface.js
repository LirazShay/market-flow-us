import {
  LEGACY_DETAIL_PROFILE,
  appendDetailHistory,
  createDetailModel,
  formatDetailSummaryValue,
  formatHistoryCell
} from "./detail-model.js";

function assertElement(root) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("root must be a DOM element.");
  }
}

function assertClient(client) {
  if (!client || typeof client.getSecurity !== "function" || typeof client.getHistoryPage !== "function") {
    throw new TypeError("client must expose getSecurity() and getHistoryPage().");
  }
}

function assertSecurityId(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("securityId must be a non-empty string.");
  }
}

function text(document, tagName, value) {
  const element = document.createElement(tagName);
  element.textContent = value;
  return element;
}

function summaryMetric(document, label, value, testId = null) {
  const wrapper = document.createElement("div");
  const term = text(document, "dt", label);
  const description = text(document, "dd", value);
  if (testId) description.dataset.testid = testId;
  wrapper.append(term, description);
  return wrapper;
}

export function createDetailSurface({
  root,
  client,
  onBack = () => {},
  captureReturnState = () => null,
  profile = LEGACY_DETAIL_PROFILE
} = {}) {
  assertElement(root);
  assertClient(client);
  if (typeof onBack !== "function") {
    throw new TypeError("onBack must be a function.");
  }
  if (typeof captureReturnState !== "function") {
    throw new TypeError("captureReturnState must be a function.");
  }
  if (
    !profile
    || !Array.isArray(profile.historyColumns)
    || !Array.isArray(profile.summaryColumns)
  ) {
    throw new TypeError("profile must expose Detail columns.");
  }

  const document = root.ownerDocument;
  let openSequence = 0;
  let selectedSecurityId = null;
  let returnState = null;
  let security = null;
  let model = null;
  let state = "IDLE";
  let initialError = null;
  let continuationError = null;
  let loadingMore = false;

  function snapshot() {
    return Object.freeze({
      state,
      selectedSecurityId,
      rowCount: model?.rows.length ?? 0,
      hasMore: model?.hasMore ?? false,
      loadingMore
    });
  }

  function createBackButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "← חזרה לטבלה";
    button.addEventListener("click", () => {
      openSequence += 1;
      const captured = returnState;
      selectedSecurityId = null;
      returnState = null;
      security = null;
      model = null;
      state = "IDLE";
      initialError = null;
      continuationError = null;
      loadingMore = false;
      root.replaceChildren();
      onBack(captured);
    });
    return button;
  }

  function renderSummary(container) {
    const effective = model ?? (security?.found === true
      ? {
          securityId: security.securityId,
          title: security.paperName || security.securityId,
          isCurrent: security.isCurrent,
          currentRow: security.currentRow
        }
      : null);

    if (!effective) return;

    container.append(text(document, "h1", effective.title));
    container.append(text(document, "p", `מספר נייר: ${effective.securityId}`));

    const list = document.createElement("dl");
    list.className = "market-scope-detail-summary";
    for (const column of profile.summaryColumns) {
      list.append(summaryMetric(
        document,
        column.label,
        formatDetailSummaryValue(effective, column.key, profile),
        column.testId ?? null
      ));
    }
    container.append(list);
  }

  function renderHistoryTable(container) {
    const table = document.createElement("table");
    table.setAttribute("aria-label", "היסטוריית נייר");

    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    for (const column of profile.historyColumns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = column.label;
      header.append(th);
    }
    thead.append(header);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const row of model.rows) {
      const tr = document.createElement("tr");
      for (const column of profile.historyColumns) {
        const td = document.createElement("td");
        td.textContent = formatHistoryCell(column.key, row[column.key], profile);
        if (["number", "percentage", "timestamp", "time"].includes(column.kind)) {
          td.dir = "ltr";
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    container.append(table);
  }

  function renderLoadMore(container) {
    if (!model?.hasMore) return;

    const button = document.createElement("button");
    button.type = "button";
    button.disabled = loadingMore;
    button.textContent = loadingMore
      ? "טוען ישנים יותר…"
      : continuationError
        ? "נסה שוב לטעון ישנים יותר"
        : "טען ישנים יותר";
    button.addEventListener("click", () => {
      void loadMore();
    });
    container.append(button);
  }

  function render() {
    const shell = document.createElement("section");
    shell.className = "market-scope-detail";
    shell.dir = "rtl";
    shell.dataset.detailState = state;
    shell.append(createBackButton());

    if (state === "LOADING") {
      shell.append(text(document, "h1", selectedSecurityId ?? "פרטי נייר"));
      const loading = text(document, "p", "טוען היסטוריה...");
      loading.setAttribute("role", "status");
      shell.append(loading);
      root.replaceChildren(shell);
      return;
    }

    if (state === "NOT_FOUND") {
      const alert = text(document, "p", `הנייר לא נמצא: ${selectedSecurityId}`);
      alert.setAttribute("role", "alert");
      shell.append(alert);
      root.replaceChildren(shell);
      return;
    }

    renderSummary(shell);

    if (state === "ERROR") {
      const alert = text(document, "p", "שגיאה בטעינת ההיסטוריה.");
      alert.setAttribute("role", "alert");
      if (initialError?.message) alert.title = initialError.message;
      shell.append(alert);
      root.replaceChildren(shell);
      return;
    }

    if (state === "DETAIL") {
      if (model.rows.length === 0) {
        shell.append(text(document, "p", "אין היסטוריה שמורה לנייר זה."));
      } else {
        renderHistoryTable(shell);
      }

      if (continuationError) {
        const diagnostic = text(document, "p", "טעינת היסטוריה ישנה יותר נכשלה.");
        diagnostic.setAttribute("role", "status");
        diagnostic.title = continuationError.message;
        shell.append(diagnostic);
      }

      renderLoadMore(shell);
    }

    root.replaceChildren(shell);
  }

  async function open(securityId, { returnState: explicitReturnState } = {}) {
    assertSecurityId(securityId);
    const sequence = ++openSequence;
    selectedSecurityId = securityId;
    returnState = explicitReturnState === undefined ? captureReturnState() : explicitReturnState;
    security = null;
    model = null;
    state = "LOADING";
    initialError = null;
    continuationError = null;
    loadingMore = false;
    render();

    try {
      const securityResponse = await client.getSecurity(securityId);
      if (sequence !== openSequence) return Object.freeze({ stale: true });

      if (!securityResponse || securityResponse.found !== true) {
        state = "NOT_FOUND";
        render();
        return snapshot();
      }

      security = securityResponse;

      try {
        const historyPage = await client.getHistoryPage(securityId, null);
        if (sequence !== openSequence) return Object.freeze({ stale: true });
        model = createDetailModel(securityResponse, historyPage, profile);
        state = "DETAIL";
      } catch (error) {
        if (sequence !== openSequence) return Object.freeze({ stale: true });
        initialError = error instanceof Error ? error : new Error("History read failed.");
        state = "ERROR";
      }
    } catch (error) {
      if (sequence !== openSequence) return Object.freeze({ stale: true });
      initialError = error instanceof Error ? error : new Error("Security read failed.");
      state = "ERROR";
    }

    render();
    return snapshot();
  }

  async function refresh() {
    if (state !== "DETAIL" || !selectedSecurityId || !model) {
      return snapshot();
    }

    const sequence = ++openSequence;
    const securityId = selectedSecurityId;
    const targetDepth = model.rows.length;
    const previousModel = model;
    const previousSecurity = security;
    continuationError = null;

    try {
      const securityResponse = await client.getSecurity(securityId);
      if (sequence !== openSequence || selectedSecurityId !== securityId) {
        return Object.freeze({ stale: true });
      }

      if (!securityResponse || securityResponse.found !== true) {
        security = securityResponse ?? null;
        model = null;
        state = "NOT_FOUND";
        render();
        return snapshot();
      }

      let nextModel = createDetailModel(
        securityResponse,
        await client.getHistoryPage(securityId, null),
        profile
      );

      if (sequence !== openSequence || selectedSecurityId !== securityId) {
        return Object.freeze({ stale: true });
      }

      while (
        nextModel.rows.length < targetDepth
        && nextModel.hasMore
        && typeof nextModel.nextCursor === "string"
      ) {
        const page = await client.getHistoryPage(securityId, nextModel.nextCursor);
        if (sequence !== openSequence || selectedSecurityId !== securityId) {
          return Object.freeze({ stale: true });
        }
        nextModel = appendDetailHistory(nextModel, page, profile);
      }

      security = securityResponse;
      model = nextModel;
      state = "DETAIL";
      initialError = null;
      continuationError = null;
    } catch (error) {
      if (sequence !== openSequence || selectedSecurityId !== securityId) {
        return Object.freeze({ stale: true });
      }

      security = previousSecurity;
      model = previousModel;
      state = "DETAIL";
      continuationError = error instanceof Error
        ? error
        : new Error("Detail refresh failed.");
    }

    render();
    return snapshot();
  }

  async function loadMore() {
    if (
      state !== "DETAIL"
      || !model?.hasMore
      || typeof model.nextCursor !== "string"
      || loadingMore
    ) {
      return snapshot();
    }

    const sequence = openSequence;
    const securityId = selectedSecurityId;
    const cursor = model.nextCursor;
    loadingMore = true;
    continuationError = null;
    render();

    try {
      const page = await client.getHistoryPage(securityId, cursor);
      if (sequence !== openSequence || selectedSecurityId !== securityId) {
        return Object.freeze({ stale: true });
      }
      model = appendDetailHistory(model, page, profile);
    } catch (error) {
      if (sequence !== openSequence || selectedSecurityId !== securityId) {
        return Object.freeze({ stale: true });
      }
      continuationError = error instanceof Error ? error : new Error("History continuation failed.");
    } finally {
      if (sequence === openSequence && selectedSecurityId === securityId) {
        loadingMore = false;
        render();
      }
    }

    return snapshot();
  }

  return Object.freeze({
    open,
    refresh,
    loadMore,
    getState: snapshot
  });
}
