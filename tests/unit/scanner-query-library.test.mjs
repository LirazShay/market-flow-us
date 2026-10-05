import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILTIN_SCANNER_QUERIES,
  mergeScannerQueryLibrary
} from "../../shared/scanner/builtins.js";
import { createScannerQueryLibraryController } from "../../browser/viewer/scanner-query-library.js";
import { createScannerScheduler } from "../../browser/viewer/scanner-scheduler.js";

function userQuery({
  queryId,
  name,
  sql = "SELECT 1",
  intervalMs = 5000,
  createdAtMs = 1,
  updatedAtMs = 1
}) {
  return {
    queryId,
    source: "user",
    name,
    sql,
    intervalMs,
    editable: true,
    deletable: true,
    createdAtMs,
    updatedAtMs
  };
}

test("built-ins merge first in frozen order and user queries sort by normalized name then queryId", () => {
  const merged = mergeScannerQueryLibrary([
    userQuery({ queryId: "user:2", name: " beta " }),
    userQuery({ queryId: "user:3", name: "Alpha" }),
    userQuery({ queryId: "user:1", name: "ＡＬＰＨＡ" })
  ]);

  assert.deepEqual(
    merged.map((query) => [query.queryId, query.source, query.editable, query.deletable]),
    [
      ["builtin:all-current-fields", "builtin", false, false],
      ["builtin:market-ranking-example", "builtin", false, false],
      ["builtin:staged-candidate-ranking", "builtin", false, false],
      ["user:1", "user", true, true],
      ["user:3", "user", true, true],
      ["user:2", "user", true, true]
    ]
  );
});

test("query-library controller keeps selected, draft and persisted state explicit across copy/save/rename/delete", async () => {
  let users = [
    userQuery({ queryId: "user:alpha", name: "Alpha", sql: "SELECT alpha", intervalMs: 6000 })
  ];
  const calls = [];

  const client = {
    async listScannerQueries() {
      return { queries: mergeScannerQueryLibrary(users) };
    },
    async createScannerQuery(draft) {
      calls.push(["create", structuredClone(draft)]);
      const created = userQuery({
        queryId: "user:copy",
        name: draft.name,
        sql: draft.sql,
        intervalMs: draft.intervalMs,
        createdAtMs: 10,
        updatedAtMs: 10
      });
      users = [...users, created];
      return { query: created };
    },
    async updateScannerQuery(draft) {
      calls.push(["update", structuredClone(draft)]);
      const index = users.findIndex((query) => query.queryId === draft.queryId);
      assert.notEqual(index, -1);
      const updated = {
        ...users[index],
        name: draft.name,
        sql: draft.sql,
        intervalMs: draft.intervalMs,
        updatedAtMs: users[index].updatedAtMs + 1
      };
      users = users.map((query, i) => i === index ? updated : query);
      return { query: updated };
    },
    async deleteScannerQuery(queryId) {
      calls.push(["delete", queryId]);
      users = users.filter((query) => query.queryId !== queryId);
      return { queryId };
    }
  };

  const controller = createScannerQueryLibraryController({ client });
  await controller.load();

  assert.equal(controller.getState().selectedQueryId, null);
  assert.equal(controller.getState().queries.length, 4);

  controller.select("builtin:all-current-fields");
  let state = controller.getState();
  assert.equal(state.persisted.source, "builtin");
  assert.equal(state.draft.sql, BUILTIN_SCANNER_QUERIES[0].sql);
  assert.equal(state.canSave, false);
  assert.equal(state.canRename, false);
  assert.equal(state.canDelete, false);
  assert.equal(state.canSaveAs, true);

  controller.setDraft({
    name: "All current fields copy",
    sql: "SELECT * FROM latest LIMIT 10",
    intervalMs: 7000
  });
  await controller.saveAs();

  state = controller.getState();
  assert.equal(state.selectedQueryId, "user:copy");
  assert.equal(state.persisted.name, "All current fields copy");
  assert.equal(state.canSave, true);
  assert.deepEqual(calls.at(-1), ["create", {
    name: "All current fields copy",
    sql: "SELECT * FROM latest LIMIT 10",
    intervalMs: 7000
  }]);

  controller.setDraft({ sql: "SELECT saved", intervalMs: 8000 });
  await controller.save();
  assert.equal(controller.getState().persisted.sql, "SELECT saved");

  controller.setDraft({
    name: "Renamed copy",
    sql: "SELECT unsaved draft",
    intervalMs: 9000
  });
  await controller.rename();

  state = controller.getState();
  assert.equal(state.persisted.name, "Renamed copy");
  assert.equal(state.persisted.sql, "SELECT saved");
  assert.equal(state.persisted.intervalMs, 8000);
  assert.equal(state.draft.name, "Renamed copy");
  assert.equal(state.draft.sql, "SELECT unsaved draft");
  assert.equal(state.draft.intervalMs, 9000);
  assert.deepEqual(calls.at(-1), ["update", {
    queryId: "user:copy",
    name: "Renamed copy",
    sql: "SELECT saved",
    intervalMs: 8000
  }]);

  await controller.deleteSelected();
  state = controller.getState();
  assert.equal(state.selectedQueryId, null);
  assert.equal(state.persisted, null);
  assert.deepEqual(state.draft, {
    name: "",
    sql: "",
    intervalMs: 5000
  });
  assert.equal(state.queries.some((query) => query.queryId === "user:copy"), false);
});

test("library operations never mutate an already-active Scanner generation", async () => {
  const scheduler = createScannerScheduler({
    execute: async () => ({
      columns: [],
      rows: [],
      rowCount: 0,
      startedAtMs: 1,
      completedAtMs: 1,
      durationMs: 0
    })
  });
  scheduler.setDraft({ sql: "SELECT active", intervalMs: 60000 });
  scheduler.activate();

  const initialActive = scheduler.getState();

  let users = [userQuery({ queryId: "user:alpha", name: "Alpha" })];
  const client = {
    async listScannerQueries() {
      return { queries: mergeScannerQueryLibrary(users) };
    },
    async createScannerQuery(draft) {
      const query = userQuery({ queryId: "user:new", ...draft });
      users = [...users, query];
      return { query };
    },
    async updateScannerQuery(draft) {
      const query = {
        ...users.find((item) => item.queryId === draft.queryId),
        ...draft
      };
      users = users.map((item) => item.queryId === draft.queryId ? query : item);
      return { query };
    },
    async deleteScannerQuery(queryId) {
      users = users.filter((item) => item.queryId !== queryId);
      return { queryId };
    }
  };

  const controller = createScannerQueryLibraryController({ client });
  await controller.load();
  controller.select("user:alpha");
  controller.setDraft({ name: "Alpha 2", sql: "SELECT draft", intervalMs: 7000 });
  await controller.save();
  await controller.deleteSelected();
  controller.select("builtin:market-ranking-example");

  const afterLibraryChanges = scheduler.getState();
  assert.equal(afterLibraryChanges.generation, initialActive.generation);
  assert.equal(afterLibraryChanges.activeSql, "SELECT active");
  assert.equal(afterLibraryChanges.activeIntervalMs, 60000);

  scheduler.stop();
});
