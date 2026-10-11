import { createBacktestLabClient } from "./client.js";
import { createBacktestLabSurface } from "./surface.js";

const SWEEP_PAGE_LIMIT = 50;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatTime(ms) {
  if (!Number.isSafeInteger(ms)) return "—";
  return new Date(ms).toLocaleString("en-GB", { hour12: false });
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function datetimeLocalValue(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function selectedHorizons(shadow) {
  return [...shadow.querySelectorAll(".horizons input:checked")].map((input) => Number(input.value));
}

function selectedQueries(shadow, querySet) {
  const slots = querySet === "single" ? ["A"] : ["A", "B", "C"];
  const queries = [];
  for (const slot of slots) {
    const card = shadow.querySelector(`.query-${slot.toLowerCase()}`);
    if (!card || card.classList.contains("hidden")) continue;
    const select = card.querySelector(".template");
    const sql = card.querySelector(".sql")?.value ?? "";
    if (sql.trim().length === 0) throw new Error(`Query ${slot} SQL ריק.`);
    const templateId = select?.value === "__custom__" ? "custom" : select?.value || "custom";
    const selectedOption = select?.selectedOptions?.[0];
    queries.push({
      id: `point:${slot}:${templateId}`,
      name: templateId === "custom" ? `Custom Query ${slot}` : selectedOption?.textContent || `Query ${slot}`,
      sql
    });
  }
  if (queries.length === 0) throw new Error("יש לבחור לפחות Query אחד ל־Sweep.");
  return queries;
}

function setSweepQueryVisibility(shadow, querySet) {
  const queryB = shadow.querySelector(".query-b");
  const queryC = shadow.querySelector(".query-c");
  const toggleC = shadow.querySelector(".toggle-c");
  if (querySet === "single") {
    queryB?.classList.add("hidden");
    queryC?.classList.add("hidden");
    if (toggleC) toggleC.hidden = true;
    return;
  }

  queryB?.classList.remove("hidden");
  if (toggleC) {
    toggleC.hidden = false;
    const cEnabled = toggleC.textContent?.includes("הסר") === true;
    queryC?.classList.toggle("hidden", !cEnabled);
  }
}

function pointQuerySummary(point, compactQuery) {
  const horizonMs = safeArray(point?.request?.horizonsMs).at(-1);
  const summary = safeArray(compactQuery?.summary).find((item) => item.horizonMs === horizonMs)
    ?? safeArray(compactQuery?.summary).at(-1)
    ?? null;
  if (!summary) return "אין summary";
  return `avg ${formatPercent(summary.averagePercent)} · ${summary.availableCount}/${summary.availableCount + summary.unavailableCount} available`;
}

export function attachBacktestSweepUi({ client, surface, injectPoint } = {}) {
  if (!client || typeof client.runSweep !== "function" || typeof client.pageSweep !== "function"
    || typeof client.openSweepPoint !== "function" || typeof injectPoint !== "function") {
    throw new TypeError("Backtest Sweep UI dependencies are required.");
  }
  const shadow = surface?.host?.shadowRoot;
  if (!shadow) throw new Error("Backtest surface shadow root is required.");

  const modes = shadow.querySelector(".modes");
  const compareRadio = shadow.querySelector('input[name="mode"][value="compare"]');
  const inspectRadio = shadow.querySelector('input[name="mode"][value="inspect"]');
  const pointRun = shadow.querySelector(".run");
  const decisionTime = shadow.querySelector(".decision-time");
  const decisionLabel = decisionTime?.closest("label");
  const firstPanel = shadow.querySelector('section[aria-label="Backtest configuration"]');
  const results = shadow.querySelector(".results");
  if (!modes || !compareRadio || !inspectRadio || !pointRun || !decisionTime || !firstPanel || !results) {
    throw new Error("Backtest Sweep UI could not find the existing Backtest controls.");
  }

  const sweepLabel = document.createElement("label");
  const sweepRadio = document.createElement("input");
  sweepRadio.type = "radio";
  sweepRadio.name = "mode";
  sweepRadio.value = "sweep";
  sweepRadio.setAttribute("aria-label", "Sweep");
  sweepLabel.append(sweepRadio, document.createTextNode(" Sweep"));
  modes.append(sweepLabel);

  const sweepPanel = document.createElement("section");
  sweepPanel.className = "panel";
  sweepPanel.setAttribute("aria-label", "Sweep configuration");
  sweepPanel.hidden = true;
  sweepPanel.innerHTML = `
    <h2>Sweep — טווח היסטורי</h2>
    <div class="controls">
      <label>From
        <input class="sweep-from" aria-label="Sweep from" type="datetime-local" step="1">
      </label>
      <label>To
        <input class="sweep-to" aria-label="Sweep to" type="datetime-local" step="1">
      </label>
      <label>כל כמה
        <input class="sweep-interval" aria-label="Sweep interval" type="number" min="1" step="1" value="10">
      </label>
      <label>יחידה
        <select class="sweep-unit" aria-label="Sweep interval unit">
          <option value="seconds" selected>seconds</option>
          <option value="minutes">minutes</option>
        </select>
      </label>
      <label>Queries
        <select class="sweep-query-set" aria-label="Sweep query set">
          <option value="compare" selected>Current Compare set</option>
          <option value="single">Query A only</option>
        </select>
      </label>
    </div>
    <div class="run-row">
      <button class="sweep-run primary" type="button">Run Sweep</button>
      <span class="sweep-status" role="status" aria-live="polite"></span>
    </div>
    <div class="error sweep-error" role="alert" hidden></div>`;
  firstPanel.after(sweepPanel);

  const timeline = document.createElement("section");
  timeline.className = "panel sweep-timeline";
  timeline.setAttribute("aria-label", "Sweep timeline");
  timeline.hidden = true;
  results.before(timeline);

  const fromInput = sweepPanel.querySelector(".sweep-from");
  const toInput = sweepPanel.querySelector(".sweep-to");
  const intervalInput = sweepPanel.querySelector(".sweep-interval");
  const unitSelect = sweepPanel.querySelector(".sweep-unit");
  const querySetSelect = sweepPanel.querySelector(".sweep-query-set");
  const sweepRun = sweepPanel.querySelector(".sweep-run");
  const sweepStatus = sweepPanel.querySelector(".sweep-status");
  const sweepError = sweepPanel.querySelector(".sweep-error");

  let activeSweep = null;
  let currentPage = null;
  let busy = true;

  function setError(message = "") {
    sweepError.hidden = message.length === 0;
    sweepError.textContent = message;
  }

  function setBusy(nextBusy, status = "") {
    busy = nextBusy;
    sweepRun.disabled = nextBusy;
    fromInput.disabled = nextBusy;
    toInput.disabled = nextBusy;
    intervalInput.disabled = nextBusy;
    unitSelect.disabled = nextBusy;
    querySetSelect.disabled = nextBusy;
    sweepStatus.textContent = status;
  }

  function enterSweep() {
    if (!compareRadio.checked) {
      compareRadio.checked = true;
      compareRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    compareRadio.checked = false;
    inspectRadio.checked = false;
    sweepRadio.checked = true;
    sweepPanel.hidden = false;
    if (decisionLabel) decisionLabel.hidden = true;
    pointRun.hidden = true;
    setSweepQueryVisibility(shadow, querySetSelect.value);
    if (activeSweep) timeline.hidden = false;
  }

  function exitSweep() {
    sweepPanel.hidden = true;
    if (decisionLabel) decisionLabel.hidden = false;
    pointRun.hidden = false;
  }

  function buildSweepRequest() {
    const sourceId = shadow.querySelector(".source")?.value ?? "";
    if (!sourceId) throw new Error("יש לבחור מקור evidence.");
    const fromAtMs = new Date(fromInput.value).getTime();
    const toAtMs = new Date(toInput.value).getTime();
    if (!Number.isSafeInteger(fromAtMs) || fromAtMs < 0 || !Number.isSafeInteger(toAtMs) || toAtMs < fromAtMs) {
      throw new Error("יש לבחור טווח Sweep תקין שבו From אינו אחרי To.");
    }
    const intervalValue = Number(intervalInput.value);
    if (!Number.isSafeInteger(intervalValue) || intervalValue < 1) {
      throw new Error("Sweep interval חייב להיות מספר שלם וחיובי.");
    }
    const horizonsMs = selectedHorizons(shadow);
    if (horizonsMs.length === 0) throw new Error("יש לבחור לפחות horizon אחד.");
    const topXValue = shadow.querySelector(".top-x")?.value;
    return {
      sourceId,
      fromAtMs,
      toAtMs,
      intervalValue,
      intervalUnit: unitSelect.value,
      queries: selectedQueries(shadow, querySetSelect.value),
      topX: topXValue === "all" ? null : Number(topXValue),
      horizonsMs
    };
  }

  function renderTimeline() {
    timeline.replaceChildren();
    timeline.hidden = false;
    if (!activeSweep || !currentPage) return;

    timeline.append(document.createElement("h2"));
    timeline.querySelector("h2").textContent = "Sweep timeline";

    const metrics = document.createElement("div");
    metrics.className = "meta";
    const values = [
      `Requested: ${activeSweep.metrics.requestedPointCount}`,
      `Available: ${activeSweep.metrics.availablePointCount}`,
      `Unavailable: ${activeSweep.metrics.unavailablePointCount}`,
      `Distinct baselines: ${activeSweep.metrics.distinctBaselineCount}`,
      `Query executions: ${activeSweep.metrics.queryExecutionCount}`,
      `Interval: ${activeSweep.request.intervalValue} ${activeSweep.request.intervalUnit}`
    ];
    for (const value of values) {
      const span = document.createElement("span");
      span.textContent = value;
      metrics.append(span);
    }
    timeline.append(metrics);

    if (currentPage.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "אין נקודות בעמוד הזה.";
      timeline.append(empty);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      const table = document.createElement("table");
      table.setAttribute("aria-label", "Sweep timeline points");
      const thead = document.createElement("thead");
      const head = document.createElement("tr");
      for (const label of ["#", "T0", "Baseline", "Query summary", "Compare", "Open"]) {
        const th = document.createElement("th");
        th.textContent = label;
        head.append(th);
      }
      thead.append(head);
      const tbody = document.createElement("tbody");
      for (const point of currentPage.items) {
        const row = document.createElement("tr");
        row.dataset.sweepIndex = String(point.index);
        const cells = [
          String(point.index + 1),
          formatTime(point.requestedAtMs),
          point.available ? `cycle ${point.baseline?.cycleId ?? "—"}` : `Unavailable: ${point.unavailableReason ?? "NO_BASELINE"}`,
          point.available
            ? safeArray(point.queries).map((query) => {
              const name = activeSweep.request.queries.find((item) => item.id === query.id)?.name ?? query.id;
              return `${name}: ${pointQuerySummary(activeSweep, query)}`;
            }).join(" | ")
            : "—",
          point.available && point.comparison
            ? `union ${point.comparison.unionCount}, common ${point.comparison.commonCount}`
            : "—"
        ];
        for (const value of cells) {
          const td = document.createElement("td");
          td.textContent = value;
          row.append(td);
        }
        const action = document.createElement("td");
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "Open";
        open.setAttribute("aria-label", `Open Sweep point ${point.index + 1}`);
        open.addEventListener("click", () => void openPoint(point.index));
        action.append(open);
        row.append(action);
        tbody.append(row);
      }
      table.append(thead, tbody);
      wrap.append(table);
      timeline.append(wrap);
    }

    const pager = document.createElement("div");
    pager.className = "run-row";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = currentPage.offset === 0;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage.offset + currentPage.items.length >= currentPage.totalCount;
    const pageText = document.createElement("span");
    const start = currentPage.totalCount === 0 ? 0 : currentPage.offset + 1;
    const end = currentPage.offset + currentPage.items.length;
    pageText.textContent = `${start}-${end} / ${currentPage.totalCount}`;
    previous.addEventListener("click", () => void loadPage(Math.max(0, currentPage.offset - currentPage.limit)));
    next.addEventListener("click", () => void loadPage(currentPage.offset + currentPage.limit));
    pager.append(previous, next, pageText);
    timeline.append(pager);
  }

  async function loadPage(offset) {
    if (!activeSweep || busy) return;
    setError("");
    setBusy(true, "טוען Sweep page...");
    try {
      currentPage = await client.pageSweep(activeSweep.id, offset, SWEEP_PAGE_LIMIT);
      renderTimeline();
      setBusy(false, "Sweep מוכן.");
    } catch (error) {
      setError(`טעינת Sweep page נכשלה: ${error?.message ?? "unknown error"} [${error?.code ?? "BACKTEST_CLIENT_ERROR"}]`);
      setBusy(false, "טעינת page נכשלה.");
    }
  }

  async function openPoint(index) {
    if (!activeSweep || busy) return;
    setError("");
    setBusy(true, `פותח נקודה ${index + 1}...`);
    try {
      const point = await client.openSweepPoint(activeSweep.id, index);
      await injectPoint(point, activeSweep.request);
      setBusy(false, `נפתחה נקודה ${index + 1} ב־Inspect/Compare.`);
    } catch (error) {
      setError(`פתיחת Sweep point נכשלה: ${error?.message ?? "unknown error"} [${error?.code ?? "BACKTEST_CLIENT_ERROR"}]`);
      setBusy(false, "פתיחת נקודה נכשלה.");
    }
  }

  async function runSweep() {
    if (busy) return;
    setError("");
    let request;
    try {
      request = buildSweepRequest();
    } catch (error) {
      setError(error?.message ?? "Sweep configuration is invalid.");
      return;
    }

    setBusy(true, "מריץ Sweep...");
    try {
      activeSweep = await client.runSweep(request);
      currentPage = activeSweep.page;
      renderTimeline();
      setBusy(false, `Sweep הושלם: ${activeSweep.metrics.requestedPointCount} נקודות.`);
    } catch (error) {
      activeSweep = null;
      currentPage = null;
      timeline.hidden = true;
      setError(`הרצת Sweep נכשלה: ${error?.message ?? "unknown error"} [${error?.code ?? "BACKTEST_CLIENT_ERROR"}]`);
      setBusy(false, "Sweep נכשל.");
    }
  }

  sweepRadio.addEventListener("change", () => {
    if (sweepRadio.checked) enterSweep();
  });
  compareRadio.addEventListener("change", () => {
    if (compareRadio.checked) exitSweep();
  });
  inspectRadio.addEventListener("change", () => {
    if (inspectRadio.checked) exitSweep();
  });
  querySetSelect.addEventListener("change", () => setSweepQueryVisibility(shadow, querySetSelect.value));
  sweepRun.addEventListener("click", () => void runSweep());

  Promise.resolve(surface.ready).finally(() => {
    setBusy(false, "Sweep מוכן.");
  });

  return Object.freeze({
    getActiveSweep() { return activeSweep; },
    show() {
      sweepRadio.checked = true;
      sweepRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

const baseClient = createBacktestLabClient();
let injectedPoint = null;
const client = Object.freeze({
  listSources: (...args) => baseClient.listSources(...args),
  listQueries: (...args) => baseClient.listQueries(...args),
  runPoint: async (...args) => {
    if (injectedPoint !== null) {
      const point = injectedPoint;
      injectedPoint = null;
      return point;
    }
    return await baseClient.runPoint(...args);
  },
  runSweep: (...args) => baseClient.runSweep(...args),
  pageSweep: (...args) => baseClient.pageSweep(...args),
  openSweepPoint: (...args) => baseClient.openSweepPoint(...args)
});

const surface = createBacktestLabSurface({ client, initiallyVisible: true });

async function injectPoint(point, sweepRequest) {
  const shadow = surface.host.shadowRoot;
  const compareRadio = shadow.querySelector('input[name="mode"][value="compare"]');
  const inspectRadio = shadow.querySelector('input[name="mode"][value="inspect"]');
  const toggleC = shadow.querySelector(".toggle-c");
  const queryCards = ["a", "b", "c"].map((slot) => shadow.querySelector(`.query-${slot}`));

  if (point.queries.length === 1) {
    inspectRadio.checked = true;
    inspectRadio.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    compareRadio.checked = true;
    compareRadio.dispatchEvent(new Event("change", { bubbles: true }));
    const cEnabled = toggleC.textContent?.includes("הסר") === true;
    if (point.queries.length >= 3 && !cEnabled) toggleC.click();
    if (point.queries.length < 3 && cEnabled) toggleC.click();
  }

  shadow.querySelector(".source").value = sweepRequest.sourceId;
  shadow.querySelector(".decision-time").value = datetimeLocalValue(point.requestedAtMs);
  shadow.querySelector(".top-x").value = sweepRequest.topX === null ? "all" : String(sweepRequest.topX);
  const horizonSet = new Set(sweepRequest.horizonsMs);
  for (const input of shadow.querySelectorAll(".horizons input")) {
    input.checked = horizonSet.has(Number(input.value));
  }
  point.queries.forEach((query, index) => {
    const card = queryCards[index];
    if (!card) return;
    const select = card.querySelector(".template");
    const sql = card.querySelector(".sql");
    if ([...select.options].some((option) => option.value === "__custom__")) select.value = "__custom__";
    sql.value = query.sql;
  });

  injectedPoint = point;
  shadow.querySelector(".run").click();
  await Promise.resolve();
  await Promise.resolve();
  if (injectedPoint !== null) {
    injectedPoint = null;
    throw new Error("The existing Inspect/Compare renderer did not consume the opened Sweep point.");
  }
}

attachBacktestSweepUi({ client, surface, injectPoint });
