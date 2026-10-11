const HORIZONS = Object.freeze([
  { ms: 10_000, label: "10s", defaultChecked: true },
  { ms: 20_000, label: "20s", defaultChecked: true },
  { ms: 30_000, label: "30s", defaultChecked: true },
  { ms: 45_000, label: "45s", defaultChecked: true },
  { ms: 60_000, label: "60s", defaultChecked: true },
  { ms: 90_000, label: "90s", defaultChecked: true },
  { ms: 120_000, label: "120s", defaultChecked: true },
  { ms: 180_000, label: "3m", defaultChecked: false },
  { ms: 300_000, label: "5m", defaultChecked: false },
  { ms: 600_000, label: "10m", defaultChecked: false }
]);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value, digits = 2) {
  return finite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

function formatPercent(value) {
  if (!finite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatRate(value) {
  return finite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatTime(ms) {
  if (!Number.isSafeInteger(ms)) return "—";
  return new Date(ms).toLocaleString("en-GB", { hour12: false });
}

function horizonLabel(ms) {
  return HORIZONS.find((item) => item.ms === ms)?.label ?? `${ms}ms`;
}

function makeElement(documentRef, tag, className = "", text = "") {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setText(element, value) {
  element.textContent = value ?? "";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function queryRunId(slot, templateId) {
  return `point:${slot}:${templateId || "custom"}`;
}

function unsupportedError(code) {
  return typeof code === "string"
    && (code.startsWith("SCANNER_") || code.startsWith("BACKTEST_IDENTITY_"));
}

export function createBacktestLabSurface({
  client,
  documentRef = globalThis.document,
  rootId = "market-flow-us-backtest-lab",
  initiallyVisible = true
} = {}) {
  if (!client
    || typeof client.listSources !== "function"
    || typeof client.listQueries !== "function"
    || typeof client.runPoint !== "function") {
    throw new TypeError("Backtest Lab client is required.");
  }
  if (!documentRef?.body) throw new Error("document.body is required.");

  documentRef.getElementById(rootId)?.remove();

  const host = documentRef.createElement("main");
  host.id = rootId;
  host.dir = "rtl";
  if (!initiallyVisible) host.style.display = "none";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .app { min-height: 100vh; background: #f3f4f6; color: #111827; font: 14px/1.5 Arial, sans-serif; direction: rtl; padding: 22px; }
      .shell { width: min(1500px, 100%); margin: 0 auto; }
      .header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap; }
      h1 { margin:0; font-size:26px; }
      h2 { margin:0 0 10px; font-size:18px; }
      h3 { margin:0 0 8px; font-size:15px; }
      .subtitle { color:#4b5563; margin-top:4px; }
      .panel { background:#fff; border:1px solid #d1d5db; border-radius:12px; padding:14px; margin-top:14px; box-shadow:0 2px 10px rgba(17,24,39,.04); }
      .controls { display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:12px; }
      label { display:flex; flex-direction:column; gap:5px; font-weight:700; }
      input, select, textarea, button { font:inherit; }
      input, select, textarea { width:100%; border:1px solid #9ca3af; border-radius:7px; padding:7px 8px; background:#fff; color:#111827; }
      textarea { min-height:116px; resize:vertical; direction:ltr; text-align:left; font-family:Consolas, monospace; line-height:1.35; }
      button { border:1px solid #6b7280; border-radius:8px; padding:8px 12px; background:#fff; color:#111827; cursor:pointer; }
      button.primary { background:#111827; color:#fff; border-color:#111827; font-weight:700; }
      button:disabled { opacity:.5; cursor:default; }
      .modes { display:flex; gap:8px; flex-wrap:wrap; }
      .modes label { flex-direction:row; align-items:center; font-weight:700; padding:7px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff; }
      .modes input { width:auto; }
      .query-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap:12px; }
      .query-card { border:1px solid #d1d5db; border-radius:10px; padding:11px; background:#f9fafb; }
      .query-card.hidden { display:none; }
      .query-head { display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .horizons { display:flex; gap:8px 12px; flex-wrap:wrap; }
      .horizons label { flex-direction:row; align-items:center; font-weight:400; }
      .horizons input { width:auto; }
      .help { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:9px; color:#374151; }
      .help div { background:#f9fafb; border-radius:8px; padding:9px; }
      .muted { color:#6b7280; }
      .status { min-height:24px; margin-top:10px; font-weight:700; }
      .error { color:#991b1b; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px; margin-top:10px; }
      .empty { color:#4b5563; background:#f9fafb; border:1px dashed #9ca3af; border-radius:8px; padding:13px; }
      .meta { display:flex; gap:8px 16px; flex-wrap:wrap; color:#374151; }
      .summary-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:10px; margin-top:12px; }
      .summary-card { border:1px solid #d1d5db; border-radius:9px; padding:10px; background:#fff; }
      .metric { display:flex; justify-content:space-between; gap:8px; border-top:1px solid #e5e7eb; padding:5px 0; }
      .metric:first-of-type { border-top:0; }
      .filters { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:12px 0; }
      .filters label { flex-direction:row; align-items:center; font-weight:400; }
      .filters input { width:auto; }
      .side-by-side { display:grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap:12px; align-items:start; }
      .evidence-card { border:1px solid #d1d5db; border-radius:10px; padding:10px; background:#fff; min-width:0; }
      .table-wrap { overflow:auto; max-height:65vh; border:1px solid #e5e7eb; border-radius:8px; }
      table { border-collapse:collapse; width:100%; min-width:760px; direction:ltr; text-align:left; font-variant-numeric:tabular-nums; }
      th, td { border-bottom:1px solid #e5e7eb; padding:7px 8px; vertical-align:top; white-space:nowrap; }
      th { position:sticky; top:0; background:#f3f4f6; z-index:1; }
      tr.common { background:#f0fdf4; }
      tr.exclusive { background:#fff7ed; }
      tr.position-changed { outline:1px dashed #7c3aed; outline-offset:-2px; }
      .identity { white-space:normal; min-width:170px; }
      .identity strong { display:block; }
      .horizon-cell { min-width:98px; }
      .positive { color:#166534; font-weight:700; }
      .negative { color:#991b1b; font-weight:700; }
      .flat { color:#374151; font-weight:700; }
      .unavailable { color:#6b7280; white-space:normal; }
      details { margin-top:10px; }
      summary { cursor:pointer; font-weight:700; }
      pre { direction:ltr; text-align:left; white-space:pre-wrap; overflow-wrap:anywhere; background:#111827; color:#f9fafb; padding:10px; border-radius:8px; max-height:260px; overflow:auto; }
      .run-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:12px; }
      .advanced { margin-top:8px; }
      @media (max-width: 700px) { .app { padding:10px; } .side-by-side { grid-template-columns:1fr; } }
    </style>
    <div class="app">
      <div class="shell">
        <div class="header">
          <div>
            <h1>Market Flow US — Backtest Lab</h1>
            <div class="subtitle">בדיקה היסטורית דטרמיניסטית של Scanner SQL. התוצאות הן evidence להשוואה, לא הכרזה על "מנצח".</div>
          </div>
          <div class="modes" role="group" aria-label="Backtest mode">
            <label><input type="radio" name="mode" value="compare" checked> Compare</label>
            <label><input type="radio" name="mode" value="inspect"> Inspect</label>
          </div>
        </div>

        <section class="panel" aria-label="Backtest configuration">
          <h2>1. נקודת החלטה היסטורית</h2>
          <div class="controls">
            <label>מקור evidence
              <select class="source" aria-label="Evidence source"></select>
            </label>
            <label>זמן החלטה היסטורי
              <input class="decision-time" aria-label="Historical decision time" type="datetime-local" step="1">
            </label>
            <label>Top X
              <select class="top-x" aria-label="Top X">
                <option value="10" selected>Top 10</option>
                <option value="20">Top 20</option>
                <option value="50">Top 50</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
        </section>

        <section class="panel" aria-label="Query configuration">
          <div class="query-head">
            <h2>2. Queries</h2>
            <button class="toggle-c" type="button">הוסף Query C</button>
          </div>
          <div class="query-grid">
            <article class="query-card query-a" data-slot="A">
              <h3>Query A</h3>
              <label>Template<select class="template" aria-label="Query A template"></select></label>
              <label>SQL<textarea class="sql" aria-label="Query A SQL" spellcheck="false"></textarea></label>
            </article>
            <article class="query-card query-b" data-slot="B">
              <h3>Query B</h3>
              <label>Template<select class="template" aria-label="Query B template"></select></label>
              <label>SQL<textarea class="sql" aria-label="Query B SQL" spellcheck="false"></textarea></label>
            </article>
            <article class="query-card query-c hidden" data-slot="C">
              <h3>Query C</h3>
              <label>Template<select class="template" aria-label="Query C template"></select></label>
              <label>SQL<textarea class="sql" aria-label="Query C SQL" spellcheck="false"></textarea></label>
            </article>
          </div>
        </section>

        <section class="panel" aria-label="Horizon configuration">
          <h2>3. Horizons</h2>
          <div class="horizons"></div>
          <div class="run-row">
            <button class="run primary" type="button">Run Backtest</button>
            <span class="status" role="status" aria-live="polite"></span>
          </div>
          <div class="error" role="alert" hidden></div>
        </section>

        <section class="panel beginner-help" aria-label="Beginner guidance">
          <h2>מה בדיוק נבדק?</h2>
          <div class="help">
            <div><strong>Historical decision time</strong><br>זהו T0 — הזמן שבו מדמים את החלטת הקנייה.</div>
            <div><strong>Resolved cycle</strong><br>המערכת בוחרת את ה־cycle המלא האחרון שנשמר בזמן או לפני T0.</div>
            <div><strong>No-lookahead</strong><br>ה־Query רואה רק latest/history עד ה־baseline שנפתר; נתונים מאוחרים אינם זמינים ל־SQL.</div>
            <div><strong>Top X / returned position</strong><br>Top X הם X השורות הראשונות שה־Query החזיר. Position הוא המיקום המוחזר, לא ציון סמנטי אוטומטי.</div>
            <div><strong>Summary מול evidence</strong><br>Summary עוזר להתמצא; הטבלאות המלאות הן הראיה. Backtest לא מכריז אוטומטית איזו אסטרטגיה טובה יותר.</div>
            <div><strong>Pending / Unavailable</strong><br>אין השלמה או 0 מלאכותי: מחיר חסר או observation עתידי חסר נשארים Unavailable עם הסיבה.</div>
          </div>
        </section>

        <section class="panel results" aria-label="Backtest results" hidden></section>
      </div>
    </div>`;

  const elements = {
    source: shadow.querySelector(".source"),
    decisionTime: shadow.querySelector(".decision-time"),
    topX: shadow.querySelector(".top-x"),
    queryA: shadow.querySelector(".query-a"),
    queryB: shadow.querySelector(".query-b"),
    queryC: shadow.querySelector(".query-c"),
    toggleC: shadow.querySelector(".toggle-c"),
    horizons: shadow.querySelector(".horizons"),
    run: shadow.querySelector(".run"),
    status: shadow.querySelector(".status"),
    error: shadow.querySelector(".error"),
    results: shadow.querySelector(".results")
  };

  let mode = "compare";
  let queryCEnabled = false;
  let templates = [];
  let frozenPoint = null;
  let presentationFilter = "all";
  let destroyed = false;

  function queryControls(card) {
    return {
      select: card.querySelector(".template"),
      sql: card.querySelector(".sql")
    };
  }

  const slots = {
    A: queryControls(elements.queryA),
    B: queryControls(elements.queryB),
    C: queryControls(elements.queryC)
  };

  function setError(message = "") {
    elements.error.hidden = !message;
    setText(elements.error, message);
  }

  function setBusy(busy) {
    elements.run.disabled = busy;
    elements.source.disabled = busy;
    elements.decisionTime.disabled = busy;
    elements.topX.disabled = busy;
    elements.toggleC.disabled = busy || mode !== "compare";
    for (const controls of Object.values(slots)) {
      controls.select.disabled = busy;
      controls.sql.disabled = busy;
    }
    for (const input of elements.horizons.querySelectorAll("input")) input.disabled = busy;
    setText(elements.status, busy ? "מריץ Backtest..." : "");
  }

  function selectedTemplate(slot) {
    const controls = slots[slot];
    return templates.find((query) => query.id === controls.select.value) ?? null;
  }

  function updateSqlFromTemplate(slot) {
    const controls = slots[slot];
    const template = selectedTemplate(slot);
    if (template) controls.sql.value = template.sql;
  }

  function fillTemplateSelect(slot, defaultIndex) {
    const controls = slots[slot];
    controls.select.replaceChildren();
    for (const query of templates) {
      const option = documentRef.createElement("option");
      option.value = query.id;
      option.textContent = query.name;
      controls.select.append(option);
    }
    const custom = documentRef.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Custom SQL draft";
    controls.select.append(custom);

    const fallback = templates[Math.min(defaultIndex, Math.max(0, templates.length - 1))];
    controls.select.value = fallback?.id ?? "__custom__";
    controls.sql.value = fallback?.sql ?? "SELECT security_id AS securityId FROM latest ORDER BY security_id LIMIT 10;";
  }

  function renderHorizonControls() {
    elements.horizons.replaceChildren();
    for (const horizon of HORIZONS) {
      const label = documentRef.createElement("label");
      const input = documentRef.createElement("input");
      input.type = "checkbox";
      input.value = String(horizon.ms);
      input.checked = horizon.defaultChecked;
      input.setAttribute("aria-label", `Horizon ${horizon.label}`);
      label.append(input, documentRef.createTextNode(horizon.label));
      elements.horizons.append(label);
    }
  }

  function updateMode(nextMode) {
    mode = nextMode;
    const compare = mode === "compare";
    elements.queryB.classList.toggle("hidden", !compare);
    elements.queryC.classList.toggle("hidden", !compare || !queryCEnabled);
    elements.toggleC.hidden = !compare;
    elements.toggleC.disabled = false;
    frozenPoint = null;
    elements.results.hidden = true;
    elements.results.replaceChildren();
  }

  function visibleSlots() {
    if (mode === "inspect") return ["A"];
    return queryCEnabled ? ["A", "B", "C"] : ["A", "B"];
  }

  function buildRunRequest() {
    if (!elements.source.value) throw new Error("יש לבחור מקור evidence.");
    const requestedAtMs = new Date(elements.decisionTime.value).getTime();
    if (!Number.isSafeInteger(requestedAtMs) || requestedAtMs < 0) {
      throw new Error("יש לבחור זמן החלטה היסטורי תקין.");
    }

    const horizonsMs = [...elements.horizons.querySelectorAll("input:checked")]
      .map((input) => Number(input.value));
    if (horizonsMs.length === 0) throw new Error("יש לבחור לפחות horizon אחד.");

    const queries = visibleSlots().map((slot) => {
      const controls = slots[slot];
      const template = selectedTemplate(slot);
      const sql = controls.sql.value;
      if (sql.trim().length === 0) throw new Error(`Query ${slot} SQL ריק.`);
      return {
        id: queryRunId(slot, template?.id),
        name: template?.name ?? `Custom Query ${slot}`,
        sql
      };
    });

    return {
      sourceId: elements.source.value,
      requestedAtMs,
      queries,
      topX: elements.topX.value === "all" ? null : Number(elements.topX.value),
      horizonsMs
    };
  }

  function renderRunMeta(point, container) {
    const meta = makeElement(documentRef, "div", "meta");
    const values = [
      `T0: ${formatTime(point.requestedAtMs)}`,
      `Resolved cycle: ${point.baseline?.cycleId ?? "—"}`,
      `Committed: ${formatTime(point.baseline?.committedAtMs)}`,
      `Top X: ${point.topX === null ? "All" : point.topX}`,
      `Horizons: ${safeArray(point.horizonsMs).map(horizonLabel).join(", ")}`
    ];
    for (const value of values) meta.append(makeElement(documentRef, "span", "", value));
    container.append(meta);
  }

  function summaryForHorizon(query, horizonMs) {
    return safeArray(query.summary).find((item) => item.horizonMs === horizonMs) ?? null;
  }

  function renderQuerySummary(query, point) {
    const card = makeElement(documentRef, "article", "summary-card");
    card.append(makeElement(documentRef, "h3", "", query.name));
    const counts = [
      ["Source rows", query.sourceRowCount],
      ["Top-X source rows", query.selectedSourceRowCount],
      ["Evaluated unique", query.evaluatedUniqueCount],
      ["Duplicate rows", query.duplicateRowCount]
    ];
    for (const [label, value] of counts) {
      const row = makeElement(documentRef, "div", "metric");
      row.append(makeElement(documentRef, "span", "", label), makeElement(documentRef, "strong", "", String(value)));
      card.append(row);
    }

    const representative = point.horizonsMs.at(-1);
    const summary = summaryForHorizon(query, representative);
    if (summary) {
      for (const [label, value] of [
        [`Average ${horizonLabel(representative)}`, formatPercent(summary.averagePercent)],
        [`Median ${horizonLabel(representative)}`, formatPercent(summary.medianPercent)],
        ["Positive rate", formatRate(summary.positiveRate)],
        ["Available / unavailable", `${summary.availableCount} / ${summary.unavailableCount}`]
      ]) {
        const row = makeElement(documentRef, "div", "metric");
        row.append(makeElement(documentRef, "span", "", label), makeElement(documentRef, "strong", "", String(value)));
        card.append(row);
      }
    }
    return card;
  }

  function renderComparisonSummary(point, container) {
    const comparison = point.comparison;
    const card = makeElement(documentRef, "article", "summary-card");
    card.append(makeElement(documentRef, "h3", "", "Cross-Query orientation"));
    const baseRows = [
      ["Union", comparison.unionCount],
      ["Common to all", comparison.commonCount]
    ];
    for (const [label, value] of baseRows) {
      const row = makeElement(documentRef, "div", "metric");
      row.append(makeElement(documentRef, "span", "", label), makeElement(documentRef, "strong", "", String(value)));
      card.append(row);
    }
    point.queries.forEach((query, index) => {
      const row = makeElement(documentRef, "div", "metric");
      row.append(
        makeElement(documentRef, "span", "", `Only ${query.name}`),
        makeElement(documentRef, "strong", "", String(comparison.exclusiveCounts[index] ?? 0))
      );
      card.append(row);
    });
    for (const pair of safeArray(comparison.pairs)) {
      const names = pair.queryIds.map((id) => point.queries.find((query) => query.id === id)?.name ?? id).join(" ↔ ");
      const row = makeElement(documentRef, "div", "metric");
      row.append(
        makeElement(documentRef, "span", "", `${names} overlap`),
        makeElement(documentRef, "strong", "", `${pair.overlapCount}/${pair.unionCount} (${formatRate(pair.overlapRate)}), position changes ${pair.positionChanges.length}`)
      );
      card.append(row);
    }
    container.append(card);
  }

  function resultSecurityMeta(point) {
    return new Map(safeArray(point.comparison?.securities).map((item) => [item.securityId, item]));
  }

  function visibleSecurityIds(point) {
    if (point.queries.length < 2 || presentationFilter === "all") return null;
    const ids = safeArray(point.comparison?.securities)
      .filter((item) => presentationFilter === "common"
        ? item.common
        : !item.common || item.positionChanged)
      .map((item) => item.securityId);
    return new Set(ids);
  }

  function renderHorizonCell(horizon) {
    const cell = makeElement(documentRef, "td", "horizon-cell");
    if (!finite(horizon.changePercent)) {
      cell.classList.add("unavailable");
      cell.textContent = `Unavailable: ${horizon.unavailableReason ?? "NO_OBSERVATION"}`;
      if (finite(horizon.price)) cell.append(documentRef.createElement("br"), documentRef.createTextNode(`Price ${formatNumber(horizon.price, 4)}`));
      return cell;
    }
    const change = makeElement(documentRef, "div", horizon.changePercent > 0 ? "positive" : horizon.changePercent < 0 ? "negative" : "flat", formatPercent(horizon.changePercent));
    const price = makeElement(documentRef, "div", "muted", `Price ${formatNumber(horizon.price, 4)}`);
    cell.append(change, price);
    return cell;
  }

  function renderEvidenceTable(query, point, securityMeta, visibleIds) {
    const card = makeElement(documentRef, "article", "evidence-card");
    card.append(makeElement(documentRef, "h3", "", query.name));

    const retained = query.items.filter((item) => visibleIds === null || visibleIds.has(item.securityId));
    if (retained.length === 0) {
      card.append(makeElement(documentRef, "div", "empty", query.items.length === 0
        ? "השאילתה החזירה 0 securities בנקודה הזאת."
        : "אין securities התואמים ל־presentation filter הנוכחי."));
    } else {
      const wrap = makeElement(documentRef, "div", "table-wrap");
      const table = documentRef.createElement("table");
      table.setAttribute("aria-label", `Evidence ${query.name}`);
      const thead = documentRef.createElement("thead");
      const headRow = documentRef.createElement("tr");
      for (const label of ["Position", "Security", "Baseline", ...point.horizonsMs.map(horizonLabel)]) {
        headRow.append(makeElement(documentRef, "th", "", label));
      }
      thead.append(headRow);
      const tbody = documentRef.createElement("tbody");

      for (const item of retained) {
        const row = documentRef.createElement("tr");
        const meta = securityMeta.get(item.securityId);
        if (meta?.common) row.classList.add("common");
        if (meta?.exclusive) row.classList.add("exclusive");
        if (meta?.positionChanged) row.classList.add("position-changed");
        row.dataset.securityId = item.securityId;

        row.append(makeElement(documentRef, "td", "", String(item.returnedPosition)));
        const identity = makeElement(documentRef, "td", "identity");
        identity.append(
          makeElement(documentRef, "strong", "", item.baseline.symbol || item.baseline.paperName || item.securityId),
          makeElement(documentRef, "span", "", item.securityId)
        );
        if (item.baseline.paperName && item.baseline.paperName !== item.baseline.symbol) {
          identity.append(documentRef.createElement("br"), makeElement(documentRef, "span", "muted", item.baseline.paperName));
        }
        row.append(identity);

        const baseline = makeElement(documentRef, "td", "");
        baseline.append(
          makeElement(documentRef, "div", "", `Price ${formatNumber(item.baseline.price, 4)}`),
          makeElement(documentRef, "div", "muted", formatTime(item.baseline.collectedAtMs))
        );
        row.append(baseline);
        for (const horizon of item.horizons) row.append(renderHorizonCell(horizon));
        tbody.append(row);
      }
      table.append(thead, tbody);
      wrap.append(table);
      card.append(wrap);
    }

    const details = documentRef.createElement("details");
    const summary = documentRef.createElement("summary");
    summary.textContent = "SQL / provenance";
    details.append(summary);
    const provenance = makeElement(documentRef, "div", "muted", `Query id: ${query.id} | T0: ${formatTime(point.requestedAtMs)} | Baseline cycle: ${point.baseline.cycleId} | Source: ${point.sourceId}`);
    const pre = documentRef.createElement("pre");
    pre.textContent = query.sql;
    details.append(provenance, pre);
    card.append(details);
    return card;
  }

  function renderFrozenPoint() {
    const point = frozenPoint;
    elements.results.replaceChildren();
    elements.results.hidden = false;
    if (!point) return;

    elements.results.append(makeElement(documentRef, "h2", "", point.queries.length === 1 ? "Inspect result" : "Compare result"));
    renderRunMeta(point, elements.results);

    if (!point.available) {
      elements.results.append(makeElement(documentRef, "div", "empty", `אין baseline מלא בזמן או לפני T0. ${point.unavailableReason ?? "NO_BASELINE"}`));
      return;
    }

    const summaries = makeElement(documentRef, "div", "summary-grid");
    for (const query of point.queries) summaries.append(renderQuerySummary(query, point));
    if (point.queries.length > 1) renderComparisonSummary(point, summaries);
    elements.results.append(summaries);

    if (point.queries.length > 1) {
      const filters = makeElement(documentRef, "div", "filters");
      filters.append(makeElement(documentRef, "strong", "", "Side-by-Side filter:"));
      for (const [value, label] of [["all", "All"], ["common", "Common"], ["differences", "Differences"]]) {
        const wrapper = documentRef.createElement("label");
        const input = documentRef.createElement("input");
        input.type = "radio";
        input.name = "comparison-filter";
        input.value = value;
        input.checked = presentationFilter === value;
        input.addEventListener("change", () => {
          if (!input.checked) return;
          presentationFilter = value;
          renderFrozenPoint();
        });
        wrapper.append(input, documentRef.createTextNode(label));
        filters.append(wrapper);
      }
      elements.results.append(filters);
    }

    const securityMeta = resultSecurityMeta(point);
    const visibleIds = visibleSecurityIds(point);
    const side = makeElement(documentRef, "div", "side-by-side");
    for (const query of point.queries) side.append(renderEvidenceTable(query, point, securityMeta, visibleIds));
    elements.results.append(side);
  }

  async function runPoint() {
    setError("");
    let request;
    try {
      request = buildRunRequest();
    } catch (error) {
      setError(error.message);
      return;
    }

    setBusy(true);
    frozenPoint = null;
    elements.results.hidden = true;
    elements.results.replaceChildren();
    try {
      const point = await client.runPoint(request);
      if (destroyed) return;
      frozenPoint = point;
      presentationFilter = "all";
      renderFrozenPoint();
      setText(elements.status, "Backtest הושלם.");
    } catch (error) {
      if (destroyed) return;
      const code = typeof error?.code === "string" ? error.code : "BACKTEST_CLIENT_ERROR";
      const message = typeof error?.message === "string" ? error.message : "Backtest failed.";
      setError(unsupportedError(code)
        ? `השאילתה אינה נתמכת ב־Backtest: ${message} [${code}]`
        : `הרצת Backtest נכשלה: ${message} [${code}]`);
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  async function initialize() {
    setBusy(true);
    setText(elements.status, "טוען מקורות ו־Query templates...");
    try {
      const [sourceResult, queryResult] = await Promise.all([
        client.listSources(),
        client.listQueries()
      ]);
      if (destroyed) return;

      const sources = safeArray(sourceResult?.sources);
      templates = safeArray(queryResult?.queries).map((query) => ({
        id: String(query.id),
        name: String(query.name),
        sql: String(query.sql)
      }));

      elements.source.replaceChildren();
      for (const source of sources) {
        const option = documentRef.createElement("option");
        option.value = source.sourceId;
        option.textContent = `${source.fileName} (${source.kind})`;
        elements.source.append(option);
      }
      if (sources.length === 0) {
        const option = documentRef.createElement("option");
        option.value = "";
        option.textContent = "אין מקור Backtest זמין";
        elements.source.append(option);
      }

      fillTemplateSelect("A", templates.length > 1 ? 1 : 0);
      fillTemplateSelect("B", templates.length > 2 ? 2 : templates.length > 1 ? 1 : 0);
      fillTemplateSelect("C", 0);
      setText(elements.status, sources.length === 0 ? "אין evidence source זמין." : "מוכן.");
    } catch (error) {
      if (destroyed) return;
      setError(`טעינת Backtest Lab נכשלה: ${error?.message ?? "unknown error"}`);
      setText(elements.status, "טעינה נכשלה.");
    } finally {
      if (!destroyed) setBusy(false);
    }
  }

  renderHorizonControls();
  for (const [slot, controls] of Object.entries(slots)) {
    controls.select.addEventListener("change", () => updateSqlFromTemplate(slot));
  }
  shadow.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) updateMode(input.value);
    });
  });
  elements.toggleC.addEventListener("click", () => {
    queryCEnabled = !queryCEnabled;
    elements.queryC.classList.toggle("hidden", !queryCEnabled || mode !== "compare");
    elements.toggleC.textContent = queryCEnabled ? "הסר Query C" : "הוסף Query C";
  });
  elements.run.addEventListener("click", () => void runPoint());

  documentRef.body.append(host);
  const ready = initialize();

  return Object.freeze({
    host,
    ready,
    show() { host.style.display = ""; },
    hide() { host.style.display = "none"; },
    destroy() {
      destroyed = true;
      host.remove();
    },
    getFrozenPoint() { return frozenPoint; }
  });
}
