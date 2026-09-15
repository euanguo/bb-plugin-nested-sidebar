import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { describe, it } from "node:test";
import {
  VIEW_PREFERENCE_MIGRATION,
  createViewPreferenceStore,
} from "../lib/view-preference-store.ts";

function createStore() {
  const db = new Database(":memory:");
  db.exec(VIEW_PREFERENCE_MIGRATION);
  return { db, store: createViewPreferenceStore(db) };
}

describe("view preference store", () => {
  it("defaults to the manual order", () => {
    const { db, store } = createStore();
    try {
      assert.deepEqual(store.get(), {
        projectSort: "manual",
        threadSort: "manual",
      });
    } finally {
      db.close();
    }
  });

  it("writes each key independently and returns the whole record", () => {
    const { db, store } = createStore();
    try {
      assert.deepEqual(store.set({ projectSort: "status" }), {
        projectSort: "status",
        threadSort: "manual",
      });
      assert.deepEqual(store.set({ threadSort: "updated-desc" }), {
        projectSort: "status",
        threadSort: "updated-desc",
      });
      assert.deepEqual(store.get(), {
        projectSort: "status",
        threadSort: "updated-desc",
      });
    } finally {
      db.close();
    }
  });

  it("ignores a value this build does not know", () => {
    const { db, store } = createStore();
    try {
      db.prepare(
        `INSERT INTO view_preferences (key, value, updated_at) VALUES (?, ?, ?)`,
      ).run("projectSort", "nonsense", 0);
      assert.equal(store.get().projectSort, "manual");
    } finally {
      db.close();
    }
  });
});
