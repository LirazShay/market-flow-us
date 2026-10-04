const DEFAULT_DRAFT = Object.freeze({
  name: "",
  sql: "",
  intervalMs: 5000
});

function assertClient(client) {
  for (const method of [
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

function copyDraft(draft) {
  return {
    name: draft.name,
    sql: draft.sql,
    intervalMs: draft.intervalMs
  };
}

function validateQuery(query) {
  if (
    !query
    || typeof query.queryId !== "string"
    || (query.source !== "builtin" && query.source !== "user")
    || typeof query.name !== "string"
    || typeof query.sql !== "string"
    || !Number.isSafeInteger(query.intervalMs)
    || query.intervalMs < 1
    || typeof query.editable !== "boolean"
    || typeof query.deletable !== "boolean"
  ) {
    throw new Error("Scanner query-library record is invalid.");
  }
  return query;
}

function validateListResponse(response) {
  if (!response || !Array.isArray(response.queries)) {
    throw new Error("Scanner query-library response is invalid.");
  }
  return response.queries.map(validateQuery);
}

export function createScannerQueryLibraryController({ client } = {}) {
  assertClient(client);

  let queries = [];
  let selectedQueryId = null;
  let persisted = null;
  let draft = { ...DEFAULT_DRAFT };

  function selectedRecord() {
    return selectedQueryId === null
      ? null
      : queries.find((query) => query.queryId === selectedQueryId) ?? null;
  }

  function state() {
    const selected = selectedRecord();
    return Object.freeze({
      queries: Object.freeze([...queries]),
      selectedQueryId,
      persisted,
      draft: Object.freeze({ ...draft }),
      canSave: selected?.source === "user" && selected.editable === true,
      canRename: selected?.source === "user" && selected.editable === true,
      canDelete: selected?.source === "user" && selected.deletable === true,
      canSaveAs: true
    });
  }

  function replaceQuery(record) {
    const next = validateQuery(record);
    const index = queries.findIndex((query) => query.queryId === next.queryId);
    if (index === -1) {
      queries = [...queries, next];
      return;
    }
    queries = queries.map((query, i) => i === index ? next : query);
  }

  async function load() {
    const response = await client.listScannerQueries();
    queries = validateListResponse(response);

    if (selectedQueryId !== null) {
      const next = selectedRecord();
      if (!next) {
        selectedQueryId = null;
        persisted = null;
        draft = { ...DEFAULT_DRAFT };
      } else {
        persisted = next;
      }
    }

    return state();
  }

  function select(queryId) {
    if (typeof queryId !== "string" || queryId.length === 0) {
      throw new TypeError("queryId must be a non-empty string.");
    }
    const query = queries.find((item) => item.queryId === queryId);
    if (!query) {
      throw new Error("Selected Scanner query was not found.");
    }

    selectedQueryId = query.queryId;
    persisted = query;
    draft = {
      name: query.name,
      sql: query.sql,
      intervalMs: query.intervalMs
    };
    return state();
  }

  function newDraft() {
    selectedQueryId = null;
    persisted = null;
    draft = { ...DEFAULT_DRAFT };
    return state();
  }

  function setDraft(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new TypeError("draft patch must be an object.");
    }

    const next = { ...draft, ...patch };
    if (typeof next.name !== "string" || typeof next.sql !== "string") {
      throw new TypeError("Scanner draft name/sql must be strings.");
    }
    if (!Number.isSafeInteger(next.intervalMs) || next.intervalMs < 1) {
      throw new RangeError("Scanner draft interval must be a positive integer.");
    }

    draft = next;
    return state();
  }

  async function saveAs() {
    const response = await client.createScannerQuery(copyDraft(draft));
    const created = validateQuery(response?.query);
    replaceQuery(created);
    selectedQueryId = created.queryId;
    persisted = created;
    draft = copyDraft(created);
    await load();
    return state();
  }

  async function save() {
    const selected = selectedRecord();
    if (!selected || selected.source !== "user" || selected.editable !== true) {
      throw new Error("Selected Scanner query is read-only.");
    }

    const response = await client.updateScannerQuery({
      queryId: selected.queryId,
      ...copyDraft(draft)
    });
    const updated = validateQuery(response?.query);
    replaceQuery(updated);
    selectedQueryId = updated.queryId;
    persisted = updated;
    draft = copyDraft(updated);
    await load();
    return state();
  }

  async function rename() {
    const selected = selectedRecord();
    if (!selected || selected.source !== "user" || selected.editable !== true) {
      throw new Error("Selected Scanner query is read-only.");
    }

    const unsavedDraft = { ...draft };
    const response = await client.updateScannerQuery({
      queryId: selected.queryId,
      name: draft.name,
      sql: selected.sql,
      intervalMs: selected.intervalMs
    });
    const updated = validateQuery(response?.query);
    replaceQuery(updated);
    selectedQueryId = updated.queryId;
    persisted = updated;
    draft = {
      ...unsavedDraft,
      name: updated.name
    };
    await load();
    return state();
  }

  async function deleteSelected() {
    const selected = selectedRecord();
    if (!selected || selected.source !== "user" || selected.deletable !== true) {
      throw new Error("Selected Scanner query is read-only.");
    }

    await client.deleteScannerQuery(selected.queryId);
    queries = queries.filter((query) => query.queryId !== selected.queryId);
    selectedQueryId = null;
    persisted = null;
    draft = { ...DEFAULT_DRAFT };
    await load();
    return state();
  }

  return Object.freeze({
    load,
    select,
    newDraft,
    setDraft,
    saveAs,
    save,
    rename,
    deleteSelected,
    getState: state
  });
}
