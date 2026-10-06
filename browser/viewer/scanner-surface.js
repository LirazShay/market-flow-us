import { DEMO_BUY_AUTO_MODE } from "./demo-buy-capture-controller.js";
import { createScannerQueryLibraryController } from "./scanner-query-library.js";
import { createScannerScheduler } from "./scanner-scheduler.js";

function assertElement(root) {
  if (!root || typeof root.replaceChildren !== "function" || !root.ownerDocument) {
    throw new TypeError("root must be a DOM element.");
  }
}

function assertClient(client) {
  for (const method of [
    "executeScanner",
    "listScannerQueries",
    "createScannerQuery",
    "updateScannerQuery",
    "deleteScannerQuery"
  ]) {
    if (!client || typeof client[method] !== "function") {
      throw new TypeError(`client must expose ${method}().`);
    }
  }
}

function assertDemoBuyController(controller) {
  if (controller === null) return;
  for (const method of [
    "subscribe",
    "getState",
    "setRenderedGeneration",
    "getRenderedAnalysis",
    "setSelected",
    "setAutoMode",
    "captureSelected",
    "captureAll",
    "captureTopX",
    "captureAutomaticGeneration",
    "preview"
  ]) {
    if (!controller || typeof controller[method] !== "function") {
      throw new TypeError(`demoBuyController must expose ${method}().`);
    }
  }
}

function text(document, tagName, value, className = "") {
  const element = document.createElement(tagName);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function formatCell(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function intervalSecondsToMs(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError("Scanner interval must be positive.");
  }

  const intervalMs = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("Scanner interval must be positive.");
  }

  return intervalMs;
}

function intervalMsToSeconds(intervalMs) {
  return String(intervalMs / 1000);
}

function recognizedSecurityIdColumnIndex(columns) {
  const recognized = [];
  for (let index = 0; index < columns.length; index += 1) {
    if (columns[index]?.name === "securityId" || columns[index]?.name === "security_id") {
      recognized.push(index);
    }
  }
  return recognized.length === 1 ? recognized[0] : -1;
}

function canonicalSecurityId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function validateResult(result) {
  if (
    !result
    || !Array.isArray(result.columns)
    || !Array.isArray(result.rows)
    || !Number.isSafeInteger(result.rowCount)
    || result.rowCount < 0
    || result.rowCount !== result.rows.length
  ) {
    throw new Error("Scanner result is invalid.");
  }

  for (const column of result.columns) {
    if (!column || typeof column.name !== "string") {
      throw new Error("Scanner result column metadata is invalid.");
    }
  }

  for (const row of result.rows) {
    if (!Array.isArray(row) || row.length !== result.columns.length) {
      throw new Error("Scanner result row shape is invalid.");
    }
  }

  return result;
}

function libraryErrorMessage(error) {
  if (error?.code === "SCANNER_QUERY_NAME_CONFLICT") {
    return "שם השאילתה כבר קיים.";
  }
  if (error?.code === "SCANNER_QUERY_READ_ONLY") {
    return "שאילתה מובנית היא לקריאה בלבד.";
  }
  if (error?.code === "NOT_FOUND") {
    return "השאילתה השמורה לא נמצאה.";
  }
  return "שגיאה בעדכון ספריית השאילתות.";
}

function captureOutcomeMessage(lastCapture) {
  if (!lastCapture) return "";
  if (lastCapture.status === "CONFIRMED_COMMITTED") {
    return `Demo Buy נשמר: capture ${lastCapture.captureId}, ${lastCapture.capturedItemCount} פריטים.`;
  }
  if (lastCapture.status === "CONFIRMED_REJECTED") {
    return `Demo Buy נדחה: ${lastCapture.message ?? lastCapture.code ?? "הבקשה נדחתה."}`;
  }
  if (lastCapture.status === "ACKNOWLEDGEMENT_UNKNOWN") {
    return "תוצאת Demo Buy אינה ידועה — ייתכן שכבר נשמרה. יש להפעיל מחדש את ה־Viewer ולרענן Demo Buy לפני capture נוסף.";
  }
  if (lastCapture.status === "CLIENT_ERROR") {
    return `Demo Buy לא נשלח: ${lastCapture.message ?? "השירות אינו זמין."}`;
  }
  return "";
}

