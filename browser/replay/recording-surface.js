function formatDuration(ms) {
  const totalSeconds = Math.floor((Number.isFinite(ms) ? ms : 0) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "לא זמין";
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  if (bytes < 1_024 ** 2) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_024 ** 3) return `${(bytes / (1_024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1_024 ** 3)).toFixed(2)} GB`;
}

function text(documentRef, tagName, value, className) {
  const element = documentRef.createElement(tagName);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

export function createReplayRecordingSurface({
  recorder,
  exportRecording = null,
  playRecording = null,
  openPlayer = null,
  documentRef = globalThis.document,
  rootId = "market-flow-us-replay-recorder"
}) {
  if (!recorder || typeof recorder.subscribe !== "function") {
    throw new TypeError("recorder is required.");
  }
  if (exportRecording !== null && typeof exportRecording !== "function") {
    throw new TypeError("exportRecording must be a function when supplied.");
  }
  if (playRecording !== null && typeof playRecording !== "function") {
    throw new TypeError("playRecording must be a function when supplied.");
  }
  if (openPlayer !== null && typeof openPlayer !== "function") {
    throw new TypeError("openPlayer must be a function when supplied.");
  }
  if (!documentRef?.body) throw new Error("document.body is required.");

  documentRef.getElementById(rootId)?.remove();

  const host = documentRef.createElement("section");
  host.id = rootId;
  host.dir = "rtl";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; z-index: 2147483647; top: 16px; right: 16px; width: min(430px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; background: #111827; color: #f9fafb; border: 1px solid #374151; border-radius: 12px; box-shadow: 0 18px 48px rgba(0,0,0,.35); padding: 14px; font: 14px/1.45 Arial, sans-serif; direction: rtl; }
      h1 { font-size: 18px; margin: 0 0 10px; }
      .row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
      input { min-width: 0; flex: 1; box-sizing: border-box; border: 1px solid #4b5563; border-radius: 7px; background: #1f2937; color: inherit; padding: 7px 8px; }
      button { border: 1px solid #4b5563; border-radius: 7px; background: #374151; color: inherit; padding: 7px 10px; cursor: pointer; }
      button:disabled { opacity: .45; cursor: default; }
      .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 10px 0; }
      .metric, .storage, .library-item { background: #1f2937; border-radius: 8px; padding: 8px; }
      .label { color: #9ca3af; font-size: 12px; }
      .value { font-weight: 700; }
      .error { color: #fca5a5; min-height: 20px; }
      .notice { color: #86efac; min-height: 20px; }
      .library { display: grid; gap: 7px; margin-top: 8px; }
      .library-item { display: grid; gap: 5px; }
      .library-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .library-meta { color: #d1d5db; font-size: 12px; }
      .danger { border-color: #7f1d1d; background: #450a0a; }
      .complete { color: #86efac; }
      .incomplete { color: #fde68a; }
      .header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .header-actions { display: flex; gap: 6px; }
      .close { padding: 3px 8px; }
    </style>
    <div class="panel">
      <div class="header">
        <h1>Market Replay — הקלטה</h1>
        <div class="header-actions"><button class="open-player" type="button">Player</button><button class="close" type="button" title="סגור חלון">×</button></div>
      </div>
      <div class="row"><input class="name" maxlength="120" placeholder="שם הקלטה (אופציונלי)"><button class="record" type="button">Record</button><button class="stop" type="button">Stop</button></div>
      <div class="metrics">
        <div class="metric"><div class="label">סטטוס</div><div class="value status"></div></div>
        <div class="metric"><div class="label">משך שוק מוקלט</div><div class="value duration"></div></div>
        <div class="metric"><div class="label">Frames</div><div class="value frames"></div></div>
        <div class="metric"><div class="label">גודל משוער</div><div class="value bytes"></div></div>
      </div>
      <div class="storage"></div>
      <div class="error"></div>
      <div class="notice"></div>
      <div class="row"><strong>הקלטות</strong><button class="refresh" type="button">רענן</button></div>
      <div class="library"></div>
    </div>`;

  const elements = {
    close: shadow.querySelector(".close"),
    openPlayer: shadow.querySelector(".open-player"),
    name: shadow.querySelector(".name"),
    record: shadow.querySelector(".record"),
    stop: shadow.querySelector(".stop"),
    status: shadow.querySelector(".status"),
    duration: shadow.querySelector(".duration"),
    frames: shadow.querySelector(".frames"),
    bytes: shadow.querySelector(".bytes"),
    storage: shadow.querySelector(".storage"),
    error: shadow.querySelector(".error"),
    notice: shadow.querySelector(".notice"),
    refresh: shadow.querySelector(".refresh"),
    library: shadow.querySelector(".library")
  };

  let busy = false;
  let operationError = "";
  let operationNotice = "";

  function clearOperationMessages() {
    operationError = "";
    operationNotice = "";
  }

  function setBusy(value) {
    busy = value;
    render(recorder.getState());
  }

  function statusLabel(status) {
    return ({
      idle: "מוכן",
      recording: "מקליט",
      stopping: "עוצר",
      storage_error: "נעצר בגלל שגיאת אחסון"
    })[status] ?? status;
  }

  function renderLibrary(library, activeRecordingId, activeStatus) {
    elements.library.replaceChildren();
    if (library.length === 0) {
      elements.library.append(text(documentRef, "div", "אין הקלטות עדיין.", "library-meta"));
      return;
    }

    for (const item of library) {
      const card = text(documentRef, "div", "", "library-item");
      const titleRow = text(documentRef, "div", "", "library-title");
      const title = text(documentRef, "strong", item.name);
      const status = text(documentRef, "span", item.status === "complete" ? "complete" : "incomplete", item.status);
      titleRow.append(title, status);

      const dates = item.firstFrameAtMs === null
        ? "ללא frames"
        : `${new Date(item.firstFrameAtMs).toLocaleString()} → ${new Date(item.lastFrameAtMs).toLocaleString()}`;
      const meta = text(
        documentRef,
        "div",
        `${dates} | ${formatDuration(item.durationMs)} | ${item.frameCount} frames | ${formatBytes(item.approximateBytes)}`,
        "library-meta"
      );

      const actions = text(documentRef, "div", "", "row");
      const playButton = text(documentRef, "button", "נגן");
      playButton.type = "button";
      playButton.disabled = busy || item.status !== "complete" || playRecording === null;
      playButton.addEventListener("click", async () => {
        if (!playRecording) return;
        clearOperationMessages();
        setBusy(true);
        try {
          await playRecording({ id: item.id, name: item.name });
          operationNotice = "ההקלטה נבחרה ב־Player.";
        } catch {
          operationError = "לא ניתן לפתוח את ההקלטה ב־Player.";
        } finally {
          setBusy(false);
        }
      });

      const renameInput = documentRef.createElement("input");
      renameInput.value = item.name;
      renameInput.maxLength = 120;
      const renameButton = text(documentRef, "button", "שנה שם");
      renameButton.type = "button";
      renameButton.disabled = busy;
      renameButton.addEventListener("click", async () => {
        const nextName = renameInput.value.trim();
        if (!nextName) return;
        clearOperationMessages();
        setBusy(true);
        try {
          await recorder.renameRecording(item.id, nextName);
        } catch {
          operationError = "שינוי השם נכשל.";
        } finally {
          setBusy(false);
        }
      });

      const exportButton = text(documentRef, "button", "ייצוא");
      exportButton.type = "button";
      exportButton.disabled = busy || item.status !== "complete" || exportRecording === null;
      exportButton.addEventListener("click", async () => {
        if (!exportRecording) return;
        clearOperationMessages();
        setBusy(true);
        try {
          await exportRecording({ id: item.id, name: item.name });
          operationNotice = "הייצוא הושלם ונבדק. עותק הדפדפן נשאר ולא נמחק.";
        } catch (error) {
          if (error?.name === "AbortError") {
            operationNotice = "הייצוא בוטל.";
          } else if (error?.code === "REPLAY_EXPORT_STREAMING_REQUIRED") {
            operationError = "ההקלטה גדולה מדי לייצוא בזיכרון. נדרש דפדפן עם שמירה ישירה לקובץ.";
          } else {
            operationError = "ייצוא ההקלטה נכשל. עותק הדפדפן נשאר ללא שינוי.";
          }
        } finally {
          setBusy(false);
        }
      });

      const deleteButton = text(documentRef, "button", "מחק", "danger");
      deleteButton.type = "button";
      deleteButton.disabled = busy || (item.id === activeRecordingId && ["recording", "stopping"].includes(activeStatus));
      deleteButton.addEventListener("click", async () => {
        if (!globalThis.confirm?.(`למחוק את ההקלטה “${item.name}”?`)) return;
        clearOperationMessages();
        setBusy(true);
        try {
          await recorder.deleteRecording(item.id);
        } catch {
          operationError = "מחיקת ההקלטה נכשלה.";
        } finally {
          setBusy(false);
        }
      });
      actions.append(playButton, renameInput, renameButton, exportButton, deleteButton);
      card.append(titleRow, meta, actions);
      elements.library.append(card);
    }
  }

  function render(state) {
    const active = state.status === "recording" || state.status === "stopping";
    elements.record.disabled = busy || active;
    elements.stop.disabled = busy || !active;
    elements.name.disabled = busy || active;
    elements.refresh.disabled = busy;
    elements.openPlayer.disabled = busy || openPlayer === null;
    elements.status.textContent = statusLabel(state.status);
    elements.duration.textContent = formatDuration(state.durationMs);
    elements.frames.textContent = String(state.frameCount);
    elements.bytes.textContent = formatBytes(state.approximateBytes);

    const recorderError = state.latestErrorCode === "PROVIDER_SNAPSHOT_FAILED"
      ? `ה־provider לא החזיר snapshot מלא. לא נוצר frame. ניסיונות שנכשלו: ${state.providerFailureCount}`
      : state.latestErrorCode === "STORAGE_WRITE_FAILED"
        ? "ההקלטה נעצרה בגלל כשל כתיבה/מכסה. frames שכבר נשמרו לא נמחקו."
        : "";
    elements.error.textContent = operationError || recorderError;
    elements.notice.textContent = operationNotice;

    const estimate = state.storageEstimate;
    elements.storage.textContent = estimate.available
      ? `אחסון דפדפן משוער: ${formatBytes(estimate.usage)} בשימוש מתוך ${formatBytes(estimate.quota)} (מידע בלבד, לא הבטחת מקום)`
      : "אומדן מכסת אחסון אינו זמין בדפדפן זה.";

    renderLibrary(state.library, state.recordingId, state.status);
  }

  elements.record.addEventListener("click", async () => {
    clearOperationMessages();
    setBusy(true);
    try {
      await recorder.start({ name: elements.name.value });
    } catch {
      operationError = "לא ניתן להתחיל הקלטה.";
    } finally {
      setBusy(false);
    }
  });

  elements.stop.addEventListener("click", async () => {
    clearOperationMessages();
    setBusy(true);
    try {
      await recorder.stop();
    } catch {
      operationError = "לא ניתן לעצור את ההקלטה בצורה נקייה.";
    } finally {
      setBusy(false);
    }
  });

  elements.refresh.addEventListener("click", async () => {
    clearOperationMessages();
    setBusy(true);
    try {
      await Promise.allSettled([recorder.refreshLibrary(), recorder.refreshStorageEstimate()]);
    } finally {
      setBusy(false);
    }
  });

  elements.openPlayer.addEventListener("click", () => {
    clearOperationMessages();
    openPlayer?.();
  });

  elements.close.addEventListener("click", () => {
    host.style.display = "none";
  });

  const unsubscribe = recorder.subscribe(render);
  documentRef.body.append(host);

  return Object.freeze({
    host,
    show() {
      host.style.display = "";
    },
    destroy() {
      unsubscribe();
      host.remove();
    }
  });
}
