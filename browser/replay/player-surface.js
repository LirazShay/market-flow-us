function formatDuration(ms) {
  const totalSeconds = Math.floor((Number.isFinite(ms) ? Math.max(0, ms) : 0) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function statusLabel(status) {
  return ({
    idle: "אין מקור נבחר",
    source_ready: "מקור מוכן",
    ready: "מוכן לניגון",
    playing: "מנגן",
    paused: "מושהה",
    stopping: "עוצר",
    stopped: "נעצר — נדרש run חדש",
    seek_pending: "Seek נבחר — נדרש run חדש",
    completed: "הניגון הסתיים",
    empty: "הקלטה ריקה",
    error: "שגיאה"
  })[status] ?? status;
}

function sourceKindLabel(kind) {
  return ({ indexeddb: "IndexedDB", file: "קובץ" })[kind] ?? (kind || "—");
}

export function createReplayPlayerSurface({
  controller,
  documentRef = globalThis.document,
  rootId = "market-flow-us-replay-player",
  initiallyVisible = false
}) {
  if (!controller || typeof controller.subscribe !== "function") {
    throw new TypeError("Replay player controller is required.");
  }
  if (!documentRef?.body) throw new Error("document.body is required.");

  documentRef.getElementById(rootId)?.remove();

  const host = documentRef.createElement("section");
  host.id = rootId;
  host.dir = "rtl";
  if (!initiallyVisible) host.style.display = "none";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel { position: fixed; z-index: 2147483647; top: 16px; left: 16px; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; background: #111827; color: #f9fafb; border: 1px solid #374151; border-radius: 12px; box-shadow: 0 18px 48px rgba(0,0,0,.35); padding: 14px; font: 14px/1.45 Arial, sans-serif; direction: rtl; }
      .header, .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .header { justify-content: space-between; }
      h1 { font-size: 18px; margin: 0; }
      button { border: 1px solid #4b5563; border-radius: 7px; background: #374151; color: inherit; padding: 7px 10px; cursor: pointer; }
      button:disabled, input:disabled { opacity: .45; cursor: default; }
      input[type=file] { max-width: 100%; }
      input[type=range] { width: 100%; }
      .card { margin-top: 10px; background: #1f2937; border-radius: 8px; padding: 9px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
      .label { color: #9ca3af; font-size: 12px; }
      .value { font-weight: 700; overflow-wrap: anywhere; }
      .error { color: #fca5a5; min-height: 20px; margin-top: 7px; }
      .notice { color: #fde68a; min-height: 20px; margin-top: 4px; }
      .ok { color: #86efac; }
      .muted { color: #9ca3af; }
      .close { padding: 3px 8px; }
      .controls { margin-top: 10px; }
      .timeline-labels { display: flex; justify-content: space-between; gap: 8px; font-variant-numeric: tabular-nums; }
    </style>
    <div class="panel">
      <div class="header">
        <h1>Market Replay — Player</h1>
        <button class="close" type="button" title="סגור חלון">×</button>
      </div>

      <div class="card">
        <div class="label">מקור</div>
        <div class="value source-name">לא נבחר מקור</div>
        <div class="muted source-kind"></div>
        <div class="row" style="margin-top:8px">
          <input class="file" type="file" accept=".jsonl,application/x-ndjson,application/jsonl">
        </div>
      </div>

      <div class="card controls">
        <div class="row">
          <button class="play" type="button">Play</button>
          <button class="pause" type="button">Pause</button>
          <button class="stop" type="button">Stop</button>
          <strong>1x</strong>
        </div>
        <div style="margin-top:10px">
          <input class="timeline" type="range" min="0" max="0" step="1" value="0">
          <div class="timeline-labels"><span class="position">00:00:00</span><span class="duration">00:00:00</span></div>
        </div>
      </div>

      <div class="card grid">
        <div><div class="label">סטטוס</div><div class="value status"></div></div>
        <div><div class="label">Frame</div><div class="value frames"></div></div>
        <div><div class="label">Producer</div><div class="value producer"></div></div>
        <div><div class="label">Service</div><div class="value service"></div></div>
      </div>

      <div class="notice"></div>
      <div class="error"></div>
    </div>`;

  const elements = {
    close: shadow.querySelector(".close"),
    file: shadow.querySelector(".file"),
    play: shadow.querySelector(".play"),
    pause: shadow.querySelector(".pause"),
    stop: shadow.querySelector(".stop"),
    timeline: shadow.querySelector(".timeline"),
    position: shadow.querySelector(".position"),
    duration: shadow.querySelector(".duration"),
    sourceName: shadow.querySelector(".source-name"),
    sourceKind: shadow.querySelector(".source-kind"),
    status: shadow.querySelector(".status"),
    frames: shadow.querySelector(".frames"),
    producer: shadow.querySelector(".producer"),
    service: shadow.querySelector(".service"),
    notice: shadow.querySelector(".notice"),
    error: shadow.querySelector(".error")
  };

  let busy = false;
  let operationError = "";

  function render(state) {
    const hasSource = state.sourceReady === true;
    const hasPlayer = state.playerAvailable === true;
    const active = state.status === "playing";
    const pausable = active;
    const stoppable = ["playing", "paused"].includes(state.status);
    const canPlay = hasPlayer
      && !state.requiresFreshRun
      && !["playing", "stopping", "stopped", "seek_pending", "completed", "error", "empty"].includes(state.status);

    elements.sourceName.textContent = hasSource ? state.sourceName : "לא נבחר מקור";
    elements.sourceKind.textContent = hasSource ? `מקור: ${sourceKindLabel(state.sourceKind)}` : "";
    elements.status.textContent = statusLabel(state.status);
    elements.position.textContent = formatDuration(state.positionMs);
    elements.duration.textContent = formatDuration(state.durationMs);
    elements.timeline.max = String(Math.max(0, Math.floor(state.durationMs)));
    elements.timeline.value = String(Math.min(
      Math.max(0, Math.floor(state.positionMs)),
      Math.max(0, Math.floor(state.durationMs))
    ));
    elements.timeline.disabled = busy || !hasSource || state.status === "stopping";
    elements.play.disabled = busy || !canPlay;
    elements.pause.disabled = busy || !pausable;
    elements.stop.disabled = busy || !stoppable;
    elements.file.disabled = busy || ["playing", "paused", "stopping"].includes(state.status);

    const displayedFrame = state.committedSequence === null
      ? (hasSource ? state.selectedSequence + 1 : 0)
      : state.committedSequence + 1;
    elements.frames.textContent = `${displayedFrame} / ${state.frameCount}`;
    elements.producer.textContent = state.producerAvailable ? "מוגדר" : "לא מוגדר";
    elements.producer.className = `value producer ${state.producerAvailable ? "ok" : "muted"}`;
    elements.service.textContent = state.serviceReady ? "מחובר" : "לא מחובר";
    elements.service.className = `value service ${state.serviceReady ? "ok" : "muted"}`;

    if (state.requiresFreshRun) {
      elements.notice.textContent = "ה־Stop/Seek סגר את ה־run הנוכחי. נדרש Replay run חדש לפני Play נוסף.";
    } else if (hasSource && !hasPlayer) {
      elements.notice.textContent = "המקור מוכן. Replay Host/producer מבודד עדיין לא מוכן; Play נשאר חסום כדי לא לגעת ב־DB הרגיל.";
    } else {
      elements.notice.textContent = "";
    }

    const playerError = state.latestError?.message ?? "";
    elements.error.textContent = operationError || playerError;
  }

  function setBusy(value) {
    busy = value;
    render(controller.getState());
  }

  async function run(action, fallbackMessage) {
    operationError = "";
    setBusy(true);
    try {
      await action();
    } catch {
      operationError = fallbackMessage;
    } finally {
      setBusy(false);
    }
  }

  elements.file.addEventListener("change", async () => {
    const file = elements.file.files?.[0];
    if (!file) return;
    await run(
      () => controller.loadPortableFile(file),
      "הקובץ אינו Replay תקין או שלא ניתן לקרוא אותו."
    );
  });

  elements.play.addEventListener("click", async () => {
    await run(() => controller.play(), "לא ניתן להתחיל/להמשיך Replay.");
  });

  elements.pause.addEventListener("click", () => {
    operationError = "";
    try {
      controller.pause();
    } catch {
      operationError = "לא ניתן להשהות Replay.";
      render(controller.getState());
    }
  });

  elements.stop.addEventListener("click", async () => {
    await run(() => controller.stop(), "לא ניתן לעצור Replay בצורה נקייה.");
  });

  elements.timeline.addEventListener("change", async () => {
    const positionMs = Number(elements.timeline.value);
    await run(
      () => controller.seekPositionMs(positionMs),
      "לא ניתן לבחור את מיקום ה־Replay."
    );
  });

  elements.close.addEventListener("click", () => {
    host.style.display = "none";
  });

  const unsubscribe = controller.subscribe(render);
  const progressInterval = globalThis.setInterval?.(() => {
    const state = controller.getState();
    if (state.status === "playing") render(state);
  }, 250) ?? null;
  documentRef.body.append(host);

  return Object.freeze({
    host,
    show() {
      host.style.display = "";
      render(controller.getState());
    },
    hide() {
      host.style.display = "none";
    },
    destroy() {
      unsubscribe();
      if (progressInterval !== null) globalThis.clearInterval?.(progressInterval);
      host.remove();
    }
  });
}
