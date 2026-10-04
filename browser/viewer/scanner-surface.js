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

export function createScannerSurface({
  root,
  client,
  onOpenSecurity = () => {}
} = {}) {
  assertElement(root);
  assertClient(client);
  if (typeof onOpenSecurity !== "function") {
    throw new TypeError("onOpenSecurity must be a function.");
  }

  const document = root.ownerDocument;
  let lastResult = null;
  let lastError = null;
  let libraryLoaded = false;
  let libraryBusy = false;
  let libraryNotice = null;

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

  const activateButton = text(document, "button", "הפעל");
  activateButton.type = "submit";

  form.append(
    librarySection,
    sqlLabel,
    sqlInput,
    intervalLabel,
    intervalInput,
    activateButton
  );

  const activeStatus = text(document, "p", "לא הופעלה שאילתה.");
  activeStatus.setAttribute("aria-live", "polite");

  const output = document.createElement("div");
  output.className = "market-scope-scanner-output";

  shell.append(heading, form, activeStatus, output);
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

  function renderResult(rawResult) {
    let result;
    try {
      result = validateResult(rawResult);
    } catch (error) {
      renderError("שגיאה בעיבוד תוצאות השאילתה.", error);
      return;
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
      if (event?.type === "keydown") {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.key === " ") event.preventDefault();
      }
      onOpenSecurity(securityId);
    }

    for (const row of result.rows) {
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
  }

  const scheduler = createScannerScheduler({
    execute: (sql) => client.executeScanner(sql),
    onResult(result) {
      activeStatus.textContent = "שאילתה פעילה";
      renderResult(result);
    },
    onError(error) {
      activeStatus.textContent = "שאילתה פעילה";
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

    scheduler.setDraft({
      sql: sqlInput.value,
      intervalMs
    });

    scheduler.activate();
    activeStatus.textContent = "שאילתה פעילה";
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

  function getState() {
    return Object.freeze({
      scheduler: scheduler.getState(),
      library: libraryController.getState(),
      rowCount: lastResult?.rowCount ?? null,
      hasError: lastError !== null
    });
  }

  function destroy() {
    scheduler.stop();
  }

  renderLibraryControls();
  void loadLibrary();

  return Object.freeze({
    activateFromDraft,
    reloadLibrary: loadLibrary,
    getState,
    destroy
  });
}
