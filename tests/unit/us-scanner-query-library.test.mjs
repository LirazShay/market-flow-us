import assert from "node:assert/strict";
import test from "node:test";

import { createScannerQueryLibraryController } from "../../browser/viewer/scanner-query-library.js";
import { createScannerScheduler } from "../../browser/viewer/scanner-scheduler.js";
import { MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES } from "../../shared/scanner/builtins.js";

function userQuery({
  queryId,
  name,
  sql,
  intervalMs,
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

function sortedLibrary(users) {
  return [
    ...MARKET_FLOW_US_BUILTIN_SCANNER_QUERIES,
    ...[...users].sort((left, right) => left.name.localeCompare(right.name))
  ];
}

test("U.S. built-in load/copy and user CRUD never mutate an already-active Scanner generation", async () => {
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
  scheduler.setDraft({ sql: "SELECT active_generation", intervalMs: 60000 });
  scheduler.activate();
  const active = scheduler.getState();

  let users = [userQuery({
    queryId: "user:alpha",
    name: "Alpha",
    sql: "SELECT 1",
    intervalMs: 5000
  })];
  let nextId = 1;

  const client = {
    async listScannerQueries() {
      return { queries: sortedLibrary(users) };
    },
    async createScannerQuery(draft) {
      const created = userQuery({
        queryId: `user:copy-${nextId++}`,
        ...draft,
        createdAtMs: 10,
        updatedAtMs: 10
      });
      users = [...users, created];
      return { query: created };
    },
    async updateScannerQuery(draft) {
      const existing = users.find((query) => query.queryId === draft.queryId);
      assert.ok(existing);
      const updated = {
        ...existing,
        ...draft,
        updatedAtMs: existing.updatedAtMs + 1
      };
      users = users.map((query) => query.queryId === updated.queryId ? updated : query);
      return { query: updated };
    },
    async deleteScannerQuery(queryId) {
      users = users.filter((query) => query.queryId !== queryId);
      return { queryId };
    }
  };

  const controller = createScannerQueryLibraryController({ client });
  await controller.load();

  assert.deepEqual(
    controller.getState().queries.slice(0, 3).map((query) => query.queryId),
    [
      "builtin:all-current-fields",
      "builtin:market-ranking-example",
      "builtin:staged-candidate-ranking"
    ]
  );

  controller.select("builtin:staged-candidate-ranking");
  let state = controller.getState();
  assert.equal(state.persisted.source, "builtin");
  assert.equal(state.canSave, false);
  assert.equal(state.canRename, false);
  assert.equal(state.canDelete, false);
  assert.equal(state.canSaveAs, true);
  assert.match(state.draft.sql, /stage_reached/);

  controller.setDraft({
    name: "My staged copy",
    sql: `${state.draft.sql}\n-- user draft`,
    intervalMs: 7000
  });
  await controller.saveAs();
  state = controller.getState();
  assert.equal(state.persisted.source, "user");
  assert.equal(state.persisted.name, "My staged copy");

  controller.setDraft({ sql: "SELECT security_id AS securityId FROM latest LIMIT 5" });
  await controller.save();
  assert.equal(
    controller.getState().persisted.sql,
    "SELECT security_id AS securityId FROM latest LIMIT 5"
  );

  controller.setDraft({ name: "Renamed staged copy" });
  await controller.rename();
  assert.equal(controller.getState().persisted.name, "Renamed staged copy");

  await controller.deleteSelected();
  assert.equal(
    controller.getState().queries.some((query) => query.name === "Renamed staged copy"),
    false
  );

  const afterCrud = scheduler.getState();
  assert.equal(afterCrud.generation, active.generation);
  assert.equal(afterCrud.activeSql, "SELECT active_generation");
  assert.equal(afterCrud.activeIntervalMs, 60000);

  scheduler.stop();
});