function autoModeLabel(state) {
  if (state.autoMode === DEMO_BUY_AUTO_MODE.ALL) return "All";
  if (state.autoMode === DEMO_BUY_AUTO_MODE.TOP_X) return `Top ${state.autoTopX}`;
  return "Off";
}

export function createScannerSurface({
  root,
  client,
  demoBuyController = null,
  onOpenSecurity = () => {}
} = {}) {
  assertElement(root);
  assertClient(client);
  assertDemoBuyController(demoBuyController);
  if (typeof onOpenSecurity !== "function") {
    throw new TypeError("onOpenSecurity must be a function.");
  }

  const document = root.ownerDocument;
  let lastResult = null;
  let lastError = null;
  let libraryLoaded = false;
  let libraryBusy = false;
  let libraryNotice = null;
  let captureFeedbackText = "";
  let unsubscribeDemoBuy = null;

  const shell = document.createElement("section");
  shell.className = "market-scope-scanner";
  shell.dir = "rtl";

  const heading = text(document, "h1", "סורק SQL");

  const form = document.createElement("form");
  form.noValidate = true;

  const librarySection = document.createElement("section");
  librarySection.className = "market-scope-scanner-library";
  librarySection.setAttribute("aria-label", "ספריית שאילתות");

  const libraryHeading = text(document, "h2", "ספריית שאילתות");

  const queryLabel = text(document, "label", "שאילתה שמורה");
  const querySelect = document.createElement("select");
  querySelect.id = "market-scope-scanner-query";
  queryLabel.htmlFor = querySelect.id;

  const nameLabel = text(document, "label", "שם שאילתה");
  const nameInput = document.createElement("input");
  nameInput.id = "market-scope-scanner-query-name";
  nameInput.type = "text";
  nameInput.maxLength = 120;
  nameLabel.htmlFor = nameInput.id;

  const libraryActions = document.createElement("div");
  libraryActions.className = "market-scope-scanner-library-actions";

  const newButton = text(document, "button", "חדש");
  newButton.type = "button";
  const saveAsButton = text(document, "button", "שמור בשם חדש");
  saveAsButton.type = "button";
  const saveButton = text(document, "button", "שמור");
  saveButton.type = "button";
  const renameButton = text(document, "button", "שנה שם");
  renameButton.type = "button";
  const deleteButton = text(document, "button", "מחק");
  deleteButton.type = "button";

  libraryActions.append(
    newButton,
    saveAsButton,
    saveButton,
    renameButton,
    deleteButton
  );

  const libraryStatus = text(document, "p", "טוען ספריית שאילתות…");
  libraryStatus.setAttribute("aria-live", "polite");

  const libraryFeedback = document.createElement("div");

  librarySection.append(
    libraryHeading,
    queryLabel,
    querySelect,
    nameLabel,
    nameInput,
    libraryActions,
    libraryStatus,
    libraryFeedback
  );

  const sqlLabel = text(document, "label", "SQL");
  const sqlInput = document.createElement("textarea");
  sqlInput.id = "market-scope-scanner-sql";
  sqlInput.rows = 8;
  sqlInput.spellcheck = false;
  sqlLabel.htmlFor = sqlInput.id;

  const intervalLabel = text(document, "label", "מרווח (שניות)");
  const intervalInput = document.createElement("input");
  intervalInput.id = "market-scope-scanner-interval";
  intervalInput.type = "number";
  intervalInput.min = "0.001";
  intervalInput.step = "any";
  intervalInput.value = "5";
  intervalLabel.htmlFor = intervalInput.id;

  const schedulerActions = document.createElement("div");
  schedulerActions.className = "market-flow-us-scanner-actions";

  const activateButton = text(document, "button", "הפעל");
  activateButton.type = "submit";

  const stopButton = text(document, "button", "עצור סריקה חוזרת");
  stopButton.type = "button";
  stopButton.disabled = true;

  schedulerActions.append(activateButton, stopButton);

  form.append(
    librarySection,
    sqlLabel,
    sqlInput,
    intervalLabel,
    intervalInput,
    schedulerActions
  );

  const activeStatus = text(document, "p", "לא הופעלה שאילתה.");
  activeStatus.setAttribute("aria-live", "polite");

  const captureSection = document.createElement("section");
  captureSection.className = "market-flow-us-demo-buy-capture";
  captureSection.setAttribute("aria-label", "Demo Buy");
  captureSection.hidden = true;

  const activeResultStatus = text(document, "p", "");
  const captureActions = document.createElement("div");
  captureActions.className = "market-flow-us-demo-buy-actions";

  const captureSelectedButton = text(document, "button", "Demo Buy selected (0)");
  captureSelectedButton.type = "button";
  const captureAllButton = text(document, "button", "Demo Buy all (0)");
  captureAllButton.type = "button";

  const topXLabel = text(document, "label", "Top X");
  const topXInput = document.createElement("input");
  topXInput.type = "number";
  topXInput.min = "1";
  topXInput.max = "5000";
  topXInput.value = "5";
  topXInput.id = "market-flow-us-demo-buy-top-x";
  topXLabel.htmlFor = topXInput.id;
  const captureTopXButton = text(document, "button", "Demo Buy Top X");
  captureTopXButton.type = "button";

  const autoLabel = text(document, "label", "Auto");
  const autoSelect = document.createElement("select");
  autoSelect.id = "market-flow-us-demo-buy-auto";
  autoLabel.htmlFor = autoSelect.id;
  for (const [value, label] of [
    [DEMO_BUY_AUTO_MODE.OFF, "Off"],
    [DEMO_BUY_AUTO_MODE.ALL, "All"],
    [DEMO_BUY_AUTO_MODE.TOP_X, "Top X"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    autoSelect.append(option);
  }

  const autoTopXLabel = text(document, "label", "Auto Top X");
  const autoTopXInput = document.createElement("input");
  autoTopXInput.type = "number";
  autoTopXInput.min = "1";
  autoTopXInput.max = "5000";
  autoTopXInput.value = "5";
  autoTopXInput.id = "market-flow-us-demo-buy-auto-top-x";
  autoTopXLabel.htmlFor = autoTopXInput.id;

  captureActions.append(
    captureSelectedButton,
    captureAllButton,
    topXLabel,
    topXInput,
    captureTopXButton,
    autoLabel,
    autoSelect,
    autoTopXLabel,
    autoTopXInput
  );

  const capturePreview = text(document, "p", "");
  const autoStatus = text(document, "p", "");
  autoStatus.setAttribute("aria-live", "polite");
  const captureFeedback = text(document, "p", "");
  captureFeedback.setAttribute("aria-live", "polite");

  captureSection.append(
    activeResultStatus,
    captureActions,
    capturePreview,
    autoStatus,
    captureFeedback
  );

  const output = document.createElement("div");
  output.className = "market-scope-scanner-output";

  shell.append(heading, form, activeStatus, captureSection, output);
  root.replaceChildren(shell);

  const libraryController = createScannerQueryLibraryController({ client });

  function setLibraryBusy(value) {
    libraryBusy = value === true;
    renderLibraryControls();
  }

  function clearLibraryFeedback() {
    libraryFeedback.replaceChildren();
  }

  function renderLibraryError(error) {
    clearLibraryFeedback();
    const alert = text(document, "p", libraryErrorMessage(error));
    alert.setAttribute("role", "alert");
    if (typeof error?.message === "string" && error.message.length > 0) {
      alert.title = error.message;
    }
    libraryFeedback.append(alert);
  }

  function renderLibraryOptions(state) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "טיוטה חדשה";
    const options = [option];

    for (const query of state.queries) {
      const item = document.createElement("option");
      item.value = query.queryId;
      item.textContent = `${query.source === "builtin" ? "מובנה" : "שלי"} — ${query.name}`;
      options.push(item);
    }

    querySelect.replaceChildren(...options);
    querySelect.value = state.selectedQueryId ?? "";
  }

  function renderLibraryControls({ loadDraft = false } = {}) {
    const state = libraryController.getState();

    renderLibraryOptions(state);

    if (loadDraft) {
      nameInput.value = state.draft.name;
      sqlInput.value = state.draft.sql;
      intervalInput.value = intervalMsToSeconds(state.draft.intervalMs);
    }

    const disabled = !libraryLoaded || libraryBusy;
    querySelect.disabled = disabled;
    newButton.disabled = disabled;
    saveAsButton.disabled = disabled || !state.canSaveAs;
    saveButton.disabled = disabled || !state.canSave;
    renameButton.disabled = disabled || !state.canRename;
    deleteButton.disabled = disabled || !state.canDelete;

    if (libraryNotice !== null) {
      libraryStatus.textContent = libraryNotice;
    } else if (!libraryLoaded) {
      libraryStatus.textContent = libraryBusy
        ? "טוען ספריית שאילתות…"
        : "ספריית השאילתות אינה זמינה.";
    } else if (state.persisted?.source === "builtin") {
      libraryStatus.textContent = "שאילתה מובנית לקריאה בלבד; אפשר לערוך טיוטה ולשמור בשם חדש.";
    } else if (state.persisted?.source === "user") {
      libraryStatus.textContent = "שאילתה שמורה נבחרה; שינויים בטיוטה נשמרים רק בפעולה מפורשת.";
    } else {
      libraryStatus.textContent = "טיוטה חדשה; הפעלה ושמירה הן פעולות נפרדות.";
    }
  }

  function syncDraftFromInputs() {
    const intervalMs = intervalSecondsToMs(intervalInput.value);
    libraryController.setDraft({
      name: nameInput.value,
      sql: sqlInput.value,
      intervalMs
    });
  }

  async function loadLibrary() {
    libraryNotice = null;
    setLibraryBusy(true);
    clearLibraryFeedback();
    try {
      await libraryController.load();
      libraryLoaded = true;
      renderLibraryControls({ loadDraft: false });
      return true;
    } catch (error) {
      libraryLoaded = false;
      renderLibraryError(error);
      return false;
    } finally {
      libraryBusy = false;
      renderLibraryControls();
    }
  }

  function renderError(message, error = null) {
    lastResult = null;
    lastError = error instanceof Error ? error : new Error(message);
    output.replaceChildren();
    const alert = text(document, "p", message);
    alert.setAttribute("role", "alert");
    if (lastError.message) alert.title = lastError.message;
    output.append(alert);
  }

  function previewText(label, mode, topX = null) {
    if (!demoBuyController) return null;
    try {
      const preview = demoBuyController.preview(mode, topX);
      return `${label}: ${preview.sourceRowCount} source rows → ${preview.uniqueItemCount} unique Demo Buy items`;
    } catch (error) {
      return `${label}: חסום — ${error instanceof Error ? error.message : "Demo Buy preflight failed."}`;
    }
  }

  function renderCaptureState(state = demoBuyController?.getState?.()) {
    if (!demoBuyController || !state || !state.rendered) {
      captureSection.hidden = true;
      return;
    }

    captureSection.hidden = state.rendered.capable !== true;
    if (captureSection.hidden) return;

    const queryLabelText = state.rendered.queryName ?? "Unsaved query";
    activeResultStatus.textContent =
      `Active result: ${queryLabelText} | Completed: ${new Date(state.rendered.completedAtMs).toLocaleTimeString()} | Rows: ${state.rendered.sourceRowCount}`;

    const blocked = state.captureBusy || state.captureLocked;
    captureSelectedButton.textContent = `Demo Buy selected (${state.selectedCount})`;
    captureSelectedButton.disabled = blocked || state.selectedCount === 0;
    captureAllButton.textContent = `Demo Buy all (${state.rendered.sourceRowCount})`;
    captureAllButton.disabled = blocked || state.rendered.sourceRowCount === 0;
    captureTopXButton.disabled = blocked || state.rendered.sourceRowCount === 0;
    topXInput.disabled = blocked || state.rendered.sourceRowCount === 0;
    topXInput.max = String(Math.min(5000, state.rendered.sourceRowCount));

    autoSelect.value = state.autoMode;
    autoTopXInput.disabled = state.autoMode !== DEMO_BUY_AUTO_MODE.TOP_X;
    autoTopXLabel.hidden = state.autoMode !== DEMO_BUY_AUTO_MODE.TOP_X;
    autoTopXInput.hidden = state.autoMode !== DEMO_BUY_AUTO_MODE.TOP_X;
    if (state.autoTopX !== null) autoTopXInput.value = String(state.autoTopX);

    const previews = [
      previewText("Selected", "manual"),
      previewText("All", "all")
    ];
    const parsedTopX = Number(topXInput.value);
    if (Number.isSafeInteger(parsedTopX)) previews.push(previewText("Top X", "top_x", parsedTopX));
    capturePreview.textContent = previews.filter(Boolean).join(" | ");

    const autoParts = [
      `Auto mode: ${autoModeLabel(state)}`,
      `busy-skipped: ${state.autoBusySkippedCount}`
    ];
    if (state.lastAutoReason) autoParts.push(`last auto reason: ${state.lastAutoReason}`);
    if (state.autoBlockedReason) autoParts.push(`Blocked for current result: ${state.autoBlockedReason}`);
    if (state.captureBusy) autoParts.push("capture in progress");
    if (state.captureLocked) autoParts.push("capture locked: acknowledgement unknown");
    autoStatus.textContent = autoParts.join(" | ");

    captureFeedback.textContent = captureFeedbackText || captureOutcomeMessage(state.lastCapture);
  }

  function renderResult(rawResult, context = null) {
    let result;
    try {
      result = validateResult(rawResult);
    } catch (error) {
      renderError("שגיאה בעיבוד תוצאות השאילתה.", error);
      return;
    }

    let analysis = null;
    if (demoBuyController && context) {
      try {
        const accepted = demoBuyController.setRenderedGeneration({
          generation: context.generation,
          query: {
            queryId: context.queryId,
            name: context.queryName,
            sql: context.sql,
            intervalMs: context.intervalMs
          },
          result: {
            startedAtMs: context.startedAtMs,
            completedAtMs: context.completedAtMs,
            rowCount: result.rowCount,
            columns: result.columns,
            rows: result.rows
          }
        });
        result = accepted.generation.result;
        analysis = accepted.analysis;
        captureFeedbackText = "";
      } catch (error) {
        renderError("שגיאה בהכנת תוצאת Scanner ל־Demo Buy.", error);
        return;
      }
    }

    lastResult = result;
    lastError = null;
    output.replaceChildren();

    const summary = text(document, "p", `${result.rowCount} שורות`);
    output.append(summary);

    const table = document.createElement("table");
    table.setAttribute("aria-label", "תוצאות Scanner");

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    if (analysis?.capable === true) {
      const selectTh = text(document, "th", "Demo Buy");
      selectTh.scope = "col";
      headerRow.append(selectTh);
    }
    for (const column of result.columns) {
      const th = text(document, "th", column.name);
      th.scope = "col";
      headerRow.append(th);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    const securityIdColumnIndex = recognizedSecurityIdColumnIndex(result.columns);

    function activateSecurityRow(securityId, event) {
      if (event?.target?.closest?.("button,input,select,textarea,a")) return;
      if (event?.type === "keydown") {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.key === " ") event.preventDefault();
      }
      onOpenSecurity(securityId);
    }

    for (let rowIndex = 0; rowIndex < result.rows.length; rowIndex += 1) {
      const row = result.rows[rowIndex];
      const tr = document.createElement("tr");
      const securityId = securityIdColumnIndex === -1
        ? null
        : canonicalSecurityId(row[securityIdColumnIndex]);

      if (securityId !== null) {
        tr.tabIndex = 0;
        tr.setAttribute("aria-label", `פתח היסטוריה עבור ${securityId}`);
        tr.addEventListener("click", (event) => activateSecurityRow(securityId, event));
        tr.addEventListener("keydown", (event) => activateSecurityRow(securityId, event));
      }

      if (analysis?.capable === true) {
        const selectionCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        const rowState = analysis.rows[rowIndex];
        checkbox.disabled = rowState.eligible !== true;
        checkbox.setAttribute(
          "aria-label",
          rowState.eligible
            ? `בחר Demo Buy עבור Scanner position ${rowState.resultRank}, ${rowState.securityId}`
            : `Scanner position ${rowState.resultRank} אינו זמין ל-Demo Buy בגלל identity לא תקין`
        );
        if (!rowState.eligible) checkbox.title = "securityId/security_id אינו תקין בשורה זו.";
        checkbox.addEventListener("click", (event) => event.stopPropagation());
        checkbox.addEventListener("keydown", (event) => event.stopPropagation());
        checkbox.addEventListener("change", () => {
          try {
            demoBuyController.setSelected(rowState.resultRank, checkbox.checked);
            captureFeedbackText = "";
          } catch (error) {
            checkbox.checked = false;
            captureFeedbackText = error instanceof Error ? error.message : "לא ניתן לבחור את השורה.";
            renderCaptureState();
          }
        });
        selectionCell.append(checkbox);
        tr.append(selectionCell);
      }

      for (const value of row) {
        tr.append(text(document, "td", formatCell(value)));
      }
      tbody.append(tr);
    }
    table.append(tbody);
    output.append(table);

    if (result.rowCount === 0) {
      output.append(text(document, "p", "השאילתה הושלמה ללא שורות."));
    }

    renderCaptureState();
  }

  const scheduler = createScannerScheduler({
    execute: (sql) => client.executeScanner(sql),
    onResult(result, context) {
      activeStatus.textContent = "שאילתה פעילה";
      stopButton.disabled = false;
      renderResult(result, context);
      if (demoBuyController) void demoBuyController.captureAutomaticGeneration();
    },
    onError(error) {
      activeStatus.textContent = "שאילתה פעילה";
      stopButton.disabled = false;
      renderError("שגיאה בהרצת השאילתה.", error);
    }
  });

  function activateFromDraft() {
    let intervalMs;
    try {
      intervalMs = intervalSecondsToMs(intervalInput.value);
    } catch (error) {
      renderError("יש להזין מרווח חיובי בשניות.", error);
      return false;
    }

    const libraryState = libraryController.getState();
    scheduler.setDraft({
      sql: sqlInput.value,
      intervalMs,
      queryId: libraryState.selectedQueryId,
      queryName: nameInput.value.trim() || null
    });

    scheduler.activate();
    activeStatus.textContent = "שאילתה פעילה";
    stopButton.disabled = false;
    output.replaceChildren(text(document, "p", "מריץ שאילתה…"));
    return true;
  }

  async function runLibraryAction(work, {
    loadDraft = true,
    successMessage = null
  } = {}) {
    if (libraryBusy) return false;

    libraryNotice = null;
    setLibraryBusy(true);
    clearLibraryFeedback();

    try {
      await work();
      if (successMessage) libraryNotice = successMessage;
      renderLibraryControls({ loadDraft });
      return true;
    } catch (error) {
      renderLibraryError(error);
      return false;
    } finally {
      libraryBusy = false;
      renderLibraryControls();
    }
  }

  querySelect.addEventListener("change", () => {
    libraryNotice = null;
    clearLibraryFeedback();
    try {
      if (querySelect.value === "") {
        libraryController.newDraft();
      } else {
        libraryController.select(querySelect.value);
      }
      renderLibraryControls({ loadDraft: true });
    } catch (error) {
      renderLibraryError(error);
    }
  });

  newButton.addEventListener("click", () => {
    libraryNotice = null;
    clearLibraryFeedback();
    libraryController.newDraft();
    renderLibraryControls({ loadDraft: true });
  });

  saveAsButton.addEventListener("click", () => {
    void runLibraryAction(async () => {
      syncDraftFromInputs();
      await libraryController.saveAs();
    }, {
      successMessage: "השאילתה נשמרה בשם חדש."
    });
  });

  saveButton.addEventListener("click", () => {
    void runLibraryAction(async () => {
      syncDraftFromInputs();
      await libraryController.save();
    }, {
      successMessage: "השאילתה נשמרה."
    });
  });

  renameButton.addEventListener("click", () => {
    void runLibraryAction(async () => {
      libraryController.setDraft({ name: nameInput.value });
      await libraryController.rename();
      nameInput.value = libraryController.getState().draft.name;
    }, {
      loadDraft: false,
      successMessage: "שם השאילתה עודכן."
    });
  });

  deleteButton.addEventListener("click", () => {
    void runLibraryAction(async () => {
      await libraryController.deleteSelected();
    }, {
      successMessage: "השאילתה נמחקה."
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    activateFromDraft();
  });

  stopButton.addEventListener("click", () => {
    scheduler.stop();
    stopButton.disabled = true;
    activeStatus.textContent = "הסריקה החוזרת נעצרה. אפשר להפעיל שוב מאותה טיוטה או מטיוטה אחרת.";
  });

  async function runCapture(work) {
    captureFeedbackText = "";
    const outcome = await work();
    if (outcome.started === false) {
      captureFeedbackText = outcome.error?.message ?? "Demo Buy לא התחיל.";
    } else {
      captureFeedbackText = captureOutcomeMessage(outcome.result);
    }
    renderCaptureState();
    return outcome;
  }

  captureSelectedButton.addEventListener("click", () => {
    if (demoBuyController) void runCapture(() => demoBuyController.captureSelected());
  });
  captureAllButton.addEventListener("click", () => {
    if (demoBuyController) void runCapture(() => demoBuyController.captureAll());
  });
  captureTopXButton.addEventListener("click", () => {
    if (!demoBuyController) return;
    void runCapture(() => demoBuyController.captureTopX(Number(topXInput.value)));
  });
  topXInput.addEventListener("input", () => renderCaptureState());

  autoSelect.addEventListener("change", () => {
    if (!demoBuyController) return;
    try {
      const topX = autoSelect.value === DEMO_BUY_AUTO_MODE.TOP_X
        ? Number(autoTopXInput.value)
        : null;
      demoBuyController.setAutoMode(autoSelect.value, topX);
      captureFeedbackText = "";
    } catch (error) {
      captureFeedbackText = error instanceof Error ? error.message : "Auto Demo Buy אינו תקין.";
      renderCaptureState();
    }
  });
  autoTopXInput.addEventListener("change", () => {
    if (!demoBuyController || autoSelect.value !== DEMO_BUY_AUTO_MODE.TOP_X) return;
    try {
      demoBuyController.setAutoMode(DEMO_BUY_AUTO_MODE.TOP_X, Number(autoTopXInput.value));
      captureFeedbackText = "";
    } catch (error) {
      captureFeedbackText = error instanceof Error ? error.message : "Auto Top X אינו תקין.";
      renderCaptureState();
    }
  });

  if (demoBuyController) {
    unsubscribeDemoBuy = demoBuyController.subscribe((state) => renderCaptureState(state));
  }

  function getState() {
    return Object.freeze({
      scheduler: scheduler.getState(),
      library: libraryController.getState(),
      rowCount: lastResult?.rowCount ?? null,
      hasError: lastError !== null,
      demoBuy: demoBuyController?.getState?.() ?? null
    });
  }

  function stopRecurringScan() {
    const state = scheduler.stop();
    stopButton.disabled = true;
    activeStatus.textContent = "הסריקה החוזרת נעצרה. אפשר להפעיל שוב מאותה טיוטה או מטיוטה אחרת.";
    return state;
  }

  function destroy() {
    unsubscribeDemoBuy?.();
    unsubscribeDemoBuy = null;
    scheduler.stop();
  }

  renderLibraryControls();
  void loadLibrary();

  return Object.freeze({
    activateFromDraft,
    stopRecurringScan,
    reloadLibrary: loadLibrary,
    getState,
    destroy
  });
}
